//! Jest-compatible configuration discovery and normalization.

use std::{
    collections::BTreeMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use thiserror::Error;

use rjest_core::{
    FakeTimersConfig, HasteConfig, MockLifecycleConfig, ModuleNameMapper, SnapshotFormat,
};

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
const FAKEABLE_TIMER_APIS: &[&str] = &[
    "Date",
    "Temporal",
    "cancelAnimationFrame",
    "cancelIdleCallback",
    "clearImmediate",
    "clearInterval",
    "clearTimeout",
    "hrtime",
    "nextTick",
    "performance",
    "queueMicrotask",
    "requestAnimationFrame",
    "requestIdleCallback",
    "setImmediate",
    "setInterval",
    "setTimeout",
];

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
    #[error("could not find a Jest configuration or package root from `{0}`")]
    MissingConfig(PathBuf),
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
#[allow(clippy::struct_excessive_bools)]
pub struct ProjectConfig {
    pub display_name: Option<ProjectDisplayName>,
    pub projects: Vec<ProjectConfig>,
    pub root_dir: PathBuf,
    pub roots: Vec<PathBuf>,
    pub test_match: Vec<String>,
    pub test_regex: Vec<String>,
    pub test_path_ignore_patterns: Vec<String>,
    pub module_path_ignore_patterns: Vec<String>,
    pub module_file_extensions: Vec<String>,
    pub extensions_to_treat_as_esm: Vec<String>,
    pub module_name_mapper: Vec<ModuleNameMapper>,
    pub module_directories: Vec<String>,
    pub module_paths: Vec<PathBuf>,
    pub resolver: Option<String>,
    pub automock: bool,
    pub reset_modules: bool,
    #[serde(flatten)]
    pub mock_lifecycle: MockLifecycleConfig,
    pub fake_timers: FakeTimersConfig,
    pub globals: Value,
    pub haste: HasteConfig,
    pub detect_open_handles: bool,
    pub force_exit: bool,
    pub max_concurrency: usize,
    pub pass_with_no_tests: bool,
    pub test_environment: String,
    pub test_environment_options: Value,
    pub setup_files: Vec<PathBuf>,
    pub setup_files_after_env: Vec<PathBuf>,
    pub snapshot_serializers: Vec<String>,
    pub snapshot_format: SnapshotFormat,
    pub prettier_path: Option<String>,
    pub transform: BTreeMap<String, Value>,
    pub transform_ignore_patterns: Vec<String>,
    pub test_timeout: u64,
    pub bail: usize,
    pub randomize: bool,
    pub show_seed: bool,
    pub silent: bool,
    pub max_workers: Option<String>,
    pub worker_idle_memory_limit: Option<String>,
    pub collect_coverage: bool,
    pub collect_coverage_from: Vec<String>,
    pub coverage_directory: PathBuf,
    pub coverage_path_ignore_patterns: Vec<String>,
    pub coverage_provider: String,
    pub coverage_reporters: Vec<Value>,
    pub coverage_threshold: Value,
    pub watch_plugins: Value,
}

/// A normalized Jest project label. Jest accepts either a name string or a
/// `{name, color}` object and assigns a default color to the string form.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDisplayName {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawProjectConfig {
    display_name: Option<Value>,
    projects: Option<Vec<RawProjectEntry>>,
    preset: Option<String>,
    root_dir: Option<String>,
    roots: Option<Vec<String>>,
    test_match: Option<Vec<String>>,
    test_regex: Option<OneOrMany>,
    test_path_ignore_patterns: Option<Vec<String>>,
    module_path_ignore_patterns: Option<Vec<String>>,
    module_file_extensions: Option<Vec<String>>,
    extensions_to_treat_as_esm: Option<Vec<String>>,
    module_name_mapper: Option<serde_json::Map<String, Value>>,
    module_directories: Option<Vec<String>>,
    module_paths: Option<Vec<String>>,
    resolver: Option<String>,
    automock: Option<bool>,
    reset_modules: Option<bool>,
    clear_mocks: Option<bool>,
    reset_mocks: Option<bool>,
    restore_mocks: Option<bool>,
    fake_timers: Option<RawFakeTimersConfig>,
    globals: Option<Value>,
    haste: Option<RawHasteConfig>,
    detect_open_handles: Option<bool>,
    force_exit: Option<bool>,
    max_concurrency: Option<usize>,
    pass_with_no_tests: Option<bool>,
    test_environment: Option<String>,
    test_environment_options: Option<Value>,
    setup_files: Option<Vec<String>>,
    setup_files_after_env: Option<Vec<String>>,
    snapshot_serializers: Option<Vec<String>>,
    snapshot_format: Option<RawSnapshotFormat>,
    #[serde(default)]
    prettier_path: RawPrettierPath,
    transform: Option<BTreeMap<String, Value>>,
    transform_ignore_patterns: Option<Vec<String>>,
    test_timeout: Option<u64>,
    bail: Option<Value>,
    randomize: Option<bool>,
    show_seed: Option<bool>,
    silent: Option<bool>,
    max_workers: Option<NumberOrString>,
    worker_idle_memory_limit: Option<MemoryLimit>,
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
enum RawProjectEntry {
    Path(String),
    Inline(Box<RawProjectConfig>),
}

#[derive(Debug, Default)]
enum RawPrettierPath {
    #[default]
    Missing,
    Configured(Value),
}

impl<'de> Deserialize<'de> for RawPrettierPath {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        Value::deserialize(deserializer).map(Self::Configured)
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawFakeTimersConfig {
    enable_globally: Option<bool>,
    legacy_fake_timers: Option<bool>,
    advance_timers: Option<Value>,
    do_not_fake: Option<Vec<String>>,
    now: Option<u64>,
    timer_limit: Option<serde_json::Number>,
    #[serde(flatten)]
    unsupported: BTreeMap<String, Value>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawHasteConfig {
    default_platform: Option<String>,
    platforms: Option<Vec<String>>,
    #[serde(flatten)]
    unsupported: BTreeMap<String, Value>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawSnapshotFormat {
    escape_string: Option<bool>,
    print_basic_prototype: Option<bool>,
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

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum MemoryLimit {
    Number(f64),
    String(String),
}

impl MemoryLimit {
    fn into_string(self) -> String {
        match self {
            Self::Number(value) => value.to_string(),
            Self::String(value) => value,
        }
    }
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
            display_name: None,
            projects: Vec::new(),
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
            module_directories: vec!["node_modules".into()],
            module_paths: Vec::new(),
            resolver: None,
            automock: false,
            reset_modules: false,
            mock_lifecycle: MockLifecycleConfig::default(),
            fake_timers: FakeTimersConfig::default(),
            globals: serde_json::json!({}),
            haste: HasteConfig::default(),
            detect_open_handles: false,
            force_exit: false,
            max_concurrency: 5,
            pass_with_no_tests: false,
            test_environment: "node".into(),
            test_environment_options: serde_json::json!({}),
            setup_files: Vec::new(),
            setup_files_after_env: Vec::new(),
            snapshot_serializers: Vec::new(),
            snapshot_format: SnapshotFormat::default(),
            prettier_path: Some("prettier".into()),
            transform: BTreeMap::new(),
            transform_ignore_patterns: vec!["/node_modules/".into()],
            test_timeout: 5_000,
            bail: 0,
            randomize: false,
            show_seed: false,
            silent: false,
            max_workers: None,
            worker_idle_memory_limit: None,
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
        Some(path) => resolve_from(&project_dir, path),
        None => find_config(&project_dir)?,
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
        let configured = value.get_mut("jest").map(Value::take);
        let Some(configured) = configured.filter(json_value_is_truthy) else {
            return default_project_config(config_path.parent().unwrap_or(&project_dir));
        };
        value = configured;
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
    let config_dir = config_path.parent().unwrap_or(&project_dir);
    normalize(raw, config_dir, config_dir, &project_dir)
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
    normalize(raw, &project_dir, &project_dir, &project_dir)
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
    evaluate_node_loader(&serde_json::json!({"kind": "config", "path": path}), path)
}

fn evaluate_preset(name: &str, root_dir: &Path) -> Result<Value, ConfigError> {
    let label = root_dir.join(name);
    evaluate_node_loader(
        &serde_json::json!({"kind": "preset", "preset": name, "rootDir": root_dir}),
        &label,
    )
}

fn evaluate_node_loader(request: &Value, label: &Path) -> Result<Value, ConfigError> {
    let request = serde_json::to_vec(request).expect("config loader request is serializable");
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
            path: label.to_path_buf(),
            details: process_details(&stdout, &String::from_utf8_lossy(&output.stderr)),
        })?;
    let response: Value = serde_json::from_str(payload).map_err(|source| ConfigError::Json {
        path: label.to_path_buf(),
        source,
    })?;
    if response.get("ok").and_then(Value::as_bool) != Some(true) {
        return Err(ConfigError::NodeEvaluation {
            path: label.to_path_buf(),
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
            path: label.to_path_buf(),
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

fn default_project_config(root_dir: &Path) -> Result<ProjectConfig, ConfigError> {
    let mut defaults = ProjectConfig::defaults(root_dir)?;
    defaults.test_environment = default_test_environment(root_dir, &defaults.test_environment);
    Ok(defaults)
}

fn normalize_mock_lifecycle(
    options: (Option<bool>, Option<bool>, Option<bool>),
    defaults: &ProjectConfig,
) -> MockLifecycleConfig {
    let (clear_mocks, reset_mocks, restore_mocks) = options;
    MockLifecycleConfig {
        clear_mocks: clear_mocks.unwrap_or(defaults.mock_lifecycle.clear_mocks),
        reset_mocks: reset_mocks.unwrap_or(defaults.mock_lifecycle.reset_mocks),
        restore_mocks: restore_mocks.unwrap_or(defaults.mock_lifecycle.restore_mocks),
    }
}

fn merge_preset(
    mut preset: RawProjectConfig,
    mut configured: RawProjectConfig,
) -> RawProjectConfig {
    macro_rules! inherit {
        ($($field:ident),+ $(,)?) => {
            $(
                if configured.$field.is_none() {
                    configured.$field = preset.$field;
                }
            )+
        };
    }

    inherit!(
        display_name,
        projects,
        roots,
        test_match,
        test_regex,
        test_path_ignore_patterns,
        module_file_extensions,
        extensions_to_treat_as_esm,
        module_directories,
        module_paths,
        resolver,
        automock,
        reset_modules,
        clear_mocks,
        reset_mocks,
        restore_mocks,
        fake_timers,
        haste,
        detect_open_handles,
        force_exit,
        max_concurrency,
        pass_with_no_tests,
        test_environment,
        test_environment_options,
        snapshot_serializers,
        snapshot_format,
        transform_ignore_patterns,
        test_timeout,
        bail,
        randomize,
        show_seed,
        silent,
        max_workers,
        worker_idle_memory_limit,
        collect_coverage,
        collect_coverage_from,
        coverage_directory,
        coverage_path_ignore_patterns,
        coverage_provider,
        coverage_reporters,
        coverage_threshold,
        watch_plugins,
    );
    configured.globals = merge_preset_json(preset.globals.take(), configured.globals.take());
    prepend_preset_values(&mut configured.setup_files, preset.setup_files.take());
    prepend_preset_values(
        &mut configured.setup_files_after_env,
        preset.setup_files_after_env.take(),
    );
    prepend_preset_values(
        &mut configured.module_path_ignore_patterns,
        preset.module_path_ignore_patterns.take(),
    );
    configured.module_name_mapper = merge_preset_map(
        preset.module_name_mapper.take(),
        configured.module_name_mapper.take(),
    );
    configured.transform =
        merge_preset_btree_map(preset.transform.take(), configured.transform.take());
    if matches!(&configured.prettier_path, RawPrettierPath::Missing) {
        configured.prettier_path = preset.prettier_path;
    }
    for (field, value) in preset.unsupported {
        configured.unsupported.entry(field).or_insert(value);
    }
    configured
}

fn prepend_preset_values<T>(configured: &mut Option<Vec<T>>, preset: Option<Vec<T>>) {
    let Some(mut preset) = preset else {
        return;
    };
    if let Some(values) = configured {
        preset.append(values);
    }
    *configured = Some(preset);
}

fn merge_preset_map(
    preset: Option<serde_json::Map<String, Value>>,
    configured: Option<serde_json::Map<String, Value>>,
) -> Option<serde_json::Map<String, Value>> {
    match (preset, configured) {
        (None, configured) => configured,
        (preset, None) => preset,
        (Some(mut preset), Some(configured)) => {
            preset.extend(configured);
            Some(preset)
        }
    }
}

fn merge_preset_btree_map(
    preset: Option<BTreeMap<String, Value>>,
    configured: Option<BTreeMap<String, Value>>,
) -> Option<BTreeMap<String, Value>> {
    match (preset, configured) {
        (None, configured) => configured,
        (preset, None) => preset,
        (Some(mut preset), Some(configured)) => {
            preset.extend(configured);
            Some(preset)
        }
    }
}

fn merge_preset_json(preset: Option<Value>, configured: Option<Value>) -> Option<Value> {
    match (preset, configured) {
        (None, configured) => configured,
        (preset, None) => preset,
        (Some(preset), Some(configured)) => Some(merge_json_value(preset, configured)),
    }
}

fn merge_json_value(mut base: Value, configured: Value) -> Value {
    let Value::Object(base_object) = &mut base else {
        return configured;
    };
    let configured = match configured {
        Value::Object(configured) => configured,
        configured => return configured,
    };
    for (key, value) in configured {
        let merged = match base_object.remove(&key) {
            Some(previous) => merge_json_value(previous, value),
            None => value,
        };
        base_object.insert(key, merged);
    }
    base
}

#[allow(clippy::too_many_lines)]
fn normalize(
    mut raw: RawProjectConfig,
    default_root_dir: &Path,
    relative_root_dir: &Path,
    project_dir: &Path,
) -> Result<ProjectConfig, ConfigError> {
    let root_dir = match raw.root_dir.as_deref() {
        None => absolute(default_root_dir)?,
        Some(value) if value == "<rootDir>" || value.starts_with("<rootDir>/") => {
            absolute(&resolve_root_token(default_root_dir, value))?
        }
        Some(value) => absolute(&resolve_from(relative_root_dir, Path::new(&value)))?,
    };
    ensure_directory(&root_dir)?;
    if let Some(preset) = raw.preset.take() {
        let preset = normalize_module_reference(&preset, &root_dir);
        let value = evaluate_preset(&preset, &root_dir)?;
        let preset_raw = serde_json::from_value(value).map_err(|source| ConfigError::Json {
            path: root_dir.join(&preset),
            source,
        })?;
        raw = merge_preset(preset_raw, raw);
    }
    reject_unsupported_fields(&raw.unsupported)?;
    let mock_lifecycle_options = (raw.clear_mocks, raw.reset_mocks, raw.restore_mocks);

    let defaults = ProjectConfig::defaults(&root_dir)?;
    let display_name = normalize_display_name(raw.display_name)?;
    let projects = normalize_projects(raw.projects, default_root_dir, project_dir, &root_dir)?;
    let mock_lifecycle = normalize_mock_lifecycle(mock_lifecycle_options, &defaults);
    let roots = normalize_roots(raw.roots, &root_dir, &defaults.roots)?;

    let test_environment =
        normalize_test_environment(raw.test_environment, &root_dir, &defaults.test_environment);

    let resolve_paths = |values: Option<Vec<String>>| {
        values
            .unwrap_or_default()
            .iter()
            .map(|value| absolute(&resolve_root_token(&root_dir, value)))
            .collect::<Result<Vec<_>, ConfigError>>()
    };
    let module_paths = resolve_paths(raw.module_paths)?;
    let resolver = raw
        .resolver
        .map(|value| normalize_module_reference(&value, &root_dir));
    let module_directories = raw
        .module_directories
        .unwrap_or(defaults.module_directories)
        .into_iter()
        .map(|directory| directory.replace("<rootDir>", root_dir.to_string_lossy().as_ref()))
        .collect();
    let module_name_mapper = normalize_module_name_mapper(
        raw.module_name_mapper,
        &root_dir,
        defaults.module_name_mapper,
    )?;
    let setup_files = resolve_paths(raw.setup_files)?;
    let setup_files_after_env = resolve_paths(raw.setup_files_after_env)?;
    let fake_timers = normalize_fake_timers(raw.fake_timers, defaults.fake_timers)?;
    let globals = normalize_globals(raw.globals, defaults.globals)?;
    let haste = normalize_haste(raw.haste, defaults.haste)?;
    let snapshot_format = normalize_snapshot_format(raw.snapshot_format, defaults.snapshot_format)?;
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
    let prettier_path = match raw.prettier_path {
        RawPrettierPath::Missing => defaults.prettier_path,
        RawPrettierPath::Configured(Value::Null) => None,
        RawPrettierPath::Configured(Value::String(value)) => {
            Some(normalize_module_reference(&value, &root_dir))
        }
        RawPrettierPath::Configured(value) => {
            return Err(ConfigError::UnsupportedValue {
                field: "prettierPath".into(),
                value: value.to_string(),
            });
        }
    };

    Ok(ProjectConfig {
        display_name,
        projects,
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
        module_directories,
        module_paths,
        resolver,
        automock: raw.automock.unwrap_or(defaults.automock),
        reset_modules: raw.reset_modules.unwrap_or(defaults.reset_modules),
        mock_lifecycle,
        fake_timers,
        globals,
        haste,
        detect_open_handles: raw
            .detect_open_handles
            .unwrap_or(defaults.detect_open_handles),
        force_exit: raw.force_exit.unwrap_or(defaults.force_exit),
        max_concurrency: normalize_positive_usize(
            "maxConcurrency",
            raw.max_concurrency,
            defaults.max_concurrency,
        )?,
        pass_with_no_tests: raw
            .pass_with_no_tests
            .unwrap_or(defaults.pass_with_no_tests),
        test_environment,
        test_environment_options: raw
            .test_environment_options
            .unwrap_or(defaults.test_environment_options),
        setup_files,
        setup_files_after_env,
        snapshot_serializers: raw
            .snapshot_serializers
            .unwrap_or(defaults.snapshot_serializers),
        snapshot_format,
        prettier_path,
        transform,
        transform_ignore_patterns: raw
            .transform_ignore_patterns
            .unwrap_or(defaults.transform_ignore_patterns),
        test_timeout: raw.test_timeout.unwrap_or(defaults.test_timeout),
        bail: normalize_bail(raw.bail, defaults.bail)?,
        randomize: raw.randomize.unwrap_or(defaults.randomize),
        show_seed: raw.show_seed.unwrap_or(defaults.show_seed),
        silent: raw.silent.unwrap_or(defaults.silent),
        max_workers: raw.max_workers.map(NumberOrString::into_string),
        worker_idle_memory_limit: normalize_worker_idle_memory_limit(raw.worker_idle_memory_limit),
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

fn normalize_display_name(
    configured: Option<Value>,
) -> Result<Option<ProjectDisplayName>, ConfigError> {
    let Some(configured) = configured else {
        return Ok(None);
    };
    let (name, color) = match configured {
        Value::String(name) if !name.is_empty() => (name, "white".to_owned()),
        Value::Object(mut object) => {
            let name = object
                .remove("name")
                .and_then(|value| value.as_str().map(str::to_owned));
            let color = object
                .remove("color")
                .and_then(|value| value.as_str().map(str::to_owned));
            if !object.is_empty() {
                return Err(ConfigError::UnsupportedValue {
                    field: "displayName".into(),
                    value: Value::Object(object).to_string(),
                });
            }
            match (name, color) {
                (Some(name), Some(color)) if !name.is_empty() && !color.is_empty() => (name, color),
                _ => {
                    return Err(ConfigError::UnsupportedValue {
                        field: "displayName".into(),
                        value: "expected a non-empty string or an object with non-empty `name` and `color` strings".into(),
                    });
                }
            }
        }
        value => {
            return Err(ConfigError::UnsupportedValue {
                field: "displayName".into(),
                value: value.to_string(),
            });
        }
    };
    Ok(Some(ProjectDisplayName { name, color }))
}

fn normalize_projects(
    configured: Option<Vec<RawProjectEntry>>,
    parent_config_dir: &Path,
    project_dir: &Path,
    parent_root_dir: &Path,
) -> Result<Vec<ProjectConfig>, ConfigError> {
    configured
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .map(|(index, project)| match project {
            RawProjectEntry::Inline(raw) => {
                normalize(*raw, parent_config_dir, project_dir, project_dir)
            }
            RawProjectEntry::Path(path) => Err(ConfigError::UnsupportedValue {
                field: format!("projects[{index}]"),
                value: format!(
                    "string project `{}` is not supported yet; use an inline project object",
                    resolve_root_token(parent_root_dir, &path).display()
                ),
            }),
        })
        .collect()
}

fn normalize_module_reference(value: &str, root_dir: &Path) -> String {
    let path = Path::new(value);
    if value == "<rootDir>"
        || value.starts_with("<rootDir>/")
        || path.is_absolute()
        || value.starts_with("./")
        || value.starts_with("../")
    {
        resolve_root_token(root_dir, value)
            .to_string_lossy()
            .into_owned()
    } else {
        value.to_owned()
    }
}

fn normalize_bail(configured: Option<Value>, default: usize) -> Result<usize, ConfigError> {
    let Some(configured) = configured else {
        return Ok(default);
    };
    match configured {
        Value::Bool(enabled) => Ok(usize::from(enabled)),
        Value::Number(value) => value
            .as_u64()
            .and_then(|value| usize::try_from(value).ok())
            .ok_or_else(|| ConfigError::UnsupportedValue {
                field: "bail".into(),
                value: value.to_string(),
            }),
        value => Err(ConfigError::UnsupportedValue {
            field: "bail".into(),
            value: value.to_string(),
        }),
    }
}

fn reject_unsupported_fields(unsupported: &BTreeMap<String, Value>) -> Result<(), ConfigError> {
    if unsupported.is_empty() {
        return Ok(());
    }
    Err(ConfigError::UnsupportedFields(
        unsupported.keys().cloned().collect::<Vec<_>>().join(", "),
    ))
}

fn normalize_globals(configured: Option<Value>, default: Value) -> Result<Value, ConfigError> {
    match configured {
        None => Ok(default),
        Some(Value::Object(values)) => Ok(Value::Object(values)),
        Some(value) => Err(ConfigError::UnsupportedValue {
            field: "globals".into(),
            value: value.to_string(),
        }),
    }
}

fn normalize_haste(
    configured: Option<RawHasteConfig>,
    default: HasteConfig,
) -> Result<HasteConfig, ConfigError> {
    let Some(configured) = configured else {
        return Ok(default);
    };
    if !configured.unsupported.is_empty() {
        return Err(ConfigError::UnsupportedFields(
            configured
                .unsupported
                .keys()
                .map(|field| format!("haste.{field}"))
                .collect::<Vec<_>>()
                .join(", "),
        ));
    }
    if configured.default_platform.as_deref() == Some("")
        || configured
            .platforms
            .as_ref()
            .is_some_and(|platforms| platforms.iter().any(String::is_empty))
    {
        return Err(ConfigError::UnsupportedValue {
            field: "haste".into(),
            value: "platform names must be non-empty strings".into(),
        });
    }
    Ok(HasteConfig {
        default_platform: configured.default_platform.or(default.default_platform),
        platforms: configured.platforms.unwrap_or(default.platforms),
    })
}

fn normalize_positive_usize(
    field: &str,
    configured: Option<usize>,
    default: usize,
) -> Result<usize, ConfigError> {
    let value = configured.unwrap_or(default);
    if value == 0 {
        return Err(ConfigError::UnsupportedValue {
            field: field.into(),
            value: value.to_string(),
        });
    }
    Ok(value)
}

fn normalize_fake_timers(
    configured: Option<RawFakeTimersConfig>,
    defaults: FakeTimersConfig,
) -> Result<FakeTimersConfig, ConfigError> {
    let Some(configured) = configured else {
        return Ok(defaults);
    };
    if !configured.unsupported.is_empty() {
        return Err(ConfigError::UnsupportedFields(
            configured
                .unsupported
                .keys()
                .map(|field| format!("fakeTimers.{field}"))
                .collect::<Vec<_>>()
                .join(", "),
        ));
    }

    let legacy_fake_timers = configured.legacy_fake_timers.unwrap_or(false);
    if legacy_fake_timers
        && (configured.advance_timers.is_some()
            || configured.do_not_fake.is_some()
            || configured.now.is_some()
            || configured.timer_limit.is_some())
    {
        return Err(ConfigError::UnsupportedValue {
            field: "fakeTimers".into(),
            value:
                "legacyFakeTimers cannot be combined with advanceTimers, doNotFake, now, or timerLimit"
                    .into(),
        });
    }

    if let Some(value) = &configured.advance_timers {
        let valid = value.is_boolean()
            || value
                .as_f64()
                .is_some_and(|number| number.is_finite() && number >= 0.0);
        if !valid {
            return Err(ConfigError::UnsupportedValue {
                field: "fakeTimers.advanceTimers".into(),
                value: value.to_string(),
            });
        }
    }
    if configured
        .timer_limit
        .as_ref()
        .and_then(serde_json::Number::as_f64)
        .is_some_and(|number| number < 0.0)
    {
        return Err(ConfigError::UnsupportedValue {
            field: "fakeTimers.timerLimit".into(),
            value: configured
                .timer_limit
                .as_ref()
                .map_or_else(String::new, ToString::to_string),
        });
    }

    let do_not_fake = configured.do_not_fake.unwrap_or_default();
    if let Some(value) = do_not_fake
        .iter()
        .find(|value| !FAKEABLE_TIMER_APIS.contains(&value.as_str()))
    {
        return Err(ConfigError::UnsupportedValue {
            field: "fakeTimers.doNotFake".into(),
            value: value.clone(),
        });
    }

    Ok(FakeTimersConfig {
        enable_globally: configured.enable_globally.unwrap_or(false),
        legacy_fake_timers,
        advance_timers: configured.advance_timers,
        do_not_fake,
        now: configured.now,
        timer_limit: configured.timer_limit,
    })
}

fn normalize_snapshot_format(
    configured: Option<RawSnapshotFormat>,
    defaults: SnapshotFormat,
) -> Result<SnapshotFormat, ConfigError> {
    let Some(configured) = configured else {
        return Ok(defaults);
    };
    if !configured.unsupported.is_empty() {
        return Err(ConfigError::UnsupportedFields(
            configured
                .unsupported
                .keys()
                .map(|field| format!("snapshotFormat.{field}"))
                .collect::<Vec<_>>()
                .join(", "),
        ));
    }
    Ok(SnapshotFormat {
        escape_string: configured.escape_string.unwrap_or(defaults.escape_string),
        print_basic_prototype: configured
            .print_basic_prototype
            .unwrap_or(defaults.print_basic_prototype),
    })
}

fn normalize_worker_idle_memory_limit(configured: Option<MemoryLimit>) -> Option<String> {
    // Every test file receives a fresh process, so Rjest has no long-lived
    // worker to recycle at this threshold. Preserve the normalized value.
    configured.map(MemoryLimit::into_string)
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
) -> String {
    let environment = configured.unwrap_or_else(|| default_test_environment(root_dir, fallback));
    normalize_module_reference(&environment, root_dir)
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

fn find_config(project_dir: &Path) -> Result<PathBuf, ConfigError> {
    let supports_implicit_mts = installed_jest_supports_implicit_mts(project_dir);
    let mut directory = project_dir;
    loop {
        let mut candidates = CONFIG_FILENAMES
            .iter()
            .filter(|name| supports_implicit_mts || **name != "jest.config.mts")
            .map(|name| directory.join(name))
            .filter(|candidate| candidate.is_file())
            .collect::<Vec<_>>();
        let package = directory.join("package.json");
        let package_exists = package.is_file();
        if package_exists
            && read_json(&package)?
                .get("jest")
                .is_some_and(json_value_is_truthy)
        {
            candidates.push(package.clone());
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
        if let Some(config) = candidates.pop() {
            return Ok(config);
        }
        if package_exists {
            return Ok(package);
        }
        let Some(parent) = directory.parent() else {
            return Err(ConfigError::MissingConfig(project_dir.to_path_buf()));
        };
        if parent == directory {
            return Err(ConfigError::MissingConfig(project_dir.to_path_buf()));
        }
        directory = parent;
    }
}

fn installed_jest_supports_implicit_mts(project_dir: &Path) -> bool {
    for directory in project_dir.ancestors() {
        for package_name in ["jest-config", "jest"] {
            let package = directory
                .join("node_modules")
                .join(package_name)
                .join("package.json");
            let Ok(source) = fs::read_to_string(package) else {
                continue;
            };
            let Ok(value) = serde_json::from_str::<Value>(&source) else {
                continue;
            };
            let Some(version) = value.get("version").and_then(Value::as_str) else {
                continue;
            };
            let mut parts = version.split(['.', '-']);
            let Some(major) = parts.next().and_then(|part| part.parse::<u64>().ok()) else {
                continue;
            };
            let Some(minor) = parts.next().and_then(|part| part.parse::<u64>().ok()) else {
                continue;
            };
            return major > 30 || (major == 30 && minor >= 4);
        }
    }
    true
}

fn json_value_is_truthy(value: &Value) -> bool {
    match value {
        Value::Null | Value::Bool(false) => false,
        Value::Number(number) => number.as_f64() != Some(0.0),
        Value::String(value) => !value.is_empty(),
        Value::Bool(true) | Value::Array(_) | Value::Object(_) => true,
    }
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
        assert_eq!(config.module_directories, ["node_modules"]);
        assert_eq!(config.roots, vec![temp.path().to_path_buf()]);
        assert_eq!(config.bail, 0);
        assert_eq!(config.max_concurrency, 5);
        assert!(!config.pass_with_no_tests);
    }

    #[test]
    fn normalizes_runtime_globals_haste_and_global_execution_options() {
        let temp = tempdir().expect("temp dir");
        let config = load_inline_json(
            temp.path(),
            r#"{
              "globals":{"__DEV__":true,"nested":{"value":42}},
              "haste":{"defaultPlatform":"ios","platforms":["android","ios","native"]},
              "detectOpenHandles":true,
              "forceExit":true,
              "maxConcurrency":1,
              "passWithNoTests":true
            }"#,
        )
        .expect("Granite-style runtime config");

        assert_eq!(config.globals["__DEV__"], true);
        assert_eq!(config.globals["nested"]["value"], 42);
        assert_eq!(config.haste.default_platform.as_deref(), Some("ios"));
        assert_eq!(config.haste.platforms, ["android", "ios", "native"]);
        assert!(config.detect_open_handles);
        assert!(config.force_exit);
        assert_eq!(config.max_concurrency, 1);
        assert!(config.pass_with_no_tests);

        let serialized = serde_json::to_value(config).expect("serialized config");
        assert_eq!(serialized["maxConcurrency"], 1);
        assert_eq!(serialized["haste"]["defaultPlatform"], "ios");

        for invalid in [
            r#"{"globals":[]}"#,
            r#"{"haste":{"computeSha1":true}}"#,
            r#"{"maxConcurrency":0}"#,
        ] {
            assert!(
                load_inline_json(temp.path(), invalid).is_err(),
                "invalid config should fail: {invalid}"
            );
        }
    }

    #[test]
    fn normalizes_boolean_and_numeric_bail_thresholds() {
        let temp = tempdir().expect("temp dir");

        let enabled = load_inline_json(temp.path(), r#"{"bail":true}"#).expect("boolean bail");
        assert_eq!(enabled.bail, 1);
        let disabled = load_inline_json(temp.path(), r#"{"bail":false}"#).expect("disabled bail");
        assert_eq!(disabled.bail, 0);
        let numeric = load_inline_json(temp.path(), r#"{"bail":3}"#).expect("numeric bail");
        assert_eq!(numeric.bail, 3);

        for invalid in [r#"{"bail":-1}"#, r#"{"bail":1.5}"#, r#"{"bail":"2"}"#] {
            let error = load_inline_json(temp.path(), invalid).expect_err("invalid bail value");
            assert!(error.to_string().contains("bail"));
        }
    }

    #[test]
    fn normalizes_optional_prettier_module_references() {
        let temp = tempdir().expect("temp dir");

        let rooted = load_inline_json(
            temp.path(),
            r#"{"prettierPath":"<rootDir>/tools/prettier.cjs"}"#,
        )
        .expect("rooted Prettier path");
        assert_eq!(
            rooted.prettier_path,
            Some(
                temp.path()
                    .join("tools/prettier.cjs")
                    .to_string_lossy()
                    .into_owned()
            )
        );
        let package = load_inline_json(temp.path(), r#"{"prettierPath":"prettier"}"#)
            .expect("package Prettier path");
        assert_eq!(package.prettier_path.as_deref(), Some("prettier"));
        let disabled = load_inline_json(temp.path(), r#"{"prettierPath":null}"#)
            .expect("disabled Prettier path");
        assert_eq!(disabled.prettier_path, None);
        let defaulted = load_inline_json(temp.path(), r"{}").expect("default Prettier path");
        assert_eq!(defaulted.prettier_path.as_deref(), Some("prettier"));
        let error = load_inline_json(temp.path(), r#"{"prettierPath":false}"#)
            .expect_err("invalid Prettier path");
        assert!(error.to_string().contains("prettierPath"));
    }

    #[test]
    fn normalizes_snapshot_format_options() {
        let temp = tempdir().expect("temp dir");
        let configured = load_inline_json(
            temp.path(),
            r#"{"snapshotFormat":{"escapeString":true,"printBasicPrototype":true}}"#,
        )
        .expect("snapshot format");
        assert!(configured.snapshot_format.escape_string);
        assert!(configured.snapshot_format.print_basic_prototype);

        let defaults = load_inline_json(temp.path(), r"{}").expect("defaults");
        assert_eq!(defaults.snapshot_format, SnapshotFormat::default());

        let error = load_inline_json(temp.path(), r#"{"snapshotFormat":{"unknownOption":true}}"#)
            .expect_err("unknown snapshot format option");
        assert!(error.to_string().contains("snapshotFormat.unknownOption"));
    }

    #[test]
    fn normalizes_module_directories_without_rooting_relative_names() {
        let temp = tempdir().expect("temp dir");
        let config = load_inline_json(
            temp.path(),
            r#"{"moduleDirectories":["<rootDir>/vendor_modules","node_modules"]}"#,
        )
        .expect("module directories");

        assert_eq!(
            config.module_directories,
            [
                temp.path()
                    .join("vendor_modules")
                    .to_string_lossy()
                    .into_owned(),
                "node_modules".to_owned()
            ]
        );
    }

    #[test]
    fn normalizes_custom_resolver_module_references() {
        let temp = tempdir().expect("temp dir");
        let rooted = load_inline_json(
            temp.path(),
            r#"{"resolver":"<rootDir>/tools/resolver.cjs"}"#,
        )
        .expect("rooted resolver");
        assert_eq!(
            rooted.resolver,
            Some(
                temp.path()
                    .join("tools/resolver.cjs")
                    .to_string_lossy()
                    .into_owned()
            )
        );

        let package = load_inline_json(temp.path(), r#"{"resolver":"fixture-resolver"}"#)
            .expect("package resolver");
        assert_eq!(package.resolver.as_deref(), Some("fixture-resolver"));
    }

    #[test]
    fn normalizes_custom_test_environment_module_references() {
        let temp = tempdir().expect("temp dir");
        let rooted = load_inline_json(
            temp.path(),
            r#"{"testEnvironment":"<rootDir>/tools/environment.cjs"}"#,
        )
        .expect("rooted environment");
        assert_eq!(
            rooted.test_environment,
            temp.path().join("tools/environment.cjs").to_string_lossy()
        );

        let package = load_inline_json(temp.path(), r#"{"testEnvironment":"fixture-environment"}"#)
            .expect("package environment");
        assert_eq!(package.test_environment, "fixture-environment");
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
    fn normalizes_inline_projects_independently() {
        let temp = tempdir().expect("temp dir");
        fs::create_dir(temp.path().join("alpha")).expect("alpha directory");
        fs::create_dir(temp.path().join("beta")).expect("beta directory");

        let config = load_inline_json(
            temp.path(),
            r#"{
              "projects":[
                {
                  "displayName":"alpha",
                  "rootDir":"alpha",
                  "testMatch":["<rootDir>/**/*.alpha.js"]
                },
                {
                  "displayName":{"name":"beta","color":"blue"},
                  "rootDir":"beta",
                  "testEnvironment":"jsdom"
                }
              ]
            }"#,
        )
        .expect("inline projects");

        assert_eq!(config.projects.len(), 2);
        assert_eq!(config.projects[0].root_dir, temp.path().join("alpha"));
        assert_eq!(
            config.projects[0]
                .display_name
                .as_ref()
                .map(|display_name| display_name.name.as_str()),
            Some("alpha")
        );
        assert_eq!(config.projects[0].test_match.len(), 1);
        assert_eq!(config.projects[1].root_dir, temp.path().join("beta"));
        assert_eq!(
            config.projects[1]
                .display_name
                .as_ref()
                .map(|display_name| display_name.color.as_str()),
            Some("blue")
        );
        assert_eq!(config.projects[1].test_environment, "jsdom");
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
    fn traverses_parent_directories_for_implicit_configuration() {
        let temp = tempdir().expect("temp dir");
        let nested = temp.path().join("packages/example/src");
        fs::create_dir_all(&nested).expect("nested directory");
        fs::write(
            temp.path().join("jest.config.json"),
            r#"{"testTimeout":1234}"#,
        )
        .expect("write parent config");

        let config = load(&nested, None).expect("load parent config");
        assert_eq!(config.root_dir, temp.path());
        assert_eq!(config.test_timeout, 1_234);
    }

    #[test]
    fn nearest_package_is_an_implicit_root_boundary_without_jest_config() {
        let temp = tempdir().expect("temp dir");
        let package = temp.path().join("packages/example");
        let nested = package.join("src/deep");
        fs::create_dir_all(&nested).expect("nested directory");
        fs::write(
            temp.path().join("jest.config.json"),
            r#"{"testTimeout":1234}"#,
        )
        .expect("write ancestor config");
        fs::write(
            package.join("package.json"),
            r#"{"name":"nested-package","private":true}"#,
        )
        .expect("write package root");

        let config = load(&nested, None).expect("load package defaults");
        assert_eq!(config.root_dir, package);
        assert_eq!(config.test_timeout, 5_000);
    }

    #[test]
    fn rejects_implicit_discovery_without_a_config_or_package_root() {
        let temp = tempdir().expect("temp dir");
        assert!(matches!(
            load(temp.path(), None),
            Err(ConfigError::MissingConfig(_))
        ));
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
        fs::write(temp.path().join("package.json"), r#"{"private":true}"#)
            .expect("write package root");
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
              "resetModules":true,
              "clearMocks":true,
              "resetMocks":true,
              "restoreMocks":true,
              "fakeTimers":{
                "enableGlobally":true,
                "legacyFakeTimers":false,
                "advanceTimers":25,
                "doNotFake":["performance"],
                "now":1234,
                "timerLimit":50
              },
              "modulePathIgnorePatterns":["/dist/"],
              "setupFiles":["<rootDir>/test/pre-setup.ts"],
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
              "silent":true,
              "workerIdleMemoryLimit":"45MiB",
              "watchPlugins":["jest-watch-typeahead/filename"]
            }"#,
        )
        .expect("write config");

        let config = load(temp.path(), None).expect("load runtime config");
        assert_eq!(config.module_paths, [temp.path().join("src")]);
        assert!(config.silent);
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
        assert!(config.reset_modules);
        assert!(config.mock_lifecycle.clear_mocks);
        assert!(config.mock_lifecycle.reset_mocks);
        assert!(config.mock_lifecycle.restore_mocks);
        assert!(config.fake_timers.enable_globally);
        assert!(!config.fake_timers.legacy_fake_timers);
        assert_eq!(
            config.fake_timers.advance_timers,
            Some(serde_json::json!(25))
        );
        assert_eq!(config.fake_timers.do_not_fake, ["performance"]);
        assert_eq!(config.fake_timers.now, Some(1234));
        assert_eq!(
            config.fake_timers.timer_limit,
            Some(serde_json::Number::from(50))
        );
        assert_eq!(config.extensions_to_treat_as_esm, [".ts"]);
        assert_eq!(config.setup_files, [temp.path().join("test/pre-setup.ts")]);
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
        assert_eq!(config.worker_idle_memory_limit.as_deref(), Some("45MiB"));
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
    fn rejects_unknown_or_incompatible_fake_timer_options() {
        let unknown = tempdir().expect("temp dir");
        fs::write(
            unknown.path().join("jest.config.json"),
            r#"{"fakeTimers":{"madeUpOption":true}}"#,
        )
        .expect("write config");
        let error = load(unknown.path(), None).expect_err("unknown timer option should fail");
        assert!(error.to_string().contains("fakeTimers.madeUpOption"));

        let incompatible = tempdir().expect("temp dir");
        fs::write(
            incompatible.path().join("jest.config.json"),
            r#"{"fakeTimers":{"legacyFakeTimers":true,"now":1234}}"#,
        )
        .expect("write config");
        let error = load(incompatible.path(), None)
            .expect_err("legacy timers should reject modern-only options");
        assert!(error.to_string().contains("legacyFakeTimers"));

        let invalid_advance = tempdir().expect("temp dir");
        fs::write(
            invalid_advance.path().join("jest.config.json"),
            r#"{"fakeTimers":{"advanceTimers":-1}}"#,
        )
        .expect("write config");
        let error = load(invalid_advance.path(), None)
            .expect_err("negative automatic advancement should fail");
        assert!(error.to_string().contains("fakeTimers.advanceTimers"));
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
    fn loads_esm_typescript_config_with_native_node_semantics() {
        let temp = tempdir().expect("temp dir");
        fs::write(temp.path().join("package.json"), r#"{"type":"module"}"#)
            .expect("write package type");
        fs::write(
            temp.path().join("jest.config.ts"),
            "type Config = {testTimeout: number}; if (!import.meta.dirname) throw new Error('missing dirname'); const config: Config = {testTimeout: 4321}; export default config;",
        )
        .expect("write ESM TypeScript config");

        let config = load(temp.path(), None).expect("load native ESM TypeScript config");
        assert_eq!(config.test_timeout, 4_321);
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
    fn follows_the_installed_jest_version_for_implicit_mts_discovery() {
        let jest_30_0 = tempdir().expect("Jest 30.0 fixture");
        fs::create_dir_all(jest_30_0.path().join("node_modules/jest"))
            .expect("create Jest package");
        fs::write(
            jest_30_0.path().join("node_modules/jest/package.json"),
            r#"{"version":"30.0.0"}"#,
        )
        .expect("write Jest version");
        fs::write(
            jest_30_0.path().join("jest.config.mjs"),
            "export {default} from './jest.config.mts';",
        )
        .expect("write wrapper config");
        fs::write(
            jest_30_0.path().join("jest.config.mts"),
            "export default {testTimeout: 1234};",
        )
        .expect("write TypeScript config");

        let config = load(jest_30_0.path(), None).expect("load Jest 30.0 wrapper");
        assert_eq!(config.test_timeout, 1_234);

        let jest_30_4 = tempdir().expect("Jest 30.4 fixture");
        fs::create_dir_all(jest_30_4.path().join("node_modules/jest-config"))
            .expect("create Jest config package");
        fs::write(
            jest_30_4
                .path()
                .join("node_modules/jest-config/package.json"),
            r#"{"version":"30.4.0"}"#,
        )
        .expect("write Jest config version");
        fs::write(
            jest_30_4.path().join("jest.config.mjs"),
            "export default {};",
        )
        .expect("write module config");
        fs::write(
            jest_30_4.path().join("jest.config.mts"),
            "export default {};",
        )
        .expect("write TypeScript module config");

        assert!(matches!(
            load(jest_30_4.path(), None),
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
