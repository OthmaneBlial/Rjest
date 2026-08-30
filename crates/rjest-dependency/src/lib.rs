//! Static module dependency graphs and Git changed-file discovery.

use std::{
    collections::{BTreeMap, BTreeSet},
    ffi::{OsStr, OsString},
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
};

use anyhow::{Context, Result, bail, ensure};
use regex::Regex;
use rjest_core::{HasteConfig, ModuleNameMapper, TestFile};
use walkdir::{DirEntry, WalkDir};

const DEPENDENCY_BRIDGE: &str = include_str!("../runtime/dependency-graph.mjs");
const DEPENDENCY_PREFIX: &str = "__RJEST_DEPENDENCIES__";

/// Inputs required to build one Jest project context's dependency graph.
pub struct GraphOptions<'a> {
    pub root_dir: &'a Path,
    pub roots: &'a [PathBuf],
    pub module_file_extensions: &'a [String],
    pub module_path_ignore_patterns: &'a [String],
    pub module_name_mapper: &'a [ModuleNameMapper],
    pub module_directories: &'a [String],
    pub module_paths: &'a [PathBuf],
    pub resolver: Option<&'a str>,
    pub resolver_engine_path: &'a Path,
    pub haste: &'a HasteConfig,
}

/// Resolved direct dependencies for every scanned project module.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct DependencyGraph {
    modules: BTreeMap<PathBuf, BTreeSet<PathBuf>>,
    complete: bool,
}

impl DependencyGraph {
    /// Scans project modules and resolves their statically declared imports.
    ///
    /// # Errors
    ///
    /// Returns an error when paths cannot be scanned, ignore patterns are
    /// invalid, the resolver bridge cannot start, or it returns invalid data.
    pub fn build(options: &GraphOptions<'_>) -> Result<Self> {
        let files = discover_modules(options)?;
        let request = serde_json::json!({
            "files": files,
            "haste": options.haste,
            "moduleDirectories": options.module_directories,
            "moduleFileExtensions": options.module_file_extensions,
            "moduleNameMapper": options.module_name_mapper,
            "modulePaths": options.module_paths,
            "resolver": options.resolver,
            "resolverEnginePath": options.resolver_engine_path,
            "rootDir": options.root_dir,
        });
        let response = run_dependency_bridge(&request)?;
        let dependencies = response
            .get("dependencies")
            .and_then(serde_json::Value::as_array)
            .context("dependency resolver returned no module map")?;
        let mut modules = BTreeMap::new();
        for entry in dependencies {
            let file = entry
                .get("file")
                .and_then(serde_json::Value::as_str)
                .context("dependency resolver returned a module without a file")?;
            let resolved = entry
                .get("dependencies")
                .and_then(serde_json::Value::as_array)
                .context("dependency resolver returned an invalid dependency list")?;
            let dependencies = resolved
                .iter()
                .map(|dependency| {
                    dependency
                        .as_str()
                        .map(PathBuf::from)
                        .context("dependency resolver returned a non-path dependency")
                })
                .collect::<Result<BTreeSet<_>>>()?;
            modules.insert(PathBuf::from(file), dependencies);
        }
        let complete = response
            .get("conservativeFallback")
            .and_then(serde_json::Value::as_bool)
            != Some(true);
        Ok(Self { modules, complete })
    }

    /// Returns tests transitively related to the supplied changed paths.
    pub fn related_tests(
        &self,
        changed_paths: &BTreeSet<PathBuf>,
        tests: &[TestFile],
    ) -> BTreeSet<PathBuf> {
        let tests = tests
            .iter()
            .map(|test| test.path.clone())
            .collect::<BTreeSet<_>>();
        if !self.complete {
            return tests;
        }
        let mut related = BTreeSet::new();
        let mut changed = changed_paths
            .iter()
            .map(|path| normalize_absolute_path(path))
            .collect::<BTreeSet<_>>();
        for path in changed_paths {
            if let Some(test_path) = snapshot_test_path(path)
                && tests.contains(&test_path)
            {
                changed.insert(test_path);
            }
        }
        related.extend(changed.intersection(&tests).cloned());

        let mut visited = BTreeSet::new();
        loop {
            let inverse = self
                .modules
                .iter()
                .filter(|(module, dependencies)| {
                    !visited.contains(*module)
                        && dependencies
                            .iter()
                            .any(|dependency| changed.contains(dependency))
                })
                .map(|(module, _)| module.clone())
                .collect::<BTreeSet<_>>();
            if inverse.is_empty() {
                break;
            }
            for module in &inverse {
                visited.insert(module.clone());
                if tests.contains(module) {
                    related.insert(module.clone());
                }
            }
            changed = inverse;
        }
        related
    }

