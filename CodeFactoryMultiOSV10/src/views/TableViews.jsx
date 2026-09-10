// The list-shaped views: duplicate code, global variables, DB table access,
// bug risk and security. Each pairs a master grid with a detail pane, because
// a finding without its context is just a number.

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid, SeverityBadge } from '../components/common.jsx';
import { baseName } from '../core/languages.js';
import { crudLabel } from '../core/database.js';

/* -------------------------------------------------------- duplicate code */

export function DuplicateCodeView({ result, onOpenSource, search }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(null);

  const groups = useMemo(() => {
    const needle = (search || '').toLowerCase();
    return result.duplicates.groups.filter(
      (group) => !needle || group.fragments.some((f) => f.filePath.toLowerCase().includes(needle)),
    );
  }, [result, search]);

  const current = groups.find((group) => group.id === selected) || null;

  return (
    <div className="split">
      <div className="top">
        <div className="callout" style={{ margin: 12 }}>
          {t('views.duplicates')}: {result.duplicates.groups.length.toLocaleString('en-US')} groups ·{' '}
          {result.duplicates.totalDuplicateLines.toLocaleString('en-US')} lines ·{' '}
          {result.summary.projectDuplicateLinePercent}% · min {result.duplicates.minDuplicateLines} lines
        </div>
        <DataGrid
          columns={[
            { key: 'lineCount', label: t('columns.lines'), numeric: true },
            { key: 'occurrenceCount', label: t('columns.occurrences'), numeric: true },
            {
              key: 'files',
              label: t('columns.file'),
              wide: true,
              render: (group) => group.fragments.map((f) => baseName(f.filePath) + ':' + f.startLine).join(',  '),
              sortValue: (group) => group.fragments[0].filePath,
            },
          ]}
          rows={groups}
          getKey={(group) => group.id}
          selectedKey={selected}
          onRowClick={(group) => setSelected(group.id)}
          onRowDoubleClick={(group) => onOpenSource({ filePath: group.fragments[0].filePath, lineNumber: group.fragments[0].startLine })}
          initialSort={{ key: 'lineCount', direction: 'desc' }}
        />
      </div>
      {current ? (
        <div className="detail-pane">
          <div style={{ marginBottom: 8 }}>
            {current.fragments.map((fragment, index) => (
              <button
                key={index}
                type="button"
                className="chip"
                onClick={() => onOpenSource({ filePath: fragment.filePath, lineNumber: fragment.startLine })}
                title={fragment.filePath}
              >
                {baseName(fragment.filePath)}:{fragment.startLine}–{fragment.endLine}
              </button>
            ))}
          </div>
          <pre className="code-block mono">{current.duplicateLines.join('\n')}</pre>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------- global variables */

export function GlobalVariablesView({ result, onOpenSource, search }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(null);

  const accessIndex = useMemo(() => {
    const map = new Map();
    for (const access of result.globalAccesses) {
      if (!map.has(access.globalVariableId)) map.set(access.globalVariableId, []);
      map.get(access.globalVariableId).push(access);
    }
    return map;
  }, [result]);

  const rows = useMemo(() => {
    const needle = (search || '').toLowerCase();
    return result.globals
      .filter((g) => !needle || g.name.toLowerCase().includes(needle) || g.filePath.toLowerCase().includes(needle))
      .map((g) => {
        const accesses = accessIndex.get(g.id) || [];
        return {
          ...g,
          readCount: accesses.filter((a) => a.kind !== 'write').length,
          writeCount: accesses.filter((a) => a.kind !== 'read').length,
          accessCount: accesses.length,
        };
      });
  }, [result, accessIndex, search]);

  const current = rows.find((row) => row.id === selected) || null;
  const currentAccesses = current ? accessIndex.get(current.id) || [] : [];

  return (
    <div className="split">
      <div className="top">
        <DataGrid
          columns={[
            { key: 'name', label: t('columns.variable'), width: 190 },
            { key: 'typeName', label: t('columns.type'), width: 150 },
            { key: 'scope', label: t('columns.scope') },
            { key: 'containingScope', label: t('columns.kind') },
            { key: 'filePath', label: t('columns.file'), render: (r) => baseName(r.filePath), sortValue: (r) => baseName(r.filePath), width: 190 },
            { key: 'lineNumber', label: t('columns.line'), numeric: true },
            { key: 'readCount', label: 'Read', numeric: true },
            { key: 'writeCount', label: 'Write', numeric: true, severity: (r) => (!r.isConst && r.writeCount >= 2 ? 'warning' : 'none') },
            { key: 'isConst', label: 'const', render: (r) => (r.isConst ? 'O' : '') },
            { key: 'declaration', label: t('columns.declaration'), wide: true },
          ]}
          rows={rows}
          getKey={(row) => row.id}
          selectedKey={selected}
          onRowClick={(row) => setSelected(row.id)}
          onRowDoubleClick={(row) => onOpenSource({ filePath: row.filePath, lineNumber: row.lineNumber })}
          initialSort={{ key: 'writeCount', direction: 'desc' }}
        />
      </div>
      {current ? (
        <div className="detail-pane">
          <h4 style={{ margin: '0 0 8px' }}>
            {current.fullName} <span className="badge neutral">{currentAccesses.length} access</span>
          </h4>
          <DataGrid
            columns={[
              { key: 'kind', label: t('columns.accessKind'), render: (a) => <SeverityBadge severity={a.kind === 'read' ? 'info' : 'warning'}>{a.kind}</SeverityBadge> },
              { key: 'functionDisplayName', label: t('columns.function'), width: 210 },
              { key: 'functionFilePath', label: t('columns.file'), render: (a) => baseName(a.functionFilePath), width: 200 },
              { key: 'functionLineNumber', label: t('columns.line'), numeric: true },
            ]}
            rows={currentAccesses}
            getKey={(a, index) => a.functionId + index}
            maxRows={300}
            onRowDoubleClick={(a) => onOpenSource({ filePath: a.functionFilePath, lineNumber: a.functionLineNumber })}
          />
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------- DB table access */

export function TableAccessView({ result, onOpenSource, search }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('tables');
  const [selected, setSelected] = useState(null);

  const schema = result.schema;

  const tableRows = useMemo(() => {
    const needle = (search || '').toLowerCase();
    return schema.tables
      .filter((table) => !needle || table.name.toLowerCase().includes(needle))
      .map((table) => {
        const accesses = schema.accesses.filter((a) => a.tableId === table.id);
        const ops = accesses.reduce((acc, a) => acc | a.operations, 0);
        return {
          ...table,
          accessCount: accesses.length,
          columnCount: table.columns.length,
          crud: crudLabel(ops),
          readCount: accesses.filter((a) => a.kind !== 'write').length,
          writeCount: accesses.filter((a) => a.kind !== 'read').length,
        };
      });
  }, [schema, search]);

  const current = tableRows.find((row) => row.id === selected) || null;
  const currentAccesses = current ? schema.accesses.filter((a) => a.tableId === current.id) : [];
  const currentColumnAccesses = current ? schema.columnAccesses.filter((a) => a.tableId === current.id) : [];

  if (schema.tables.length === 0 && schema.catalogs.length === 0) {
    return <div className="empty-state">{t('common.noData')}</div>;
  }

  return (
    <div className="split">
      <div className="tabs">
        <button type="button" className={'tab' + (tab === 'tables' ? ' active' : '')} onClick={() => setTab('tables')}>
          {t('columns.table')} ({schema.tables.length})
        </button>
        <button type="button" className={'tab' + (tab === 'columns' ? ' active' : '')} onClick={() => setTab('columns')}>
          {t('columns.column')} ({schema.columnAccesses.length})
        </button>
        <button type="button" className={'tab' + (tab === 'catalogs' ? ' active' : '')} onClick={() => setTab('catalogs')}>
          DB ({schema.catalogs.length})
        </button>
      </div>

      {tab === 'catalogs' ? (
        <div className="top">
          <DataGrid
            columns={[
              { key: 'name', label: t('columns.name'), width: 220 },
              { key: 'dialect', label: t('columns.kind') },
              { key: 'sourceKind', label: t('columns.pattern') },
              { key: 'filePath', label: t('columns.file'), render: (r) => baseName(r.filePath || ''), width: 220 },
              { key: 'lineNumber', label: t('columns.line'), numeric: true },
              {
                key: 'access',
                label: t('columns.function'),
                numeric: true,
                render: (r) => schema.catalogAccesses.filter((a) => a.catalogId === r.id).length,
              },
            ]}
            rows={schema.catalogs}
            getKey={(row) => row.id}
            onRowDoubleClick={(row) => row.filePath && onOpenSource({ filePath: row.filePath, lineNumber: row.lineNumber })}
          />
        </div>
      ) : tab === 'columns' ? (
        <div className="top">
          <DataGrid
            columns={[
              { key: 'tableId', label: t('columns.table'), render: (r) => (schema.tables.find((tb) => tb.id === r.tableId) || {}).name || r.tableId, width: 170 },
              { key: 'columnName', label: t('columns.column'), width: 170 },
              { key: 'crud', label: t('columns.crud'), render: (r) => crudLabel(r.operations) },
              { key: 'functionDisplayName', label: t('columns.function'), width: 200 },
              { key: 'functionFilePath', label: t('columns.file'), render: (r) => baseName(r.functionFilePath), width: 190 },
              { key: 'functionLineNumber', label: t('columns.line'), numeric: true },
              { key: 'pattern', label: t('columns.pattern') },
            ]}
            rows={schema.columnAccesses.filter(
              (a) => !search || a.columnName.includes(search.toLowerCase()) || a.functionDisplayName.toLowerCase().includes(search.toLowerCase()),
            )}
            getKey={(row, index) => row.tableId + row.columnName + row.functionId + index}
            onRowDoubleClick={(row) => onOpenSource({ filePath: row.functionFilePath, lineNumber: row.functionLineNumber })}
          />
        </div>
      ) : (
        <>
          <div className="top">
            <DataGrid
              columns={[
                { key: 'name', label: t('columns.table'), width: 200 },
                { key: 'sourceKind', label: t('columns.pattern') },
                { key: 'dialect', label: t('columns.kind') },
                { key: 'columnCount', label: t('columns.column'), numeric: true },
                { key: 'accessCount', label: t('columns.function'), numeric: true },
                { key: 'readCount', label: 'Read', numeric: true },
                { key: 'writeCount', label: 'Write', numeric: true },
                { key: 'crud', label: t('columns.crud') },
                { key: 'filePath', label: t('columns.file'), render: (r) => baseName(r.filePath || ''), width: 190 },
              ]}
              rows={tableRows}
              getKey={(row) => row.id}
              selectedKey={selected}
              onRowClick={(row) => setSelected(row.id)}
              onRowDoubleClick={(row) => row.filePath && onOpenSource({ filePath: row.filePath, lineNumber: row.lineNumber })}
              initialSort={{ key: 'accessCount', direction: 'desc' }}
            />
          </div>
          {current ? (
            <div className="detail-pane">
              <h4 style={{ margin: '0 0 8px' }}>
                {current.name} <span className="badge neutral">{current.columns.length} columns</span>{' '}
                <span className="badge info">{currentAccesses.length} functions</span>
              </h4>
              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                  <DataGrid
                    columns={[
                      { key: 'name', label: t('columns.column') },
                      { key: 'dataType', label: t('columns.dataType') },
                      { key: 'isPrimaryKey', label: 'PK', render: (c) => (c.isPrimaryKey ? '🔑' : '') },
                      { key: 'isForeignKey', label: 'FK', render: (c) => (c.isForeignKey ? '↗' : '') },
                      { key: 'referencedTable', label: t('columns.table'), render: (c) => (c.referencedTable ? c.referencedTable + '.' + (c.referencedColumn || 'id') : '') },
                      {
                        key: 'access',
                        label: t('columns.function'),
                        numeric: true,
                        render: (c) => currentColumnAccesses.filter((a) => a.columnName === c.name.toLowerCase()).length,
                      },
                    ]}
                    rows={current.columns}
                    getKey={(c, index) => c.name + index}
                    maxRows={200}
                  />
                </div>
                <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                  <DataGrid
                    columns={[
                      { key: 'crud', label: t('columns.crud'), render: (a) => crudLabel(a.operations) },
                      { key: 'functionDisplayName', label: t('columns.function'), width: 190 },
                      { key: 'functionFilePath', label: t('columns.file'), render: (a) => baseName(a.functionFilePath) },
                      { key: 'functionLineNumber', label: t('columns.line'), numeric: true },
                    ]}
                    rows={currentAccesses}
                    getKey={(a, index) => a.functionId + index}
                    maxRows={200}
                    onRowDoubleClick={(a) => onOpenSource({ filePath: a.functionFilePath, lineNumber: a.functionLineNumber })}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- bug risk --- */

export function BugRiskView({ result, onOpenSource, search }) {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === 'en';
  const [category, setCategory] = useState('all');

  const findings = useMemo(() => {
    const needle = (search || '').toLowerCase();
    return result.bugRisk.findings.filter(
      (finding) =>
        (category === 'all' || finding.category === category) &&
        (!needle || finding.message.toLowerCase().includes(needle) || finding.filePath.toLowerCase().includes(needle)),
    );
  }, [result, category, search]);

  return (
    <div className="split">
      <div className="tabs" style={{ gap: 6, padding: '7px 10px' }}>
        <button type="button" className={'chip' + (category === 'all' ? ' active' : '')} onClick={() => setCategory('all')}>
          {t('common.total')} {result.bugRisk.total}
        </button>
        {result.bugRisk.categories.map((entry) => (
          <button
            key={entry.category}
            type="button"
            className={'chip' + (category === entry.category ? ' active' : '')}
            onClick={() => setCategory(entry.category)}
          >
            {(isEn ? entry.labelEn : entry.label) + ' ' + entry.count}
          </button>
        ))}
      </div>
      <div className="top">
        <DataGrid
          columns={[
            { key: 'severity', label: t('columns.severity'), render: (f) => <SeverityBadge severity={f.severity}>{t('severity.' + f.severity)}</SeverityBadge> },
            {
              key: 'category',
              label: t('columns.category'),
              render: (f) => {
                const entry = result.bugRisk.categories.find((c) => c.category === f.category);
                return entry ? (isEn ? entry.labelEn : entry.label) : f.category;
              },
              width: 150,
            },
            { key: 'filePath', label: t('columns.file'), render: (f) => baseName(f.filePath), sortValue: (f) => baseName(f.filePath), width: 190 },
            { key: 'line', label: t('columns.line'), numeric: true },
            { key: 'functionName', label: t('columns.function'), width: 160 },
            { key: 'message', label: t('columns.message'), wide: true },
            { key: 'snippet', label: t('columns.snippet'), wide: true, render: (f) => <code className="mono">{f.snippet}</code> },
          ]}
          rows={findings}
          getKey={(f, index) => f.filePath + f.line + f.category + index}
          onRowDoubleClick={(f) => onOpenSource({ filePath: f.filePath, lineNumber: f.line })}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ security -- */

export function SecurityView({ result, onOpenSource, search }) {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === 'en';
  const [ruleId, setRuleId] = useState('all');

  const security = result.security;

  const hits = useMemo(() => {
    const needle = (search || '').toLowerCase();
    const all = security.rules.flatMap((rule) => rule.hits);
    return all.filter(
      (hit) =>
        (ruleId === 'all' || hit.ruleId === ruleId) &&
        (!needle || hit.filePath.toLowerCase().includes(needle) || hit.snippet.toLowerCase().includes(needle)),
    );
  }, [security, ruleId, search]);

  const activeRule = security.rules.find((rule) => rule.ruleId === ruleId) || null;

  if (security.total === 0) {
    return (
      <div className="empty-state">
        <div className="big">{t('summary.noFindings')}</div>
      </div>
    );
  }

  return (
    <div className="split">
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
          <SeverityBadge severity="critical">{t('severity.critical')} {security.criticalCount}</SeverityBadge>
          <SeverityBadge severity="warning">{t('severity.warning')} {security.warningCount}</SeverityBadge>
          <SeverityBadge severity="info">{t('severity.info')} {security.infoCount}</SeverityBadge>
          <SeverityBadge severity="none">{security.affectedFileCount} files</SeverityBadge>
        </div>
        <div className="inline-list">
          <button type="button" className={'chip' + (ruleId === 'all' ? ' active' : '')} onClick={() => setRuleId('all')}>
            {t('common.total')} {security.total}
          </button>
          {security.rules.map((rule) => (
            <button
              key={rule.ruleId}
              type="button"
              className={'chip' + (ruleId === rule.ruleId ? ' active' : '')}
              onClick={() => setRuleId(rule.ruleId)}
              title={rule.remediation}
            >
              {(isEn ? rule.labelEn : rule.label) + ' ' + rule.hits.length}
            </button>
          ))}
        </div>
        {activeRule ? <div className={'callout ' + activeRule.severity} style={{ marginTop: 10 }}>{activeRule.remediation}</div> : null}
      </div>
      <div className="top">
        <DataGrid
          columns={[
            { key: 'severity', label: t('columns.severity'), render: (h) => <SeverityBadge severity={h.severity}>{t('severity.' + h.severity)}</SeverityBadge> },
            { key: 'label', label: t('columns.category'), render: (h) => (isEn ? h.labelEn : h.label), width: 170 },
            { key: 'filePath', label: t('columns.file'), render: (h) => baseName(h.filePath), sortValue: (h) => baseName(h.filePath), width: 190 },
            { key: 'line', label: t('columns.line'), numeric: true },
            { key: 'languageId', label: t('columns.language') },
            { key: 'snippet', label: t('columns.snippet'), wide: true, render: (h) => <code className="mono">{h.snippet}</code> },
          ]}
          rows={hits}
          getKey={(h, index) => h.filePath + h.line + h.ruleId + index}
          onRowDoubleClick={(h) => onOpenSource({ filePath: h.filePath, lineNumber: h.line })}
        />
      </div>
    </div>
  );
}
