import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { FileTypeIcon, Icon, MenuGlyph, type IconName } from "./icons";
import type { Lang } from "./i18n";
import { documentFromLines, wordSpans, type CharSpan, type DiffLineKind, type DiffRow } from "../core/lineDiff";
import { buildResult, conflictCount, displayLines, mergeTexts, type Resolution } from "../core/threeWayMerge";

export function SideBySideDiff(props: { path: string; left: string; right: string; leftVersion: string; rightVersion: string; lang: Lang; t: (key: string) => string }) {
  const document = useMemo(() => documentFromLines(displayLines(props.left), displayLines(props.right)), [props.left, props.right]);
  const blocks = document.diffBlocks;
  const marks = useMemo(() => changeMarks(document.rows), [document.rows]);
  const [block, setBlock] = useState(0);
  const [wrap, setWrap] = useState(false);
  const leftPane = useRef<HTMLDivElement>(null);
  const rightPane = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const syncScroll = (from: HTMLDivElement, to: HTMLDivElement | null) => {
    if (!to || syncing.current) return;
    syncing.current = true;
    to.scrollTop = from.scrollTop;
    syncing.current = false;
  };
  const jump = (next: number) => {
    if (blocks.length < 2 || !leftPane.current) return;
    const index = (next + blocks.length) % blocks.length;
    setBlock(index);
    const line = leftPane.current.querySelector<HTMLElement>(`[data-row="${blocks[index]}"]`);
    if (line) leftPane.current.scrollTop = Math.max(0, line.offsetTop - leftPane.current.clientHeight / 2);
    if (rightPane.current) rightPane.current.scrollTop = leftPane.current.scrollTop;
  };
  const scrollToRow = (index: number) => {
    const line = leftPane.current?.querySelector<HTMLElement>(`[data-row="${index}"]`);
    if (!line || !leftPane.current) return;
    leftPane.current.scrollTop = Math.max(0, line.offsetTop - leftPane.current.clientHeight / 2);
    if (rightPane.current) rightPane.current.scrollTop = leftPane.current.scrollTop;
  };
  useLayoutEffect(() => {
    const leftLines = leftPane.current?.querySelectorAll<HTMLElement>(".side-line");
    const rightLines = rightPane.current?.querySelectorAll<HTMLElement>(".side-line");
    if (!leftLines || !rightLines) return;
    const count = Math.min(leftLines.length, rightLines.length);
    for (let index = 0; index < count; index++) {
      leftLines[index].style.minHeight = "";
      rightLines[index].style.minHeight = "";
    }
    if (!wrap) return;
    for (let index = 0; index < count; index++) {
      const height = Math.max(leftLines[index].offsetHeight, rightLines[index].offsetHeight);
      leftLines[index].style.minHeight = `${height}px`;
      rightLines[index].style.minHeight = `${height}px`;
    }
  }, [wrap, document.rows]);
  return (
    <div className="side-diff">
      <div className="tool-bar">
        <span>+{document.added}</span>
        <span>-{document.removed}</span>
        <span>~{document.modified}</span>
        <button type="button" aria-pressed={wrap} onClick={() => setWrap((value) => !value)}>{props.t("wordWrap")}</button>
        <IconText icon="prev" disabled={!blocks.length} onClick={() => jump(block - 1)}>{props.t("prevDiff")}</IconText>
        <IconText icon="next" disabled={!blocks.length} onClick={() => jump(block + 1)}>{props.t("nextDiff")}</IconText>
      </div>
      <div className={wrap ? "side-panes wrap" : "side-panes"}>
        <DiffPane title={props.t("leftSide")} version={props.leftVersion} paneRef={leftPane} onScroll={(pane) => syncScroll(pane, rightPane.current)} rows={document.rows} marks={marks} onMark={scrollToRow} side="left" />
        <DiffPane title={props.t("rightSide")} version={props.rightVersion} paneRef={rightPane} onScroll={(pane) => syncScroll(pane, leftPane.current)} rows={document.rows} marks={marks} onMark={scrollToRow} side="right" />
      </div>
      <ToolStatus t={props.t} lang={props.lang} path={props.path} state="ready" detail={`+${document.added}  -${document.removed}  ~${document.modified}`} />
    </div>
  );
}

