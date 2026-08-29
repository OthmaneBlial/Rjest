//! Jest-compatible configuration discovery and normalization.

use std::{
    collections::BTreeMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

const CONFIG_FILENAMES: &[&str] = &[
    "jest.config.js",
    "jest.config.ts",
    "jest.config.mjs",
    "jest.config.mts",
    "jest.config.cjs",
    "jest.config.cts",
    "jest.config.json",
];
const CONFIG_RESULT_PREFIX: &str = "__RJEST_CONFIG__";
const CONFIG_LOADER: &str = include_str!("../runtime/config-loader.mjs");

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
    #[error("multiple Jest configuration files were found: {0}")]
    MultipleConfigs(String),
    #[error("unsupported configuration fields: {0}; Rjest does not silently ignore Jest options")]
    UnsupportedFields(String),
    #[error("configuration format `{0}` is not supported; use a standard Jest config extension")]
    UnsupportedFormat(String),
    #[error("unsupported value for `{field}`: {value}")]
    UnsupportedValue { field: String, value: String },
    #[error("cannot start Node config loader: {0}")]
    NodeSpawn(#[source] std::io::Error),
    #[error("cannot write to Node config loader: {0}")]
    NodeWrite(#[source] std::io::Error),
    #[error("cannot wait for Node config loader: {0}")]
    NodeWait(#[source] std::io::Error),
    #[error("Node config loader returned no result for `{path}`{details}")]
    MissingNodeResult { path: PathBuf, details: String },
    #[error("cannot evaluate Jest config `{path}`: {message}")]
    NodeEvaluation { path: PathBuf, message: String },
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
    pub test_environment: String,
    pub test_timeout: u64,
    pub max_workers: Option<String>,
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
    test_environment: Option<String>,
    test_timeout: Option<u64>,
    max_workers: Option<NumberOrString>,
    #[serde(flatten)]
    unsupported: BTreeMap<String, Value>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum OneOrMany {
    One(String),
    Many(Vec<String>),
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum NumberOrString {
    Number(usize),
    String(String),
}

impl NumberOrString {
    fn into_string(self) -> String {
        match self {
            Self::Number(value) => value.to_string(),
            Self::String(value) => value,
        }
    }
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
            test_environment: "node".into(),
            test_timeout: 5_000,
            max_workers: None,
        })
    }
}

/// Loads an explicit config, or searches the project root using Jest's standard
/// config extension order. Executable configs run in Node with the invoking
/// user's normal permissions, matching Jest's trust model.
///
/// # Errors
///
/// Returns a [`ConfigError`] when configuration cannot be located, read,
/// decoded, normalized, or contains unsupported fields.
pub fn load(project_dir: &Path, explicit: Option<&Path>) -> Result<ProjectConfig, ConfigError> {
    let project_dir = absolute(project_dir)?;
    let config_path = match explicit {
        Some(path) => Some(resolve_from(&project_dir, path)),
        None => find_config(&project_dir)?,
    };

    let Some(config_path) = config_path else {
        return ProjectConfig::defaults(&project_dir);
    };

    let extension = config_path.extension().and_then(|value| value.to_str());
    let mut value = match extension {
        Some("json") => read_json(&config_path)?,
        Some("js" | "ts" | "mjs" | "mts" | "cjs" | "cts") => evaluate_config(&config_path)?,
        other => {
            return Err(ConfigError::UnsupportedFormat(
                other.unwrap_or("unknown").to_owned(),
            ));
        }
    };

    if config_path.file_name().and_then(|name| name.to_str()) == Some("package.json") {
        value = value
            .get_mut("jest")
            .map(Value::take)
            .ok_or_else(|| ConfigError::MissingPackageConfig(config_path.clone()))?;
        if let Value::String(referenced) = value {
            let referenced = resolve_from(
                config_path.parent().unwrap_or(&project_dir),
                Path::new(&referenced),
            );
            return load(&project_dir, Some(&referenced));
        }
    }

    let raw: RawProjectConfig =
        serde_json::from_value(value).map_err(|source| ConfigError::Json {
            path: config_path.clone(),
            source,
        })?;
    normalize(raw, config_path.parent().unwrap_or(&project_dir))
}

fn read_json(path: &Path) -> Result<Value, ConfigError> {
    let source = fs::read_to_string(path).map_err(|source| ConfigError::Read {
        path: path.to_path_buf(),
        source,
    })?;
    serde_json::from_str(&source).map_err(|source| ConfigError::Json {
        path: path.to_path_buf(),
        source,
    })
}

fn evaluate_config(path: &Path) -> Result<Value, ConfigError> {
    let request =
        serde_json::to_vec(&serde_json::json!({"path": path})).expect("path is serializable");
    let mut child = Command::new("node")
        .arg("--input-type=module")
        .arg("--eval")
        .arg(CONFIG_LOADER)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(ConfigError::NodeSpawn)?;
    child
        .stdin
        .take()
        .expect("piped stdin is available")
        .write_all(&request)
        .map_err(ConfigError::NodeWrite)?;
    let output = child.wait_with_output().map_err(ConfigError::NodeWait)?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let payload = stdout
        .lines()
        .rev()
        .find_map(|line| line.strip_prefix(CONFIG_RESULT_PREFIX))
        .ok_or_else(|| ConfigError::MissingNodeResult {
            path: path.to_path_buf(),
            details: process_details(&stdout, &String::from_utf8_lossy(&output.stderr)),
        })?;
    let response: Value = serde_json::from_str(payload).map_err(|source| ConfigError::Json {
        path: path.to_path_buf(),
        source,
    })?;
    if response.get("ok").and_then(Value::as_bool) != Some(true) {
        return Err(ConfigError::NodeEvaluation {
            path: path.to_path_buf(),
            message: response
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("unknown configuration error")
                .to_owned(),
        });
    }
    response
        .get("config")
        .cloned()
        .ok_or_else(|| ConfigError::NodeEvaluation {
            path: path.to_path_buf(),
            message: "loader response did not contain a config object".into(),
        })
}

fn process_details(stdout: &str, stderr: &str) -> String {
    let details = [stdout.trim(), stderr.trim()]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    if details.is_empty() {
        String::new()
    } else {
        format!(":\n{details}")
    }
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

    let test_environment = raw
        .test_environment
        .unwrap_or(defaults.test_environment.clone());
    if !matches!(test_environment.as_str(), "node" | "jest-environment-node") {
        return Err(ConfigError::UnsupportedValue {
            field: "testEnvironment".into(),
            value: test_environment,
        });
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
        test_environment,
        test_timeout: raw.test_timeout.unwrap_or(defaults.test_timeout),
        max_workers: raw.max_workers.map(NumberOrString::into_string),
    })
}

fn find_config(project_dir: &Path) -> Result<Option<PathBuf>, ConfigError> {
    let mut candidates = CONFIG_FILENAMES
        .iter()
        .map(|name| project_dir.join(name))
        .filter(|candidate| candidate.is_file())
        .collect::<Vec<_>>();
    let package = project_dir.join("package.json");
    if package.is_file() && read_json(&package)?.get("jest").is_some() {
        candidates.push(package);
    }
    if candidates.len() > 1 {
        return Err(ConfigError::MultipleConfigs(
            candidates
                .iter()
                .map(|path| path.display().to_string())
                .collect::<Vec<_>>()
                .join(", "),
        ));
    }
    Ok(candidates.pop())
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

    #[test]
    fn loads_javascript_commonjs_and_typescript_configs() {
        let fixtures = [
            (
                "mjs",
                "export default async () => ({testMatch: ['**/*.check.js'], testTimeout: 1234, maxWorkers: '25%'});",
            ),
            (
                "cjs",
                "module.exports = {testMatch: ['**/*.check.js'], testTimeout: 1234, maxWorkers: 2};",
            ),
            (
                "ts",
                "type Config = {testMatch: string[], testTimeout: number, maxWorkers: string}; const config: Config = {testMatch: ['**/*.check.js'], testTimeout: 1234, maxWorkers: '25%'}; export default config;",
            ),
        ];
        for (extension, source) in fixtures {
            let temp = tempdir().expect("temp dir");
            fs::write(temp.path().join(format!("jest.config.{extension}")), source)
                .expect("write executable config");

            let config = load(temp.path(), None).expect("load executable config");
            assert_eq!(config.test_match, ["**/*.check.js"]);
            assert_eq!(config.test_timeout, 1_234);
            assert!(matches!(config.max_workers.as_deref(), Some("25%" | "2")));
        }
    }

    #[test]
    fn rejects_multiple_config_sources() {
        let temp = tempdir().expect("temp dir");
        fs::write(temp.path().join("jest.config.mjs"), "export default {};")
            .expect("write module config");
        fs::write(
            temp.path().join("package.json"),
            r#"{"jest":{"testTimeout":1000}}"#,
        )
        .expect("write package config");

        assert!(matches!(
            load(temp.path(), None),
            Err(ConfigError::MultipleConfigs(_))
        ));
    }

    #[test]
    fn follows_package_json_string_config_reference() {
        let temp = tempdir().expect("temp dir");
        fs::write(
            temp.path().join("package.json"),
            r#"{"jest":"config/rjest.cjs"}"#,
        )
        .expect("write package config");
        fs::create_dir(temp.path().join("config")).expect("config directory");
        fs::write(
            temp.path().join("config/rjest.cjs"),
            "module.exports = {testTimeout: 987};",
        )
        .expect("write referenced config");

        let config = load(temp.path(), None).expect("load referenced config");
        assert_eq!(config.test_timeout, 987);
        assert_eq!(config.root_dir, temp.path().join("config"));
    }
}