    /// Returns the source paths Jest allows coverage instrumentation for during
    /// changed-file selection.
    ///
    /// Changed files themselves are eligible, as are direct dependencies of a
    /// changed test file. An incomplete graph returns `None` so callers can
    /// conservatively avoid filtering coverage and hiding data.
    pub fn changed_coverage_paths(
        &self,
        changed_paths: &BTreeSet<PathBuf>,
        tests: &[TestFile],
    ) -> Option<BTreeSet<PathBuf>> {
        if !self.complete {
            return None;
        }
        let tests = tests
            .iter()
            .map(|test| test.path.clone())
            .collect::<BTreeSet<_>>();
        let changed = changed_paths
            .iter()
            .map(|path| normalize_absolute_path(path))
            .collect::<BTreeSet<_>>();
        let mut coverage = changed.clone();
        for test in changed.intersection(&tests) {
            if let Some(dependencies) = self.modules.get(test) {
                coverage.extend(dependencies.iter().cloned());
            }
        }
        Some(coverage)
    }
}

/// Git working-tree state across one or more Jest roots.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct ChangedFiles {
    pub files: BTreeSet<PathBuf>,
    pub repositories: BTreeSet<PathBuf>,
}

/// Git history boundary used by Jest's changed-test CLI modes.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct GitChangeOptions<'a> {
    pub changed_since: Option<&'a str>,
    pub last_commit: bool,
    pub with_ancestor: bool,
}

/// Finds staged, unstaged, deleted, and untracked files below Jest roots.
///
/// Roots outside Git repositories are retained as a no-SCM result, matching
/// Jest's default `--watch` boundary. Mercurial and Sapling are not yet probed.
///
/// # Errors
///
/// Returns an error when a discovered Git repository cannot report its state.
pub fn git_changed_files(roots: &[PathBuf]) -> Result<ChangedFiles> {
    git_changed_files_with_options(roots, &GitChangeOptions::default())
}

/// Finds Git changes below Jest roots using an explicit history boundary.
///
/// `last_commit` selects the files in `HEAD`. `with_ancestor` selects the
/// `HEAD^...HEAD` range and takes precedence over `changed_since`, matching
/// Jest's Git adapter. Staged and working-tree changes are included unless
/// `last_commit` is selected.
///
/// # Errors
///
/// Returns an error when a discovered Git repository cannot report its state
/// or the requested revision does not exist.
pub fn git_changed_files_with_options(
    roots: &[PathBuf],
    options: &GitChangeOptions<'_>,
) -> Result<ChangedFiles> {
    let normalized_roots = roots
        .iter()
        .map(|root| normalize_absolute_path(root))
        .collect::<Vec<_>>();
    let mut repositories = BTreeSet::new();
    for root in &normalized_roots {
        let output = Command::new("git")
            .args(["rev-parse", "--show-toplevel"])
            .current_dir(root)
            .output()
            .with_context(|| format!("cannot inspect Git repository from `{}`", root.display()))?;
        if output.status.success() {
            let repository = String::from_utf8_lossy(&output.stdout).trim().to_owned();
            if !repository.is_empty() {
                repositories.insert(normalize_absolute_path(Path::new(&repository)));
            }
        }
    }

    let mut files = BTreeSet::new();
    for repository in &repositories {
        let changed_since = options
            .with_ancestor
            .then_some("HEAD^")
            .or(options.changed_since);
        let mut queries = Vec::<Vec<OsString>>::new();
        if options.last_commit {
            queries.push(
                ["show", "--name-only", "--pretty=format:", "-z", "HEAD"]
                    .into_iter()
                    .map(OsString::from)
                    .collect(),
            );
        } else {
            if let Some(revision) = changed_since {
                queries.push(
                    ["diff", "--name-only", "-z"]
                        .into_iter()
                        .map(OsString::from)
                        .chain(std::iter::once(OsString::from(format!(
                            "{revision}...HEAD"
                        ))))
                        .collect(),
                );
            }
            queries.push(
                ["diff", "--cached", "--name-only", "-z"]
                    .into_iter()
                    .map(OsString::from)
                    .collect(),
            );
            queries.push(
                [
                    "ls-files",
                    "--other",
                    "--modified",
                    "--exclude-standard",
                    "-z",
                ]
                .into_iter()
                .map(OsString::from)
                .collect(),
            );
        }
        for arguments in queries {
            let output = Command::new("git")
                .args(&arguments)
                .current_dir(repository)
                .output()
                .with_context(|| {
                    format!("cannot read Git changes from `{}`", repository.display())
                })?;
            ensure!(
                output.status.success(),
                "Git changed-file query failed in `{}`: {}",
                repository.display(),
                String::from_utf8_lossy(&output.stderr).trim()
            );
            for path in output
                .stdout
                .split(|byte| *byte == 0)
                .filter(|path| !path.is_empty())
            {
                let path = normalize_absolute_path(
                    &repository.join(String::from_utf8_lossy(path).as_ref()),
                );
                if normalized_roots.iter().any(|root| path.starts_with(root)) {
                    files.insert(path);
                }
            }
        }
    }
    Ok(ChangedFiles {
        files,
        repositories,
    })
}

