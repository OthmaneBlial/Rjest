//! Deterministic native test-file discovery.

use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
};

use globset::{Glob, GlobSet, GlobSetBuilder};
use regex::RegexSet;
use rjest_config::ProjectConfig;
use rjest_core::TestFile;
use thiserror::Error;
use walkdir::{DirEntry, WalkDir};

const DEFAULT_TEST_MATCH: &[&str] = &[
    "**/__tests__/**/*.?([mc])[jt]s?(x)",
    "**/?(*.)+(spec|test).?([mc])[jt]s?(x)",
];

#[derive(Debug, Error)]
pub enum DiscoveryError {
    #[error("invalid testMatch glob `{pattern}`: {source}")]
    InvalidGlob {
        pattern: String,
        #[source]
        source: globset::Error,
    },
    #[error("invalid test regular expression: {0}")]
    InvalidRegex(#[from] regex::Error),
    #[error("cannot walk test root `{root}`: {source}")]
    Walk {
        root: PathBuf,
        source: walkdir::Error,
    },
    #[error("explicit test path `{0}` does not exist")]
    MissingExplicitPath(PathBuf),
    #[error("cannot canonicalize `{path}`: {source}")]
    Canonicalize {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
}

/// Selects test files from normalized configuration and optional CLI paths.
///
/// # Errors
///
/// Returns [`DiscoveryError`] for invalid patterns, inaccessible trees, missing
/// explicit paths, or paths that cannot be canonicalized.
pub fn discover(
    config: &ProjectConfig,
    explicit_paths: &[PathBuf],
) -> Result<Vec<TestFile>, DiscoveryError> {
    let matcher = Matcher::new(config)?;
    let mut discovered = BTreeSet::new();

    if explicit_paths.is_empty() {
        for root in &config.roots {
            walk(root, &matcher, false, &mut discovered)?;
        }
    } else {
        for input in explicit_paths {
            let path = if input.is_absolute() {
                input.clone()
            } else {
                config.root_dir.join(input)
            };
            if path.is_file() {
                insert_canonical(&path, &mut discovered)?;
            } else if path.is_dir() {
                walk(&path, &matcher, false, &mut discovered)?;
            } else {
                // Jest treats positional arguments as path patterns. Preserve
                // that useful behavior after trying exact file/directory paths.
                let needle = input.to_string_lossy().replace('\\', "/");
                let mut any = false;
                for root in &config.roots {
                    walk_matching_path(root, &matcher, &needle, &mut discovered, &mut any)?;
                }
                if !any {
                    return Err(DiscoveryError::MissingExplicitPath(input.clone()));
                }
            }
        }
    }

    Ok(discovered
        .into_iter()
        .map(|path| TestFile { path })
        .collect())
}

fn walk(
    root: &Path,
    matcher: &Matcher,
    include_all_files: bool,
    output: &mut BTreeSet<PathBuf>,
) -> Result<(), DiscoveryError> {
    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(should_descend)
    {
        let entry = entry.map_err(|source| DiscoveryError::Walk {
            root: root.to_path_buf(),
            source,
        })?;
        if entry.file_type().is_file()
            && !matcher.is_ignored(entry.path())
            && (include_all_files || matcher.is_test(entry.path()))
        {
            insert_canonical(entry.path(), output)?;
        }
    }
    Ok(())
}

fn walk_matching_path(
    root: &Path,
    matcher: &Matcher,
    needle: &str,
    output: &mut BTreeSet<PathBuf>,
    any: &mut bool,
) -> Result<(), DiscoveryError> {
    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(should_descend)
    {
        let entry = entry.map_err(|source| DiscoveryError::Walk {
            root: root.to_path_buf(),
            source,
        })?;
        let normalized = normalize(entry.path());
        if entry.file_type().is_file()
            && normalized.contains(needle)
            && !matcher.is_ignored(entry.path())
            && matcher.is_test(entry.path())
        {
            *any = true;
            insert_canonical(entry.path(), output)?;
        }
    }
    Ok(())
}

fn should_descend(entry: &DirEntry) -> bool {
    if !entry.file_type().is_dir() {
        return true;
    }
    !matches!(
        entry.file_name().to_str(),
        Some(".git" | ".rjest-cache" | "base" | "node_modules" | "target")
    )
}

fn insert_canonical(path: &Path, output: &mut BTreeSet<PathBuf>) -> Result<(), DiscoveryError> {
    let canonical = path
        .canonicalize()
        .map_err(|source| DiscoveryError::Canonicalize {
            path: path.to_path_buf(),
            source,
        })?;
    output.insert(canonical);
    Ok(())
}

struct Matcher {
    custom_globs: Option<GlobSet>,
    test_regex: RegexSet,
    ignore_regex: RegexSet,
    use_default_match: bool,
}

impl Matcher {
    fn new(config: &ProjectConfig) -> Result<Self, DiscoveryError> {
        let use_default_match = config
            .test_match
            .iter()
            .map(String::as_str)
            .eq(DEFAULT_TEST_MATCH.iter().copied());
        let custom_globs = if use_default_match || config.test_match.is_empty() {
            None
        } else {
            let mut builder = GlobSetBuilder::new();
            for pattern in &config.test_match {
                let glob = Glob::new(pattern).map_err(|source| DiscoveryError::InvalidGlob {
                    pattern: pattern.clone(),
                    source,
                })?;
                builder.add(glob);
            }
            Some(
                builder
                    .build()
                    .map_err(|source| DiscoveryError::InvalidGlob {
                        pattern: config.test_match.join(", "),
                        source,
                    })?,
            )
        };

        Ok(Self {
            custom_globs,
            test_regex: RegexSet::new(&config.test_regex)?,
            ignore_regex: RegexSet::new(&config.test_path_ignore_patterns)?,
            use_default_match,
        })
    }

    fn is_test(&self, path: &Path) -> bool {
        let normalized = normalize(path);
        let glob_match = if self.use_default_match {
            is_default_jest_test(path)
        } else {
            self.custom_globs
                .as_ref()
                .is_some_and(|globs| globs.is_match(&normalized))
        };
        glob_match || self.test_regex.is_match(&normalized)
    }

    fn is_ignored(&self, path: &Path) -> bool {
        self.ignore_regex.is_match(&normalize(path))
    }
}

fn normalize(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn is_default_jest_test(path: &Path) -> bool {
    const TEST_EXTENSIONS: &[&str] = &["js", "jsx", "ts", "tsx", "mjs", "mts", "cjs", "cts"];
    let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    let extension_matches = TEST_EXTENSIONS
        .iter()
        .any(|extension| file_name.ends_with(&format!(".{extension}")));
    if !extension_matches {
        return false;
    }
    let normalized = normalize(path);
    if normalized.contains("/__tests__/") {
        return true;
    }
    TEST_EXTENSIONS.iter().any(|extension| {
        file_name.ends_with(&format!(".test.{extension}"))
            || file_name.ends_with(&format!(".spec.{extension}"))
    })
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::*;

    fn touch(path: &Path) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parents");
        }
        fs::write(path, "").expect("write fixture");
    }

    #[test]
    fn discovers_default_jest_patterns_in_stable_order() {
        let temp = tempdir().expect("temp dir");
        touch(&temp.path().join("z.spec.ts"));
        touch(&temp.path().join("a.test.js"));
        touch(&temp.path().join("src/__tests__/plain.mjs"));
        touch(&temp.path().join("src/index.js"));
        touch(&temp.path().join("node_modules/pkg/ignored.test.js"));
        let config = ProjectConfig::defaults(temp.path()).expect("config");

        let files = discover(&config, &[]).expect("discover");
        let names = files
            .iter()
            .map(|file| {
                file.path
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect::<Vec<_>>();
        assert_eq!(names, ["a.test.js", "plain.mjs", "z.spec.ts"]);
    }

    #[test]
    fn exact_explicit_file_does_not_require_test_suffix() {
        let temp = tempdir().expect("temp dir");
        touch(&temp.path().join("checks/custom.js"));
        let config = ProjectConfig::defaults(temp.path()).expect("config");

        let files = discover(&config, &[PathBuf::from("checks/custom.js")]).expect("discover");
        assert_eq!(files.len(), 1);
        assert!(files[0].path.ends_with("checks/custom.js"));
    }

    #[test]
    fn custom_test_match_replaces_defaults() {
        let temp = tempdir().expect("temp dir");
        touch(&temp.path().join("src/alpha.check.js"));
        touch(&temp.path().join("src/beta.test.js"));
        let mut config = ProjectConfig::defaults(temp.path()).expect("config");
        config.test_match = vec!["**/*.check.js".into()];

        let files = discover(&config, &[]).expect("discover");
        assert_eq!(files.len(), 1);
        assert!(files[0].path.ends_with("alpha.check.js"));
    }
}
