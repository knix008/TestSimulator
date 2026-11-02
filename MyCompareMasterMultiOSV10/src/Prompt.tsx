/**
 * The terminal prompt, drawn from a prompt theme (`core/prompt.ts`).
 *
 * Powerline segments are CSS clip-path arrows and diamond segments rounded pills, so a
 * prompt needs no Nerd Font to look like one; a plain segment is coloured text.
 * `[[icon:name]]` in a rendered segment becomes an inline SVG from the app's own icon
 * set, which is why the default themes can show a folder and a branch.
 */
import { useMemo } from "react";
import React from "react";
import { renderPrompt, type PromptConfig, type PromptState, type RenderedSegment } from "../core/prompt.js";
import { Icon } from "./icons.js";

/** The three colours a prompt theme can borrow from the app's theme. */
function themeColors(): { accent: string; fg: string; bg: string } {
  const style = typeof window === "undefined" ? null : getComputedStyle(document.documentElement);
  const value = (name: string, fallback: string) =>
    (style ? style.getPropertyValue(name).trim() || fallback : fallback);
  return {
    accent: value("--accent", "#4cc9f0"),
    fg: value("--text", "#e6edf3"),
    bg: value("--bg", "#12161c"),
  };
}

function withIcons(text: string): React.ReactNode {
  const parts = String(text).split(/\[\[icon:([a-zA-Z]+)\]\]/g);
  if (parts.length === 1) return text;
  return parts.map((part, index) => (index % 2
    ? <Icon key={index} name={part} size={12} />
    : <React.Fragment key={index}>{part}</React.Fragment>));
}

function Segment({ segment, previous, index }: {
  segment: RenderedSegment;
  previous: RenderedSegment | null;
  index: number;
}) {
  // Each segment sits above the one after it, so its arrow tip — which overlaps the next
  // segment's start — stays visible.
  const style: React.CSSProperties = { color: segment.fg ?? undefined, zIndex: 200 - index };
  if (segment.bg) style.background = segment.bg;
  if (segment.style === "powerline") {
    const after = previous && previous.style === "powerline" && previous.bg ? " after-pl" : "";
    return (
      <span className={`pseg pseg-pl${segment.bg ? "" : " nobg"}${after}`} data-type={segment.type} style={style}>
        {withIcons(segment.text)}
      </span>
    );
  }
  if (segment.style === "diamond") {
    return <span className="pseg pseg-dm" data-type={segment.type} style={style}>{withIcons(segment.text)}</span>;
  }
  return <span className="pseg pseg-plain" data-type={segment.type} style={style}>{withIcons(segment.text)}</span>;
}

export function Prompt({ config, state, stale = false, title }: {
  config: PromptConfig;
  state: PromptState;
  /** The git status is still being read: the prompt is shown, a shade quieter. */
  stale?: boolean;
  title?: string;
}) {
  const theme = themeColors();
  const rendered = useMemo(
    () => renderPrompt(config, state, theme),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, state, theme.accent, theme.fg, theme.bg],
  );
  return (
    <span className={`term-prompt${stale ? " stale" : ""}`} data-git={rendered.gitState} title={title || state.cwd}>
      {rendered.blocks.map((block, blockIndex) => (
        <React.Fragment key={blockIndex}>
          {block.newline && blockIndex > 0 ? "\n" : ""}
          {block.segments.map((segment, index) => (
            <Segment
              key={index}
              segment={segment}
              previous={index ? block.segments[index - 1] : null}
              index={index}
            />
          ))}
        </React.Fragment>
      ))}
      {rendered.finalSpace ? " " : ""}
    </span>
  );
}
