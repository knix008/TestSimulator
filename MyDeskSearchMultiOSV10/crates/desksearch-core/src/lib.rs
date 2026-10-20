//! Cross-platform search index for MyDeskSearch.
//!
//! The library owns search grammar, the SQLite index, settings migration,
//! localization, and the platform hooks the desktop shell calls. The GUI crate
//! is a separate binary so these behaviors can be tested without a window.

pub mod color;
pub mod debounce;
pub mod error;
pub mod inclusion;
pub mod index;
pub mod instance;
pub mod locale;
pub mod memory;
pub mod model;
pub mod paths;
pub mod platform;
pub mod query;
pub mod scan;
pub mod score;
pub mod settings;
pub mod sort;
pub mod store;
pub mod text;
pub mod volume;
pub mod watch;

pub use error::DeskError;
pub use index::{
    active_search_db, discard_building, prepare_startup, promote_building, reset_databases,
    run_index_job, search, should_retry_incomplete, IndexJob, SearchOptions, StartupPlan,
};
pub use memory::{search_memory, MAX_SEARCH_RESULTS};
pub use model::{AppSettings, FileEntry, IndexOutcome, IndexPhase, IndexProgress, ResetScope};
pub use query::parse_query;
pub use sort::SearchResultSortOrder;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
