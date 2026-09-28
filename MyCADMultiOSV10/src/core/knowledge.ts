// CATIA Knowledgeware: parameters, formulas, rules, checks, design tables.
import { evaluateExpression, type Scope } from './expressions'
import type { DesignParameter } from './catia'

export interface KnowledgeRule {
  id: string
  name: string
  /** condition expression, e.g. `Width > 100` */
  when: string
  /** assignments applied when the condition holds, e.g. `Height = Width / 2` */
  then: string[]
  /** assignments applied otherwise */
  otherwise?: string[]
}

export interface KnowledgeCheck {
  id: string
  name: string
  condition: string
  severity: 'information' | 'warning' | 'silent'
  message: string
}

export interface DesignTable {
  name: string
  columns: string[]
  rows: number[][]
  activeRow: number
}

export function parametersToScope(parameters: DesignParameter[]): Scope {
  const scope: Scope = {}
  for (const parameter of parameters) scope[parameter.name] = parameter.value
  return scope
}

/** Recompute every parameter whose formula is set, in dependency-tolerant passes. */
export function solveFormulas(parameters: DesignParameter[], passes = 8): DesignParameter[] {
  let current = parameters.map((parameter) => ({ ...parameter }))
  for (let pass = 0; pass < passes; pass++) {
    const scope = parametersToScope(current)
    let changed = false
    current = current.map((parameter) => {
      if (!parameter.formula) return parameter
      try {
        const value = evaluateExpression(parameter.formula, scope)
        if (Math.abs(value - parameter.value) > 1e-9) changed = true
        return { ...parameter, value }
      } catch {
        return parameter
      }
    })
    if (!changed) break
  }
  return current
}

export interface RuleResult {
  ruleId: string
  fired: boolean
  assignments: Array<{ name: string; value: number }>
  error?: string
}

/** Knowledgeware > Rule: `if (cond) { a = expr }` over the parameter set. */
export function applyRules(parameters: DesignParameter[], rules: KnowledgeRule[]): { parameters: DesignParameter[]; results: RuleResult[] } {
  let current = parameters.map((parameter) => ({ ...parameter }))
  const results: RuleResult[] = []
  for (const rule of rules) {
    const scope = parametersToScope(current)
    try {
      const fired = evaluateExpression(rule.when, scope) !== 0
      const body = fired ? rule.then : (rule.otherwise ?? [])
      const assignments: Array<{ name: string; value: number }> = []
      for (const statement of body) {
        const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(statement)
        if (!match) throw new Error(`규칙 구문 오류: ${statement}`)
        const value = evaluateExpression(match[2], parametersToScope(current))
        assignments.push({ name: match[1], value })
        const exists = current.some((parameter) => parameter.name === match[1])
        current = exists
          ? current.map((parameter) => (parameter.name === match[1] ? { ...parameter, value } : parameter))
          : [...current, { name: match[1], value, formula: '' }]
      }
      results.push({ ruleId: rule.id, fired, assignments })
    } catch (error) {
      results.push({ ruleId: rule.id, fired: false, assignments: [], error: (error as Error).message })
    }
  }
  return { parameters: current, results }
}

export interface CheckResult {
  checkId: string
  name: string
  passed: boolean
  severity: KnowledgeCheck['severity']
  message: string
}

/** Knowledgeware > Check: validate a design condition and report it. */
export function runChecks(parameters: DesignParameter[], checks: KnowledgeCheck[]): CheckResult[] {
  const scope = parametersToScope(parameters)
  return checks.map((check) => {
    try {
      const passed = evaluateExpression(check.condition, scope) !== 0
      return { checkId: check.id, name: check.name, passed, severity: check.severity, message: passed ? 'OK' : check.message }
    } catch (error) {
      return { checkId: check.id, name: check.name, passed: false, severity: check.severity, message: (error as Error).message }
    }
  })
}

/** Knowledgeware > Design table: apply one configuration row to the parameters. */
export function applyDesignTable(parameters: DesignParameter[], table: DesignTable, row = table.activeRow): DesignParameter[] {
  const values = table.rows[Math.max(0, Math.min(table.rows.length - 1, row))]
  if (!values) throw new Error('디자인 테이블: 행이 없습니다.')
  let current = parameters.map((parameter) => ({ ...parameter }))
  table.columns.forEach((column, index) => {
    const value = values[index]
    if (!Number.isFinite(value)) return
    const exists = current.some((parameter) => parameter.name === column)
    current = exists
      ? current.map((parameter) => (parameter.name === column ? { ...parameter, value } : parameter))
      : [...current, { name: column, value, formula: '' }]
  })
  return current
}

