//! Stable data types shared between Rjest's coordinator and subsystems.

use std::{collections::BTreeMap, path::PathBuf};

use serde::{Deserialize, Serialize};

/// A test file selected for execution.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct TestFile {
    /// Canonical absolute path used for worker dispatch and stable sorting.
    pub path: PathBuf,
}

pub const WORKER_PROTOCOL_VERSION: u32 = 12;

/// Istanbul file coverage records keyed by canonical source path.
pub type CoverageMap = BTreeMap<String, serde_json::Value>;

/// One ordered Jest `moduleNameMapper` rule and its fallback targets.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleNameMapper {
    pub pattern: String,
    pub replacements: Vec<String>,
}

/// Normalized Jest fake-timer configuration shared with each JavaScript worker.
#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FakeTimersConfig {
    pub enable_globally: bool,
    pub legacy_fake_timers: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub advance_timers: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub do_not_fake: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub now: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timer_limit: Option<serde_json::Number>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MockLifecycleConfig {
    pub clear_mocks: bool,
    pub reset_mocks: bool,
    pub restore_mocks: bool,
}

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
    pub extensions_to_treat_as_esm: Vec<String>,
    pub module_name_mapper: Vec<ModuleNameMapper>,
    pub automock: bool,
    #[serde(flatten)]
    pub mock_lifecycle: MockLifecycleConfig,
    pub fake_timers: FakeTimersConfig,
    pub test_environment: String,
    pub test_environment_options: serde_json::Value,
    pub setup_files: Vec<PathBuf>,
    pub setup_files_after_env: Vec<PathBuf>,
    pub snapshot_serializers: Vec<String>,
    pub transform: BTreeMap<String, serde_json::Value>,
    pub transform_ignore_patterns: Vec<String>,
    pub collect_coverage: bool,
    pub coverage_path_ignore_patterns: Vec<String>,
    pub coverage_filter: Option<Vec<PathBuf>>,
    pub coverage_sources: Vec<PathBuf>,
    pub test_name_pattern: Option<String>,
    pub default_timeout_ms: u64,
    #[serde(flatten)]
    pub snapshot: SnapshotRequest,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotRequest {
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
    pub heap_used_bytes: Option<u64>,
    pub snapshot: SnapshotResult,
    #[serde(default, skip_serializing)]
    pub coverage: CoverageMap,
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
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub coverage_map: CoverageMap,
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
