// Reverse engineering (StarUML's Java / C# / C++ / Python / TypeScript / DDL
// importers): reverseEngineer() parses source files and returns new model
// elements ready to be put into a package with insertElement():
//
//   packages (Java package, C# / C++ namespace, Python / TypeScript folders) become
//   UMLPackage elements with their classifiers inside; classes, interfaces and
//   enumerations get their attributes, operations (+ parameters, the return
//   type as a 'return' parameter), literals and template parameters;
//   extends / implements become UMLGeneralization / UMLInterfaceRealization,
//   and a field whose type is one of the parsed classes becomes a navigable
//   UMLAssociation (options.associations === false keeps it an attribute).
//   Relationships go into the package of their source class (top level when
//   that class has no package). Types that are not parsed classes stay strings.
//   SQL → one ERDDataModel (see sql.js).
//
// The language parsers return a neutral description (Decl objects, see
// newDecl in java.js); everything model-specific happens here. Pure.
import { createElement, insertElement, ref } from '../model.js';
import * as cpp from './cpp.js';
import * as csharp from './csharp.js';
import * as java from './java.js';
import { reverseError } from './java.js';
import * as python from './python.js';
import * as sql from './sql.js';
import * as typescript from './typescript.js';

export { reverseError };

export const REVERSE_LANGUAGES = [
  { id: 'java', name: 'Java', exts: ['java'] },
  { id: 'csharp', name: 'C#', exts: ['cs'] },
  { id: 'cpp', name: 'C++', exts: ['h', 'hpp', 'hh', 'hxx', 'cpp', 'cc', 'cxx'] },
  { id: 'python', name: 'Python', exts: ['py', 'pyi'] },
  { id: 'typescript', name: 'TypeScript', exts: ['ts', 'tsx', 'mts', 'cts'] },
  { id: 'sql', name: 'SQL (DDL)', exts: ['sql', 'ddl'] },
];

/** Options the reverse engineering dialog offers (defaults). */
export const DEFAULT_REVERSE_OPTIONS = {
  associations: true, // fields of a parsed class type → UMLAssociation
  skipAccessors: false, // drop getX/isX/setX methods (and @property in Python) of existing fields
  constructors: true, // keep constructors as operations named like the class
  root: '', // Python / TypeScript: folder prefix of file names that is not a package
  modelName: 'DataModel', // SQL: name of the ERDDataModel
};

const PARSERS = { java: java.parse, csharp: csharp.parse, cpp: cpp.parse, python: python.parse, typescript: typescript.parse };

/**
 * files = [{ name, content }] → { elements, warnings }.
 * warnings = [{ code, file, detail }] (a file that cannot be parsed is skipped with 'reverse.parseError').
 */
export function reverseEngineer(files, language, options = {}) {
  const opts = { ...DEFAULT_REVERSE_OPTIONS, ...options };
  if (language === 'sql') return sql.reverse(files, opts);
  const parse = PARSERS[language];
  if (!parse) throw reverseError('reverse.unknownLanguage', language);
  const warnings = [];
  const parsed = [];
  for (const file of files ?? []) {
    try {
      const result = parse(String(file.content ?? ''), file.name ?? '', opts);
      const folders = language === 'python' || language === 'typescript' ? folderPackages(file.name, opts.root) : [];
      parsed.push({ file: file.name ?? '', folders, package: [...folders, ...(result.package ?? [])], imports: result.imports ?? [], types: result.types ?? [] });
    } catch (error) {
      warnings.push({ code: 'reverse.parseError', file: file.name ?? '', detail: error?.detail ?? error?.message ?? String(error) });
    }
  }
  return build(parsed, language, opts, warnings);
}

/** "src/shop/model/order.ts" (root "src") → ['shop', 'model']. */
function folderPackages(name, root) {
  const parts = String(name ?? '').replace(/\\/g, '/').split('/').filter((p) => p && p !== '.');
  parts.pop();
  const prefix = String(root ?? '').replace(/\\/g, '/').split('/').filter((p) => p && p !== '.');
  if (prefix.length && prefix.every((p, i) => parts[i] === p)) parts.splice(0, prefix.length);
  return parts.filter((p) => p !== '..' && !/:$/.test(p));
}

// ───────────────────────── types in source text

