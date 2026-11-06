import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconFile, IconFolder, IconLock } from './Icons';
import { fileIconFor, formatDate, formatSize, ratioText } from '../lib/format';

const ARCHIVE_COLUMNS = [
  ['name', 'column.name', '38%'],
  ['size', 'column.size', '11%'],
  ['packed', 'column.packed', '11%'],
  ['ratio', 'column.ratio', '7%'],
  ['mtime', 'column.modified', '15%'],
  ['method', 'column.method', '11%'],
  ['crc', 'column.crc', '8%'],
];

const FILE_COLUMNS = [
  ['name', 'column.name', '56%'],
  ['size', 'column.size', '14%'],
  ['type', 'column.type', '10%'],
  ['mtime', 'column.modified', '20%'],
];

function hex(n) {
  return n == null ? '' : n.toString(16).toUpperCase().padStart(8, '0');
}

function typeOf(item) {
  if (item.isDir) return '';
  const i = item.name.lastIndexOf('.');
  return i > 0 ? item.name.slice(i + 1).toUpperCase() : '';
}

// One table for both views: the contents of an archive, or a folder on disk.
export default function FileTable({ mode, items, selected, sortKey, descending, onSort, onRowClick, onRowOpen, onRowMenu, showPath }) {
  const { t } = useTranslation();
  const columns = mode === 'archive' ? ARCHIVE_COLUMNS : FILE_COLUMNS;
  return (
    <table className="files" data-testid="file-table">
      <colgroup>{columns.map(([key, , width]) => <col key={key} style={{ width }} />)}</colgroup>
      <thead>
        <tr>
          {columns.map(([key, label]) => (
            <th key={key} className={sortKey === key ? 'sorted' : ''} data-col={key} onClick={() => onSort(key)}>
              {t(label)}{sortKey === key ? (descending ? ' ▾' : ' ▴') : ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const key = item.key;
          const formatIcon = item.isDir ? null : fileIconFor(item.name);
          const Icon = item.isDir ? IconFolder : IconFile;
          return (
            <tr
              key={key}
              className={selected.has(key) ? 'sel' : ''}
              data-row={item.name}
              data-key={key}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                // Shift would otherwise select the page's text.
                if (e.shiftKey) e.preventDefault();
                onRowClick(e, item);
              }}
              onDoubleClick={() => onRowOpen(item)}
              onContextMenu={(e) => {
                e.preventDefault();
                onRowMenu(e, item);
              }}
            >
              <td title={item.path}>
                <span className="file-name">
                  <span className="file-icon" data-icon={formatIcon ?? (item.isDir ? 'folder' : 'file')}>
                    {formatIcon ? <img src={`./file-icons/${formatIcon}.svg`} alt="" /> : <Icon size={16} />}
                  </span>
                  <span>{showPath ? item.path : item.name}</span>
                  {item.entry?.encrypted && <span className="lock" data-testid="lock"><IconLock size={13} /></span>}
                </span>
              </td>
              <td className="num">{item.isDir && mode !== 'archive' ? '' : item.isDir && !item.size ? '' : formatSize(item.size)}</td>
              {mode === 'archive' ? (
                <>
                  <td className="num">{item.isDir ? '' : formatSize(item.packed)}</td>
                  <td className="num">{item.isDir ? '' : ratioText(item.size, item.packed)}</td>
                  <td className="dim">{formatDate(item.mtime)}</td>
                  <td className="dim">{item.entry?.method ?? ''}</td>
                  <td className="dim">{hex(item.entry?.crc)}</td>
                </>
              ) : (
                <>
                  <td className="dim">{typeOf(item)}</td>
                  <td className="dim">{formatDate(item.mtime)}</td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
