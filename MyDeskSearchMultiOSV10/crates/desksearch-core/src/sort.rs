use std::cmp::Ordering;

use serde::{Deserialize, Serialize};

use crate::model::FileEntry;
use crate::score::ScoredEntry;
use crate::text::fold_case;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum SearchResultSortOrder {
    #[default]
    MatchQuality = 0,
    NameAsc = 1,
    NameDesc = 2,
    PathAsc = 3,
    PathDesc = 4,
    FoldersFirst = 5,
    FilesFirst = 6,
    ModifiedDesc = 7,
}

impl SearchResultSortOrder {
    pub fn normalize(self) -> Self {
        self
    }

    pub fn label_key(self) -> &'static str {
        match self {
            Self::MatchQuality => "Settings_SearchResultSort_MatchQuality",
            Self::NameAsc => "Settings_SearchResultSort_NameAsc",
            Self::NameDesc => "Settings_SearchResultSort_NameDesc",
            Self::PathAsc => "Settings_SearchResultSort_PathAsc",
            Self::PathDesc => "Settings_SearchResultSort_PathDesc",
            Self::FoldersFirst => "Settings_SearchResultSort_FoldersFirst",
            Self::FilesFirst => "Settings_SearchResultSort_FilesFirst",
            Self::ModifiedDesc => "Settings_SearchResultSort_ModifiedDesc",
        }
    }

    pub const ALL: [Self; 8] = [
        Self::MatchQuality,
        Self::NameAsc,
        Self::NameDesc,
        Self::PathAsc,
        Self::PathDesc,
        Self::FoldersFirst,
        Self::FilesFirst,
        Self::ModifiedDesc,
    ];
}

impl Serialize for SearchResultSortOrder {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_u8(*self as u8)
    }
}

impl<'de> Deserialize<'de> for SearchResultSortOrder {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct Visit;
        impl<'de> serde::de::Visitor<'de> for Visit {
            type Value = SearchResultSortOrder;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a sort order number or name")
            }

            fn visit_u64<E: serde::de::Error>(self, value: u64) -> Result<Self::Value, E> {
                Ok(from_number(value))
            }

            fn visit_i64<E: serde::de::Error>(self, value: i64) -> Result<Self::Value, E> {
                Ok(from_number(value.max(0) as u64))
            }

            fn visit_str<E: serde::de::Error>(self, value: &str) -> Result<Self::Value, E> {
                Ok(match value {
                    "MatchQuality" => SearchResultSortOrder::MatchQuality,
                    "NameAsc" => SearchResultSortOrder::NameAsc,
                    "NameDesc" => SearchResultSortOrder::NameDesc,
                    "PathAsc" => SearchResultSortOrder::PathAsc,
                    "PathDesc" => SearchResultSortOrder::PathDesc,
                    "FoldersFirst" => SearchResultSortOrder::FoldersFirst,
                    "FilesFirst" => SearchResultSortOrder::FilesFirst,
                    "ModifiedDesc" => SearchResultSortOrder::ModifiedDesc,
                    _ => SearchResultSortOrder::MatchQuality,
                })
            }
        }
        deserializer.deserialize_any(Visit)
    }
}

use serde::{Deserializer, Serializer};

fn from_number(value: u64) -> SearchResultSortOrder {
    match value {
        0 => SearchResultSortOrder::MatchQuality,
        1 => SearchResultSortOrder::NameAsc,
        2 => SearchResultSortOrder::NameDesc,
        3 => SearchResultSortOrder::PathAsc,
        4 => SearchResultSortOrder::PathDesc,
        5 => SearchResultSortOrder::FoldersFirst,
        6 => SearchResultSortOrder::FilesFirst,
        7 => SearchResultSortOrder::ModifiedDesc,
        _ => SearchResultSortOrder::MatchQuality,
    }
}

pub fn sort_scored(
    mut items: Vec<ScoredEntry>,
    sort: SearchResultSortOrder,
    case_sensitive: bool,
) -> Vec<FileEntry> {
    items.sort_by(|left, right| compare_scored(left, right, sort, case_sensitive));
    items.into_iter().map(|item| item.entry).collect()
}

fn compare_scored(
    left: &ScoredEntry,
    right: &ScoredEntry,
    sort: SearchResultSortOrder,
    case_sensitive: bool,
) -> Ordering {
    let name = |entry: &FileEntry| fold_case(&entry.file_name, case_sensitive);
    let path = |entry: &FileEntry| fold_case(&entry.full_path, case_sensitive);
    match sort {
        SearchResultSortOrder::NameAsc => name(&left.entry)
            .cmp(&name(&right.entry))
            .then_with(|| path(&left.entry).cmp(&path(&right.entry))),
        SearchResultSortOrder::NameDesc => name(&right.entry)
            .cmp(&name(&left.entry))
            .then_with(|| path(&right.entry).cmp(&path(&left.entry))),
        SearchResultSortOrder::PathAsc => path(&left.entry)
            .cmp(&path(&right.entry))
            .then_with(|| name(&left.entry).cmp(&name(&right.entry))),
        SearchResultSortOrder::PathDesc => path(&right.entry)
            .cmp(&path(&left.entry))
            .then_with(|| name(&right.entry).cmp(&name(&left.entry))),
        SearchResultSortOrder::FoldersFirst => right
            .entry
            .is_directory
            .cmp(&left.entry.is_directory)
            .then_with(|| name(&left.entry).cmp(&name(&right.entry)))
            .then_with(|| path(&left.entry).cmp(&path(&right.entry))),
        SearchResultSortOrder::FilesFirst => left
            .entry
            .is_directory
            .cmp(&right.entry.is_directory)
            .then_with(|| name(&left.entry).cmp(&name(&right.entry)))
            .then_with(|| path(&left.entry).cmp(&path(&right.entry))),
        SearchResultSortOrder::ModifiedDesc => right
            .entry
            .modified_utc
            .cmp(&left.entry.modified_utc)
            .then_with(|| name(&left.entry).cmp(&name(&right.entry)))
            .then_with(|| path(&left.entry).cmp(&path(&right.entry))),
        SearchResultSortOrder::MatchQuality => right
            .score
            .cmp(&left.score)
            .then_with(|| name(&left.entry).cmp(&name(&right.entry)))
            .then_with(|| path(&left.entry).cmp(&path(&right.entry))),
    }
}

pub fn sql_order_by(sort: SearchResultSortOrder, case_sensitive: bool, score_expr: &str) -> String {
    let name = if case_sensitive {
        "e.search_file_name".to_string()
    } else {
        "lower(e.search_file_name)".to_string()
    };
    let path = if case_sensitive {
        "e.full_path".to_string()
    } else {
        "lower(e.full_path)".to_string()
    };
    match sort {
        SearchResultSortOrder::NameAsc => format!("{name}, {path}"),
        SearchResultSortOrder::NameDesc => format!("{name} DESC, {path} DESC"),
        SearchResultSortOrder::PathAsc => format!("{path}, {name}"),
        SearchResultSortOrder::PathDesc => format!("{path} DESC, {name} DESC"),
        SearchResultSortOrder::FoldersFirst => format!("e.is_directory DESC, {name}, {path}"),
        SearchResultSortOrder::FilesFirst => format!("e.is_directory ASC, {name}, {path}"),
        SearchResultSortOrder::ModifiedDesc => format!("e.modified_utc DESC, {name}"),
        SearchResultSortOrder::MatchQuality => format!("{score_expr} DESC, {name}"),
    }
}
