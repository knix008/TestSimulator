import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconChevron, IconFolder, IconPdf } from './Icons.jsx';
import { folderLabel, toFolderEntries } from '../lib/folders.js';

// Folder navigation tree. Expanding a directory lists its subfolders and
// files whose last extension is exactly "pdf". Parent and child rows are
// joined by the shared .tree connector lines.
export default function FolderTree({
  root,
  currentPath,
  desktop,
  onOpenFile,
  loadFolder,
}) {
  const { t } = useTranslation();
  const [kids, setKids] = useState(() => new Map());
  const [open, setOpen] = useState(() => new Set());
  const [busy, setBusy] = useState(() => new Set());

  const load = async (dir, { prefetch = true } = {}) => {
    if (!dir || !loadFolder) return;
    setBusy((s) => new Set(s).add(dir));
    try {
      const list = toFolderEntries(await loadFolder(dir));
      setKids((m) => new Map(m).set(dir, list));
      // Open folders that actually contain PDFs so those files stay visible.
      if (list.some((n) => n.kind === 'pdf')) {
        setOpen((prev) => (prev.has(dir) ? prev : new Set(prev).add(dir)));
      }
      if (prefetch) {
        for (const node of list) {
          if (node.kind === 'dir') load(node.path, { prefetch: false });
        }
      }
    } catch {
      setKids((m) => new Map(m).set(dir, []));
    } finally {
      setBusy((s) => {
        const next = new Set(s);
        next.delete(dir);
        return next;
      });
    }
  };

  useEffect(() => {
    setKids(new Map());
    if (!root) {
      setOpen(new Set());
      return undefined;
    }
    setOpen(new Set([root]));
    load(root);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  const toggle = (dir) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else {
        next.add(dir);
        const cached = kids.get(dir);
        if (!cached) load(dir);
      }
      return next;
    });
  };

  const renderLevel = (entries) => (
    <ul className="tree">
      {(entries || []).map((node) => {
        const isDir = node.kind === 'dir';
        const isOpen = open.has(node.path);
        const childList = kids.get(node.path);
        const loading = busy.has(node.path);
        const current = !isDir && currentPath && node.path === currentPath;
        return (
          <li key={node.path} className={isDir ? 'branch' : 'leaf'}>
            <div className={`tree-row${isDir ? '' : ' file'}${current ? ' current' : ''}`}>
              {isDir ? (
                <button
                  className="tree-toggle"
                  type="button"
                  onClick={() => toggle(node.path)}
                  title={isOpen ? t('side.collapse') : t('side.expand')}
                  aria-label={isOpen ? t('side.collapse') : t('side.expand')}
                  aria-expanded={isOpen}
                >
                  <IconChevron size={13} className={isOpen ? 'open' : ''} />
                </button>
              ) : <span className="tree-toggle placeholder" />}
              <button
                className="tree-label"
                type="button"
                title={node.path}
                onClick={() => {
                  if (isDir) toggle(node.path);
                  else onOpenFile?.(node.path);
                }}
              >
                <span className="tree-kind" aria-hidden="true">
                  {isDir ? <IconFolder size={14} /> : <IconPdf size={14} />}
                </span>
                <span className="ol-title">{node.name}</span>
              </button>
            </div>
            {isDir && isOpen ? (
              loading && !childList
                ? <p className="empty tree-empty">{t('side.folderLoading')}</p>
                : (childList?.length ? renderLevel(childList) : null)
            ) : null}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="folder-tree">
      {!desktop ? (
        <p className="empty">{t('side.folderWeb')}</p>
      ) : !root ? (
        <p className="empty">{t('side.noFolder')}</p>
      ) : (
        renderLevel([{ path: root, name: folderLabel(root), kind: 'dir' }])
      )}
    </div>
  );
}
