//! Jest-compatible configuration discovery and normalization.

use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

const CONFIG_FILENAMES: &[&str] = &["jest.config.json", "package.json"];

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("cannot read configuration at {path}: {source}")]
    Read {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("invalid JSON configuration at {path}: {source}")]
    Json {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
    #[error("package.json at {0} does not contain a `jest` configuration")]
    MissingPackageConfig(PathBuf),
    #[error("unsupported configuration fields: {0}; Rjest does not silently ignore Jest options")]
    UnsupportedFields(String),
    #[error(
        "configuration format `{0}` is not supported yet; use jest.config.json or package.json"
    )]
    UnsupportedFormat(String),
    #[error("configured root `{0}` is not a directory")]
    MissingRoot(PathBuf),
}

/// Supported, normalized subset of Jest's project configuration.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfig {
    pub root_dir: PathBuf,
    pub roots: Vec<PathBuf>,
    pub test_match: Vec<String>,
    pub test_regex: Vec<String>,
    pub test_path_ignore_patterns: Vec<String>,
    pub module_file_extensions: Vec<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawProjectConfig {
    root_dir: Option<String>,
    roots: Option<Vec<String>>,
    test_match: Option<Vec<String>>,
    test_regex: Option<OneOrMany>,
    test_path_ignore_patterns: Option<Vec<String>>,
    module_file_extensions: Option<Vec<String>>,
    #[serde(flatten)]
    unsupported: BTreeMap<String, Value>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum OneOrMany {
    One(String),
    Many(Vec<String>),
}

impl OneOrMany {
    fn into_vec(self) -> Vec<String> {
        match self {
            Self::One(value) => vec![value],
            Self::Many(values) => values,
        }
    }
}

impl ProjectConfig {
    /// Builds Jest-compatible defaults rooted at `root_dir`.
    ///
    /// # Errors
    ///
    /// Returns [`ConfigError::MissingRoot`] when the root does not exist, or a
    /// read error when a relative path cannot be made absolute.
    pub fn defaults(root_dir: &Path) -> Result<Self, ConfigError> {
        let root_dir = absolute(root_dir)?;
        ensure_directory(&root_dir)?;
        Ok(Self {
            roots: vec![root_dir.clone()],
            root_dir,
            test_match: vec![
                "**/__tests__/**/*.?([mc])[jt]s?(x)".into(),
                "**/?(*.)+(spec|test).?([mc])[jt]s?(x)".into(),
            ],
            test_regex: Vec::new(),
            test_path_ignore_patterns: vec!["/node_modules/".into()],
            module_file_extensions: [
                "js", "mjs", "cjs", "jsx", "ts", "mts", "cts", "tsx", "json", "node",
            ]
            .into_iter()
            .map(String::from)
            .collect(),
        })
    }
}

/// Loads an explicit config, or searches the project root using Jest's common
/// JSON-bearing locations. JavaScript config loading is intentionally rejected
/// until the runtime bridge can evaluate it correctly.
///
/// # Errors
///
/// Returns a [`ConfigError`] when configuration cannot be located, read,
/// decoded, normalized, or contains unsupported fields.
pub fn load(project_dir: &Path, explicit: Option<&Path>) -> Result<ProjectConfig, ConfigError> {
    let project_dir = absolute(project_dir)?;
    let config_path = explicit.map_or_else(
        || find_config(&project_dir),
        |path| Some(resolve_from(&project_dir, path)),
    );

    let Some(config_path) = config_path else {
        return ProjectConfig::defaults(&project_dir);
    };

    let extension = config_path.extension().and_then(|value| value.to_str());
    if extension != Some("json") {
        return Err(ConfigError::UnsupportedFormat(
            extension.unwrap_or("unknown").to_owned(),
        ));
    }

    let source = fs::read_to_string(&config_path).map_err(|source| ConfigError::Read {
        path: config_path.clone(),
        source,
    })?;
    let mut value: Value = serde_json::from_str(&source).map_err(|source| ConfigError::Json {
        path: config_path.clone(),
        source,
    })?;

    if config_path.file_name().and_then(|name| name.to_str()) == Some("package.json") {
        value = value
            .get_mut("jest")
            .map(Value::take)
            .ok_or_else(|| ConfigError::MissingPackageConfig(config_path.clone()))?;
    }

    let raw: RawProjectConfig =
        serde_json::from_value(value).map_err(|source| ConfigError::Json {
            path: config_path.clone(),
            source,
        })?;
    normalize(raw, config_path.parent().unwrap_or(&project_dir))
}

fn normalize(raw: RawProjectConfig, config_dir: &Path) -> Result<ProjectConfig, ConfigError> {
    if !raw.unsupported.is_empty() {
        return Err(ConfigError::UnsupportedFields(
            raw.unsupported
                .keys()
                .cloned()
                .collect::<Vec<_>>()
                .join(", "),
        ));
    }

    let root_dir = raw.root_dir.map_or_else(
        || absolute(config_dir),
        |value| absolute(&resolve_root_token(config_dir, &value)),
    )?;
    ensure_directory(&root_dir)?;

    let defaults = ProjectConfig::defaults(&root_dir)?;
    let roots = match raw.roots {
        Some(values) => values
            .iter()
            .map(|value| absolute(&resolve_root_token(&root_dir, value)))
            .collect::<Result<Vec<_>, _>>()?,
        None => defaults.roots.clone(),
    };
    for root in &roots {
        ensure_directory(root)?;
    }

    Ok(ProjectConfig {
        root_dir,
        roots,
        test_match: raw.test_match.unwrap_or(defaults.test_match),
        test_regex: raw
            .test_regex
            .map_or(defaults.test_regex, OneOrMany::into_vec),
        test_path_ignore_patterns: raw
            .test_path_ignore_patterns
            .unwrap_or(defaults.test_path_ignore_patterns),
        module_file_extensions: raw
            .module_file_extensions
            .unwrap_or(defaults.module_file_extensions),
    })
}

fn find_config(project_dir: &Path) -> Option<PathBuf> {
    CONFIG_FILENAMES
        .iter()
        .map(|name| project_dir.join(name))
        .find(|candidate| candidate.is_file())
        .and_then(|candidate| {
            if candidate.file_name().and_then(|name| name.to_str()) == Some("package.json") {
                let has_jest = fs::read_to_string(&candidate)
                    .ok()
                    .and_then(|source| serde_json::from_str::<Value>(&source).ok())
                    .is_some_and(|value| value.get("jest").is_some());
                has_jest.then_some(candidate)
            } else {
                Some(candidate)
            }
        })
}

fn resolve_root_token(base: &Path, value: &str) -> PathBuf {
    if value == "<rootDir>" {
        return base.to_path_buf();
    }
    if let Some(suffix) = value.strip_prefix("<rootDir>/") {
        return base.join(suffix);
    }
    resolve_from(base, Path::new(value))
}

fn resolve_from(base: &Path, path: &Path) -> PathBuf {
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        base.join(path)
    }
}

