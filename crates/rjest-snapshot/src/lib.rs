//! Safe parsing and deterministic persistence of Jest external snapshot files.

use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

use rjest_core::SnapshotUpdate;
use thiserror::Error;

pub const SNAPSHOT_HEADER: &str = "// Jest Snapshot v1, https://jestjs.io/docs/snapshot-testing";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SnapshotFile {
    pub path: PathBuf,
    pub exists: bool,
    pub dirty: bool,
    pub data: BTreeMap<String, String>,
}

#[derive(Debug, Error)]
pub enum SnapshotError {
    #[error("cannot read snapshot file `{path}`: {source}")]
    Read {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("snapshot file `{path}` has an invalid or unsupported header: `{header}`")]
    InvalidHeader { path: PathBuf, header: String },
    #[error("cannot parse snapshot file `{path}` near byte {offset}: {message}")]
    Parse {
        path: PathBuf,
        offset: usize,
        message: String,
    },
    #[error("cannot create snapshot directory `{path}`: {source}")]
    CreateDirectory {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("cannot write snapshot file `{path}`: {source}")]
    Write {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("cannot remove obsolete snapshot file `{path}`: {source}")]
    Remove {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
}

/// Resolves and safely loads the Jest snapshot file associated with a test.
///
/// # Errors
///
/// Returns [`SnapshotError`] for I/O failures, unsupported headers in matching
/// mode, or malformed export statements.
pub fn load(test_path: &Path, update: SnapshotUpdate) -> Result<SnapshotFile, SnapshotError> {
    let path = snapshot_path(test_path);
    if !path.exists() {
        return Ok(SnapshotFile {
            path,
            exists: false,
            dirty: false,
            data: BTreeMap::new(),
        });
    }
    let source = fs::read_to_string(&path).map_err(|source| SnapshotError::Read {
        path: path.clone(),
        source,
    })?;
    let normalized = source.replace("\r\n", "\n").replace('\r', "\n");
    let header = normalized.lines().next().unwrap_or_default();
    let dirty = header != SNAPSHOT_HEADER;
    if dirty && update == SnapshotUpdate::None {
        return Err(SnapshotError::InvalidHeader {
            path,
            header: header.to_owned(),
        });
    }
    let data = parse_entries(&path, &normalized)?;
    Ok(SnapshotFile {
        path,
        exists: true,
        dirty,
        data,
    })
}

/// Writes dirty snapshot state using Jest's v1 external format, or removes an
/// empty obsolete file.
///
/// # Errors
///
/// Returns [`SnapshotError`] when directories, files, or obsolete files cannot
/// be updated.
pub fn persist(
    path: &Path,
    data: &BTreeMap<String, String>,
    dirty: bool,
) -> Result<(), SnapshotError> {
    if !dirty {
        return Ok(());
    }
    if data.is_empty() {
        if path.exists() {
            fs::remove_file(path).map_err(|source| SnapshotError::Remove {
                path: path.to_path_buf(),
                source,
            })?;
            remove_empty_parent(path)?;
        }
        return Ok(());
    }

    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent).map_err(|source| SnapshotError::CreateDirectory {
        path: parent.to_path_buf(),
        source,
    })?;
    let mut entries = data.iter().collect::<Vec<_>>();
    entries.sort_by(|(left, _), (right, _)| natord::compare(left, right));
    let body = entries
        .into_iter()
        .map(|(key, value)| {
            format!(
                "exports[`{}`] = `{}`;",
                escape_template(key),
                escape_template(&normalize_newlines(value))
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    fs::write(path, format!("{SNAPSHOT_HEADER}\n\n{body}\n")).map_err(|source| {
        SnapshotError::Write {
            path: path.to_path_buf(),
            source,
        }
    })
}

pub fn snapshot_path(test_path: &Path) -> PathBuf {
    let file_name = test_path.file_name().map_or_else(
        || "unknown.snap".into(),
        |name| format!("{}.snap", name.to_string_lossy()),
    );
    test_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("__snapshots__")
        .join(file_name)
}

fn parse_entries(path: &Path, source: &str) -> Result<BTreeMap<String, String>, SnapshotError> {
    let mut entries = BTreeMap::new();
    let mut offset = source.find('\n').map_or(source.len(), |index| index + 1);
    while offset < source.len() {
        offset = skip_whitespace(source, offset);
        if offset == source.len() {
            break;
        }
        offset = expect(path, source, offset, "exports[`")?;
        let (key, next) = read_template(path, source, offset)?;
        offset = expect(path, source, next, "] = `")?;
        let (value, next) = read_template(path, source, offset)?;
        offset = expect(path, source, next, ";")?;
        entries.insert(key, value);
    }
    Ok(entries)
}

fn skip_whitespace(source: &str, mut offset: usize) -> usize {
    while let Some(character) = source[offset..].chars().next() {
        if !character.is_whitespace() {
            break;
        }
        offset += character.len_utf8();
    }
    offset
}

fn expect(
    path: &Path,
    source: &str,
    offset: usize,
    expected: &str,
) -> Result<usize, SnapshotError> {
    source[offset..]
        .starts_with(expected)
        .then_some(offset + expected.len())
        .ok_or_else(|| SnapshotError::Parse {
            path: path.to_path_buf(),
            offset,
            message: format!("expected `{expected}`"),
        })
}

fn read_template(
    path: &Path,
    source: &str,
    start: usize,
) -> Result<(String, usize), SnapshotError> {
    let mut raw = String::new();
    let mut characters = source[start..].char_indices();
    while let Some((relative, character)) = characters.next() {
        if character == '`' {
            return Ok((unescape_template(&raw), start + relative + 1));
        }
        raw.push(character);
        if character == '\\' {
            if let Some((_, escaped)) = characters.next() {
                raw.push(escaped);
            }
        }
    }
    Err(SnapshotError::Parse {
        path: path.to_path_buf(),
        offset: start,
        message: "unterminated template literal".into(),
    })
}

fn escape_template(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('`', "\\`")
        .replace("${", "\\${")
}

fn unescape_template(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut characters = value.chars().peekable();
    while let Some(character) = characters.next() {
        if character != '\\' {
            output.push(character);
            continue;
        }
        match characters.next() {
            Some('\\') | None => output.push('\\'),
            Some('`') => output.push('`'),
            Some('$') if characters.peek() == Some(&'{') => output.push('$'),
            Some(other) => {
                output.push('\\');
                output.push(other);
            }
        }
    }
    output
}

fn normalize_newlines(value: &str) -> String {
    value.replace("\r\n", "\n").replace('\r', "\n")
}

fn remove_empty_parent(path: &Path) -> Result<(), SnapshotError> {
    let Some(parent) = path.parent() else {
        return Ok(());
    };
    let is_empty = fs::read_dir(parent)
        .map_err(|source| SnapshotError::Read {
            path: parent.to_path_buf(),
            source,
        })?
        .next()
        .is_none();
    if is_empty {
        fs::remove_dir(parent).map_err(|source| SnapshotError::Remove {
            path: parent.to_path_buf(),
            source,
        })?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::*;

    #[test]
    fn round_trips_jest_template_escaping_and_natural_order() {
        let temp = tempdir().expect("temp dir");
        let path = temp.path().join("sample.snap");
        let data = BTreeMap::from([
            ("case 10".into(), "`${value}` and \\ slash".into()),
            ("case 2".into(), "line one\nline two".into()),
        ]);

        persist(&path, &data, true).expect("persist");
        let source = fs::read_to_string(&path).expect("snapshot source");
        assert!(source.find("case 2").unwrap() < source.find("case 10").unwrap());
        let parsed = parse_entries(&path, &source).expect("parse");
        assert_eq!(parsed, data);
    }

    #[test]
    fn rejects_invalid_header_without_update_mode() {
        let temp = tempdir().expect("temp dir");
        let test_path = temp.path().join("sample.test.js");
        let snapshot_path = snapshot_path(&test_path);
        fs::create_dir_all(snapshot_path.parent().unwrap()).expect("snapshot dir");
        fs::write(&snapshot_path, "// old\n\nexports[`case 1`] = `value`;\n")
            .expect("snapshot source");

        assert!(matches!(
            load(&test_path, SnapshotUpdate::None),
            Err(SnapshotError::InvalidHeader { .. })
        ));
        assert!(
            load(&test_path, SnapshotUpdate::All)
                .expect("updatable snapshot")
                .dirty
        );
    }
}
