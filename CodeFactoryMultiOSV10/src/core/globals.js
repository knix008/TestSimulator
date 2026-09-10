// Global / module / class-static variables and the functions that touch them.
//
// The declaration scan is brace-depth aware (or indentation aware for Python),
// because "global" here means *declared outside any function body* — which is
// exactly what makes these variables hard to reason about.

import { displayPrefix, baseName } from './languages.js';
import { lineFromStarts, escapeRegExp } from './text.js';

/**
 * Declaration patterns matched only at file/type scope.
 * Each yields `{name, typeName, isConst, isReadOnly, accessModifier}`.
 */
const DECL_PATTERNS = {
  csharp: [
    {
      re: /^[ \t]*((?:(?:public|private|protected|internal|static|readonly|const|volatile)[ \t]+)+)([\w<>\[\],.?]+)[ \t]+([A-Za-z_]\w*)[ \t]*(?:=[^;\n]*)?;/,
      modIndex: 1,
      typeIndex: 2,
      nameIndex: 3,
      requireStatic: true,
    },
  ],
  java: [
    {
      re: /^[ \t]*((?:(?:public|private|protected|static|final|volatile|transient)[ \t]+)+)([\w<>\[\],.?]+)[ \t]+([A-Za-z_]\w*)[ \t]*(?:=[^;\n]*)?;/,
      modIndex: 1,
      typeIndex: 2,
      nameIndex: 3,
      requireStatic: true,
    },
  ],
  kotlin: [
    {
      re: /^[ \t]*((?:(?:public|private|internal|const|lateinit)[ \t]+)*)(?:val|var)[ \t]+([A-Za-z_]\w*)[ \t]*(?::[ \t]*([^\n={]+))?/,
      modIndex: 1,
      nameIndex: 2,
      typeIndex: 3,
    },
  ],
  cpp: [
    {
      re: /^[ \t]*(?:(extern|static|const|constexpr)[ \t]+)*([\w:<>,*& ]+?)[ \t]+\*?([A-Za-z_]\w*)(?:\[[^\]\n]*\])?[ \t]*(?:=[^;\n]*)?;/,
      modIndex: 1,
      typeIndex: 2,
      nameIndex: 3,
    },
  ],
  go: [
    { re: /^var[ \t]+([A-Za-z_]\w*)[ \t]+([\w*[\].]+)/, nameIndex: 1, typeIndex: 2 },
    { re: /^const[ \t]+([A-Za-z_]\w*)[ \t]*(?:[\w*[\].]+)?[ \t]*=/, nameIndex: 1, constant: true },
  ],
  rust: [
    {
      re: /^[ \t]*(?:(pub(?:\([^)\n]*\))?)[ \t]+)?(?:static|const)[ \t]+(?:mut[ \t]+)?([A-Za-z_]\w*)[ \t]*:[ \t]*([^=\n]+)=/,
      modIndex: 1,
      nameIndex: 2,
      typeIndex: 3,
    },
  ],
  swift: [
    {
      re: /^[ \t]*((?:(?:public|private|internal|fileprivate|open|static|let)[ \t]+)*)(?:var|let)[ \t]+([A-Za-z_]\w*)[ \t]*(?::[ \t]*([^\n={]+))?/,
      modIndex: 1,
      nameIndex: 2,
      typeIndex: 3,
    },
  ],
  javascript: [
    {
      re: /^[ \t]*(?:(export)[ \t]+)?(const|let|var)[ \t]+([A-Za-z_$][\w$]*)[ \t]*(?::[ \t]*([^=\n]+))?=/,
      modIndex: 1,
      nameIndex: 3,
      typeIndex: 4,
      constIndex: 2,
    },
  ],
  python: [{ re: /^([A-Za-z_]\w*)[ \t]*(?::[ \t]*([\w[\], .]+))?[ \t]*=[^=]/, nameIndex: 1, typeIndex: 2 }],
  php: [{ re: /^[ \t]*(?:(public|private|protected)[ \t]+)?static[ \t]+\$([A-Za-z_]\w*)/, modIndex: 1, nameIndex: 2 }],
  ruby: [{ re: /^[ \t]*(\$[A-Za-z_]\w*|@@[A-Za-z_]\w*|[A-Z][A-Z0-9_]*)[ \t]*=[^=]/, nameIndex: 1 }],
  vbnet: [
    {
      re: /^[ \t]*((?:(?:Public|Private|Protected|Friend|Shared|ReadOnly|Const)[ \t]+)+)(?:Dim[ \t]+)?([A-Za-z_]\w*)[ \t]+As[ \t]+([\w().]+)/i,
      modIndex: 1,
      nameIndex: 2,
      typeIndex: 3,
    },
  ],
};

