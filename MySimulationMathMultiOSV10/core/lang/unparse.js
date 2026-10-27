// AST -> compact source text (used for anonymous function text and func2str).
const PREC = { '||': 1, '&&': 2, '|': 3, '&': 4, '<': 5, '<=': 5, '>': 5, '>=': 5, '==': 5, '~=': 5, ':': 6, '+': 7, '-': 7, '*': 8, '/': 8, '\\': 8, '.*': 8, './': 8, '.\\': 8, '^': 10, '.^': 10 };

function numText(n) {
  let s;
  if (n.cls && n.cls !== 'double') s = (n.v >>> 0).toString(16).toUpperCase().replace(/^/, '0x');
  else if (Number.isInteger(n.v) || !Number.isFinite(n.v)) s = String(n.v).replace('Infinity', 'Inf');
  else s = String(n.v);
  return n.imag ? s + 'i' : s;
}

export function unparse(n, parentPrec = 0) {
  switch (n.t) {
    case 'num': return n.v < 0 && parentPrec > 7 ? `(${numText(n)})` : numText(n);
    case 'str': return `'${n.v.replace(/'/g, "''")}'`;
    case 'dstr': return `"${n.v.replace(/"/g, '""')}"`;
    case 'id': return n.name;
    case 'end': return 'end';
    case 'colon': return ':';
    case 'tilde': return '~';
    case 'paren': return `(${unparse(n.e)})`;
    case 'bin': {
      const p = PREC[n.op];
      const s = `${unparse(n.a, p)}${n.op}${unparse(n.b, p + 1)}`;
      return p < parentPrec ? `(${s})` : s;
    }
    case 'andand': case 'oror': {
      const op = n.t === 'andand' ? '&&' : '||';
      const p = PREC[op];
      const s = `${unparse(n.a, p)}${op}${unparse(n.b, p + 1)}`;
      return p < parentPrec ? `(${s})` : s;
    }
    case 'un': { const s = `${n.op}${unparse(n.a, 9)}`; return parentPrec > 9 ? `(${s})` : s; }
    case 'post': return `${unparse(n.a, 11)}${n.op}`;
    case 'range': {
      const s = n.step ? `${unparse(n.a, 7)}:${unparse(n.step, 7)}:${unparse(n.b, 7)}` : `${unparse(n.a, 7)}:${unparse(n.b, 7)}`;
      return parentPrec > 6 ? `(${s})` : s;
    }
    case 'matrix': return `[${n.rows.map((r) => r.map((e) => unparse(e)).join(',')).join(';')}]`;
    case 'cellLit': return `{${n.rows.map((r) => r.map((e) => unparse(e)).join(',')).join(';')}}`;
    case 'anon': return `@(${n.params.join(',')})${unparse(n.body)}`;
    case 'fh': return `@${n.name}`;
    case 'meta': return `?${n.name}`;
    case 'super': return `${n.name}@${n.sup}(${n.args.map((a) => unparse(a)).join(',')})`;
    case 'index': {
      let s = unparse(n.base, 11);
      for (const c of n.chain) {
        if (c.k === '()') s += `(${c.args.map((a) => unparse(a)).join(',')})`;
        else if (c.k === '{}') s += `{${c.args.map((a) => unparse(a)).join(',')}}`;
        else if (c.k === '.') s += `.${c.name}`;
        else s += `.(${unparse(c.e)})`;
      }
      return s;
    }
    default: return `<${n.t}>`;
  }
}
