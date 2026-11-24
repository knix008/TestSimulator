// Port of Analysis/NormalizationAnalyzer.cs
import type { DbColumn, DbSchema, DbTable } from '../../types';

export type NormalizationLevel = 'NF1' | 'NF2' | 'NF3' | 'BCNF' | 'NF4' | 'NF5';
export type IssueSeverity = 'Error' | 'Warning' | 'Info';

export const ALL_LEVELS: NormalizationLevel[] = ['NF1', 'NF2', 'NF3', 'BCNF', 'NF4', 'NF5'];

export interface NormalizationIssue {
  Level: NormalizationLevel;
  Severity: IssueSeverity;
  Table: string;
  AffectedColumns: string;
  Message: string;
  Hint: string;
}

export function getLevelLabel(level: NormalizationLevel): string {
  switch (level) {
    case 'NF1':
      return '1NF';
    case 'NF2':
      return '2NF';
    case 'NF3':
      return '3NF';
    case 'BCNF':
      return 'BCNF';
    case 'NF4':
      return '4NF';
    case 'NF5':
      return '5NF';
    default:
      return level;
  }
}

export function formatLevelsLabel(levels: NormalizationLevel[]): string {
  if (!levels || levels.length === 0) return '1NF';
  return ALL_LEVELS.filter((l) => levels.includes(l))
    .map(getLevelLabel)
    .join(' · ');
}

/** Cumulative set for a "up to this level" selection (legacy settings migration). */
export function cumulativeLevelsUpTo(level: NormalizationLevel): NormalizationLevel[] {
  const index = ALL_LEVELS.indexOf(level);
  return index < 0 ? ['NF1'] : ALL_LEVELS.slice(0, index + 1);
}

function endsWithAny(name: string, suffixes: string[]): boolean {
  const lower = name.toLowerCase();
  return suffixes.some((s) => lower.endsWith(s));
}

function isMultiValuedAttributeColumn(col: DbColumn): boolean {
  if (
    endsWithAny(col.Name, [
      '_list',
      '_tags',
      '_skills',
      '_items',
      '_hobbies',
      '_categories',
      '_options',
    ])
  ) {
    return true;
  }
  const t = (col.DataType || '').toUpperCase();
  return t === 'JSON' || t === 'JSONB' || t === 'ARRAY';
}

function detectRepeatingGroups(names: string[]): string[][] {
  const groups: string[][] = [];
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name.toLowerCase())) continue;
    let i = name.length - 1;
    while (i >= 0 && name[i] >= '0' && name[i] <= '9') i--;
    if (i === name.length - 1) continue;
    const prefix = name.substring(0, i + 1);
    const matches = names.filter(
      (n) =>
        n.toLowerCase().startsWith(prefix.toLowerCase()) &&
        n.length > prefix.length &&
        [...n.substring(prefix.length)].every((c) => c >= '0' && c <= '9'),
    );
    if (matches.length < 2) continue;
    groups.push(matches);
    for (const m of matches) seen.add(m.toLowerCase());
  }
  return groups;
}

/**
 * Relationships where `table` is the child — it holds the foreign key.
 * Source is the parent/PK end, Target the child/FK end (see core/schema.ts).
 */
function getOutgoingRelationships(table: DbTable, schema: DbSchema) {
  return schema.Relationships.filter((r) => r.TargetTableId === table.Id);
}

function getOutgoingForeignKeyColumnIds(table: DbTable, schema: DbSchema): Set<string> {
  return new Set(getOutgoingRelationships(table, schema).map((r) => r.TargetColumnId));
}

