// C# code generation: one .cs file per classifier (class, interface, enum;
// data types become structs) in the folder of its package, inside a
// namespace block, with using lines for other namespaces, XML doc comments,
// generics (+ where constraints), base class and interfaces, fields
// (collections as List<T>), constructors, method stubs and optional
// properties wrapping the non-public fields.

const VIS = { public: 'public ', protected: 'protected ', private: 'private ', package: 'internal ' };
const ZERO = { int: '0', long: '0', short: '0', byte: '0', float: '0f', double: '0.0', decimal: '0m', bool: 'false', char: "'\\0'" };

export function generate(cls, ctx) {
  const o = ctx.options;
  const pkg = ctx.packagePath(cls);
  const usings = new Set();
  const name = ctx.ident(cls.name);
  const depth = pkg.length ? 1 : 0;
  const I = (level) => ctx.indent(level + depth);

  const base = (type) => {
    const target = ctx.resolve(type);
    if (target) {
      const path = ctx.packagePath(target);
      if (path.length && path.join('.') !== pkg.join('.')) usings.add(path.join('.'));
    }
    return ctx.typeName(type) || 'object';
  };
  const typeOf = (type, multiplicity) => {
    if (!ctx.isMany(multiplicity)) return base(type);
    if (o.collection === 'array') return `${base(type)}[]`;
    usings.add('System.Collections.Generic');
    return `${o.collection || 'List'}<${base(type)}>`;
  };
  const generics = (params) => (params.length ? `<${params.map((t) => t.name).join(', ')}>` : '');
  const constraints = (params) => params.filter((t) => t.bound).map((t) => ` where ${t.name} : ${t.bound}`).join('');
  const doc = (text, indent) => {
    const lines = ctx.docLines(text);
    return lines.length ? [`${indent}/// <summary>`, ...lines.map((l) => `${indent}/// ${l}`.trimEnd()), `${indent}/// </summary>`] : [];
  };

  const kind = cls._type === 'UMLInterface' ? 'interface' : cls._type === 'UMLEnumeration' ? 'enum' : cls._type === 'UMLDataType' ? 'struct' : 'class';
  const isInterface = kind === 'interface';
  const tparams = ctx.templateParams(cls);
  const bases = [...ctx.superclasses(cls).slice(0, isInterface ? undefined : 1), ...ctx.interfaces(cls)].map((s) => base({ $ref: s._id }));

  let decl = VIS[cls.visibility ?? 'public'] ?? 'public ';
  if (kind === 'class' && cls.isAbstract) decl += 'abstract ';
  if (kind === 'class' && (cls.isFinalSpecialization || cls.isLeaf)) decl += 'sealed ';
  decl += `${kind} ${name}${generics(tparams)}`;
  if (bases.length && kind !== 'enum') decl += ` : ${bases.join(', ')}`;
  decl += constraints(tparams);

  const body = [];
  if (kind === 'enum') {
    const literals = cls.literals ?? [];
    literals.forEach((l, i) => body.push(...doc(l.documentation, I(1)), `${I(1)}${ctx.ident(l.name, 'Value')}${i < literals.length - 1 ? ',' : ''}`));
    if (literals.length) body.push('');
  }

  const fields = ctx.fieldsOf(cls);
  for (const f of fields) {
    body.push(...doc(f.documentation, I(1)));
    const type = typeOf(f.type, f.multiplicity);
    if (isInterface) { body.push(`${I(1)}${type} ${ctx.capitalize(f.name)} { get;${f.isReadOnly ? '' : ' set;'} }`); continue; }
    let line = I(1) + (VIS[f.visibility] ?? '');
    if (f.isStatic) line += 'static ';
    if (f.isReadOnly) line += 'readonly ';
    line += `${type} ${f.name}`;
    if (f.defaultValue !== '') line += ` = ${f.defaultValue}`;
    body.push(`${line};`);
  }
  if (fields.length) body.push('');

  for (const op of ctx.operationsOf(cls)) {
    body.push(...doc(op.documentation, I(1)));
    const params = op.params.map((p) => {
      const mod = p.direction === 'out' ? 'out ' : p.direction === 'inout' ? 'ref ' : '';
      return `${mod}${typeOf(p.type, p.multiplicity)} ${p.name}${p.defaultValue !== '' ? ` = ${p.defaultValue}` : ''}`;
    }).join(', ');
    if (op.isConstructor && !isInterface) {
      body.push(`${I(1)}${VIS[op.visibility] ?? ''}${name}(${params})`, `${I(1)}{`, `${I(1)}}`, '');
      continue;
    }
    const ret = op.returnType ? typeOf(op.returnType, op.returnMultiplicity) : 'void';
    let head = I(1);
    if (!isInterface) head += VIS[op.visibility] ?? '';
    if (op.isStatic) head += 'static ';
    if (!isInterface && op.isAbstract) head += 'abstract ';
    head += `${ret} ${op.name}${generics(op.templateParameters)}(${params})${constraints(op.templateParameters)}`;
    if (isInterface || op.isAbstract) { body.push(`${head};`, ''); continue; }
    body.push(head, `${I(1)}{`);
    if (o.todoComments) body.push(`${I(2)}// TODO implement`);
    if (ret !== 'void') body.push(`${I(2)}return ${ZERO[ret] ?? 'default'};`);
    body.push(`${I(1)}}`, '');
  }

  if (o.getterSetter && !isInterface) {
    for (const f of fields) {
      if (f.visibility === 'public') continue;
      const prop = ctx.capitalize(f.name);
      if (prop === f.name) continue;
      const type = typeOf(f.type, f.multiplicity);
      body.push(`${I(1)}public ${f.isStatic ? 'static ' : ''}${type} ${prop}`, `${I(1)}{`, `${I(2)}get => ${f.name};`);
      if (!f.isReadOnly) body.push(`${I(2)}set => ${f.name} = value;`);
      body.push(`${I(1)}}`, '');
    }
  }
  while (body.length && body[body.length - 1] === '') body.pop();

  const lines = [...ctx.header('//')];
  if (usings.size) lines.push(...[...usings].sort().map((u) => `using ${u};`), '');
  if (pkg.length) lines.push(`namespace ${pkg.join('.')}`, '{');
  lines.push(...doc(cls.documentation, I(0)), `${I(0)}${decl}`, `${I(0)}{`, ...body, `${I(0)}}`);
  if (pkg.length) lines.push('}');
  return [{ path: `${ctx.folder(cls)}${name}.cs`, content: ctx.join(lines) }];
}