fn discover_modules(options: &GraphOptions<'_>) -> Result<Vec<PathBuf>> {
    let ignore_patterns = options
        .module_path_ignore_patterns
        .iter()
        .map(|pattern| {
            Regex::new(pattern)
                .with_context(|| format!("invalid modulePathIgnorePatterns regex `{pattern}`"))
        })
        .collect::<Result<Vec<_>>>()?;
    let extensions = options
        .module_file_extensions
        .iter()
        .map(String::as_str)
        .collect::<BTreeSet<_>>();
    let mut files = BTreeSet::new();
    for root in options.roots {
        for entry in WalkDir::new(root)
            .follow_links(false)
            .into_iter()
            .filter_entry(|entry| should_visit(entry, &ignore_patterns))
        {
            let entry = entry.with_context(|| format!("cannot scan `{}`", root.display()))?;
            if !entry.file_type().is_file() {
                continue;
            }
            let extension = entry.path().extension().and_then(OsStr::to_str);
            if extension.is_some_and(|extension| extensions.contains(extension)) {
                files.insert(normalize_absolute_path(entry.path()));
            }
        }
    }
    Ok(files.into_iter().collect())
}

fn should_visit(entry: &DirEntry, ignore_patterns: &[Regex]) -> bool {
    if entry.depth() > 0
        && entry.file_type().is_dir()
        && matches!(entry.file_name().to_str(), Some("node_modules" | ".git"))
    {
        return false;
    }
    let normalized = entry.path().to_string_lossy().replace('\\', "/");
    !ignore_patterns
        .iter()
        .any(|pattern| pattern.is_match(&normalized))
}

fn run_dependency_bridge(request: &serde_json::Value) -> Result<serde_json::Value> {
    let mut child = Command::new("node")
        .arg("--input-type=module")
        .arg("--eval")
        .arg(DEPENDENCY_BRIDGE)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .context("cannot start the dependency resolver")?;
    let mut stdin = child
        .stdin
        .take()
        .context("dependency resolver stdin is unavailable")?;
    serde_json::to_writer(&mut stdin, request).context("cannot send dependency graph request")?;
    stdin
        .flush()
        .context("cannot flush dependency graph request")?;
    drop(stdin);
    let output = child
        .wait_with_output()
        .context("cannot wait for the dependency resolver")?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    ensure!(
        output.status.success(),
        "dependency resolver exited with {}{}",
        output.status,
        process_details(&stdout, &stderr)
    );
    let payload = stdout
        .lines()
        .rev()
        .find_map(|line| line.strip_prefix(DEPENDENCY_PREFIX))
        .with_context(|| {
            format!(
                "dependency resolver returned no result{}",
                process_details(&stdout, &stderr)
            )
        })?;
    let response: serde_json::Value =
        serde_json::from_str(payload).context("dependency resolver returned invalid JSON")?;
    if response.get("ok").and_then(serde_json::Value::as_bool) != Some(true) {
        bail!(
            "dependency resolver failed: {}",
            response
                .get("error")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("unknown dependency resolver error")
        );
    }
    Ok(response)
}

fn snapshot_test_path(path: &Path) -> Option<PathBuf> {
    let filename = path.file_name()?.to_str()?.strip_suffix(".snap")?;
    let snapshots = path.parent()?;
    if snapshots.file_name()? != "__snapshots__" {
        return None;
    }
    Some(normalize_absolute_path(&snapshots.parent()?.join(filename)))
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

fn normalize_absolute_path(path: &Path) -> PathBuf {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir().map_or_else(|_| path.to_path_buf(), |cwd| cwd.join(path))
    };
    let mut normalized = PathBuf::new();
    for component in absolute.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            component => normalized.push(component.as_os_str()),
        }
    }
    fs::canonicalize(&normalized).unwrap_or(normalized)
}

#[cfg(test)]
mod tests {
    use std::{
        collections::{BTreeMap, BTreeSet},
        ffi::OsStr,
        fs,
        path::{Path, PathBuf},
        process::Command,
    };