function check1NF(table: DbTable, issues: NormalizationIssue[]): void {
  if (!table.Columns.some((c) => c.IsPrimaryKey)) {
    issues.push({
      Level: 'NF1',
      Severity: 'Error',
      Table: table.Name,
      AffectedColumns: '(테이블 전체)',
      Message: '기본 키(PK)가 없습니다.',
      Hint: '모든 테이블은 행을 유일하게 식별하는 기본 키를 가져야 합니다.',
    });
  }

  for (const group of detectRepeatingGroups(table.Columns.map((c) => c.Name))) {
    issues.push({
      Level: 'NF1',
      Severity: 'Warning',
      Table: table.Name,
      AffectedColumns: group.join(', '),
      Message: '반복 그룹 컬럼이 감지되었습니다.',
      Hint: '반복되는 데이터는 별도 테이블로 분리하는 것이 1NF 원칙에 부합합니다.',
    });
  }

  const nonAtomic = table.Columns.filter((c) => {
    if (endsWithAny(c.Name, ['list', 'tags', '_csv', '_json'])) return true;
    const t = (c.DataType || '').toUpperCase();
    return t === 'JSON' || t === 'JSONB' || t === 'ARRAY';
  });
  for (const col of nonAtomic) {
    issues.push({
      Level: 'NF1',
      Severity: 'Info',
      Table: table.Name,
      AffectedColumns: col.Name,
      Message: `원자적이지 않은 값을 저장할 수 있는 타입입니다 (${col.DataType}).`,
      Hint: '1NF는 각 셀에 단일 원자값을 요구합니다. 별도 테이블 또는 조인 테이블을 검토하세요.',
    });
  }
}

function check2NF(table: DbTable, _schema: DbSchema, issues: NormalizationIssue[]): void {
  const pks = table.Columns.filter((c) => c.IsPrimaryKey);
  if (pks.length >= 2) {
    issues.push({
      Level: 'NF2',
      Severity: 'Warning',
      Table: table.Name,
      AffectedColumns: pks.map((c) => c.Name).join(', '),
      Message: '복합 기본 키가 있습니다.',
      Hint:
        '비키 속성이 복합 PK의 일부에만 종속(부분 종속)되어 있는지 검토하세요. 부분 종속이 있다면 해당 속성을 별도 테이블로 분리하십시오.',
    });
  }
}

function check3NF(table: DbTable, schema: DbSchema, issues: NormalizationIssue[]): void {
  const pkCols = new Set(table.Columns.filter((c) => c.IsPrimaryKey).map((c) => c.Id));
  const fkColIds = getOutgoingForeignKeyColumnIds(table, schema);
  const candidates = table.Columns.filter(
    (c) =>
      !pkCols.has(c.Id) &&
      !fkColIds.has(c.Id) &&
      endsWithAny(c.Name, ['_name', '_title', '_code', '_label']),
  );
  if (candidates.length === 0) return;

  for (const col of candidates) {
    const prefix = col.Name.substring(0, col.Name.lastIndexOf('_'));
    const hasIdSibling = table.Columns.some(
      (c) => c.Name.toLowerCase() === `${prefix.toLowerCase()}_id` && !pkCols.has(c.Id),
    );
    if (hasIdSibling) {
      issues.push({
        Level: 'NF3',
        Severity: 'Warning',
        Table: table.Name,
        AffectedColumns: `${prefix}_id, ${col.Name}`,
        Message: '비키 속성 간 이행 종속 가능성이 있습니다.',
        Hint: `'${prefix}_id' → '${col.Name}' 관계가 비키 속성 간 이행 종속이면 '${prefix}' 엔티티를 별도 테이블로 분리하세요.`,
      });
    }
  }
}

function checkBCNF(table: DbTable, _schema: DbSchema, issues: NormalizationIssue[]): void {
  // Heuristic: a non-PK "*_id" column that also determines sibling attributes
  // is a candidate non-superkey determinant.
  const pkIds = new Set(table.Columns.filter((c) => c.IsPrimaryKey).map((c) => c.Id));
  const nonPkCols = table.Columns.filter((c) => !pkIds.has(c.Id));

  for (const col of nonPkCols) {
    if (!col.Name.toLowerCase().endsWith('_id')) continue;
    const prefix = col.Name.substring(0, col.Name.length - 3);
    const hasDependent = nonPkCols.some(
      (c) =>
        c.Id !== col.Id &&
        (c.Name.toLowerCase().startsWith(`${prefix.toLowerCase()}_`) ||
          c.Name.toLowerCase() === prefix.toLowerCase()),
    );
    if (hasDependent) {
      issues.push({
        Level: 'BCNF',
        Severity: 'Warning',
        Table: table.Name,
        AffectedColumns: col.Name,
        Message: `비슈퍼키 결정자 가능성: '${col.Name}'이 관련 속성을 결정합니다.`,
        Hint: `'${col.Name}' 관련 속성들을 별도의 테이블로 분리하면 BCNF를 만족할 수 있습니다.`,
      });
    }
  }
}

