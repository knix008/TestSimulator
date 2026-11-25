// Left panel: drawing tools, the shape palette (by category, with search), the emoji palette
// (by category, with search; a click puts the emoji in the middle of the canvas) and the layers.
import React, { useMemo, useState } from 'react';
import { getLanguage, t } from '../i18n.js';
import { EMOJI, EMOJI_BY_ID, EMOJI_CATEGORIES, emojiChar, emojiIn } from '../lib/emoji.js';
import { SHAPE_CATEGORIES, ALL_SHAPE_IDS, SHAPE_BY_ID, shapesIn } from '../lib/shapes.js';
import { Btn, Card, Icon } from './controls.jsx';

export const TOOLS = ['select', 'hand', 'rect', 'roundRect', 'ellipse', 'line', 'arrowLine', 'poly', 'pen', 'brush', 'text', 'eyedropper', 'bucket', 'eraser'];
export const TOOL_KEYS = { select: 'V', hand: 'H', rect: 'R', roundRect: 'U', ellipse: 'O', line: 'L', arrowLine: 'A', poly: 'G', pen: 'P', brush: 'B', text: 'T', eyedropper: 'I', bucket: 'K', eraser: 'E' };

/** An emoji's name in the program's language. */
export const emojiName = (id) => EMOJI_BY_ID[id]?.[getLanguage() === 'en' ? 'en' : 'ko'] ?? emojiChar(id);

/** The name of an object in the layer list. */
export function objectName(o) {
  if (o.name) return o.name;
  if (o.type === 'text') return `“${o.text}”`;
  if (o.type === 'emoji') return emojiName(o.emoji);
  if (o.type === 'shape') return t(`shape.${o.shape}`);
  if (o.type === 'line') return t(o.arrowEnd || o.arrowStart ? 'tool.arrowLine' : 'tool.line');
  if (o.type === 'rect') return t(o.rx > 0 ? 'tool.roundRect' : 'tool.rect');
  return t(`tool.${o.type === 'image' ? 'image' : o.type}`);
}

export const objectIcon = (o) => (o.type === 'emoji' ? `emoji:${o.emoji}` : o.type === 'shape' ? `shape:${o.shape}` : o.type === 'line' ? (o.arrowEnd ? 'arrowLine' : 'line') : o.type === 'rect' && o.rx > 0 ? 'roundRect' : o.type);

