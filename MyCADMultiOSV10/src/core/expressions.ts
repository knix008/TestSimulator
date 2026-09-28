// FreeCAD expression engine (parameters, units, functions) and macro runner.

export type Scope = Record<string, number>

const UNITS: Record<string, number> = {
  mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8,
  deg: 1, rad: 180 / Math.PI,
  kg: 1, g: 0.001
}

const FUNCTIONS: Record<string, (args: number[]) => number> = {
  sin: ([a]) => Math.sin((a * Math.PI) / 180),
  cos: ([a]) => Math.cos((a * Math.PI) / 180),
  tan: ([a]) => Math.tan((a * Math.PI) / 180),
  asin: ([a]) => (Math.asin(a) * 180) / Math.PI,
  acos: ([a]) => (Math.acos(a) * 180) / Math.PI,
  atan: ([a]) => (Math.atan(a) * 180) / Math.PI,
  atan2: ([a, b]) => (Math.atan2(a, b) * 180) / Math.PI,
  sqrt: ([a]) => Math.sqrt(a),
  abs: ([a]) => Math.abs(a),
  round: ([a]) => Math.round(a),
  floor: ([a]) => Math.floor(a),
  ceil: ([a]) => Math.ceil(a),
  trunc: ([a]) => Math.trunc(a),
  pow: ([a, b]) => Math.pow(a, b),
  exp: ([a]) => Math.exp(a),
  log: ([a]) => Math.log(a),
  log10: ([a]) => Math.log10(a),
  hypot: (args) => Math.hypot(...args),
  min: (args) => Math.min(...args),
  max: (args) => Math.max(...args),
  sum: (args) => args.reduce((acc, value) => acc + value, 0),
  average: (args) => (args.length ? args.reduce((acc, value) => acc + value, 0) / args.length : 0),
  count: (args) => args.length,
  mod: ([a, b]) => (b === 0 ? 0 : a % b)
}

const CONSTANTS: Scope = { pi: Math.PI, e: Math.E, true: 1, false: 0 }

type Token = { kind: 'number' | 'name' | 'op'; text: string; value?: number }

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  const pattern = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?)\s*([A-Za-z]+)?|([A-Za-z_][A-Za-z0-9_.]*)|(<=|>=|==|!=|&&|\|\||[()+\-*/%^,<>!]))/g
  let match: RegExpExecArray | null
  let cursor = 0
  while ((match = pattern.exec(source))) {
    if (match.index !== cursor) throw new Error(`수식 오류: ${source.slice(cursor, match.index).trim() || source}`)
    cursor = pattern.lastIndex
    if (match[1] !== undefined) {
      const unit = match[2]
      if (unit && !(unit.toLowerCase() in UNITS)) {
        tokens.push({ kind: 'number', text: match[1], value: Number(match[1]) })
        tokens.push({ kind: 'op', text: '*' })
        tokens.push({ kind: 'name', text: unit })
        continue
      }
      const factor = unit ? UNITS[unit.toLowerCase()] : 1
      tokens.push({ kind: 'number', text: match[0].trim(), value: Number(match[1]) * factor })
    } else if (match[3] !== undefined) {
      tokens.push({ kind: 'name', text: match[3] })
    } else {
      tokens.push({ kind: 'op', text: match[4] })
    }
  }
  if (cursor !== source.length && source.slice(cursor).trim() !== '') throw new Error(`수식 오류: ${source.slice(cursor).trim()}`)
  return tokens
}

/**
 * Evaluate a FreeCAD-style expression: `Width * 2 + sin(30) - Height / 4`,
 * with units (`10 mm`), comparison and logical operators.
 */