function check4NF(table: DbTable, schema: DbSchema, issues: NormalizationIssue[]): void {
  const pkIds = new Set(table.Columns.filter((c) => c.IsPrimaryKey).map((c) => c.Id));
  const fkColIds = getOutgoingForeignKeyColumnIds(table, schema);

  const multiValuedCols = table.Columns.filter(
    (c) => !pkIds.has(c.Id) && isMultiValuedAttributeColumn(c),
  );
  if (multiValuedCols.length >= 2) {
    issues.push({
      Level: 'NF4',
      Severity: 'Warning',
      Table: table.Name,
      AffectedColumns: multiValuedCols.map((c) => c.Name).join(', '),
      Message: '독립적인 다중값 속성이 한 테이블에 함께 있습니다.',
      Hint:
        '4NF는 비자명 다중값 종속(MVD)이 없어야 합니다. 각 다중값 사실을 별도 테이블 또는 조인 테이블로 분리하세요.',
    });
  }

  const pkCols = table.Columns.filter((c) => c.IsPrimaryKey);
  if (pkCols.length === 2 && pkCols.every((c) => fkColIds.has(c.Id))) {
    const extraCols = table.Columns.filter((c) => !pkIds.has(c.Id) && !fkColIds.has(c.Id));
    if (extraCols.length > 0) {
      issues.push({
        Level: 'NF4',
        Severity: 'Warning',
        Table: table.Name,
        AffectedColumns: extraCols.map((c) => c.Name).join(', '),
        Message: '조인 테이블에 관계 외 속성이 포함되어 있습니다.',
        Hint:
          '두 엔티티 간 다중값 관계만 저장해야 한다면 추가 속성을 별도 테이블로 분리해 4NF를 만족하는지 검토하세요.',
      });
    }
  }

  const outgoing = getOutgoingRelationships(table, schema);
  const fkOutsidePk = new Set(
    outgoing.filter((r) => !pkIds.has(r.TargetColumnId)).map((r) => r.TargetColumnId),
  );
  if (pkCols.length >= 2 && fkOutsidePk.size >= 2) {
    const distinctParents = new Set(
      outgoing.filter((r) => fkOutsidePk.has(r.TargetColumnId)).map((r) => r.SourceTableId),
    );
    if (distinctParents.size >= 2) {
      const fkNames = table.Columns.filter((c) => fkOutsidePk.has(c.Id)).map((c) => c.Name);
      issues.push({
        Level: 'NF4',
        Severity: 'Info',
        Table: table.Name,
        AffectedColumns: fkNames.join(', '),
        Message: '복합 키 테이블에 독립적인 다중값 관계가 함께 표현된 것으로 보입니다.',
        Hint: '서로 독립적인 다중값 사실은 각각 별도 조인 테이블로 분리하면 4NF에 가깝습니다.',
      });
    }
  }
}