export default function LeftPanel({ tool, setTool, onImportImage, onImportModel, onEmoji, userEmoji = [], onUserEmoji, onAddUserEmoji, onAddSelectionEmoji, onRemoveUserEmoji, hasSelection, objects, selectedId, onSelect, onLayer, category, setCategory }) {
  const [query, setQuery] = useState('');
  const [emojiCat, setEmojiCat] = useState('faces');
  const [emojiQuery, setEmojiQuery] = useState('');
  const lang = getLanguage() === 'en' ? 'en' : 'ko';
  const emojiFound = useMemo(() => {
    const q = emojiQuery.trim().toLowerCase();
    if (!q) return null;
    return EMOJI.filter((e) => e.ko.toLowerCase().includes(q) || e.en.toLowerCase().includes(q) || emojiChar(e.id) === q || e.id === q);
  }, [emojiQuery]);
  const mine = emojiCat === 'mine';
  const emojiShown = emojiFound ?? (mine ? [] : emojiIn(emojiCat));
  const q = emojiQuery.trim().toLowerCase();
  const userShown = q ? userEmoji.filter((e) => e.name.toLowerCase().includes(q)) : mine ? userEmoji : [];
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return ALL_SHAPE_IDS.filter((id) => t(`shape.${id}`).toLowerCase().includes(q) || id.toLowerCase().includes(q));
  }, [query]);
  const shown = found ?? shapesIn(category);
  const ordered = [...objects].reverse(); // the front-most object at the top

  return (
    <div className="side-scroll">
      <Card icon="catTools" title={t('panel.tools')} testId="tools-card">
        <div className="btn-grid two">
          {TOOLS.map((id) => (
            <Btn key={id} icon={id} label={t(`tool.${id}`)} title={`${t(`tool.${id}`)} (${TOOL_KEYS[id]}) — ${t(`tip.${id}`)}`} active={tool === id} onClick={() => setTool(id)} data-tool={id} />
          ))}
          <Btn icon="importImage" label={t('tool.image')} title={t('tip.image')} onClick={onImportImage} />
          <Btn icon="cube" label={t('model3d.tool')} title={t('model3d.toolTip')} onClick={onImportModel} data-testid="import-model" />
        </div>
      </Card>

      <Card icon="catSymbols" title={t('panel.shapes')} extra={<span className="card-note">{ALL_SHAPE_IDS.length}</span>} testId="shapes-card">
        <div className="btn-grid three cat-tabs" role="tablist">
          {SHAPE_CATEGORIES.map((c) => (
            <Btn key={c.id} icon={c.icon} label={t(`shapeCat.${c.id}`)} active={!found && category === c.id} role="tab" aria-selected={!found && category === c.id}
              onClick={() => { setQuery(''); setCategory(c.id); }} />
          ))}
        </div>
        <label className="search-field">
          <Icon name="zoomIn" size={16} />
          <input value={query} placeholder={t('shape.search')} aria-label={t('shape.search')} onChange={(e) => setQuery(e.target.value)} />
          {query && <button type="button" className="clear" onClick={() => setQuery('')} title={t('common.clear')} aria-label={t('common.clear')}><Icon name="close" size={13} /></button>}
        </label>
        <div className="btn-grid two shape-grid">
          {shown.map((id) => (
            <Btn key={id} icon={`shape:${id}`} label={t(`shape.${id}`)} title={`${t(`shape.${id}`)} — ${t('tip.shape')}`} active={tool === id} onClick={() => setTool(id)} data-shape={id} />
          ))}
          {!shown.length && <div className="empty-note">{t('shape.none')}</div>}
        </div>
      </Card>

      <Card icon="emoji:1f600" title={t('panel.emoji')} extra={<span className="card-note">{EMOJI.length + userEmoji.length}</span>} testId="emoji-card">
        <div className="btn-grid two cat-tabs emoji-tabs" role="tablist">
          {EMOJI_CATEGORIES.map((c) => (
            <Btn key={c.id} icon={`emoji:${c.icon}`} label={c[lang]} title={c[lang]} active={!emojiFound && emojiCat === c.id} role="tab" aria-selected={!emojiFound && emojiCat === c.id}
              onClick={() => { setEmojiQuery(''); setEmojiCat(c.id); }} data-emoji-cat={c.id} />
          ))}
          <Btn icon="shape:star" label={t('library.myEmoji')} title={`${t('library.myEmojiTip')} — ${userEmoji.length}`} active={!emojiFound && mine} role="tab" aria-selected={!emojiFound && mine}
            onClick={() => { setEmojiQuery(''); setEmojiCat('mine'); }} data-emoji-cat="mine" />
        </div>
        {mine && !q && (
          <div className="btn-grid one">
            <Btn icon="importImage" label={t('library.addPicture')} title={t('library.addPictureTip')} onClick={onAddUserEmoji} data-testid="user-emoji-add" />
            <Btn icon="design" label={t('library.addSelection')} title={t('library.addSelectionTip')} onClick={onAddSelectionEmoji} disabled={!hasSelection} data-testid="user-emoji-selection" />
          </div>
        )}
        <label className="search-field">
          <Icon name="zoomIn" size={16} />
          <input value={emojiQuery} placeholder={t('emoji.search')} aria-label={t('emoji.search')} onChange={(e) => setEmojiQuery(e.target.value)} data-testid="emoji-search" />
          {emojiQuery && <button type="button" className="clear" onClick={() => setEmojiQuery('')} title={t('common.clear')} aria-label={t('common.clear')}><Icon name="close" size={13} /></button>}
        </label>
        <div className="emoji-grid">
          {emojiShown.map((e) => (
            <Btn key={e.id} icon={`emoji:${e.id}`} size={26} title={`${e[lang]} — ${t('tip.emoji')}`} className="emoji-btn" onClick={() => onEmoji(e.id)} data-emoji={e.id} />
          ))}
          {userShown.map((e) => (
            <span key={e.id} className="user-emoji" data-user-emoji={e.id}>
              <button type="button" className="btn emoji-btn" title={`${e.name} — ${t('tip.emoji')}`} aria-label={e.name} onClick={() => onUserEmoji(e)}><img src={e.href} alt="" width="26" height="26" draggable={false} /></button>
              <button type="button" className="user-emoji-remove" title={t('library.removeEmojiTitle')} aria-label={t('library.removeEmojiTitle')} onClick={() => onRemoveUserEmoji(e)}><Icon name="close" size={11} /></button>
            </span>
          ))}
          {mine && !q && !userEmoji.length && <div className="empty-note">{t('library.noEmoji')}</div>}
          {!emojiShown.length && !userShown.length && !mine && <div className="empty-note">{t('emoji.none')}</div>}
        </div>
      </Card>

      <Card icon="layers" title={t('panel.layers')} extra={<span className="card-note">{objects.length}</span>} testId="layers-card">
        <div className="layer-list">
          {!ordered.length && <div className="empty-note"><Icon name="info" size={16} />{t('layers.empty')}</div>}
          {ordered.map((o) => (
            <div key={o.id} className={`layer-item ${selectedId === o.id ? 'active' : ''} ${o.hidden ? 'is-hidden' : ''}`} onClick={() => onSelect(o.id)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onSelect(o.id); }}>
              <button type="button" className="mini" title={t(o.hidden ? 'layers.show' : 'layers.hide')} onClick={(e) => { e.stopPropagation(); onLayer(o.id, 'hidden'); }}><Icon name={o.hidden ? 'eyeOff' : 'eye'} size={15} /></button>
              <button type="button" className="mini" title={t(o.locked ? 'layers.unlock' : 'layers.lock')} onClick={(e) => { e.stopPropagation(); onLayer(o.id, 'locked'); }}><Icon name={o.locked ? 'lock' : 'unlock'} size={15} /></button>
              <span className="layer-swatch" style={{ background: o.hasFill ? o.fill : o.hasStroke ? o.stroke : 'transparent' }} />
              <Icon name={objectIcon(o)} size={16} />
              <span className="layer-name">{objectName(o)}</span>
              <span className="layer-ops">
                <button type="button" className="mini" title={t('arrange.forward')} onClick={(e) => { e.stopPropagation(); onLayer(o.id, 'up'); }}><Icon name="forward" size={15} /></button>
                <button type="button" className="mini" title={t('arrange.backward')} onClick={(e) => { e.stopPropagation(); onLayer(o.id, 'down'); }}><Icon name="backward" size={15} /></button>
                <button type="button" className="mini danger" title={t('edit.delete')} onClick={(e) => { e.stopPropagation(); onLayer(o.id, 'delete'); }}><Icon name="trash" size={15} /></button>
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export const isShapeTool = (tool) => Boolean(SHAPE_BY_ID[tool]) || shapesIn('solids').includes(tool);
