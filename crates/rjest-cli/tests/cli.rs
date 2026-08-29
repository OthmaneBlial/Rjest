use std::{fs, process::Command};

use tempfile::tempdir;

fn command() -> Command {
    Command::new(env!("CARGO_BIN_EXE_rjest"))
}

#[test]
fn shows_config_and_lists_discovered_tests() {
    let temp = tempdir().expect("temp dir");
    let test_path = temp.path().join("sample.test.js");
    fs::write(&test_path, "test('passes', () => expect(1).toBe(1));").expect("write fixture");

    let config = command()
        .current_dir(temp.path())
        .arg("--showConfig")
        .output()
        .expect("run showConfig");
    assert!(config.status.success());
    let config: serde_json::Value =
        serde_json::from_slice(&config.stdout).expect("valid config JSON");
    assert_eq!(
        config["rootDir"],
        temp.path()
            .canonicalize()
            .expect("canonical root")
            .to_string_lossy()
            .as_ref()
    );

    let list = command()
        .current_dir(temp.path())
        .arg("--listTests")
        .output()
        .expect("run listTests");
    assert!(list.status.success());
    assert_eq!(
        String::from_utf8(list.stdout).expect("UTF-8 output").trim(),
        test_path
            .canonicalize()
            .expect("canonical path")
            .to_string_lossy()
    );
}

#[test]
fn returns_jest_style_exit_codes_for_passing_and_failing_runs() {
    let temp = tempdir().expect("temp dir");
    let test_path = temp.path().join("status.test.js");
    fs::write(&test_path, "test('passes', () => expect(1).toBe(1));")
        .expect("write passing fixture");

    let passing = command()
        .current_dir(temp.path())
        .arg("--runInBand")
        .output()
        .expect("run passing test");
    assert!(passing.status.success());
    assert!(String::from_utf8_lossy(&passing.stdout).contains("1 passed"));

    fs::write(&test_path, "test('fails', () => expect(1).toBe(2));")
        .expect("write failing fixture");
    let failing = command()
        .current_dir(temp.path())
        .args(["--maxWorkers=50%", "--json"])
        .output()
        .expect("run failing test");
    assert_eq!(failing.status.code(), Some(1));
    let result: serde_json::Value =
        serde_json::from_slice(&failing.stdout).expect("valid result JSON");
    assert_eq!(result["testResults"][0]["tests"][0]["status"], "failed");
}

#[test]
fn writes_json_to_output_file_without_printing_it_to_stdout() {
    let temp = tempdir().expect("temp dir");
    let test_path = temp.path().join("output.test.js");
    let output_path = temp.path().join("result.json");
    fs::write(&test_path, "test('passes', () => expect(1).toBe(1));")
        .expect("write passing fixture");

    let output = command()
        .current_dir(temp.path())
        .args(["--runInBand", "--json", "--outputFile"])
        .arg(&output_path)
        .output()
        .expect("run with output file");

    assert!(output.status.success());
    assert!(
        !String::from_utf8_lossy(&output.stdout)
            .trim_start()
            .starts_with('{')
    );
    let result: serde_json::Value =
        serde_json::from_slice(&fs::read(output_path).expect("read output file"))
            .expect("valid result JSON");
    assert_eq!(result["testResults"][0]["tests"][0]["status"], "passed");
}