export function evaluateExpression(source: string, scope: Scope = {}): number {
  const tokens = tokenize(source.replace(/^=/, ''))
  let cursor = 0
  const peek = () => tokens[cursor]
  const eat = (text?: string) => {
    const token = tokens[cursor]
    if (!token) throw new Error('수식이 끝났습니다.')
    if (text && token.text !== text) throw new Error(`수식 오류: '${text}' 필요`)
    cursor += 1
    return token
  }
  const lookup = (name: string): number => {
    const merged: Scope = { ...CONSTANTS, ...scope }
    if (name in merged) return merged[name]
    const lower = Object.keys(merged).find((key) => key.toLowerCase() === name.toLowerCase())
    if (lower) return merged[lower]
    if (name.toLowerCase() in UNITS) return UNITS[name.toLowerCase()]
    throw new Error(`알 수 없는 이름: ${name}`)
  }

  const parsePrimary = (): number => {
    const token = peek()
    if (!token) throw new Error('수식이 비어 있습니다.')
    if (token.kind === 'number') {
      eat()
      return token.value ?? Number(token.text)
    }
    if (token.text === '(') {
      eat('(')
      const value = parseOr()
      eat(')')
      return value
    }
    if (token.text === '-') {
      eat('-')
      return -parsePrimary()
    }
    if (token.text === '+') {
      eat('+')
      return parsePrimary()
    }
    if (token.text === '!') {
      eat('!')
      return parsePrimary() === 0 ? 1 : 0
    }
    if (token.kind === 'name') {
      eat()
      if (peek()?.text === '(') {
        eat('(')
        const args: number[] = []
        if (peek()?.text !== ')') {
          args.push(parseOr())
          while (peek()?.text === ',') {
            eat(',')
            args.push(parseOr())
          }
        }
        eat(')')
        const fn = FUNCTIONS[token.text.toLowerCase()]
        if (!fn) throw new Error(`알 수 없는 함수: ${token.text}`)
        return fn(args)
      }
      return lookup(token.text)
    }
    throw new Error(`수식 오류: ${token.text}`)
  }

  // Exponentiation is right associative: 2 ^ 3 ^ 2 === 2 ^ (3 ^ 2).
  const parsePower = (): number => {
    const left = parsePrimary()
    if (peek()?.text !== '^') return left
    eat('^')
    return Math.pow(left, parsePower())
  }
  const parseFactor = (): number => {
    let left = parsePower()
    while (peek() && ['*', '/', '%'].includes(peek()!.text)) {
      const op = eat().text
      const right = parsePower()
      if (op === '*') left *= right
      else if (op === '/') left = right === 0 ? 0 : left / right
      else left = right === 0 ? 0 : left % right
    }
    return left
  }
  const parseTerm = (): number => {
    let left = parseFactor()
    while (peek() && ['+', '-'].includes(peek()!.text)) {
      const op = eat().text
      const right = parseFactor()
      left = op === '+' ? left + right : left - right
    }
    return left
  }
  const parseCompare = (): number => {
    let left = parseTerm()
    while (peek() && ['<', '>', '<=', '>=', '==', '!='].includes(peek()!.text)) {
      const op = eat().text
      const right = parseTerm()
      const result =
        op === '<' ? left < right :
        op === '>' ? left > right :
        op === '<=' ? left <= right :
        op === '>=' ? left >= right :
        op === '==' ? Math.abs(left - right) < 1e-9 :
        Math.abs(left - right) >= 1e-9
      left = result ? 1 : 0
    }
    return left
  }
  const parseAnd = (): number => {
    let left = parseCompare()
    while (peek()?.text === '&&') {
      eat('&&')
      const right = parseCompare()
      left = left !== 0 && right !== 0 ? 1 : 0
    }
    return left
  }
  const parseOr = (): number => {
    let left = parseAnd()
    while (peek()?.text === '||') {
      eat('||')
      const right = parseAnd()
      left = left !== 0 || right !== 0 ? 1 : 0
    }
    return left
  }

  const value = parseOr()
  if (cursor !== tokens.length) throw new Error(`수식 오류: ${tokens[cursor].text}`)
  return value
}

export function expressionNames(source: string): string[] {
  const names = new Set<string>()
  for (const token of tokenize(source.replace(/^=/, ''))) {
    if (token.kind === 'name' && !(token.text.toLowerCase() in FUNCTIONS) && !(token.text in CONSTANTS)) names.add(token.text)
  }
  return [...names]
}

export interface MacroCommand {
  name: string
  args: Array<number | string>
  line: number
}

/**
 * Parse a FreeCAD-style macro script into commands the UI can dispatch:
 * `box(40, 20, 10)`, `move(1, 0, 0)`, `pad(sketch, 12)`, `# comment`.
 */
export function parseMacro(source: string, scope: Scope = {}): MacroCommand[] {
  const commands: MacroCommand[] = []
  source.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) return
    const match = /^([A-Za-z_][A-Za-z0-9_.]*)\s*\((.*)\)\s*;?$/.exec(line)
    if (!match) throw new Error(`매크로 ${index + 1}행을 해석할 수 없습니다: ${line}`)
    const args = match[2].trim() === '' ? [] : splitArgs(match[2]).map((part) => {
      const text = part.trim()
      if (/^["'].*["']$/.test(text)) return text.slice(1, -1)
      try {
        return evaluateExpression(text, scope)
      } catch {
        return text
      }
    })
    commands.push({ name: match[1], args, line: index + 1 })
  })
  return commands
}

function splitArgs(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current.trim() !== '') parts.push(current)
  return parts
}
