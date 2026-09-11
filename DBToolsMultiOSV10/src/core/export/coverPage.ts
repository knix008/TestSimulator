// The cover page shared by every document export (Markdown, HTML/PDF, Word,
// Excel). Defined once so the four formats stay in step.
import type { DbSchema } from '../../types';

export interface CoverInfo {
  /** Document title, e.g. "데이터베이스 설계 보고서". */
  heading: string;
  /** The schema name, shown as the main subject. */
  subject: string;
  /** Label/value rows under the title. */
  rows: { label: string; value: string }[];
  /** Footer line — the producing application. */
  producer: string;
}

export function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

export interface CoverOptions {
  projectPath?: string | null;
  now?: Date;
}

export function buildCover(schema: DbSchema, options: CoverOptions = {}): CoverInfo {
  const rows: { label: string; value: string }[] = [
    { label: '대상 데이터베이스', value: schema.TargetDb },
    { label: '테이블 수', value: String(schema.Tables.length) },
    { label: '관계 수', value: String(schema.Relationships.length) },
    { label: '작성 일시', value: formatTimestamp(options.now ?? new Date()) },
  ];
  if (options.projectPath && options.projectPath.trim()) {
    rows.push({ label: '프로젝트 파일', value: options.projectPath });
  }

  return {
    heading: '데이터베이스 설계 보고서',
    subject: schema.Name || '(이름 없음)',
    rows,
    producer: 'DBTools',
  };
}
