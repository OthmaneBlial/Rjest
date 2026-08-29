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
    AggregatedResult, SnapshotResult, SnapshotUpdate, TestFile, TestFileResult,
    WORKER_PROTOCOL_VERSION, WorkerRequest,
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
    pub module_paths: Vec<PathBuf>,
    pub test_environment: String,
    pub test_environment_options: serde_json::Value,
    pub setup_files_after_env: Vec<PathBuf>,
    pub snapshot_serializers: Vec<String>,
    pub transform: BTreeMap<String, serde_json::Value>,
    pub transform_ignore_patterns: Vec<String>,
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
            module_paths: Vec::new(),
            test_environment: "node".into(),
            test_environment_options: serde_json::json!({}),
            setup_files_after_env: Vec::new(),
            snapshot_serializers: Vec::new(),
            transform: BTreeMap::new(),
            transform_ignore_patterns: vec!["/node_modules/".into()],
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
    let started = Instant::now();
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(options.max_workers)
        .build()?;
    let results = pool.install(|| {
        files
            .par_iter()
            .map(|file| run_file(&file.path, options))
            .collect::<Result<Vec<_>, _>>()
    })?;
    let mut test_results = results;
    test_results.sort_by(|left, right| left.test_path.cmp(&right.test_path));
    Ok(AggregatedResult {
        test_results,
        duration_ms: millis(started.elapsed()),
    })
}

fn run_file(path: &Path, options: &RunnerOptions) -> Result<TestFileResult, RunnerError> {
    let snapshot = rjest_snapshot::load(path, options.snapshot_update)?;
    let request = WorkerRequest {
        protocol_version: WORKER_PROTOCOL_VERSION,
        test_path: path.to_path_buf(),
        root_dir: options.root_dir.clone(),
        module_file_extensions: options.module_file_extensions.clone(),
        test_environment: options.test_environment.clone(),
        test_environment_options: options.test_environment_options.clone(),
        setup_files_after_env: options.setup_files_after_env.clone(),
        snapshot_serializers: options.snapshot_serializers.clone(),
        transform: options.transform.clone(),
        transform_ignore_patterns: options.transform_ignore_patterns.clone(),
        test_name_pattern: options.test_name_pattern.clone(),
        default_timeout_ms: options.default_timeout_ms,
        snapshot_update: options.snapshot_update,
        snapshot_file_exists: snapshot.exists,
        snapshot_dirty: snapshot.dirty,
        snapshot_data: snapshot.data,
    };
    let encoded = serde_json::to_vec(&request)?;
    let (stdout, stderr, timed_out) = execute_worker(&encoded, options)?;
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
            snapshot: SnapshotResult::default(),
        });
    }
    let stdout = String::from_utf8_lossy(&stdout);
    let payload = stdout
        .lines()
        .rev()
        .find_map(|line| line.strip_prefix(RESULT_PREFIX))
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
        .arg("--input-type=module")
        .arg("--eval")
        .arg(WORKER_SOURCE)
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
}
