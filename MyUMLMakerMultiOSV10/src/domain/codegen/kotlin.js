// Kotlin code generation: one .kt file per classifier in the folder of its
// package, with package/import lines, KDoc, generics, a superclass call and
// interfaces after ":", properties (val for read-only, nullable T? for 0..1,
// List<T> for multi-valued, a default value so that every property is
// initialized), static members in a companion object, functions with TODO()
// bodies, abstract and open modifiers, enum classes and data classes for
// data types.

const VIS = { public: '', protected: 'protected ', private: 'private ', package: 'internal ' };
const ZERO = { Int: '0', Long: '0L', Short: '0', Byte: '0', Float: '0f', Double: '0.0', Boolean: 'false', Char: "'\\u0000'", String: '""' };

export function generate(cls, ctx) {
  const o = ctx.options;
  const I = ctx.indent;
  const pkg = ctx.packagePath(cls);
  const name = ctx.ident(cls.name);
  const imports = new Set();

  const base = (type) => {
    const target = ctx.resolve(type);
    if (target) {
      const path = ctx.packagePath(target);
      if (path.length && path.join('.') !== pkg.join('.')) imports.add(`${path.join('.')}.${ctx.ident(target.name)}`);
    }
    return ctx.typeName(type) || 'Any';
  };
  const typeOf = (type, multiplicity) => {
    const text = base(type);
    if (ctx.isMany(multiplicity)) return `${o.collection || 'List'}<${text}>`;
    if (ctx.isOptional(multiplicity)) return `${text}?`;
    return text;
  };
  const initial = (type, f) => {
    if (f.defaultValue !== '') return f.defaultValue;
    if (ctx.isMany(f.multiplicity)) return /^Mutable/.test(o.collection) ? 'mutableListOf()' : 'listOf()';
    if (type.endsWith('?')) return 'null';
    return ZERO[type] ?? null;
  };
  const generics = (params) => (params.length ? `<${params.map((t) => (t.bound ? `${t.name} : ${t.bound}` : t.name)).join(', ')}>` : '');

  const kind = cls._type;
  const isInterface = kind === 'UMLInterface';
  const fields = ctx.fieldsOf(cls);
  const ops = ctx.operationsOf(cls);
  const body = [];
  const companion = [];

  let decl = VIS[cls.visibility ?? 'public'] ?? '';
  if (kind === 'UMLEnumeration') decl += `enum class ${name}`;
  else if (isInterface) decl += `interface ${name}${generics(ctx.templateParams(cls))}`;
  else {
    if (cls.isAbstract) decl += 'abstract ';
    else if (!cls.isLeaf && !cls.isFinalSpecialization && kind !== 'UMLDataType') decl += 'open ';
    decl += `class ${name}${generics(ctx.templateParams(cls))}`;
  }
  const supers = ctx.superclasses(cls).map((s) => base({ $ref: s._id }) + (isInterface ? '' : '()'));
  const ifaces = ctx.interfaces(cls).map((s) => base({ $ref: s._id }));
  const after = [...(isInterface ? supers : supers.slice(0, 1)), ...ifaces];
  if (after.length) decl += ` : ${after.join(', ')}`;

  if (kind === 'UMLEnumeration') {
    const literals = cls.literals ?? [];
    literals.forEach((l, i) => body.push(...ctx.docBlock(l.documentation, I(1)), `${I(1)}${ctx.ident(l.name, 'VALUE')}${i < literals.length - 1 ? ',' : (fields.length || ops.length ? ';' : '')}`));
    if (literals.length) body.push('');
  }

  for (const f of fields) {
    const target = f.isStatic ? companion : body;
    const level = f.isStatic ? 2 : 1;
    const type = typeOf(f.type, f.multiplicity);
    target.push(...ctx.docBlock(f.documentation, I(level)));
    if (isInterface) { target.push(`${I(level)}${f.isReadOnly ? 'val' : 'var'} ${f.name}: ${type}`); continue; }
    const init = initial(type, f);
    const lateinit = init === null && !f.isReadOnly && !/^(Int|Long|Short|Byte|Float|Double|Boolean|Char)$/.test(type);
    const value = init === null ? (lateinit ? '' : ` = ${type}()`) : ` = ${init}`;
    target.push(`${I(level)}${VIS[f.visibility] ?? ''}${lateinit ? 'lateinit ' : ''}${f.isReadOnly ? 'val' : 'var'} ${f.name}: ${type}${value}`);
  }
  if (fields.some((f) => !f.isStatic)) body.push('');

  for (const op of ops) {
    const target = op.isStatic ? companion : body;
    const level = op.isStatic ? 2 : 1;
    target.push(...ctx.docBlock(op.documentation, I(level)));
    const params = op.params.map((p) => `${p.name}: ${typeOf(p.type, p.multiplicity)}${p.defaultValue !== '' ? ` = ${p.defaultValue}` : ''}`).join(', ');
    if (op.isConstructor && !isInterface) {
      target.push(`${I(level)}${VIS[op.visibility] ?? ''}constructor(${params})${supers.length ? ' : super()' : ''} {`, `${I(level)}}`, '');
      continue;
    }
    const ret = op.returnType ? typeOf(op.returnType, op.returnMultiplicity) : 'Unit';
    const retText = ret === 'Unit' ? '' : `: ${ret}`;
    const abstract = isInterface || op.isAbstract;
    let head = I(level) + (VIS[op.visibility] ?? '');
    if (!isInterface && op.isAbstract) head += 'abstract ';
    else if (!isInterface && !op.isStatic && !op.isLeaf && !cls.isLeaf && cls.isAbstract && kind !== 'UMLEnumeration') head += 'open ';
    const g = generics(op.templateParameters);
    head += `fun ${g ? `${g} ` : ''}${op.name}(${params})${retText}`;
    if (abstract) { target.push(head, ''); continue; }
    target.push(`${head} {`, `${I(level + 1)}${o.todoComments ? 'TODO("Not yet implemented")' : ret === 'Unit' ? '' : `return ${ZERO[ret] ?? 'TODO()'}`}`.trimEnd(), `${I(level)}}`, '');
  }
  if (companion.length) {
    while (companion[companion.length - 1] === '') companion.pop();
    body.push(`${I(1)}companion object {`, ...companion, `${I(1)}}`);
  }
  while (body.length && body[body.length - 1] === '') body.pop();

  const lines = [...ctx.header('//')];
  if (pkg.length) lines.push(`package ${pkg.join('.')}`, '');
  if (imports.size) lines.push(...[...imports].sort().map((i) => `import ${i}`), '');
  lines.push(...ctx.docBlock(cls.documentation));
  lines.push(body.length ? `${decl} {` : decl, ...body, ...(body.length ? ['}'] : []));
  return [{ path: `${ctx.folder(cls)}${name}.kt`, content: ctx.join(lines) }];
}
