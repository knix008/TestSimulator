import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke, fsRoots } from '../lib/host';
import { IconArchive, IconChevron, IconDrive, IconFolder, IconHome, IconPlaces } from './Icons';

function Twist({ open, onClick, hidden }) {
  if (hidden) return <span className="tree-twist" />;
  return (
    <button
      className={`tree-twist${open ? ' open' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      tabIndex={-1}
    >
      <IconChevron size={13} />
    </button>
  );
}

// The folders inside an archive.
function ArchiveNode({ node, depth, cwd, onPick, open, setOpen }) {
  const folders = [...node.children.values()].filter((c) => c.isDir).sort((a, b) => a.name.localeCompare(b.name));
  const isOpen = open.has(node.path);
  return (
    <>
      <div
        className={`tree-row${cwd === node.path ? ' on' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        data-tree={node.path}
        onClick={() => onPick(node.path)}
      >
        <Twist open={isOpen} hidden={!folders.length} onClick={() => setOpen((s) => toggled(s, node.path))} />
        <IconFolder size={15} />
        <span>{node.name}</span>
      </div>
      {isOpen && folders.map((f) => <ArchiveNode key={f.path} node={f} depth={depth + 1} cwd={cwd} onPick={onPick} open={open} setOpen={setOpen} />)}
    </>
  );
}

function toggled(set, key) {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function ArchiveTree({ root, name, cwd, onPick }) {
  const [open, setOpen] = useState(() => new Set());
  // Whatever folder is being looked at stays visible in the tree.
  useEffect(() => {
    if (!cwd) return;
    setOpen((s) => {
      const next = new Set(s);
      const parts = cwd.split('/');
      for (let i = 1; i < parts.length; i += 1) next.add(parts.slice(0, i).join('/'));
      return next;
    });
  }, [cwd]);
  const folders = [...root.children.values()].filter((c) => c.isDir).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="tree" data-testid="archive-tree">
      <div className={`tree-row${cwd === '' ? ' on' : ''}`} style={{ paddingLeft: 6 }} data-tree="" onClick={() => onPick('')}>
        <span className="tree-twist" />
        <IconArchive size={15} />
        <span>{name}</span>
      </div>
      {folders.map((f) => <ArchiveNode key={f.path} node={f} depth={1} cwd={cwd} onPick={onPick} open={open} setOpen={setOpen} />)}
    </div>
  );
}

// The folders on disk, read as they are opened.
function DiskNode({ path, name, depth, cwd, onPick, icon: Icon = IconFolder, showHidden }) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState(null);

  const load = async () => {
    try {
      const items = await invoke('list_dir', { path });
      setChildren(items.filter((i) => i.isDir && (showHidden || !i.name.startsWith('.'))));
    } catch {
      setChildren([]);
    }
  };
  const inside = cwd && (cwd === path || cwd.startsWith(path.endsWith('\\') || path.endsWith('/') ? path : `${path}${path.includes('\\') ? '\\' : '/'}`));
  useEffect(() => {
    if (inside && cwd !== path && !open) {
      setOpen(true);
      if (children == null) load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd]);
  return (
    <>
      <div className={`tree-row${cwd === path ? ' on' : ''}`} style={{ paddingLeft: 6 + depth * 14 }} data-disk={path} onClick={() => onPick(path)}>
        <Twist
          open={open}
          hidden={children != null && !children.length}
          onClick={() => {
            if (!open && children == null) load();
            setOpen(!open);
          }}
        />
        <Icon size={15} />
        <span>{name}</span>
      </div>
      {open && children?.map((c) => <DiskNode key={c.path} path={c.path} name={c.name} depth={depth + 1} cwd={cwd} onPick={onPick} showHidden={showHidden} />)}
    </>
  );
}

// A row of drive icons at the top of the left panel, whichever view it is showing.
export function DriveBar({ current, onPick }) {
  const [drives, setDrives] = useState([]);
  useEffect(() => {
    fsRoots().then((roots) => setDrives(roots.filter((r) => r.kind === 'drive'))).catch(() => {});
  }, []);
  const lower = String(current ?? '').toLowerCase();
  return (
    <div className="drive-bar" data-testid="drive-bar">
      {drives.map((d) => (
        <button
          key={d.path}
          className={`drive-btn${lower.startsWith(d.path.toLowerCase()) ? ' on' : ''}`}
          data-drive={d.path}
          title={d.path}
          aria-label={d.path}
          onClick={() => onPick(d.path)}
        >
          <IconDrive size={18} />
          <span>{d.name.replace(/[\\/]$/, '') || d.name}</span>
        </button>
      ))}
    </div>
  );
}

export function DiskTree({ cwd, onPick, showHidden }) {
  const { t } = useTranslation();
  const [roots, setRoots] = useState([]);
  useEffect(() => {
    fsRoots().then(setRoots).catch(() => {});
  }, []);
  const places = roots.filter((r) => r.kind !== 'drive');
  const drives = roots.filter((r) => r.kind === 'drive');
  return (
    <div className="tree" data-testid="disk-tree">
      <div className="tree-group" data-testid="tree-places"><IconPlaces size={14} />{t('tree.places')}</div>
      {places.map((r) => <DiskNode key={r.path} path={r.path} name={t(`tree.${r.name}`)} depth={0} cwd={cwd} onPick={onPick} icon={r.kind === 'home' ? IconHome : IconFolder} showHidden={showHidden} />)}
      <div className="tree-group tree-group-next" data-testid="tree-drives"><IconDrive size={14} />{t('tree.drives')}</div>
      {drives.map((r) => <DiskNode key={r.path} path={r.path} name={r.name} depth={0} cwd={cwd} onPick={onPick} icon={IconDrive} showHidden={showHidden} />)}
    </div>
  );
}
