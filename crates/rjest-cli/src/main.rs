use std::{
    collections::{BTreeMap, BTreeSet},
    fmt::Write as _,
    fs,
    io::{BufRead, BufReader, Write as IoWrite},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    str::FromStr,
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, Result, bail, ensure};
use clap::{ArgAction, Parser};
use rjest_config::ProjectConfig;
use rjest_core::{
    AggregatedResult, ExecutionOrderConfig, GlobalExecutionConfig, SnapshotUpdate, TestFile,
    TestStatus,
};
use rjest_coverage::{CoverageOptions, CoverageReport, discover_sources, write_reports};
use sha1::{Digest, Sha1};

const TEST_SEQUENCER_BRIDGE: &str = include_str!("../runtime/test-sequencer.mjs");
const TEST_SEQUENCER_PREFIX: &str = "__RJEST_SEQUENCER__";

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

    /// Override the configured Jest test sequencer module.
    #[arg(
        long = "testSequencer",
        visible_alias = "test-sequencer",
        value_name = "PATH"
    )]
    test_sequencer: Option<String>,

    /// Run only test files that failed in the previous execution.
    #[arg(short = 'f', long = "onlyFailures", visible_alias = "only-failures", action = ArgAction::SetTrue)]
    only_failures: bool,

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
}

struct ProjectRun<'a> {
    config: &'a ProjectConfig,
    tests: Vec<TestFile>,
}

