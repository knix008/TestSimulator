// Java code generation: one .java file per classifier (class, interface,
// enum; data types and signals become classes) in the folder of its package,
// with package/import lines, Javadoc, generics, extends/implements, fields
// (navigable association ends included, collections as List<T>), constructors
// (an operation named like the class), method stubs and optional getters and
// setters. The model is read through the context made by codegen/index.js.

const VIS = { public: 'public ', protected: 'protected ', private: 'private ', package: '' };
const BOXED = { int: 'Integer', long: 'Long', short: 'Short', byte: 'Byte', float: 'Float', double: 'Double', boolean: 'Boolean', char: 'Character' };
const ZERO = { int: '0', long: '0L', short: '0', byte: '0', float: '0f', double: '0.0', boolean: 'false', char: "'\\0'" };

export function generate(cls, ctx) {
  const o = ctx.options;
  const I = ctx.indent;
  const pkg = ctx.packagePath(cls);
  const imports = new Set();
  const name = ctx.ident(cls.name);

  const base = (type, boxed = false) => {
    const target = ctx.resolve(type);
    if (target) {
      const path = ctx.packagePath(target);
      if (path.length && path.join('.') !== pkg.join('.')) imports.add(`${path.join('.')}.${ctx.ident(target.name)}`);
    }
    const text = ctx.typeName(type) || 'Object';
    return boxed ? BOXED[text] ?? text : text;
  };
  const typeOf = (type, multiplicity) => {
    if (!ctx.isMany(multiplicity)) return base(type);
    if (o.collection === 'array') return `${base(type)}[]`;
    const coll = o.collection || 'List';
    if (!coll.includes('.')) imports.add(`java.util.${coll}`);
    return `${coll}<${base(type, true)}>`;
  };
  const generics = (params) => (params.length ? `<${params.map((t) => (t.bound ? `${t.name} extends ${t.bound}` : t.name)).join(', ')}>` : '');

  const kind = cls._type === 'UMLInterface' ? 'interface' : cls._type === 'UMLEnumeration' ? 'enum' : 'class';
  const isInterface = kind === 'interface';
  const supers = ctx.superclasses(cls).map((s) => base({ $ref: s._id }));
  const ifaces = ctx.interfaces(cls).map((s) => base({ $ref: s._id }));

  // Declaration line.
  let decl = VIS[cls.visibility ?? 'public'] ?? 'public ';
  if (kind === 'class' && cls.isAbstract) decl += 'abstract ';
  if (kind === 'class' && (cls.isFinalSpecialization || cls.isLeaf)) decl += 'final ';
  decl += `${kind} ${name}${generics(ctx.templateParams(cls))}`;
  if (isInterface) { if (supers.length) decl += ` extends ${supers.join(', ')}`; } else {
    if (kind === 'class' && supers.length) decl += ` extends ${supers[0]}`;
    if (ifaces.length) decl += ` implements ${ifaces.join(', ')}`;
  }

  const body = [];
  if (kind === 'enum') {
    const literals = (cls.literals ?? []).map((l) => ctx.ident(l.name, 'VALUE'));
    (cls.literals ?? []).forEach((l, i) => {
      body.push(...ctx.docBlock(l.documentation, I(1)));
      body.push(`${I(1)}${literals[i]}${i < literals.length - 1 ? ',' : ';'}`);
    });
    if (!literals.length) body.push(`${I(1)};`);
    body.push('');
  }

  // Fields.
  const fields = ctx.fieldsOf(cls);
  for (const f of fields) {
    body.push(...ctx.docBlock(f.documentation, I(1)));
    let line = I(1);
    if (!isInterface) {
      line += VIS[f.visibility] ?? '';
      if (f.isStatic) line += 'static ';
      if (f.isReadOnly) line += 'final ';
    }
    line += `${typeOf(f.type, f.multiplicity)} ${f.name}`;
    if (f.defaultValue !== '') line += ` = ${f.defaultValue}`;
    body.push(`${line};`);
  }
  if (fields.length) body.push('');

  // Operations.
  for (const op of ctx.operationsOf(cls)) {
    body.push(...ctx.docBlock(op.documentation, I(1)));
    const params = op.params.map((p) => `${typeOf(p.type, p.multiplicity)} ${p.name}`).join(', ');
    const throwsText = op.raisedExceptions.length ? ` throws ${op.raisedExceptions.join(', ')}` : '';
    if (op.isConstructor && !isInterface) {
      body.push(`${I(1)}${VIS[op.visibility] ?? ''}${name}(${params})${throwsText} {`, `${I(1)}}`, '');
      continue;
    }
    const ret = op.returnType ? typeOf(op.returnType, op.returnMultiplicity) : 'void';
    const abstract = isInterface ? !op.isStatic : op.isAbstract;
    let head = I(1);
    if (!isInterface) head += VIS[op.visibility] ?? '';
    if (op.isStatic) head += 'static ';
    if (!isInterface && op.isAbstract) head += 'abstract ';
    if (!isInterface && op.isLeaf && !op.isAbstract) head += 'final ';
    const g = generics(op.templateParameters);
    head += `${g ? `${g} ` : ''}${ret} ${op.name}(${params})${throwsText}`;
    if (abstract) { body.push(`${head};`, ''); continue; }
    body.push(`${head} {`);
    if (o.todoComments) body.push(`${I(2)}// TODO implement`);
    if (ret !== 'void') body.push(`${I(2)}return ${ZERO[ret] ?? 'null'};`);
    body.push(`${I(1)}}`, '');
  }

  // Getters and setters for non-public fields.
  if (o.getterSetter && !isInterface) {
    for (const f of fields) {
      if (f.visibility === 'public' || f.isStatic) continue;
      const type = typeOf(f.type, f.multiplicity);
      const cap = ctx.capitalize(f.name);
      body.push(`${I(1)}public ${type} ${type === 'boolean' ? 'is' : 'get'}${cap}() {`, `${I(2)}return ${f.name};`, `${I(1)}}`, '');
      if (!f.isReadOnly) body.push(`${I(1)}public void set${cap}(${type} ${f.name}) {`, `${I(2)}this.${f.name} = ${f.name};`, `${I(1)}}`, '');
    }
  }
  while (body.length && body[body.length - 1] === '') body.pop();

  const lines = [...ctx.header('//')];
  if (pkg.length) lines.push(`package ${pkg.join('.')};`, '');
  if (imports.size) lines.push(...[...imports].sort().map((i) => `import ${i};`), '');
  lines.push(...ctx.docBlock(cls.documentation), `${decl} {`, ...body, '}');
  return [{ path: `${ctx.folder(cls)}${name}.java`, content: ctx.join(lines) }];
}