const COLLECTIONS = new Set(['List', 'ArrayList', 'LinkedList', 'Set', 'HashSet', 'TreeSet', 'LinkedHashSet', 'SortedSet', 'Collection', 'Iterable', 'Queue', 'Deque', 'ArrayDeque', 'Vector', 'Stack',
  'IList', 'ICollection', 'IEnumerable', 'IReadOnlyList', 'IReadOnlyCollection', 'ISet', 'HashSet', 'ObservableCollection', 'Array', 'ReadonlyArray', 'list', 'set', 'frozenset', 'tuple', 'Sequence', 'MutableSequence',
  'Iterator', 'Generator', 'Tuple', 'FrozenSet', 'MutableList', 'MutableSet', 'Stream',
  'vector', 'deque', 'forward_list', 'multiset', 'unordered_set', 'unordered_multiset', 'span', 'QList', 'QVector']);
/** C++ std::array<T, N>: a collection whose second argument is a size. */
const SIZED_COLLECTIONS = new Set(['array']);
const OPTIONALS = new Set(['Optional', 'Nullable', 'Option', 'optional']);
/** C++ smart pointers: one object of the argument type. */
const POINTERS = new Set(['unique_ptr', 'shared_ptr', 'weak_ptr', 'QPointer', 'QSharedPointer']);

/** Splits "a, b<c, d>" at top-level commas. */
function splitArgs(text) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if ('<[('.includes(ch)) depth += 1;
    else if ('>])'.includes(ch)) depth -= 1;
    else if (ch === ',' && depth === 0) { out.push(text.slice(start, i).trim()); start = i + 1; }
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}

