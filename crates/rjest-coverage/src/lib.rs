//! Deterministic Istanbul coverage aggregation, reporting, and thresholds.

use std::{
    collections::{BTreeMap, BTreeSet},
    fmt::Write as _,
    fs,
    path::{Component, Path, PathBuf},
};

use globset::{Glob, GlobMatcher, GlobSet, GlobSetBuilder};
use regex::RegexSet;
use rjest_core::CoverageMap;
use serde_json::{Map, Value, json};
use thiserror::Error;
use walkdir::{DirEntry, WalkDir};

const METRICS: [&str; 4] = ["statements", "branches", "lines", "functions"];

#[derive(Clone, Debug)]
pub struct CoverageOptions {
    pub root_dir: PathBuf,
    pub threshold_base_dir: PathBuf,
    pub coverage_directory: PathBuf,
    pub reporters: Vec<Value>,
    pub thresholds: Value,
    pub branches_true_unknown: bool,
}

#[derive(Clone, Debug)]
pub struct CoverageReport {
    pub summary: Value,
    pub terminal_output: Vec<String>,
    pub threshold_failures: Vec<String>,
}

#[derive(Debug, Error)]
pub enum CoverageError {
    #[error("invalid Istanbul coverage for `{path}`: {message}")]
    Invalid { path: String, message: String },
    #[error("unsupported coverage reporter `{0}`")]
    UnsupportedReporter(String),
    #[error("invalid coverage reporter configuration: {0}")]
    InvalidReporter(String),
    #[error("invalid coverage threshold: {0}")]
    InvalidThreshold(String),
    #[error("invalid collectCoverageFrom glob `{pattern}`: {source}")]
    InvalidGlob {
        pattern: String,
        #[source]
        source: globset::Error,
    },
    #[error("invalid coveragePathIgnorePatterns expression: {0}")]
    InvalidRegex(#[from] regex::Error),
    #[error("cannot walk coverage root `{root}`: {source}")]
    Walk {
        root: PathBuf,
        source: walkdir::Error,
    },
    #[error("cannot canonicalize coverage source `{path}`: {source}")]
    Canonicalize {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("cannot create coverage directory `{path}`: {source}")]
    CreateDirectory {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("cannot write coverage report `{path}`: {source}")]
    Write {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("cannot encode coverage report: {0}")]
    Encode(#[from] serde_json::Error),
}

#[derive(Clone, Copy, Debug, Default)]
struct Metric {
    total: u64,
    covered: u64,
}

impl Metric {
    fn uncovered(self) -> u64 {
        self.total.saturating_sub(self.covered)
    }

    fn percentage(self) -> f64 {
        let Some(basis_points) = self.covered.saturating_mul(10_000).checked_div(self.total) else {
            return 100.0;
        };
        f64::from(u32::try_from(basis_points).unwrap_or(10_000)) / 100.0
    }

    fn json(self) -> Value {
        json!({
            "total": self.total,
            "covered": self.covered,
            "skipped": 0,
            "pct": self.percentage(),
        })
    }
}

#[derive(Clone, Copy, Debug, Default)]
struct Summary {
    lines: Metric,
    statements: Metric,
    functions: Metric,
    branches: Metric,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ThresholdGroupKind {
    Global,
    Path,
    Glob,
}

struct ThresholdGroup<'a> {
    name: &'a str,
    rules: &'a Map<String, Value>,
    kind: Option<ThresholdGroupKind>,
    resolved: Option<String>,
    matcher: Option<GlobMatcher>,
    files: Vec<usize>,
}

impl Summary {
    fn add(&mut self, other: Self) {
        self.lines.total += other.lines.total;
        self.lines.covered += other.lines.covered;
        self.statements.total += other.statements.total;
        self.statements.covered += other.statements.covered;
        self.functions.total += other.functions.total;
        self.functions.covered += other.functions.covered;
        self.branches.total += other.branches.total;
        self.branches.covered += other.branches.covered;
    }

    fn metric(self, name: &str) -> Option<Metric> {
        match name {
            "lines" => Some(self.lines),
            "statements" => Some(self.statements),
            "functions" => Some(self.functions),
            "branches" => Some(self.branches),
            _ => None,
        }
    }

    fn json(self) -> Value {
        json!({
            "lines": self.lines.json(),
            "statements": self.statements.json(),
            "functions": self.functions.json(),
            "branches": self.branches.json(),
        })
    }
}

struct FileCoverage<'a> {
    path: &'a str,
    value: &'a Value,
}

impl<'a> FileCoverage<'a> {
    fn new(path: &'a str, value: &'a Value) -> Result<Self, CoverageError> {
        let object = value
            .as_object()
            .ok_or_else(|| invalid(path, "record is not an object"))?;
        for key in ["statementMap", "fnMap", "branchMap", "s", "f", "b"] {
            if !object.get(key).is_some_and(Value::is_object) {
                return Err(invalid(path, format!("`{key}` is not an object")));
            }
        }
        Ok(Self { path, value })
    }

    fn object(&self, key: &str) -> Result<&Map<String, Value>, CoverageError> {
        self.value
            .get(key)
            .and_then(Value::as_object)
            .ok_or_else(|| invalid(self.path, format!("`{key}` is not an object")))
    }

    fn scalar_counts(&self, key: &str) -> Result<BTreeMap<String, u64>, CoverageError> {
        self.object(key)?
            .iter()
            .map(|(id, count)| {
                Ok((
                    id.clone(),
                    count.as_u64().ok_or_else(|| {
                        invalid(self.path, format!("`{key}.{id}` is not a count"))
                    })?,
                ))
            })
            .collect()
    }

