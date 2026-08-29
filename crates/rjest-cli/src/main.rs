use std::{
    path::PathBuf,
    str::FromStr,
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, Result, bail, ensure};
use clap::{ArgAction, Parser};
use rjest_config::ProjectConfig;
use rjest_core::{AggregatedResult, ExecutionOrderConfig, SnapshotUpdate, TestFile, TestStatus};
use rjest_coverage::{CoverageOptions, CoverageReport, discover_sources, write_reports};
use sha1::{Digest, Sha1};

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
    let config = load_config(&project_dir, cli.config.as_deref())?;

    if cli.show_config {
        println!("{}", serde_json::to_string_pretty(&config)?);
        return Ok(true);
    }

    let discovered_tests = rjest_discovery::discover(&config, &cli.test_path_patterns)?;
    let tests = match cli.shard {
        Some(shard) => shard_tests(discovered_tests, &config.root_dir, shard),
        None => discovered_tests,
    };
    if cli.list_tests {
        for test in &tests {
            println!("{}", test.path.display());
        }
        return if tests.is_empty() && cli.shard.is_none() && !cli.pass_with_no_tests {
            bail!("No tests found");
        } else {
            Ok(true)
        };
    }

    if tests.is_empty() {
        return if cli.pass_with_no_tests {
            Ok(true)
        } else {
            bail!("No tests found")
        };
    }

    let max_workers = if cli.run_in_band {
        1
    } else {
        parse_max_workers(cli.max_workers.as_deref().or(config.max_workers.as_deref()))?
    };
    let seed = cli
        .seed
        .map_or_else(|| Ok(generated_seed()), validate_seed)?;
    let randomize = cli.randomize || config.randomize;
    let show_seed = randomize || cli.show_seed || config.show_seed;
    let CoverageRunnerSettings {
        enabled: collect_coverage,
        path_ignore_patterns: coverage_path_ignore_patterns,
        filter: coverage_filter,
    } = coverage_runner_settings(&cli, &config)?;
    let options = rjest_runner::RunnerOptions {
        max_workers,
        execution_order: ExecutionOrderConfig { seed, randomize },
        test_name_pattern: cli.test_name_pattern.clone(),
        default_timeout_ms: config.test_timeout,
        root_dir: config.root_dir.clone(),
        module_file_extensions: config.module_file_extensions.clone(),
        extensions_to_treat_as_esm: config.extensions_to_treat_as_esm.clone(),
        module_name_mapper: config.module_name_mapper.clone(),
        module_paths: config.module_paths.clone(),
        automock: config.automock,
        reset_modules: config.reset_modules,
        mock_lifecycle: config.mock_lifecycle.clone(),
        fake_timers: config.fake_timers.clone(),
        test_environment: config.test_environment.clone(),
        test_environment_options: config.test_environment_options.clone(),
        setup_files: config.setup_files.clone(),
        setup_files_after_env: config.setup_files_after_env.clone(),
        snapshot_serializers: config.snapshot_serializers.clone(),
        transform: config.transform.clone(),
        transform_ignore_patterns: config.transform_ignore_patterns.clone(),
        collect_coverage,
        coverage_path_ignore_patterns,
        coverage_filter,
        snapshot_update: if cli.update_snapshot {
            SnapshotUpdate::All
        } else {
            SnapshotUpdate::New
        },
        ..rjest_runner::RunnerOptions::default()
    };
    let result = rjest_runner::run(&tests, &options)?;
    let coverage_report = coverage_report(&cli, &config, &result, collect_coverage)?;
    emit_results(
        &cli,
        &config,
        &result,
        coverage_report.as_ref(),
        seed,
        show_seed,
    )?;
    Ok(result.is_success()
        && coverage_report
            .as_ref()
            .is_none_or(|report| report.threshold_failures.is_empty()))
}

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
    let base_size = tests.len() / shard.count;
    let larger_shards = tests.len() % shard.count;
    let preceding = shard.index - 1;
    let start = preceding * base_size + preceding.min(larger_shards);
    let size = base_size + usize::from(shard.index <= larger_shards);
    tests.into_iter().skip(start).take(size).collect()
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
                silent: cli.silent,
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

fn report(result: &AggregatedResult, root_dir: &std::path::Path, settings: &ReportSettings) {
    for file in &result.test_results {
        let display_path = file
            .test_path
            .strip_prefix(root_dir)
            .unwrap_or(&file.test_path);
        let label = if file.is_success() { "PASS" } else { "FAIL" };
        let heap_usage = if settings.log_heap_usage {
            file.heap_used_bytes
                .map(|bytes| format!(" ({} MB heap size)", bytes / (1024 * 1024)))
                .unwrap_or_default()
        } else {
            String::new()
        };
        println!(
            "{label} {} ({} ms){heap_usage}",
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
    use std::fs;

    use tempfile::tempdir;

    use clap::Parser;

    use rjest_core::TestFile;

    use super::{
        Cli, Shard, parse_max_workers, shard_tests, uses_modern_branches_true_summary,
        validate_seed,
    };

    #[test]
    fn accepts_jest_worker_and_heap_usage_flags() {
        let cli = Cli::try_parse_from(["rjest", "-w", "1", "--logHeapUsage"])
            .expect("Jest-compatible flags");
        assert_eq!(cli.max_workers.as_deref(), Some("1"));
        assert!(cli.log_heap_usage);
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
