use crate::model::FileEntry;
use crate::query::ResolvedQuery;
use crate::score::{score_query, ScoredEntry};
use crate::sort::{sort_scored, SearchResultSortOrder};

pub const MAX_SEARCH_RESULTS: usize = 2_000;

pub fn search_memory(
    entries: &[FileEntry],
    query: &ResolvedQuery,
    case_sensitive: bool,
    sort: SearchResultSortOrder,
    limit: usize,
) -> Vec<FileEntry> {
    if query.is_empty() {
        return Vec::new();
    }
    let mut matches: Vec<ScoredEntry> = Vec::new();
    for entry in entries {
        let score = score_query(entry, query, case_sensitive);
        if score <= 0 {
            continue;
        }
        insert_top(
            &mut matches,
            ScoredEntry {
                entry: entry.clone(),
                score,
            },
            limit,
        );
    }
    let mut ordered = sort_scored(matches, sort, case_sensitive);
    if ordered.len() > limit {
        ordered.truncate(limit);
    }
    ordered
}

pub(crate) fn insert_top(matches: &mut Vec<ScoredEntry>, candidate: ScoredEntry, limit: usize) {
    if let Some(existing) = matches.iter_mut().find(|item| {
        item.entry
            .full_path
            .eq_ignore_ascii_case(&candidate.entry.full_path)
    }) {
        if candidate.score > existing.score {
            *existing = candidate;
        }
        return;
    }
    if matches.len() < limit {
        matches.push(candidate);
        return;
    }
    let weakest = matches
        .iter()
        .enumerate()
        .min_by_key(|(_, item)| item.score)
        .map(|(index, _)| index);
    if let Some(index) = weakest {
        if candidate.score > matches[index].score {
            matches[index] = candidate;
        }
    }
}
