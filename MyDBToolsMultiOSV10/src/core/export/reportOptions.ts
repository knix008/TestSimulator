// User-configurable layout of the generated reports: cover page, heading
// numbering, running header and footer, page numbers.
//
// Every document exporter reads this one object, so a setting means the same
// thing in Markdown, HTML, PDF and Word. Where a format genuinely cannot honour
// a setting the exporter degrades in a documented way rather than guessing —
// Markdown has no pages, so it carries the header and footer text once, at the
// top and the bottom, and no page numbers.
import type { DbSchema } from '../../types';
import { formatTimestamp } from './coverPage';
import { clampFontSize } from './reportFonts';

export type ReportAlign = 'left' | 'center' | 'right';
/** How section headings are numbered: none, `1.`/`1.1`, `1)`, or `I.`/`I.1`. */
export type HeadingNumberStyle = 'none' | 'decimal' | 'paren' | 'roman';
export type PageNumberPlacement = 'none' | 'header' | 'footer';

export interface ReportPrefs {
  // ── Typography ──────────────────────────────────────────────────────────
  /** Font family for the documents. Empty means the built-in stack. */
  FontFamily: string;
  /** Body size in points; headings scale from it. */
  FontSize: number;

  // ── Cover page ──────────────────────────────────────────────────────────
  CoverEnabled: boolean;
  /** Empty means "use the report's own title" (design vs analysis). */
  CoverTitle: string;
  /** Empty means "use the schema name". */
  CoverSubject: string;
  CoverOrganization: string;
  CoverAuthor: string;
  /** The label/value rows (target DB, table and relationship counts, date). */
  CoverShowDetails: boolean;
  CoverShowProjectPath: boolean;
  /** Footer line on the cover sheet. */
  CoverProducer: string;

  // ── Heading numbering ───────────────────────────────────────────────────
  HeadingNumberStyle: HeadingNumberStyle;

  // ── Running header / footer ─────────────────────────────────────────────
  HeaderEnabled: boolean;
  HeaderText: string;
  HeaderAlign: ReportAlign;
  FooterEnabled: boolean;
  FooterText: string;
  FooterAlign: ReportAlign;

  // ── Page numbers ────────────────────────────────────────────────────────
  PageNumberPlacement: PageNumberPlacement;
  PageNumberAlign: ReportAlign;
  /** `{page}` and `{total}` are substituted. */
  PageNumberFormat: string;
}

export const DEFAULT_REPORT_PREFS: ReportPrefs = {
  FontFamily: '',
  FontSize: 10,

  CoverEnabled: true,
  CoverTitle: '',
  CoverSubject: '',
  CoverOrganization: '',
  CoverAuthor: '',
  CoverShowDetails: true,
  CoverShowProjectPath: true,
  CoverProducer: 'DBTools',

  HeadingNumberStyle: 'none',

  HeaderEnabled: false,
  HeaderText: '{title}',
  HeaderAlign: 'center',
  FooterEnabled: false,
  FooterText: '{schema}',
  FooterAlign: 'center',

  PageNumberPlacement: 'none',
  PageNumberAlign: 'center',
  PageNumberFormat: '{page} / {total}',
};

const ALIGNS: ReportAlign[] = ['left', 'center', 'right'];
const NUMBER_STYLES: HeadingNumberStyle[] = ['none', 'decimal', 'paren', 'roman'];
const PLACEMENTS: PageNumberPlacement[] = ['none', 'header', 'footer'];

function pickString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function pickFrom<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === 'string' && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