function check5NF(table: DbTable, schema: DbSchema, issues: NormalizationIssue[]): void {
  const pkCols = table.Columns.filter((c) => c.IsPrimaryKey);
  const pkIds = new Set(pkCols.map((c) => c.Id));
  const outgoing = getOutgoingRelationships(table, schema);

  if (pkCols.length >= 3) {
    const pkParentTables = new Set(
      outgoing.filter((r) => pkIds.has(r.TargetColumnId)).map((r) => r.SourceTableId),
    );
    if (pkParentTables.size >= 3) {
      issues.push({
        Level: 'NF5',
        Severity: 'Warning',
        Table: table.Name,
        AffectedColumns: pkCols.map((c) => c.Name).join(', '),
        Message: '3개 이상 엔티티를 연결하는 복합 키 테이블입니다.',
        Hint:
          '삼진(triadic) 사실은 조인 종속으로 분해할 수 있는지 검토하세요. 5NF를 만족하려면 조인으로 복원 가능한 테이블을 더 작은 관계로 나누는 것이 좋습니다.',
      });
    }
  }

  const parentTables = new Set(outgoing.map((r) => r.SourceTableId));
  if (parentTables.size >= 3) {
    const fkOutsidePk = outgoing.filter((r) => !pkIds.has(r.TargetColumnId)).length;
    if (pkCols.length < 3 || fkOutsidePk > 0) {
      const fkNames = [
        ...new Set(
          outgoing
            .map((r) => table.Columns.find((c) => c.Id === r.TargetColumnId)?.Name)
            .filter((n): n is string => !!n)
            .map((n) => n),
        ),
      ];
      issues.push({
        Level: 'NF5',
        Severity: 'Info',
        Table: table.Name,
        AffectedColumns: fkNames.join(', '),
        Message: '3개 이상의 엔티티를 한 테이블에서 동시에 참조합니다.',
        Hint:
          '이 테이블이 여러 이진 관계의 조인으로 복원 가능하다면, 5NF 관점에서 관계를 분해하는 설계를 검토하세요.',
      });
    }
  }

  const hasManyToMany = schema.Relationships.some(
    (r) => r.Type === 'ManyToMany' && (r.SourceTableId === table.Id || r.TargetTableId === table.Id),
  );
  if (hasManyToMany && table.Columns.filter((c) => !pkIds.has(c.Id)).length >= 3) {
    issues.push({
      Level: 'NF5',
      Severity: 'Info',
      Table: table.Name,
      AffectedColumns: '(테이블 전체)',
      Message: '다대다 관계 주변에 복합 사실이 한 테이블에 모여 있을 수 있습니다.',
      Hint:
        'N:M 관계와 부가 속성이 결합·조인 종속을 만들지 않는지 확인하고, 필요하면 중간 테이블을 더 분해하세요.',
    });
  }
}

const CHECKS: Record<NormalizationLevel, (t: DbTable, s: DbSchema, i: NormalizationIssue[]) => void> = {
  NF1: (t, _s, i) => check1NF(t, i),
  NF2: check2NF,
  NF3: check3NF,
  BCNF: checkBCNF,
  NF4: check4NF,
  NF5: check5NF,
};

/** Run only the selected normal forms (port of AnalyzeLevels). */
export function analyzeLevels(schema: DbSchema, levels: NormalizationLevel[]): NormalizationIssue[] {
  const active = levels && levels.length > 0 ? levels : (['NF1'] as NormalizationLevel[]);
  const issues: NormalizationIssue[] = [];
  for (const table of schema.Tables) {
    for (const level of ALL_LEVELS) {
      if (active.includes(level)) CHECKS[level](table, schema, issues);
    }
  }
  return issues;
}

/** Run every normal form up to and including `level` (port of AnalyzeLevel). */
export function analyzeLevel(schema: DbSchema, level: NormalizationLevel): NormalizationIssue[] {
  return analyzeLevels(schema, cumulativeLevelsUpTo(level));
}

/** Port of NormalizationAnalyzer.Analyze — the full 1NF..5NF sweep. */
export function analyze(schema: DbSchema): NormalizationIssue[] {
  return analyzeLevel(schema, 'NF5');
}

/** True when no Error-severity issue exists at or below the given level. */
export function levelPasses(schema: DbSchema, level: NormalizationLevel): boolean {
  const maxIndex = ALL_LEVELS.indexOf(level);
  return !analyzeLevel(schema, level).some(
    (i) => i.Severity === 'Error' && ALL_LEVELS.indexOf(i.Level) <= maxIndex,
  );
}
