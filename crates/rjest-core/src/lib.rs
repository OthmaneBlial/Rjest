//! Stable data types shared between Rjest's coordinator and subsystems.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// A test file selected for execution.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct TestFile {
    /// Canonical absolute path used for worker dispatch and stable sorting.
    pub path: PathBuf,
}

pub const WORKER_PROTOCOL_VERSION: u32 = 1;

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerRequest {
    pub protocol_version: u32,
    pub test_path: PathBuf,
    pub test_name_pattern: Option<String>,
    pub default_timeout_ms: u64,
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
