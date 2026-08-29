use std::path::PathBuf;

use anyhow::{Context, Result, bail, ensure};
use clap::{ArgAction, Parser};
use rjest_config::ProjectConfig;
use rjest_core::{AggregatedResult, SnapshotUpdate, TestStatus};
use rjest_coverage::{CoverageOptions, CoverageReport, discover_sources, write_reports};

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
}

struct CoverageRunnerSettings {
    enabled: bool,
    path_ignore_patterns: Vec<String>,
    filter: Option<Vec<PathBuf>>,
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

    let tests = rjest_discovery::discover(&config, &cli.test_path_patterns)?;
    if cli.list_tests {
        for test in &tests {
            println!("{}", test.path.display());
        }
        return if tests.is_empty() && !cli.pass_with_no_tests {
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
    let CoverageRunnerSettings {
        enabled: collect_coverage,
        path_ignore_patterns: coverage_path_ignore_patterns,
        filter: coverage_filter,
    } = coverage_runner_settings(&cli, &config)?;
    let options = rjest_runner::RunnerOptions {
        max_workers,
        test_name_pattern: cli.test_name_pattern.clone(),
        default_timeout_ms: config.test_timeout,
        root_dir: config.root_dir.clone(),
        module_file_extensions: config.module_file_extensions.clone(),
        extensions_to_treat_as_esm: config.extensions_to_treat_as_esm.clone(),
        module_name_mapper: config.module_name_mapper.clone(),
        module_paths: config.module_paths.clone(),
        automock: config.automock,
        clear_mocks: config.clear_mocks,
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
    emit_results(&cli, &config, &result, coverage_report.as_ref())?;
    Ok(result.is_success()
        && coverage_report
            .as_ref()
            .is_none_or(|report| report.threshold_failures.is_empty()))
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
            cli.silent,
            cli.verbose,
            cli.log_heap_usage,
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

fn report(
    result: &AggregatedResult,
    root_dir: &std::path::Path,
    silent: bool,
    verbose: bool,
    log_heap_usage: bool,
) {
    for file in &result.test_results {
        let display_path = file
            .test_path
            .strip_prefix(root_dir)
            .unwrap_or(&file.test_path);
        let label = if file.is_success() { "PASS" } else { "FAIL" };
        let heap_usage = if log_heap_usage {
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
        if !silent {
            for entry in &file.console {
                println!("  Console {}: {}", entry.level, entry.message);
            }
        }
        for test in &file.tests {
            if verbose || test.status == TestStatus::Failed {
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

    use super::{Cli, parse_max_workers, uses_modern_branches_true_summary};

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
