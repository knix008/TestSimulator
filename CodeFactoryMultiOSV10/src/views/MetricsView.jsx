// Code metrics: files, functions, types, packages and architecture insights.
// Threshold breaches are colored in place, so the grid itself is the report.

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid, SeverityBadge } from '../components/common.jsx';
import { warningLevel } from '../core/settings.js';
import { baseName } from '../core/languages.js';

const TABS = [
  { id: 'files', labelKey: 'metrics.tabFiles', inspection: 'showFilesTab' },
  { id: 'functions', labelKey: 'metrics.tabFunctions', inspection: 'showFunctionsTab' },
  { id: 'types', labelKey: 'metrics.tabTypes', inspection: 'showTypesTab' },
  { id: 'packages', labelKey: 'metrics.tabPackages', inspection: 'showPackagesTab' },
  { id: 'architecture', labelKey: 'metrics.tabArchitecture', inspection: 'showArchitectureTab' },
];

export default function MetricsView({ result, onOpenSource, search }) {
  const { t } = useTranslation();
  const settings = result.settings;
  const enabled = useMemo(() => new Set(settings.enabledInspections), [settings]);
  const tabs = TABS.filter((tab) => enabled.has(tab.inspection));
  const [tab, setTab] = useState(tabs.length > 0 ? tabs[0].id : 'files');

  const needle = (search || '').toLowerCase();
  const matches = (text) => !needle || String(text || '').toLowerCase().includes(needle);

  const sev = (id, pick) => (row) => warningLevel(id, pick(row), settings);

  const functionColumns = [
    { key: 'displayName', label: t('columns.name'), render: (r) => r.displayName, width: 200 },
    { key: 'filePath', label: t('columns.file'), render: (r) => baseName(r.filePath), sortValue: (r) => baseName(r.filePath), width: 180 },
    { key: 'startLine', label: t('columns.line'), numeric: true },
    { key: 'lineCount', label: t('columns.lines'), numeric: true },
    { key: 'cyclomaticComplexity', label: t('columns.cyclomatic'), numeric: true, severity: sev('cyclomaticComplexity', (r) => r.cyclomaticComplexity) },
    { key: 'cognitiveComplexity', label: t('columns.cognitive'), numeric: true, severity: sev('cognitiveComplexity', (r) => r.cognitiveComplexity) },
    { key: 'maxNestingDepth', label: t('columns.nesting'), numeric: true, severity: sev('nestingDepth', (r) => r.maxNestingDepth) },
    { key: 'parameterCount', label: t('columns.parameters'), numeric: true, severity: sev('parameterCount', (r) => r.parameterCount) },
    { key: 'returnCount', label: t('columns.returns'), numeric: true, severity: sev('returnCount', (r) => r.returnCount) },
    { key: 'magicNumberCount', label: t('columns.magic'), numeric: true, severity: sev('magicNumbers', (r) => r.magicNumberCount) },
    { key: 'fanIn', label: t('columns.fanIn'), numeric: true },
    { key: 'fanOut', label: t('columns.fanOut'), numeric: true, severity: sev('fanOut', (r) => r.fanOut) },
    { key: 'maintenanceIndex', label: t('columns.mi'), numeric: true, severity: sev('maintenanceIndex', (r) => r.maintenanceIndex) },
    { key: 'statementCount', label: t('columns.statements'), numeric: true, severity: sev('statementCount', (r) => r.statementCount) },
    { key: 'switchCaseCount', label: t('columns.switchCases'), numeric: true, severity: sev('switchCaseCount', (r) => r.switchCaseCount) },
    { key: 'halsteadVolume', label: t('columns.halstead'), numeric: true },
    { key: 'precision', label: t('columns.precision'), render: (r) => <SeverityBadge severity="none">{r.precision}</SeverityBadge> },
  ];

  const fileColumns = [
    { key: 'fileName', label: t('columns.file'), render: (r) => r.fileName, width: 220 },
    { key: 'directory', label: t('columns.directory'), render: (r) => r.directory, width: 260 },
    { key: 'languageId', label: t('columns.language') },
    { key: 'codeLines', label: t('columns.codeLines'), numeric: true, severity: sev('godFile', (r) => r.codeLines) },
    { key: 'commentLines', label: t('columns.commentLines'), numeric: true },
    { key: 'blankLines', label: t('columns.blankLines'), numeric: true },
    { key: 'commentPercentPer100Code', label: t('columns.commentPercent'), numeric: true, severity: sev('lowCommentRatio', (r) => r.commentPercentPer100Code) },
    { key: 'functionCount', label: t('columns.functions'), numeric: true },
    { key: 'publicApiCount', label: t('columns.publicApi'), numeric: true, severity: sev('publicApiDensity', (r) => r.publicApiCount) },
    { key: 'maxCyclomaticComplexity', label: t('columns.cyclomatic'), numeric: true, severity: sev('cyclomaticComplexity', (r) => r.maxCyclomaticComplexity) },
    { key: 'minMaintenanceIndex', label: t('columns.mi'), numeric: true, severity: sev('maintenanceIndex', (r) => r.minMaintenanceIndex) },
    { key: 'todoMarkerCount', label: t('columns.todo'), numeric: true },
    { key: 'todoDensityPer100Lines', label: t('columns.todoDensity'), numeric: true, severity: sev('todoDensity', (r) => r.todoDensityPer100Lines) },
    { key: 'duplicateLineCount', label: t('columns.duplicateLines'), numeric: true },
    { key: 'securitySmellCount', label: t('columns.security'), numeric: true, severity: sev('securitySmells', (r) => r.securitySmellCount), cellTitle: (r) => r.securitySmellSummary },
    { key: 'gitChangeLineCount', label: t('columns.gitChange'), numeric: true, severity: sev('gitHotspot', (r) => r.gitChangeLineCount) },
  ];

  const typeColumns = [
    { key: 'displayName', label: t('columns.name'), width: 200 },
    { key: 'kind', label: t('columns.kind') },
    { key: 'filePath', label: t('columns.file'), render: (r) => baseName(r.filePath), sortValue: (r) => baseName(r.filePath), width: 190 },
    { key: 'lineNumber', label: t('columns.line'), numeric: true },
    { key: 'memberCount', label: t('columns.members'), numeric: true, severity: (r) => r.warnings.godType },
    { key: 'attributeCount', label: t('columns.attributes'), numeric: true },
    { key: 'operationCount', label: t('columns.operations'), numeric: true },
    { key: 'lackOfCohesion', label: t('columns.lcom'), numeric: true, severity: (r) => r.warnings.typeCohesion },
    { key: 'depthOfInheritance', label: t('columns.dit'), numeric: true, severity: (r) => r.warnings.inheritanceDepth },
    { key: 'numberOfChildren', label: t('columns.noc'), numeric: true },
    { key: 'weightedMethodCount', label: t('columns.wmc'), numeric: true },
    { key: 'responseForClass', label: t('columns.rfc'), numeric: true },
    { key: 'maxCyclomaticComplexity', label: t('columns.cyclomatic'), numeric: true, severity: sev('cyclomaticComplexity', (r) => r.maxCyclomaticComplexity) },
    { key: 'minMaintenanceIndex', label: t('columns.mi'), numeric: true, severity: sev('maintenanceIndex', (r) => r.minMaintenanceIndex) },
  ];

  const packageColumns = [
    { key: 'displayName', label: t('columns.name'), width: 200 },
    { key: 'directoryPath', label: t('columns.directory'), width: 320 },
    { key: 'fileCount', label: t('columns.file'), numeric: true },
    { key: 'typeCount', label: t('columns.type'), numeric: true },
    { key: 'afferentCoupling', label: t('columns.afferent'), numeric: true },
    { key: 'efferentCoupling', label: t('columns.efferent'), numeric: true },
    { key: 'instability', label: t('columns.instability'), numeric: true, severity: sev('packageInstability', (r) => r.instability) },
    { key: 'abstractness', label: t('columns.abstractness'), numeric: true },
    { key: 'distanceFromMainSequence', label: t('columns.distance'), numeric: true },
  ];

  const body = () => {
    switch (tab) {
      case 'functions':
        return (
          <DataGrid
            columns={functionColumns}
            rows={result.functions.filter((fn) => matches(fn.displayName) || matches(fn.filePath))}
            getKey={(fn) => fn.id}
            initialSort={{ key: 'cyclomaticComplexity', direction: 'desc' }}
            onRowDoubleClick={(fn) => onOpenSource({ filePath: fn.filePath, lineNumber: fn.startLine })}
          />
        );
      case 'types':
        return (
          <DataGrid
            columns={typeColumns}
            rows={result.typeMetrics.filter((type) => matches(type.displayName) || matches(type.filePath))}
            getKey={(type) => type.id}
            initialSort={{ key: 'memberCount', direction: 'desc' }}
            onRowDoubleClick={(type) => onOpenSource({ filePath: type.filePath, lineNumber: type.lineNumber })}
          />
        );
      case 'packages':
        return (
          <DataGrid
            columns={packageColumns}
            rows={result.packages.filter((pkg) => matches(pkg.directoryPath))}
            getKey={(pkg) => pkg.directoryPath}
            initialSort={{ key: 'efferentCoupling', direction: 'desc' }}
          />
        );
      case 'architecture':
        return <ArchitectureTab result={result} onOpenSource={onOpenSource} search={needle} />;
      default:
        return (
          <DataGrid
            columns={fileColumns}
            rows={result.files.filter((file) => matches(file.fileName) || matches(file.directory))}
            getKey={(file) => file.filePath}
            initialSort={{ key: 'codeLines', direction: 'desc' }}
            onRowDoubleClick={(file) => onOpenSource({ filePath: file.filePath, lineNumber: 1 })}
          />
        );
    }
  };

  return (
    <div className="split">
      <div className="tabs">
        {tabs.map((entry) => (
          <button key={entry.id} type="button" className={'tab' + (tab === entry.id ? ' active' : '')} onClick={() => setTab(entry.id)}>
            {t(entry.labelKey)}
          </button>
        ))}
      </div>
      <div className="top">{body()}</div>
    </div>
  );
}

