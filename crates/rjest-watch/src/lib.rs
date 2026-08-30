//! Native filesystem watching for repeated Rjest execution cycles.

use std::{
    collections::BTreeSet,
    path::{Component, Path, PathBuf},
    sync::mpsc::{self, Receiver, RecvTimeoutError, TryRecvError},
    time::{Duration, Instant},
};

use anyhow::{Context, Result, bail, ensure};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use regex::Regex;

const DEFAULT_DEBOUNCE: Duration = Duration::from_millis(150);

/// Configuration for a native recursive watcher.
#[derive(Clone, Debug)]
pub struct WatchOptions {
    /// Project roots whose changes may affect a test run.
    pub roots: Vec<PathBuf>,
    /// Jest-compatible regular expressions applied to normalized absolute paths.
    pub ignore_patterns: Vec<String>,
    /// Generated-output directories and files that must not trigger a run.
    pub ignored_paths: Vec<PathBuf>,
    /// Quiet period used to coalesce one filesystem operation into one run.
    pub debounce: Duration,
}

impl WatchOptions {
    /// Creates watch options with Rjest's default debounce interval.
    pub fn new(roots: Vec<PathBuf>) -> Self {
        Self {
            roots,
            ignore_patterns: Vec::new(),
            ignored_paths: Vec::new(),
            debounce: DEFAULT_DEBOUNCE,
        }
    }
}

/// A live native watcher. Keep this value alive for the whole watch session.
pub struct NativeWatcher {
    _watcher: RecommendedWatcher,
    receiver: Receiver<notify::Result<Event>>,
    filter: EventFilter,
    debounce: Duration,
}

impl NativeWatcher {
    /// Starts recursively watching all unique, non-overlapping project roots.
    ///
    /// # Errors
    ///
    /// Returns an error when a regular expression is invalid, a root is
    /// missing, or the platform watcher cannot subscribe to a root.
    pub fn start(options: &WatchOptions) -> Result<Self> {
        ensure!(!options.roots.is_empty(), "watch mode has no project roots");
        let roots = minimal_roots(&options.roots)?;
        let filter = EventFilter::new(&options.ignore_patterns, &options.ignored_paths)?;
        let (sender, receiver) = mpsc::channel();
        let mut watcher = notify::recommended_watcher(sender)
            .context("cannot initialize the native filesystem watcher")?;
        for root in roots {
            watcher
                .watch(&root, RecursiveMode::Recursive)
                .with_context(|| format!("cannot watch project root `{}`", root.display()))?;
        }
        Ok(Self {
            _watcher: watcher,
            receiver,
            filter,
            debounce: options.debounce,
        })
    }

    /// Blocks until a relevant filesystem batch has settled.
    ///
    /// The returned paths are normalized, de-duplicated paths reported by the
    /// backend. A backend rescan request may return an empty vector and still
    /// requires a fresh test discovery pass.
    ///
    /// # Errors
    ///
    /// Returns an error when the platform watcher reports a failure or closes
    /// unexpectedly.
    pub fn wait_for_change(&self) -> Result<Vec<PathBuf>> {
        let mut changed = BTreeSet::new();
        loop {
            let event = self
                .receiver
                .recv()
                .context("native filesystem watcher stopped unexpectedly")??;
            if self.filter.collect(&event, &mut changed) {
                break;
            }
        }

        self.settle_changes(changed)
    }

    /// Returns a settled filesystem batch when one is already pending.
    ///
    /// This non-blocking entry point lets watch coordinators multiplex native
    /// events with terminal input and active-run completion.
    ///
    /// # Errors
    ///
    /// Returns an error when the platform watcher reports a failure or closes
    /// unexpectedly.
    pub fn try_wait_for_change(&self) -> Result<Option<Vec<PathBuf>>> {
        let mut changed = BTreeSet::new();
        loop {
            match self.receiver.try_recv() {
                Ok(Ok(event)) => {
                    if self.filter.collect(&event, &mut changed) {
                        return self.settle_changes(changed).map(Some);
                    }
                }
                Ok(Err(error)) => return Err(error).context("native filesystem watch failed"),
                Err(TryRecvError::Empty) => return Ok(None),
                Err(TryRecvError::Disconnected) => {
                    bail!("native filesystem watcher stopped unexpectedly");
                }
            }
        }
    }

    fn settle_changes(&self, mut changed: BTreeSet<PathBuf>) -> Result<Vec<PathBuf>> {
        let mut deadline = Instant::now() + self.debounce;
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                break;
            }
            match self.receiver.recv_timeout(remaining) {
                Ok(Ok(event)) => {
                    if self.filter.collect(&event, &mut changed) {
                        deadline = Instant::now() + self.debounce;
                    }
                }
                Ok(Err(error)) => return Err(error).context("native filesystem watch failed"),
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => {
                    bail!("native filesystem watcher stopped unexpectedly");
                }
            }
        }
        Ok(changed.into_iter().collect())
    }
}

struct EventFilter {
    ignore_patterns: Vec<Regex>,
    ignored_paths: Vec<PathBuf>,
}

