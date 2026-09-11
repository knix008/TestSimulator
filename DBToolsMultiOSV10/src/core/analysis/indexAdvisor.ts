// Port of Analysis/IndexAdvisor.cs
import type { DbSchema } from '../../types';
import { t } from '../../i18n';

export type IndexSuggestionKind = 'AlreadyIndexed' | 'Required' | 'Recommended' | 'Consider';

export interface IndexSuggestion {
  Table: string;
  Column: string;
  Kind: IndexSuggestionKind;
  Reason: string;
  Recommendation: string;
}

const LOOKUP_SUFFIXES = ['_id', '_code', '_no'];
const CANDIDATE_SUFFIXES = ['_name', '_date', '_status', '_type'];

function hasAnySuffix(name: string, suffixes: string[]): boolean {
  return suffixes.some((s) => name.endsWith(s));
}

export function analyzeIndexes(schema: DbSchema): IndexSuggestion[] {
  const suggestions: IndexSuggestion[] = [];
  // Target is the child side — the column that actually holds the foreign key.
  const fkColumnIds = new Set(schema.Relationships.map((r) => r.TargetColumnId));

  for (const table of schema.Tables) {
    for (const col of table.Columns) {
      const lower = col.Name.toLowerCase();
      const tableLower = table.Name.toLowerCase();

      if (col.IsPrimaryKey) {
        suggestions.push({
          Table: table.Name,
          Column: col.Name,
          Kind: 'AlreadyIndexed',
          Reason: t('IdxReasonPk'),
          Recommendation: t('IdxRecommendNone'),
        });
        continue;
      }

      if (col.IsUnique) {
        suggestions.push({
          Table: table.Name,
          Column: col.Name,
          Kind: 'AlreadyIndexed',
          Reason: t('IdxReasonUnique'),
          Recommendation: t('IdxRecommendNone'),
        });
        continue;
      }

      const isFkByRel = fkColumnIds.has(col.Id);
      if (col.IsForeignKey || isFkByRel) {
        const source = isFkByRel ? t('IdxFkSourceRel') : t('IdxFkSourceFlag');
        suggestions.push({
          Table: table.Name,
          Column: col.Name,
          Kind: 'Required',
          Reason: t('IdxReasonFk').replace('{0}', source),
          Recommendation: `CREATE INDEX idx_${tableLower}_${lower} ON ${table.Name} (${col.Name});`,
        });
        continue;
      }

      if (hasAnySuffix(lower, LOOKUP_SUFFIXES)) {
        suggestions.push({
          Table: table.Name,
          Column: col.Name,
          Kind: 'Recommended',
          Reason: t('IdxReasonLookup'),
          Recommendation: `CREATE INDEX idx_${tableLower}_${lower} ON ${table.Name} (${col.Name});`,
        });
        continue;
      }

      if (hasAnySuffix(lower, CANDIDATE_SUFFIXES)) {
        suggestions.push({
          Table: table.Name,
          Column: col.Name,
          Kind: 'Consider',
          Reason: t('IdxReasonCandidate'),
          Recommendation: t('IdxRecommendConsider'),
        });
      }
    }
  }

  return suggestions;
}