/** Fill in anything the stored settings are missing or got wrong. */
export function normalizeReportPrefs(raw: unknown): ReportPrefs {
  const r = (raw ?? {}) as Record<string, unknown>;
  const d = DEFAULT_REPORT_PREFS;
  return {
    FontFamily: pickString(r.FontFamily, d.FontFamily),
    FontSize: clampFontSize(typeof r.FontSize === 'number' ? r.FontSize : d.FontSize),

    CoverEnabled: pickBoolean(r.CoverEnabled, d.CoverEnabled),
    CoverTitle: pickString(r.CoverTitle, d.CoverTitle),
    CoverSubject: pickString(r.CoverSubject, d.CoverSubject),
    CoverOrganization: pickString(r.CoverOrganization, d.CoverOrganization),
    CoverAuthor: pickString(r.CoverAuthor, d.CoverAuthor),
    CoverShowDetails: pickBoolean(r.CoverShowDetails, d.CoverShowDetails),
    CoverShowProjectPath: pickBoolean(r.CoverShowProjectPath, d.CoverShowProjectPath),
    CoverProducer: pickString(r.CoverProducer, d.CoverProducer),

    HeadingNumberStyle: pickFrom(r.HeadingNumberStyle, NUMBER_STYLES, d.HeadingNumberStyle),

    HeaderEnabled: pickBoolean(r.HeaderEnabled, d.HeaderEnabled),
    HeaderText: pickString(r.HeaderText, d.HeaderText),
    HeaderAlign: pickFrom(r.HeaderAlign, ALIGNS, d.HeaderAlign),
    FooterEnabled: pickBoolean(r.FooterEnabled, d.FooterEnabled),
    FooterText: pickString(r.FooterText, d.FooterText),
    FooterAlign: pickFrom(r.FooterAlign, ALIGNS, d.FooterAlign),

    PageNumberPlacement: pickFrom(r.PageNumberPlacement, PLACEMENTS, d.PageNumberPlacement),
    PageNumberAlign: pickFrom(r.PageNumberAlign, ALIGNS, d.PageNumberAlign),
    PageNumberFormat: pickString(r.PageNumberFormat, d.PageNumberFormat),
  };
}

// ─── Placeholders ────────────────────────────────────────────────────────────

export interface ReportContext {
  schema: DbSchema;
  /** The report's own title, e.g. "데이터베이스 분석 보고서". */
  title: string;
  projectPath?: string | null;
  now?: Date;
}

/**
 * Substitute `{schema}`, `{db}`, `{title}`, `{date}` and `{path}` in the header
 * and footer text. An unknown placeholder is left alone rather than blanked, so
 * a typo is visible in the output instead of silently eating the line.
 */
export function expandPlaceholders(text: string, context: ReportContext): string {
  const values: Record<string, string> = {
    schema: context.schema.Name ?? '',
    db: context.schema.TargetDb ?? '',
    title: context.title,
    date: formatTimestamp(context.now ?? new Date()),
    path: context.projectPath ?? '',
  };
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole,
  );
}

export function headerText(prefs: ReportPrefs, context: ReportContext): string | null {
  if (!prefs.HeaderEnabled) return null;
  const text = expandPlaceholders(prefs.HeaderText, context).trim();
  return text || null;
}

export function footerText(prefs: ReportPrefs, context: ReportContext): string | null {
  if (!prefs.FooterEnabled) return null;
  const text = expandPlaceholders(prefs.FooterText, context).trim();
  return text || null;
}

// ─── Heading numbering ───────────────────────────────────────────────────────

const ROMAN: [number, string][] = [
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

function toRoman(value: number): string {
  let n = value;
  let out = '';
  for (const [amount, numeral] of ROMAN) {
    while (n >= amount) {
      out += numeral;
      n -= amount;
    }
  }
  return out || String(value);
}

/**
 * Hands out section numbers as the document is built. `section()` starts a new
 * top-level heading, `sub()` a heading under the current one — mirroring the
 * h2/h3 structure the reports already use.
 */
export class HeadingNumberer {
  private top = 0;
  private child = 0;

  constructor(private readonly style: HeadingNumberStyle) {}

  get enabled(): boolean {
    return this.style !== 'none';
  }

  /** Next top-level number, e.g. `1.` — empty string when numbering is off. */
  section(): string {
    this.top += 1;
    this.child = 0;
    if (!this.enabled) return '';
    if (this.style === 'paren') return `${this.top})`;
    if (this.style === 'roman') return `${toRoman(this.top)}.`;
    return `${this.top}.`;
  }

  /** Next second-level number under the current section, e.g. `1.1`. */
  sub(): string {
    this.child += 1;
    if (!this.enabled) return '';
    const parent = this.style === 'roman' ? toRoman(this.top) : String(this.top);
    if (this.style === 'paren') return `${parent}.${this.child})`;
    return `${parent}.${this.child}`;
  }

  /** Prefix `label` with the next section number. */
  headSection(label: string): string {
    const n = this.section();
    return n ? `${n} ${label}` : label;
  }

  headSub(label: string): string {
    const n = this.sub();
    return n ? `${n} ${label}` : label;
  }
}

export function formatPageNumber(prefs: ReportPrefs, page: number, total: number): string {
  return prefs.PageNumberFormat.replace(/\{page\}/g, String(page)).replace(
    /\{total\}/g,
    String(total),
  );
}