    use tempfile::tempdir;

    use super::{
        DependencyGraph, GitChangeOptions, git_changed_files, git_changed_files_with_options,
    };
    use rjest_core::TestFile;

    fn run_git(cwd: &Path, arguments: &[&str]) {
        let status = Command::new("git")
            .args(arguments)
            .current_dir(cwd)
            .status()
            .expect("git command");
        assert!(status.success());
    }

    #[test]
    fn selects_direct_transitive_and_snapshot_related_tests() {
        let temp = tempdir().expect("temp dir");
        let source = temp.path().join("source.js");
        let helper = temp.path().join("helper.js");
        let alpha = temp.path().join("alpha.test.js");
        let beta = temp.path().join("beta.test.js");
        let snapshot = temp.path().join("__snapshots__/alpha.test.js.snap");
        let graph = DependencyGraph {
            modules: BTreeMap::from([
                (helper.clone(), [source.clone()].into()),
                (alpha.clone(), [helper.clone()].into()),
                (beta.clone(), BTreeSet::new()),
            ]),
            complete: true,
        };
        let tests = [
            TestFile {
                path: alpha.clone(),
            },
            TestFile { path: beta.clone() },
        ];

        assert_eq!(
            graph.related_tests(&[source.clone()].into(), &tests),
            [alpha.clone()].into()
        );
        assert_eq!(
            graph.related_tests(&[snapshot].into(), &tests),
            [alpha.clone()].into()
        );
        assert_eq!(
            graph.changed_coverage_paths(&[source.clone()].into(), &tests),
            Some([source].into())
        );
        assert_eq!(
            graph.changed_coverage_paths(&[alpha.clone()].into(), &tests),
            Some([alpha, helper].into())
        );
    }

    #[test]
    fn incomplete_resolution_conservatively_selects_every_test() {
        let tests = [
            TestFile {
                path: PathBuf::from("alpha.test.js"),
            },
            TestFile {
                path: PathBuf::from("beta.test.js"),
            },
        ];
        let related =
            DependencyGraph::default().related_tests(&[PathBuf::from("source.js")].into(), &tests);

        assert_eq!(
            related,
            [
                PathBuf::from("alpha.test.js"),
                PathBuf::from("beta.test.js")
            ]
            .into()
        );
        assert_eq!(
            DependencyGraph::default()
                .changed_coverage_paths(&[PathBuf::from("source.js")].into(), &tests),
            None
        );
    }

    #[test]
    fn reports_staged_modified_deleted_and_untracked_git_files() {
        let temp = tempdir().expect("temp dir");
        for arguments in [
            ["init", "-b", "main"].as_slice(),
            ["config", "user.email", "rjest@example.test"].as_slice(),
            ["config", "user.name", "Rjest"].as_slice(),
        ] {
            run_git(temp.path(), arguments);
        }
        for name in ["staged.js", "modified.js", "deleted.js"] {
            fs::write(temp.path().join(name), "module.exports = 1;\n").expect("baseline file");
        }
        let status = Command::new("git")
            .args(["add", "."])
            .current_dir(temp.path())
            .status()
            .expect("git add");
        assert!(status.success());
        let status = Command::new("git")
            .args(["commit", "-m", "baseline"])
            .current_dir(temp.path())
            .status()
            .expect("git commit");
        assert!(status.success());

        fs::write(temp.path().join("staged.js"), "module.exports = 2;\n").expect("staged");
        let status = Command::new("git")
            .args(["add", "staged.js"])
            .current_dir(temp.path())
            .status()
            .expect("stage change");
        assert!(status.success());
        fs::write(temp.path().join("modified.js"), "module.exports = 3;\n").expect("modified");
        fs::remove_file(temp.path().join("deleted.js")).expect("deleted");
        fs::write(temp.path().join("untracked.js"), "module.exports = 4;\n").expect("untracked");

        let changed = git_changed_files(&[temp.path().to_path_buf()]).expect("changed files");
        let names = changed
            .files
            .iter()
            .filter_map(|path| path.file_name().and_then(OsStr::to_str))
            .collect::<BTreeSet<_>>();
        assert_eq!(
            names,
            ["deleted.js", "modified.js", "staged.js", "untracked.js"].into()
        );
        assert_eq!(changed.repositories.len(), 1);
    }

    #[test]
    fn reports_no_repository_for_a_plain_directory() {
        let temp = tempdir().expect("temp dir");
        fs::write(temp.path().join("source.js"), "module.exports = 1;\n").expect("source");

        let changed = git_changed_files(&[temp.path().to_path_buf()]).expect("changed files");

        assert!(changed.files.is_empty());
        assert!(changed.repositories.is_empty());
    }

