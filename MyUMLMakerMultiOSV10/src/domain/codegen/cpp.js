// C++ code generation: a header (.h) and a source (.cpp) per classifier in
// the folder of its package. The header has an include guard (or #pragma
// once), includes of the classes it uses, nested namespaces, Doxygen
// comments, public/protected/private sections, virtual / pure virtual
// operations, std::vector<T> for multi-valued members and pointers for
// association ends. The .cpp has the method stubs and static member
// definitions. Enumerations and templates are header-only (enum class).

const SECTION = { public: 'public', protected: 'protected', private: 'private', package: 'public' };
const ZERO = { int: '0', long: '0', short: '0', float: '0.0f', double: '0.0', bool: 'false', char: "'\\0'", 'unsigned char': '0' };

export function generate(cls, ctx) {
  const o = ctx.options;
  const I = ctx.indent;
  const pkg = ctx.packagePath(cls);
  const name = ctx.ident(cls.name);
  const folder = ctx.folder(cls);
  const includes = new Set();
  const systemIncludes = new Set();

  const base = (type) => {
    const target = ctx.resolve(type);
    if (target) {
      const rel = relativePath(pkg, ctx.packagePath(target));
      includes.add(`${rel}${ctx.ident(target.name)}.h`);
      const path = ctx.packagePath(target);
      return path.length && path.join('::') !== pkg.join('::') ? `${path.join('::')}::${ctx.ident(target.name)}` : ctx.ident(target.name);
    }
    const text = ctx.typeName(type) || 'void*';
    if (text.startsWith('std::string')) systemIncludes.add('string');
    return text;
  };
  const typeOf = (type, multiplicity, pointer = false) => {
    let text = base(type);
    if (pointer) text += '*';
    if (!ctx.isMany(multiplicity)) return text;
    const coll = o.collection || 'std::vector';
    if (coll === 'std::vector') systemIncludes.add('vector');
    else if (coll === 'std::list') systemIncludes.add('list');
    return `${coll}<${text}>`;
  };
  const doc = (text, indent) => ctx.docBlock(text, indent);
  const tparams = ctx.templateParams(cls);
  const template = tparams.length ? `template <${tparams.map((t) => `typename ${t.name}`).join(', ')}>` : '';
  const isInterface = cls._type === 'UMLInterface';
  const ns = pkg.length;

  const header = [];
  const source = [];

  if (cls._type === 'UMLEnumeration') {
    const literals = cls.literals ?? [];
    header.push(...doc(cls.documentation, ''), `enum class ${name} {`);
    literals.forEach((l, i) => header.push(...doc(l.documentation, I(1)), `${I(1)}${ctx.ident(l.name, 'Value')}${i < literals.length - 1 ? ',' : ''}`));
    header.push('};');
  } else {
    const bases = [...ctx.superclasses(cls), ...ctx.interfaces(cls)].map((s) => `public ${base({ $ref: s._id })}`);
    if (template) header.push(template);
    header.push(...doc(cls.documentation, ''), `class ${name}${cls.isFinalSpecialization || cls.isLeaf ? ' final' : ''}${bases.length ? ` : ${bases.join(', ')}` : ''} {`);
    const sections = { public: [], protected: [], private: [] };
    const fields = ctx.fieldsOf(cls);
    for (const f of fields) {
      const target = ctx.resolve(f.type);
      const pointer = f.association && target && f.aggregation !== 'composite';
      const type = typeOf(f.type, f.multiplicity, pointer);
      const lines = sections[SECTION[f.visibility] ?? 'public'];
      lines.push(...doc(f.documentation, I(1)));
      const constText = f.isReadOnly ? 'const ' : '';
      if (f.isStatic) {
        lines.push(`${I(1)}static ${constText}${type} ${f.name};`);
        if (!template) source.push(`${constText}${type} ${name}::${f.name}${f.defaultValue !== '' ? ` = ${f.defaultValue}` : ''};`, '');
      } else lines.push(`${I(1)}${constText}${type} ${f.name}${f.defaultValue !== '' ? ` = ${f.defaultValue}` : ''};`);
    }
    if (isInterface) sections.public.push(`${I(1)}virtual ~${name}() = default;`);
    for (const op of ctx.operationsOf(cls)) {
      const lines = sections[SECTION[op.visibility] ?? 'public'];
      const params = op.params.map((p) => {
        const type = typeOf(p.type, p.multiplicity);
        const byRef = p.direction === 'out' || p.direction === 'inout' ? '&' : '';
        return `${type}${byRef} ${p.name}`;
      });
      const paramText = params.join(', ');
      const declParams = op.params.map((p, i) => `${params[i]}${p.defaultValue !== '' ? ` = ${p.defaultValue}` : ''}`).join(', ');
      lines.push(...doc(op.documentation, I(1)));
      if (op.isConstructor) {
        lines.push(`${I(1)}${name}(${declParams});`);
        if (!template) source.push(`${name}::${name}(${paramText}) {`, '}', '');
        continue;
      }
      const ret = op.returnType ? typeOf(op.returnType, op.returnMultiplicity) : 'void';
      const pure = isInterface || op.isAbstract;
      const prefix = op.isStatic ? 'static ' : pure ? 'virtual ' : '';
      lines.push(`${I(1)}${prefix}${ret} ${op.name}(${declParams})${pure && !op.isStatic ? ' = 0' : ''};`);
      if (!pure && !template) {
        source.push(`${ret} ${name}::${op.name}(${paramText}) {`);
        if (o.todoComments) source.push(`${I(1)}// TODO implement`);
        if (ret !== 'void') source.push(`${I(1)}return ${ZERO[ret] ?? (ret.endsWith('*') ? 'nullptr' : '{}')};`);
        source.push('}', '');
      }
    }
    let first = true;
    for (const key of ['public', 'protected', 'private']) {
      if (!sections[key].length) continue;
      if (!first) header.push('');
      header.push(`${key}:`, ...sections[key]);
      first = false;
    }
    header.push('};');
  }

  const guard = `${[...pkg, name].join('_').toUpperCase()}_H`;
  const h = [...ctx.header('//')];
  if (o.pragmaOnce) h.push('#pragma once', ''); else h.push(`#ifndef ${guard}`, `#define ${guard}`, '');
  includes.delete(`${name}.h`);
  if (systemIncludes.size) h.push(...[...systemIncludes].sort().map((i) => `#include <${i}>`));
  if (includes.size) h.push(...[...includes].sort().map((i) => `#include "${i}"`));
  if (systemIncludes.size || includes.size) h.push('');
  if (ns) h.push(...pkg.map((p) => `namespace ${p} {`), '');
  h.push(...header);
  if (ns) h.push('', ...pkg.map(() => '}').reverse().map((b, i) => `${b} // namespace ${pkg[pkg.length - 1 - i]}`));
  if (!o.pragmaOnce) h.push('', `#endif // ${guard}`);
  const files = [{ path: `${folder}${name}.h`, content: ctx.join(h) }];

  if (cls._type !== 'UMLEnumeration' && !template && !isInterface) {
    const c = [...ctx.header('//'), `#include "${name}.h"`, ''];
    if (ns) c.push(...pkg.map((p) => `namespace ${p} {`), '');
    c.push(...source);
    if (ns) c.push(...pkg.map(() => '}').reverse().map((b, i) => `${b} // namespace ${pkg[pkg.length - 1 - i]}`));
    files.push({ path: `${folder}${name}.cpp`, content: ctx.join(c) });
  }
  return files;
}

/** Relative include path from one package folder to another ('../other/'). */
function relativePath(from, to) {
  let common = 0;
  while (common < from.length && common < to.length && from[common] === to[common]) common += 1;
  return '../'.repeat(from.length - common) + to.slice(common).map((p) => `${p}/`).join('');
}