/** Parse a CSV design table: header row of parameter names, numeric rows. */
export function parseDesignTable(text: string, name = 'DesignTable'): DesignTable {
  const rows = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#'))
  if (rows.length < 2) throw new Error('디자인 테이블: 헤더와 데이터 행이 필요합니다.')
  const columns = rows[0].split(/[,;\t]/).map((cell) => cell.trim()).filter(Boolean)
  const data = rows.slice(1).map((row) => row.split(/[,;\t]/).map((cell) => Number(cell.trim())))
  return { name, columns, rows: data, activeRow: 0 }
}

export function designTableToCsv(table: DesignTable): string {
  return [table.columns.join(','), ...table.rows.map((row) => row.join(','))].join('\n')
}

/** Knowledgeware > Parameter set listing used by the specification tree. */
export function knowledgeTree(parameters: DesignParameter[], rules: KnowledgeRule[], checks: KnowledgeCheck[]): string[] {
  const lines = ['Relations']
  for (const parameter of parameters) {
    lines.push(`  ${parameter.name} = ${parameter.value}${parameter.formula ? ` (${parameter.formula})` : ''}`)
  }
  for (const rule of rules) lines.push(`  Rule.${rule.name}: if ${rule.when}`)
  for (const check of checks) lines.push(`  Check.${check.name}: ${check.condition}`)
  return lines
}

/** Keyboard shortcuts, the way FreeCAD's help lists them. */
export const SHORTCUTS: Array<{ keys: string; ko: string; en: string }> = [
  { keys: 'Ctrl+S', ko: '저장', en: 'Save' },
  { keys: 'Ctrl+Z', ko: '되돌리기', en: 'Undo' },
  { keys: 'Ctrl+Y', ko: '다시 실행', en: 'Redo' },
  { keys: 'Ctrl+C', ko: '복사', en: 'Copy' },
  { keys: 'Ctrl+V', ko: '붙여넣기', en: 'Paste' },
  { keys: 'Ctrl+P', ko: '인쇄', en: 'Print' },
  { keys: 'Delete', ko: '선택 삭제', en: 'Delete selection' },
  { keys: 'Escape', ko: '열린 메뉴 닫기', en: 'Close the open menu' },
  { keys: 'Ctrl+Wheel', ko: '확대 / 축소', en: 'Zoom in and out' },
  { keys: 'Drag', ko: '선택한 객체 이동', en: 'Move the picked solid' },
  { keys: 'Shift+Drag', ko: '객체를 위아래로 이동', en: 'Move the solid vertically' },
  { keys: 'Alt+Drag', ko: '스냅 없이 이동', en: 'Move without snapping' },
  { keys: 'Right drag', ko: '화면 이동', en: 'Pan the view' }
]

export function shortcutLines(lang: 'ko' | 'en'): string[] {
  return SHORTCUTS.map((item) => `${item.keys.padEnd(12)} ${lang === 'ko' ? item.ko : item.en}`)
}

/** Licence summary shown by Help > License. */
export function licenseLines(lang: 'ko' | 'en'): string[] {
  const ko = [
    'MyCAD 는 MIT 라이선스로 배포됩니다.',
    '',
    '이 소프트웨어를 누구나 무료로 사용, 복사, 수정, 배포할 수 있으며',
    '저작권 표시와 이 허가 문구를 함께 포함해야 합니다.',
    '소프트웨어는 어떠한 보증도 없이 "있는 그대로" 제공됩니다.',
    '',
    'FreeCAD(LGPL-2.1), CATIA, SketchUp 은 각 권리자의 상표이며',
    'MyCAD 는 그 동작 방식을 참고한 독립 구현입니다.',
    '사용한 오픈소스: three.js(MIT), React(MIT), Electron(MIT), Vite(MIT).'
  ]
  const en = [
    'MyCAD is distributed under the MIT licence.',
    '',
    'Permission is granted, free of charge, to use, copy, modify and',
    'distribute this software, provided the copyright notice and this',
    'permission notice are included.',
    'The software is provided "as is", without warranty of any kind.',
    '',
    'FreeCAD (LGPL-2.1), CATIA and SketchUp are trademarks of their',
    'owners; MyCAD is an independent implementation inspired by them.',
    'Open source used: three.js (MIT), React (MIT), Electron (MIT), Vite (MIT).'
  ]
  return lang === 'ko' ? ko : en
}
