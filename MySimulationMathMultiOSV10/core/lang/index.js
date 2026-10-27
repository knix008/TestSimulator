// Language area: builtins, help and JS classes owned by the interpreter.
// The session merges these with the library registry (language names win;
// `fallbacks` only fill names no library area provides).
export { builtins, help, fallbacks } from './builtins.js';
export { langClasses as classes } from '../classes.js';
export { Interp } from './interp.js';
export { parse, parseExpr } from './parser.js';
export { lex } from './lexer.js';
