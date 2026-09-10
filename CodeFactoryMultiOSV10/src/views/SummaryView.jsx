// The dashboard: what the analysis found, ordered by what to do about it.
// Every card links onward to the view that shows the detail.

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StatCard, BarList, SeverityBadge } from '../components/common.jsx';
import { INSPECTIONS } from '../core/settings.js';

export default function SummaryView({ result, onNavigate, onOpenSource }) {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === 'en';
  const summary = result.summary;
  const health = result.health;

  const tone = health.score >= 80 ? 'ok' : health.score >= 60 ? 'warning' : 'critical';

  const languageBars = useMemo(
    () => result.languages.map((entry) => ({ label: entry.displayName, value: entry.codeLines })),
    [result.languages],
  );

  const healthBars = useMemo(
    () =>
      health.dimensions.map((dimension) => ({
        label: isEn ? dimension.labelEn : dimension.label,
        value: dimension.percent,
        tone: dimension.percent >= 80 ? 'ok' : dimension.percent >= 60 ? 'warning' : 'critical',
      })),
    [health, isEn],
  );

  // Only inspections that actually fired are worth a row.
  const findingRows = useMemo(() => {
    const map = {
      cyclomaticComplexity: summary.highCyclomaticCount,
      cognitiveComplexity: summary.highCognitiveCount,
      nestingDepth: summary.deepNestingCount,
      parameterCount: summary.highParameterCount,
      returnCount: summary.highReturnCount,
      magicNumbers: summary.highMagicNumberCount,
      fanOut: summary.highFanOutCount,
      maintenanceIndex: summary.lowMaintenanceIndexCount,
      statementCount: summary.highStatementCount,
      switchCaseCount: summary.highSwitchCaseCount,
      catchQuality: summary.emptyCatchFunctionCount + summary.broadCatchFunctionCount,
      asyncVoid: summary.asyncVoidCount,
      possiblyUnusedCode: summary.possiblyUnusedCount,
      godFile: summary.godFileCount,
      lowCommentRatio: summary.lowCommentFileCount,
      todoDensity: summary.highTodoDensityFileCount,
      publicApiDensity: summary.highPublicApiFileCount,
      securitySmells: summary.securitySmellFileCount,
      gitHotspot: summary.gitHotspotFileCount,
      godType: summary.godTypeCount,
      typeCohesion: summary.lowCohesionTypeCount,
      inheritanceDepth: summary.deepInheritanceTypeCount,
      packageInstability: summary.highInstabilityPackageCount,
      circularCalls: summary.circularCallChainCount,
      layerViolation: summary.layerViolationCount,
      duplicateCodeGroups: summary.duplicateGroupCount,
    };

    return Object.entries(map)
      .filter(([, count]) => count > 0)
      .map(([id, count]) => {
        const inspection = INSPECTIONS.find((entry) => entry.id === id);
        return {
          id,
          label: inspection ? (isEn ? inspection.labelEn : inspection.label) : id,
          count,
          threshold: inspection && inspection.threshold ? result.settings[inspection.threshold.key] : null,
          tip: inspection ? inspection.tip : '',
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [summary, result.settings, isEn]);

  return (
    <div>
      <div className="panel">
        <div className="score-ring">
          <div className={'grade ' + tone}>{health.grade}</div>
          <div className="detail">
            <h3 style={{ margin: '0 0 2px' }}>
              {t('summary.health')}: {health.score} / 100
            </h3>
            <div style={{ color: 'var(--text-dim)', marginBottom: 10, fontSize: 12.5 }}>
              {t('summary.generatedAt')} {new Date(result.generatedAt).toLocaleString()} · {t('summary.duration')}{' '}
              {(result.durationMs / 1000).toFixed(1)}s
            </div>
            <BarList items={healthBars} max={100} formatValue={(v) => v + '%'} />
          </div>
        </div>
      </div>

      <div className="cards" style={{ marginBottom: 14 }}>
        <StatCard label={t('summary.files')} value={summary.totalFiles} sub={summary.totalCodeLines.toLocaleString('en-US') + ' ' + t('summary.codeLines')} />
        <StatCard label={t('summary.functions')} value={summary.totalFunctions} sub={result.stats.edgeCount.toLocaleString('en-US') + ' call edges'} />
        <StatCard label={t('summary.types')} value={summary.totalTypes} sub={result.packages.length + ' packages'} />
        <StatCard
          label={t('views.duplicates')}
          value={summary.projectDuplicateLinePercent + '%'}
          sub={summary.duplicateGroupCount + ' groups · ' + summary.duplicateLineCount.toLocaleString('en-US') + ' lines'}
          tone={summary.projectDuplicateLinePercent > 10 ? 'critical' : summary.projectDuplicateLinePercent > 5 ? 'warning' : null}
        />
        <StatCard
          label={t('views.bugRisk')}
          value={result.bugRisk.total}
          sub={result.bugRisk.criticalCount + ' critical · ' + result.bugRisk.warningCount + ' warning'}
          tone={result.bugRisk.criticalCount > 0 ? 'critical' : null}
        />
        <StatCard
          label={t('views.security')}
          value={result.security.total}
          sub={result.security.criticalCount + ' critical · ' + result.security.affectedFileCount + ' files'}
          tone={result.security.criticalCount > 0 ? 'critical' : result.security.total > 0 ? 'warning' : null}
        />
        <StatCard label={t('views.erd')} value={result.schema.tables.length} sub={result.schema.relations.length + ' relations · ' + result.schema.accesses.length + ' accesses'} />
        <StatCard label={t('views.globals')} value={result.globals.length} sub={result.globalAccesses.length + ' accesses'} />
      </div>

      {result.priorityActions.length > 0 ? (
        <div className="panel">
          <h3>{t('summary.priorityActions')}</h3>
          {result.priorityActions.map((action) => (
            <div className="action-item" key={action.priority}>
              <h4>
                {action.priority}. {isEn ? action.titleEn : action.title}
              </h4>
              <p>{action.detail}</p>
              <ul>
                {action.items.slice(0, 5).map((item, index) => (
                  <li
                    key={index}
                    style={item.filePath ? { cursor: 'pointer' } : undefined}
                    onClick={() => item.filePath && onOpenSource({ filePath: item.filePath, lineNumber: item.line || 1 })}
                  >
                    {item.label}
                    {item.detail ? ' — ' + item.detail : ''}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14 }}>
        <div className="panel">
          <h3>{t('summary.languages')}</h3>
          <BarList items={languageBars} />
        </div>

        <div className="panel">
          <h3>
            {t('summary.inspections')}
            <span className="sub">{findingRows.length}</span>
          </h3>
          {findingRows.length === 0 ? (
            <div style={{ color: 'var(--text-dim)' }}>{t('summary.noFindings')}</div>
          ) : (
            <BarList
              items={findingRows.map((row) => ({
                label: row.label + (row.threshold !== null ? ' (≥' + row.threshold + ')' : ''),
                value: row.count,
                tone: row.count > 50 ? 'critical' : row.count > 10 ? 'warning' : undefined,
              }))}
            />
          )}
        </div>
      </div>

      {result.insights.length > 0 ? (
        <div className="panel" style={{ marginTop: 14 }}>
          <h3>{t('metrics.tabArchitecture')}</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {result.insights.slice(0, 8).map((insight) => (
              <div
                key={insight.id}
                style={{ display: 'flex', gap: 10, alignItems: 'baseline', cursor: 'pointer' }}
                onClick={() => onNavigate('metrics')}
              >
                <SeverityBadge severity={insight.severity} />
                <strong style={{ minWidth: 150 }}>{isEn ? insight.titleEn : insight.title}</strong>
                <span style={{ color: 'var(--text-dim)', fontSize: 12.5 }}>{insight.summary}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {result.skipped.length > 0 ? (
        <div className="panel" style={{ marginTop: 14 }}>
          <h3>
            {isEn ? 'Skipped files' : '건너뛴 파일'}
            <span className="sub">{result.stats.skippedCount}</span>
          </h3>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
            {result.skipped.slice(0, 20).map((entry) => (
              <div key={entry.path}>
                {entry.path} — {entry.reason}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