    #[test]
    fn filters_changes_to_roots_and_deduplicates_the_repository() {
        let temp = tempdir().expect("temp dir");
        for arguments in [
            ["init", "-b", "main"].as_slice(),
            ["config", "user.email", "rjest@example.test"].as_slice(),
            ["config", "user.name", "Rjest"].as_slice(),
        ] {
            let status = Command::new("git")
                .args(arguments)
                .current_dir(temp.path())
                .status()
                .expect("git setup");
            assert!(status.success());
        }
        let alpha = temp.path().join("packages/alpha");
        let beta = temp.path().join("packages/beta");
        fs::create_dir_all(&alpha).expect("alpha directory");
        fs::create_dir_all(&beta).expect("beta directory");
        fs::write(alpha.join("source.js"), "module.exports = 1;\n").expect("alpha source");
        fs::write(beta.join("source.js"), "module.exports = 1;\n").expect("beta source");
        let status = Command::new("git")
            .args(["add", "."])
            .current_dir(temp.path())
            .status()
            .expect("git add");
        assert!(status.success());
        let status = Command::new("git")
            .args(["commit", "-m", "baseline"])
            .current_dir(temp.path())
            .status()
            .expect("git commit");
        assert!(status.success());
        fs::write(alpha.join("source.js"), "module.exports = 2;\n").expect("alpha change");
        fs::write(beta.join("source.js"), "module.exports = 2;\n").expect("beta change");

        let changed = git_changed_files(&[alpha.clone(), alpha]).expect("changed files");

        assert_eq!(changed.repositories.len(), 1);
        let alpha_source = fs::canonicalize(temp.path().join("packages/alpha/source.js"))
            .expect("canonical alpha source");
        assert_eq!(changed.files, [alpha_source].into());
    }

    #[test]
    fn selects_last_commit_changed_since_and_ancestor_ranges() {
        let temp = tempdir().expect("temp dir");
        for arguments in [
            ["init", "-b", "main"].as_slice(),
            ["config", "user.email", "rjest@example.test"].as_slice(),
            ["config", "user.name", "Rjest"].as_slice(),
        ] {
            let status = Command::new("git")
                .args(arguments)
                .current_dir(temp.path())
                .status()
                .expect("git setup");
            assert!(status.success());
        }
        for name in ["alpha.js", "beta.js"] {
            fs::write(temp.path().join(name), "module.exports = 1;\n").expect("baseline file");
        }
        for arguments in [
            ["add", "."].as_slice(),
            ["commit", "-m", "baseline"].as_slice(),
        ] {
            run_git(temp.path(), arguments);
        }
        let baseline = Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(temp.path())
            .output()
            .expect("baseline revision");
        assert!(baseline.status.success());
        let baseline = String::from_utf8(baseline.stdout)
            .expect("utf8 revision")
            .trim()
            .to_owned();

        fs::write(temp.path().join("alpha.js"), "module.exports = 2;\n").expect("alpha change");
        for arguments in [
            ["add", "alpha.js"].as_slice(),
            ["commit", "-m", "alpha change"].as_slice(),
        ] {
            run_git(temp.path(), arguments);
        }
        fs::write(temp.path().join("beta.js"), "module.exports = 2;\n").expect("beta change");
        let roots = [temp.path().to_path_buf()];
        let names = |changed: super::ChangedFiles| {
            changed
                .files
                .into_iter()
                .filter_map(|path| path.file_name().and_then(OsStr::to_str).map(str::to_owned))
                .collect::<BTreeSet<_>>()
        };

        assert_eq!(
            names(git_changed_files(&roots).expect("working tree")),
            ["beta.js".into()].into()
        );
        assert_eq!(
            names(
                git_changed_files_with_options(
                    &roots,
                    &GitChangeOptions {
                        last_commit: true,
                        ..GitChangeOptions::default()
                    },
                )
                .expect("last commit"),
            ),
            ["alpha.js".into()].into()
        );
        assert_eq!(
            names(
                git_changed_files_with_options(
                    &roots,
                    &GitChangeOptions {
                        changed_since: Some(&baseline),
                        ..GitChangeOptions::default()
                    },
                )
                .expect("changed since"),
            ),
            ["alpha.js".into(), "beta.js".into()].into()
        );
        assert_eq!(
            names(
                git_changed_files_with_options(
                    &roots,
                    &GitChangeOptions {
                        with_ancestor: true,
                        ..GitChangeOptions::default()
                    },
                )
                .expect("with ancestor"),
            ),
            ["alpha.js".into(), "beta.js".into()].into()
        );
    }
}
