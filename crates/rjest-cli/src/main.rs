use std::{
    collections::{BTreeMap, BTreeSet},
    fmt::Write as _,
    fs,
    io::{BufRead, BufReader, IsTerminal, Write as IoWrite},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    str::FromStr,
    sync::Mutex,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, Result, anyhow, bail, ensure};
use clap::{ArgAction, Parser};
use crossterm::{
    event::{self, Event, KeyCode, KeyEvent, KeyEventKind, KeyModifiers},
    terminal::{disable_raw_mode, enable_raw_mode},
};
use rjest_config::ProjectConfig;
use rjest_core::{
    AggregatedResult, ExecutionOrderConfig, GlobalExecutionConfig, SnapshotUpdate, TestFile,
    TestStatus,
};
use rjest_coverage::{CoverageOptions, CoverageReport, discover_sources, write_reports};
use rjest_dependency::{
    DependencyGraph, GitChangeOptions, GraphOptions, git_changed_files_with_options,
};
use rjest_runner::CancellationToken;
use rjest_watch::{NativeWatcher, WatchOptions};
use sha1::{Digest, Sha1};

const TEST_SEQUENCER_BRIDGE: &str = include_str!("../runtime/test-sequencer.mjs");
const TEST_SEQUENCER_PREFIX: &str = "__RJEST_SEQUENCER__";
const CUSTOM_REPORTER_BRIDGE: &str = include_str!("../runtime/custom-reporters.mjs");
const CUSTOM_REPORTER_PREFIX: &str = "__RJEST_REPORTER__";
const GLOBAL_HOOK_BRIDGE: &str = include_str!("../runtime/global-hooks.mjs");
const GLOBAL_HOOK_PREFIX: &str = "__RJEST_GLOBAL_HOOK__";
const TEST_RESULTS_PROCESSOR_BRIDGE: &str = include_str!("../runtime/test-results-processor.mjs");
const TEST_RESULTS_PROCESSOR_PREFIX: &str = "__RJEST_RESULTS_PROCESSOR__";

type EnvironmentDelta = BTreeMap<String, Option<String>>;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct Shard {
    index: usize,
    count: usize,
}

impl FromStr for Shard {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let components = value.split('/').collect::<Vec<_>>();
        if components.len() != 2
            || components.iter().any(|component| {
                component.is_empty() || !component.chars().all(|c| c.is_ascii_digit())
            })
        {
            return Err("The shard option requires a string in the format of <n>/<m>.".into());
        }
        let index = components[0].parse::<usize>().map_err(|_| {
            "The shard option requires a string in the format of <n>/<m>.".to_owned()
        })?;
        let count = components[1].parse::<usize>().map_err(|_| {
            "The shard option requires a string in the format of <n>/<m>.".to_owned()
        })?;
        if index == 0 || count == 0 {
            return Err(
                "The shard option requires 1-based values, received 0 or lower in the pair.".into(),
            );
        }
        if index > count {
            return Err(
                "The shard option <n>/<m> requires <n> to be lower or equal than <m>.".into(),
            );
        }
        Ok(Self { index, count })
    }
}

#[derive(Debug, Parser)]
#[command(
    name = "rjest",
    version,
    about = "Jest compatibility with a native Rust engine"
)]
#[allow(clippy::struct_excessive_bools)]
struct Cli {
    /// File, directory, or path substring used to select tests.
    #[arg(value_name = "TEST_PATH_PATTERN")]
    test_path_patterns: Vec<PathBuf>,

    /// Path to a Jest configuration file or an inline JSON object.
    #[arg(long, value_name = "PATH|JSON")]
    config: Option<String>,

    /// Enable Jest-compatible runtime caches.
    #[arg(long, action = ArgAction::SetTrue, conflicts_with = "no_cache")]
    cache: bool,

    /// Disable reads from existing caches and reset their current state.
    #[arg(long = "no-cache", action = ArgAction::SetTrue, conflicts_with = "cache")]
    no_cache: bool,

    /// Directory used for Jest-compatible cache data.
    #[arg(
        long = "cacheDirectory",
        visible_alias = "cache-directory",
        value_name = "PATH"
    )]
    cache_directory: Option<String>,

    /// Delete configured cache directories and exit successfully.
    #[arg(
        long = "clearCache",
        visible_alias = "clear-cache",
        action = ArgAction::SetTrue
    )]
    clear_cache: bool,

    /// Override the configured Jest test sequencer module.
    #[arg(
        long = "testSequencer",
        visible_alias = "test-sequencer",
        value_name = "PATH"
    )]
    test_sequencer: Option<String>,

    /// Module run once before executing the selected test suites.
    #[arg(
        long = "globalSetup",
        visible_alias = "global-setup",
        value_name = "PATH"
    )]
    global_setup: Option<String>,

    /// Module run once after executing the selected test suites.
    #[arg(
        long = "globalTeardown",
        visible_alias = "global-teardown",
        value_name = "PATH"
    )]
    global_teardown: Option<String>,

    /// Module that receives and may transform Jest's final aggregated result.
    #[arg(
        long = "testResultsProcessor",
        visible_alias = "test-results-processor",
        value_name = "PATH"
    )]
    test_results_processor: Option<String>,

    /// Force all tests even when only-changed or only-failures is configured.
    #[arg(long, action = ArgAction::SetTrue)]
    all: bool,

    /// Run only tests related to changed files in the current repository.
    #[arg(
        short = 'o',
        long = "onlyChanged",
        visible_alias = "only-changed",
        action = ArgAction::SetTrue,
        conflicts_with = "watch_all"
    )]
    only_changed: bool,

    /// Run tests related to files changed since this Git revision.
    #[arg(
        long = "changedSince",
        visible_alias = "changed-since",
        value_name = "REVISION",
        conflicts_with = "watch_all"
    )]
    changed_since: Option<String>,

    /// Include changes made in the last commit and the working tree.
    #[arg(
        long = "changedFilesWithAncestor",
        visible_alias = "changed-files-with-ancestor",
        action = ArgAction::SetTrue,
        conflicts_with = "watch_all"
    )]
    changed_files_with_ancestor: bool,

    /// Run tests related to files changed in the last commit.
    #[arg(
        long = "lastCommit",
        visible_alias = "last-commit",
        action = ArgAction::SetTrue,
        conflicts_with = "watch_all"
    )]
    last_commit: bool,

    /// Run only tests related to the supplied source file paths.
    #[arg(
        long = "findRelatedTests",
        visible_alias = "find-related-tests",
        action = ArgAction::SetTrue
    )]
    find_related_tests: bool,

    /// Run only test files that failed in the previous execution.
    #[arg(short = 'f', long = "onlyFailures", visible_alias = "only-failures", action = ArgAction::SetTrue)]
    only_failures: bool,

    /// Watch files and rerun all test suites after a change.
    #[arg(
        long = "watchAll",
        visible_alias = "watch-all",
        action = ArgAction::SetTrue,
        conflicts_with = "watch"
    )]
    watch_all: bool,

    /// Watch files and rerun tests related to changed files.
    #[arg(long, action = ArgAction::SetTrue, conflicts_with = "watch_all")]
    watch: bool,

    /// Disable Watchman and use the native filesystem watcher.
    #[arg(long = "no-watchman", action = ArgAction::SetTrue)]
    no_watchman: bool,

    /// Project directories or config files to run in one Jest invocation.
    #[arg(long, value_name = "PATH", num_args = 1.., action = ArgAction::Append)]
    projects: Vec<PathBuf>,

    /// Run only projects whose configured display name is selected.
    #[arg(long = "selectProjects", value_name = "NAME", num_args = 1.., action = ArgAction::Append)]
    select_projects: Vec<String>,

    /// Exclude projects whose configured display name is ignored.
    #[arg(long = "ignoreProjects", value_name = "NAME", num_args = 1.., action = ArgAction::Append)]
    ignore_projects: Vec<String>,

    /// Print all selected test files and exit.
    #[arg(long = "listTests", visible_alias = "list-tests", action = ArgAction::SetTrue)]
    list_tests: bool,

    /// Print the normalized configuration and exit.
    #[arg(long = "showConfig", visible_alias = "show-config", action = ArgAction::SetTrue)]
    show_config: bool,

    /// Exit successfully when no test files are found.
    #[arg(
        long = "passWithNoTests",
        visible_alias = "pass-with-no-tests",
        action = ArgAction::SetTrue
    )]
    pass_with_no_tests: bool,

    /// Run all test files serially in the current coordinator.
    #[arg(long = "runInBand", visible_alias = "run-in-band", action = ArgAction::SetTrue)]
    run_in_band: bool,

    /// Stop after the first test failure (numeric thresholds belong in config).
    #[arg(short = 'b', long, action = ArgAction::SetTrue)]
    bail: bool,

    /// Disable a bail threshold supplied by configuration.
    #[arg(long = "no-bail", action = ArgAction::SetTrue)]
    no_bail: bool,

    /// Maximum number of parallel test-file workers (number or percentage).
    #[arg(
        short = 'w',
        long = "maxWorkers",
        visible_alias = "max-workers",
        value_name = "N|PERCENT"
    )]
    max_workers: Option<String>,

    /// Print the JavaScript heap used after each test suite.
    #[arg(
        long = "logHeapUsage",
        visible_alias = "log-heap-usage",
        action = ArgAction::SetTrue
    )]
    log_heap_usage: bool,

    /// Force the runner to exit after all tests have completed.
    #[arg(
        long = "forceExit",
        visible_alias = "force-exit",
        action = ArgAction::SetTrue
    )]
    force_exit: bool,

    /// Only run tests whose full names match this regular expression.
    #[arg(
        long = "testNamePattern",
        visible_alias = "test-name-pattern",
        value_name = "REGEX"
    )]
    test_name_pattern: Option<String>,

    /// Suppress captured console output.
    #[arg(long, action = ArgAction::SetTrue)]
    silent: bool,

    /// Print every test case, not only failures.
    #[arg(long, action = ArgAction::SetTrue)]
    verbose: bool,

    /// Emit the complete machine-readable result as JSON.
    #[arg(long, action = ArgAction::SetTrue)]
    json: bool,

    /// Write the machine-readable result to a file (used with --json by Jest).
    #[arg(
        long = "outputFile",
        visible_alias = "output-file",
        value_name = "PATH"
    )]
    output_file: Option<PathBuf>,

    /// Collect Istanbul-compatible source coverage.
    #[arg(
        long,
        visible_alias = "collectCoverage",
        action = ArgAction::SetTrue
    )]
    coverage: bool,

    /// Disable coverage enabled by configuration.
    #[arg(
        long = "no-coverage",
        action = ArgAction::SetTrue,
        conflicts_with = "coverage"
    )]
    no_coverage: bool,

    /// Directory where coverage reports are written.
    #[arg(
        long = "coverageDirectory",
        visible_alias = "coverage-directory",
        value_name = "PATH"
    )]
    coverage_directory: Option<PathBuf>,

    /// Coverage reporter to run; may be specified more than once.
    #[arg(
        long = "coverageReporters",
        visible_alias = "coverage-reporters",
        value_name = "REPORTER",
        action = ArgAction::Append
    )]
    coverage_reporters: Vec<String>,

    /// Glob of source files that should be included in coverage.
    #[arg(
        long = "collectCoverageFrom",
        visible_alias = "collect-coverage-from",
        value_name = "GLOB",
        action = ArgAction::Append
    )]
    collect_coverage_from: Vec<String>,

    /// Regular expression for paths excluded from coverage.
    #[arg(
        long = "coveragePathIgnorePatterns",
        visible_alias = "coverage-path-ignore-patterns",
        value_name = "REGEX",
        action = ArgAction::Append
    )]
    coverage_path_ignore_patterns: Vec<String>,

    /// Coverage implementation; Rjest currently supports Babel instrumentation.
    #[arg(
        long = "coverageProvider",
        visible_alias = "coverage-provider",
        value_name = "PROVIDER"
    )]
    coverage_provider: Option<String>,

    /// JSON object containing coverage threshold rules.
    #[arg(
        long = "coverageThreshold",
        visible_alias = "coverage-threshold",
        value_name = "JSON"
    )]
    coverage_threshold: Option<String>,

    /// Rewrite failing snapshots and remove obsolete snapshots.
    #[arg(
        short = 'u',
        long = "updateSnapshot",
        visible_alias = "update-snapshot",
        action = ArgAction::SetTrue
    )]
    update_snapshot: bool,

    /// Set the signed 32-bit seed exposed by `jest.getSeed()`.
    #[arg(long, value_name = "NUMBER", allow_hyphen_values = true)]
    seed: Option<i64>,

    /// Print the run seed in the result summary.
    #[arg(
        long = "showSeed",
        visible_alias = "show-seed",
        action = ArgAction::SetTrue
    )]
    show_seed: bool,

    /// Shuffle tests within each describe block using the run seed.
    #[arg(long, action = ArgAction::SetTrue)]
    randomize: bool,

    /// Execute one deterministic shard of the discovered test files.
    #[arg(long, value_name = "INDEX/COUNT")]
    shard: Option<Shard>,
}

struct CoverageRunnerSettings {
    enabled: bool,
    path_ignore_patterns: Vec<String>,
    filter: Option<Vec<PathBuf>>,
    sources: Vec<PathBuf>,
}

struct ProjectRun<'a> {
    config: &'a ProjectConfig,
    tests: Vec<TestFile>,
    changed_coverage_filter: Option<Vec<PathBuf>>,
}

struct RelatedTestSelection {
    tests_by_context: Vec<BTreeSet<PathBuf>>,
    coverage_by_context: Vec<Option<BTreeSet<PathBuf>>>,
    has_scm: bool,
}

#[derive(Clone)]
struct SequencerUnit<'a> {
    config: &'a ProjectConfig,
    test: TestFile,
    changed_coverage_filter: Option<Vec<PathBuf>>,
}

type NativePerformanceEntries = BTreeMap<String, BTreeMap<String, (bool, u64)>>;

struct NativeSequencerOwner {
    key: String,
    root_dir: PathBuf,
    display_name: Option<String>,
}

struct NativeSequencerCache {
    path: PathBuf,
    entries: NativePerformanceEntries,
    owners: Vec<NativeSequencerOwner>,
}

