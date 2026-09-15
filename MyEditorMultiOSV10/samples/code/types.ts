// TypeScript — interfaces, generics, enums, type guards
export interface Document {
  id: number;
  path: string | null;
  encoding: 'utf8' | 'utf16le' | 'cp949';
  dirty: boolean;
}

export enum Eol { CRLF = 'crlf', LF = 'lf', CR = 'cr' }

export function first<T>(items: readonly T[], predicate: (item: T) => boolean): T | undefined {
  for (const item of items) if (predicate(item)) return item;
  return undefined;
}

export const isDirty = (d: Document): d is Document & { dirty: true } => d.dirty;

const docs: Document[] = [{ id: 1, path: null, encoding: 'utf8', dirty: true }];
console.log(first(docs, isDirty)?.id ?? 'none', Eol.LF);
