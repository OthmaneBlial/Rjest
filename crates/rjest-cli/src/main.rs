use std::path::PathBuf;

use anyhow::{Context, Result, bail};
use clap::{ArgAction, Parser};

#[derive(Debug, Parser)]
#[command(
    name = "rjest",
    version,
    about = "Jest compatibility with a native Rust engine"
)]
struct Cli {
    /// File, directory, or path substring used to select tests.
    #[arg(value_name = "TEST_PATH_PATTERN")]
    test_path_patterns: Vec<PathBuf>,

    /// Path to a JSON Jest configuration.
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
}

fn main() {
    if let Err(error) = run() {
        eprintln!("Error: {error:#}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let cli = Cli::parse();
    let project_dir = std::env::current_dir().context("cannot determine current directory")?;
    let config = rjest_config::load(&project_dir, cli.config.as_deref())?;

    if cli.show_config {
        println!("{}", serde_json::to_string_pretty(&config)?);
        return Ok(());
    }

    let tests = rjest_discovery::discover(&config, &cli.test_path_patterns)?;
    if cli.list_tests {
        for test in &tests {
            println!("{}", test.path.display());
        }
        return if tests.is_empty() && !cli.pass_with_no_tests {
            bail!("No tests found");
        } else {
            Ok(())
        };
    }

    if tests.is_empty() {
        return if cli.pass_with_no_tests {
            Ok(())
        } else {
            bail!("No tests found")
        };
    }

    bail!(
        "test execution is not available in this foundation milestone; use --listTests to inspect native discovery"
    )
}