function DiffPane(props: {
  title: string;
  version: string;
  rows: DiffRow[];
  marks: ChangeMark[];
  side: "left" | "right";
  paneRef: RefObject<HTMLDivElement | null>;
  onScroll: (pane: HTMLDivElement) => void;
  onMark: (index: number) => void;
}) {
  const total = Math.max(props.rows.length, 1);
  return (
    <section className="side-pane">
      <div className="side-pane-title" title={props.version}>
        <span>{props.title}</span>
        {props.version && <span className="side-version">{props.version}</span>}
      </div>
      <div className="side-pane-body">
      <div className="side-pane-scroll" ref={props.paneRef} onScroll={(event) => props.onScroll(event.currentTarget)}>
        {props.rows.map((row, index) => {
          const text = props.side === "left" ? row.left : row.right;
          const other = props.side === "left" ? row.right : row.left;
          const spans = row.kind === "modified" && text !== null && other !== null
            ? wordSpans(props.side === "left" ? text : other, props.side === "left" ? other : text)
            : null;
          const marks = props.side === "left" ? spans?.left : spans?.right;
          return (
            <div key={index} className={`side-line ${row.kind}`} data-row={index}>
              <span className="no">{(props.side === "left" ? row.leftNo : row.rightNo) ?? ""}</span>
              <span className="text">{paint(text, marks) || " "}</span>
            </div>
          );
        })}
      </div>
      <div className="change-rail">
        {props.marks.map((mark) => (
          <button
            key={`${mark.kind}-${mark.start}`}
            type="button"
            className={`change-mark ${mark.kind}`}
            style={{ top: `${(mark.start / total) * 100}%`, height: `${Math.max(((mark.end - mark.start) / total) * 100, 1.2)}%` }}
            onClick={() => props.onMark(mark.start)}
          />
        ))}
      </div>
      </div>
    </section>
  );
}

type ChangeMark = { start: number; end: number; kind: DiffLineKind };

function changeMarks(rows: DiffRow[]): ChangeMark[] {
  const marks: ChangeMark[] = [];
  let index = 0;
  while (index < rows.length) {
    const kind = rows[index].kind;
    if (kind === "same") {
      index += 1;
      continue;
    }
    const start = index;
    while (index < rows.length && rows[index].kind === kind) index += 1;
    marks.push({ start, end: index, kind });
  }
  return marks;
}