#[derive(Clone)]
struct SequencerUnit<'a> {
    config: &'a ProjectConfig,
    test: TestFile,
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
        let path = std::env::temp_dir()
            .join("rjest-test-sequencer-cache")
            .join(format!("native-{root_hash:x}.json"));
        let entries = fs::read_to_string(&path)
            .ok()
            .and_then(|source| serde_json::from_str(&source).ok())
            .unwrap_or_default();
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
    show_seed: bool,
    seed: i32,
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
    let cli = Cli::parse();
    let project_dir = std::env::current_dir().context("cannot determine current directory")?;
    let mut config = load_execution_config(&cli, &project_dir)?;
    apply_cli_config_overrides(&mut config, &cli);

    if cli.show_config {
        println!("{}", serde_json::to_string_pretty(&config)?);
        return Ok(true);
    }

    let test_path_patterns = normalize_test_path_patterns(&cli.test_path_patterns, &project_dir);
    let all_projects = execution_projects(&config);
    let selected_projects =
        filter_projects(&all_projects, &cli.select_projects, &cli.ignore_projects);
    write_project_selection_message(&cli, &all_projects, &selected_projects);
    let seed = cli
        .seed
        .map_or_else(|| Ok(generated_seed()), validate_seed)?;
    let randomize = cli.randomize || config.randomize;
    let show_seed = randomize || cli.show_seed || config.show_seed;
    let project_runs = selected_projects
        .into_iter()
        .map(|project_config| {
            Ok(ProjectRun {
                config: project_config,
                tests: rjest_discovery::discover(project_config, &test_path_patterns)?,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let (project_runs, mut sequencer_session, mut native_sequencer_cache) =
        order_project_runs(project_runs, &config, seed, randomize, cli.shard)?;
    let test_count = project_runs
        .iter()
        .map(|run| run.tests.len())
        .sum::<usize>();
    let pass_with_no_tests = cli.pass_with_no_tests || config.pass_with_no_tests;
    if cli.list_tests {
        return emit_test_list(
            &cli,
            &config,
            &project_runs,
            pass_with_no_tests,
            &mut sequencer_session,
            &mut native_sequencer_cache,
        );
    }

    if test_count == 0 {
        if config.only_failures {
            finish_test_sequencers(&mut sequencer_session, &mut native_sequencer_cache, None)?;
            println!("No failed test found.");
            return Ok(pass_with_no_tests);
        }
        if !pass_with_no_tests {
            bail!("No tests found");
        }
        finish_test_sequencers(&mut sequencer_session, &mut native_sequencer_cache, None)?;
        emit_results(
            &cli,
            &config,
            &AggregatedResult::default(),
            None,
            seed,
            show_seed,
        )?;
        return Ok(true);
    }

    let max_workers = if cli.run_in_band || config.detect_open_handles {
        1
    } else {
        parse_max_workers(cli.max_workers.as_deref().or(config.max_workers.as_deref()))?
    };
    let (result, collect_coverage) = execute_project_runs(
        &cli,
        &config,
        project_runs,
        max_workers,
        ExecutionOrderConfig { seed, randomize },
    )?;
    let bail_reached = config.bail != 0 && result.count(TestStatus::Failed) >= config.bail;
    finish_test_sequencers(
        &mut sequencer_session,
        &mut native_sequencer_cache,
        (!bail_reached).then_some(&result),
    )?;
    let coverage_report = coverage_report(&cli, &config, &result, collect_coverage)?;
    if !bail_reached || !cli.json {
        emit_results(
            &cli,
            &config,
            &result,
            coverage_report.as_ref(),
            seed,
            show_seed,
        )?;
    }
    Ok(result.is_success()
        && coverage_report
            .as_ref()
            .is_none_or(|report| report.threshold_failures.is_empty()))
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
    config.only_failures |= cli.only_failures;
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

fn execute_project_runs(
    cli: &Cli,
    global_config: &ProjectConfig,
    project_runs: Vec<ProjectRun<'_>>,
    max_workers: usize,
    execution_order: ExecutionOrderConfig,
) -> Result<(AggregatedResult, bool)> {
    let started = Instant::now();
    let mut result = AggregatedResult::default();
    let mut collect_coverage = false;
    for run in project_runs.into_iter().filter(|run| !run.tests.is_empty()) {
        let failed = result.count(TestStatus::Failed);
        if global_config.bail != 0 && failed >= global_config.bail {
            break;
        }
        let CoverageRunnerSettings {
            enabled: project_collect_coverage,
            path_ignore_patterns: coverage_path_ignore_patterns,
            filter: coverage_filter,
        } = coverage_runner_settings(cli, run.config)?;
        collect_coverage |= project_collect_coverage;
        let options = rjest_runner::RunnerOptions {
            max_workers,
            bail: global_config.bail.saturating_sub(failed),
            execution_order,
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
            collect_coverage: project_collect_coverage,
            coverage_path_ignore_patterns,
            coverage_filter,
            snapshot_update: snapshot_update(cli),
            ..rjest_runner::RunnerOptions::default()
        };
        let mut project_result = rjest_runner::run(&run.tests, &options)?;
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
            })
        })
        .collect::<Vec<_>>();
    let units = project_runs
        .into_iter()
        .enumerate()
        .flat_map(|(context_id, run)| {
            run.tests
                .into_iter()
                .map(move |test| SequencerUnit {
                    config: run.config,
                    test,
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
        for test in run.tests {
            let performance = cache.performance(&context_key, &test.path);
            let file_size = fs::metadata(&test.path).map_or(0, |metadata| metadata.len());
            sequenced.push((
                performance,
                file_size,
                SequencerUnit {
                    config: run.config,
                    test,
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

fn coverage_runner_settings(cli: &Cli, config: &ProjectConfig) -> Result<CoverageRunnerSettings> {
    let enabled = cli.coverage || config.collect_coverage;
    let provider = cli
        .coverage_provider
        .as_deref()
        .unwrap_or(&config.coverage_provider);
    if enabled && provider != "babel" {
        bail!(
            "coverageProvider `{provider}` is not supported yet; use Jest's default `babel` provider"
        );
    }
    let collect_from = if cli.collect_coverage_from.is_empty() {
        &config.collect_coverage_from
    } else {
        &cli.collect_coverage_from
    };
    let path_ignore_patterns = if cli.coverage_path_ignore_patterns.is_empty() {
        config.coverage_path_ignore_patterns.clone()
    } else {
        cli.coverage_path_ignore_patterns.clone()
    };
    let filter = if enabled && !collect_from.is_empty() {
        let mut excluded_paths = rjest_discovery::discover(config, &[])?
            .into_iter()
            .map(|test| test.path)
            .collect::<Vec<_>>();
        excluded_paths.extend(config.setup_files.iter().cloned());
        excluded_paths.extend(config.setup_files_after_env.iter().cloned());
        Some(discover_sources(
            &config.root_dir,
            collect_from,
            &path_ignore_patterns,
            &excluded_paths,
        )?)
    } else {
        None
    };
    Ok(CoverageRunnerSettings {
        enabled,
        path_ignore_patterns,
        filter,
    })
}

fn coverage_report(
    cli: &Cli,
    config: &ProjectConfig,
    result: &AggregatedResult,
    enabled: bool,
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
    seed: i32,
    show_seed: bool,
) -> Result<()> {
    let serialized = serde_json::to_string(&result)?;
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
    } else {
        report(
            result,
            &config.root_dir,
            &ReportSettings {
                silent: cli.silent || config.silent,
                verbose: cli.verbose,
                log_heap_usage: cli.log_heap_usage,
                show_seed,
                seed,
            },
        );
    }
    Ok(())
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
    for file in &result.test_results {
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

    use tempfile::tempdir;

    use clap::Parser;

    use rjest_config::{ProjectConfig, ProjectDisplayName};
    use rjest_core::{
        AggregatedResult, SnapshotResult, TestCaseResult, TestFile, TestFileResult, TestStatus,
        WORKER_PROTOCOL_VERSION,
    };

    use super::{
        Cli, NativeSequencerCache, ProjectRun, Shard, filter_projects, native_context_key,
        parse_max_workers, sequence_project_runs_with_native, shard_tests,
        uses_modern_branches_true_summary, validate_seed,
    };

    #[test]
    fn accepts_jest_worker_and_heap_usage_flags() {
        let cli = Cli::try_parse_from(["rjest", "-w", "1", "--logHeapUsage"])
            .expect("Jest-compatible flags");
        assert_eq!(cli.max_workers.as_deref(), Some("1"));
        assert!(cli.log_heap_usage);
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
    fn accepts_jest_only_failures_flags() {
        let long = Cli::try_parse_from(["rjest", "--onlyFailures"]).expect("long flag");
        assert!(long.only_failures);

        let short = Cli::try_parse_from(["rjest", "-f"]).expect("short flag");
        assert!(short.only_failures);
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
            },
            ProjectRun {
                config: &beta,
                tests: vec![TestFile {
                    path: beta_path.clone(),
                }],
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
                status,
                duration_ms: 0,
                failure_message: None,
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
}