    fn branch_counts(&self) -> Result<Vec<u64>, CoverageError> {
        let mut counts = Vec::new();
        for (id, branch) in self.object("b")? {
            let branch = branch
                .as_array()
                .ok_or_else(|| invalid(self.path, format!("`b.{id}` is not an array")))?;
            for count in branch {
                counts.push(
                    count.as_u64().ok_or_else(|| {
                        invalid(self.path, format!("`b.{id}` contains a non-count"))
                    })?,
                );
            }
        }
        Ok(counts)
    }

    fn line_counts(&self) -> Result<BTreeMap<u64, u64>, CoverageError> {
        let statements = self.scalar_counts("s")?;
        let statement_map = self.object("statementMap")?;
        let mut lines = BTreeMap::<u64, u64>::new();
        for (id, count) in statements {
            let line = statement_map
                .get(&id)
                .and_then(|location| location.get("start"))
                .and_then(|start| start.get("line"))
                .and_then(Value::as_u64)
                .ok_or_else(|| invalid(self.path, format!("statement `{id}` has no start line")))?;
            *lines.entry(line).or_default() += count;
        }
        Ok(lines)
    }

    fn summary(&self) -> Result<Summary, CoverageError> {
        let statements = self.scalar_counts("s")?.into_values().collect::<Vec<_>>();
        let functions = self.scalar_counts("f")?.into_values().collect::<Vec<_>>();
        let branches = self.branch_counts()?;
        let lines = self.line_counts()?.into_values().collect::<Vec<_>>();
        Ok(Summary {
            lines: summarize_counts(&lines),
            statements: summarize_counts(&statements),
            functions: summarize_counts(&functions),
            branches: summarize_counts(&branches),
        })
    }

