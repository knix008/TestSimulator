// TypeScript code generation: one .ts module per classifier in the folder of
// its package, exporting a class, interface or enum, with relative imports of
// the classifiers it uses, JSDoc comments, generics, extends/implements,
// properties (optional "?" for 0..1, T[] for multi-valued), a constructor,
// method stubs and abstract members.

const VIS = { public: 'public ', protected: 'protected ', private: 'private ', package: '' };
const ZERO = { number: '0', boolean: 'false', string: "''" };

export function generate(cls, ctx) {
  const o = ctx.options;
  const I = ctx.indent;
  const pkg = ctx.packagePath(cls);
  const name = ctx.ident(cls.name);
  const imports = new Map(); // name → module path

  const base = (type) => {
    const target = ctx.resolve(type);
    if (target && target._id !== cls._id) imports.set(ctx.ident(target.name), relativeModule(pkg, ctx.packagePath(target), ctx.ident(target.name)));
    return ctx.typeName(type) || 'any';
  };
  const typeOf = (type, multiplicity) => {
    const text = base(type);
    if (!ctx.isMany(multiplicity)) return text;
    return o.collection === 'Array' ? `Array<${text}>` : /[|&\s]/.test(text) ? `(${text})[]` : `${text}[]`;
  };
  const generics = (params) => (params.length ? `<${params.map((t) => `${t.name}${t.bound ? ` extends ${t.bound}` : ''}${t.defaultValue ? ` = ${t.defaultValue}` : ''}`).join(', ')}>` : '');
  const param = (p) => `${p.name}${ctx.isOptional(p.multiplicity) && p.defaultValue === '' ? '?' : ''}: ${typeOf(p.type, p.multiplicity)}${p.defaultValue !== '' ? ` = ${p.defaultValue}` : ''}`;

  const body = [];
  let decl;
  if (cls._type === 'UMLEnumeration') {
    decl = `export enum ${name}`;
    const literals = cls.literals ?? [];
    literals.forEach((l, i) => body.push(...ctx.docBlock(l.documentation, I(1)), `${I(1)}${ctx.ident(l.name, 'Value')}${i < literals.length - 1 ? ',' : ''}`));
  } else if (cls._type === 'UMLInterface') {
    const supers = [...ctx.superclasses(cls), ...ctx.interfaces(cls)].map((s) => base({ $ref: s._id }));
    decl = `export interface ${name}${generics(ctx.templateParams(cls))}${supers.length ? ` extends ${supers.join(', ')}` : ''}`;
    for (const f of ctx.fieldsOf(cls)) {
      body.push(...ctx.docBlock(f.documentation, I(1)), `${I(1)}${f.isReadOnly ? 'readonly ' : ''}${f.name}${ctx.isOptional(f.multiplicity) ? '?' : ''}: ${typeOf(f.type, f.multiplicity)};`);
    }
    for (const op of ctx.operationsOf(cls)) {
      body.push(...ctx.docBlock(op.documentation, I(1)));
      body.push(`${I(1)}${op.name}${generics(op.templateParameters)}(${op.params.map(param).join(', ')}): ${op.returnType ? typeOf(op.returnType, op.returnMultiplicity) : 'void'};`);
    }
  } else {
    const supers = ctx.superclasses(cls).map((s) => base({ $ref: s._id }));
    const ifaces = ctx.interfaces(cls).map((s) => base({ $ref: s._id }));
    decl = `export ${cls.isAbstract ? 'abstract ' : ''}class ${name}${generics(ctx.templateParams(cls))}`;
    if (supers.length) decl += ` extends ${supers[0]}`;
    if (ifaces.length) decl += ` implements ${ifaces.join(', ')}`;
    const fields = ctx.fieldsOf(cls);
    for (const f of fields) {
      body.push(...ctx.docBlock(f.documentation, I(1)));
      let line = I(1) + (VIS[f.visibility] ?? '');
      if (f.isStatic) line += 'static ';
      if (f.isReadOnly) line += 'readonly ';
      const optional = ctx.isOptional(f.multiplicity) && f.defaultValue === '';
      line += `${f.name}${optional ? '?' : ''}: ${typeOf(f.type, f.multiplicity)}`;
      if (f.defaultValue !== '') line += ` = ${f.defaultValue}`;
      body.push(`${line};`);
    }
    if (fields.length) body.push('');
    for (const op of ctx.operationsOf(cls)) {
      body.push(...ctx.docBlock(op.documentation, I(1)));
      const params = op.params.map(param).join(', ');
      if (op.isConstructor) {
        body.push(`${I(1)}${VIS[op.visibility] ?? ''}constructor(${params}) {`);
        if (supers.length) body.push(`${I(2)}super();`);
        body.push(`${I(1)}}`, '');
        continue;
      }
      const ret = op.returnType ? typeOf(op.returnType, op.returnMultiplicity) : 'void';
      let head = I(1) + (VIS[op.visibility] ?? '');
      if (op.isStatic) head += 'static ';
      if (op.isAbstract) head += 'abstract ';
      head += `${op.name}${generics(op.templateParameters)}(${params}): ${ret}`;
      if (op.isAbstract) { body.push(`${head};`, ''); continue; }
      body.push(`${head} {`);
      if (o.todoComments) body.push(`${I(2)}// TODO implement`);
      if (ret !== 'void') body.push(`${I(2)}${ZERO[ret] ? `return ${ZERO[ret]};` : "throw new Error('Not implemented');"}`);
      body.push(`${I(1)}}`, '');
    }
  }
  while (body.length && body[body.length - 1] === '') body.pop();

  const lines = [...ctx.header('//')];
  if (imports.size) lines.push(...[...imports].sort((a, b) => a[0].localeCompare(b[0])).map(([n, m]) => `import { ${n} } from '${m}';`), '');
  lines.push(...ctx.docBlock(cls.documentation), `${decl} {`, ...body, '}');
  return [{ path: `${ctx.folder(cls)}${name}.ts`, content: ctx.join(lines) }];
}

/** './Name' or '../other/Name' from one package folder to another. */
function relativeModule(from, to, name) {
  let common = 0;
  while (common < from.length && common < to.length && from[common] === to[common]) common += 1;
  const up = from.length - common;
  return `${up ? '../'.repeat(up) : './'}${to.slice(common).map((p) => `${p}/`).join('')}${name}`;
}