/** Source type text → { name, multiplicity }: "List<Item>" → Item '*', "Item?" / "Optional[Item]" / "Item | null" → Item '0..1'. */
export function analyzeType(raw) {
  let text = String(raw ?? '').trim().replace(/^['"](.*)['"]$/, '$1').replace(/^(readonly|final|const)\s+/, '');
  if (!text) return { name: '', multiplicity: '' };
  // C++: "const Order*", "Order&", "Order&&" → Order (a pointer may be null: 0..1).
  if (/[*&]$/.test(text)) {
    const pointer = /\*$/.test(text);
    const inner = analyzeType(text.replace(/(\s*(\*|&&?)\s*(const\s*)?)+$/, ''));
    return { name: inner.name, multiplicity: inner.multiplicity || (pointer ? '0..1' : '') };
  }
  if (text.endsWith('...')) return { name: analyzeType(text.slice(0, -3)).name, multiplicity: '*' };
  const union = splitUnion(text);
  if (union.length > 1) {
    const rest = union.filter((u) => !['null', 'undefined', 'None'].includes(u));
    if (rest.length === 1) { const inner = analyzeType(rest[0]); return { name: inner.name, multiplicity: inner.multiplicity || '0..1' }; }
    return { name: text, multiplicity: '' };
  }
  if (/\?$/.test(text)) return { name: analyzeType(text.slice(0, -1)).name || text.slice(0, -1), multiplicity: '0..1' };
  if (/\[[\s,]*\]$/.test(text)) return { name: text.replace(/\[[\s,]*\]$/, '').trim(), multiplicity: '*' };
  const generic = /^([\w.$:\\]+)\s*[<[]([\s\S]*)[>\]]$/.exec(text);
  if (generic) {
    const outer = generic[1].split(/[.:\\]/).pop();
    const args = splitArgs(generic[2]);
    if (COLLECTIONS.has(outer) && args.length >= 1 && (args.length === 1 || /^(tuple|Tuple)$/.test(outer))) {
      const inner = args[0] === '...' ? '' : args[0];
      return { name: analyzeType(inner).name || inner, multiplicity: '*' };
    }
    if (OPTIONALS.has(outer) && args.length === 1) return { name: analyzeType(args[0]).name, multiplicity: '0..1' };
    if (SIZED_COLLECTIONS.has(outer) && args.length === 2) return { name: analyzeType(args[0]).name || args[0], multiplicity: /^\d+$/.test(args[1]) ? args[1] : '*' };
    if (POINTERS.has(outer) && args.length >= 1) return { name: analyzeType(args[0]).name, multiplicity: '' };
  }
  return { name: text, multiplicity: '' };
}

function splitUnion(text) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if ('<[({'.includes(ch)) depth += 1;
    else if ('>])}'.includes(ch)) depth -= 1;
    else if (ch === '|' && depth === 0 && text[i + 1] !== '|' && text[i - 1] !== '|') { out.push(text.slice(start, i).trim()); start = i + 1; }
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}

// ───────────────────────── building the model

const KIND_TYPE = { class: 'UMLClass', interface: 'UMLInterface', enum: 'UMLEnumeration' };

function build(parsed, language, opts, warnings) {
  const elements = [];
  const packages = new Map(); // 'a.b' → UMLPackage
  const byQName = new Map(); // 'a.b.C' → record
  const bySimple = new Map(); // 'C' → [record]
  const records = [];

  const packageFor = (path) => {
    if (!path.length) return null;
    const key = path.join('.');
    if (packages.has(key)) return packages.get(key);
    const parent = packageFor(path.slice(0, -1));
    const pkg = createElement('UMLPackage', { name: path[path.length - 1] });
    if (parent) insertElement(parent, pkg); else elements.push(pkg);
    packages.set(key, pkg);
    return pkg;
  };

  // 1. Classifiers (merged when the same qualified name appears twice, e.g. C# partial classes).
  const declare = (decl, file, pkgPath, outer) => {
    const fullQ = outer ? `${outer.qname}.${decl.name}` : [...pkgPath, decl.name].join('.');
    let record = byQName.get(fullQ);
    if (record) record.decls.push(decl);
    else {
      const element = createElement(KIND_TYPE[decl.kind] ?? 'UMLClass', {
        name: decl.name, visibility: decl.visibility ?? 'public', isAbstract: Boolean(decl.isAbstract) && decl.kind === 'class',
        isFinalSpecialization: Boolean(decl.isFinal), documentation: decl.doc ?? '',
      });
      const pkg = packageFor(pkgPath);
      if (outer) insertElement(outer.element, element);
      else if (pkg) insertElement(pkg, element);
      else elements.push(element);
      record = { element, decls: [decl], file, pkgPath, pkg, qname: fullQ, imports: file.imports };
      byQName.set(fullQ, record);
      if (!bySimple.has(decl.name)) bySimple.set(decl.name, []);
      bySimple.get(decl.name).push(record);
      records.push(record);
    }
    for (const nested of decl.nested ?? []) declare(nested, file, pkgPath, record);
  };
  for (const file of parsed) for (const decl of file.types) declare(decl, file, decl.package ? [...file.folders, ...decl.package] : file.package, null);

  const resolve = (rawName, from) => {
    const name = String(rawName ?? '').trim().replace(/^global::/, '').replace(/\s*[<[][\s\S]*$/, '');
    if (!name) return null;
    const dotted = name.replace(/::|\\/g, '.').replace(/^\./, '');
    if (byQName.has(dotted)) return byQName.get(dotted);
    const simple = dotted.split('.').pop();
    const candidates = bySimple.get(simple) ?? [];
    if (candidates.length <= 1) return candidates[0] ?? null;
    const samePackage = candidates.find((r) => r.pkgPath.join('.') === from.pkgPath.join('.'));
    if (samePackage) return samePackage;
    const imported = candidates.find((r) => from.imports.some((i) => i === r.qname || i === `${r.pkgPath.join('.')}.*` || i === r.pkgPath.join('.')));
    return imported ?? candidates[0];
  };

  const relationshipOwner = (record) => record.pkg;
  const addRelationship = (record, relationship) => {
    const owner = relationshipOwner(record);
    if (owner) insertElement(owner, relationship); else elements.push(relationship);
  };
  const typeValue = (name, record) => {
    const target = resolve(name, record);
    return target ? ref(target.element) : name;
  };

  // 2. Members and relationships.
  for (const record of records) {
    const cls = record.element;
    const isInterface = cls._type === 'UMLInterface';
    const seenTemplate = new Set();
    for (const decl of record.decls) {
      for (const t of decl.templateParams ?? []) {
        if (seenTemplate.has(t.name)) continue;
        seenTemplate.add(t.name);
        insertElement(cls, createElement('UMLTemplateParameter', { name: t.name, parameterType: t.bound ?? '' }));
      }
      for (const literal of decl.literals ?? []) insertElement(cls, createElement('UMLEnumerationLiteral', { name: literal.name, documentation: literal.doc ?? '' }));

      // Base types.
      const relate = (rawName, preferred) => {
        const target = resolve(rawName, record);
        if (!target || target === record) {
          if (!target) warnings.push({ code: 'reverse.unresolvedType', file: record.file.file, detail: `${decl.name} → ${rawName}` });
          return;
        }
        const toInterface = target.element._type === 'UMLInterface';
        const type = !isInterface && toInterface && preferred !== 'generalization' ? 'UMLInterfaceRealization' : 'UMLGeneralization';
        addRelationship(record, createElement(type, { source: ref(cls), target: ref(target.element) }));
      };
      for (const name of decl.extends ?? []) relate(name, isInterface ? 'generalization' : 'any');
      for (const name of decl.implements ?? []) relate(name, 'realization');
      for (const name of decl.bases ?? []) relate(name, 'any');

      // Fields.
      const fieldNames = new Set((decl.fields ?? []).map((f) => f.name.toLowerCase()));
      const plainFields = new Set((decl.fields ?? []).filter((f) => !f.property).map((f) => f.name.toLowerCase()));
      for (const field of decl.fields ?? []) {
        // A property wrapping a field of the same name (C# "Count" for "count") is an accessor.
        if (opts.skipAccessors && field.property && plainFields.has(field.name.toLowerCase())) continue;
        const { name: typeName, multiplicity } = analyzeType(field.type);
        const mult = field.multiplicity ?? multiplicity;
        const target = resolve(typeName, record);
        const asAssociation = opts.associations !== false && target && !field.isStatic && ['UMLClass', 'UMLInterface'].includes(target.element._type) && cls._type !== 'UMLEnumeration';
        if (asAssociation) {
          addRelationship(record, createElement('UMLAssociation', {
            end1: { reference: ref(cls), navigable: 'unspecified' },
            end2: {
              reference: ref(target.element), name: field.name, navigable: 'navigable', multiplicity: mult, visibility: field.visibility ?? 'public',
              isReadOnly: Boolean(field.isFinal), documentation: field.doc ?? '',
            },
          }));
          continue;
        }
        insertElement(cls, createElement('UMLAttribute', {
          name: field.name, visibility: field.visibility ?? 'public', type: target ? ref(target.element) : typeName, multiplicity: mult,
          defaultValue: field.defaultValue ?? '', isStatic: Boolean(field.isStatic), isReadOnly: Boolean(field.isFinal), documentation: field.doc ?? '',
        }));
      }

      // Operations.
      for (const method of decl.methods ?? []) {
        if (method.isConstructor && opts.constructors === false) continue;
        if (opts.skipAccessors && isAccessor(method, fieldNames)) continue;
        const op = createElement('UMLOperation', {
          name: method.name, visibility: method.visibility ?? 'public', isStatic: Boolean(method.isStatic),
          isAbstract: Boolean(method.isAbstract), isLeaf: Boolean(method.isFinal), documentation: method.doc ?? '',
          raisedExceptions: (method.throws ?? []).join(', '),
        });
        for (const t of method.templateParams ?? []) insertElement(op, createElement('UMLTemplateParameter', { name: t.name, parameterType: t.bound ?? '' }));
        for (const p of method.params ?? []) {
          const { name: typeName, multiplicity } = analyzeType(p.type);
          insertElement(op, createElement('UMLParameter', {
            name: p.name, type: typeValue(typeName, record), multiplicity: p.multiplicity ?? multiplicity, defaultValue: p.defaultValue ?? '', direction: p.direction ?? 'in',
          }));
        }
        if (method.returnType && !method.isConstructor) {
          const { name: typeName, multiplicity } = analyzeType(method.returnType);
          if (typeName && !['void', 'None', 'Unit'].includes(typeName)) {
            insertElement(op, createElement('UMLParameter', { name: '', type: typeValue(typeName, record), multiplicity, direction: 'return' }));
          }
        }
        insertElement(cls, op);
      }
    }
  }
  return { elements, warnings };
}

/** getX()/isX() without parameters or setX(v) with one, for an existing field x. */
function isAccessor(method, fieldNames) {
  if (method.isAccessor) return true;
  const m = /^(get|is|set)([A-Z_].*)$/.exec(method.name);
  if (!m) return false;
  const field = m[2].toLowerCase();
  if (!fieldNames.has(field)) return false;
  return m[1] === 'set' ? (method.params ?? []).length === 1 : (method.params ?? []).length === 0;
}
