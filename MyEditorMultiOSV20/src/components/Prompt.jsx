// The terminal prompt, drawn from a prompt theme (src/lib/prompt.js):
// powerline segments are CSS clip-path arrows (no Nerd Font needed), diamond
// segments rounded pills, plain segments coloured text. [[icon:name]] markers
// in a segment's text become inline SVG icons.
import React, { useMemo } from 'react';
import { renderPrompt } from '../lib/prompt';
import { Icon } from './Icons';

function themeColors() {
  const cs = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const v = (n, d) => (cs ? cs.getPropertyValue(n).trim() || d : d);
  return { accent: v('--accent', '#4cc9f0'), fg: v('--fg', '#e6edf3'), bg: v('--bg', '#12161c') };
}

function withIcons(text) {
  const parts = String(text).split(/\[\[icon:([a-zA-Z]+)\]\]/g);
  if (parts.length === 1) return text;
  return parts.map((p, i) => (i % 2 ? <Icon key={i} name={p} size={12} /> : p));
}

function Segment({ s, prev, index }) {
  // Each segment sits above the one after it, so its arrow tip (which overlaps
  // the next segment's start) stays visible.
  const style = { color: s.fg, zIndex: 200 - index };
  if (s.bg) style.background = s.bg;
  if (s.style === 'powerline') {
    // The arrow of the previous segment points into this one: its colour is the previous background.
    return <span className={`pseg pseg-pl ${s.bg ? '' : 'nobg'} ${prev && prev.style === 'powerline' && prev.bg ? 'after-pl' : ''}`} data-type={s.type} style={style}>{withIcons(s.text)}</span>;
  }
  if (s.style === 'diamond') return <span className="pseg pseg-dm" data-type={s.type} style={style}>{withIcons(s.text)}</span>;
  return <span className="pseg pseg-plain" data-type={s.type} style={style}>{withIcons(s.text)}</span>;
}

// state: { cwd, home, git, user, host, shell, platform, rc, ms, now, root }
export function Prompt({ config, state, stale = false, title }) {
  const theme = themeColors();   // cheap; the transcript that holds the prompts is memoised by its owner
  const r = useMemo(() => renderPrompt(config, state, theme), [config, state, theme.accent, theme.fg, theme.bg]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className={`term-prompt ${stale ? 'stale' : ''}`} data-git={r.gitState} title={title || state.cwd}>
      {r.blocks.map((b, bi) => (
        <React.Fragment key={bi}>
          {b.newline && bi > 0 ? '\n' : ''}
          {b.segments.map((s, i) => <Segment key={i} s={s} prev={i ? b.segments[i - 1] : null} index={i} />)}
        </React.Fragment>
      ))}
      {r.finalSpace ? ' ' : ''}
    </span>
  );
}

export default Prompt;
