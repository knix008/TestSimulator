// Type structure: classes, interfaces, structs, enums and the inheritance /
// implementation edges between them. Feeds the class and inheritance diagrams
// and the type-level metrics (LCOM, DIT, NOC, WMC, RFC).

import { displayPrefix, baseName } from './languages.js';
import { lineFromStarts } from './text.js';

/**
 * Per-language type declaration patterns.
 * `base` captures a single superclass, `ifaces` a comma-separated list.
 */
const TYPE_PATTERNS = {
  csharp: [
    {
      kind: 'class',
      re: /^[ \t]*(?:\[[^\]\n]*\][ \t]*)*(?:(?:public|private|protected|internal|static|sealed|abstract|partial|file|record|readonly|ref)[ \t]+)*(class|interface|struct|enum|record)[ \t]+([A-Za-z_]\w*)(?:[ \t]*<[^>\n]*>)?[ \t]*(?::[ \t]*([^\n{]+))?/gm,
      kindIndex: 1,
      nameIndex: 2,
      basesIndex: 3,
    },
  ],
  java: [
    {
      kind: 'class',
      re: /^[ \t]*(?:@[\w.]+(?:\([^)\n]*\))?[ \t]*)*(?:(?:public|private|protected|static|final|abstract|sealed|non-sealed)[ \t]+)*(class|interface|enum|record)[ \t]+([A-Za-z_]\w*)(?:[ \t]*<[^>\n]*>)?[ \t]*((?:extends|implements)[^\n{]+)?/gm,
      kindIndex: 1,
      nameIndex: 2,
      basesIndex: 3,
    },
  ],
  kotlin: [
    {
      kind: 'class',
      re: /^[ \t]*(?:(?:public|private|protected|internal|open|abstract|sealed|data|inner|value|annotation)[ \t]+)*(class|interface|object|enum[ \t]+class)[ \t]+([A-Za-z_]\w*)(?:[ \t]*<[^>\n]*>)?(?:[ \t]*\([^)\n]*\))?[ \t]*(?::[ \t]*([^\n{]+))?/gm,
      kindIndex: 1,
      nameIndex: 2,
      basesIndex: 3,
    },
  ],
  python: [
    {
      kind: 'class',
      re: /^[ \t]*class[ \t]+([A-Za-z_]\w*)[ \t]*(?:\(([^)\n]*)\))?[ \t]*:/gm,
      kindIndex: 0,
      nameIndex: 1,
      basesIndex: 2,
      fixedKind: 'class',
    },
  ],
  cpp: [
    {
      kind: 'class',
      re: /^[ \t]*(?:template[ \t]*<[^>\n]*>[ \t]*)?(class|struct|union|enum(?:[ \t]+class)?)[ \t]+(?:[A-Z_]+_API[ \t]+)?([A-Za-z_]\w*)[ \t]*(?::[ \t]*([^\n{;]+))?[ \t]*[{;]?/gm,
      kindIndex: 1,
      nameIndex: 2,
      basesIndex: 3,
    },
  ],
  javascript: [
    {
      kind: 'class',
      re: /^[ \t]*(?:export[ \t]+)?(?:default[ \t]+)?(class)[ \t]+([A-Za-z_$][\w$]*)(?:[ \t]+extends[ \t]+([A-Za-z_$][\w$.]*))?/gm,
      kindIndex: 1,
      nameIndex: 2,
      basesIndex: 3,
    },
    {
      kind: 'interface',
      re: /^[ \t]*(?:export[ \t]+)?(interface|type)[ \t]+([A-Za-z_$][\w$]*)(?:[ \t]*<[^>\n]*>)?(?:[ \t]+extends[ \t]+([^\n{=]+))?/gm,
      kindIndex: 1,
      nameIndex: 2,
      basesIndex: 3,
    },
  ],
  go: [
    {
      kind: 'struct',
      re: /^type[ \t]+([A-Za-z_]\w*)[ \t]+(struct|interface)\b/gm,
      kindIndex: 2,
      nameIndex: 1,
      basesIndex: 0,
    },
  ],
  rust: [
    {
      kind: 'struct',
      re: /^[ \t]*(?:pub(?:\([^)\n]*\))?[ \t]+)?(struct|enum|trait|union)[ \t]+([A-Za-z_]\w*)/gm,
      kindIndex: 1,
      nameIndex: 2,
      basesIndex: 0,
    },
    {
      kind: 'impl',
      re: /^[ \t]*impl(?:[ \t]*<[^>\n]*>)?[ \t]+([A-Za-z_]\w*)(?:[ \t]*<[^>\n]*>)?[ \t]+for[ \t]+([A-Za-z_]\w*)/gm,
      kindIndex: 0,
      nameIndex: 2,
      basesIndex: 1,
      fixedKind: 'class',
      relation: 'realization',
    },
  ],
  swift: [
    {
      kind: 'class',
      re: /^[ \t]*(?:(?:public|private|internal|fileprivate|open|final)[ \t]+)*(class|struct|enum|protocol|extension)[ \t]+([A-Za-z_]\w*)(?:[ \t]*:[ \t]*([^\n{]+))?/gm,
      kindIndex: 1,
      nameIndex: 2,
      basesIndex: 3,
    },
  ],
  php: [
    {
      kind: 'class',
      re: /^[ \t]*(?:(?:final|abstract|readonly)[ \t]+)*(class|interface|trait|enum)[ \t]+([A-Za-z_]\w*)[ \t]*((?:extends|implements)[^\n{]+)?/gm,
      kindIndex: 1,
      nameIndex: 2,
      basesIndex: 3,
    },
  ],
  ruby: [
    {
      kind: 'class',
      re: /^[ \t]*(class|module)[ \t]+([A-Z]\w*(?:::\w+)*)[ \t]*(?:<[ \t]*([A-Z][\w:]*))?/gm,
      kindIndex: 1,
      nameIndex: 2,
      basesIndex: 3,
    },
  ],
  vbnet: [
    {
      kind: 'class',
      re: /^[ \t]*(?:(?:Public|Private|Protected|Friend|Partial|MustInherit|NotInheritable|Shared)[ \t]+)*(Class|Interface|Structure|Module|Enum)[ \t]+([A-Za-z_]\w*)/gim,
      kindIndex: 1,
      nameIndex: 2,
      basesIndex: 0,
    },
  ],
};

/** Members (fields/properties) declared directly inside a type body. */
const MEMBER_PATTERNS = {
  csharp: /^[ \t]*(?:\[[^\]\n]*\][ \t]*)*(?:(?:public|private|protected|internal|static|readonly|const|volatile|required)[ \t]+)+([\w<>\[\],.?]+)[ \t]+([A-Za-z_]\w*)[ \t]*(?:[;={]|=>)/gm,
  java: /^[ \t]*(?:@[\w.]+[ \t]*)*(?:(?:public|private|protected|static|final|transient|volatile)[ \t]+)+([\w<>\[\],.?]+)[ \t]+([A-Za-z_]\w*)[ \t]*[;=]/gm,
  python: /^[ \t]+(?:self\.)?([A-Za-z_]\w*)[ \t]*(?::[ \t]*([\w[\], .]+))?[ \t]*=[^=]/gm,
  javascript: /^[ \t]+(?:(?:static|readonly|declare|public|private|protected)[ \t]+)*([A-Za-z_$#][\w$]*)[ \t]*(?::[ \t]*([^;=\n]+))?[ \t]*[;=]/gm,
  cpp: /^[ \t]+(?:(?:static|mutable|const|inline)[ \t]+)*([\w:<>,* &]+?)[ \t]+([A-Za-z_]\w*)[ \t]*(?:\[[^\]\n]*\])?[ \t]*[;=]/gm,
  go: /^[ \t]+([A-Z_a-z]\w*)[ \t]+([\w*[\]. ]+?)(?:[ \t]+`[^`\n]*`)?[ \t]*$/gm,
  rust: /^[ \t]+(?:pub(?:\([^)\n]*\))?[ \t]+)?([A-Za-z_]\w*)[ \t]*:[ \t]*([^,\n]+),/gm,
  swift: /^[ \t]+(?:(?:public|private|internal|fileprivate|static|final|lazy|@\w+)[ \t]+)*(?:var|let)[ \t]+([A-Za-z_]\w*)[ \t]*(?::[ \t]*([^\n={]+))?/gm,
  php: /^[ \t]+(?:(?:public|private|protected|static|readonly)[ \t]+)+(?:([\w|?\\]+)[ \t]+)?(\$[A-Za-z_]\w*)/gm,
  kotlin: /^[ \t]+(?:(?:public|private|protected|internal|open|override|const|lateinit)[ \t]+)*(?:val|var)[ \t]+([A-Za-z_]\w*)[ \t]*(?::[ \t]*([^\n={]+))?/gm,
  ruby: /^[ \t]+attr_(?:accessor|reader|writer)[ \t]+:([A-Za-z_]\w*)/gm,
  vbnet: /^[ \t]*(?:(?:Public|Private|Protected|Friend|Shared|ReadOnly|Const)[ \t]+)+(?:Dim[ \t]+)?([A-Za-z_]\w*)[ \t]+As[ \t]+([\w().]+)/gim,
};

const MAX_MEMBERS_SHOWN = 12;

/**
 * Extracts type nodes from one file.
 * @returns {{types: object[], relations: object[]}}
 */
export function extractTypes(file) {
  const patterns = TYPE_PATTERNS[file.languageId];
  if (!patterns) return { types: [], relations: [] };

  const prefix = displayPrefix(file.languageId);
  const fileLabel = baseName(file.path);
  const types = [];
  const relations = [];
  const seen = new Set();

  for (const pattern of patterns) {
    pattern.re.lastIndex = 0;
    let m;
    while ((m = pattern.re.exec(file.masked)) !== null) {
      if (m[0].length === 0) {
        pattern.re.lastIndex++;
        continue;
      }
      const name = m[pattern.nameIndex];
      if (!name) continue;

      const lineNumber = lineFromStarts(file.lineStarts, m.index);
      const id = file.languageId + '-type:' + file.path + '::' + name;
      if (seen.has(id)) continue;
      seen.add(id);

      const rawKind = pattern.fixedKind || (m[pattern.kindIndex] || 'class');
      const kind = normalizeKind(rawKind);

      types.push({
        id,
        name,
        displayName: name,
        fullName: prefix + ' ' + fileLabel + '::' + name,
        filePath: file.path,
        languageId: file.languageId,
        lineNumber,
        kind,
        attributes: [],
        operations: [],
        members: [],
        baseNames: [],
      });

      const basesText = pattern.basesIndex ? m[pattern.basesIndex] : '';
      for (const base of parseBases(file.languageId, basesText)) {
        relations.push({
          fromId: id,
          fromName: name,
          toName: base.name,
          filePath: file.path,
          languageId: file.languageId,
          kind: pattern.relation || base.kind,
        });
        types[types.length - 1].baseNames.push(base.name);
      }
    }
  }

  types.sort((a, b) => a.lineNumber - b.lineNumber);
  attachMembers(file, types);
  return { types, relations };
}

function normalizeKind(raw) {
  const kind = String(raw).toLowerCase().replace(/\s+/g, ' ').trim();
  if (kind.startsWith('enum')) return 'enum';
  if (kind === 'record' || kind === 'struct' || kind === 'structure' || kind === 'union' || kind === 'value') return 'struct';
  if (kind === 'interface' || kind === 'protocol' || kind === 'trait') return 'interface';
  if (kind === 'module' || kind === 'object' || kind === 'extension') return 'module';
  return 'class';
}

/**
 * Splits an inheritance clause into named bases.
 * Interfaces are distinguished where the language marks them (`implements`) and
 * by the widespread `I`-prefix convention in C#, which the Windows build uses too.
 */
function parseBases(languageId, text) {
  if (!text) return [];
  const out = [];
  let mode = 'inheritance';
  let work = String(text).trim();

  // Java/PHP write both clauses in one line: `extends A implements B, C`.
  const extendsMatch = /extends\s+([^\n]*?)(?:\s+implements\s+|$)/i.exec(work);
  const implementsMatch = /implements\s+([^\n{]*)/i.exec(work);

  if (extendsMatch || implementsMatch) {
    if (extendsMatch) pushNames(out, extendsMatch[1], 'inheritance');
    if (implementsMatch) pushNames(out, implementsMatch[1], 'realization');
    return out;
  }

  work = work.replace(/\bwhere\b[\s\S]*$/i, '').replace(/[{;].*$/s, '');
  if (languageId === 'csharp') {
    // First base is the class unless it follows the I-prefix convention.
    const names = splitNames(work);
    names.forEach((name, index) => {
      const isInterface = /^I[A-Z]/.test(name) || index > 0;
      out.push({ name, kind: isInterface ? 'realization' : 'inheritance' });
    });
    return out;
  }

  pushNames(out, work, mode);
  return out;
}

function pushNames(out, text, kind) {
  for (const name of splitNames(text)) out.push({ name, kind });
}

function splitNames(text) {
  return String(text || '')
    .split(',')
    .map((part) =>
      part
        .replace(/\bpublic\b|\bprotected\b|\bprivate\b|\bvirtual\b|\bopen\b/gi, '')
        .replace(/<[^>]*>/g, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/[{:].*$/, '')
        .trim(),
    )
    .map((name) => name.split(/[.:]/).filter(Boolean).pop() || '')
    .filter((name) => /^[A-Za-z_]\w*$/.test(name) && name.length > 1);
}

/** Attaches field/property members to the type whose line range contains them. */
function attachMembers(file, types) {
  if (types.length === 0) return;
  const re = MEMBER_PATTERNS[file.languageId];
  if (!re) return;

  // A type's span runs to the next type declaration (a good enough boundary for
  // the diagram, and immune to unbalanced braces in partial files).
  const spans = types.map((type, index) => ({
    type,
    from: type.lineNumber,
    to: index + 1 < types.length ? types[index + 1].lineNumber - 1 : Number.MAX_SAFE_INTEGER,
  }));

  re.lastIndex = 0;
  let m;
  while ((m = re.exec(file.masked)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    const line = lineFromStarts(file.lineStarts, m.index);
    const span = spans.find((s) => line >= s.from && line <= s.to);
    if (!span) continue;

    const [, first, second] = m;
    const name = second && /^[$A-Za-z_]/.test(second) ? second : first;
    const typeName = second && name === second ? first : second || '';
    if (!name || name === span.type.name) continue;
    if (span.type.attributes.length >= 40) continue;

    span.type.attributes.push({ name: String(name).replace(/^\$/, ''), typeName: String(typeName || '').trim() });
  }
}

/**
 * Links type nodes to their bases across files and computes the derived
 * inheritance metrics (DIT / NOC).
 *
 * @param {object[]} types every type node in the analysis
 * @param {object[]} rawRelations `{fromId, toName, kind}` edges from extractTypes
 */
export function linkTypes(types, rawRelations) {
  const byName = new Map();
  for (const type of types) {
    const list = byName.get(type.name) || [];
    list.push(type);
    byName.set(type.name, list);
  }

  const relations = [];
  const parents = new Map(); // childId -> parentId[]
  const children = new Map();

  for (const rel of rawRelations) {
    const candidates = byName.get(rel.toName) || [];
    // Prefer a type declared in the same file, then anything with that name.
    const target =
      candidates.find((t) => t.filePath === rel.filePath) ||
      candidates.find((t) => t.languageId === rel.languageId) ||
      candidates[0];

    const toId = target ? target.id : 'external-type:' + rel.toName;
    relations.push({ fromId: rel.fromId, toId, toName: rel.toName, kind: rel.kind, external: !target });

    if (!target) continue;
    if (!parents.has(rel.fromId)) parents.set(rel.fromId, []);
    parents.get(rel.fromId).push(toId);
    if (!children.has(toId)) children.set(toId, []);
    children.get(toId).push(rel.fromId);
  }

  // Depth of inheritance tree, guarded against cycles in malformed sources.
  const depthCache = new Map();
  const depthOf = (id, seen) => {
    if (depthCache.has(id)) return depthCache.get(id);
    if (seen.has(id)) return 0;
    seen.add(id);
    const ps = parents.get(id) || [];
    const depth = ps.length === 0 ? 0 : 1 + Math.max(...ps.map((p) => depthOf(p, seen)));
    depthCache.set(id, depth);
    seen.delete(id);
    return depth;
  };

  for (const type of types) {
    type.depthOfInheritance = depthOf(type.id, new Set());
    type.numberOfChildren = (children.get(type.id) || []).length;
    type.inheritanceOutCount = (parents.get(type.id) || []).length;
  }

  return relations;
}
