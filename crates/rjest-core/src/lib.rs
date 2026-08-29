//! Stable data types shared between Rjest's coordinator and subsystems.

use std::{collections::BTreeMap, path::PathBuf};

use serde::{Deserialize, Serialize};

/// A test file selected for execution.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct TestFile {
    /// Canonical absolute path used for worker dispatch and stable sorting.
    pub path: PathBuf,
}

pub const WORKER_PROTOCOL_VERSION: u32 = 3;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SnapshotUpdate {
    None,
    #[default]
    New,
    All,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerRequest {
    pub protocol_version: u32,
    pub test_path: PathBuf,
    pub root_dir: PathBuf,
    pub module_file_extensions: Vec<String>,
    pub test_environment: String,
    pub test_environment_options: serde_json::Value,
    pub setup_files_after_env: Vec<PathBuf>,
    pub snapshot_serializers: Vec<String>,
    pub transform: BTreeMap<String, serde_json::Value>,
    pub transform_ignore_patterns: Vec<String>,
    pub test_name_pattern: Option<String>,
    pub default_timeout_ms: u64,
    pub snapshot_update: SnapshotUpdate,
    pub snapshot_file_exists: bool,
    pub snapshot_dirty: bool,
    pub snapshot_data: BTreeMap<String, String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TestStatus {
    Passed,
    Failed,
    Skipped,
    Todo,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestCaseResult {
    pub name: String,
    pub full_name: String,
    pub status: TestStatus,
    pub duration_ms: u64,
    pub failure_message: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleEntry {
    pub level: String,
    pub message: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestFileResult {
    pub protocol_version: u32,
    pub test_path: PathBuf,
    pub tests: Vec<TestCaseResult>,
    pub errors: Vec<String>,
    pub console: Vec<ConsoleEntry>,
    pub duration_ms: u64,
    pub snapshot: SnapshotResult,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotResult {
    pub added: usize,
    pub matched: usize,
    pub unmatched: usize,
    pub updated: usize,
    pub removed: usize,
    pub unchecked_keys: Vec<String>,
    pub dirty: bool,
    pub data: BTreeMap<String, String>,
}

impl TestFileResult {
    pub fn is_success(&self) -> bool {
        self.errors.is_empty()
            && self
                .tests
                .iter()
                .all(|test| test.status != TestStatus::Failed)
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AggregatedResult {
    pub test_results: Vec<TestFileResult>,
    pub duration_ms: u64,
}

impl AggregatedResult {
    pub fn is_success(&self) -> bool {
        self.test_results.iter().all(TestFileResult::is_success)
    }

    pub fn count(&self, status: TestStatus) -> usize {
        self.test_results
            .iter()
            .flat_map(|result| &result.tests)
            .filter(|test| test.status == status)
            .count()
    }

    pub fn total_tests(&self) -> usize {
        self.test_results
            .iter()
            .map(|result| result.tests.len())
            .sum()
    }
}