    fn relative_path(&self, root: &Path) -> String {
        Path::new(self.path)
            .strip_prefix(root)
            .unwrap_or_else(|_| Path::new(self.path))
            .to_string_lossy()
            .replace('\\', "/")
    }
}

/// Writes configured coverage reports and evaluates coverage thresholds.
///
/// # Errors
///
/// Returns an error for malformed Istanbul records, unsupported reporters,
/// invalid thresholds, or report I/O failures.
pub fn write_reports(
    coverage_map: &CoverageMap,
    options: &CoverageOptions,
) -> Result<CoverageReport, CoverageError> {
    let files = coverage_map
        .iter()
        .map(|(path, value)| FileCoverage::new(path, value))
        .collect::<Result<Vec<_>, _>>()?;
    let mut total = Summary::default();
    let mut file_summaries = Vec::with_capacity(files.len());
    for file in &files {
        let summary = file.summary()?;
        total.add(summary);
        file_summaries.push((file.path, summary));
    }
    let summary_json = summary_json(total, &file_summaries, options.branches_true_unknown);
    let reporters = parse_reporters(&options.reporters)?;
    let writes_files = reporters
        .iter()
        .any(|reporter| !matches!(reporter.as_str(), "text" | "text-summary" | "none"));
    if writes_files {
        fs::create_dir_all(&options.coverage_directory).map_err(|source| {
            CoverageError::CreateDirectory {
                path: options.coverage_directory.clone(),
                source,
            }
        })?;
    }
    let mut terminal_output = Vec::new();
    for reporter in reporters {
        match reporter.as_str() {
            "json" => write_json(
                &options.coverage_directory.join("coverage-final.json"),
                coverage_map,
            )?,
            "json-summary" => write_json(
                &options.coverage_directory.join("coverage-summary.json"),
                &summary_json,
            )?,
            "text" => terminal_output.push(text_table(&files, total)?),
            "text-summary" => terminal_output.push(text_summary(total)),
            "lcov" => {
                write_lcov(&files, options)?;
                write_html(&files, total, options)?;
            }
            "lcovonly" => write_lcov(&files, options)?,
            "clover" => write_clover(&files, total, options)?,
            "html" => write_html(&files, total, options)?,
            "none" => {}
            other => return Err(CoverageError::UnsupportedReporter(other.into())),
        }
    }
    let threshold_failures = evaluate_thresholds(
        &file_summaries,
        &options.thresholds,
        &options.threshold_base_dir,
    )?;
    Ok(CoverageReport {
        summary: summary_json,
        terminal_output,
        threshold_failures,
    })
}

/// Discovers the complete source set selected by `collectCoverageFrom`.
///
/// Positive globs are unioned and negated globs exclude matches. Paths ignored
/// by coverage configuration or already selected as tests/setup files are not
/// returned.
///
/// # Errors
///
/// Returns an error for malformed globs/regular expressions or inaccessible
/// source paths.
pub fn discover_sources(
    root_dir: &Path,
    patterns: &[String],
    coverage_path_ignore_patterns: &[String],
    excluded_paths: &[PathBuf],
) -> Result<Vec<PathBuf>, CoverageError> {
    if patterns.is_empty() {
        return Ok(Vec::new());
    }
    let (positive, negative) = build_coverage_globs(patterns)?;
    let ignores = RegexSet::new(coverage_path_ignore_patterns)?;
    let excluded = excluded_paths
        .iter()
        .filter_map(|path| path.canonicalize().ok())
        .collect::<BTreeSet<_>>();
    let mut sources = BTreeSet::new();
    for entry in WalkDir::new(root_dir)
        .follow_links(false)
        .into_iter()
        .filter_entry(should_descend)
    {
        let entry = entry.map_err(|source| CoverageError::Walk {
            root: root_dir.to_path_buf(),
            source,
        })?;
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(root_dir)
            .unwrap_or(entry.path())
            .to_string_lossy()
            .replace('\\', "/");
        let absolute_normalized = entry.path().to_string_lossy().replace('\\', "/");
        if !positive.is_match(&relative)
            || negative
                .as_ref()
                .is_some_and(|globs| globs.is_match(&relative))
            || ignores.is_match(&absolute_normalized)
        {
            continue;
        }
        let canonical =
            entry
                .path()
                .canonicalize()
                .map_err(|source| CoverageError::Canonicalize {
                    path: entry.path().to_path_buf(),
                    source,
                })?;
        if !excluded.contains(&canonical) {
            sources.insert(canonical);
        }
    }
    Ok(sources.into_iter().collect())
}

fn build_coverage_globs(patterns: &[String]) -> Result<(GlobSet, Option<GlobSet>), CoverageError> {
    let mut positive = GlobSetBuilder::new();
    let mut negative = GlobSetBuilder::new();
    let mut positive_count = 0;
    let mut negative_count = 0;
    for pattern in patterns {
        let (builder, pattern, count) = if let Some(pattern) = pattern.strip_prefix('!') {
            (&mut negative, pattern, &mut negative_count)
        } else {
            (&mut positive, pattern.as_str(), &mut positive_count)
        };
        let glob = Glob::new(pattern).map_err(|source| CoverageError::InvalidGlob {
            pattern: pattern.into(),
            source,
        })?;
        builder.add(glob);
        *count += 1;
    }
    if positive_count == 0 {
        positive.add(Glob::new("**/*").expect("default coverage glob is valid"));
    }
    let positive = positive
        .build()
        .map_err(|source| CoverageError::InvalidGlob {
            pattern: patterns.join(", "),
            source,
        })?;
    let negative = if negative_count == 0 {
        None
    } else {
        Some(
            negative
                .build()
                .map_err(|source| CoverageError::InvalidGlob {
                    pattern: patterns.join(", "),
                    source,
                })?,
        )
    };
    Ok((positive, negative))
}

fn should_descend(entry: &DirEntry) -> bool {
    !entry.file_type().is_dir()
        || !matches!(
            entry.file_name().to_str(),
            Some(".git" | ".rjest-cache" | "base" | "coverage" | "node_modules" | "target")
        )
}

fn summarize_counts(counts: &[u64]) -> Metric {
    Metric {
        total: counts.len() as u64,
        covered: counts.iter().filter(|count| **count > 0).count() as u64,
    }
}

fn summary_json(total: Summary, files: &[(&str, Summary)], branches_true_unknown: bool) -> Value {
    let mut result = Map::new();
    let mut total_json = total.json();
    let parent_directories = files
        .iter()
        .filter_map(|(path, _)| Path::new(path).parent())
        .collect::<BTreeSet<_>>();
    let branches_true_unknown = branches_true_unknown && parent_directories.len() <= 1;
    total_json
        .as_object_mut()
        .expect("summary is an object")
        .insert(
            "branchesTrue".into(),
            json!({
                "total": 0,
                "covered": 0,
                "skipped": 0,
                "pct": if branches_true_unknown { json!("Unknown") } else { json!(100) },
            }),
        );
    result.insert("total".into(), total_json);
    for (path, summary) in files {
        result.insert((*path).into(), summary.json());
    }
    Value::Object(result)
}

fn parse_reporters(values: &[Value]) -> Result<Vec<String>, CoverageError> {
    values
        .iter()
        .map(|value| match value {
            Value::String(name) => Ok(name.clone()),
            Value::Array(values) => values
                .first()
                .and_then(Value::as_str)
                .map(str::to_owned)
                .ok_or_else(|| CoverageError::InvalidReporter(value.to_string())),
            _ => Err(CoverageError::InvalidReporter(value.to_string())),
        })
        .collect()
}

fn write_json(path: &Path, value: &impl serde::Serialize) -> Result<(), CoverageError> {
    let mut contents = serde_json::to_vec(value)?;
    contents.push(b'\n');
    write_file(path, &contents)
}

fn write_file(path: &Path, contents: impl AsRef<[u8]>) -> Result<(), CoverageError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|source| CoverageError::CreateDirectory {
            path: parent.to_path_buf(),
            source,
        })?;
    }
    fs::write(path, contents).map_err(|source| CoverageError::Write {
        path: path.to_path_buf(),
        source,
    })
}

fn text_summary(summary: Summary) -> String {
    format!(
        "\n=============================== Coverage summary ===============================\n\
         Statements   : {}% ( {}/{} )\n\
         Branches     : {}% ( {}/{} )\n\
         Functions    : {}% ( {}/{} )\n\
         Lines        : {}% ( {}/{} )\n\
         ================================================================================",
        display_pct(summary.statements.percentage()),
        summary.statements.covered,
        summary.statements.total,
        display_pct(summary.branches.percentage()),
        summary.branches.covered,
        summary.branches.total,
        display_pct(summary.functions.percentage()),
        summary.functions.covered,
        summary.functions.total,
        display_pct(summary.lines.percentage()),
        summary.lines.covered,
        summary.lines.total,
    )
}

