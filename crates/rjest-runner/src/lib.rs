//! Bounded process-isolated JavaScript test execution.

use std::{
    collections::BTreeMap,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::Duration,
    time::Instant,
};

use rayon::prelude::*;
use rjest_core::{
    AggregatedResult, CoverageMap, ModuleNameMapper, SnapshotRequest, SnapshotResult,
    SnapshotUpdate, TestFile, TestFileResult, WORKER_PROTOCOL_VERSION, WorkerRequest,
};
use thiserror::Error;

const RESULT_PREFIX: &str = "__RJEST_RESULT__";
const WORKER_SOURCE: &str = include_str!("../runtime/worker.mjs");

#[derive(Clone, Debug)]
pub struct RunnerOptions {
    pub node_binary: PathBuf,
    pub max_workers: usize,
    pub test_name_pattern: Option<String>,
    pub default_timeout_ms: u64,
    pub snapshot_update: SnapshotUpdate,
    pub root_dir: PathBuf,
    pub module_file_extensions: Vec<String>,
    pub extensions_to_treat_as_esm: Vec<String>,
    pub module_name_mapper: Vec<ModuleNameMapper>,
    pub module_paths: Vec<PathBuf>,
    pub automock: bool,
    pub clear_mocks: bool,
    pub test_environment: String,
    pub test_environment_options: serde_json::Value,
    pub setup_files: Vec<PathBuf>,
    pub setup_files_after_env: Vec<PathBuf>,
    pub snapshot_serializers: Vec<String>,
    pub transform: BTreeMap<String, serde_json::Value>,
    pub transform_ignore_patterns: Vec<String>,
    pub collect_coverage: bool,
    pub coverage_path_ignore_patterns: Vec<String>,
    pub coverage_filter: Option<Vec<PathBuf>>,
    pub file_timeout_ms: u64,
}

impl Default for RunnerOptions {
    fn default() -> Self {
        let parallelism = std::thread::available_parallelism().map_or(1, usize::from);
        Self {
            node_binary: PathBuf::from("node"),
            max_workers: parallelism.div_ceil(2).max(1),
            test_name_pattern: None,
            default_timeout_ms: 5_000,
            snapshot_update: SnapshotUpdate::New,
            root_dir: PathBuf::new(),
            module_file_extensions: vec!["js".into(), "json".into(), "node".into()],
            extensions_to_treat_as_esm: Vec::new(),
            module_name_mapper: Vec::new(),
            module_paths: Vec::new(),
            automock: false,
            clear_mocks: false,
            test_environment: "node".into(),
            test_environment_options: serde_json::json!({}),
            setup_files: Vec::new(),
            setup_files_after_env: Vec::new(),
            snapshot_serializers: Vec::new(),
            transform: BTreeMap::new(),
            transform_ignore_patterns: vec!["/node_modules/".into()],
            collect_coverage: false,
            coverage_path_ignore_patterns: vec!["/node_modules/".into()],
            coverage_filter: None,
            file_timeout_ms: 120_000,
        }
    }
}

