// Python code generation: one module per classifier (ClassName.py in the
// folder of its package). Classes get docstrings, base classes, ABC and
// @abstractmethod for abstract operations, class attributes for static
// attributes, instance attributes set in __init__ (with type hints when
// options.typeHints), Generic[T] for template parameters; interfaces become
// ABCs with abstract methods only and enumerations Enum subclasses. Classes
// of other packages are imported with "from pkg.Name import Name".

const ZERO = { int: '0', float: '0.0', bool: 'False', str: "''" };

export function generate(cls, ctx) {
  const o = ctx.options;
  const I = ctx.indent;
  const pkg = ctx.packagePath(cls);
  const name = ctx.ident(cls.name);
  const imports = new Map(); // module → Set of names
  const need = (module, what) => { if (!imports.has(module)) imports.set(module, new Set()); imports.get(module).add(what); };

  const base = (type) => {
    const target = ctx.resolve(type);
    if (target && target._id !== cls._id) need([...ctx.packagePath(target), ctx.ident(target.name)].join('.'), ctx.ident(target.name));
    if (target && target._id === cls._id) return `'${name}'`;
    return ctx.typeName(type) || 'object';
  };
  const typeOf = (type, multiplicity) => {
    const text = base(type);
    if (ctx.isMany(multiplicity)) {
      if (o.collection === 'List') { need('typing', 'List'); return `List[${text}]`; }
      return `${o.collection || 'list'}[${text}]`;
    }
    if (ctx.isOptional(multiplicity)) { need('typing', 'Optional'); return `Optional[${text}]`; }
    return text;
  };
  const visName = (n, visibility) => (visibility === 'private' ? `__${n}` : visibility === 'protected' ? `_${n}` : n);
  const docstring = (text, indent) => {
    const lines = ctx.docLines(text);
    if (!lines.length) return [];
    if (lines.length === 1) return [`${indent}"""${lines[0]}"""`];
    return [`${indent}"""${lines[0]}`, ...lines.slice(1).map((l) => `${indent}${l}`.trimEnd()), `${indent}"""`];
  };
  const value = (text) => {
    const t = String(text).trim();
    if (t === 'true') return 'True';
    if (t === 'false') return 'False';
    if (t === 'null') return 'None';
    return t;
  };

  const bases = [];
  const body = [];
  const tparams = ctx.templateParams(cls);
  const preamble = [];
  for (const t of tparams) { need('typing', 'TypeVar'); preamble.push(`${t.name} = TypeVar('${t.name}'${t.bound ? `, bound='${t.bound}'` : ''})`); }

  if (cls._type === 'UMLEnumeration') {
    need('enum', 'Enum'); need('enum', 'auto');
    bases.push('Enum');
    body.push(...docstring(cls.documentation, I(1)));
    for (const l of cls.literals ?? []) body.push(`${I(1)}${ctx.ident(l.name, 'VALUE')} = auto()`);
  } else {
    for (const s of ctx.superclasses(cls)) bases.push(base({ $ref: s._id }));
    for (const s of ctx.interfaces(cls)) bases.push(base({ $ref: s._id }));
    const ops = ctx.operationsOf(cls);
    const isInterface = cls._type === 'UMLInterface';
    const abstract = isInterface || cls.isAbstract || ops.some((op) => op.isAbstract);
    if (abstract) { need('abc', 'ABC'); bases.push('ABC'); }
    if (tparams.length) { need('typing', 'Generic'); bases.push(`Generic[${tparams.map((t) => t.name).join(', ')}]`); }
    body.push(...docstring(cls.documentation, I(1)));

    const fields = ctx.fieldsOf(cls);
    const statics = fields.filter((f) => f.isStatic);
    const instance = fields.filter((f) => !f.isStatic);
    for (const f of statics) {
      // ClassVar: an annotated class attribute without it is an instance field (dataclass rule).
      if (o.typeHints) need('typing', 'ClassVar');
      const hint = o.typeHints ? `: ClassVar[${typeOf(f.type, f.multiplicity)}]` : '';
      body.push(...docComment(f.documentation, I(1), ctx), `${I(1)}${visName(f.name, f.visibility)}${hint} = ${f.defaultValue !== '' ? value(f.defaultValue) : 'None'}`);
    }
    if (statics.length) body.push('');

    const ctor = ops.find((op) => op.isConstructor);
    if (instance.length || ctor) {
      const params = ctor ? ctor.params.map((p) => param(p)) : [];
      body.push(`${I(1)}def __init__(${['self', ...params].join(', ')}):`);
      if (ctor) body.push(...docstring(ctor.documentation, I(2)));
      if (ctx.superclasses(cls).length) body.push(`${I(2)}super().__init__()`);
      for (const f of instance) {
        const hint = o.typeHints ? `: ${typeOf(f.type, f.multiplicity)}` : '';
        const init = f.defaultValue !== '' ? value(f.defaultValue) : ctx.isMany(f.multiplicity) ? '[]' : 'None';
        body.push(...docComment(f.documentation, I(2), ctx), `${I(2)}self.${visName(f.name, f.visibility)}${hint} = ${init}`);
      }
      if (!instance.length && !ctx.superclasses(cls).length) body.push(`${I(2)}pass`);
      body.push('');
    }

    for (const op of ops) {
      if (op.isConstructor) continue;
      const isAbstract = isInterface || op.isAbstract;
      if (op.isStatic) body.push(`${I(1)}@staticmethod`);
      if (isAbstract) { need('abc', 'abstractmethod'); body.push(`${I(1)}@abstractmethod`); }
      const params = [...(op.isStatic ? [] : ['self']), ...op.params.map((p) => param(p))];
      const ret = o.typeHints ? ` -> ${op.returnType ? typeOf(op.returnType, op.returnMultiplicity) : 'None'}` : '';
      body.push(`${I(1)}def ${visName(op.name, op.visibility)}(${params.join(', ')})${ret}:`);
      const doc = docstring(op.documentation, I(2));
      body.push(...doc);
      if (isAbstract || !op.returnType) body.push(`${I(2)}${doc.length && isAbstract ? '...' : 'pass'}`);
      else body.push(`${I(2)}return ${ZERO[ctx.typeName(op.returnType)] ?? 'None'}`);
      body.push('');
    }
  }
  while (body.length && body[body.length - 1] === '') body.pop();
  if (!body.length) body.push(`${I(1)}pass`);

  function param(p) {
    const hint = o.typeHints ? `: ${typeOf(p.type, p.multiplicity)}` : '';
    return `${p.name}${hint}${p.defaultValue !== '' ? ` = ${value(p.defaultValue)}` : ''}`;
  }

  const lines = [...ctx.header('#')];
  const sorted = [...imports.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  for (const module of sorted) lines.push(`from ${module} import ${[...imports.get(module)].sort().join(', ')}`);
  if (sorted.length) lines.push('', '');
  if (preamble.length) lines.push(...preamble, '', '');
  lines.push(`class ${name}${bases.length ? `(${bases.join(', ')})` : ''}:`, ...body);
  return [{ path: `${pkg.map((p) => `${p}/`).join('')}${name}.py`, content: ctx.join(lines) }];
}

/** Standard library imports first. */
const rank = (module) => (['abc', 'enum', 'typing'].includes(module) ? 0 : 1);

function docComment(text, indent, ctx) {
  return ctx.docLines(text).map((l) => `${indent}# ${l}`.trimEnd());
}