impl NativeSequencerCache {
    fn load(global_config: &ProjectConfig, project_runs: &[ProjectRun<'_>]) -> Result<Self> {
        let root_hash = Sha1::digest(global_config.root_dir.to_string_lossy().as_bytes());
        let path = global_config
            .cache_directory
            .join(format!("rjest-perf-cache-{root_hash:x}.json"));
        if !global_config.cache {
            match fs::remove_file(&path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => {
                    return Err(error).with_context(|| {
                        format!(
                            "cannot reset native test sequencer cache `{}`",
                            path.display()
                        )
                    });
                }
            }
        }
        let entries = if global_config.cache {
            fs::read_to_string(&path)
                .ok()
                .and_then(|source| serde_json::from_str(&source).ok())
                .unwrap_or_default()
        } else {
            BTreeMap::new()
        };
        let owners = project_runs
            .iter()
            .map(|run| {
                Ok(NativeSequencerOwner {
                    key: native_context_key(run.config)?,
                    root_dir: run.config.root_dir.clone(),
                    display_name: run
                        .config
                        .display_name
                        .as_ref()
                        .map(|display_name| display_name.name.clone()),
                })
            })
            .collect::<Result<Vec<_>>>()?;
        Ok(Self {
            path,
            entries,
            owners,
        })
    }

    fn performance(&self, context_key: &str, path: &Path) -> Option<(bool, u64)> {
        self.entries
            .get(context_key)
            .and_then(|context| context.get(path.to_string_lossy().as_ref()))
            .copied()
    }

    fn record(&mut self, result: &AggregatedResult) {
        for file in &result.test_results {
            if file.errors.is_empty()
                && file
                    .tests
                    .iter()
                    .all(|test| test.status == TestStatus::Skipped)
            {
                continue;
            }
            let failed = !file.is_success();
            for owner in &self.owners {
                if file.test_path.starts_with(&owner.root_dir)
                    && file.project_display_name == owner.display_name
                {
                    self.entries.entry(owner.key.clone()).or_default().insert(
                        file.test_path.to_string_lossy().into_owned(),
                        (failed, file.duration_ms),
                    );
                }
            }
        }
    }

    fn save(&self) -> Result<()> {
        let parent = self
            .path
            .parent()
            .context("native test sequencer cache has no parent directory")?;
        fs::create_dir_all(parent).with_context(|| {
            format!(
                "cannot create native test sequencer cache directory `{}`",
                parent.display()
            )
        })?;
        fs::write(&self.path, serde_json::to_vec(&self.entries)?).with_context(|| {
            format!(
                "cannot write native test sequencer cache `{}`",
                self.path.display()
            )
        })?;
        Ok(())
    }
}

fn native_context_key(config: &ProjectConfig) -> Result<String> {
    let mut normalized = config.clone();
    // `onlyFailures` is run-wide in Jest and does not alter the project config
    // id used for the sequencer performance cache.
    normalized.only_failures = false;
    normalized.cache = true;
    let encoded = serde_json::to_vec(&normalized)?;
    Ok(format!("{:x}", Sha1::digest(encoded)))
}

struct CustomTestSequencerSession {
    child: Child,
    stdin: Option<ChildStdin>,
    stdout: BufReader<ChildStdout>,
    finished: bool,
}

impl CustomTestSequencerSession {
    fn start(request: &serde_json::Value) -> Result<(Self, Vec<usize>)> {
        let mut child = Command::new("node")
            .arg("--input-type=module")
            .arg("--eval")
            .arg(TEST_SEQUENCER_BRIDGE)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .context("cannot start the configured Jest test sequencer")?;
        let mut stdin = child
            .stdin
            .take()
            .context("sequencer stdin is unavailable")?;
        let stdout = child
            .stdout
            .take()
            .context("sequencer stdout is unavailable")?;
        writeln!(stdin, "{}", serde_json::to_string(request)?)
            .context("cannot send tests to the configured Jest test sequencer")?;
        stdin
            .flush()
            .context("cannot flush the configured Jest test sequencer request")?;
        let mut session = Self {
            child,
            stdin: Some(stdin),
            stdout: BufReader::new(stdout),
            finished: false,
        };
        let response = session.read_response()?;
        let order = response
            .get("order")
            .and_then(serde_json::Value::as_array)
            .context("configured Jest test sequencer returned no test order")?
            .iter()
            .map(|value| {
                value
                    .as_u64()
                    .and_then(|value| usize::try_from(value).ok())
                    .context("configured Jest test sequencer returned an invalid test identity")
            })
            .collect::<Result<Vec<_>>>()?;
        Ok((session, order))
    }

    fn finish(&mut self, result: Option<&AggregatedResult>) -> Result<()> {
        let action = result.map_or_else(
            || serde_json::json!({"action": "close"}),
            |result| serde_json::json!({"action": "cacheResults", "result": result}),
        );
        let stdin = self
            .stdin
            .as_mut()
            .context("configured Jest test sequencer session is already closed")?;
        writeln!(stdin, "{}", serde_json::to_string(&action)?)
            .context("cannot finalize the configured Jest test sequencer")?;
        stdin
            .flush()
            .context("cannot flush the configured Jest test sequencer finalization")?;
        let response = self.read_response();
        self.stdin.take();
        let status = self
            .child
            .wait()
            .context("cannot wait for the configured Jest test sequencer")?;
        self.finished = true;
        response?;
        ensure!(
            status.success(),
            "configured Jest test sequencer exited with {status}"
        );
        Ok(())
    }