const TYPE_LINE_RE =
  /^\s*(?:[\w@[\]"'()., <>]*\s)?(class|interface|struct|enum|record|module|object|trait|protocol|Class|Structure|Module|Interface|Enum)\s+([A-Za-z_]\w*)/;

/**
 * Extracts globals from one file.
 * @param {object} file
 * @param {object[]} functions this file's functions, used to skip their bodies
 */
export function extractGlobals(file, functions) {
  const patterns = DECL_PATTERNS[file.languageId];
  if (!patterns) return [];

  const prefix = displayPrefix(file.languageId);
  const maskedLines = file.masked.split('\n');
  const rawLines = file.text.split('\n');
  const items = [];

  // Line ranges occupied by a function body — a declaration inside one is local.
  const functionRanges = functions.map((fn) => [fn.startLine, fn.endLine]).sort((a, b) => a[0] - b[0]);
  const insideFunction = (line) => functionRanges.some(([from, to]) => line >= from && line <= to);

  let depth = 0;
  let currentType = '';

  for (let i = 0; i < maskedLines.length; i++) {
    const masked = maskedLines[i];
    const trimmed = masked.trim();
    const lineNumber = i + 1;

    if (!trimmed) {
      continue;
    }

    const typeMatch = TYPE_LINE_RE.exec(trimmed);
    if (typeMatch) currentType = typeMatch[2];

    // Scope is decided by "not inside any function body", not by brace depth:
    // a static field can sit three braces deep (namespace → class → nothing)
    // and still be global. The per-language patterns carry the rest of the
    // discipline — C#/Java require `static`, Python requires column 0.
    if (!insideFunction(lineNumber)) {
      for (const pattern of patterns) {
        const m = pattern.re.exec(masked);
        if (!m) continue;

        const name = m[pattern.nameIndex];
        if (!name || name.length < 2) continue;

        const modifiers = pattern.modIndex ? m[pattern.modIndex] || '' : '';
        // `const` in C# is implicitly static, so it belongs here too; plain
        // `readonly` / `final` do not — those are per-instance fields.
        if (pattern.requireStatic && !/\b(static|Shared|const)\b/i.test(modifiers)) continue;

        const constKeyword = pattern.constIndex ? m[pattern.constIndex] : '';
        const isConst = pattern.constant === true || /\bconst\b/i.test(modifiers) || constKeyword === 'const';

        items.push({
          id: file.languageId + ':' + file.path + ':' + lineNumber + ':' + name,
          name,
          languageId: file.languageId,
          filePath: file.path,
          fullName: prefix + ' ' + baseName(file.path) + '::' + name,
          lineNumber,
          scope: currentType && depth > 0 ? 'classStatic' : depth === 0 ? 'file' : 'module',
          typeName: (pattern.typeIndex ? m[pattern.typeIndex] || '' : '').trim(),
          containingScope: currentType,
          accessModifier: modifiers.trim(),
          isConst,
          isReadOnly: /\breadonly\b/i.test(modifiers) || constKeyword === 'const' || isConst,
          declaration: (rawLines[i] || '').trim().slice(0, 300),
        });
        break;
      }
    }

    for (const ch of masked) {
      if (ch === '{') depth++;
      else if (ch === '}') depth = Math.max(0, depth - 1);
    }
    if (depth === 0 && !typeMatch) currentType = '';
  }

  return items;
}

/**
 * Correlates globals with the functions that read or write them.
 * A write is an assignment (`name =`, `name++`, `name +=`); anything else that
 * mentions the identifier counts as a read.
 */
export function analyzeGlobalAccess(globals, functions) {
  const accesses = [];
  if (globals.length === 0 || functions.length === 0) return { accesses, byVariableId: new Map() };

  // Index globals by name so each function body is scanned once, not per global.
  const byName = new Map();
  for (const g of globals) {
    if (!byName.has(g.name)) byName.set(g.name, []);
    byName.get(g.name).push(g);
  }

  const identifierRe = /[$@]{0,2}[A-Za-z_]\w*/g;

  for (const fn of functions) {
    const body = fn.maskedBody;
    if (!body) continue;

    const mentioned = new Set();
    identifierRe.lastIndex = 0;
    let m;
    while ((m = identifierRe.exec(body)) !== null) {
      if (byName.has(m[0])) mentioned.add(m[0]);
    }

    for (const name of mentioned) {
      const candidates = byName.get(name) || [];
      // Prefer a global declared in the same file; otherwise every match, since
      // a module-level name really can be shared across files.
      const targets = candidates.filter((g) => g.filePath === fn.filePath);
      const resolved = targets.length > 0 ? targets : candidates;

      const escaped = escapeRegExp(name);
      const writeRe = new RegExp(
        '(?:^|[^\\w.])' + escaped + '\\s*(?:\\+\\+|--|(?:[+\\-*/%|&^]|<<|>>)?=(?!=))',
        'm',
      );
      const isWrite = writeRe.test(body);

      for (const g of resolved) {
        if (g.filePath === fn.filePath && g.lineNumber >= fn.startLine && g.lineNumber <= fn.endLine) continue;
        accesses.push({
          globalVariableId: g.id,
          variableName: g.name,
          functionId: fn.id,
          functionDisplayName: fn.displayName,
          functionFullName: fn.fullName,
          functionFilePath: fn.filePath,
          functionLineNumber: fn.startLine,
          kind: isWrite ? 'write' : 'read',
        });
      }
    }
  }

  const byVariableId = new Map();
  for (const access of accesses) {
    if (!byVariableId.has(access.globalVariableId)) byVariableId.set(access.globalVariableId, []);
    byVariableId.get(access.globalVariableId).push(access);
  }

  // A variable both read and written by the same function is read-write.
  for (const list of byVariableId.values()) {
    const seen = new Map();
    for (const access of list) {
      const prev = seen.get(access.functionId);
      if (prev && prev.kind !== access.kind) prev.kind = 'readWrite';
      else if (!prev) seen.set(access.functionId, access);
    }
  }

  return { accesses, byVariableId };
}
