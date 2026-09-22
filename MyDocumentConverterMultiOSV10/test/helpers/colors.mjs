// ANSI colours for the test reports. Off when NO_COLOR is set or the output
// is not a terminal, unless FORCE_COLOR asks for them (the test runner sets
// it for the children whose output it relays).
const enabled = !process.env.NO_COLOR && (Boolean(process.env.FORCE_COLOR) && process.env.FORCE_COLOR !== '0' || Boolean(process.stdout.isTTY))

const wrap = (open, close) => (text) => (enabled ? `\x1b[${open}m${text}\x1b[${close}m` : String(text))

export const bold = wrap(1, 22)
export const dim = wrap(2, 22)
export const red = wrap(31, 39)
export const green = wrap(32, 39)
export const yellow = wrap(33, 39)
export const blue = wrap(34, 39)
export const magenta = wrap(35, 39)
export const cyan = wrap(36, 39)
export const white = wrap(97, 39)
export const bgGreen = wrap('42;30', 0)
export const bgRed = wrap('41;97', 0)
export const bgBlue = wrap('44;97', 0)

export const PASS = green('✔')
export const FAIL = red('✘')

/** `passed / total` coloured by outcome. */
export function ratio(passed, total) {
  const text = `${String(passed).padStart(3)} / ${String(total).padStart(3)}`
  if (total === 0) return dim(text)
  return passed === total ? green(text) : red(text)
}

/** A small bar: ██████░░░░ 60% */
export function bar(passed, total, width = 20) {
  if (total === 0) return dim('░'.repeat(width))
  const filled = Math.round((passed / total) * width)
  const paint = passed === total ? green : passed / total >= 0.5 ? yellow : red
  return `${paint('█'.repeat(filled))}${dim('░'.repeat(width - filled))} ${paint(`${Math.round((passed / total) * 100)}%`)}`
}

export function banner(text, ok) {
  const pad = ` ${text} `
  return ok ? bgGreen(bold(pad)) : bgRed(bold(pad))
}

export function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-9;]*m/g, '')
}
