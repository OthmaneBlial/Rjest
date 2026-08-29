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

use rjest_core::ModuleNameMapper;

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
    #[error("configuration options `testMatch` and `testRegex` cannot be used together")]
    ConflictingTestPatterns,
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
    pub module_path_ignore_patterns: Vec<String>,
    pub module_file_extensions: Vec<String>,
    pub extensions_to_treat_as_esm: Vec<String>,
    pub module_name_mapper: Vec<ModuleNameMapper>,
    pub module_paths: Vec<PathBuf>,
    pub automock: bool,
    pub clear_mocks: bool,
    pub test_environment: String,
    pub test_environment_options: Value,
    pub setup_files_after_env: Vec<PathBuf>,
    pub snapshot_serializers: Vec<String>,
    pub transform: BTreeMap<String, Value>,
    pub transform_ignore_patterns: Vec<String>,
    pub test_timeout: u64,
    pub max_workers: Option<String>,
    pub collect_coverage: bool,
    pub collect_coverage_from: Vec<String>,
    pub coverage_directory: PathBuf,
    pub coverage_path_ignore_patterns: Vec<String>,
    pub coverage_provider: String,
    pub coverage_reporters: Vec<Value>,
    pub coverage_threshold: Value,
    pub watch_plugins: Value,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawProjectConfig {
    root_dir: Option<String>,
    roots: Option<Vec<String>>,
    test_match: Option<Vec<String>>,
    test_regex: Option<OneOrMany>,
    test_path_ignore_patterns: Option<Vec<String>>,
    module_path_ignore_patterns: Option<Vec<String>>,
    module_file_extensions: Option<Vec<String>>,
    extensions_to_treat_as_esm: Option<Vec<String>>,
    module_name_mapper: Option<serde_json::Map<String, Value>>,
    module_paths: Option<Vec<String>>,
    automock: Option<bool>,
    clear_mocks: Option<bool>,
    test_environment: Option<String>,
    test_environment_options: Option<Value>,
    setup_files_after_env: Option<Vec<String>>,
    snapshot_serializers: Option<Vec<String>>,
    transform: Option<BTreeMap<String, Value>>,
    transform_ignore_patterns: Option<Vec<String>>,
    test_timeout: Option<u64>,
    max_workers: Option<NumberOrString>,
    collect_coverage: Option<bool>,
    collect_coverage_from: Option<Vec<String>>,
    coverage_directory: Option<String>,
    coverage_path_ignore_patterns: Option<Vec<String>>,
    coverage_provider: Option<String>,
    coverage_reporters: Option<Vec<Value>>,
    coverage_threshold: Option<Value>,
    watch_plugins: Option<Value>,
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
        let coverage_directory = root_dir.join("coverage");
        Ok(Self {
            roots: vec![root_dir.clone()],
            root_dir,
            test_match: vec![
                "**/__tests__/**/*.?([mc])[jt]s?(x)".into(),
                "**/?(*.)+(spec|test).?([mc])[jt]s?(x)".into(),
            ],
            test_regex: Vec::new(),
            test_path_ignore_patterns: vec!["/node_modules/".into()],
            module_path_ignore_patterns: Vec::new(),
            module_file_extensions: [
                "js", "mjs", "cjs", "jsx", "ts", "mts", "cts", "tsx", "json", "node",
            ]
            .into_iter()
            .map(String::from)
            .collect(),
            extensions_to_treat_as_esm: Vec::new(),
            module_name_mapper: Vec::new(),
            module_paths: Vec::new(),
            automock: false,
            clear_mocks: false,
            test_environment: "node".into(),
            test_environment_options: serde_json::json!({}),
            setup_files_after_env: Vec::new(),
            snapshot_serializers: Vec::new(),
            transform: BTreeMap::new(),
            transform_ignore_patterns: vec!["/node_modules/".into()],
            test_timeout: 5_000,
            max_workers: None,
            collect_coverage: false,
            collect_coverage_from: Vec::new(),
            coverage_directory,
            coverage_path_ignore_patterns: vec!["/node_modules/".into()],
            coverage_provider: "babel".into(),
            coverage_reporters: ["json", "text", "lcov", "clover"]
                .into_iter()
                .map(|reporter| Value::String(reporter.into()))
                .collect(),
            coverage_threshold: serde_json::json!({}),
            watch_plugins: serde_json::json!([]),
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
        let mut defaults = ProjectConfig::defaults(&project_dir)?;
        defaults.test_environment =
            default_test_environment(&project_dir, &defaults.test_environment);
        return Ok(defaults);
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

/// Loads a Jest project configuration supplied as an inline JSON object.
///
/// Jest accepts JSON through `--config`; relative paths and `<rootDir>` are
/// resolved from `project_dir` just as they are for CLI-injected Jest config.
///
/// # Errors
///
/// Returns [`ConfigError`] when the JSON cannot be decoded or normalized.
pub fn load_inline_json(project_dir: &Path, source: &str) -> Result<ProjectConfig, ConfigError> {
    let project_dir = absolute(project_dir)?;
    let path = PathBuf::from("<inline --config>");
    let value = serde_json::from_str(source).map_err(|source| ConfigError::Json {
        path: path.clone(),
        source,
    })?;
    let raw = serde_json::from_value(value).map_err(|source| ConfigError::Json { path, source })?;
    normalize(raw, &project_dir)
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
    let roots = normalize_roots(raw.roots, &root_dir, &defaults.roots)?;

    let test_environment =
        normalize_test_environment(raw.test_environment, &root_dir, &defaults.test_environment)?;

    let resolve_paths = |values: Option<Vec<String>>| {
        values
            .unwrap_or_default()
            .iter()
            .map(|value| absolute(&resolve_root_token(&root_dir, value)))
            .collect::<Result<Vec<_>, ConfigError>>()
    };
    let module_paths = resolve_paths(raw.module_paths)?;
    let module_name_mapper = normalize_module_name_mapper(
        raw.module_name_mapper,
        &root_dir,
        defaults.module_name_mapper,
    )?;
    let setup_files_after_env = resolve_paths(raw.setup_files_after_env)?;
    let (test_match, test_regex) = normalize_test_patterns(
        raw.test_match,
        raw.test_regex,
        defaults.test_match,
        defaults.test_regex,
        &root_dir,
    )?;

    let (coverage_provider, coverage_directory) = normalize_coverage(
        raw.coverage_provider,
        raw.coverage_directory,
        defaults.coverage_provider,
        defaults.coverage_directory,
        &root_dir,
    )?;
    let transform = normalize_transform(raw.transform, &root_dir, defaults.transform)?;

    Ok(ProjectConfig {
        root_dir,
        roots,
        test_match,
        test_regex,
        test_path_ignore_patterns: raw
            .test_path_ignore_patterns
            .unwrap_or(defaults.test_path_ignore_patterns),
        module_path_ignore_patterns: raw
            .module_path_ignore_patterns
            .unwrap_or(defaults.module_path_ignore_patterns),
        module_file_extensions: raw
            .module_file_extensions
            .unwrap_or(defaults.module_file_extensions),
        extensions_to_treat_as_esm: normalize_esm_extensions(
            raw.extensions_to_treat_as_esm,
            defaults.extensions_to_treat_as_esm,
        )?,
        module_name_mapper,
        module_paths,
        automock: raw.automock.unwrap_or(defaults.automock),
        clear_mocks: raw.clear_mocks.unwrap_or(defaults.clear_mocks),
        test_environment,
        test_environment_options: raw
            .test_environment_options
            .unwrap_or(defaults.test_environment_options),
        setup_files_after_env,
        snapshot_serializers: raw
            .snapshot_serializers
            .unwrap_or(defaults.snapshot_serializers),
        transform,
        transform_ignore_patterns: raw
            .transform_ignore_patterns
            .unwrap_or(defaults.transform_ignore_patterns),
        test_timeout: raw.test_timeout.unwrap_or(defaults.test_timeout),
        max_workers: raw.max_workers.map(NumberOrString::into_string),
        collect_coverage: raw.collect_coverage.unwrap_or(defaults.collect_coverage),
        collect_coverage_from: raw
            .collect_coverage_from
            .unwrap_or(defaults.collect_coverage_from),
        coverage_directory,
        coverage_path_ignore_patterns: raw
            .coverage_path_ignore_patterns
            .unwrap_or(defaults.coverage_path_ignore_patterns),
        coverage_provider,
        coverage_reporters: raw
            .coverage_reporters
            .unwrap_or(defaults.coverage_reporters),
        coverage_threshold: raw
            .coverage_threshold
            .unwrap_or(defaults.coverage_threshold),
        watch_plugins: raw.watch_plugins.unwrap_or(defaults.watch_plugins),
    })
}

fn normalize_esm_extensions(
    configured: Option<Vec<String>>,
    defaults: Vec<String>,
) -> Result<Vec<String>, ConfigError> {
    let extensions = configured.unwrap_or(defaults);
    for extension in &extensions {
        if !extension.starts_with('.') || extension.len() == 1 {
            return Err(ConfigError::UnsupportedValue {
                field: "extensionsToTreatAsEsm".into(),
                value: extension.clone(),
            });
        }
        if matches!(extension.as_str(), ".js" | ".cjs" | ".mjs") {
            return Err(ConfigError::UnsupportedValue {
                field: "extensionsToTreatAsEsm".into(),
                value: extension.clone(),
            });
        }
    }
    Ok(extensions)
}

fn normalize_transform(
    configured: Option<BTreeMap<String, Value>>,
    root_dir: &Path,
    defaults: BTreeMap<String, Value>,
) -> Result<BTreeMap<String, Value>, ConfigError> {
    let mut transforms = configured.unwrap_or(defaults);
    let root = root_dir.to_string_lossy();
    for (pattern, value) in &mut transforms {
        let module_name = match value {
            Value::String(module_name) => module_name,
            Value::Array(values) => {
                if !matches!(values.first(), Some(Value::String(_))) {
                    return Err(ConfigError::UnsupportedValue {
                        field: format!("transform.{pattern}"),
                        value: Value::Array(values.clone()).to_string(),
                    });
                }
                let Value::String(module_name) = &mut values[0] else {
                    unreachable!("validated transform module name")
                };
                module_name
            }
            other => {
                return Err(ConfigError::UnsupportedValue {
                    field: format!("transform.{pattern}"),
                    value: other.to_string(),
                });
            }
        };
        *module_name = module_name.replace("<rootDir>", &root);
    }
    Ok(transforms)
}

fn normalize_module_name_mapper(
    configured: Option<serde_json::Map<String, Value>>,
    root_dir: &Path,
    defaults: Vec<ModuleNameMapper>,
) -> Result<Vec<ModuleNameMapper>, ConfigError> {
    let Some(configured) = configured else {
        return Ok(defaults);
    };
    configured
        .into_iter()
        .map(|(pattern, value)| {
            let replacements = match value {
                Value::String(value) => vec![value],
                Value::Array(values) => values
                    .into_iter()
                    .map(|value| match value {
                        Value::String(value) => Ok(value),
                        other => Err(ConfigError::UnsupportedValue {
                            field: format!("moduleNameMapper.{pattern}"),
                            value: other.to_string(),
                        }),
                    })
                    .collect::<Result<Vec<_>, _>>()?,
                other => {
                    return Err(ConfigError::UnsupportedValue {
                        field: format!("moduleNameMapper.{pattern}"),
                        value: other.to_string(),
                    });
                }
            };
            if replacements.is_empty() {
                return Err(ConfigError::UnsupportedValue {
                    field: format!("moduleNameMapper.{pattern}"),
                    value: "[]".into(),
                });
            }
            let root = root_dir.to_string_lossy();
            Ok(ModuleNameMapper {
                pattern,
                replacements: replacements
                    .into_iter()
                    .map(|replacement| replacement.replace("<rootDir>", &root))
                    .collect(),
            })
        })
        .collect()
}

fn normalize_test_environment(
    configured: Option<String>,
    root_dir: &Path,
    fallback: &str,
) -> Result<String, ConfigError> {
    let environment = configured.unwrap_or_else(|| default_test_environment(root_dir, fallback));
    if matches!(
        environment.as_str(),
        "node" | "jest-environment-node" | "jsdom" | "jest-environment-jsdom"
    ) || Path::new(&environment).is_absolute()
    {
        Ok(environment)
    } else {
        Err(ConfigError::UnsupportedValue {
            field: "testEnvironment".into(),
            value: environment,
        })
    }
}

fn normalize_test_patterns(
    configured_match: Option<Vec<String>>,
    configured_regex: Option<OneOrMany>,
    default_match: Vec<String>,
    default_regex: Vec<String>,
    root_dir: &Path,
) -> Result<(Vec<String>, Vec<String>), ConfigError> {
    if configured_match.is_some() && configured_regex.is_some() {
        return Err(ConfigError::ConflictingTestPatterns);
    }
    let test_match = if configured_regex.is_some() {
        Vec::new()
    } else {
        configured_match.unwrap_or(default_match)
    };
    let test_regex = configured_regex.map_or(default_regex, OneOrMany::into_vec);
    let root = root_dir.to_string_lossy();
    let replace_root = |pattern: String| pattern.replace("<rootDir>", &root);
    Ok((
        test_match.into_iter().map(&replace_root).collect(),
        test_regex.into_iter().map(replace_root).collect(),
    ))
}

fn normalize_roots(
    configured: Option<Vec<String>>,
    root_dir: &Path,
    defaults: &[PathBuf],
) -> Result<Vec<PathBuf>, ConfigError> {
    let roots = configured.map_or_else(
        || Ok(defaults.to_vec()),
        |values| {
            values
                .iter()
                .map(|value| absolute(&resolve_root_token(root_dir, value)))
                .collect()
        },
    )?;
    for root in &roots {
        ensure_directory(root)?;
    }
    Ok(roots)
}

fn normalize_coverage(
    configured_provider: Option<String>,
    configured_directory: Option<String>,
    default_provider: String,
    default_directory: PathBuf,
    root_dir: &Path,
) -> Result<(String, PathBuf), ConfigError> {
    let provider = configured_provider.unwrap_or(default_provider);
    if provider != "babel" && provider != "v8" {
        return Err(ConfigError::UnsupportedValue {
            field: "coverageProvider".into(),
            value: provider,
        });
    }
    let directory = configured_directory.map_or_else(
        || Ok(default_directory),
        |value| absolute(&resolve_root_token(root_dir, &value)),
    )?;
    Ok((provider, directory))
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

fn default_test_environment(root_dir: &Path, fallback: &str) -> String {
    let package_path = root_dir.join("node_modules/jest/package.json");
    let Ok(package) = read_json(&package_path) else {
        return fallback.to_owned();
    };
    let major = package
        .get("version")
        .and_then(Value::as_str)
        .and_then(|version| version.split('.').next())
        .and_then(|value| value.parse::<u64>().ok());
    if major.is_some_and(|major| major < 27) {
        "jsdom".into()
    } else {
        fallback.to_owned()
    }
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
    fn loads_inline_json_configuration_from_the_project_directory() {
        let temp = tempdir().expect("temp dir");
        fs::create_dir(temp.path().join("src")).expect("source directory");

        let config = load_inline_json(
            temp.path(),
            r#"{
              "roots":["<rootDir>/src"],
              "testRegex":"\\.check\\.ts$",
              "transform":{"^.+\\.ts$":["babel-jest",{"presets":["preset"]}]}
            }"#,
        )
        .expect("inline config");

        assert_eq!(config.root_dir, temp.path());
        assert_eq!(config.roots, [temp.path().join("src")]);
        assert_eq!(config.test_regex, [r"\.check\.ts$"]);
        assert!(config.transform.contains_key(r"^.+\.ts$"));
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
        assert!(config.test_match.is_empty());
        assert_eq!(config.test_regex, vec![r"\.check\.js$"]);
    }

    #[test]
    fn rejects_explicit_test_match_and_test_regex_together() {
        let temp = tempdir().expect("temp dir");
        fs::write(
            temp.path().join("package.json"),
            r#"{"jest":{"testMatch":["**/*.test.js"],"testRegex":"\\.test\\.js$"}}"#,
        )
        .expect("write config");

        assert!(matches!(
            load(temp.path(), None),
            Err(ConfigError::ConflictingTestPatterns)
        ));
    }

    #[test]
    fn preserves_the_pre_jest_27_jsdom_default() {
        let temp = tempdir().expect("temp dir");
        fs::create_dir_all(temp.path().join("node_modules/jest")).expect("create Jest package");
        fs::write(
            temp.path().join("node_modules/jest/package.json"),
            r#"{"version":"25.5.4"}"#,
        )
        .expect("write Jest package");

        let config = load(temp.path(), None).expect("load defaults");
        assert_eq!(config.test_environment, "jsdom");
    }

    #[test]
    fn normalizes_runtime_and_tooling_fields_without_hiding_unknowns() {
        let temp = tempdir().expect("temp dir");
        fs::create_dir(temp.path().join("src")).expect("create src");
        fs::create_dir(temp.path().join("test")).expect("create test");
        fs::write(
            temp.path().join("jest.config.json"),
            r#"{
              "modulePaths":["<rootDir>/src"],
              "moduleNameMapper":{
                "^@first/(.*)$":"<rootDir>/src/$1",
                "^@fallback$":["missing-module","<rootDir>/src/fallback.js"]
              },
              "extensionsToTreatAsEsm":[".ts"],
              "automock":true,
              "clearMocks":true,
              "modulePathIgnorePatterns":["/dist/"],
              "setupFilesAfterEnv":["<rootDir>/test/setup.ts"],
              "snapshotSerializers":["fixture-serializer"],
              "testEnvironment":"jsdom",
              "testEnvironmentOptions":{"url":"https://example.test/"},
              "transform":{"^.+\\.tsx?$":"babel-jest"},
              "transformIgnorePatterns":["/vendor/"],
              "collectCoverage":true,
              "collectCoverageFrom":["src/**/*.{js,ts}"],
              "coverageDirectory":"<rootDir>/artifacts/coverage",
              "coveragePathIgnorePatterns":["/generated/"],
              "coverageProvider":"babel",
              "coverageReporters":["json-summary","lcov"],
              "coverageThreshold":{"global":{"lines":90}},
              "watchPlugins":["jest-watch-typeahead/filename"]
            }"#,
        )
        .expect("write config");

        let config = load(temp.path(), None).expect("load runtime config");
        assert_eq!(config.module_paths, [temp.path().join("src")]);
        assert_eq!(config.module_name_mapper[0].pattern, r"^@first/(.*)$");
        assert_eq!(
            config.module_name_mapper[0].replacements,
            [temp.path().join("src/$1").to_string_lossy().into_owned()]
        );
        assert_eq!(config.module_name_mapper[1].pattern, r"^@fallback$");
        assert_eq!(
            config.module_name_mapper[1].replacements,
            [
                "missing-module".to_owned(),
                temp.path()
                    .join("src/fallback.js")
                    .to_string_lossy()
                    .into_owned()
            ]
        );
        assert!(config.automock);
        assert!(config.clear_mocks);
        assert_eq!(config.extensions_to_treat_as_esm, [".ts"]);
        assert_eq!(
            config.setup_files_after_env,
            [temp.path().join("test/setup.ts")]
        );
        assert_eq!(config.test_environment, "jsdom");
        assert!(config.transform.contains_key(r"^.+\.tsx?$"));
        assert_eq!(config.snapshot_serializers, ["fixture-serializer"]);
        assert!(config.collect_coverage);
        assert_eq!(
            config.coverage_directory,
            temp.path().join("artifacts/coverage")
        );
        assert_eq!(config.coverage_reporters, ["json-summary", "lcov"]);
    }

    #[test]
    fn rejects_extensions_with_javascript_inferred_semantics() {
        let temp = tempdir().expect("temp dir");
        fs::write(
            temp.path().join("jest.config.json"),
            r#"{"extensionsToTreatAsEsm":[".js"]}"#,
        )
        .expect("write config");

        let error = load(temp.path(), None).expect_err(".js semantics come from package type");
        assert!(error.to_string().contains("extensionsToTreatAsEsm"));
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
