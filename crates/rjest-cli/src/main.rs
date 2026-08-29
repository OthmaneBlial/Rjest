use std::path::PathBuf;

use anyhow::{Context, Result, bail, ensure};
use clap::{ArgAction, Parser};
use rjest_core::{AggregatedResult, SnapshotUpdate, TestStatus};

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

    /// Path to a Jest configuration file.
    #[arg(long, value_name = "PATH")]
    config: Option<PathBuf>,

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
        long = "maxWorkers",
        visible_alias = "max-workers",
        value_name = "N|PERCENT"
    )]
    max_workers: Option<String>,

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

    /// Rewrite failing snapshots and remove obsolete snapshots.
    #[arg(
        short = 'u',
        long = "updateSnapshot",
        visible_alias = "update-snapshot",
        action = ArgAction::SetTrue
    )]
    update_snapshot: bool,
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
    let config = rjest_config::load(&project_dir, cli.config.as_deref())?;

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
    let options = rjest_runner::RunnerOptions {
        max_workers,
        test_name_pattern: cli.test_name_pattern,
        default_timeout_ms: config.test_timeout,
        root_dir: config.root_dir.clone(),
        module_file_extensions: config.module_file_extensions.clone(),
        module_paths: config.module_paths.clone(),
        test_environment: config.test_environment.clone(),
        test_environment_options: config.test_environment_options.clone(),
        setup_files_after_env: config.setup_files_after_env.clone(),
        snapshot_serializers: config.snapshot_serializers.clone(),
        transform: config.transform.clone(),
        transform_ignore_patterns: config.transform_ignore_patterns.clone(),
        snapshot_update: if cli.update_snapshot {
            SnapshotUpdate::All
        } else {
            SnapshotUpdate::New
        },
        ..rjest_runner::RunnerOptions::default()
    };
    let result = rjest_runner::run(&tests, &options)?;
    let serialized = serde_json::to_string(&result)?;
    if let Some(ref output_file) = cli.output_file {
        std::fs::write(output_file, &serialized)
            .with_context(|| format!("cannot write JSON result to `{}`", output_file.display()))?;
    }
    if cli.json && cli.output_file.is_none() {
        println!("{serialized}");
    } else {
        report(&result, &config.root_dir, cli.silent, cli.verbose);
    }
    Ok(result.is_success())
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

fn report(result: &AggregatedResult, root_dir: &std::path::Path, silent: bool, verbose: bool) {
    for file in &result.test_results {
        let display_path = file
            .test_path
            .strip_prefix(root_dir)
            .unwrap_or(&file.test_path);
        let label = if file.is_success() { "PASS" } else { "FAIL" };
        println!(
            "{label} {} ({} ms)",
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
    use super::parse_max_workers;

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
}
