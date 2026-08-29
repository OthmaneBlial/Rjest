//! Stable data types shared between Rjest's coordinator and subsystems.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// A test file selected for execution.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct TestFile {
    /// Canonical absolute path used for worker dispatch and stable sorting.
    pub path: PathBuf,
}