function paint(text: string | null, spans?: CharSpan[]) {
  if (text === null) return "";
  if (!spans?.length) return text || " ";
  const parts: ReactNode[] = [];
  let cursor = 0;
  spans.forEach((span, index) => {
    if (span.start > cursor) parts.push(text.slice(cursor, span.start));
    parts.push(<mark key={index}>{text.slice(span.start, span.end)}</mark>);
    cursor = span.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

export function MergeTool(props: {
  path: string;
  base: string;
  local: string;
  remote: string;
  lang: Lang;
  t: (key: string) => string;
  onSave: (content: string) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const document = useMemo(() => mergeTexts(props.base, props.local, props.remote), [props.base, props.local, props.remote]);
  const total = conflictCount(document);
  const [choices, setChoices] = useState<Resolution[]>(() => Array(total).fill("unresolved"));
  const [saving, setSaving] = useState(false);
  const resolved = choices.filter((choice) => choice !== "unresolved").length;
  const result = buildResult(document, choices);
  const save = async () => {
    setSaving(true);
    try {
      await props.onSave(result);
    } catch (error) {
      props.onError(error);
    } finally {
      setSaving(false);
    }
  };
  let conflict = 0;
  return (
    <div className="merge-tool">
      <div className="tool-bar">
        <span>{props.t("mergeResolved")} {resolved} / {total}</span>
        <IconText icon="commit" className="primary" disabled={saving || resolved !== total} onClick={() => void save()}>{props.t("mergeSave")}</IconText>
      </div>
      <div className="merge-scroll">
        {document.regions.map((region, index) => {
          if (region.kind === "clean") {
            return <CodeLines key={index} lines={region.lines} />;
          }
          const current = conflict;
          conflict += 1;
          const choice = choices[current] ?? "unresolved";
          const pick = (next: Resolution) => setChoices((items) => items.map((item, itemIndex) => itemIndex === current ? next : item));
          return (
            <section key={index} className={choice === "unresolved" ? "merge-conflict" : "merge-conflict resolved"}>
              <div className="merge-columns">
                <MergePane title={props.t("takeBase")} lines={region.conflict.base} active={choice === "base"} />
                <MergePane title={props.t("takeLocal")} lines={region.conflict.local} active={choice === "local"} />
                <MergePane title={props.t("takeRemote")} lines={region.conflict.remote} active={choice === "remote"} />
              </div>
              <div className="merge-picks">
                <IconText icon="snapshot" className={choice === "base" ? "active" : ""} onClick={() => pick("base")}>{props.t("takeBase")}</IconText>
                <IconText icon="panelLeft" className={choice === "local" ? "active" : ""} onClick={() => pick("local")}>{props.t("takeLocal")}</IconText>
                <IconText icon="fetch" className={choice === "remote" ? "active" : ""} onClick={() => pick("remote")}>{props.t("takeRemote")}</IconText>
                <IconText icon="plus" className={choice === "both" ? "active" : ""} onClick={() => pick("both")}>{props.t("takeBoth")}</IconText>
              </div>
            </section>
          );
        })}
      </div>
      <ToolStatus
        t={props.t}
        lang={props.lang}
        path={props.path}
        state={saving ? "working" : resolved === total ? "ready" : "conflict"}
        detail={`${props.t("mergeResolved")} ${resolved} / ${total}`}
      />
    </div>
  );
}

export function ToolStatus(props: { t: (key: string) => string; lang: Lang; path: string; state: "loading" | "working" | "ready" | "error" | "conflict"; detail: string }) {
  const busy = props.state === "loading" || props.state === "working";
  const warn = props.state === "error" || props.state === "conflict";
  const icon: IconName = busy ? "refresh" : warn ? "alert" : "status";
  const text = props.state === "loading" ? props.t("toolLoading") : props.state === "working" ? props.t("sbWorking") : props.state === "error" ? props.t("errorTitle") : props.state === "conflict" ? props.t("sbConflict") : props.t("sbReady");
  const file = props.path.split(/[/\\]/).pop() || props.path;
  return (
    <footer className="statusbar">
      <span className={`status-cell${warn ? " warn" : ""}${busy ? " busy" : ""}`}>
        <Icon name={icon} />
        <span>{text}</span>
      </span>
      {props.detail && (
        <span className="status-cell wide" title={props.detail}>
          <Icon name="list" />
          <span>{props.detail}</span>
        </span>
      )}
      {props.path && (
        <span className="status-cell wide" title={props.path}>
          <FileTypeIcon path={props.path} />
          <span>{file}</span>
        </span>
      )}
      <span className="status-end">
        <span className="status-cell" title={props.t("language")}>
          <Icon name="language" />
          <span>{props.lang === "ko" ? "한국어" : "English"}</span>
        </span>
      </span>
    </footer>
  );
}

function IconText(props: { icon: IconName; className?: string; disabled?: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" className={props.className} disabled={props.disabled} onClick={props.onClick}>
      <MenuGlyph name={props.icon} />
      {props.children}
    </button>
  );
}

function CodeLines(props: { lines: string[] }) {
  const lines = props.lines.length ? props.lines : [" "];
  return (
    <div className="code-lines">
      {lines.map((line, index) => <div key={index}>{line || " "}</div>)}
    </div>
  );
}

function MergePane(props: { title: string; lines: string[]; active: boolean }) {
  return (
    <div className={props.active ? "merge-pane active" : "merge-pane"}>
      <div>{props.title}</div>
      <CodeLines lines={props.lines} />
    </div>
  );
}