fn absolute(path: &Path) -> Result<PathBuf, ConfigError> {
    if path.is_absolute() {
        Ok(path.to_path_buf())
    } else {
        std::env::current_dir()
            .map(|cwd| cwd.join(path))
            .map_err(|source| ConfigError::Read {
                path: path.to_path_buf(),
                source,
            })
    }
}

fn ensure_directory(path: &Path) -> Result<(), ConfigError> {
    path.is_dir()
        .then_some(())
        .ok_or_else(|| ConfigError::MissingRoot(path.to_path_buf()))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::*;

    #[test]
    fn defaults_match_jest_file_extensions() {
        let temp = tempdir().expect("temp dir");
        let config = ProjectConfig::defaults(temp.path()).expect("defaults");
        assert!(config.module_file_extensions.contains(&"tsx".to_owned()));
        assert_eq!(config.roots, vec![temp.path().to_path_buf()]);
    }

    #[test]
    fn loads_package_json_jest_config_and_root_tokens() {
        let temp = tempdir().expect("temp dir");
        fs::create_dir(temp.path().join("src")).expect("create src");
        fs::write(
            temp.path().join("package.json"),
            r#"{"name":"fixture","jest":{"roots":["<rootDir>/src"],"testRegex":"\\.check\\.js$"}}"#,
        )
        .expect("write config");

        let config = load(temp.path(), None).expect("load config");
        assert_eq!(config.roots, vec![temp.path().join("src")]);
        assert_eq!(config.test_regex, vec![r"\.check\.js$"]);
    }

    #[test]
    fn rejects_unknown_options() {
        let temp = tempdir().expect("temp dir");
        fs::write(
            temp.path().join("jest.config.json"),
            r#"{"madeUpOption":true}"#,
        )
        .expect("write config");

        let error = load(temp.path(), None).expect_err("unknown option should fail");
        assert!(error.to_string().contains("madeUpOption"));
    }
}
