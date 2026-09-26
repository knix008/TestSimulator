// A small Python interpreter for macros, with a FreeCAD-shaped standard
// library (App, Part, Draft, math). It is a sandbox: no imports beyond the
// built-in modules, no file or network access, and a step budget that stops
// runaway loops.
import type { Solid } from './model'
import { createSolid } from './model'
import { booleanSolids, solidVolume } from './part'
import { makePrimitive, surfaceArea } from './primitives'
import { draftCircle, draftPolygon, draftRectangle, type Wire } from './draftwb'
import { pushPull } from './sketchup'

/* ───────────────────────────── tokenizer ────────────────────────────────── */

type TokenKind = 'number' | 'string' | 'name' | 'op' | 'newline' | 'indent' | 'dedent' | 'eof'

interface Token {
  kind: TokenKind
  value: string
  line: number
}

const OPERATORS = [
  '**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=',
  '+', '-', '*', '/', '%', '(', ')', '[', ']', '{', '}', ',', ':', '.', '=', '<', '>'
]

export function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  const indents: number[] = [0]
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  lines.forEach((raw, index) => {
    const line = index + 1
    const withoutComment = stripComment(raw)
    if (withoutComment.trim() === '') return
    const indentMatch = /^[ \t]*/.exec(withoutComment)
    const indent = (indentMatch ? indentMatch[0] : '').replace(/\t/g, '    ').length
    if (indent > indents[indents.length - 1]) {
      indents.push(indent)
      tokens.push({ kind: 'indent', value: '', line })
    }
    while (indent < indents[indents.length - 1]) {
      indents.pop()
      tokens.push({ kind: 'dedent', value: '', line })
    }
    let cursor = indent
    const text = withoutComment
    while (cursor < text.length) {
      const char = text[cursor]
      if (char === ' ' || char === '\t') {
        cursor += 1
        continue
      }
      if (char === '"' || char === "'") {
        let value = ''
        cursor += 1
        while (cursor < text.length && text[cursor] !== char) {
          if (text[cursor] === '\\' && cursor + 1 < text.length) {
            const next = text[cursor + 1]
            value += next === 'n' ? '\n' : next === 't' ? '\t' : next
            cursor += 2
            continue
          }
          value += text[cursor]
          cursor += 1
        }
        cursor += 1
        tokens.push({ kind: 'string', value, line })
        continue
      }
      if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(text[cursor + 1] ?? ''))) {
        let value = ''
        while (cursor < text.length && /[0-9._eE]/.test(text[cursor]) && !(text[cursor] === '.' && value.includes('.') && !/[eE]/.test(value))) {
          value += text[cursor]
          cursor += 1
        }
        tokens.push({ kind: 'number', value, line })
        continue
      }
      if (/[A-Za-z_]/.test(char)) {
        let value = ''
        while (cursor < text.length && /[A-Za-z0-9_]/.test(text[cursor])) {
          value += text[cursor]
          cursor += 1
        }
        tokens.push({ kind: 'name', value, line })
        continue
      }
      const operator = OPERATORS.find((candidate) => text.startsWith(candidate, cursor))
      if (!operator) throw new PythonError(`알 수 없는 문자 '${char}'`, line)
      tokens.push({ kind: 'op', value: operator, line })
      cursor += operator.length
    }
    tokens.push({ kind: 'newline', value: '', line })
  })
  while (indents.length > 1) {
    indents.pop()
    tokens.push({ kind: 'dedent', value: '', line: lines.length })
  }
  tokens.push({ kind: 'eof', value: '', line: lines.length })
  return tokens
}

function stripComment(line: string): string {
  let quote: string | null = null
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (quote) {
      if (char === '\\') i += 1
      else if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") quote = char
    else if (char === '#') return line.slice(0, i)
  }
  return line
}

export class PythonError extends Error {
  line: number
  constructor(message: string, line: number) {
    super(`Python ${line}행: ${message}`)
    this.line = line
  }
}

/* ────────────────────────────── parser ──────────────────────────────────── */

