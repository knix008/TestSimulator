// Port of the MainForm normalization panel and index advisor tab.
import { useMemo } from 'react';
import type { DbSchema } from '../types';
import {
  ALL_LEVELS,
  formatLevelsLabel,
  getLevelLabel,
  type NormalizationIssue,
  type NormalizationLevel,
} from '../core/analysis/normalization';
import type { IndexSuggestion, IndexSuggestionKind } from '../core/analysis/indexAdvisor';
import { useT } from '../i18n';

interface AnalysisProps {
  schema: DbSchema;
  issues: NormalizationIssue[];
  levels: NormalizationLevel[];
  onToggleLevel: (level: NormalizationLevel) => void;
  onSelectIssue: (issue: NormalizationIssue) => void;
}

export function AnalysisPanel({ schema, issues, levels, onToggleLevel, onSelectIssue }: AnalysisProps) {
  const t = useT();

  const counts = useMemo(() => {
    return {
      error: issues.filter((i) => i.Severity === 'Error').length,
      warning: issues.filter((i) => i.Severity === 'Warning').length,
      info: issues.filter((i) => i.Severity === 'Info').length,
    };
  }, [issues]);

  const grouped = useMemo(() => {
    const map = new Map<NormalizationLevel, NormalizationIssue[]>();
    for (const level of ALL_LEVELS) {
      const forLevel = issues.filter((i) => i.Level === level);
      if (forLevel.length > 0) map.set(level, forLevel);
    }
    return map;
  }, [issues]);

  const levelsLabel = formatLevelsLabel(levels);

  let summary: string;
  let summaryClass: string;
  if (schema.Tables.length === 0) {
    summary = t('NoTablesAnalysis');
    summaryClass = 'muted';
  } else if (issues.length === 0) {
    summary = t('AnalysisNoIssues', levelsLabel);
    summaryClass = 'ok';
  } else {
    summary = t('AnalysisSummary', levelsLabel);
    summaryClass = counts.error > 0 ? 'error' : counts.warning > 0 ? 'warning' : 'info';
  }

  return (
    <div className="analysis-panel">
      <div className="analysis-levels">
        <span className="form-label">{t('AnalysisLevel')}</span>
        {ALL_LEVELS.map((level) => (
          <button
            key={level}
            className={`chip ${levels.includes(level) ? 'active' : ''}`}
            onClick={() => onToggleLevel(level)}
          >
            {getLevelLabel(level)}
          </button>
        ))}
      </div>

      <div className={`analysis-summary ${summaryClass}`}>{summary}</div>

      {issues.length > 0 && (
        <div className="analysis-counts">
          <span className="count error">{t('AnalysisErrCount', counts.error)}</span>
          <span className="count warning">{t('AnalysisWarnCount', counts.warning)}</span>
          <span className="count info">{t('AnalysisInfoCount', counts.info)}</span>
        </div>
      )}

      <div className="analysis-list">
        {[...grouped.entries()].map(([level, levelIssues]) => (
          <div key={level} className="analysis-group">
            <div className="analysis-group-title">{t(`${level}Group`)}</div>
            {levelIssues.map((issue, index) => (
              <div
                key={`${level}-${index}`}
                className={`analysis-item sev-${issue.Severity}`}
                onClick={() => onSelectIssue(issue)}
                title={issue.Hint}
              >
                <div className="analysis-item-head">
                  <span className="analysis-table">{issue.Table}</span>
                  <span className="analysis-columns">{issue.AffectedColumns}</span>
                </div>
                <div className="analysis-message">{issue.Message}</div>
                <div className="analysis-hint">{issue.Hint}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface IndexProps {
  schema: DbSchema;
  suggestions: IndexSuggestion[];
  onSelectSuggestion: (suggestion: IndexSuggestion) => void;
}

const KIND_ORDER: IndexSuggestionKind[] = ['Required', 'Recommended', 'Consider', 'AlreadyIndexed'];

export function IndexAdvisorPanel({ schema, suggestions, onSelectSuggestion }: IndexProps) {
  const t = useT();

  const kindLabel = (kind: IndexSuggestionKind) => {
    switch (kind) {
      case 'AlreadyIndexed':
        return t('IdxAlreadyIndexed');
      case 'Required':
        return t('IdxRequired');
      case 'Recommended':
        return t('IdxRecommended');
      default:
        return t('IdxConsider');
    }
  };

  const actionable = suggestions.filter((s) => s.Kind !== 'AlreadyIndexed');
  const summary =
    schema.Tables.length === 0
      ? t('IdxSummaryNoTables')
      : actionable.length === 0
        ? t('IdxSummaryEmpty')
        : t('IdxSummary', actionable.length);

  const sorted = useMemo(
    () =>
      [...suggestions].sort(
        (a, b) => KIND_ORDER.indexOf(a.Kind) - KIND_ORDER.indexOf(b.Kind),
      ),
    [suggestions],
  );

  return (
    <div className="analysis-panel">
      <div className="analysis-summary info">{summary}</div>
      <div className="analysis-list">
        {sorted.map((suggestion, index) => (
          <div
            key={`${suggestion.Table}.${suggestion.Column}.${index}`}
            className={`analysis-item idx-${suggestion.Kind}`}
            onClick={() => onSelectSuggestion(suggestion)}
            title={suggestion.Reason}
          >
            <div className="analysis-item-head">
              <span className="analysis-table">
                {suggestion.Table}.{suggestion.Column}
              </span>
              <span className={`chip small kind-${suggestion.Kind}`}>
                {kindLabel(suggestion.Kind)}
              </span>
            </div>
            <div className="analysis-message">{suggestion.Reason}</div>
            <div className="analysis-hint mono">{suggestion.Recommendation}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