function ArchitectureTab({ result, onOpenSource, search }) {
  const { t } = useTranslation();
  const { i18n } = useTranslation();
  const isEn = i18n.language === 'en';

  const insights = result.insights.filter(
    (insight) => !search || insight.title.toLowerCase().includes(search) || insight.items.some((item) => String(item.label).toLowerCase().includes(search)),
  );

  if (insights.length === 0) return <div className="empty-state">{t('summary.noFindings')}</div>;

  return (
    <div style={{ padding: 14 }}>
      {insights.map((insight) => (
        <div className="panel" key={insight.id}>
          <h3>
            <SeverityBadge severity={insight.severity} />{' '}
            {isEn ? insight.titleEn : insight.title}
            <span className="sub">{insight.count.toLocaleString('en-US')}</span>
          </h3>
          <p style={{ margin: '0 0 8px', color: 'var(--text-dim)' }}>{insight.summary}</p>
          <div className="callout">{insight.advice}</div>
          <DataGrid
            columns={[
              { key: 'label', label: t('columns.name'), wide: true },
              { key: 'detail', label: t('columns.message'), wide: true },
            ]}
            rows={insight.items}
            getKey={(item, index) => item.label + ':' + (item.detail || '') + index}
            maxRows={200}
            onRowDoubleClick={(item) => item.filePath && onOpenSource({ filePath: item.filePath, lineNumber: item.line || 1 })}
          />
        </div>
      ))}
    </div>
  );
}