impl EventFilter {
    fn new(patterns: &[String], ignored_paths: &[PathBuf]) -> Result<Self> {
        let ignore_patterns = patterns
            .iter()
            .map(|pattern| {
                Regex::new(pattern)
                    .with_context(|| format!("invalid watchPathIgnorePatterns regex `{pattern}`"))
            })
            .collect::<Result<Vec<_>>>()?;
        let ignored_paths = ignored_paths
            .iter()
            .map(|path| absolute_lexical(path))
            .collect();
        Ok(Self {
            ignore_patterns,
            ignored_paths,
        })
    }

    fn collect(&self, event: &Event, changed: &mut BTreeSet<PathBuf>) -> bool {
        if matches!(event.kind, EventKind::Access(_)) {
            return false;
        }
        if event.need_rescan() {
            return true;
        }
        let before = changed.len();
        for path in &event.paths {
            let path = absolute_lexical(path);
            if !self.is_ignored(&path) {
                changed.insert(path);
            }
        }
        changed.len() != before
    }

    fn is_ignored(&self, path: &Path) -> bool {
        if path.components().any(|component| {
            matches!(component, Component::Normal(name) if name == "node_modules" || name == ".git")
        }) {
            return true;
        }
        if self
            .ignored_paths
            .iter()
            .any(|ignored| path == ignored || path.starts_with(ignored))
        {
            return true;
        }
        let normalized = path.to_string_lossy().replace('\\', "/");
        self.ignore_patterns
            .iter()
            .any(|pattern| pattern.is_match(&normalized))
    }
}

fn minimal_roots(roots: &[PathBuf]) -> Result<Vec<PathBuf>> {
    let mut roots = roots
        .iter()
        .map(|root| {
            root.canonicalize()
                .with_context(|| format!("cannot resolve watch root `{}`", root.display()))
        })
        .collect::<Result<Vec<_>>>()?;
    roots.sort_by(|left, right| {
        left.components()
            .count()
            .cmp(&right.components().count())
            .then_with(|| left.cmp(right))
    });
    roots.dedup();
    let mut minimal = Vec::<PathBuf>::new();
    for root in roots {
        if !minimal.iter().any(|parent| root.starts_with(parent)) {
            minimal.push(root);
        }
    }
    Ok(minimal)
}

fn absolute_lexical(path: &Path) -> PathBuf {
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
    normalized
}

#[cfg(test)]
mod tests {
    use std::{
        fs, thread,
        time::{Duration, Instant},
    };

    use tempfile::tempdir;

    use super::{EventFilter, NativeWatcher, WatchOptions, minimal_roots};

    #[test]
    fn collapses_nested_and_duplicate_roots() {
        let temp = tempdir().expect("temp dir");
        let nested = temp.path().join("packages/example");
        fs::create_dir_all(&nested).expect("nested root");

        let roots = minimal_roots(&[nested, temp.path().to_path_buf(), temp.path().to_path_buf()])
            .expect("minimal roots");

        assert_eq!(roots, [temp.path().canonicalize().expect("canonical root")]);
    }

    #[test]
    fn filters_generated_paths_jest_patterns_and_internal_directories() {
        let temp = tempdir().expect("temp dir");
        let coverage = temp.path().join("coverage");
        let filter = EventFilter::new(&["ignored\\.json$".into()], std::slice::from_ref(&coverage))
            .expect("event filter");

        assert!(filter.is_ignored(&coverage.join("summary.json")));
        assert!(filter.is_ignored(&temp.path().join("ignored.json")));
        assert!(filter.is_ignored(&temp.path().join("node_modules/pkg/index.js")));
        assert!(filter.is_ignored(&temp.path().join(".git/index")));
        assert!(!filter.is_ignored(&temp.path().join("src/value.ts")));
    }

    #[test]
    fn reports_one_debounced_batch_for_a_source_write() {
        let temp = tempdir().expect("temp dir");
        let watcher = NativeWatcher::start(&WatchOptions::new(vec![temp.path().to_path_buf()]))
            .expect("native watcher");
        let source = temp.path().join("value.js");
        thread::spawn(move || fs::write(source, "export default 42;\n").expect("source write"));

        let changed = watcher.wait_for_change().expect("filesystem batch");
        assert!(
            changed
                .iter()
                .any(|path| path.file_name().is_some_and(|name| name == "value.js"))
        );
    }

    #[test]
    fn polls_a_pending_batch_without_blocking_the_coordinator() {
        let temp = tempdir().expect("temp dir");
        let watcher = NativeWatcher::start(&WatchOptions::new(vec![temp.path().to_path_buf()]))
            .expect("native watcher");
        assert!(watcher.try_wait_for_change().expect("empty poll").is_none());
        fs::write(temp.path().join("value.js"), "export default 42;\n").expect("source write");
        let deadline = Instant::now() + Duration::from_secs(5);
        let changed = loop {
            if let Some(changed) = watcher.try_wait_for_change().expect("filesystem poll") {
                break changed;
            }
            assert!(
                Instant::now() < deadline,
                "watcher did not report the write"
            );
            thread::sleep(Duration::from_millis(10));
        };

        assert!(
            changed
                .iter()
                .any(|path| path.file_name().is_some_and(|name| name == "value.js"))
        );
    }
}