type Expression =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'none' }
  | { kind: 'name'; name: string }
  | { kind: 'list'; items: Expression[] }
  | { kind: 'dict'; entries: Array<[Expression, Expression]> }
  | { kind: 'unary'; operator: string; operand: Expression }
  | { kind: 'binary'; operator: string; left: Expression; right: Expression }
  | { kind: 'call'; target: Expression; args: Expression[] }
  | { kind: 'attribute'; target: Expression; name: string }
  | { kind: 'index'; target: Expression; index: Expression }

type Statement =
  | { kind: 'expression'; value: Expression; line: number }
  | { kind: 'assign'; target: Expression; value: Expression; operator: string; line: number }
  | { kind: 'if'; branches: Array<{ test: Expression | null; body: Statement[] }>; line: number }
  | { kind: 'for'; name: string; iterable: Expression; body: Statement[]; line: number }
  | { kind: 'while'; test: Expression; body: Statement[]; line: number }
  | { kind: 'def'; name: string; params: string[]; body: Statement[]; line: number }
  | { kind: 'return'; value: Expression | null; line: number }
  | { kind: 'import'; module: string; alias: string; line: number }
  | { kind: 'break'; line: number }
  | { kind: 'continue'; line: number }
  | { kind: 'pass'; line: number }

export function parse(source: string): Statement[] {
  const tokens = tokenize(source)
  let cursor = 0
  const peek = (offset = 0): Token => tokens[Math.min(cursor + offset, tokens.length - 1)]
  const next = (): Token => tokens[cursor++]
  const expect = (kind: TokenKind, value?: string): Token => {
    const token = next()
    if (token.kind !== kind || (value !== undefined && token.value !== value)) {
      throw new PythonError(`'${value ?? kind}'이(가) 필요합니다 (받은 값: '${token.value || token.kind}')`, token.line)
    }
    return token
  }
  const skipNewlines = () => {
    while (peek().kind === 'newline') next()
  }

  const parseBlock = (): Statement[] => {
    expect('op', ':')
    expect('newline')
    expect('indent')
    const body: Statement[] = []
    while (peek().kind !== 'dedent' && peek().kind !== 'eof') {
      skipNewlines()
      if (peek().kind === 'dedent' || peek().kind === 'eof') break
      body.push(parseStatement())
      skipNewlines()
    }
    if (peek().kind === 'dedent') next()
    return body
  }

  const parsePrimary = (): Expression => {
    const token = next()
    if (token.kind === 'number') return { kind: 'number', value: Number(token.value) }
    if (token.kind === 'string') return { kind: 'string', value: token.value }
    if (token.kind === 'name') {
      if (token.value === 'True') return { kind: 'bool', value: true }
      if (token.value === 'False') return { kind: 'bool', value: false }
      if (token.value === 'None') return { kind: 'none' }
      if (token.value === 'not') return { kind: 'unary', operator: 'not', operand: parseUnary() }
      return { kind: 'name', name: token.value }
    }
    if (token.kind === 'op') {
      if (token.value === '(') {
        const value = parseExpression()
        expect('op', ')')
        return value
      }
      if (token.value === '[') {
        const items: Expression[] = []
        if (peek().value !== ']') {
          items.push(parseExpression())
          while (peek().value === ',') {
            next()
            if (peek().value === ']') break
            items.push(parseExpression())
          }
        }
        expect('op', ']')
        return { kind: 'list', items }
      }
      if (token.value === '{') {
        const entries: Array<[Expression, Expression]> = []
        if (peek().value !== '}') {
          do {
            const key = parseExpression()
            expect('op', ':')
            entries.push([key, parseExpression()])
          } while (peek().value === ',' && next())
        }
        expect('op', '}')
        return { kind: 'dict', entries }
      }
      if (token.value === '-') return { kind: 'unary', operator: '-', operand: parseUnary() }
      if (token.value === '+') return parseUnary()
    }
    throw new PythonError(`예상하지 못한 토큰 '${token.value || token.kind}'`, token.line)
  }

  const parsePostfix = (): Expression => {
    let value = parsePrimary()
    for (;;) {
      const token = peek()
      if (token.kind === 'op' && token.value === '(') {
        next()
        const args: Expression[] = []
        if (peek().value !== ')') {
          args.push(parseExpression())
          while (peek().value === ',') {
            next()
            if (peek().value === ')') break
            args.push(parseExpression())
          }
        }
        expect('op', ')')
        value = { kind: 'call', target: value, args }
        continue
      }
      if (token.kind === 'op' && token.value === '.') {
        next()
        const name = expect('name')
        value = { kind: 'attribute', target: value, name: name.value }
        continue
      }
      if (token.kind === 'op' && token.value === '[') {
        next()
        const index = parseExpression()
        expect('op', ']')
        value = { kind: 'index', target: value, index }
        continue
      }
      return value
    }
  }

  function parseUnary(): Expression {
    const token = peek()
    if (token.kind === 'op' && token.value === '-') {
      next()
      return { kind: 'unary', operator: '-', operand: parseUnary() }
    }
    if (token.kind === 'name' && token.value === 'not') {
      next()
      return { kind: 'unary', operator: 'not', operand: parseUnary() }
    }
    return parsePostfix()
  }

  const binary = (operators: string[], nextLevel: () => Expression) => (): Expression => {
    let left = nextLevel()
    for (;;) {
      const token = peek()
      const matches = (token.kind === 'op' || token.kind === 'name') && operators.includes(token.value)
      if (!matches) return left
      next()
      left = { kind: 'binary', operator: token.value, left, right: nextLevel() }
    }
  }

  const parsePower = (): Expression => {
    const left = parseUnary()
    if (peek().kind === 'op' && peek().value === '**') {
      next()
      return { kind: 'binary', operator: '**', left, right: parsePower() }
    }
    return left
  }
  const parseFactor = binary(['*', '/', '//', '%'], parsePower)
  const parseTerm = binary(['+', '-'], parseFactor)
  const parseComparison = binary(['<', '>', '<=', '>=', '==', '!=', 'in'], parseTerm)
  const parseAnd = binary(['and'], parseComparison)
  const parseOr = binary(['or'], parseAnd)

  function parseExpression(): Expression {
    return parseOr()
  }

  function parseStatement(): Statement {
    const token = peek()
    const line = token.line
    if (token.kind === 'name') {
      if (token.value === 'if') {
        next()
        const branches: Array<{ test: Expression | null; body: Statement[] }> = []
        branches.push({ test: parseExpression(), body: parseBlock() })
        skipNewlines()
        while (peek().kind === 'name' && (peek().value === 'elif' || peek().value === 'else')) {
          const keyword = next().value
          if (keyword === 'elif') branches.push({ test: parseExpression(), body: parseBlock() })
          else branches.push({ test: null, body: parseBlock() })
          skipNewlines()
        }
        return { kind: 'if', branches, line }
      }
      if (token.value === 'for') {
        next()
        const name = expect('name').value
        expect('name', 'in')
        const iterable = parseExpression()
        return { kind: 'for', name, iterable, body: parseBlock(), line }
      }
      if (token.value === 'while') {
        next()
        const test = parseExpression()
        return { kind: 'while', test, body: parseBlock(), line }
      }
      if (token.value === 'def') {
        next()
        const name = expect('name').value
        expect('op', '(')
        const params: string[] = []
        if (peek().value !== ')') {
          params.push(expect('name').value)
          while (peek().value === ',') {
            next()
            params.push(expect('name').value)
          }
        }
        expect('op', ')')
        return { kind: 'def', name, params, body: parseBlock(), line }
      }
      if (token.value === 'return') {
        next()
        if (peek().kind === 'newline') {
          next()
          return { kind: 'return', value: null, line }
        }
        const value = parseExpression()
        if (peek().kind === 'newline') next()
        return { kind: 'return', value, line }
      }
      if (token.value === 'import' || token.value === 'from') {
        next()
        const module = expect('name').value
        let alias = module
        if (peek().kind === 'name' && peek().value === 'import') {
          next()
          alias = expect('name').value
        } else if (peek().kind === 'name' && peek().value === 'as') {
          next()
          alias = expect('name').value
        }
        if (peek().kind === 'newline') next()
        return { kind: 'import', module, alias, line }
      }
      if (token.value === 'break' || token.value === 'continue' || token.value === 'pass') {
        next()
        if (peek().kind === 'newline') next()
        return { kind: token.value as 'break' | 'continue' | 'pass', line }
      }
    }
    const value = parseExpression()
    const assign = peek()
    if (assign.kind === 'op' && ['=', '+=', '-=', '*=', '/='].includes(assign.value)) {
      next()
      const right = parseExpression()
      if (peek().kind === 'newline') next()
      return { kind: 'assign', target: value, value: right, operator: assign.value, line }
    }
    if (peek().kind === 'newline') next()
    return { kind: 'expression', value, line }
  }

  const program: Statement[] = []
  skipNewlines()
  while (peek().kind !== 'eof') {
    program.push(parseStatement())
    skipNewlines()
  }
  return program
}