#[derive(Debug, Error)]
pub enum RunnerError {
    #[error("max workers must be at least one")]
    ZeroWorkers,
    #[error("cannot create execution pool: {0}")]
    Pool(#[from] rayon::ThreadPoolBuildError),
    #[error("cannot start Node worker `{binary}`: {source}")]
    Spawn {
        binary: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("cannot write request to Node worker: {0}")]
    Write(#[source] std::io::Error),
    #[error("cannot materialize the embedded Node worker source: {0}")]
    WorkerSource(#[source] std::io::Error),
    #[error("cannot wait for Node worker: {0}")]
    Wait(#[source] std::io::Error),
    #[error("cannot encode worker request: {0}")]
    Encode(#[from] serde_json::Error),
    #[error(transparent)]
    Snapshot(#[from] rjest_snapshot::SnapshotError),
    #[error("worker did not return a protocol result for `{path}`{details}")]
    MissingResult { path: PathBuf, details: String },
    #[error("worker returned invalid JSON for `{path}`: {source}")]
    InvalidResult {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
    #[error("worker protocol mismatch for `{path}`: expected {expected}, received {received}")]
    ProtocolMismatch {
        path: PathBuf,
        expected: u32,
        received: u32,
    },
    #[error("worker returned a result for `{received}` while running `{expected}`")]
    PathMismatch {
        expected: PathBuf,
        received: PathBuf,
    },
    #[error("cannot merge coverage for `{path}`: {message}")]
    InvalidCoverage { path: String, message: String },
}

/// Runs test files through a bounded Rayon pool and returns path-sorted results.
///
/// # Errors
///
/// Returns [`RunnerError`] when the pool cannot be created, Node cannot be
/// invoked, IPC fails, or a worker sends an invalid protocol message.
pub fn run(files: &[TestFile], options: &RunnerOptions) -> Result<AggregatedResult, RunnerError> {
    if options.max_workers == 0 {
        return Err(RunnerError::ZeroWorkers);
    }
    let mut worker_source = tempfile::Builder::new()
        .prefix("rjest-worker-")
        .suffix(".mjs")
        .tempfile()
        .map_err(RunnerError::WorkerSource)?;
    worker_source
        .write_all(WORKER_SOURCE.as_bytes())
        .and_then(|()| worker_source.flush())
        .map_err(RunnerError::WorkerSource)?;
    let worker_path = worker_source.path();
    let started = Instant::now();
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(options.max_workers)
        .build()?;
    let results = pool.install(|| {
        files
            .par_iter()
            .enumerate()
            .map(|(index, file)| run_file(&file.path, options, worker_path, index == 0))
            .collect::<Result<Vec<_>, _>>()
    })?;
    let mut test_results = results;
    test_results.sort_by(|left, right| left.test_path.cmp(&right.test_path));
    let coverage_map = merge_coverage_maps(&test_results)?;
    Ok(AggregatedResult {
        test_results,
        duration_ms: millis(started.elapsed()),
        coverage_map,
    })
}

fn merge_coverage_maps(results: &[TestFileResult]) -> Result<CoverageMap, RunnerError> {
    let mut merged = CoverageMap::new();
    for result in results {
        for (path, incoming) in &result.coverage {
            let Some(existing) = merged.get_mut(path) else {
                merged.insert(path.clone(), incoming.clone());
                continue;
            };
            merge_file_coverage(path, existing, incoming)?;
        }
    }
    Ok(merged)
}

fn merge_file_coverage(
    path: &str,
    existing: &mut serde_json::Value,
    incoming: &serde_json::Value,
) -> Result<(), RunnerError> {
    for map_name in ["statementMap", "fnMap", "branchMap"] {
        if existing.get(map_name) != incoming.get(map_name) {
            return Err(RunnerError::InvalidCoverage {
                path: path.into(),
                message: format!("instrumentation map `{map_name}` differs between workers"),
            });
        }
    }
    for counter_name in ["s", "f"] {
        merge_scalar_counters(path, counter_name, existing, incoming)?;
    }
    merge_branch_counters(path, existing, incoming)
}

fn merge_scalar_counters(
    path: &str,
    counter_name: &str,
    existing: &mut serde_json::Value,
    incoming: &serde_json::Value,
) -> Result<(), RunnerError> {
    let incoming_counters = incoming
        .get(counter_name)
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| invalid_coverage(path, format!("missing `{counter_name}` counters")))?;
    let existing_counters = existing
        .get_mut(counter_name)
        .and_then(serde_json::Value::as_object_mut)
        .ok_or_else(|| invalid_coverage(path, format!("missing `{counter_name}` counters")))?;
    if existing_counters.len() != incoming_counters.len() {
        return Err(invalid_coverage(
            path,
            format!("`{counter_name}` counter lengths differ between workers"),
        ));
    }
    for (key, incoming_count) in incoming_counters {
        let incoming_count = coverage_count(path, incoming_count)?;
        let existing_count = existing_counters
            .get_mut(key)
            .ok_or_else(|| invalid_coverage(path, format!("missing `{counter_name}.{key}`")))?;
        let combined = coverage_count(path, existing_count)?.saturating_add(incoming_count);
        *existing_count = serde_json::Value::from(combined);
    }
    Ok(())
}

fn merge_branch_counters(
    path: &str,
    existing: &mut serde_json::Value,
    incoming: &serde_json::Value,
) -> Result<(), RunnerError> {
    let incoming_counters = incoming
        .get("b")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| invalid_coverage(path, "missing `b` counters"))?;
    let existing_counters = existing
        .get_mut("b")
        .and_then(serde_json::Value::as_object_mut)
        .ok_or_else(|| invalid_coverage(path, "missing `b` counters"))?;
    if existing_counters.len() != incoming_counters.len() {
        return Err(invalid_coverage(
            path,
            "`b` counter lengths differ between workers",
        ));
    }
    for (key, incoming_counts) in incoming_counters {
        let incoming_counts = incoming_counts
            .as_array()
            .ok_or_else(|| invalid_coverage(path, format!("`b.{key}` is not an array")))?;
        let existing_counts = existing_counters
            .get_mut(key)
            .and_then(serde_json::Value::as_array_mut)
            .ok_or_else(|| invalid_coverage(path, format!("missing `b.{key}`")))?;
        if existing_counts.len() != incoming_counts.len() {
            return Err(invalid_coverage(
                path,
                format!("`b.{key}` counter lengths differ between workers"),
            ));
        }
        for (existing_count, incoming_count) in existing_counts.iter_mut().zip(incoming_counts) {
            let combined = coverage_count(path, existing_count)?
                .saturating_add(coverage_count(path, incoming_count)?);
            *existing_count = serde_json::Value::from(combined);
        }
    }
    Ok(())
}

fn coverage_count(path: &str, value: &serde_json::Value) -> Result<u64, RunnerError> {
    value
        .as_u64()
        .ok_or_else(|| invalid_coverage(path, "coverage counter is not an unsigned integer"))
}

fn invalid_coverage(path: &str, message: impl Into<String>) -> RunnerError {
    RunnerError::InvalidCoverage {
        path: path.into(),
        message: message.into(),
    }
}

fn run_file(
    path: &Path,
    options: &RunnerOptions,
    worker_path: &Path,
    collect_uncovered_sources: bool,
) -> Result<TestFileResult, RunnerError> {
    let snapshot = rjest_snapshot::load(path, options.snapshot_update)?;
    let request = WorkerRequest {
        protocol_version: WORKER_PROTOCOL_VERSION,
        test_path: path.to_path_buf(),
        root_dir: options.root_dir.clone(),
        module_file_extensions: options.module_file_extensions.clone(),
        extensions_to_treat_as_esm: options.extensions_to_treat_as_esm.clone(),
        module_name_mapper: options.module_name_mapper.clone(),
        automock: options.automock,
        clear_mocks: options.clear_mocks,
        test_environment: options.test_environment.clone(),
        test_environment_options: options.test_environment_options.clone(),
        setup_files: options.setup_files.clone(),
        setup_files_after_env: options.setup_files_after_env.clone(),
        snapshot_serializers: options.snapshot_serializers.clone(),
        transform: options.transform.clone(),
        transform_ignore_patterns: options.transform_ignore_patterns.clone(),
        collect_coverage: options.collect_coverage,
        coverage_path_ignore_patterns: options.coverage_path_ignore_patterns.clone(),
        coverage_filter: options.coverage_filter.clone(),
        coverage_sources: if collect_uncovered_sources {
            options.coverage_filter.clone().unwrap_or_default()
        } else {
            Vec::new()
        },
        test_name_pattern: options.test_name_pattern.clone(),
        default_timeout_ms: options.default_timeout_ms,
        snapshot: SnapshotRequest {
            snapshot_update: options.snapshot_update,
            snapshot_file_exists: snapshot.exists,
            snapshot_dirty: snapshot.dirty,
            snapshot_data: snapshot.data,
        },
    };
    let encoded = serde_json::to_vec(&request)?;
    let (stdout, stderr, timed_out) = execute_worker(&encoded, options, worker_path)?;
    if timed_out {
        return Ok(TestFileResult {
            protocol_version: WORKER_PROTOCOL_VERSION,
            test_path: path.to_path_buf(),
            tests: Vec::new(),
            errors: vec![format!(
                "Exceeded Rjest's {} ms wall-clock limit for this test file",
                options.file_timeout_ms
            )],
            console: Vec::new(),
            duration_ms: options.file_timeout_ms,
            heap_used_bytes: None,
            snapshot: SnapshotResult::default(),
            coverage: CoverageMap::new(),
        });
    }
    let stdout = String::from_utf8_lossy(&stdout);
    let payload = stdout
        .rfind(RESULT_PREFIX)
        .and_then(|index| stdout[index + RESULT_PREFIX.len()..].lines().next())
        .ok_or_else(|| RunnerError::MissingResult {
            path: path.to_path_buf(),
            details: worker_details(&stdout, &String::from_utf8_lossy(&stderr)),
        })?;
    let result: TestFileResult =
        serde_json::from_str(payload).map_err(|source| RunnerError::InvalidResult {
            path: path.to_path_buf(),
            source,
        })?;
    if result.protocol_version != WORKER_PROTOCOL_VERSION {
        return Err(RunnerError::ProtocolMismatch {
            path: path.to_path_buf(),
            expected: WORKER_PROTOCOL_VERSION,
            received: result.protocol_version,
        });
    }
    if result.test_path != path {
        return Err(RunnerError::PathMismatch {
            expected: path.to_path_buf(),
            received: result.test_path,
        });
    }
    rjest_snapshot::persist(&snapshot.path, &result.snapshot.data, result.snapshot.dirty)?;
    Ok(result)
}

fn execute_worker(
    encoded_request: &[u8],
    options: &RunnerOptions,
    worker_path: &Path,
) -> Result<(Vec<u8>, Vec<u8>, bool), RunnerError> {
    let mut command = Command::new(&options.node_binary);
    if std::env::var_os("NODE_ENV").is_none() {
        command.env("NODE_ENV", "test");
    }
    if !options.module_paths.is_empty() {
        command.env(
            "NODE_PATH",
            std::env::join_paths(&options.module_paths).unwrap_or_default(),
        );
    }
    let mut child = command
        .arg(worker_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|source| RunnerError::Spawn {
            binary: options.node_binary.clone(),
            source,
        })?;

    child
        .stdin
        .take()
        .expect("piped stdin is always available")
        .write_all(encoded_request)
        .map_err(RunnerError::Write)?;
    let stdout_pipe = child.stdout.take().expect("piped stdout is available");
    let stderr_pipe = child.stderr.take().expect("piped stderr is available");
    let stdout_reader = thread::spawn(move || read_pipe(stdout_pipe));
    let stderr_reader = thread::spawn(move || read_pipe(stderr_pipe));
    let child_started = Instant::now();
    let timed_out = loop {
        if child.try_wait().map_err(RunnerError::Wait)?.is_some() {
            break false;
        }
        if child_started.elapsed() >= Duration::from_millis(options.file_timeout_ms) {
            child.kill().map_err(RunnerError::Wait)?;
            child.wait().map_err(RunnerError::Wait)?;
            break true;
        }
        thread::sleep(Duration::from_millis(10));
    };
    let stdout = join_reader(stdout_reader)?;
    let stderr = join_reader(stderr_reader)?;
    Ok((stdout, stderr, timed_out))
}

fn read_pipe(mut pipe: impl Read) -> std::io::Result<Vec<u8>> {
    let mut output = Vec::new();
    pipe.read_to_end(&mut output)?;
    Ok(output)
}

fn join_reader(
    reader: thread::JoinHandle<std::io::Result<Vec<u8>>>,
) -> Result<Vec<u8>, RunnerError> {
    reader
        .join()
        .map_err(|_| RunnerError::Wait(std::io::Error::other("worker output reader panicked")))?
        .map_err(RunnerError::Wait)
}

fn worker_details(stdout: &str, stderr: &str) -> String {
    let details = [stdout.trim(), stderr.trim()]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    if details.is_empty() {
        String::new()
    } else {
        format!(":\n{details}")
    }
}

fn millis(duration: std::time::Duration) -> u64 {
    u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use rjest_core::TestStatus;
    use tempfile::tempdir;

    use super::*;

    #[test]
    fn executes_nested_async_hooks_matchers_and_mocks() {
        let temp = tempdir().expect("temp dir");
        let test_path = temp.path().join("runtime.test.mjs");
        fs::write(
            &test_path,
            r"
                const events = [];
                beforeAll(() => events.push('beforeAll'));
                beforeEach(() => events.push('beforeEach'));
                afterEach(() => events.push('afterEach'));
                afterAll(() => expect(events).toEqual([
                  'beforeAll', 'beforeEach', 'body', 'afterEach',
                  'beforeEach', 'async', 'afterEach'
                ]));
                describe('runtime', () => {
                  test('runs promises and matchers', async () => {
                    events.push('body');
                    await expect(Promise.resolve({answer: 42})).resolves.toMatchObject({answer: 42});
                    expect([1, 2, 3]).toContainEqual(2);
                  });
                  it('tracks mocks', done => {
                    events.push('async');
                    const mock = jest.fn().mockReturnValueOnce('first').mockReturnValue('later');
                    expect([mock(), mock()]).toEqual(['first', 'later']);
                    expect(mock).toHaveBeenCalledTimes(2);
                    done();
                  });
                  test.skip('skips', () => {});
                  test.todo('later');
                });
            ",
        )
        .expect("write test");
        let files = vec![TestFile {
            path: test_path.canonicalize().expect("canonical path"),
        }];

        let result = run(&files, &RunnerOptions::default()).expect("run tests");
        assert!(result.is_success());
        assert_eq!(result.count(TestStatus::Passed), 2);
        assert_eq!(result.count(TestStatus::Skipped), 1);
        assert_eq!(result.count(TestStatus::Todo), 1);
    }

    #[test]
    fn reports_assertion_failures_without_losing_other_tests() {
        let temp = tempdir().expect("temp dir");
        let test_path = temp.path().join("failure.test.js");
        fs::write(
            &test_path,
            "test('fails clearly', () => expect({a: 1}).toEqual({a: 2}));\n\
             test('still runs', () => expect(true).toBeTruthy());",
        )
        .expect("write test");
        let files = vec![TestFile {
            path: test_path.canonicalize().expect("canonical path"),
        }];

        let result = run(&files, &RunnerOptions::default()).expect("run tests");
        assert!(!result.is_success());
        assert_eq!(result.count(TestStatus::Failed), 1);
        assert_eq!(result.count(TestStatus::Passed), 1);
        assert!(
            result.test_results[0].tests[0]
                .failure_message
                .as_deref()
                .is_some_and(|message| message.contains("Expected"))
        );
    }

    #[test]
    fn parses_the_protocol_after_raw_stdout_without_a_line_break() {
        let temp = tempdir().expect("temp dir");
        let test_path = temp.path().join("stdout.test.js");
        fs::write(
            &test_path,
            "process.stdout.write('application output');\n\
             test('still reports', () => expect(true).toBe(true));",
        )
        .expect("write test");
        let files = vec![TestFile {
            path: test_path.canonicalize().expect("canonical path"),
        }];

        let result = run(&files, &RunnerOptions::default()).expect("parse worker result");

        assert!(result.is_success());
        assert_eq!(result.count(TestStatus::Passed), 1);
    }

    #[test]
    fn aggregates_parallel_files_in_deterministic_path_order() {
        let temp = tempdir().expect("temp dir");
        let first = temp.path().join("a.test.js");
        let second = temp.path().join("z.test.js");
        fs::write(&first, "test('first', () => expect(1).toBe(1));").expect("write first");
        fs::write(&second, "test('second', () => expect(2).toBe(2));").expect("write second");
        let files = vec![
            TestFile {
                path: second.canonicalize().expect("second path"),
            },
            TestFile {
                path: first.canonicalize().expect("first path"),
            },
        ];
        let options = RunnerOptions {
            max_workers: 2,
            ..RunnerOptions::default()
        };

        let result = run(&files, &options).expect("run tests");
        assert!(result.is_success());
        assert!(result.test_results[0].test_path.ends_with("a.test.js"));
        assert!(result.test_results[1].test_path.ends_with("z.test.js"));
    }

    #[test]
    fn terminates_a_file_that_blocks_the_javascript_event_loop() {
        let temp = tempdir().expect("temp dir");
        let test_path = temp.path().join("blocked.test.js");
        fs::write(&test_path, "test('blocks', () => { while (true) {} });")
            .expect("write blocked test");
        let files = vec![TestFile {
            path: test_path.canonicalize().expect("canonical path"),
        }];
        let options = RunnerOptions {
            file_timeout_ms: 250,
            ..RunnerOptions::default()
        };

        let result = run(&files, &options).expect("run blocked test");
        assert!(!result.is_success());
        assert!(result.test_results[0].errors[0].contains("wall-clock limit"));
    }

    #[test]
    fn supports_the_legacy_four_argument_transformer_contract() {
        let temp = tempdir().expect("temp dir");
        let test_path = temp.path().join("legacy.test.js");
        let transformer_path = temp.path().join("legacy-transformer.cjs");
        fs::write(&test_path, "this is intentionally not valid JavaScript")
            .expect("write source fixture");
        fs::write(
            &transformer_path,
            r#"
                module.exports = {
                  process(source, filename, config, transformOptions) {
                    if (!config.moduleFileExtensions.includes('js')) {
                      throw new Error('missing legacy moduleFileExtensions');
                    }
                    if (config.rootDir !== transformOptions.rootDir) {
                      throw new Error('legacy rootDir contract differs');
                    }
                    return "test('legacy transformer', () => expect(42).toBe(42));";
                  },
                };
            "#,
        )
        .expect("write transformer fixture");
        let files = vec![TestFile {
            path: test_path.canonicalize().expect("canonical path"),
        }];
        let mut transform = BTreeMap::new();
        transform.insert(
            r"\.js$".into(),
            serde_json::Value::String(
                transformer_path
                    .canonicalize()
                    .expect("canonical transformer")
                    .to_string_lossy()
                    .into_owned(),
            ),
        );
        let options = RunnerOptions {
            root_dir: temp.path().to_path_buf(),
            transform,
            ..RunnerOptions::default()
        };

        let result = run(&files, &options).expect("run transformed test");
        assert!(result.is_success());
        assert_eq!(result.count(TestStatus::Passed), 1);
    }

    #[test]
    fn resolves_ordered_module_name_mapper_rules_with_fallbacks() {
        let temp = tempdir().expect("temp dir");
        let test_path = temp.path().join("mapper.test.cjs");
        let first_path = temp.path().join("first.js");
        let fallback_path = temp.path().join("fallback.js");
        fs::write(&first_path, "module.exports = 'first';").expect("first mapped module");
        fs::write(&fallback_path, "module.exports = 'fallback';").expect("fallback mapped module");
        fs::write(
            &test_path,
            "test('maps', () => {\n\
               expect(require('@ordered/value')).toBe('first');\n\
               expect(require('@fallback')).toBe('fallback');\n\
             });",
        )
        .expect("mapped test");
        let files = vec![TestFile {
            path: test_path.canonicalize().expect("canonical test"),
        }];
        let options = RunnerOptions {
            root_dir: temp.path().to_path_buf(),
            module_name_mapper: vec![
                ModuleNameMapper {
                    pattern: r"^@ordered/(.*)$".into(),
                    replacements: vec![first_path.to_string_lossy().into_owned()],
                },
                ModuleNameMapper {
                    pattern: r"^@ordered/value$".into(),
                    replacements: vec!["must-not-win".into()],
                },
                ModuleNameMapper {
                    pattern: r"^@fallback$".into(),
                    replacements: vec![
                        temp.path()
                            .join("missing.js")
                            .to_string_lossy()
                            .into_owned(),
                        fallback_path.to_string_lossy().into_owned(),
                    ],
                },
            ],
            ..RunnerOptions::default()
        };

        let result = run(&files, &options).expect("run mapped modules");

        assert!(result.is_success());
        assert_eq!(result.count(TestStatus::Passed), 1);
    }

    #[test]
    fn merges_istanbul_counters_from_parallel_file_workers() {
        let coverage_path = "/project/source.js";
        let result = |statement, first_branch, second_branch| TestFileResult {
            protocol_version: WORKER_PROTOCOL_VERSION,
            test_path: PathBuf::from(format!("test-{statement}.js")),
            tests: Vec::new(),
            errors: Vec::new(),
            console: Vec::new(),
            duration_ms: 1,
            heap_used_bytes: None,
            snapshot: SnapshotResult::default(),
            coverage: CoverageMap::from([(
                coverage_path.into(),
                serde_json::json!({
                    "path": coverage_path,
                    "statementMap": {"0": {"start": {"line": 1}, "end": {"line": 1}}},
                    "fnMap": {"0": {"name": "source", "line": 1}},
                    "branchMap": {"0": {"line": 1}},
                    "s": {"0": statement},
                    "f": {"0": statement},
                    "b": {"0": [first_branch, second_branch]}
                }),
            )]),
        };

        let coverage =
            merge_coverage_maps(&[result(1, 1, 0), result(2, 0, 2)]).expect("merge coverage");

        assert_eq!(coverage[coverage_path]["s"]["0"], 3);
        assert_eq!(coverage[coverage_path]["f"]["0"], 3);
        assert_eq!(coverage[coverage_path]["b"]["0"], serde_json::json!([1, 2]));
    }

    #[test]
    fn implicit_babel_transform_uses_the_version_bundled_with_jest() {
        let temp = tempdir().expect("temp dir");
        let test_path = temp.path().join("implicit.test.js");
        fs::write(&test_path, "not valid JavaScript").expect("test source");
        let root_babel = temp.path().join("node_modules/babel-jest");
        let jest_config = temp.path().join("node_modules/jest-config");
        let bundled_babel = jest_config.join("node_modules/babel-jest");
        fs::create_dir_all(&root_babel).expect("root Babel-Jest");
        fs::create_dir_all(&bundled_babel).expect("bundled Babel-Jest");
        fs::write(
            root_babel.join("package.json"),
            r#"{"name":"babel-jest","main":"index.js"}"#,
        )
        .expect("root package");
        fs::write(
            root_babel.join("index.js"),
            "exports.process = () => \"test('wrong transformer', () => { throw new Error('wrong Babel-Jest') })\";",
        )
        .expect("root transformer");
        fs::write(
            jest_config.join("package.json"),
            r#"{"name":"jest-config","version":"25.5.4"}"#,
        )
        .expect("Jest config package");
        fs::write(
            bundled_babel.join("package.json"),
            r#"{"name":"babel-jest","main":"index.js"}"#,
        )
        .expect("bundled package");
        fs::write(
            bundled_babel.join("index.js"),
            "exports.process = () => \"test('bundled transformer', () => expect(true).toBe(true))\";",
        )
        .expect("bundled transformer");
        let files = vec![TestFile {
            path: test_path.canonicalize().expect("canonical test"),
        }];
        let options = RunnerOptions {
            root_dir: temp.path().to_path_buf(),
            ..RunnerOptions::default()
        };

        let result = run(&files, &options).expect("run transformed test");

        assert!(result.is_success());
        assert_eq!(result.test_results[0].tests[0].name, "bundled transformer");
    }
}
