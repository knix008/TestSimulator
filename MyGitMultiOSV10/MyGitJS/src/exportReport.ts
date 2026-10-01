import type { CommitInfo, Summary, WorkState } from "./api";
import { renderCsv, renderDocx, renderMarkdown, renderXlsx, reportFilename, type Report, type ReportFormat } from "../core/report.js";
import { renderPrintHtml, type PageSetup } from "../core/printLayout.js";

type Translate = (key: string) => string;

export function buildHistoryReport(input: {
  t: Translate;
  summary: Summary;
  commits: CommitInfo[];
  filter: string;
  query: string;
  work: WorkState | null;
}): Report {
  const query = input.query.trim().toLowerCase();
  const commits = query
    ? input.commits.filter((commit) => commit.subject.toLowerCase().includes(query)
      || commit.authorName.toLowerCase().includes(query)
      || commit.sha.toLowerCase().startsWith(query))
    : input.commits;
  const t = input.t;
  const summary = [
    { label: t("path"), value: input.summary.path },
    { label: t("reportBranch"), value: input.summary.branch ?? "HEAD" },
    { label: t("reportRemote"), value: input.summary.remoteUrl || t("empty") },
    { label: t("reportCommitCount"), value: String(input.summary.commitCount) },
    { label: t("reportListed"), value: String(commits.length) },
  ];
  if (input.filter) summary.push({ label: t("reportFilter"), value: input.filter });
  if (query) summary.push({ label: t("reportSearch"), value: input.query.trim() });
  if (input.work?.upstream) {
    summary.push({ label: t("reportUpstream"), value: input.work.upstream });
    summary.push({ label: t("reportAhead"), value: String(input.work.ahead) });
    summary.push({ label: t("reportBehind"), value: String(input.work.behind) });
  }
  if (input.work) {
    summary.push(
      { label: t("sbStaged"), value: String(input.work.staged) },
      { label: t("sbModified"), value: String(input.work.modified) },
      { label: t("sbDeleted"), value: String(input.work.deleted) },
      { label: t("sbUntracked"), value: String(input.work.untracked) },
      { label: t("sbConflict"), value: String(input.work.conflicted) },
      { label: t("sbUnpushed"), value: String(input.work.unpushed) },
    );
  }
  return {
    title: t("reportTitle"),
    filename: "MyGit-history",
    generatedAt: new Date().toISOString(),
    summary,
    tables: [
      {
        title: t("reportContributors"),
        headers: [t("author"), t("sbCommits")],
        rows: input.summary.contributors.map((item) => [item.name, String(item.commits)]),
      },
      {
        title: t("reportHistory"),
        headers: [t("sha"), t("date"), t("author"), t("colEmail"), t("message"), t("colRefs")],
        rows: commits.map((commit) => [
          commit.sha,
          commit.date.replace("T", " ").replace(/\.\d+Z?$/, "").replace(/Z$/, ""),
          commit.authorName,
          commit.authorEmail,
          commit.subject,
          commit.refs.join(", "),
        ]),
      },
    ],
  };
}

export function buildStatusReport(input: { t: Translate; summary: Summary; text: string }): Report {
  const history = buildHistoryReport({ ...input, commits: [], filter: "", query: "", work: null });
  return {
    ...history,
    title: input.t("statusTitle"),
    filename: "MyGit-status",
    tables: history.tables.slice(0, 1),
    text: { title: input.t("statusTitle"), body: input.text },
  };
}

export async function downloadReport(report: Report, format: ReportFormat): Promise<void> {
  const name = reportFilename(report, format);
  if (format === "pdf") {
    const response = await fetch("/api/report/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error || "PDF");
    }
    saveBlob(name, await response.blob());
    return;
  }
  const bytes = format === "md" ? renderMarkdown(report)
    : format === "csv" ? renderCsv(report)
      : format === "docx" ? renderDocx(report)
        : renderXlsx(report);
  const type = format === "md" ? "text/markdown"
    : format === "csv" ? "text/csv"
      : format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const blob = typeof bytes === "string"
    ? new Blob([bytes], { type: `${type};charset=utf-8` })
    : new Blob([Uint8Array.from(bytes)], { type });
  saveBlob(name, blob);
}

export function printReport(report: Report, setup: PageSetup): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("style", "position:fixed;right:0;bottom:0;width:0;height:0;border:0");
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(renderPrintHtml(report, setup));
  doc.close();
  let printed = false;
  const run = () => {
    if (printed) return;
    printed = true;
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1500);
  };
  frame.onload = run;
  window.setTimeout(run, 300);
}

function saveBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
