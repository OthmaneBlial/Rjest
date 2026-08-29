//! Bounded process-isolated JavaScript test execution.

use std::{
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::Instant,
};

use rayon::prelude::*;
use rjest_core::{
    AggregatedResult, SnapshotUpdate, TestFile, TestFileResult, WORKER_PROTOCOL_VERSION,
    WorkerRequest,
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
        test_name_pattern: options.test_name_pattern.clone(),
        default_timeout_ms: options.default_timeout_ms,
        snapshot_update: options.snapshot_update,
        snapshot_file_exists: snapshot.exists,
        snapshot_dirty: snapshot.dirty,
        snapshot_data: snapshot.data,
    };
    let encoded = serde_json::to_vec(&request)?;
    let mut child = Command::new(&options.node_binary)
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
        .write_all(&encoded)
        .map_err(RunnerError::Write)?;
    let output = child.wait_with_output().map_err(RunnerError::Wait)?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let payload = stdout
        .lines()
        .rev()
        .find_map(|line| line.strip_prefix(RESULT_PREFIX))
        .ok_or_else(|| RunnerError::MissingResult {
            path: path.to_path_buf(),
            details: worker_details(&stdout, &String::from_utf8_lossy(&output.stderr)),
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
}