fn text_table(files: &[FileCoverage<'_>], total: Summary) -> Result<String, CoverageError> {
    let mut output = String::from(
        "-----------|---------|----------|---------|---------|-------------------\n\
         File       | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s \n\
         -----------|---------|----------|---------|---------|-------------------\n",
    );
    writeln!(
        output,
        "All files  | {:>7} | {:>8} | {:>7} | {:>7} |",
        display_pct(total.statements.percentage()),
        display_pct(total.branches.percentage()),
        display_pct(total.functions.percentage()),
        display_pct(total.lines.percentage()),
    )
    .expect("writing to String cannot fail");
    for file in files {
        let summary = file.summary()?;
        let uncovered = compact_lines(
            file.line_counts()?
                .into_iter()
                .filter_map(|(line, count)| (count == 0).then_some(line)),
        );
        writeln!(
            output,
            " {} | {:>7} | {:>8} | {:>7} | {:>7} | {}",
            Path::new(file.path)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy(),
            display_pct(summary.statements.percentage()),
            display_pct(summary.branches.percentage()),
            display_pct(summary.functions.percentage()),
            display_pct(summary.lines.percentage()),
            uncovered,
        )
        .expect("writing to String cannot fail");
    }
    output.push_str("-----------|---------|----------|---------|---------|-------------------");
    Ok(output)
}

fn compact_lines(lines: impl Iterator<Item = u64>) -> String {
    let lines = lines.collect::<Vec<_>>();
    let mut parts = Vec::new();
    let mut index = 0;
    while index < lines.len() {
        let start = lines[index];
        let mut end = start;
        while index + 1 < lines.len() && lines[index + 1] == end + 1 {
            index += 1;
            end = lines[index];
        }
        parts.push(if start == end {
            start.to_string()
        } else {
            format!("{start}-{end}")
        });
        index += 1;
    }
    parts.join(",")
}

fn display_pct(value: f64) -> String {
    if value.fract() == 0.0 {
        format!("{value:.0}")
    } else {
        format!("{value:.2}")
    }
}

fn write_lcov(files: &[FileCoverage<'_>], options: &CoverageOptions) -> Result<(), CoverageError> {
    let mut output = String::new();
    for file in files {
        let relative = file.relative_path(&options.root_dir);
        writeln!(output, "TN:\nSF:{relative}").expect("writing to String cannot fail");
        let functions = file.scalar_counts("f")?;
        let fn_map = file.object("fnMap")?;
        for (id, entry) in fn_map {
            let line = coverage_line(file.path, entry, "line")?;
            let name = entry
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("(anonymous)");
            writeln!(output, "FN:{line},{name}").expect("writing to String cannot fail");
            if !functions.contains_key(id) {
                return Err(invalid(
                    file.path,
                    format!("function `{id}` has no counter"),
                ));
            }
        }
        writeln!(output, "FNF:{}", functions.len()).expect("writing to String cannot fail");
        writeln!(
            output,
            "FNH:{}",
            functions.values().filter(|count| **count > 0).count()
        )
        .expect("writing to String cannot fail");
        for (id, entry) in fn_map {
            let name = entry
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("(anonymous)");
            writeln!(output, "FNDA:{},{name}", functions[id])
                .expect("writing to String cannot fail");
        }
        let line_counts = file.line_counts()?;
        for (line, count) in &line_counts {
            writeln!(output, "DA:{line},{count}").expect("writing to String cannot fail");
        }
        writeln!(output, "LF:{}", line_counts.len()).expect("writing to String cannot fail");
        writeln!(
            output,
            "LH:{}",
            line_counts.values().filter(|count| **count > 0).count()
        )
        .expect("writing to String cannot fail");
        let branches = file.object("b")?;
        let branch_map = file.object("branchMap")?;
        let mut branch_total = 0;
        let mut branch_covered = 0;
        for (id, counts) in branches {
            let counts = counts
                .as_array()
                .ok_or_else(|| invalid(file.path, format!("`b.{id}` is not an array")))?;
            let entry = branch_map
                .get(id)
                .ok_or_else(|| invalid(file.path, format!("branch `{id}` has no map")))?;
            let line = coverage_line(file.path, entry, "line")?;
            for (branch_index, count) in counts.iter().enumerate() {
                let count = count
                    .as_u64()
                    .ok_or_else(|| invalid(file.path, format!("`b.{id}` contains a non-count")))?;
                writeln!(output, "BRDA:{line},{id},{branch_index},{count}")
                    .expect("writing to String cannot fail");
                branch_total += 1;
                branch_covered += u64::from(count > 0);
            }
        }
        writeln!(
            output,
            "BRF:{branch_total}\nBRH:{branch_covered}\nend_of_record"
        )
        .expect("writing to String cannot fail");
    }
    write_file(&options.coverage_directory.join("lcov.info"), output)
}

fn write_clover(
    files: &[FileCoverage<'_>],
    total: Summary,
    options: &CoverageOptions,
) -> Result<(), CoverageError> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let mut output = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<coverage generated=\"{timestamp}\" clover=\"4.5.2\">\n  <project timestamp=\"{timestamp}\" name=\"All files\">\n    <metrics statements=\"{}\" coveredstatements=\"{}\" conditionals=\"{}\" coveredconditionals=\"{}\" methods=\"{}\" coveredmethods=\"{}\" elements=\"{}\" coveredelements=\"{}\" complexity=\"0\" loc=\"{}\" ncloc=\"{}\" packages=\"1\" files=\"{}\" classes=\"{}\"/>\n",
        total.statements.total,
        total.statements.covered,
        total.branches.total,
        total.branches.covered,
        total.functions.total,
        total.functions.covered,
        total.statements.total + total.branches.total + total.functions.total,
        total.statements.covered + total.branches.covered + total.functions.covered,
        total.lines.total,
        total.lines.total,
        files.len(),
        files.len(),
    );
    for file in files {
        let summary = file.summary()?;
        let name = xml_escape(
            &Path::new(file.path)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy(),
        );
        writeln!(
            output,
            "    <file name=\"{name}\" path=\"{}\">\n      <metrics statements=\"{}\" coveredstatements=\"{}\" conditionals=\"{}\" coveredconditionals=\"{}\" methods=\"{}\" coveredmethods=\"{}\"/>",
            xml_escape(file.path),
            summary.statements.total,
            summary.statements.covered,
            summary.branches.total,
            summary.branches.covered,
            summary.functions.total,
            summary.functions.covered,
        )
        .expect("writing to String cannot fail");
        for (line, count) in file.line_counts()? {
            writeln!(
                output,
                "      <line num=\"{line}\" count=\"{count}\" type=\"stmt\"/>"
            )
            .expect("writing to String cannot fail");
        }
        output.push_str("    </file>\n");
    }
    output.push_str("  </project>\n</coverage>\n");
    write_file(&options.coverage_directory.join("clover.xml"), output)
}

fn write_html(
    files: &[FileCoverage<'_>],
    total: Summary,
    options: &CoverageOptions,
) -> Result<(), CoverageError> {
    let directory = options.coverage_directory.join("lcov-report");
    fs::create_dir_all(&directory).map_err(|source| CoverageError::CreateDirectory {
        path: directory.clone(),
        source,
    })?;
    let mut rows = String::new();
    for (index, file) in files.iter().enumerate() {
        let summary = file.summary()?;
        let report_name = format!("file-{index}.html");
        writeln!(
            rows,
            "<tr><td><a href=\"{report_name}\">{}</a></td><td>{}%</td><td>{}%</td><td>{}%</td><td>{}%</td></tr>",
            html_escape(&file.relative_path(&options.root_dir)),
            display_pct(summary.statements.percentage()),
            display_pct(summary.branches.percentage()),
            display_pct(summary.functions.percentage()),
            display_pct(summary.lines.percentage()),
        )
        .expect("writing to String cannot fail");
        write_source_html(file, &directory.join(report_name), &options.root_dir)?;
    }
    let index = html_page(
        "All files",
        &format!(
            "<h1>All files</h1><p>Statements {}% · Branches {}% · Functions {}% · Lines {}%</p><table><thead><tr><th>File</th><th>Statements</th><th>Branches</th><th>Functions</th><th>Lines</th></tr></thead><tbody>{rows}</tbody></table>",
            display_pct(total.statements.percentage()),
            display_pct(total.branches.percentage()),
            display_pct(total.functions.percentage()),
            display_pct(total.lines.percentage()),
        ),
    );
    write_file(&directory.join("index.html"), index)
}

fn write_source_html(
    file: &FileCoverage<'_>,
    path: &Path,
    root_dir: &Path,
) -> Result<(), CoverageError> {
    let source = fs::read_to_string(file.path)
        .unwrap_or_else(|error| format!("Source unavailable: {error}"));
    let counts = file.line_counts()?;
    let mut lines = String::new();
    for (index, source_line) in source.lines().enumerate() {
        let number = index as u64 + 1;
        let class = match counts.get(&number) {
            Some(0) => "uncovered",
            Some(_) => "covered",
            None => "neutral",
        };
        writeln!(
            lines,
            "<span class=\"line {class}\"><b>{number:>4}</b> {}</span>",
            html_escape(source_line),
        )
        .expect("writing to String cannot fail");
    }
    let title = file.relative_path(root_dir);
    write_file(
        path,
        html_page(
            &title,
            &format!(
                "<p><a href=\"index.html\">All files</a></p><h1>{}</h1><pre>{lines}</pre>",
                html_escape(&title)
            ),
        ),
    )
}

fn html_page(title: &str, body: &str) -> String {
    format!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>{}</title><style>body{{font:14px system-ui,sans-serif;margin:2rem;color:#202124}}table{{border-collapse:collapse;min-width:48rem}}th,td{{padding:.55rem .8rem;border-bottom:1px solid #ddd;text-align:right}}th:first-child,td:first-child{{text-align:left}}pre{{line-height:1.45;background:#f7f7f8;padding:1rem;overflow:auto}}.line{{display:block}}.covered{{background:#e6ffed}}.uncovered{{background:#ffeef0;color:#86181d}}a{{color:#0969da}}</style></head><body>{body}</body></html>",
        html_escape(title),
    )
}

fn evaluate_thresholds(
    files: &[(&str, Summary)],
    thresholds: &Value,
    root_dir: &Path,
) -> Result<Vec<String>, CoverageError> {
    let Some(thresholds) = thresholds.as_object() else {
        return Err(CoverageError::InvalidThreshold(
            "coverageThreshold must be an object".into(),
        ));
    };
    let mut groups = parse_threshold_groups(thresholds, root_dir)?;
    assign_threshold_files(&mut groups, files);
    let mut failures = Vec::new();
    for group in groups {
        failures.extend(evaluate_threshold_group(group, files)?);
    }
    Ok(failures)
}

fn parse_threshold_groups<'a>(
    thresholds: &'a Map<String, Value>,
    root_dir: &Path,
) -> Result<Vec<ThresholdGroup<'a>>, CoverageError> {
    thresholds
        .iter()
        .map(|(name, value)| {
            let rules = value.as_object().ok_or_else(|| {
                CoverageError::InvalidThreshold(format!(
                    "coverageThreshold.{name} must be an object"
                ))
            })?;
            if name == "global" {
                return Ok(ThresholdGroup {
                    name,
                    rules,
                    kind: Some(ThresholdGroupKind::Global),
                    resolved: None,
                    matcher: None,
                    files: Vec::new(),
                });
            }
            let resolved = resolve_threshold_group(root_dir, name);
            let matcher = Glob::new(&resolved)
                .map_err(|source| {
                    CoverageError::InvalidThreshold(format!(
                        "coverageThreshold pattern `{name}` is invalid: {source}"
                    ))
                })?
                .compile_matcher();
            Ok(ThresholdGroup {
                name,
                rules,
                kind: None,
                resolved: Some(resolved),
                matcher: Some(matcher),
                files: Vec::new(),
            })
        })
        .collect()
}

fn assign_threshold_files(groups: &mut [ThresholdGroup<'_>], files: &[(&str, Summary)]) {
    let global_index = groups.iter().position(|group| group.name == "global");
    for (file_index, (file, _)) in files.iter().enumerate() {
        let file = normalize_threshold_path(Path::new(file));
        let file = file.to_string_lossy().replace('\\', "/");
        let mut matched = false;
        for group in groups.iter_mut().filter(|group| group.name != "global") {
            let resolved = group
                .resolved
                .as_deref()
                .expect("non-global group is resolved");
            if file.starts_with(resolved) {
                group.kind = Some(ThresholdGroupKind::Path);
                group.files.push(file_index);
                matched = true;
                continue;
            }
            if group
                .matcher
                .as_ref()
                .expect("non-global group has a matcher")
                .is_match(&file)
            {
                group.kind = Some(ThresholdGroupKind::Glob);
                group.files.push(file_index);
                matched = true;
            }
        }
        if !matched && let Some(global_index) = global_index {
            groups[global_index].files.push(file_index);
        }
    }
}

fn evaluate_threshold_group(
    group: ThresholdGroup<'_>,
    files: &[(&str, Summary)],
) -> Result<Vec<String>, CoverageError> {
    let mut failures = Vec::new();
    match group.kind {
        Some(ThresholdGroupKind::Global) => {
            let selected = if group.files.is_empty() {
                (0..files.len()).collect::<Vec<_>>()
            } else {
                group.files
            };
            if let Some(summary) = combine_summaries(files, &selected) {
                failures.extend(check_threshold_group(group.name, group.rules, summary)?);
            }
        }
        Some(ThresholdGroupKind::Path) => {
            if let Some(summary) = combine_summaries(files, &group.files) {
                failures.extend(check_threshold_group(group.name, group.rules, summary)?);
            }
        }
        Some(ThresholdGroupKind::Glob) => {
            for file_index in group.files {
                failures.extend(check_threshold_group(
                    files[file_index].0,
                    group.rules,
                    files[file_index].1,
                )?);
            }
        }
        None => failures.push(format!(
            "Jest: Coverage data for {} was not found.",
            group.name
        )),
    }
    Ok(failures)
}

fn check_threshold_group(
    name: &str,
    thresholds: &Map<String, Value>,
    summary: Summary,
) -> Result<Vec<String>, CoverageError> {
    let mut failures = Vec::new();
    for metric_name in METRICS {
        let Some(threshold) = thresholds.get(metric_name) else {
            continue;
        };
        let threshold = threshold.as_f64().ok_or_else(|| {
            CoverageError::InvalidThreshold(format!("{name}.{metric_name} must be a number"))
        })?;
        let metric = summary.metric(metric_name).expect("known metric");
        if threshold < 0.0 {
            let maximum = threshold.abs();
            let uncovered = u32::try_from(metric.uncovered()).unwrap_or(u32::MAX);
            if f64::from(uncovered) > maximum {
                failures.push(format!(
                    "Jest: Uncovered count for {metric_name} ({}) exceeds {name} threshold ({maximum})",
                    metric.uncovered(),
                ));
            }
        } else if metric.percentage() < threshold {
            failures.push(format!(
                "Jest: Coverage for {metric_name} ({}%) does not meet \"{name}\" threshold ({threshold}%)",
                display_pct(metric.percentage()),
            ));
        }
    }
    Ok(failures)
}

fn combine_summaries(files: &[(&str, Summary)], selected: &[usize]) -> Option<Summary> {
    let mut selected = selected.iter();
    let first = *selected.next()?;
    let mut combined = files[first].1;
    for index in selected {
        combined.add(files[*index].1);
    }
    Some(combined)
}

fn resolve_threshold_group(root_dir: &Path, group: &str) -> String {
    let trailing_separator = group.ends_with('/') || group.ends_with('\\');
    let group_path = Path::new(group);
    let absolute = if group_path.is_absolute() {
        group_path.to_path_buf()
    } else {
        root_dir.join(group_path)
    };
    let mut normalized = normalize_threshold_path(&absolute)
        .to_string_lossy()
        .replace('\\', "/");
    if trailing_separator && !normalized.ends_with('/') {
        normalized.push('/');
    }
    normalized
}

fn normalize_threshold_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            component => normalized.push(component.as_os_str()),
        }
    }
    normalized
}

