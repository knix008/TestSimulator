// PHP code generation (PHP 8.1+): one .php file per classifier in the folder
// of its package, with a namespace and "use" lines for other namespaces,
// PHPDoc, extends/implements, typed properties (array for multi-valued,
// ?T for 0..1), constructors, method stubs, abstract members, interfaces and
// native enums. Optional getters and setters for non-public properties.

const VIS = { public: 'public ', protected: 'protected ', private: 'private ', package: 'public ' };
const ZERO = { int: '0', float: '0.0', bool: 'false', string: "''", array: '[]' };
const SCALAR = new Set(['int', 'float', 'bool', 'string', 'array', 'mixed', 'void', 'object', 'callable', 'iterable', 'self', 'null']);

export function generate(cls, ctx) {
  const o = ctx.options;
  const I = ctx.indent;
  const pkg = ctx.packagePath(cls);
  const name = ctx.ident(cls.name);
  const uses = new Set();

  const base = (type) => {
    const target = ctx.resolve(type);
    if (target) {
      const path = ctx.packagePath(target);
      if (path.join('\\') !== pkg.join('\\') && path.length) uses.add(`${path.join('\\')}\\${ctx.ident(target.name)}`);
      return ctx.ident(target.name);
    }
    return ctx.typeName(type);
  };
  /** [type hint, PHPDoc type]. */
  const typeOf = (type, multiplicity) => {
    const text = base(type);
    if (ctx.isMany(multiplicity)) return ['array', `${text || 'mixed'}[]`];
    if (!text) return ['', 'mixed'];
    const hintable = SCALAR.has(text) || /^[A-Z_\\][\w\\]*$/i.test(text);
    if (ctx.isOptional(multiplicity)) return [hintable ? `?${text}` : '', `${text}|null`];
    return [hintable ? text : '', text];
  };
  const hint = (t) => (o.typeHints && t[0] ? `${t[0]} ` : '');
  const value = (text) => (String(text).trim() === 'None' ? 'null' : String(text).trim());
  const doc = (text, extra, indent) => {
    const lines = [...ctx.docLines(text), ...extra];
    if (lines.length === 1 && extra.length === 1) return [`${indent}/** ${lines[0]} */`];
    return lines.length ? [`${indent}/**`, ...lines.map((l) => `${indent} * ${l}`.trimEnd()), `${indent} */`] : [];
  };

  const kind = cls._type === 'UMLInterface' ? 'interface' : cls._type === 'UMLEnumeration' ? 'enum' : 'class';
  const isInterface = kind === 'interface';
  const supers = ctx.superclasses(cls).map((s) => base({ $ref: s._id }));
  const ifaces = ctx.interfaces(cls).map((s) => base({ $ref: s._id }));
  let decl = '';
  if (kind === 'class' && cls.isAbstract) decl += 'abstract ';
  if (kind === 'class' && (cls.isFinalSpecialization || cls.isLeaf)) decl += 'final ';
  decl += `${kind} ${name}`;
  if (isInterface && supers.length) decl += ` extends ${supers.join(', ')}`;
  if (kind === 'class' && supers.length) decl += ` extends ${supers[0]}`;
  if (!isInterface && ifaces.length) decl += ` implements ${ifaces.join(', ')}`;

  const body = [];
  if (kind === 'enum') {
    for (const l of cls.literals ?? []) body.push(...doc(l.documentation, [], I(1)), `${I(1)}case ${ctx.ident(l.name, 'VALUE')};`);
    if ((cls.literals ?? []).length) body.push('');
  }
  const fields = ctx.fieldsOf(cls);
  if (!isInterface && kind !== 'enum') {
    for (const f of fields) {
      const t = typeOf(f.type, f.multiplicity);
      body.push(...doc(f.documentation, [`@var ${t[1]}`], I(1)));
      let line = I(1) + (VIS[f.visibility] ?? 'public ');
      if (f.isStatic) line += 'static ';
      if (f.isReadOnly && !f.isStatic && o.typeHints && t[0]) line += 'readonly ';
      line += `${hint(t)}$${f.name}`;
      const init = f.defaultValue !== '' ? value(f.defaultValue) : ctx.isMany(f.multiplicity) && !(f.isReadOnly && o.typeHints) ? '[]' : '';
      if (init) line += ` = ${init}`;
      body.push(`${line};`);
    }
    if (fields.length) body.push('');
  } else if (isInterface) {
    for (const f of fields.filter((x) => x.isStatic || x.defaultValue !== '')) body.push(`${I(1)}const ${f.name.toUpperCase()} = ${value(f.defaultValue) || 'null'};`);
  }

  for (const op of ctx.operationsOf(cls)) {
    const params = op.params.map((p) => {
      const t = typeOf(p.type, p.multiplicity);
      const byRef = p.direction === 'out' || p.direction === 'inout' ? '&' : '';
      return `${hint(t)}${byRef}$${p.name}${p.defaultValue !== '' ? ` = ${value(p.defaultValue)}` : ''}`;
    }).join(', ');
    const tags = op.params.map((p) => `@param ${typeOf(p.type, p.multiplicity)[1]} $${p.name}`);
    if (op.isConstructor) {
      body.push(...doc(op.documentation, tags, I(1)), `${I(1)}${VIS[op.visibility]}function __construct(${params})`, `${I(1)}{`);
      if (supers.length) body.push(`${I(2)}parent::__construct();`);
      body.push(`${I(1)}}`, '');
      continue;
    }
    const rt = op.returnType ? typeOf(op.returnType, op.returnMultiplicity) : ['void', 'void'];
    body.push(...doc(op.documentation, [...tags, ...(op.returnType ? [`@return ${rt[1]}`] : [])], I(1)));
    let head = I(1);
    if (!isInterface && op.isAbstract) head += 'abstract ';
    head += VIS[op.visibility] ?? 'public ';
    if (op.isStatic) head += 'static ';
    head += `function ${op.name}(${params})${o.typeHints && rt[0] ? `: ${rt[0]}` : ''}`;
    if (isInterface || op.isAbstract) { body.push(`${head};`, ''); continue; }
    body.push(head, `${I(1)}{`);
    if (o.todoComments) body.push(`${I(2)}// TODO implement`);
    if (op.returnType) body.push(`${I(2)}return ${ZERO[rt[0].replace('?', '')] ?? 'null'};`);
    body.push(`${I(1)}}`, '');
  }

  if (o.getterSetter && kind === 'class') {
    for (const f of fields) {
      if (f.visibility === 'public' || f.isStatic) continue;
      const t = typeOf(f.type, f.multiplicity);
      const cap = ctx.capitalize(f.name);
      body.push(`${I(1)}public function get${cap}()${o.typeHints && t[0] ? `: ${t[0]}` : ''}`, `${I(1)}{`, `${I(2)}return $this->${f.name};`, `${I(1)}}`, '');
      if (!f.isReadOnly) body.push(`${I(1)}public function set${cap}(${hint(t)}$${f.name}): void`, `${I(1)}{`, `${I(2)}$this->${f.name} = $${f.name};`, `${I(1)}}`, '');
    }
  }
  while (body.length && body[body.length - 1] === '') body.pop();

  const lines = ['<?php', '', ...ctx.header('//')];
  if (pkg.length) lines.push(`namespace ${pkg.join('\\')};`, '');
  if (uses.size) lines.push(...[...uses].sort().map((u) => `use ${u};`), '');
  lines.push(...doc(cls.documentation, [], ''), decl, '{', ...body, '}');
  return [{ path: `${ctx.folder(cls)}${name}.php`, content: ctx.join(lines) }];
}