    fn read_response(&mut self) -> Result<serde_json::Value> {
        let mut line = String::new();
        loop {
            line.clear();
            let read = self
                .stdout
                .read_line(&mut line)
                .context("cannot read the configured Jest test sequencer response")?;
            ensure!(
                read != 0,
                "configured Jest test sequencer exited without a response"
            );
            let Some(payload) = line.trim_end().strip_prefix(TEST_SEQUENCER_PREFIX) else {
                continue;
            };
            let response: serde_json::Value = serde_json::from_str(payload)
                .context("configured Jest test sequencer returned invalid JSON")?;
            if response.get("ok").and_then(serde_json::Value::as_bool) != Some(true) {
                let message = response
                    .get("error")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("unknown test sequencer error");
                bail!("configured Jest test sequencer failed: {message}");
            }
            return Ok(response);
        }
    }
}

impl Drop for CustomTestSequencerSession {
    fn drop(&mut self) {
        if self.finished {
            return;
        }
        self.stdin.take();
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

struct GlobalHookProcess {
    child: Child,
    stdin: Option<ChildStdin>,
    stdout: BufReader<ChildStdout>,
    finished: bool,
}

struct GlobalHookSession {
    process: GlobalHookProcess,
    environment: EnvironmentDelta,
}

impl GlobalHookSession {
    fn start(
        config: &ProjectConfig,
        cli: &Cli,
        project_runs: &[ProjectRun<'_>],
        max_workers: usize,
        seed: i32,
    ) -> Result<Option<Self>> {
        let request = global_hook_request(config, cli, project_runs, max_workers, seed)?;
        let has_hooks = request["globalSetups"]
            .as_array()
            .is_some_and(|hooks| !hooks.is_empty())
            || request["globalTeardowns"]
                .as_array()
                .is_some_and(|hooks| !hooks.is_empty());
        if !has_hooks {
            return Ok(None);
        }

        let mut child = Command::new("node")
            .arg("--input-type=module")
            .arg("--eval")
            .arg(GLOBAL_HOOK_BRIDGE)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .context("cannot start the configured Jest global hooks")?;
        let mut stdin = child
            .stdin
            .take()
            .context("global hook stdin is unavailable")?;
        let stdout = child
            .stdout
            .take()
            .context("global hook stdout is unavailable")?;
        writeln!(stdin, "{}", serde_json::to_string(&request)?)
            .context("cannot initialize the configured Jest global hooks")?;
        stdin
            .flush()
            .context("cannot flush the configured Jest global hook initialization")?;
        let mut process = GlobalHookProcess {
            child,
            stdin: Some(stdin),
            stdout: BufReader::new(stdout),
            finished: false,
        };
        let response = process.read_response()?;
        let environment = response
            .get("environment")
            .cloned()
            .map_or_else(|| Ok(BTreeMap::new()), serde_json::from_value)
            .context("configured Jest globalSetup returned an invalid environment delta")?;
        Ok(Some(Self {
            process,
            environment,
        }))
    }

    fn environment(&self) -> &EnvironmentDelta {
        &self.environment
    }

    fn finish(&mut self) -> Result<()> {
        let response = self
            .process
            .send(&serde_json::json!({"action": "globalTeardown"}))?;
        if let Some(environment) = response.get("environment") {
            self.environment = serde_json::from_value(environment.clone())
                .context("configured Jest globalTeardown returned an invalid environment delta")?;
        }
        self.process.stdin.take();
        let status = self
            .process
            .child
            .wait()
            .context("cannot wait for the configured Jest global hooks")?;
        self.process.finished = true;
        ensure!(
            status.success(),
            "configured Jest global hooks exited with {status}"
        );
        Ok(())
    }
}

impl GlobalHookProcess {
    fn send(&mut self, request: &serde_json::Value) -> Result<serde_json::Value> {
        let stdin = self
            .stdin
            .as_mut()
            .context("configured Jest global hook session is already closed")?;
        writeln!(stdin, "{}", serde_json::to_string(request)?)
            .context("cannot send a configured Jest global hook event")?;
        stdin
            .flush()
            .context("cannot flush a configured Jest global hook event")?;
        self.read_response()
    }

    fn read_response(&mut self) -> Result<serde_json::Value> {
        let mut line = String::new();
        loop {
            line.clear();
            let read = self
                .stdout
                .read_line(&mut line)
                .context("cannot read the configured Jest global hook response")?;
            ensure!(
                read != 0,
                "configured Jest global hooks exited without a response"
            );
            let Some(marker) = line.find(GLOBAL_HOOK_PREFIX) else {
                print!("{line}");
                std::io::stdout()
                    .flush()
                    .context("cannot forward configured Jest global hook output")?;
                continue;
            };
            if marker > 0 {
                print!("{}", &line[..marker]);
                std::io::stdout()
                    .flush()
                    .context("cannot forward configured Jest global hook output")?;
            }
            let payload = line[marker + GLOBAL_HOOK_PREFIX.len()..].trim_end();
            let response: serde_json::Value = serde_json::from_str(payload)
                .context("configured Jest global hooks returned invalid JSON")?;
            if response.get("ok").and_then(serde_json::Value::as_bool) != Some(true) {
                let message = response
                    .get("error")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("unknown global hook error");
                bail!("{message}");
            }
            return Ok(response);
        }
    }
}

impl Drop for GlobalHookSession {
    fn drop(&mut self) {
        if self.process.finished {
            return;
        }
        self.process.stdin.take();
        let _ = self.process.child.kill();
        let _ = self.process.child.wait();
    }
}

fn global_hook_request(
    config: &ProjectConfig,
    cli: &Cli,
    project_runs: &[ProjectRun<'_>],
    max_workers: usize,
    seed: i32,
) -> Result<serde_json::Value> {
    let test_count = project_runs.iter().map(|run| run.tests.len()).sum();
    Ok(serde_json::json!({
        "globalConfig": jest_global_config(config, cli, max_workers, seed, test_count)?,
        "globalSetups": global_hook_entries(config, project_runs, true),
        "globalTeardowns": global_hook_entries(config, project_runs, false),
        "runtimeToolPaths": internal_node_module_paths(&["babel-jest"]),
    }))
}

fn global_hook_entries(
    global_config: &ProjectConfig,
    project_runs: &[ProjectRun<'_>],
    setup: bool,
) -> Vec<serde_json::Value> {
    let mut seen = BTreeSet::new();
    let mut entries = Vec::new();
    for run in project_runs.iter().filter(|run| !run.tests.is_empty()) {
        let Some(module_path) = global_hook_module(run.config, setup) else {
            continue;
        };
        if seen.insert(module_path.to_owned()) {
            entries.push(global_hook_entry(module_path, run.config));
        }
    }
    if let Some(module_path) = global_hook_module(global_config, setup)
        && seen.insert(module_path.to_owned())
        && let Some(first_project) = project_runs
            .iter()
            .find(|run| !run.tests.is_empty())
            .map(|run| run.config)
    {
        entries.push(global_hook_entry(module_path, first_project));
    }
    entries
}

fn global_hook_module(config: &ProjectConfig, setup: bool) -> Option<&str> {
    if setup {
        config.global_setup.as_deref()
    } else {
        config.global_teardown.as_deref()
    }
}

fn global_hook_entry(module_path: &str, config: &ProjectConfig) -> serde_json::Value {
    serde_json::json!({
        "modulePath": module_path,
        "projectConfig": config,
        "transformConfigured": config.transform_configured,
    })
}

fn apply_environment_delta(command: &mut Command, environment: &EnvironmentDelta) {
    for (key, value) in environment {
        if let Some(value) = value {
            command.env(key, value);
        } else {
            command.env_remove(key);
        }
    }
}

struct ProcessedTestResults {
    json: serde_json::Value,
    success: bool,
}

fn process_test_results(
    config: &ProjectConfig,
    result: &AggregatedResult,
    environment: &EnvironmentDelta,
    success: bool,
) -> Result<Option<ProcessedTestResults>> {
    let Some(module_path) = config.test_results_processor.as_deref() else {
        return Ok(None);
    };
    let coverage = result
        .test_results
        .iter()
        .map(|file| &file.coverage)
        .collect::<Vec<_>>();
    let request = serde_json::json!({
        "coverage": coverage,
        "modulePath": module_path,
        "projectConfig": config,
        "result": result,
        "rootDir": config.root_dir,
        "success": success,
    });

    let mut command = Command::new("node");
    apply_environment_delta(&mut command, environment);
    let mut child = command
        .arg("--input-type=module")
        .arg("--eval")
        .arg(TEST_RESULTS_PROCESSOR_BRIDGE)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .context("cannot start the configured Jest testResultsProcessor")?;
    let mut stdin = child
        .stdin
        .take()
        .context("testResultsProcessor stdin is unavailable")?;
    writeln!(stdin, "{}", serde_json::to_string(&request)?)
        .context("cannot send results to the configured Jest testResultsProcessor")?;
    stdin
        .flush()
        .context("cannot flush the configured Jest testResultsProcessor request")?;
    drop(stdin);

    let stdout = child
        .stdout
        .take()
        .context("testResultsProcessor stdout is unavailable")?;
    let mut stdout = BufReader::new(stdout);
    let mut response = None;
    let mut line = String::new();
    loop {
        line.clear();
        if stdout
            .read_line(&mut line)
            .context("cannot read the configured Jest testResultsProcessor response")?
            == 0
        {
            break;
        }
        let Some(marker) = line.find(TEST_RESULTS_PROCESSOR_PREFIX) else {
            print!("{line}");
            std::io::stdout()
                .flush()
                .context("cannot forward configured Jest testResultsProcessor output")?;
            continue;
        };
        if marker > 0 {
            print!("{}", &line[..marker]);
            std::io::stdout()
                .flush()
                .context("cannot forward configured Jest testResultsProcessor output")?;
        }
        let payload = line[marker + TEST_RESULTS_PROCESSOR_PREFIX.len()..].trim_end();
        response = Some(
            serde_json::from_str::<serde_json::Value>(payload)
                .context("configured Jest testResultsProcessor returned invalid JSON")?,
        );
    }
    let status = child
        .wait()
        .context("cannot wait for the configured Jest testResultsProcessor")?;
    ensure!(
        status.success(),
        "configured Jest testResultsProcessor exited with {status}"
    );
    let response = response.context("configured Jest testResultsProcessor returned no result")?;
    if response.get("ok").and_then(serde_json::Value::as_bool) != Some(true) {
        let message = response
            .get("error")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("unknown testResultsProcessor error");
        bail!("configured Jest testResultsProcessor failed: {message}");
    }
    let json = response
        .get("result")
        .cloned()
        .context("configured Jest testResultsProcessor returned no result")?;
    let success = response
        .get("success")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    Ok(Some(ProcessedTestResults { json, success }))
}

struct CustomReporterProcess {
    child: Child,
    stdin: Option<ChildStdin>,
    stdout: BufReader<ChildStdout>,
    finished: bool,
}

struct CustomReporterSession {
    process: Mutex<CustomReporterProcess>,
}

impl CustomReporterSession {
    fn start(
        config: &ProjectConfig,
        cli: &Cli,
        project_runs: &[ProjectRun<'_>],
        max_workers: usize,
        seed: i32,
        environment: &EnvironmentDelta,
    ) -> Result<Option<Self>> {
        let Some(reporters) = config.reporters.as_ref() else {
            return Ok(None);
        };
        if reporters.iter().all(|(reporter, _)| {
            matches!(
                reporter.as_str(),
                "agent" | "default" | "github-actions" | "summary"
            )
        }) {
            return Ok(None);
        }

        let request = custom_reporter_request(config, cli, project_runs, max_workers, seed)?;

        let mut command = Command::new("node");
        apply_environment_delta(&mut command, environment);
        let mut child = command
            .arg("--input-type=module")
            .arg("--eval")
            .arg(CUSTOM_REPORTER_BRIDGE)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .context("cannot start the configured Jest reporters")?;
        let mut stdin = child
            .stdin
            .take()
            .context("reporter stdin is unavailable")?;
        let stdout = child
            .stdout
            .take()
            .context("reporter stdout is unavailable")?;
        writeln!(stdin, "{}", serde_json::to_string(&request)?)
            .context("cannot initialize the configured Jest reporters")?;
        stdin
            .flush()
            .context("cannot flush the configured Jest reporter initialization")?;
        let mut process = CustomReporterProcess {
            child,
            stdin: Some(stdin),
            stdout: BufReader::new(stdout),
            finished: false,
        };
        process.read_response()?;
        Ok(Some(Self {
            process: Mutex::new(process),
        }))
    }

    fn send(&self, request: &serde_json::Value) -> Result<serde_json::Value> {
        let mut process = self
            .process
            .lock()
            .map_err(|_| anyhow::anyhow!("configured Jest reporter session lock is poisoned"))?;
        process.send(request)
    }

    fn finish(&self, result: &AggregatedResult) -> Result<bool> {
        let mut process = self
            .process
            .lock()
            .map_err(|_| anyhow::anyhow!("configured Jest reporter session lock is poisoned"))?;
        let response = process.send(&serde_json::json!({
            "action": "runComplete",
            "success": result.is_success(),
        }))?;
        let errors = response
            .get("errors")
            .and_then(serde_json::Value::as_array)
            .cloned()
            .unwrap_or_default();
        process.stdin.take();
        let status = process
            .child
            .wait()
            .context("cannot wait for the configured Jest reporters")?;
        process.finished = true;
        ensure!(
            status.success(),
            "configured Jest reporters exited with {status}"
        );
        for error in &errors {
            eprintln!(
                "{}",
                error
                    .as_str()
                    .unwrap_or("configured Jest reporter returned an error")
            );
        }
        Ok(errors.is_empty())
    }
}

fn custom_reporter_request(
    config: &ProjectConfig,
    cli: &Cli,
    project_runs: &[ProjectRun<'_>],
    max_workers: usize,
    seed: i32,
) -> Result<serde_json::Value> {
    let contexts = execution_projects(config);
    let serialized_contexts = contexts
        .iter()
        .enumerate()
        .map(|(id, project)| serde_json::json!({"id": id, "config": project}))
        .collect::<Vec<_>>();
    let tests = project_runs
        .iter()
        .flat_map(|run| {
            let context_id = contexts
                .iter()
                .position(|config| std::ptr::eq(*config, run.config))
                .expect("project run config belongs to the execution config");
            run.tests.iter().map(move |test| {
                serde_json::json!({
                    "contextId": context_id,
                    "path": test.path,
                })
            })
        })
        .collect::<Vec<_>>();
    let global_config = jest_global_config(config, cli, max_workers, seed, tests.len())?;
    Ok(serde_json::json!({
        "contexts": serialized_contexts,
        "estimatedTime": 0,
        "globalConfig": global_config,
        "reporters": config.reporters,
        "resolver": config.resolver,
        "rootDir": config.root_dir,
        "tests": tests,
    }))
}

fn jest_global_config(
    config: &ProjectConfig,
    cli: &Cli,
    max_workers: usize,
    seed: i32,
    test_count: usize,
) -> Result<serde_json::Value> {
    let mut global_config = serde_json::to_value(config)?;
    let object = global_config
        .as_object_mut()
        .context("normalized Jest config is not an object")?;
    object.insert("maxWorkers".into(), max_workers.into());
    object.insert("runInBand".into(), (max_workers == 1).into());
    object.insert("json".into(), cli.json.into());
    object.insert("listTests".into(), cli.list_tests.into());
    object.insert("logHeapUsage".into(), cli.log_heap_usage.into());
    object.insert("watch".into(), cli.watch.into());
    object.insert("watchAll".into(), cli.watch_all.into());
    object.insert("findRelatedTests".into(), cli.find_related_tests.into());
    object.insert(
        "nonFlagArgs".into(),
        serde_json::to_value(&cli.test_path_patterns)?,
    );
    object.insert(
        "testPathPatterns".into(),
        serde_json::to_value(&cli.test_path_patterns)?,
    );
    let only_changed = changed_selection_enabled(cli, config);
    object.insert("onlyChanged".into(), only_changed.into());
    object.insert(
        "changedSince".into(),
        cli.changed_since
            .as_ref()
            .map_or(serde_json::Value::Null, |value| value.clone().into()),
    );
    object.insert("lastCommit".into(), cli.last_commit.into());
    object.insert(
        "changedFilesWithAncestor".into(),
        cli.changed_files_with_ancestor.into(),
    );
    object.insert(
        "passWithNoTests".into(),
        (cli.watch_all || only_changed || config.pass_with_no_tests).into(),
    );
    object.insert("seed".into(), seed.into());
    object.insert(
        "showSeed".into(),
        (cli.show_seed || config.show_seed).into(),
    );
    object.remove("silent");
    if cli.silent || config.silent {
        object.insert("silent".into(), true.into());
    }
    object.remove("verbose");
    if cli.verbose || config.verbose || (test_count == 1 && !(cli.silent || config.silent)) {
        object.insert("verbose".into(), true.into());
    }
    object.insert(
        "collectCoverage".into(),
        (cli.coverage || config.collect_coverage).into(),
    );
    if let Some(pattern) = cli.test_name_pattern.as_ref() {
        object.insert("testNamePattern".into(), pattern.clone().into());
    }
    if let Some(output_file) = cli.output_file.as_ref() {
        object.insert("outputFile".into(), serde_json::to_value(output_file)?);
    }
    object.insert(
        "updateSnapshot".into(),
        serde_json::Value::String(if cli.update_snapshot { "all" } else { "new" }.into()),
    );
    Ok(global_config)
}

impl CustomReporterProcess {
    fn send(&mut self, request: &serde_json::Value) -> Result<serde_json::Value> {
        let stdin = self
            .stdin
            .as_mut()
            .context("configured Jest reporter session is already closed")?;
        writeln!(stdin, "{}", serde_json::to_string(request)?)
            .context("cannot send a configured Jest reporter event")?;
        stdin
            .flush()
            .context("cannot flush a configured Jest reporter event")?;
        self.read_response()
    }

    fn read_response(&mut self) -> Result<serde_json::Value> {
        let mut line = String::new();
        loop {
            line.clear();
            let read = self
                .stdout
                .read_line(&mut line)
                .context("cannot read the configured Jest reporter response")?;
            ensure!(
                read != 0,
                "configured Jest reporters exited without a response"
            );
            let Some(marker) = line.find(CUSTOM_REPORTER_PREFIX) else {
                print!("{line}");
                std::io::stdout()
                    .flush()
                    .context("cannot forward configured Jest reporter output")?;
                continue;
            };
            if marker > 0 {
                print!("{}", &line[..marker]);
                std::io::stdout()
                    .flush()
                    .context("cannot forward configured Jest reporter output")?;
            }
            let payload = line[marker + CUSTOM_REPORTER_PREFIX.len()..].trim_end();
            let response: serde_json::Value = serde_json::from_str(payload)
                .context("configured Jest reporters returned invalid JSON")?;
            if response.get("ok").and_then(serde_json::Value::as_bool) != Some(true) {
                let message = response
                    .get("error")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("unknown custom reporter error");
                bail!("configured Jest reporter failed: {message}");
            }
            return Ok(response);
        }
    }
}

impl Drop for CustomReporterSession {
    fn drop(&mut self) {
        let Ok(mut process) = self.process.lock() else {
            return;
        };
        if process.finished {
            return;
        }
        process.stdin.take();
        let _ = process.child.kill();
        let _ = process.child.wait();
    }
}

struct ReporterRunObserver<'a> {
    context_id: usize,
    session: &'a CustomReporterSession,
}

impl rjest_runner::RunObserver for ReporterRunObserver<'_> {
    fn on_test_file_start(&self, file: &TestFile) -> std::result::Result<(), String> {
        self.session
            .send(&serde_json::json!({
                "action": "testFileStart",
                "contextId": self.context_id,
                "path": file.path,
            }))
            .map(|_| ())
            .map_err(|error| format!("{error:#}"))
    }

    fn on_test_file_result(
        &self,
        result: &rjest_core::TestFileResult,
    ) -> std::result::Result<(), String> {
        self.session
            .send(&serde_json::json!({
                "action": "testFileResult",
                "contextId": self.context_id,
                "result": result,
            }))
            .map(|_| ())
            .map_err(|error| format!("{error:#}"))
    }
}

fn finish_test_sequencers(
    custom: &mut Option<CustomTestSequencerSession>,
    native: &mut Option<NativeSequencerCache>,
    result: Option<&AggregatedResult>,
) -> Result<()> {
    if let Some(session) = custom.as_mut() {
        session.finish(result)?;
    }
    if let (Some(cache), Some(result)) = (native.as_mut(), result) {
        cache.record(result);
        cache.save()?;
    }
    Ok(())
}

#[allow(clippy::struct_excessive_bools)]
struct ReportSettings {
    silent: bool,
    verbose: bool,
    log_heap_usage: bool,
    summary_only: bool,
    show_seed: bool,
    seed: i32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum NativeReporterMode {
    None,
    Default,
    Summary,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum WatchAction {
    FilesChanged,
    Quit,
    Rerun,
    WatchAll,
    WatchChanged,
    ToggleFailures,
    ClearFilters,
    UpdateSnapshots,
    PathPrompt,
    TestNamePrompt,
}

struct WatchTerminal {
    raw_mode: bool,
}

impl WatchTerminal {
    fn start() -> Result<Option<Self>> {
        if !std::io::stdin().is_terminal() {
            return Ok(None);
        }
        enable_raw_mode().context("cannot enable interactive watch input")?;
        Ok(Some(Self { raw_mode: true }))
    }

    fn poll_action(timeout: Duration) -> Result<Option<WatchAction>> {
        if !event::poll(timeout).context("cannot poll interactive watch input")? {
            return Ok(None);
        }
        let Event::Key(key) = event::read().context("cannot read interactive watch input")? else {
            return Ok(None);
        };
        if !matches!(key.kind, KeyEventKind::Press | KeyEventKind::Repeat) {
            return Ok(None);
        }
        Ok(watch_action_for_key(key))
    }

    fn read_pattern(&mut self, prompt: &str) -> Result<Option<String>> {
        self.set_raw_mode(false)?;
        eprint!("{prompt}");
        std::io::stderr()
            .flush()
            .context("cannot flush interactive watch prompt")?;
        let mut value = String::new();
        let read_result = std::io::stdin()
            .read_line(&mut value)
            .context("cannot read interactive watch pattern");
        let raw_result = self.set_raw_mode(true);
        read_result?;
        raw_result?;
        let value = value.trim().to_owned();
        Ok((!value.is_empty()).then_some(value))
    }

    fn set_raw_mode(&mut self, enabled: bool) -> Result<()> {
        if self.raw_mode == enabled {
            return Ok(());
        }
        if enabled {
            enable_raw_mode().context("cannot restore interactive watch input")?;
        } else {
            disable_raw_mode().context("cannot suspend interactive watch input")?;
        }
        self.raw_mode = enabled;
        Ok(())
    }
}

impl Drop for WatchTerminal {
    fn drop(&mut self) {
        if self.raw_mode {
            let _ = disable_raw_mode();
        }
    }
}

fn watch_action_for_key(key: KeyEvent) -> Option<WatchAction> {
    if key.modifiers.contains(KeyModifiers::CONTROL) {
        return match key.code {
            KeyCode::Char('c' | 'd') => Some(WatchAction::Quit),
            _ => None,
        };
    }
    match key.code {
        KeyCode::Enter => Some(WatchAction::Rerun),
        KeyCode::Char('q') => Some(WatchAction::Quit),
        KeyCode::Char('a') => Some(WatchAction::WatchAll),
        KeyCode::Char('o') => Some(WatchAction::WatchChanged),
        KeyCode::Char('f') => Some(WatchAction::ToggleFailures),
        KeyCode::Char('c') => Some(WatchAction::ClearFilters),
        KeyCode::Char('u') => Some(WatchAction::UpdateSnapshots),
        KeyCode::Char('p') => Some(WatchAction::PathPrompt),
        KeyCode::Char('t') => Some(WatchAction::TestNamePrompt),
        KeyCode::Char('w' | '?') => {
            write_watch_usage();
            None
        }
        _ => None,
    }
}

fn write_watch_usage() {
    eprintln!(
        "\nWatch Usage\n\
         › Press a to run all tests.\n\
         › Press f to run only failed tests.\n\
         › Press o to run tests related to changed files.\n\
         › Press p to filter by a filename pattern.\n\
         › Press t to filter by a test name pattern.\n\
         › Press u to update failing snapshots.\n\
         › Press c to clear filters.\n\
         › Press q to quit watch mode.\n\
         › Press Enter to trigger a test run."
    );
}

fn main() {
    match run() {
        Ok(true) => {}
        Ok(false) => std::process::exit(1),
        Err(error) => {
            eprintln!("Error: {error:#}");
            std::process::exit(1);
        }
    }
}

fn run() -> Result<bool> {
    let mut cli = Cli::parse();
    ensure!(
        !cli.find_related_tests || !cli.test_path_patterns.is_empty(),
        "The --findRelatedTests option requires file paths to be specified.\n\
         Example usage: jest --findRelatedTests ./src/source.js ./src/index.js."
    );
    let project_dir = std::env::current_dir().context("cannot determine current directory")?;
    let mut config = load_execution_config(&cli, &project_dir)?;
    apply_cli_config_overrides(&mut config, &cli);

    if cli.show_config {
        println!("{}", serde_json::to_string_pretty(&config)?);
        return Ok(true);
    }
    if cli.clear_cache {
        return clear_configured_caches(&config).map(|()| true);
    }

    let seed = cli
        .seed
        .map_or_else(|| Ok(generated_seed()), validate_seed)?;
    let randomize = cli.randomize || config.randomize;
    let show_seed = randomize || cli.show_seed || config.show_seed;

    let changed_selection = changed_selection_enabled(&cli, &config);
    if cli.list_tests {
        let related =
            active_related_test_selection(&cli, &config, &project_dir, changed_selection)?;
        write_changed_selection_message(&cli, related.as_ref());
        return run_test_cycle(
            &cli,
            &config,
            &project_dir,
            seed,
            randomize,
            show_seed,
            false,
            related.as_ref(),
            None,
        );
    }
    if cli.watch_all || cli.watch {
        return run_watch_mode(
            &mut cli,
            &mut config,
            &project_dir,
            seed,
            randomize,
            show_seed,
        );
    }
    let related = active_related_test_selection(&cli, &config, &project_dir, changed_selection)?;
    write_changed_selection_message(&cli, related.as_ref());
    run_test_cycle(
        &cli,
        &config,
        &project_dir,
        seed,
        randomize,
        show_seed,
        false,
        related.as_ref(),
        None,
    )
}

fn run_watch_mode(
    cli: &mut Cli,
    config: &mut ProjectConfig,
    project_dir: &Path,
    seed: i32,
    randomize: bool,
    show_seed: bool,
) -> Result<bool> {
    let options = watch_options(cli, config, project_dir);
    let watcher = NativeWatcher::start(&options)?;
    let mut terminal = WatchTerminal::start()?;
    let mut snapshot_update_once = false;
    loop {
        let related = active_related_test_selection(
            cli,
            config,
            project_dir,
            cli.watch && !cli.find_related_tests,
        )?;
        if !cli.find_related_tests && related.as_ref().is_some_and(|selection| !selection.has_scm) {
            bail!("--watch is not supported without Git; use --watchAll");
        }
        write_changed_selection_message(cli, related.as_ref());
        let action = run_interruptible_watch_cycle(
            cli,
            config,
            project_dir,
            seed,
            randomize,
            show_seed,
            related.as_ref(),
            &watcher,
            terminal.is_some(),
        )?;
        if snapshot_update_once {
            cli.update_snapshot = false;
            snapshot_update_once = false;
        }
        if action.is_none() && terminal.is_some() {
            write_watch_usage();
        }
        let action = match action {
            Some(action) => action,
            None => wait_for_watch_action(&watcher, terminal.is_some())?,
        };
        if !apply_watch_action(
            action,
            cli,
            config,
            terminal.as_mut(),
            &mut snapshot_update_once,
        )? {
            return Ok(true);
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn run_interruptible_watch_cycle(
    cli: &Cli,
    config: &ProjectConfig,
    project_dir: &Path,
    seed: i32,
    randomize: bool,
    show_seed: bool,
    related_selection: Option<&RelatedTestSelection>,
    watcher: &NativeWatcher,
    interactive: bool,
) -> Result<Option<WatchAction>> {
    let cancellation = CancellationToken::new();
    let mut action = None;
    let cycle_result = thread::scope(|scope| -> Result<bool> {
        let run_cancellation = cancellation.clone();
        let handle = scope.spawn(move || {
            run_test_cycle(
                cli,
                config,
                project_dir,
                seed,
                randomize,
                show_seed,
                true,
                related_selection,
                Some(&run_cancellation),
            )
        });
        while !handle.is_finished() {
            if interactive {
                if WatchTerminal::poll_action(Duration::from_millis(10))?.is_some() {
                    cancellation.cancel();
                    // Jest uses actionable keys only to interrupt an active
                    // run. The user must press the key again once the run is
                    // idle to apply its normal action.
                    action = None;
                    break;
                }
            } else {
                thread::sleep(Duration::from_millis(10));
            }
            if watcher.try_wait_for_change()?.is_some() {
                // Jest ignores startRun while a run is active. Remember the
                // change so the completed run is followed by one fresh run,
                // but do not kill the active workers.
                action = Some(WatchAction::FilesChanged);
            }
        }
        handle
            .join()
            .map_err(|_| anyhow!("watch test cycle panicked"))?
    });
    cycle_result?;
    Ok(action)
}

fn wait_for_watch_action(watcher: &NativeWatcher, interactive: bool) -> Result<WatchAction> {
    loop {
        if interactive {
            if let Some(action) = WatchTerminal::poll_action(Duration::from_millis(25))? {
                return Ok(action);
            }
        } else {
            thread::sleep(Duration::from_millis(25));
        }
        if watcher.try_wait_for_change()?.is_some() {
            return Ok(WatchAction::FilesChanged);
        }
    }
}

fn apply_watch_action(
    action: WatchAction,
    cli: &mut Cli,
    config: &mut ProjectConfig,
    terminal: Option<&mut WatchTerminal>,
    snapshot_update_once: &mut bool,
) -> Result<bool> {
    match action {
        WatchAction::Quit => return Ok(false),
        WatchAction::FilesChanged | WatchAction::Rerun => {}
        WatchAction::WatchAll => {
            cli.watch_all = true;
            cli.watch = false;
            cli.test_path_patterns.clear();
            cli.test_name_pattern = None;
            set_only_changed(config, false);
        }
        WatchAction::WatchChanged | WatchAction::ClearFilters => {
            cli.watch = true;
            cli.watch_all = false;
            cli.test_path_patterns.clear();
            cli.test_name_pattern = None;
            set_only_changed(config, true);
        }
        WatchAction::ToggleFailures => {
            let enabled = !config.only_failures;
            cli.only_failures = enabled;
            set_only_failures(config, enabled);
        }
        WatchAction::UpdateSnapshots => {
            cli.update_snapshot = true;
            *snapshot_update_once = true;
        }
        WatchAction::PathPrompt => {
            let input = terminal.context("interactive filename prompt is unavailable")?;
            cli.test_path_patterns = input
                .read_pattern("Pattern › ")?
                .map(PathBuf::from)
                .into_iter()
                .collect();
            cli.watch = true;
            cli.watch_all = false;
            set_only_changed(config, true);
        }
        WatchAction::TestNamePrompt => {
            let input = terminal.context("interactive test-name prompt is unavailable")?;
            cli.test_name_pattern = input.read_pattern("Test name pattern › ")?;
            cli.watch = true;
            cli.watch_all = false;
            set_only_changed(config, true);
        }
    }
    Ok(true)
}

fn set_only_changed(config: &mut ProjectConfig, enabled: bool) {
    config.only_changed = enabled;
    for project in &mut config.projects {
        set_only_changed(project, enabled);
    }
}

fn set_only_failures(config: &mut ProjectConfig, enabled: bool) {
    config.only_failures = enabled;
    for project in &mut config.projects {
        set_only_failures(project, enabled);
    }
}

#[allow(clippy::too_many_arguments)]
fn run_test_cycle(
    cli: &Cli,
    config: &ProjectConfig,
    project_dir: &Path,
    seed: i32,
    randomize: bool,
    show_seed: bool,
    watch_mode: bool,
    related_selection: Option<&RelatedTestSelection>,
    cancellation: Option<&CancellationToken>,
) -> Result<bool> {
    let test_path_patterns = if cli.find_related_tests {
        Vec::new()
    } else {
        normalize_test_path_patterns(&cli.test_path_patterns, project_dir)
    };
    let all_projects = execution_projects(config);
    let selected_projects =
        filter_projects(&all_projects, &cli.select_projects, &cli.ignore_projects);
    write_project_selection_message(cli, &all_projects, &selected_projects);
    let project_runs = selected_projects
        .into_iter()
        .map(|project_config| {
            selected_project_run(
                project_config,
                &all_projects,
                &test_path_patterns,
                related_selection,
            )
        })
        .collect::<Result<Vec<_>>>()?;
    let (project_runs, mut sequencer_session, mut native_sequencer_cache) =
        order_project_runs(project_runs, config, seed, randomize, cli.shard)?;
    if cancellation.is_some_and(CancellationToken::is_cancelled) {
        finish_test_sequencers(&mut sequencer_session, &mut native_sequencer_cache, None)?;
        return Ok(true);
    }
    let test_count = project_runs
        .iter()
        .map(|run| run.tests.len())
        .sum::<usize>();
    let pass_with_no_tests = allows_no_tests(cli, config, watch_mode, related_selection.is_some());
    if cli.list_tests {
        return emit_test_list(
            cli,
            config,
            &project_runs,
            pass_with_no_tests,
            &mut sequencer_session,
            &mut native_sequencer_cache,
        );
    }

    if test_count == 0 {
        return finish_no_test_cycle(
            cli,
            config,
            pass_with_no_tests,
            seed,
            show_seed,
            &mut sequencer_session,
            &mut native_sequencer_cache,
        );
    }

    let (result, collect_coverage, reporter_session, mut global_hook_session) =
        execute_selected_runs(cli, config, project_runs, seed, randomize, cancellation)?;
    if cancellation.is_some_and(CancellationToken::is_cancelled) {
        finish_test_sequencers(&mut sequencer_session, &mut native_sequencer_cache, None)?;
        if let Some(session) = global_hook_session.as_mut() {
            session.finish()?;
        }
        return Ok(true);
    }
    let bail_reached = config.bail != 0 && result.count(TestStatus::Failed) >= config.bail;
    finish_test_sequencers(
        &mut sequencer_session,
        &mut native_sequencer_cache,
        (!bail_reached).then_some(&result),
    )?;
    let reporters_succeeded = reporter_session
        .as_ref()
        .map_or(Ok(true), |session| session.finish(&result))?;
    if let Some(session) = global_hook_session.as_mut() {
        session.finish()?;
    }
    let coverage_report = coverage_report(cli, config, &result, collect_coverage, project_dir)?;
    let base_success = result.is_success()
        && reporters_succeeded
        && coverage_report
            .as_ref()
            .is_none_or(|report| report.threshold_failures.is_empty());
    let empty_environment = BTreeMap::new();
    let processor_environment = global_hook_session
        .as_ref()
        .map_or(&empty_environment, GlobalHookSession::environment);
    let processed_result =
        process_test_results(config, &result, processor_environment, base_success)?;
    let final_success = processed_result
        .as_ref()
        .map_or(base_success, |processed| processed.success);
    if !bail_reached || !cli.json {
        emit_results(
            cli,
            config,
            &result,
            coverage_report.as_ref(),
            processed_result.as_ref().map(|processed| &processed.json),
            seed,
            show_seed,
        )?;
    }
    Ok(final_success)
}

fn allows_no_tests(
    cli: &Cli,
    config: &ProjectConfig,
    watch_mode: bool,
    has_related_selection: bool,
) -> bool {
    watch_mode
        || cli.list_tests
        || (has_related_selection && !cli.find_related_tests)
        || cli.pass_with_no_tests
        || config.pass_with_no_tests
}

fn finish_no_test_cycle(
    cli: &Cli,
    config: &ProjectConfig,
    pass_with_no_tests: bool,
    seed: i32,
    show_seed: bool,
    sequencer_session: &mut Option<CustomTestSequencerSession>,
    native_sequencer_cache: &mut Option<NativeSequencerCache>,
) -> Result<bool> {
    if config.only_failures {
        finish_test_sequencers(sequencer_session, native_sequencer_cache, None)?;
        println!("No failed test found.");
        return finish_empty_run(cli, config, pass_with_no_tests, seed, show_seed);
    }
    if !pass_with_no_tests {
        bail!("No tests found");
    }
    finish_test_sequencers(sequencer_session, native_sequencer_cache, None)?;
    finish_empty_run(cli, config, true, seed, show_seed)
}

fn selected_project_run<'a>(
    project_config: &'a ProjectConfig,
    all_projects: &[&ProjectConfig],
    test_path_patterns: &[PathBuf],
    related_selection: Option<&RelatedTestSelection>,
) -> Result<ProjectRun<'a>> {
    let mut tests = rjest_discovery::discover(project_config, test_path_patterns)?;
    let context_id = all_projects
        .iter()
        .position(|config| std::ptr::eq(*config, project_config))
        .expect("selected project belongs to the execution config");
    let changed_coverage_filter = related_selection.and_then(|selection| {
        selection.coverage_by_context[context_id]
            .as_ref()
            .map(|paths| paths.iter().cloned().collect())
    });
    if let Some(selection) = related_selection {
        tests.retain(|test| selection.tests_by_context[context_id].contains(&test.path));
    }
    Ok(ProjectRun {
        config: project_config,
        tests,
        changed_coverage_filter,
    })
}

fn watch_options(cli: &Cli, config: &ProjectConfig, project_dir: &Path) -> WatchOptions {
    let all_projects = execution_projects(config);
    let selected_projects =
        filter_projects(&all_projects, &cli.select_projects, &cli.ignore_projects);
    let mut roots = Vec::new();
    let mut ignore_patterns = Vec::new();
    let mut ignored_paths = Vec::new();
    for project in selected_projects {
        roots.extend(project.roots.iter().cloned());
        ignore_patterns.extend(project.watch_path_ignore_patterns.iter().cloned());
        ignored_paths.push(project.cache_directory.clone());
        ignored_paths.push(project.coverage_directory.clone());
    }
    if let Some(output_file) = &cli.output_file {
        ignored_paths.push(if output_file.is_absolute() {
            output_file.clone()
        } else {
            project_dir.join(output_file)
        });
    }
    let mut options = WatchOptions::new(roots);
    options.ignore_patterns = ignore_patterns;
    options.ignored_paths = ignored_paths;
    options
}

fn related_test_selection(
    cli: &Cli,
    config: &ProjectConfig,
    project_dir: &Path,
) -> Result<RelatedTestSelection> {
    let all_projects = execution_projects(config);
    let selected_projects =
        filter_projects(&all_projects, &cli.select_projects, &cli.ignore_projects);
    let roots = selected_projects
        .iter()
        .flat_map(|project| project.roots.iter().cloned())
        .collect::<Vec<_>>();
    let changed = git_changed_files_with_options(
        &roots,
        &GitChangeOptions {
            changed_since: cli.changed_since.as_deref(),
            last_commit: cli.last_commit,
            with_ancestor: cli.changed_files_with_ancestor,
        },
    )?;
    let mut tests_by_context = vec![BTreeSet::new(); all_projects.len()];
    let mut coverage_by_context = vec![None; all_projects.len()];
    if changed.repositories.is_empty() || changed.files.is_empty() {
        return Ok(RelatedTestSelection {
            tests_by_context,
            coverage_by_context,
            has_scm: !changed.repositories.is_empty(),
        });
    }
    let resolver_engine_path = internal_node_module_path("unrs-resolver")
        .context("Rjest's internal unrs-resolver package is unavailable")?;
    let test_path_patterns = normalize_test_path_patterns(&cli.test_path_patterns, project_dir);
    for project in selected_projects {
        let context_id = all_projects
            .iter()
            .position(|config| std::ptr::eq(*config, project))
            .expect("selected project belongs to the execution config");
        let tests = rjest_discovery::discover(project, &test_path_patterns)?;
        let project_changes = changed
            .files
            .iter()
            .filter(|path| project.roots.iter().any(|root| path.starts_with(root)))
            .cloned()
            .collect::<BTreeSet<_>>();
        if project_changes.is_empty() {
            continue;
        }
        let graph = DependencyGraph::build(&GraphOptions {
            root_dir: &project.root_dir,
            roots: &project.roots,
            module_file_extensions: &project.module_file_extensions,
            module_path_ignore_patterns: &project.module_path_ignore_patterns,
            module_name_mapper: &project.module_name_mapper,
            module_directories: &project.module_directories,
            module_paths: &project.module_paths,
            resolver: project.resolver.as_deref(),
            resolver_engine_path: &resolver_engine_path,
            haste: &project.haste,
        })?;
        tests_by_context[context_id] = graph.related_tests(&project_changes, &tests);
        coverage_by_context[context_id] = graph.changed_coverage_paths(&project_changes, &tests);
    }
    Ok(RelatedTestSelection {
        tests_by_context,
        coverage_by_context,
        has_scm: true,
    })
}

fn find_related_test_selection(
    cli: &Cli,
    config: &ProjectConfig,
    project_dir: &Path,
) -> Result<RelatedTestSelection> {
    let all_projects = execution_projects(config);
    let selected_projects =
        filter_projects(&all_projects, &cli.select_projects, &cli.ignore_projects);
    let related_paths = cli
        .test_path_patterns
        .iter()
        .map(|path| {
            let absolute = if path.is_absolute() {
                path.clone()
            } else {
                project_dir.join(path)
            };
            absolute.canonicalize().unwrap_or(absolute)
        })
        .collect::<BTreeSet<_>>();
    let mut tests_by_context = vec![BTreeSet::new(); all_projects.len()];
    let mut coverage_by_context = vec![None; all_projects.len()];
    let resolver_engine_path = internal_node_module_path("unrs-resolver")
        .context("Rjest's internal unrs-resolver package is unavailable")?;
    for project in selected_projects {
        let context_id = all_projects
            .iter()
            .position(|config| std::ptr::eq(*config, project))
            .expect("selected project belongs to the execution config");
        let tests = rjest_discovery::discover(project, &[])?;
        let project_paths = related_paths
            .iter()
            .filter(|path| project.roots.iter().any(|root| path.starts_with(root)))
            .cloned()
            .collect::<BTreeSet<_>>();
        if project_paths.is_empty() {
            coverage_by_context[context_id] = Some(BTreeSet::new());
            continue;
        }
        let graph = DependencyGraph::build(&GraphOptions {
            root_dir: &project.root_dir,
            roots: &project.roots,
            module_file_extensions: &project.module_file_extensions,
            module_path_ignore_patterns: &project.module_path_ignore_patterns,
            module_name_mapper: &project.module_name_mapper,
            module_directories: &project.module_directories,
            module_paths: &project.module_paths,
            resolver: project.resolver.as_deref(),
            resolver_engine_path: &resolver_engine_path,
            haste: &project.haste,
        })?;
        tests_by_context[context_id] = graph.related_tests(&project_paths, &tests);
        coverage_by_context[context_id] = Some(project_paths);
    }
    Ok(RelatedTestSelection {
        tests_by_context,
        coverage_by_context,
        has_scm: true,
    })
}

fn active_related_test_selection(
    cli: &Cli,
    config: &ProjectConfig,
    project_dir: &Path,
    changed_selection: bool,
) -> Result<Option<RelatedTestSelection>> {
    if cli.find_related_tests {
        return find_related_test_selection(cli, config, project_dir).map(Some);
    }
    changed_selection
        .then(|| related_test_selection(cli, config, project_dir))
        .transpose()
}

fn changed_selection_enabled(cli: &Cli, config: &ProjectConfig) -> bool {
    if cli.all || cli.watch_all {
        return false;
    }
    if !cli.test_path_patterns.is_empty() && !cli.watch {
        return false;
    }
    cli.watch
        || cli.only_changed
        || cli.last_commit
        || cli.changed_files_with_ancestor
        || cli.changed_since.is_some()
        || config.only_changed
}

fn write_changed_selection_message(cli: &Cli, selection: Option<&RelatedTestSelection>) {
    if cli.find_related_tests {
        return;
    }
    let Some(selection) = selection else {
        return;
    };
    if !selection.has_scm {
        eprintln!(
            "Rjest can only find changed files in a Git repository. Initialize Git or run with --all."
        );
    }
    if selection.tests_by_context.iter().all(BTreeSet::is_empty) {
        let reference = cli
            .changed_since
            .as_ref()
            .map_or_else(|| "last commit".to_string(), |value| format!("\"{value}\""));
        eprintln!("No tests found related to files changed since {reference}.");
    }
}

fn finish_empty_run(
    cli: &Cli,
    config: &ProjectConfig,
    base_success: bool,
    seed: i32,
    show_seed: bool,
) -> Result<bool> {
    let result = AggregatedResult::default();
    let environment = BTreeMap::new();
    let processed_result = process_test_results(config, &result, &environment, base_success)?;
    emit_results(
        cli,
        config,
        &result,
        None,
        processed_result.as_ref().map(|processed| &processed.json),
        seed,
        show_seed,
    )?;
    Ok(processed_result
        .as_ref()
        .map_or(base_success, |processed| processed.success))
}

fn execute_selected_runs(
    cli: &Cli,
    config: &ProjectConfig,
    project_runs: Vec<ProjectRun<'_>>,
    seed: i32,
    randomize: bool,
    cancellation: Option<&CancellationToken>,
) -> Result<(
    AggregatedResult,
    bool,
    Option<CustomReporterSession>,
    Option<GlobalHookSession>,
)> {
    let max_workers = if cli.run_in_band || config.detect_open_handles {
        1
    } else {
        parse_max_workers(cli.max_workers.as_deref().or(config.max_workers.as_deref()))?
    };
    let global_hook_session =
        GlobalHookSession::start(config, cli, &project_runs, max_workers, seed)?;
    let empty_environment = BTreeMap::new();
    let environment = global_hook_session
        .as_ref()
        .map_or(&empty_environment, GlobalHookSession::environment);
    let reporter_session =
        CustomReporterSession::start(config, cli, &project_runs, max_workers, seed, environment)?;
    let execution = ProjectExecutionContext {
        max_workers,
        execution_order: ExecutionOrderConfig { seed, randomize },
        reporter_session: reporter_session.as_ref(),
        environment,
        cancellation,
    };
    let (result, collect_coverage) = execute_project_runs(cli, config, project_runs, &execution)?;
    Ok((
        result,
        collect_coverage,
        reporter_session,
        global_hook_session,
    ))
}

fn apply_cli_config_overrides(config: &mut ProjectConfig, cli: &Cli) {
    if cli.no_bail {
        config.bail = 0;
    } else if cli.bail {
        config.bail = 1;
    }
    if let Some(test_sequencer) = cli.test_sequencer.as_deref() {
        config.test_sequencer = Some(rjest_config::normalize_module_reference(
            test_sequencer,
            &config.root_dir,
        ));
    }
    if let Some(global_setup) = cli.global_setup.as_deref() {
        config.global_setup = Some(rjest_config::normalize_module_reference(
            global_setup,
            &config.root_dir,
        ));
    }
    if let Some(global_teardown) = cli.global_teardown.as_deref() {
        config.global_teardown = Some(rjest_config::normalize_module_reference(
            global_teardown,
            &config.root_dir,
        ));
    }
    if let Some(test_results_processor) = cli.test_results_processor.as_deref() {
        config.test_results_processor = Some(rjest_config::normalize_module_reference(
            test_results_processor,
            &config.root_dir,
        ));
    }
    apply_selection_overrides(config, cli);
    apply_global_execution_overrides(config, cli);
    apply_cache_overrides(config, cli);
}

fn apply_selection_overrides(config: &mut ProjectConfig, cli: &Cli) {
    if cli.all {
        config.only_changed = false;
        config.only_failures = false;
    } else {
        config.only_changed |= cli.only_changed
            || cli.last_commit
            || cli.changed_files_with_ancestor
            || cli.changed_since.is_some();
        config.only_failures |= cli.only_failures;
    }
    for project in &mut config.projects {
        apply_selection_overrides(project, cli);
    }
}

fn apply_global_execution_overrides(config: &mut ProjectConfig, cli: &Cli) {
    if cli.force_exit {
        config.force_exit = true;
    }
    if cli.no_coverage {
        config.collect_coverage = false;
    }
    if cli.no_watchman {
        config.watchman = false;
    }
    for project in &mut config.projects {
        apply_global_execution_overrides(project, cli);
    }
}

fn apply_cache_overrides(config: &mut ProjectConfig, cli: &Cli) {
    if cli.cache {
        config.cache = true;
    } else if cli.no_cache {
        config.cache = false;
    }
    if let Some(directory) = cli.cache_directory.as_deref() {
        config.cache_directory = normalize_cli_cache_directory(directory, &config.root_dir);
    }
    for project in &mut config.projects {
        apply_cache_overrides(project, cli);
    }
}

fn normalize_cli_cache_directory(directory: &str, root_dir: &Path) -> PathBuf {
    if directory == "<rootDir>" {
        return root_dir.to_path_buf();
    }
    if let Some(suffix) = directory.strip_prefix("<rootDir>/") {
        return root_dir.join(suffix);
    }
    let path = Path::new(directory);
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        root_dir.join(path)
    }
}

fn clear_configured_caches(config: &ProjectConfig) -> Result<()> {
    let projects = execution_projects(config);
    let roots = projects
        .iter()
        .map(|project| project.root_dir.as_path())
        .collect::<Vec<_>>();
    let directories = projects
        .iter()
        .map(|project| project.cache_directory.clone())
        .collect::<BTreeSet<_>>();
    let current_dir = std::env::current_dir().context("cannot determine current directory")?;
    let temp_dir = std::env::temp_dir();
    let user_home = std::env::var_os("HOME").map(PathBuf::from);

    for directory in directories {
        ensure!(
            directory.is_absolute()
                && directory.parent().is_some()
                && directory != current_dir
                && directory != temp_dir
                && user_home.as_ref() != Some(&directory)
                && roots.iter().all(|root| *root != directory),
            "refusing to clear unsafe cache directory `{}`",
            directory.display()
        );
        match fs::remove_dir_all(&directory) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(error).with_context(|| {
                    format!("cannot clear cache directory `{}`", directory.display())
                });
            }
        }
        println!("Cleared {}", directory.display());
    }
    Ok(())
}

fn order_project_runs<'a>(
    mut project_runs: Vec<ProjectRun<'a>>,
    config: &ProjectConfig,
    seed: i32,
    randomize: bool,
    shard: Option<Shard>,
) -> Result<(
    Vec<ProjectRun<'a>>,
    Option<CustomTestSequencerSession>,
    Option<NativeSequencerCache>,
)> {
    if config.test_sequencer.is_some() {
        let (sequenced, session) =
            sequence_project_runs_with_custom(project_runs, config, seed, randomize, shard)?;
        return Ok((sequenced, Some(session), None));
    }
    if let Some(shard) = shard {
        shard_project_runs(&mut project_runs, shard);
    }
    let cache = NativeSequencerCache::load(config, &project_runs)?;
    project_runs = sequence_project_runs_with_native(project_runs, &cache, config.only_failures)?;
    Ok((project_runs, None, Some(cache)))
}

fn unique_test_paths(project_runs: &[ProjectRun<'_>], preserve_order: bool) -> Vec<PathBuf> {
    if !preserve_order {
        return project_runs
            .iter()
            .flat_map(|run| &run.tests)
            .map(|test| test.path.clone())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
    }
    let mut unique_paths = BTreeSet::new();
    project_runs
        .iter()
        .flat_map(|run| &run.tests)
        .filter_map(|test| {
            let path = test.path.clone();
            unique_paths.insert(path.clone()).then_some(path)
        })
        .collect()
}

fn emit_test_list(
    cli: &Cli,
    config: &ProjectConfig,
    project_runs: &[ProjectRun<'_>],
    pass_with_no_tests: bool,
    custom: &mut Option<CustomTestSequencerSession>,
    native: &mut Option<NativeSequencerCache>,
) -> Result<bool> {
    let unique_tests = unique_test_paths(project_runs, config.test_sequencer.is_some());
    for path in &unique_tests {
        println!("{}", path.display());
    }
    finish_test_sequencers(custom, native, None)?;
    if unique_tests.is_empty()
        && cli.shard.is_none()
        && !config.only_failures
        && !pass_with_no_tests
    {
        bail!("No tests found");
    }
    Ok(true)
}

fn normalize_test_path_patterns(patterns: &[PathBuf], project_dir: &Path) -> Vec<PathBuf> {
    patterns
        .iter()
        .map(|pattern| {
            let from_cwd = project_dir.join(pattern);
            if pattern.is_absolute() || !from_cwd.exists() {
                pattern.clone()
            } else {
                from_cwd
            }
        })
        .collect()
}

struct ProjectExecutionContext<'a> {
    max_workers: usize,
    execution_order: ExecutionOrderConfig,
    reporter_session: Option<&'a CustomReporterSession>,
    environment: &'a EnvironmentDelta,
    cancellation: Option<&'a CancellationToken>,
}

fn execute_project_runs(
    cli: &Cli,
    global_config: &ProjectConfig,
    project_runs: Vec<ProjectRun<'_>>,
    execution: &ProjectExecutionContext<'_>,
) -> Result<(AggregatedResult, bool)> {
    let started = Instant::now();
    let mut result = AggregatedResult::default();
    let mut collect_coverage = false;
    for run in project_runs.into_iter().filter(|run| !run.tests.is_empty()) {
        if execution
            .cancellation
            .is_some_and(CancellationToken::is_cancelled)
        {
            break;
        }
        let failed = result.count(TestStatus::Failed);
        if global_config.bail != 0 && failed >= global_config.bail {
            break;
        }
        let coverage_settings = coverage_runner_settings(
            cli,
            global_config,
            run.config,
            run.changed_coverage_filter.as_deref(),
        )?;
        collect_coverage |= coverage_settings.enabled;
        let options = runner_options(
            cli,
            &run,
            global_config.bail.saturating_sub(failed),
            execution,
            coverage_settings,
        );
        let context_id = execution_projects(global_config)
            .iter()
            .position(|config| std::ptr::eq(*config, run.config))
            .expect("project run config belongs to the execution config");
        let mut project_result = if let Some(session) = execution.reporter_session {
            rjest_runner::run_with_observer(
                &run.tests,
                &options,
                &ReporterRunObserver {
                    context_id,
                    session,
                },
            )?
        } else {
            rjest_runner::run(&run.tests, &options)?
        };
        let display_name = run
            .config
            .display_name
            .as_ref()
            .map(|display_name| display_name.name.clone());
        for file in &mut project_result.test_results {
            file.project_display_name.clone_from(&display_name);
        }
        result.test_results.append(&mut project_result.test_results);
    }
    result.test_results.sort_by(|left, right| {
        left.test_path
            .cmp(&right.test_path)
            .then_with(|| left.project_display_name.cmp(&right.project_display_name))
    });
    result.duration_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
    result.coverage_map = rjest_runner::merge_coverage_maps(&result.test_results)?;
    Ok((result, collect_coverage))
}

fn runner_options(
    cli: &Cli,
    run: &ProjectRun<'_>,
    bail: usize,
    execution: &ProjectExecutionContext<'_>,
    coverage: CoverageRunnerSettings,
) -> rjest_runner::RunnerOptions {
    rjest_runner::RunnerOptions {
        max_workers: execution.max_workers,
        bail,
        execution_order: execution.execution_order,
        test_name_pattern: cli.test_name_pattern.clone(),
        default_timeout_ms: run.config.test_timeout,
        root_dir: run.config.root_dir.clone(),
        module_file_extensions: run.config.module_file_extensions.clone(),
        extensions_to_treat_as_esm: run.config.extensions_to_treat_as_esm.clone(),
        module_name_mapper: run.config.module_name_mapper.clone(),
        module_directories: run.config.module_directories.clone(),
        module_paths: run.config.module_paths.clone(),
        resolver: run.config.resolver.clone(),
        resolver_engine_path: internal_node_module_path("unrs-resolver"),
        runtime_tool_paths: internal_node_module_paths(&[
            "@babel/core",
            "@babel/generator",
            "@jridgewell/trace-mapping",
            "babel-plugin-istanbul",
            "convert-source-map",
            "pretty-format",
        ]),
        automock: run.config.automock,
        reset_modules: run.config.reset_modules,
        mock_lifecycle: run.config.mock_lifecycle.clone(),
        fake_timers: run.config.fake_timers.clone(),
        globals: run.config.globals.clone(),
        haste: run.config.haste.clone(),
        global_execution: GlobalExecutionConfig {
            detect_open_handles: run.config.detect_open_handles,
            force_exit: run.config.force_exit,
            max_concurrency: run.config.max_concurrency,
            pass_with_no_tests: run.config.pass_with_no_tests,
        },
        test_environment: run.config.test_environment.clone(),
        test_environment_options: run.config.test_environment_options.clone(),
        setup_files: run.config.setup_files.clone(),
        setup_files_after_env: run.config.setup_files_after_env.clone(),
        snapshot_serializers: run.config.snapshot_serializers.clone(),
        snapshot_format: run.config.snapshot_format,
        prettier_path: run.config.prettier_path.clone(),
        transform: run.config.transform.clone(),
        transform_ignore_patterns: run.config.transform_ignore_patterns.clone(),
        collect_coverage: coverage.enabled,
        coverage_path_ignore_patterns: coverage.path_ignore_patterns,
        coverage_filter: coverage.filter,
        coverage_sources: coverage.sources,
        cancellation: execution.cancellation.cloned(),
        environment: execution.environment.clone(),
        snapshot_update: snapshot_update(cli),
        ..rjest_runner::RunnerOptions::default()
    }
}

fn execution_projects(config: &ProjectConfig) -> Vec<&ProjectConfig> {
    if config.projects.is_empty() {
        vec![config]
    } else {
        config.projects.iter().collect()
    }
}

fn filter_projects<'a>(
    projects: &[&'a ProjectConfig],
    selected_names: &[String],
    ignored_names: &[String],
) -> Vec<&'a ProjectConfig> {
    projects
        .iter()
        .copied()
        .filter(|project| {
            let name = project
                .display_name
                .as_ref()
                .map(|display_name| display_name.name.as_str());
            let selected = selected_names.is_empty()
                || name.is_some_and(|name| selected_names.iter().any(|value| value == name));
            let ignored = name.is_some_and(|name| ignored_names.iter().any(|value| value == name));
            selected && !ignored
        })
        .collect()
}

fn write_project_selection_message(
    cli: &Cli,
    projects: &[&ProjectConfig],
    selected: &[&ProjectConfig],
) {
    if cli.select_projects.is_empty() && cli.ignore_projects.is_empty() {
        return;
    }
    let mut message = String::new();
    let unnamed = projects
        .iter()
        .filter(|project| project.display_name.is_none())
        .count();
    if unnamed > 0 {
        let mut args = Vec::new();
        if !cli.select_projects.is_empty() {
            args.push("--selectProjects");
        }
        if !cli.ignore_projects.is_empty() {
            args.push("--ignoreProjects");
        }
        let project_label = if unnamed == 1 {
            "a project does not have a name".to_owned()
        } else {
            format!("{unnamed} projects do not have a name")
        };
        write!(
            message,
            "You provided values for {} but {project_label}.\nSet displayName in the config of all projects in order to disable this warning.\n",
            args.join(" and ")
        )
        .expect("writing to a String cannot fail");
    }
    message.push_str(&project_selection_summary(cli, selected));
    if cli.json {
        eprint!("{message}");
    } else {
        print!("{message}");
    }
}

fn project_selection_summary(cli: &Cli, selected: &[&ProjectConfig]) -> String {
    if selected.is_empty() {
        if !cli.select_projects.is_empty() && !cli.ignore_projects.is_empty() {
            return "You provided values for --selectProjects and --ignoreProjects, but no projects were found matching the selection.\nAre you ignoring all the selected projects?\n".into();
        }
        if !cli.ignore_projects.is_empty() {
            return "You provided values for --ignoreProjects, but no projects were found matching the selection.\nAre you ignoring all projects?\n".into();
        }
        return "You provided values for --selectProjects but no projects were found matching the selection.\n".into();
    }
    if selected.len() == 1 {
        let name = selected[0]
            .display_name
            .as_ref()
            .map_or("<unnamed project>", |display_name| &display_name.name);
        return format!("Running one project: {name}\n");
    }
    let mut names = selected
        .iter()
        .map(|project| {
            project
                .display_name
                .as_ref()
                .map_or("<unnamed project>", |display_name| &display_name.name)
        })
        .collect::<Vec<_>>();
    names.sort_unstable();
    format!(
        "Running {} projects:\n{}\n",
        selected.len(),
        names
            .into_iter()
            .map(|name| format!("- {name}"))
            .collect::<Vec<_>>()
            .join("\n")
    )
}

fn snapshot_update(cli: &Cli) -> SnapshotUpdate {
    if cli.update_snapshot {
        SnapshotUpdate::All
    } else {
        SnapshotUpdate::New
    }
}

#[cfg(test)]
fn shard_tests(
    mut tests: Vec<TestFile>,
    root_dir: &std::path::Path,
    shard: Shard,
) -> Vec<TestFile> {
    tests.sort_by_key(|test| {
        let relative = test.path.strip_prefix(root_dir).unwrap_or(&test.path);
        let normalized = relative.to_string_lossy().replace('\\', "/");
        Sha1::digest(normalized.as_bytes())
    });
    let (start, size) = shard_bounds(tests.len(), shard);
    tests.into_iter().skip(start).take(size).collect()
}

fn shard_bounds(test_count: usize, shard: Shard) -> (usize, usize) {
    let base_size = test_count / shard.count;
    let larger_shards = test_count % shard.count;
    let preceding = shard.index - 1;
    let start = preceding * base_size + preceding.min(larger_shards);
    let size = base_size + usize::from(shard.index <= larger_shards);
    (start, size)
}

fn shard_project_runs(project_runs: &mut [ProjectRun<'_>], shard: Shard) {
    let mut flattened = project_runs
        .iter_mut()
        .enumerate()
        .flat_map(|(project_index, run)| {
            let root_dir = &run.config.root_dir;
            std::mem::take(&mut run.tests).into_iter().map(move |test| {
                let relative = test.path.strip_prefix(root_dir).unwrap_or(&test.path);
                let normalized = relative.to_string_lossy().replace('\\', "/");
                let hash: [u8; 20] = Sha1::digest(normalized.as_bytes()).into();
                (hash, project_index, test)
            })
        })
        .collect::<Vec<_>>();
    flattened.sort_by_key(|(hash, _, _)| *hash);
    let (start, size) = shard_bounds(flattened.len(), shard);
    for (_, project_index, test) in flattened.into_iter().skip(start).take(size) {
        project_runs[project_index].tests.push(test);
    }
}

fn sequence_project_runs_with_custom<'a>(
    project_runs: Vec<ProjectRun<'a>>,
    global_config: &ProjectConfig,
    seed: i32,
    randomize: bool,
    shard: Option<Shard>,
) -> Result<(Vec<ProjectRun<'a>>, CustomTestSequencerSession)> {
    let contexts = project_runs
        .iter()
        .enumerate()
        .map(|(id, run)| {
            serde_json::json!({
                "id": id,
                "rootDir": run.config.root_dir,
                "displayName": run.config.display_name,
                "cache": run.config.cache,
                "cacheDirectory": run.config.cache_directory,
            })
        })
        .collect::<Vec<_>>();
    let units = project_runs
        .into_iter()
        .enumerate()
        .flat_map(|(context_id, run)| {
            let ProjectRun {
                config,
                tests,
                changed_coverage_filter,
            } = run;
            tests
                .into_iter()
                .map(move |test| SequencerUnit {
                    config,
                    test,
                    changed_coverage_filter: changed_coverage_filter.clone(),
                })
                .map(move |unit| (context_id, unit))
        })
        .collect::<Vec<_>>();
    let tests = units
        .iter()
        .enumerate()
        .map(|(id, (context_id, unit))| {
            serde_json::json!({
                "id": id,
                "contextId": context_id,
                "path": unit.test.path,
            })
        })
        .collect::<Vec<_>>();
    let shard = shard.map(|shard| {
        serde_json::json!({
            "shardIndex": shard.index,
            "shardCount": shard.count,
        })
    });
    let test_sequencer = global_config
        .test_sequencer
        .as_deref()
        .context("custom test sequencer path is missing")?;
    let request = serde_json::json!({
        "testSequencer": test_sequencer,
        "resolver": global_config.resolver,
        "rootDir": global_config.root_dir,
        "seed": seed,
        "randomize": randomize,
        "onlyFailures": global_config.only_failures,
        "bail": global_config.bail,
        "shard": shard,
        "contexts": contexts,
        "tests": tests,
    });
    let (session, order) = CustomTestSequencerSession::start(&request)?;
    let mut ordered: Vec<ProjectRun<'a>> = Vec::new();
    for id in order {
        let (_, unit) = units
            .get(id)
            .with_context(|| format!("configured Jest test sequencer returned unknown test {id}"))?
            .clone();
        if let Some(previous) = ordered.last_mut()
            && std::ptr::eq(previous.config, unit.config)
        {
            previous.tests.push(unit.test);
        } else {
            ordered.push(ProjectRun {
                config: unit.config,
                tests: vec![unit.test],
                changed_coverage_filter: unit.changed_coverage_filter,
            });
        }
    }
    Ok((ordered, session))
}

fn sequence_project_runs_with_native<'a>(
    project_runs: Vec<ProjectRun<'a>>,
    cache: &NativeSequencerCache,
    only_failures: bool,
) -> Result<Vec<ProjectRun<'a>>> {
    let mut sequenced = Vec::new();
    for run in project_runs {
        let context_key = native_context_key(run.config)?;
        let changed_coverage_filter = run.changed_coverage_filter;
        for test in run.tests {
            let performance = cache.performance(&context_key, &test.path);
            let file_size = fs::metadata(&test.path).map_or(0, |metadata| metadata.len());
            sequenced.push((
                performance,
                file_size,
                SequencerUnit {
                    config: run.config,
                    test,
                    changed_coverage_filter: changed_coverage_filter.clone(),
                },
            ));
        }
    }

    // Match Jest's default TestSequencer: cached failures first, uncached files
    // before timed files, longer durations first, then larger files when no
    // timing exists. Stable ties retain discovery order.
    sequenced.sort_by(
        |(left_performance, left_size, _), (right_performance, right_size, _)| {
            let left_failed = left_performance.is_some_and(|(failed, _)| failed);
            let right_failed = right_performance.is_some_and(|(failed, _)| failed);
            if left_failed != right_failed {
                return right_failed.cmp(&left_failed);
            }
            match (left_performance, right_performance) {
                (None, Some(_)) => std::cmp::Ordering::Less,
                (Some(_), None) => std::cmp::Ordering::Greater,
                (Some((_, left_duration)), Some((_, right_duration))) => {
                    right_duration.cmp(left_duration)
                }
                (None, None) => right_size.cmp(left_size),
            }
        },
    );
    if only_failures {
        sequenced.retain(|(performance, _, _)| performance.is_some_and(|(failed, _)| failed));
    }

    let mut ordered: Vec<ProjectRun<'a>> = Vec::new();
    for (_, _, unit) in sequenced {
        if let Some(previous) = ordered.last_mut()
            && std::ptr::eq(previous.config, unit.config)
        {
            previous.tests.push(unit.test);
        } else {
            ordered.push(ProjectRun {
                config: unit.config,
                tests: vec![unit.test],
                changed_coverage_filter: unit.changed_coverage_filter,
            });
        }
    }
    Ok(ordered)
}

fn validate_seed(value: i64) -> Result<i32> {
    i32::try_from(value).with_context(|| {
        format!(
            "seed value must be between `-0x80000000` and `0x7fffffff` inclusive - instead it is {value}"
        )
    })
}

fn generated_seed() -> i32 {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_nanos());
    let folded = nanos ^ (nanos >> 32) ^ u128::from(std::process::id());
    let bytes = folded.to_le_bytes();
    i32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
}

fn load_config(project_dir: &std::path::Path, configured: Option<&str>) -> Result<ProjectConfig> {
    match configured {
        Some(value) if value.trim_start().starts_with('{') => {
            Ok(rjest_config::load_inline_json(project_dir, value)?)
        }
        Some(value) => Ok(rjest_config::load(
            project_dir,
            Some(std::path::Path::new(value)),
        )?),
        None => Ok(rjest_config::load(project_dir, None)?),
    }
}

fn load_execution_config(cli: &Cli, project_dir: &Path) -> Result<ProjectConfig> {
    if cli.projects.is_empty() {
        return load_config(project_dir, cli.config.as_deref());
    }
    let selected = rjest_config::load_project_paths(project_dir, &cli.projects)?;
    if cli.config.is_none() {
        return Ok(selected);
    }
    let mut global = load_config(project_dir, cli.config.as_deref())?;
    global.projects = if selected.projects.is_empty() {
        vec![selected]
    } else {
        selected.projects
    };
    Ok(global)
}

fn coverage_runner_settings(
    cli: &Cli,
    global_config: &ProjectConfig,
    project_config: &ProjectConfig,
    changed_filter: Option<&[PathBuf]>,
) -> Result<CoverageRunnerSettings> {
    let enabled = cli.coverage || global_config.collect_coverage;
    let provider = cli
        .coverage_provider
        .as_deref()
        .unwrap_or(&global_config.coverage_provider);
    if enabled && provider != "babel" {
        bail!(
            "coverageProvider `{provider}` is not supported yet; use Jest's default `babel` provider"
        );
    }
    let collect_from = if cli.collect_coverage_from.is_empty() {
        &global_config.collect_coverage_from
    } else {
        &cli.collect_coverage_from
    };
    let path_ignore_patterns = if cli.coverage_path_ignore_patterns.is_empty() {
        project_config.coverage_path_ignore_patterns.clone()
    } else {
        cli.coverage_path_ignore_patterns.clone()
    };
    let configured_filter = if enabled && !collect_from.is_empty() {
        let mut excluded_paths = rjest_discovery::discover(project_config, &[])?
            .into_iter()
            .map(|test| test.path)
            .collect::<Vec<_>>();
        excluded_paths.extend(project_config.setup_files.iter().cloned());
        excluded_paths.extend(project_config.setup_files_after_env.iter().cloned());
        let project_roots = project_config
            .roots
            .iter()
            .map(|root| root.canonicalize().unwrap_or_else(|_| root.clone()))
            .collect::<Vec<_>>();
        let mut sources = discover_sources(
            &global_config.root_dir,
            collect_from,
            &path_ignore_patterns,
            &excluded_paths,
        )?;
        sources.retain(|source| project_roots.iter().any(|root| source.starts_with(root)));
        Some(sources.into_iter().collect::<BTreeSet<_>>())
    } else {
        None
    };
    let test_paths = if enabled && changed_filter.is_some() {
        rjest_discovery::discover(project_config, &[])?
            .into_iter()
            .map(|test| test.path)
            .collect::<BTreeSet<_>>()
    } else {
        BTreeSet::new()
    };
    let changed_filter = if enabled {
        changed_filter.map(|paths| {
            paths
                .iter()
                .filter(|path| !test_paths.contains(*path))
                .cloned()
                .collect::<BTreeSet<_>>()
        })
    } else {
        None
    };
    let (filter, sources) = match (configured_filter, changed_filter) {
        (Some(configured), Some(changed)) => {
            let selected = configured
                .intersection(&changed)
                .cloned()
                .collect::<Vec<_>>();
            (Some(selected.clone()), selected)
        }
        (Some(configured), None) => {
            let selected = configured.into_iter().collect::<Vec<_>>();
            (Some(selected.clone()), selected)
        }
        (None, Some(changed)) => {
            let selected = changed.into_iter().collect::<Vec<_>>();
            let sources = if cli.find_related_tests {
                selected.clone()
            } else {
                Vec::new()
            };
            (Some(selected), sources)
        }
        (None, None) => (None, Vec::new()),
    };
    Ok(CoverageRunnerSettings {
        enabled,
        path_ignore_patterns,
        filter,
        sources,
    })
}

fn coverage_report(
    cli: &Cli,
    config: &ProjectConfig,
    result: &AggregatedResult,
    enabled: bool,
    threshold_base_dir: &Path,
) -> Result<Option<CoverageReport>> {
    if !enabled {
        return Ok(None);
    }
    let coverage_directory = cli.coverage_directory.as_ref().map_or_else(
        || config.coverage_directory.clone(),
        |path| {
            if path.is_absolute() {
                path.clone()
            } else {
                config.root_dir.join(path)
            }
        },
    );
    let reporters = if cli.coverage_reporters.is_empty() {
        config.coverage_reporters.clone()
    } else {
        cli.coverage_reporters
            .iter()
            .cloned()
            .map(serde_json::Value::String)
            .collect()
    };
    let thresholds = cli.coverage_threshold.as_ref().map_or_else(
        || Ok(config.coverage_threshold.clone()),
        |value| {
            serde_json::from_str(value)
                .with_context(|| format!("invalid coverageThreshold JSON `{value}`"))
        },
    )?;
    Ok(Some(write_reports(
        &result.coverage_map,
        &CoverageOptions {
            root_dir: config.root_dir.clone(),
            threshold_base_dir: threshold_base_dir.to_path_buf(),
            coverage_directory,
            reporters,
            thresholds,
            branches_true_unknown: uses_modern_branches_true_summary(&config.root_dir),
        },
    )?))
}

fn uses_modern_branches_true_summary(root_dir: &std::path::Path) -> bool {
    let package = root_dir.join("node_modules/jest/package.json");
    let Ok(source) = std::fs::read_to_string(package) else {
        return true;
    };
    let Ok(package) = serde_json::from_str::<serde_json::Value>(&source) else {
        return true;
    };
    package["version"]
        .as_str()
        .and_then(|version| version.split('.').next())
        .and_then(|major| major.parse::<u64>().ok())
        .is_none_or(|major| major >= 30)
}

fn emit_results(
    cli: &Cli,
    config: &ProjectConfig,
    result: &AggregatedResult,
    coverage_report: Option<&CoverageReport>,
    processed_result: Option<&serde_json::Value>,
    seed: i32,
    show_seed: bool,
) -> Result<()> {
    let serialized =
        processed_result.map_or_else(|| serde_json::to_string(result), serde_json::to_string)?;
    if let Some(ref output_file) = cli.output_file {
        std::fs::write(output_file, &serialized)
            .with_context(|| format!("cannot write JSON result to `{}`", output_file.display()))?;
    }
    if let Some(coverage_report) = coverage_report {
        for output in &coverage_report.terminal_output {
            if cli.json && cli.output_file.is_none() {
                eprintln!("{output}");
            } else {
                println!("{output}");
            }
        }
        for failure in &coverage_report.threshold_failures {
            eprintln!("{failure}");
        }
    }
    if cli.json && cli.output_file.is_none() {
        println!("{serialized}");
    } else if let Some(summary_only) = match native_reporter_mode(config) {
        NativeReporterMode::None => None,
        NativeReporterMode::Default => Some(false),
        NativeReporterMode::Summary => Some(true),
    } {
        report(
            result,
            &config.root_dir,
            &ReportSettings {
                silent: cli.silent || config.silent,
                verbose: cli.verbose || config.verbose,
                log_heap_usage: cli.log_heap_usage,
                summary_only,
                show_seed,
                seed,
            },
        );
    }
    Ok(())
}

fn native_reporter_mode(config: &ProjectConfig) -> NativeReporterMode {
    let Some(reporters) = config.reporters.as_ref() else {
        return NativeReporterMode::Default;
    };
    if reporters
        .iter()
        .any(|(reporter, _)| matches!(reporter.as_str(), "agent" | "default"))
    {
        NativeReporterMode::Default
    } else if reporters.iter().any(|(reporter, _)| reporter == "summary") {
        NativeReporterMode::Summary
    } else {
        NativeReporterMode::None
    }
}

fn parse_max_workers(value: Option<&str>) -> Result<usize> {
    let parallelism = std::thread::available_parallelism().map_or(1, usize::from);
    let Some(value) = value else {
        return Ok(parallelism.div_ceil(2).max(1));
    };
    if let Some(percent) = value.strip_suffix('%') {
        let percent = percent
            .parse::<usize>()
            .with_context(|| format!("invalid maxWorkers percentage `{value}`"))?;
        ensure!(
            percent > 0 && percent <= 100,
            "maxWorkers percentage must be between 1% and 100%"
        );
        return Ok((parallelism * percent).div_ceil(100).max(1));
    }
    let workers = value
        .parse::<usize>()
        .with_context(|| format!("invalid maxWorkers value `{value}`"))?;
    ensure!(workers > 0, "maxWorkers must be at least one");
    Ok(workers)
}

fn internal_node_module_path(package: &str) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(node_modules) = std::env::var_os("RJEST_INTERNAL_NODE_MODULES") {
        candidates.push(PathBuf::from(node_modules).join(package));
    }
    if let Ok(executable) = std::env::current_exe() {
        for ancestor in executable.ancestors() {
            candidates.push(ancestor.join("node_modules").join(package));
        }
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .join("node_modules")
            .join(package),
    );
    candidates
        .into_iter()
        .find(|candidate| candidate.join("package.json").is_file())
        .and_then(|candidate| candidate.canonicalize().ok())
}

fn internal_node_module_paths(packages: &[&str]) -> BTreeMap<String, PathBuf> {
    packages
        .iter()
        .filter_map(|package| {
            internal_node_module_path(package).map(|path| ((*package).to_owned(), path))
        })
        .collect()
}

fn report(result: &AggregatedResult, root_dir: &std::path::Path, settings: &ReportSettings) {
    for file in result
        .test_results
        .iter()
        .filter(|_| !settings.summary_only)
    {
        let display_path = file
            .test_path
            .strip_prefix(root_dir)
            .unwrap_or(&file.test_path);
        let label = if file.is_success() { "PASS" } else { "FAIL" };
        let project_label = file
            .project_display_name
            .as_deref()
            .map_or_else(String::new, |name| format!("{name} "));
        let heap_usage = if settings.log_heap_usage {
            file.heap_used_bytes
                .map(|bytes| format!(" ({} MB heap size)", bytes / (1024 * 1024)))
                .unwrap_or_default()
        } else {
            String::new()
        };
        println!(
            "{label} {project_label}{} ({} ms){heap_usage}",
            display_path.display(),
            file.duration_ms
        );
        if !settings.silent {
            for entry in &file.console {
                println!("  Console {}: {}", entry.level, entry.message);
            }
        }
        for test in &file.tests {
            if !test.retry_reasons.is_empty() {
                println!("  RETRY ERRORS  {}", test.full_name);
                for (index, reason) in test.retry_reasons.iter().enumerate() {
                    println!("\n  RETRY {}\n\n{}\n", index + 1, indent(reason, 4));
                }
            }
            if settings.verbose || test.status == TestStatus::Failed {
                let marker = match test.status {
                    TestStatus::Passed => "✓",
                    TestStatus::Failed => "✕",
                    TestStatus::Skipped => "○",
                    TestStatus::Todo => "✎",
                };
                println!("  {marker} {} ({} ms)", test.full_name, test.duration_ms);
            }
            if let Some(message) = &test.failure_message {
                println!("\n{}\n", indent(message, 4));
            }
        }
        for error in &file.errors {
            println!("\n{}\n", indent(error, 2));
        }
    }

    let passed_suites = result
        .test_results
        .iter()
        .filter(|file| file.is_success())
        .count();
    let failed_suites = result.test_results.len() - passed_suites;
    println!(
        "Test Suites: {failed_suites} failed, {passed_suites} passed, {} total",
        result.test_results.len()
    );
    println!(
        "Tests:       {} failed, {} skipped, {} todo, {} passed, {} total",
        result.count(TestStatus::Failed),
        result.count(TestStatus::Skipped),
        result.count(TestStatus::Todo),
        result.count(TestStatus::Passed),
        result.total_tests()
    );
    let snapshot_added = snapshot_sum(result, |snapshot| snapshot.added);
    let snapshot_matched = snapshot_sum(result, |snapshot| snapshot.matched);
    let snapshot_unmatched = snapshot_sum(result, |snapshot| snapshot.unmatched);
    let snapshot_updated = snapshot_sum(result, |snapshot| snapshot.updated);
    let snapshot_removed = snapshot_sum(result, |snapshot| snapshot.removed);
    let snapshot_total = snapshot_added + snapshot_matched + snapshot_unmatched + snapshot_updated;
    if snapshot_total > 0 || snapshot_removed > 0 {
        println!(
            "Snapshots:   {snapshot_unmatched} failed, {snapshot_updated} updated, {snapshot_added} written, {snapshot_removed} removed, {snapshot_matched} passed, {snapshot_total} total"
        );
    }
    println!(
        "Time:        {}.{:03} s",
        result.duration_ms / 1_000,
        result.duration_ms % 1_000
    );
    if settings.show_seed {
        println!("Seed:        {}", settings.seed);
    }
}

fn snapshot_sum(
    result: &AggregatedResult,
    select: impl Fn(&rjest_core::SnapshotResult) -> usize,
) -> usize {
    result
        .test_results
        .iter()
        .map(|file| select(&file.snapshot))
        .sum()
}

fn indent(value: &str, spaces: usize) -> String {
    let prefix = " ".repeat(spaces);
    value
        .lines()
        .map(|line| format!("{prefix}{line}"))
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use std::{fs, path::PathBuf};

    use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
    use tempfile::tempdir;

    use clap::Parser;

    use rjest_config::{ProjectConfig, ProjectDisplayName};
    use rjest_core::{
        AggregatedResult, SnapshotResult, TestCaseResult, TestFile, TestFileResult, TestStatus,
        WORKER_PROTOCOL_VERSION,
    };

    use super::{
        Cli, NativeReporterMode, NativeSequencerCache, ProjectRun, Shard, WatchAction,
        apply_watch_action, changed_selection_enabled, clear_configured_caches,
        coverage_runner_settings, filter_projects, native_context_key, native_reporter_mode,
        parse_max_workers, sequence_project_runs_with_native, shard_tests,
        uses_modern_branches_true_summary, validate_seed, watch_action_for_key, watch_options,
    };

    #[test]
    fn accepts_jest_worker_and_heap_usage_flags() {
        let cli = Cli::try_parse_from(["rjest", "-w", "1", "--logHeapUsage"])
            .expect("Jest-compatible flags");
        assert_eq!(cli.max_workers.as_deref(), Some("1"));
        assert!(cli.log_heap_usage);
    }

    #[test]
    fn accepts_jest_watch_flags_and_rejects_conflicting_modes() {
        let watch_all =
            Cli::try_parse_from(["rjest", "--watchAll", "--no-watchman"]).expect("watchAll flags");
        assert!(watch_all.watch_all);
        assert!(watch_all.no_watchman);

        let watch = Cli::try_parse_from(["rjest", "--watch"]).expect("watch flag");
        assert!(watch.watch);
        assert!(Cli::try_parse_from(["rjest", "--watch", "--watchAll"]).is_err());
    }

    #[test]
    fn maps_and_applies_core_jest_watch_keys() {
        let key = |code, modifiers| KeyEvent::new(code, modifiers);
        assert_eq!(
            watch_action_for_key(key(KeyCode::Char('q'), KeyModifiers::NONE)),
            Some(WatchAction::Quit)
        );
        assert_eq!(
            watch_action_for_key(key(KeyCode::Char('c'), KeyModifiers::CONTROL)),
            Some(WatchAction::Quit)
        );
        assert_eq!(
            watch_action_for_key(key(KeyCode::Enter, KeyModifiers::NONE)),
            Some(WatchAction::Rerun)
        );
        assert_eq!(
            watch_action_for_key(key(KeyCode::Char('a'), KeyModifiers::NONE)),
            Some(WatchAction::WatchAll)
        );

        let mut cli = Cli::try_parse_from([
            "rjest",
            "--watchAll",
            "selected.test.js",
            "--testNamePattern=selected",
        ])
        .expect("watchAll CLI");
        let mut config = ProjectConfig::defaults(PathBuf::from(".").as_path()).expect("config");
        let mut update_once = false;
        assert!(
            apply_watch_action(
                WatchAction::WatchChanged,
                &mut cli,
                &mut config,
                None,
                &mut update_once,
            )
            .expect("watch changed action")
        );
        assert!(cli.watch);
        assert!(!cli.watch_all);
        assert!(cli.test_path_patterns.is_empty());
        assert!(cli.test_name_pattern.is_none());
        assert!(config.only_changed);

        apply_watch_action(
            WatchAction::ToggleFailures,
            &mut cli,
            &mut config,
            None,
            &mut update_once,
        )
        .expect("toggle failures");
        assert!(config.only_failures);
        apply_watch_action(
            WatchAction::WatchAll,
            &mut cli,
            &mut config,
            None,
            &mut update_once,
        )
        .expect("watch all action");
        assert!(cli.watch_all);
        assert!(!config.only_changed);
    }

    #[test]
    fn accepts_jest_changed_selection_flags_and_precedence() {
        let only_changed = Cli::try_parse_from(["rjest", "-o"]).expect("onlyChanged alias");
        assert!(only_changed.only_changed);

        let ranges = Cli::try_parse_from([
            "rjest",
            "--changedSince=main",
            "--changedFilesWithAncestor",
            "--lastCommit",
        ])
        .expect("changed range flags");
        assert_eq!(ranges.changed_since.as_deref(), Some("main"));
        assert!(ranges.changed_files_with_ancestor);
        assert!(ranges.last_commit);

        let all = Cli::try_parse_from(["rjest", "--all"]).expect("all flag");
        let mut config = ProjectConfig::defaults(PathBuf::from(".").as_path()).expect("config");
        config.only_changed = true;
        assert!(!changed_selection_enabled(&all, &config));

        let positional =
            Cli::try_parse_from(["rjest", "some.test.js"]).expect("positional test path");
        assert!(!changed_selection_enabled(&positional, &config));
        assert!(Cli::try_parse_from(["rjest", "--lastCommit", "--watchAll"]).is_err());

        let related = Cli::try_parse_from(["rjest", "--findRelatedTests", "src/source.js"])
            .expect("findRelatedTests flag");
        assert!(related.find_related_tests);
        assert_eq!(related.test_path_patterns, [PathBuf::from("src/source.js")]);
    }

    #[test]
    fn builds_watch_options_from_selected_project_outputs_and_patterns() {
        let temp = tempdir().expect("temp dir");
        let mut config = ProjectConfig::defaults(temp.path()).expect("config");
        config.watch_path_ignore_patterns = vec!["generated\\.json$".into()];
        config.cache_directory = temp.path().join(".cache");
        config.coverage_directory = temp.path().join("coverage-custom");
        let cli = Cli::try_parse_from(["rjest", "--watchAll", "--outputFile=results.json"])
            .expect("watch arguments");

        let options = watch_options(&cli, &config, temp.path());
        assert_eq!(options.roots, [temp.path().to_path_buf()]);
        assert_eq!(options.ignore_patterns, ["generated\\.json$"]);
        assert_eq!(
            options.ignored_paths,
            [
                temp.path().join(".cache"),
                temp.path().join("coverage-custom"),
                temp.path().join("results.json"),
            ]
        );
    }

    #[test]
    fn accepts_jest_force_exit_and_coverage_negation() {
        let cli = Cli::try_parse_from(["rjest", "--forceExit", "--no-coverage"])
            .expect("Jest runtime override flags");
        assert!(cli.force_exit);
        assert!(cli.no_coverage);
        assert!(Cli::try_parse_from(["rjest", "--coverage", "--no-coverage"]).is_err());

        let temp = tempdir().expect("temp dir");
        let mut config = ProjectConfig::defaults(temp.path()).expect("config");
        config.collect_coverage = true;
        let mut project = ProjectConfig::defaults(temp.path()).expect("project config");
        project.collect_coverage = true;
        config.projects.push(project);

        super::apply_global_execution_overrides(&mut config, &cli);
        assert!(config.force_exit);
        assert!(!config.collect_coverage);
        assert!(config.projects[0].force_exit);
        assert!(!config.projects[0].collect_coverage);

        let cli =
            Cli::try_parse_from(["rjest", "--no-watchman"]).expect("native watch backend flag");
        super::apply_global_execution_overrides(&mut config, &cli);
        assert!(!config.watchman);
        assert!(!config.projects[0].watchman);
    }

    #[test]
    fn accepts_variadic_jest_project_paths() {
        let cli = Cli::try_parse_from([
            "rjest",
            "--projects",
            "packages/alpha",
            "packages/beta/jest.config.cjs",
            "--runInBand",
        ])
        .expect("Jest project paths");

        assert_eq!(
            cli.projects,
            [
                PathBuf::from("packages/alpha"),
                PathBuf::from("packages/beta/jest.config.cjs")
            ]
        );
        assert!(cli.run_in_band);
    }

    #[test]
    fn accepts_a_jest_test_sequencer_override() {
        let cli = Cli::try_parse_from([
            "rjest",
            "--testSequencer=./tools/sequencer.cjs",
            "--runInBand",
        ])
        .expect("Jest test sequencer override");

        assert_eq!(cli.test_sequencer.as_deref(), Some("./tools/sequencer.cjs"));
        assert!(cli.run_in_band);
    }

    #[test]
    fn accepts_jest_global_hook_overrides() {
        let cli = Cli::try_parse_from([
            "rjest",
            "--globalSetup=./tools/setup.cjs",
            "--globalTeardown=fixture-teardown",
        ])
        .expect("Jest global hook overrides");

        assert_eq!(cli.global_setup.as_deref(), Some("./tools/setup.cjs"));
        assert_eq!(cli.global_teardown.as_deref(), Some("fixture-teardown"));
    }

    #[test]
    fn accepts_a_jest_test_results_processor_override() {
        let cli = Cli::try_parse_from([
            "rjest",
            "--testResultsProcessor=./tools/results.mjs",
            "--runInBand",
        ])
        .expect("Jest test results processor override");

        assert_eq!(
            cli.test_results_processor.as_deref(),
            Some("./tools/results.mjs")
        );
        assert!(cli.run_in_band);
    }

    #[test]
    fn selects_native_output_from_the_configured_builtin_reporters() {
        let temp = tempdir().expect("temp dir");
        let mut config = ProjectConfig::defaults(temp.path()).expect("config");
        assert_eq!(native_reporter_mode(&config), NativeReporterMode::Default);

        config.reporters = Some(vec![("./custom.cjs".into(), serde_json::json!({}))]);
        assert_eq!(native_reporter_mode(&config), NativeReporterMode::None);

        config.reporters = Some(vec![("summary".into(), serde_json::json!({}))]);
        assert_eq!(native_reporter_mode(&config), NativeReporterMode::Summary);

        config.reporters = Some(vec![
            ("summary".into(), serde_json::json!({})),
            ("default".into(), serde_json::json!({})),
        ]);
        assert_eq!(native_reporter_mode(&config), NativeReporterMode::Default);
    }

    #[test]
    fn accepts_jest_only_failures_flags() {
        let long = Cli::try_parse_from(["rjest", "--onlyFailures"]).expect("long flag");
        assert!(long.only_failures);

        let short = Cli::try_parse_from(["rjest", "-f"]).expect("short flag");
        assert!(short.only_failures);
    }

    #[test]
    fn accepts_jest_cache_control_flags() {
        let enabled = Cli::try_parse_from([
            "rjest",
            "--cache",
            "--cacheDirectory=.cache",
            "--clearCache",
        ])
        .expect("enabled cache flags");
        assert!(enabled.cache);
        assert_eq!(enabled.cache_directory.as_deref(), Some(".cache"));
        assert!(enabled.clear_cache);

        let disabled = Cli::try_parse_from(["rjest", "--no-cache"]).expect("disabled cache");
        assert!(disabled.no_cache);
        assert!(Cli::try_parse_from(["rjest", "--cache", "--no-cache"]).is_err());
    }

    #[test]
    fn clears_only_a_safe_configured_cache_directory() {
        let temp = tempdir().expect("temp dir");
        let mut config = ProjectConfig::defaults(temp.path()).expect("config");
        config.cache_directory = temp.path().join(".cache");
        fs::create_dir_all(config.cache_directory.join("nested")).expect("cache directory");
        fs::write(config.cache_directory.join("nested/entry"), "cached").expect("cache entry");

        clear_configured_caches(&config).expect("clear cache");
        assert!(!config.cache_directory.exists());

        config.cache_directory.clone_from(&config.root_dir);
        let error = clear_configured_caches(&config).expect_err("unsafe project-root cache");
        assert!(error.to_string().contains("refusing to clear unsafe"));
        assert!(config.root_dir.exists());
    }

    #[test]
    fn accepts_variadic_project_name_filters() {
        let cli = Cli::try_parse_from([
            "rjest",
            "--selectProjects",
            "alpha",
            "beta",
            "--ignoreProjects",
            "beta",
            "--runInBand",
        ])
        .expect("Jest project name filters");

        assert_eq!(cli.select_projects, ["alpha", "beta"]);
        assert_eq!(cli.ignore_projects, ["beta"]);
        assert!(cli.run_in_band);
    }

    #[test]
    fn filters_named_and_unnamed_projects_like_jest() {
        let temp = tempdir().expect("temp dir");
        let mut named = ProjectConfig::defaults(temp.path()).expect("named config");
        named.display_name = Some(ProjectDisplayName {
            name: "alpha".into(),
            color: "white".into(),
        });
        let unnamed = ProjectConfig::defaults(temp.path()).expect("unnamed config");
        let projects = [&named, &unnamed];

        assert_eq!(filter_projects(&projects, &["alpha".into()], &[]), [&named]);
        assert_eq!(
            filter_projects(&projects, &[], &["alpha".into()]),
            [&unnamed]
        );
    }

    #[test]
    fn accepts_boolean_bail_flags_without_consuming_test_patterns() {
        let cli = Cli::try_parse_from(["rjest", "--bail", "src/example.test.js"])
            .expect("long bail flag");
        assert!(cli.bail);
        assert!(!cli.no_bail);
        assert_eq!(
            cli.test_path_patterns,
            [PathBuf::from("src/example.test.js")]
        );

        let cli = Cli::try_parse_from(["rjest", "-b"]).expect("short bail flag");
        assert!(cli.bail);

        let cli = Cli::try_parse_from(["rjest", "--no-bail"]).expect("negative bail flag");
        assert!(cli.no_bail);
    }

    #[test]
    fn parses_numeric_worker_count() {
        assert_eq!(parse_max_workers(Some("3")).expect("workers"), 3);
        assert!(parse_max_workers(Some("0")).is_err());
    }

    #[test]
    fn parses_percentage_worker_count() {
        assert!(parse_max_workers(Some("50%")).expect("workers") >= 1);
        assert!(parse_max_workers(Some("101%")).is_err());
    }

    #[test]
    fn accepts_and_validates_jest_seed_flags() {
        let cli = Cli::try_parse_from(["rjest", "--seed=-2147483648", "--showSeed"])
            .expect("Jest seed flags");
        assert_eq!(cli.seed, Some(i64::from(i32::MIN)));
        assert!(cli.show_seed);
        assert_eq!(
            validate_seed(i64::from(i32::MIN)).expect("minimum"),
            i32::MIN
        );
        assert_eq!(
            validate_seed(i64::from(i32::MAX)).expect("maximum"),
            i32::MAX
        );
        assert!(validate_seed(i64::from(i32::MIN) - 1).is_err());
        assert!(validate_seed(i64::from(i32::MAX) + 1).is_err());
    }

    #[test]
    fn parses_and_rejects_jest_shard_pairs() {
        assert_eq!(
            "1/2".parse::<Shard>().expect("valid shard"),
            Shard { index: 1, count: 2 }
        );
        for invalid in ["mumble", "1/2/3", "1.0/1", "a/1", "1/a", "1/-1"] {
            assert!(invalid.parse::<Shard>().is_err(), "accepted {invalid}");
        }
        assert!("0/1".parse::<Shard>().is_err());
        assert!("2/1".parse::<Shard>().is_err());
    }

    #[test]
    fn shards_by_the_sha1_of_the_relative_posix_path() {
        let temp = tempdir().expect("temp dir");
        let root = temp.path().canonicalize().expect("canonical root");
        let files = [
            "alpha.test.cjs",
            "bravo.test.cjs",
            "charlie.test.cjs",
            "delta.test.cjs",
        ]
        .map(|name| {
            let path = root.join(name);
            fs::write(&path, "").expect("write shard candidate");
            TestFile { path }
        });
        let selected = shard_tests(files.into(), &root, Shard { index: 1, count: 2 });
        let names = selected
            .iter()
            .map(|test| test.path.file_name().expect("file name").to_string_lossy())
            .collect::<Vec<_>>();
        assert_eq!(names, ["delta.test.cjs", "bravo.test.cjs"]);

        let files = [
            "alpha.test.cjs",
            "bravo.test.cjs",
            "charlie.test.cjs",
            "delta.test.cjs",
        ]
        .map(|name| TestFile {
            path: root.join(name),
        });
        let selected = shard_tests(files.into(), &root, Shard { index: 2, count: 2 });
        let names = selected
            .iter()
            .map(|test| test.path.file_name().expect("file name").to_string_lossy())
            .collect::<Vec<_>>();
        assert_eq!(names, ["alpha.test.cjs", "charlie.test.cjs"]);

        let files = [
            "alpha.test.cjs",
            "bravo.test.cjs",
            "charlie.test.cjs",
            "delta.test.cjs",
        ]
        .map(|name| TestFile {
            path: root.join(name),
        });
        assert!(shard_tests(files.into(), &root, Shard { index: 5, count: 5 }).is_empty());
    }

    #[test]
    fn sequences_default_runs_across_project_roots_by_uncached_file_size() {
        let temp = tempdir().expect("temp dir");
        let alpha_root = temp.path().join("alpha");
        let beta_root = temp.path().join("beta");
        fs::create_dir_all(&alpha_root).expect("alpha root");
        fs::create_dir_all(&beta_root).expect("beta root");
        let alpha_path = alpha_root.join("alpha.test.cjs");
        let beta_path = beta_root.join("beta.test.cjs");
        fs::write(&alpha_path, "test('alpha', () => {});").expect("alpha test");
        fs::write(&beta_path, "x".repeat(4_096)).expect("beta test");
        let alpha = ProjectConfig::defaults(&alpha_root).expect("alpha config");
        let beta = ProjectConfig::defaults(&beta_root).expect("beta config");

        let project_runs = vec![
            ProjectRun {
                config: &alpha,
                tests: vec![TestFile {
                    path: alpha_path.clone(),
                }],
                changed_coverage_filter: None,
            },
            ProjectRun {
                config: &beta,
                tests: vec![TestFile {
                    path: beta_path.clone(),
                }],
                changed_coverage_filter: None,
            },
        ];
        let cache = NativeSequencerCache::load(&alpha, &project_runs).expect("sequencer cache");
        let ordered = sequence_project_runs_with_native(project_runs, &cache, false)
            .expect("native sequence");

        assert_eq!(ordered.len(), 2);
        assert_eq!(ordered[0].config.root_dir, beta.root_dir);
        assert_eq!(
            ordered[0].tests[0]
                .path
                .file_name()
                .expect("beta file name"),
            "beta.test.cjs"
        );
        assert_eq!(ordered[1].config.root_dir, alpha.root_dir);
    }

    #[test]
    fn sequences_cached_failures_then_uncached_and_slow_files() {
        let temp = tempdir().expect("temp dir");
        let names = [
            "failed.test.cjs",
            "uncached.test.cjs",
            "slow.test.cjs",
            "fast.test.cjs",
        ];
        for name in names {
            fs::write(
                temp.path().join(name),
                format!("test('{name}', () => {{}});"),
            )
            .expect("test source");
        }
        let config = ProjectConfig::defaults(temp.path()).expect("config");
        let project_runs = vec![ProjectRun {
            config: &config,
            tests: names
                .into_iter()
                .map(|name| TestFile {
                    path: temp.path().join(name),
                })
                .collect(),
            changed_coverage_filter: None,
        }];
        let mut cache =
            NativeSequencerCache::load(&config, &project_runs).expect("sequencer cache");
        let context_key = native_context_key(&config).expect("context key");
        let entries = cache.entries.entry(context_key).or_default();
        entries.insert(
            temp.path()
                .join("failed.test.cjs")
                .to_string_lossy()
                .into_owned(),
            (true, 1),
        );
        entries.insert(
            temp.path()
                .join("slow.test.cjs")
                .to_string_lossy()
                .into_owned(),
            (false, 50),
        );
        entries.insert(
            temp.path()
                .join("fast.test.cjs")
                .to_string_lossy()
                .into_owned(),
            (false, 5),
        );

        let ordered = sequence_project_runs_with_native(project_runs, &cache, false)
            .expect("native sequence");
        let ordered_names = ordered
            .iter()
            .flat_map(|run| &run.tests)
            .map(|test| {
                test.path
                    .file_name()
                    .expect("test file name")
                    .to_string_lossy()
                    .into_owned()
            })
            .collect::<Vec<_>>();

        assert_eq!(
            ordered_names,
            [
                "failed.test.cjs",
                "uncached.test.cjs",
                "slow.test.cjs",
                "fast.test.cjs",
            ]
        );
    }

    #[test]
    fn native_only_failures_selects_cached_failed_files() {
        let temp = tempdir().expect("temp dir");
        let passing_path = temp.path().join("passing.test.cjs");
        let failing_path = temp.path().join("failing.test.cjs");
        fs::write(&passing_path, "test('passing', () => {});").expect("passing test");
        fs::write(&failing_path, "test('failing', () => {});").expect("failing test");
        let config = ProjectConfig::defaults(temp.path()).expect("config");
        let project_runs = vec![ProjectRun {
            config: &config,
            tests: vec![
                TestFile { path: passing_path },
                TestFile {
                    path: failing_path.clone(),
                },
            ],
            changed_coverage_filter: None,
        }];
        let mut cache =
            NativeSequencerCache::load(&config, &project_runs).expect("sequencer cache");
        let context_key = native_context_key(&config).expect("context key");
        cache
            .entries
            .entry(context_key)
            .or_default()
            .insert(failing_path.to_string_lossy().into_owned(), (true, 25));

        let selected =
            sequence_project_runs_with_native(project_runs, &cache, true).expect("failed sequence");

        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].tests, [TestFile { path: failing_path }]);
    }

    #[test]
    fn no_cache_discards_previous_native_performance_data() {
        let temp = tempdir().expect("temp dir");
        let test_path = temp.path().join("failing.test.cjs");
        fs::write(&test_path, "test('failing', () => {});").expect("test source");
        let mut config = ProjectConfig::defaults(temp.path()).expect("config");
        config.cache_directory = temp.path().join(".cache");
        let project_runs = vec![ProjectRun {
            config: &config,
            tests: vec![TestFile {
                path: test_path.clone(),
            }],
            changed_coverage_filter: None,
        }];
        let mut cache =
            NativeSequencerCache::load(&config, &project_runs).expect("sequencer cache");
        let context_key = native_context_key(&config).expect("context key");
        cache
            .entries
            .entry(context_key)
            .or_default()
            .insert(test_path.to_string_lossy().into_owned(), (true, 25));
        cache.save().expect("persist cache");
        let cache_path = cache.path.clone();
        assert!(cache_path.exists());

        let mut disabled = config.clone();
        disabled.cache = false;
        let disabled_runs = vec![ProjectRun {
            config: &disabled,
            tests: vec![TestFile { path: test_path }],
            changed_coverage_filter: None,
        }];
        let mut reset =
            NativeSequencerCache::load(&disabled, &disabled_runs).expect("reset sequencer cache");

        assert!(reset.entries.is_empty());
        assert!(!cache_path.exists());

        let disabled_context_key = native_context_key(&disabled).expect("disabled context key");
        reset
            .entries
            .entry(disabled_context_key)
            .or_default()
            .insert(
                disabled_runs[0].tests[0]
                    .path
                    .to_string_lossy()
                    .into_owned(),
                (true, 40),
            );
        reset.save().expect("persist fresh no-cache result");

        let enabled_runs = vec![ProjectRun {
            config: &config,
            tests: vec![disabled_runs[0].tests[0].clone()],
            changed_coverage_filter: None,
        }];
        let reloaded =
            NativeSequencerCache::load(&config, &enabled_runs).expect("reload fresh cache");
        let enabled_context_key = native_context_key(&config).expect("enabled context key");
        assert_eq!(
            reloaded.performance(&enabled_context_key, &enabled_runs[0].tests[0].path),
            Some((true, 40))
        );
    }

    #[test]
    fn native_cache_preserves_skips_and_records_file_errors() {
        let temp = tempdir().expect("temp dir");
        let test_path = temp.path().join("failing.test.cjs");
        fs::write(&test_path, "test.skip('failing', () => {});").expect("skipped test");
        let config = ProjectConfig::defaults(temp.path()).expect("config");
        let project_runs = vec![ProjectRun {
            config: &config,
            tests: vec![TestFile {
                path: test_path.clone(),
            }],
            changed_coverage_filter: None,
        }];
        let mut cache =
            NativeSequencerCache::load(&config, &project_runs).expect("sequencer cache");
        let context_key = native_context_key(&config).expect("context key");
        cache
            .entries
            .entry(context_key.clone())
            .or_default()
            .insert(test_path.to_string_lossy().into_owned(), (true, 25));
        let file_result = |status| TestFileResult {
            protocol_version: WORKER_PROTOCOL_VERSION,
            test_path: test_path.clone(),
            project_display_name: None,
            tests: vec![TestCaseResult {
                name: "failing".into(),
                full_name: "failing".into(),
                ancestor_titles: Vec::new(),
                status,
                duration_ms: 0,
                failure_message: None,
                num_passing_asserts: 0,
                invocations: 1,
                retry_reasons: Vec::new(),
            }],
            errors: Vec::new(),
            console: Vec::new(),
            duration_ms: 10,
            heap_used_bytes: None,
            snapshot: SnapshotResult::default(),
            coverage: std::collections::BTreeMap::new(),
        };

        cache.record(&AggregatedResult {
            test_results: vec![file_result(TestStatus::Skipped)],
            ..AggregatedResult::default()
        });
        assert_eq!(
            cache.performance(&context_key, &test_path),
            Some((true, 25))
        );

        cache.record(&AggregatedResult {
            test_results: vec![file_result(TestStatus::Passed)],
            ..AggregatedResult::default()
        });
        assert_eq!(
            cache.performance(&context_key, &test_path),
            Some((false, 10))
        );

        let mut error_result = file_result(TestStatus::Passed);
        error_result.tests.clear();
        error_result.errors.push("module execution failed".into());
        cache.record(&AggregatedResult {
            test_results: vec![error_result],
            ..AggregatedResult::default()
        });
        assert_eq!(
            cache.performance(&context_key, &test_path),
            Some((true, 10))
        );
    }

    #[test]
    fn preserves_the_legacy_jest_coverage_summary_empty_percentage() {
        let temp = tempdir().expect("temp dir");
        fs::create_dir_all(temp.path().join("node_modules/jest")).expect("Jest package");
        fs::write(
            temp.path().join("node_modules/jest/package.json"),
            r#"{"version":"25.5.4"}"#,
        )
        .expect("Jest metadata");

        assert!(!uses_modern_branches_true_summary(temp.path()));

        fs::write(
            temp.path().join("node_modules/jest/package.json"),
            r#"{"version":"30.5.0"}"#,
        )
        .expect("modern Jest metadata");
        assert!(uses_modern_branches_true_summary(temp.path()));
    }

    #[test]
    fn separates_changed_coverage_filtering_from_unloaded_source_collection() {
        let temp = tempdir().expect("temp dir");
        for (name, source) in [
            ("a.js", "module.exports = 'a';"),
            ("b.js", "module.exports = 'b';"),
            ("a.test.js", "test('a', () => {});"),
        ] {
            fs::write(temp.path().join(name), source).expect("fixture source");
        }
        let config = ProjectConfig::defaults(temp.path()).expect("config");
        let a = fs::canonicalize(temp.path().join("a.js")).expect("a source");
        let b = fs::canonicalize(temp.path().join("b.js")).expect("b source");
        let test = fs::canonicalize(temp.path().join("a.test.js")).expect("test source");
        let changed = vec![a.clone(), b.clone(), test.clone()];

        let cli = Cli::try_parse_from(["rjest", "--coverage"]).expect("coverage CLI");
        let dynamic = coverage_runner_settings(&cli, &config, &config, Some(&changed))
            .expect("dynamic coverage settings");
        assert_eq!(dynamic.filter, Some(vec![a.clone(), b]));
        assert!(dynamic.sources.is_empty());

        let cli = Cli::try_parse_from(["rjest", "--coverage", "--collectCoverageFrom=a.js"])
            .expect("collectCoverageFrom CLI");
        let configured = coverage_runner_settings(&cli, &config, &config, Some(&changed))
            .expect("configured coverage settings");
        assert_eq!(configured.filter, Some(vec![a.clone()]));
        assert_eq!(configured.sources, vec![a.clone()]);

        let cli = Cli::try_parse_from(["rjest", "--coverage", "--findRelatedTests", "a.js"])
            .expect("find-related coverage CLI");
        let explicit = coverage_runner_settings(&cli, &config, &config, Some(&[a.clone(), test]))
            .expect("find-related coverage settings");
        assert_eq!(explicit.filter, Some(vec![a.clone()]));
        assert_eq!(explicit.sources, vec![a]);
    }
}