/* ───────────────────────────── runtime ──────────────────────────────────── */

export interface PythonShape {
  __shape: true
  solid: Solid
  Volume: number
  Area: number
}

export interface PythonResult {
  output: string[]
  solids: Solid[]
  wires: Wire[]
  globals: Record<string, unknown>
  steps: number
}

class ReturnSignal {
  constructor(public value: unknown) {}
}
class BreakSignal {}
class ContinueSignal {}

interface PythonFunction {
  __function: true
  params: string[]
  body: Statement[]
  closure: Scope
}

type Scope = Map<string, unknown>

/** Run a Python macro and collect its output and the geometry it produced. */
export function runPython(source: string, options: { maxSteps?: number } = {}): PythonResult {
  const program = parse(source)
  const output: string[] = []
  const solids: Solid[] = []
  const wires: Wire[] = []
  let counter = 0
  const nextId = () => `py-${(counter += 1)}`
  const maxSteps = options.maxSteps ?? 200000
  let steps = 0

  const shape = (solid: Solid): PythonShape => ({
    __shape: true,
    solid,
    Volume: solidVolume(solid),
    Area: surfaceArea(solid)
  })

  const asShape = (value: unknown, line: number): PythonShape => {
    if (value && typeof value === 'object' && (value as PythonShape).__shape) return value as PythonShape
    throw new PythonError('형상(Shape)이 필요합니다', line)
  }

  const document = {
    Name: 'Unnamed',
    Objects: [] as unknown[],
    addObject: (...args: unknown[]) => {
      const name = String(args[1] ?? args[0] ?? 'Object')
      const object = { Name: name, Shape: null as unknown, Label: name }
      document.Objects.push(object)
      return object
    },
    recompute: () => {
      for (const object of document.Objects) {
        const holder = object as { Shape?: unknown }
        if (holder.Shape && (holder.Shape as PythonShape).__shape) {
          const solid = (holder.Shape as PythonShape).solid
          if (!solids.includes(solid)) solids.push(solid)
        }
      }
      return document.Objects.length
    }
  }

  const modules: Record<string, Record<string, unknown>> = {
    math: {
      pi: Math.PI,
      e: Math.E,
      sqrt: (x: number) => Math.sqrt(x),
      sin: (x: number) => Math.sin(x),
      cos: (x: number) => Math.cos(x),
      tan: (x: number) => Math.tan(x),
      atan2: (y: number, x: number) => Math.atan2(y, x),
      floor: (x: number) => Math.floor(x),
      ceil: (x: number) => Math.ceil(x),
      radians: (x: number) => (x * Math.PI) / 180,
      degrees: (x: number) => (x * 180) / Math.PI,
      pow: (x: number, y: number) => Math.pow(x, y),
      fabs: (x: number) => Math.abs(x)
    },
    App: {
      newDocument: (name?: string) => {
        document.Name = String(name ?? 'Unnamed')
        return document
      },
      ActiveDocument: document,
      Version: () => ['1', '0', '0']
    },
    Part: {
      makeBox: (l: number, w: number, h: number) => {
        const solid = createSolid('box', nextId(), solids.length + 1)
        solid.name = 'Box'
        solid.size = { ...solid.size, x: l, y: w, z: h }
        solid.position = { x: 0, y: w / 2, z: 0 }
        return shape(solid)
      },
      makeCylinder: (radius: number, height: number) => {
        const solid = createSolid('cylinder', nextId(), solids.length + 1)
        solid.name = 'Cylinder'
        solid.size = { ...solid.size, radius, y: height }
        solid.position = { x: 0, y: height / 2, z: 0 }
        return shape(solid)
      },
      makeSphere: (radius: number) => {
        const solid = createSolid('sphere', nextId(), solids.length + 1)
        solid.name = 'Sphere'
        solid.size = { ...solid.size, radius }
        solid.position = { x: 0, y: radius, z: 0 }
        return shape(solid)
      },
      makeCone: (radius: number, height: number) => {
        const solid = createSolid('cone', nextId(), solids.length + 1)
        solid.name = 'Cone'
        solid.size = { ...solid.size, radius, y: height }
        solid.position = { x: 0, y: height / 2, z: 0 }
        return shape(solid)
      },
      makeTorus: (radius: number, tube: number) => {
        const solid = createSolid('torus', nextId(), solids.length + 1)
        solid.name = 'Torus'
        solid.size = { ...solid.size, radius, tube }
        solid.position = { x: 0, y: radius, z: 0 }
        return shape(solid)
      },
      makePrism: (sides: number, radius: number, height: number) =>
        shape(makePrimitive('prism', nextId(), { sides, radius, height })),
      makeWedge: (width: number, height: number, depth: number) =>
        shape(makePrimitive('wedge', nextId(), { width, height, depth })),
      show: (value: unknown) => {
        const solid = asShape(value, 0).solid
        if (!solids.includes(solid)) solids.push(solid)
        return solid.name
      }
    },
    Draft: {
      makeRectangle: (width: number, height: number) => {
        const wire = draftRectangle(nextId(), width, height)
        wires.push(wire)
        return wire
      },
      makeCircle: (radius: number) => {
        const wire = draftCircle(nextId(), radius)
        wires.push(wire)
        return wire
      },
      makePolygon: (sides: number, radius: number) => {
        const wire = draftPolygon(nextId(), sides, radius)
        wires.push(wire)
        return wire
      },
      extrude: (wire: Wire, distance: number) => {
        const solid = pushPull(wire, distance, nextId())
        return shape(solid)
      }
    }
  }
  modules.FreeCAD = modules.App
  modules.Mesh = { show: modules.Part.show as () => string }

  const globals: Scope = new Map<string, unknown>()
  globals.set('print', (...args: unknown[]) => {
    output.push(args.map(format).join(' '))
    return null
  })
  globals.set('len', (value: unknown) => (Array.isArray(value) ? value.length : String(value).length))
  globals.set('range', (...args: number[]) => {
    const [start, stop, step] = args.length === 1 ? [0, args[0], 1] : args.length === 2 ? [args[0], args[1], 1] : args
    const out: number[] = []
    const increment = step || 1
    for (let value = start; increment > 0 ? value < stop : value > stop; value += increment) {
      out.push(value)
      if (out.length > 100000) break
    }
    return out
  })
  globals.set('abs', (value: number) => Math.abs(value))
  globals.set('round', (value: number, digits = 0) => Number(value.toFixed(digits)))
  globals.set('min', (...args: number[]) => Math.min(...args.flat() as number[]))
  globals.set('max', (...args: number[]) => Math.max(...args.flat() as number[]))
  globals.set('sum', (values: number[]) => values.reduce((acc, value) => acc + value, 0))
  globals.set('str', (value: unknown) => format(value))
  globals.set('int', (value: unknown) => Math.trunc(Number(value)))
  globals.set('float', (value: unknown) => Number(value))
  globals.set('list', (value: unknown) => (Array.isArray(value) ? [...value] : [value]))
  globals.set('App', modules.App)
  globals.set('FreeCAD', modules.App)
  globals.set('Part', modules.Part)
  globals.set('Draft', modules.Draft)
  globals.set('math', modules.math)
  globals.set('doc', document)

  function format(value: unknown): string {
    if (value === null || value === undefined) return 'None'
    if (typeof value === 'boolean') return value ? 'True' : 'False'
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)))
    if (Array.isArray(value)) return `[${value.map(format).join(', ')}]`
    if (typeof value === 'object' && (value as PythonShape).__shape) {
      const solidShape = value as PythonShape
      return `<Shape ${solidShape.solid.name} V=${solidShape.Volume.toFixed(1)}>`
    }
    if (typeof value === 'object') return '<object>'
    return String(value)
  }

  function lookup(scope: Scope, name: string, line: number): unknown {
    if (scope.has(name)) return scope.get(name)
    if (globals.has(name)) return globals.get(name)
    throw new PythonError(`이름을 찾을 수 없습니다: ${name}`, line)
  }

  function evaluate(expression: Expression, scope: Scope, line: number): unknown {
    steps += 1
    if (steps > maxSteps) throw new PythonError('실행 단계가 너무 많습니다', line)
    switch (expression.kind) {
      case 'number':
        return expression.value
      case 'string':
        return expression.value
      case 'bool':
        return expression.value
      case 'none':
        return null
      case 'name':
        return lookup(scope, expression.name, line)
      case 'list':
        return expression.items.map((item) => evaluate(item, scope, line))
      case 'dict': {
        const out: Record<string, unknown> = {}
        for (const [key, value] of expression.entries) out[String(evaluate(key, scope, line))] = evaluate(value, scope, line)
        return out
      }
      case 'unary': {
        const value = evaluate(expression.operand, scope, line)
        if (expression.operator === '-') return -Number(value)
        return !truthy(value)
      }
      case 'binary':
        return applyBinary(expression.operator, evaluate(expression.left, scope, line), evaluate(expression.right, scope, line), line)
      case 'attribute': {
        const target = evaluate(expression.target, scope, line) as Record<string, unknown>
        if (target === null || target === undefined) throw new PythonError('None 에는 속성이 없습니다', line)
        const value = (target as Record<string, unknown>)[expression.name]
        if (value === undefined && !(expression.name in target)) {
          throw new PythonError(`속성이 없습니다: ${expression.name}`, line)
        }
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
      }
      case 'index': {
        const target = evaluate(expression.target, scope, line)
        const index = evaluate(expression.index, scope, line)
        if (Array.isArray(target)) {
          const position = Number(index) < 0 ? target.length + Number(index) : Number(index)
          return target[position]
        }
        if (typeof target === 'string') return target[Number(index)]
        if (target && typeof target === 'object') return (target as Record<string, unknown>)[String(index)]
        throw new PythonError('인덱싱할 수 없습니다', line)
      }
      case 'call': {
        const callee = evaluate(expression.target, scope, line)
        const args = expression.args.map((arg) => evaluate(arg, scope, line))
        if (typeof callee === 'function') return (callee as (...values: unknown[]) => unknown)(...args)
        if (callee && (callee as PythonFunction).__function) return callFunction(callee as PythonFunction, args)
        throw new PythonError('호출할 수 없습니다', line)
      }
      default:
        throw new PythonError('알 수 없는 식', line)
    }
  }

  function applyBinary(operator: string, left: unknown, right: unknown, line: number): unknown {
    if (operator === 'in') {
      if (Array.isArray(right)) return right.includes(left)
      if (typeof right === 'string') return right.includes(String(left))
      return false
    }
    if (operator === 'and') return truthy(left) ? right : left
    if (operator === 'or') return truthy(left) ? left : right
    if (operator === '+' && (typeof left === 'string' || typeof right === 'string')) return `${format(left)}${format(right)}`
    if (operator === '+' && Array.isArray(left) && Array.isArray(right)) return [...left, ...right]
    // Shapes support the boolean operators through the Part API.
    if (left && (left as PythonShape).__shape && right && (right as PythonShape).__shape) {
      const a = (left as PythonShape).solid
      const b = (right as PythonShape).solid
      if (operator === '+') return makeShape(booleanSolids(a, b, 'union', nextId()))
      if (operator === '-') return makeShape(booleanSolids(a, b, 'cut', nextId()))
      if (operator === '*') return makeShape(booleanSolids(a, b, 'common', nextId()))
    }
    const a = Number(left)
    const b = Number(right)
    switch (operator) {
      case '+': return a + b
      case '-': return a - b
      case '*': return a * b
      case '/': return b === 0 ? 0 : a / b
      case '//': return b === 0 ? 0 : Math.floor(a / b)
      case '%': return b === 0 ? 0 : a % b
      case '**': return Math.pow(a, b)
      case '<': return a < b
      case '>': return a > b
      case '<=': return a <= b
      case '>=': return a >= b
      case '==': return left === right || a === b
      case '!=': return !(left === right || a === b)
      default:
        throw new PythonError(`알 수 없는 연산자 ${operator}`, line)
    }
  }

  function makeShape(solid: Solid): PythonShape {
    return shape(solid)
  }

  function truthy(value: unknown): boolean {
    if (value === null || value === undefined || value === false) return false
    if (typeof value === 'number') return value !== 0
    if (typeof value === 'string') return value.length > 0
    if (Array.isArray(value)) return value.length > 0
    return true
  }

  function assign(target: Expression, value: unknown, scope: Scope, line: number) {
    if (target.kind === 'name') {
      scope.set(target.name, value)
      return
    }
    if (target.kind === 'attribute') {
      const holder = evaluate(target.target, scope, line) as Record<string, unknown>
      holder[target.name] = value
      if (target.name === 'Shape' && value && (value as PythonShape).__shape) {
        const solid = (value as PythonShape).solid
        const label = holder.Label ?? holder.Name
        if (typeof label === 'string') solid.name = label
        if (!solids.includes(solid)) solids.push(solid)
      }
      return
    }
    if (target.kind === 'index') {
      const holder = evaluate(target.target, scope, line)
      const index = evaluate(target.index, scope, line)
      if (Array.isArray(holder)) holder[Number(index)] = value
      else if (holder && typeof holder === 'object') (holder as Record<string, unknown>)[String(index)] = value
      return
    }
    throw new PythonError('대입할 수 없습니다', line)
  }

  function callFunction(fn: PythonFunction, args: unknown[]): unknown {
    const scope: Scope = new Map(fn.closure)
    fn.params.forEach((param, index) => scope.set(param, args[index] ?? null))
    try {
      execute(fn.body, scope)
    } catch (signal) {
      if (signal instanceof ReturnSignal) return signal.value
      throw signal
    }
    return null
  }

  function execute(statements: Statement[], scope: Scope) {
    for (const statement of statements) {
      steps += 1
      if (steps > maxSteps) throw new PythonError('실행 단계가 너무 많습니다', statement.line)
      switch (statement.kind) {
        case 'expression':
          evaluate(statement.value, scope, statement.line)
          break
        case 'assign': {
          const value = statement.operator === '='
            ? evaluate(statement.value, scope, statement.line)
            : applyBinary(statement.operator[0], evaluate(statement.target, scope, statement.line), evaluate(statement.value, scope, statement.line), statement.line)
          assign(statement.target, value, scope, statement.line)
          break
        }
        case 'if': {
          for (const branch of statement.branches) {
            if (branch.test === null || truthy(evaluate(branch.test, scope, statement.line))) {
              execute(branch.body, scope)
              break
            }
          }
          break
        }
        case 'for': {
          const iterable = evaluate(statement.iterable, scope, statement.line)
          const values = Array.isArray(iterable) ? iterable : typeof iterable === 'string' ? [...iterable] : []
          for (const value of values) {
            scope.set(statement.name, value)
            try {
              execute(statement.body, scope)
            } catch (signal) {
              if (signal instanceof BreakSignal) break
              if (signal instanceof ContinueSignal) continue
              throw signal
            }
          }
          break
        }
        case 'while': {
          let guard = 0
          while (truthy(evaluate(statement.test, scope, statement.line))) {
            guard += 1
            if (guard > 100000) throw new PythonError('while 루프가 끝나지 않습니다', statement.line)
            try {
              execute(statement.body, scope)
            } catch (signal) {
              if (signal instanceof BreakSignal) break
              if (signal instanceof ContinueSignal) continue
              throw signal
            }
          }
          break
        }
        case 'def': {
          const fn: PythonFunction = { __function: true, params: statement.params, body: statement.body, closure: scope }
          scope.set(statement.name, fn)
          break
        }
        case 'return':
          throw new ReturnSignal(statement.value ? evaluate(statement.value, scope, statement.line) : null)
        case 'import': {
          const module = modules[statement.module]
          if (!module) throw new PythonError(`모듈을 가져올 수 없습니다: ${statement.module}`, statement.line)
          scope.set(statement.alias, module)
          break
        }
        case 'break':
          throw new BreakSignal()
        case 'continue':
          throw new ContinueSignal()
        case 'pass':
          break
      }
    }
  }

  const scope: Scope = new Map()
  try {
    execute(program, scope)
  } catch (signal) {
    if (!(signal instanceof ReturnSignal)) throw signal
  }
  document.recompute()

  const exported: Record<string, unknown> = {}
  scope.forEach((value, name) => { exported[name] = value })
  return { output, solids, wires, globals: exported, steps }
}