fn coverage_line(path: &str, entry: &Value, key: &str) -> Result<u64, CoverageError> {
    entry
        .get(key)
        .and_then(Value::as_u64)
        .or_else(|| {
            entry
                .get("loc")
                .and_then(|loc| loc.get("start"))
                .and_then(|start| start.get("line"))
                .and_then(Value::as_u64)
        })
        .ok_or_else(|| invalid(path, format!("coverage map entry has no `{key}`")))
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn html_escape(value: &str) -> String {
    xml_escape(value)
}

fn invalid(path: &str, message: impl Into<String>) -> CoverageError {
    CoverageError::Invalid {
        path: path.into(),
        message: message.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(path: &Path) -> CoverageMap {
        let path = path.to_string_lossy().into_owned();
        BTreeMap::from([(
            path.clone(),
            json!({
                "path": path,
                "statementMap": {
                    "0": {"start": {"line": 1, "column": 0}, "end": {"line": 1, "column": 5}},
                    "1": {"start": {"line": 2, "column": 0}, "end": {"line": 2, "column": 5}}
                },
                "fnMap": {
                    "0": {"name": "covered", "line": 1, "decl": {"start": {"line": 1}}, "loc": {"start": {"line": 1}}}
                },
                "branchMap": {
                    "0": {"line": 1, "locations": [{"start": {"line": 1}}, {"start": {"line": 1}}]}
                },
                "s": {"0": 1, "1": 0},
                "f": {"0": 1},
                "b": {"0": [1, 0]}
            }),
        )])
    }

    fn fully_covered_fixture(path: &Path) -> CoverageMap {
        let mut coverage = fixture(path);
        let record = coverage.values_mut().next().expect("coverage record");
        record["s"]["1"] = json!(1);
        record["b"]["0"][1] = json!(1);
        coverage
    }

    fn two_uncovered_statements_fixture(path: &Path) -> CoverageMap {
        let mut coverage = fixture(path);
        let record = coverage.values_mut().next().expect("coverage record");
        record["statementMap"]["2"] = json!({"start": {"line": 3}});
        record["s"]["2"] = json!(0);
        coverage
    }

    #[test]
    fn writes_machine_and_human_reports_from_istanbul_data() {
        let temp = tempfile::tempdir().expect("temp dir");
        let source = temp.path().join("source.js");
        fs::write(&source, "first\nsecond\n").expect("source");
        let directory = temp.path().join("coverage");
        let options = CoverageOptions {
            root_dir: temp.path().to_path_buf(),
            threshold_base_dir: temp.path().to_path_buf(),
            coverage_directory: directory.clone(),
            reporters: ["json", "json-summary", "text-summary", "lcov", "clover"]
                .into_iter()
                .map(|value| Value::String(value.into()))
                .collect(),
            thresholds: json!({"global": {"lines": 60, "branches": 100}}),
            branches_true_unknown: true,
        };

        let report = write_reports(&fixture(&source), &options).expect("reports");

        assert_eq!(report.summary["total"]["lines"]["pct"], 50.0);
        assert_eq!(report.threshold_failures.len(), 2);
        assert!(directory.join("coverage-final.json").is_file());
        assert!(directory.join("coverage-summary.json").is_file());
        assert!(directory.join("lcov.info").is_file());
        assert!(directory.join("lcov-report/index.html").is_file());
        assert!(directory.join("clover.xml").is_file());
        assert!(report.terminal_output[0].contains("Statements"));
    }

    #[test]
    fn excludes_path_threshold_files_from_the_global_bucket() {
        let temp = tempfile::tempdir().expect("temp dir");
        let partial = temp.path().join("src/partial.js");
        let full = temp.path().join("src/full.js");
        let mut coverage = fixture(&partial);
        coverage.extend(fully_covered_fixture(&full));
        let report = write_reports(
            &coverage,
            &CoverageOptions {
                root_dir: temp.path().to_path_buf(),
                threshold_base_dir: temp.path().to_path_buf(),
                coverage_directory: temp.path().join("coverage"),
                reporters: vec![Value::String("none".into())],
                thresholds: json!({
                    "./src/partial.js": {"statements": 0},
                    "global": {"statements": 100}
                }),
                branches_true_unknown: true,
            },
        )
        .expect("coverage report");

        assert!(report.threshold_failures.is_empty());
    }

    #[test]
    fn resolves_threshold_paths_from_the_explicit_invocation_directory() {
        let temp = tempfile::tempdir().expect("temp dir");
        let project_root = temp.path().join("project");
        let partial = project_root.join("src/partial.js");
        let full = project_root.join("src/full.js");
        let mut coverage = fixture(&partial);
        coverage.extend(fully_covered_fixture(&full));
        let report = write_reports(
            &coverage,
            &CoverageOptions {
                root_dir: project_root,
                threshold_base_dir: temp.path().to_path_buf(),
                coverage_directory: temp.path().join("coverage"),
                reporters: vec![Value::String("none".into())],
                thresholds: json!({
                    "./project/src/partial.js": {"statements": 0},
                    "global": {"statements": 100}
                }),
                branches_true_unknown: true,
            },
        )
        .expect("coverage report");

        assert!(report.threshold_failures.is_empty());
    }

    #[test]
    fn evaluates_glob_thresholds_for_each_matching_file() {
        let temp = tempfile::tempdir().expect("temp dir");
        let partial = temp.path().join("src/partial.js");
        let full = temp.path().join("src/full.js");
        let mut coverage = fixture(&partial);
        coverage.extend(fully_covered_fixture(&full));
        let report = write_reports(
            &coverage,
            &CoverageOptions {
                root_dir: temp.path().to_path_buf(),
                threshold_base_dir: temp.path().to_path_buf(),
                coverage_directory: temp.path().join("coverage"),
                reporters: vec![Value::String("none".into())],
                thresholds: json!({"./src/*.js": {"statements": 75}}),
                branches_true_unknown: true,
            },
        )
        .expect("coverage report");

        assert_eq!(report.threshold_failures.len(), 1);
        assert!(report.threshold_failures[0].contains("partial.js"));
        assert!(report.threshold_failures[0].contains("Coverage for statements (50%)"));
    }

    #[test]
    fn reports_a_threshold_group_without_coverage_data() {
        let temp = tempfile::tempdir().expect("temp dir");
        let source = temp.path().join("src/source.js");
        let report = write_reports(
            &fixture(&source),
            &CoverageOptions {
                root_dir: temp.path().to_path_buf(),
                threshold_base_dir: temp.path().to_path_buf(),
                coverage_directory: temp.path().join("coverage"),
                reporters: vec![Value::String("none".into())],
                thresholds: json!({"./src/missing.js": {"statements": 0}}),
                branches_true_unknown: true,
            },
        )
        .expect("coverage report");

        assert_eq!(
            report.threshold_failures,
            ["Jest: Coverage data for ./src/missing.js was not found."]
        );
    }

    #[test]
    fn aggregates_path_groups_and_checks_every_overlapping_group() {
        let temp = tempfile::tempdir().expect("temp dir");
        let partial = temp.path().join("src/partial.js");
        let full = temp.path().join("src/full.js");
        let mut coverage = fixture(&partial);
        coverage.extend(fully_covered_fixture(&full));
        let report = write_reports(
            &coverage,
            &CoverageOptions {
                root_dir: temp.path().to_path_buf(),
                threshold_base_dir: temp.path().to_path_buf(),
                coverage_directory: temp.path().join("coverage"),
                reporters: vec![Value::String("none".into())],
                thresholds: json!({
                    "./src/": {"statements": 75},
                    "./src/partial.js": {"statements": 75}
                }),
                branches_true_unknown: true,
            },
        )
        .expect("coverage report");

        assert_eq!(report.threshold_failures.len(), 1);
        assert!(report.threshold_failures[0].contains("\"./src/partial.js\" threshold"));
    }

    #[test]
    fn falls_back_to_all_files_when_every_file_has_a_specific_group() {
        let temp = tempfile::tempdir().expect("temp dir");
        let partial = temp.path().join("src/partial.js");
        let full = temp.path().join("src/full.js");
        let mut coverage = fixture(&partial);
        coverage.extend(fully_covered_fixture(&full));
        let report = write_reports(
            &coverage,
            &CoverageOptions {
                root_dir: temp.path().to_path_buf(),
                threshold_base_dir: temp.path().to_path_buf(),
                coverage_directory: temp.path().join("coverage"),
                reporters: vec![Value::String("none".into())],
                thresholds: json!({
                    "./src/partial.js": {"statements": 0},
                    "./src/full.js": {"statements": 100},
                    "global": {"statements": 80}
                }),
                branches_true_unknown: true,
            },
        )
        .expect("coverage report");

        assert_eq!(report.threshold_failures.len(), 1);
        assert!(report.threshold_failures[0].contains("\"global\" threshold (80%)"));
    }

    #[test]
    fn applies_negative_uncovered_limits_to_each_glob_match() {
        let temp = tempfile::tempdir().expect("temp dir");
        let partial = temp.path().join("src/partial.js");
        let full = temp.path().join("src/full.js");
        let mut coverage = two_uncovered_statements_fixture(&partial);
        coverage.extend(fully_covered_fixture(&full));
        let report = write_reports(
            &coverage,
            &CoverageOptions {
                root_dir: temp.path().to_path_buf(),
                threshold_base_dir: temp.path().to_path_buf(),
                coverage_directory: temp.path().join("coverage"),
                reporters: vec![Value::String("none".into())],
                thresholds: json!({"./src/*.js": {"statements": -1}}),
                branches_true_unknown: true,
            },
        )
        .expect("coverage report");

        assert_eq!(report.threshold_failures.len(), 1);
        assert!(report.threshold_failures[0].contains("Uncovered count for statements (2)"));
        assert!(report.threshold_failures[0].contains("partial.js"));
    }

    #[test]
    fn matches_istanbul_package_summary_for_multiple_source_directories() {
        let temp = tempfile::tempdir().expect("temp dir");
        let alpha = temp.path().join("packages/alpha/source.js");
        let beta = temp.path().join("packages/beta/source.js");
        let mut coverage = fixture(&alpha);
        coverage.extend(fixture(&beta));
        let report = write_reports(
            &coverage,
            &CoverageOptions {
                root_dir: temp.path().to_path_buf(),
                threshold_base_dir: temp.path().to_path_buf(),
                coverage_directory: temp.path().join("coverage"),
                reporters: vec![Value::String("none".into())],
                thresholds: json!({}),
                branches_true_unknown: true,
            },
        )
        .expect("coverage report");

        assert_eq!(report.summary["total"]["branchesTrue"]["pct"], 100);
    }

    #[test]
    fn combines_statement_counts_on_the_same_line_for_line_coverage() {
        let value = json!({
            "statementMap": {
                "0": {"start": {"line": 4}},
                "1": {"start": {"line": 4}}
            },
            "fnMap": {}, "branchMap": {},
            "s": {"0": 0, "1": 3}, "f": {}, "b": {}
        });
        let file = FileCoverage::new("source.js", &value).expect("file coverage");

        assert_eq!(
            file.line_counts().expect("line counts"),
            BTreeMap::from([(4, 3)])
        );
        assert_eq!(file.summary().expect("summary").lines.covered, 1);
    }

    #[test]
    fn discovers_positive_and_negated_collect_coverage_globs() {
        let temp = tempfile::tempdir().expect("temp dir");
        fs::create_dir_all(temp.path().join("src/generated")).expect("source directories");
        for relative in [
            "src/included.js",
            "src/excluded.test.js",
            "src/generated/output.js",
            "outside.js",
        ] {
            fs::write(temp.path().join(relative), "module.exports = 1;\n").expect("source");
        }
        let excluded_test = temp.path().join("src/excluded.test.js");

        let sources = discover_sources(
            temp.path(),
            &["src/**/*.js".into(), "!src/generated/**".into()],
            &[],
            &[excluded_test],
        )
        .expect("discover sources");

        assert_eq!(
            sources,
            [temp
                .path()
                .join("src/included.js")
                .canonicalize()
                .expect("canonical source")]
        );
    }
}
