'use strict';

// Light type model: declared / inferred type names for expressions and a
// small table of common BCL facts (value types, disposables, collections).

const { unparen, callName, callTarget, dotted } = require('./ast');

const ALIASES = {
  Int32: 'int', Int64: 'long', Int16: 'short', Byte: 'byte', SByte: 'sbyte', UInt32: 'uint', UInt64: 'ulong', UInt16: 'ushort',
  Boolean: 'bool', Double: 'double', Single: 'float', Decimal: 'decimal', Char: 'char', String: 'string', Object: 'object',
};
const INTEGRAL = new Set(['int', 'long', 'short', 'byte', 'sbyte', 'uint', 'ulong', 'ushort', 'nint', 'nuint', 'char']);
const NUMERIC = new Set([...INTEGRAL, 'double', 'float', 'decimal']);
const VALUE_TYPES = new Set([...NUMERIC, 'bool', 'DateTime', 'TimeSpan', 'Guid', 'DateTimeOffset', 'DateOnly', 'TimeOnly', 'Point', 'Size', 'Rectangle', 'Color',
  'PointF', 'SizeF', 'RectangleF', 'Vector2', 'Vector3', 'Vector4', 'Quaternion', 'Matrix4x4', 'KeyValuePair', 'ValueTuple', 'CancellationToken',
  'Span', 'ReadOnlySpan', 'Memory', 'ReadOnlyMemory', 'IntPtr', 'UIntPtr', 'Padding', 'Thickness', 'Keys', 'ValueTask', 'Half', 'Int128', 'UInt128', 'BigInteger']);

// creations that must be disposed by the creator (precision first)
const DISPOSABLE_NEW = new Set(['FileStream', 'StreamReader', 'StreamWriter', 'BinaryReader', 'BinaryWriter', 'WebClient', 'TcpClient', 'UdpClient', 'Socket',
  'SqlConnection', 'SqlCommand', 'SqlDataAdapter', 'OleDbConnection', 'OleDbCommand', 'OdbcConnection', 'OdbcCommand', 'NpgsqlConnection', 'NpgsqlCommand',
  'MySqlConnection', 'MySqlCommand', 'SQLiteConnection', 'SQLiteCommand', 'SqliteConnection', 'SqliteCommand', 'OracleConnection',
  'Bitmap', 'Pen', 'SolidBrush', 'LinearGradientBrush', 'TextureBrush', 'HatchBrush', 'GraphicsPath', 'Region', 'Matrix',
  'StringFormat', 'ImageAttributes', 'FileSystemWatcher', 'CryptoStream', 'GZipStream', 'DeflateStream', 'BrotliStream', 'ZipArchive',
  'SHA1Managed', 'SHA256Managed', 'MD5CryptoServiceProvider', 'RNGCryptoServiceProvider', 'AesManaged', 'RijndaelManaged', 'HMACSHA256', 'HMACSHA1', 'HMACSHA512',
  'X509Certificate2', 'Process', 'Ping', 'SmtpClient', 'NamedPipeServerStream', 'NamedPipeClientStream', 'AnonymousPipeServerStream', 'SerialPort',
  'ManualResetEvent', 'AutoResetEvent', 'Semaphore', 'SemaphoreSlim', 'ManualResetEventSlim', 'CountdownEvent', 'ReaderWriterLockSlim',
  'XmlTextReader', 'XmlTextWriter', 'StreamContent', 'HttpResponseMessage', 'HttpRequestMessage', 'CancellationTokenSource', 'Timer', 'MemoryMappedFile']);
// factory calls returning a fresh disposable: 'Type.Method'
const DISPOSABLE_FACTORY = new Set(['File.OpenRead', 'File.OpenWrite', 'File.Open', 'File.Create', 'File.OpenText', 'File.CreateText', 'File.AppendText',
  'Image.FromFile', 'Image.FromStream', 'Bitmap.FromFile', 'Graphics.FromImage', 'Graphics.FromHwnd', 'XmlReader.Create', 'XmlWriter.Create',
  'ZipFile.OpenRead', 'ZipFile.Open', 'MD5.Create', 'SHA1.Create', 'SHA256.Create', 'SHA384.Create', 'SHA512.Create', 'Aes.Create', 'RSA.Create',
  'ECDsa.Create', 'TripleDES.Create', 'DES.Create', 'RC2.Create', 'Rijndael.Create', 'RandomNumberGenerator.Create', 'HMAC.Create',
  'MemoryMappedFile.CreateFromFile', 'MemoryMappedFile.CreateNew', 'Process.Start', 'JsonDocument.Parse']);
const DISPOSABLE_METHODS = new Set(['CreateGraphics', 'ExecuteReader', 'GetResponse', 'CreateCommand', 'BeginTransaction', 'OpenRead', 'OpenWrite', 'OpenText', 'CreateViewAccessor', 'CreateViewStream', 'Clone']);

const COLLECTIONS = new Set(['List', 'Dictionary', 'HashSet', 'Queue', 'Stack', 'SortedDictionary', 'SortedList', 'SortedSet', 'LinkedList', 'Collection',
  'ObservableCollection', 'ConcurrentDictionary', 'ConcurrentQueue', 'ConcurrentStack', 'ConcurrentBag', 'BindingList', 'ArrayList', 'Hashtable',
  'IList', 'ICollection', 'IEnumerable', 'IDictionary', 'IReadOnlyList', 'IReadOnlyCollection', 'IReadOnlyDictionary', 'ISet', 'PriorityQueue']);
const CONCRETE_COLLECTIONS = new Set(['List', 'Dictionary', 'HashSet', 'Queue', 'Stack', 'SortedDictionary', 'SortedList', 'SortedSet', 'LinkedList',
  'ObservableCollection', 'ConcurrentDictionary', 'ConcurrentQueue', 'ConcurrentStack', 'ConcurrentBag', 'BindingList', 'ArrayList', 'Hashtable', 'Collection', 'PriorityQueue']);

function normName(n) { return ALIASES[n] || n; }

// type descriptor from a Type node
function fromTypeNode(t) {
  if (!t) return null;
  if (t.name === 'var' && t.parts && t.parts.length === 1 && !t.args.length) return null;
  return { name: normName(t.name), args: t.args || [], nullable: !!t.nullable, ranks: t.ranks || 0, node: t, qual: t.qual };
}

function isValueTypeName(name, project) {
  if (!name) return false;
  if (VALUE_TYPES.has(normName(name))) return true;
  if (project) {
    const arr = project.typesByName.get(name);
    if (arr && arr.length && arr.every((t) => t.kind === 'struct' || t.kind === 'enum' || t.kind === 'record struct')) return true;
  }
  return false;
}

function isNullableValueType(td, project) {
  return !!td && td.nullable && !td.ranks && isValueTypeName(td.name, project);
}

function isIntegral(td) { return !!td && !td.nullable && !td.ranks && INTEGRAL.has(td.name); }

// expression type inference (best effort)
function typeOf(e, project, depth = 0) {
  e = unparen(e);
  if (!e || depth > 6) return null;
  switch (e.k) {
    case 'Literal':
      switch (e.kind) {
        case 'string': return { name: 'string', args: [] };
        case 'char': return { name: 'char', args: [] };
        case 'bool': return { name: 'bool', args: [] };
        case 'int': {
          const s = e.suffix || '';
          return { name: s.includes('l') ? (s.includes('u') ? 'ulong' : 'long') : s.includes('u') ? 'uint' : 'int', args: [] };
        }
        case 'real': {
          const s = e.suffix || '';
          return { name: s === 'f' ? 'float' : s === 'm' ? 'decimal' : 'double', args: [] };
        }
        default: return null;
      }
    case 'InterpString': return { name: 'string', args: [] };
    case 'Name': {
      if (e.sym) return symType(e.sym, project, depth);
      if (e.msym && e.msym[0] && e.msym[0].type) return fromTypeNode(e.msym[0].type);
      return null;
    }
    case 'Member': {
      if (e.msym && e.msym[0] && e.msym[0].type) return fromTypeNode(e.msym[0].type);
      const rt = typeOf(e.expr, project, depth + 1);
      if (rt && (rt.name === 'string') && e.name === 'Length') return { name: 'int', args: [] };
      if (rt && (rt.ranks) && (e.name === 'Length')) return { name: 'int', args: [] };
      if (rt && CONCRETE_COLLECTIONS.has(rt.name) && e.name === 'Count') return { name: 'int', args: [] };
      const d = dotted(e);
      if (d === 'string.Empty' || d === 'String.Empty') return { name: 'string', args: [] };
      if (rt && rt.info) {
        const m = rt.info.lookup(e.name);
        if (m && m[0] && m[0].type) return fromTypeNode(m[0].type);
      }
      return null;
    }
    case 'Cast': return fromTypeNode(e.type);
    case 'As': { const t = fromTypeNode(e.type); return t ? { ...t, nullable: true } : null; }
    case 'New': {
      if (!e.type) return null;
      const t = fromTypeNode(e.type);
      if (t && project) {
        const info = (project.typesByName.get(e.type.name) || [])[0];
        if (info) t.info = info;
      }
      return t;
    }
    case 'ArrayNew': return e.type ? { ...fromTypeNode(e.type), ranks: e.ranks || 1 } : { name: '?', args: [], ranks: 1 };
    case 'Conditional': return typeOf(e.then, project, depth + 1) || typeOf(e.else, project, depth + 1);
    case 'Binary':
      if (['==', '!=', '<', '>', '<=', '>=', '&&', '||'].includes(e.op)) return { name: 'bool', args: [] };
      if (e.op === '+') {
        const l = typeOf(e.left, project, depth + 1); const r = typeOf(e.right, project, depth + 1);
        if ((l && l.name === 'string') || (r && r.name === 'string')) return { name: 'string', args: [] };
        return arith(l, r);
      }
      if (['-', '*', '/', '%'].includes(e.op)) return arith(typeOf(e.left, project, depth + 1), typeOf(e.right, project, depth + 1));
      if (e.op === '??') return typeOf(e.right, project, depth + 1) || typeOf(e.left, project, depth + 1);
      return null;
    case 'Is': return { name: 'bool', args: [] };
    case 'Unary': if (e.op === '!') return { name: 'bool', args: [] }; return typeOf(e.operand, project, depth + 1);
    case 'Typeof': return { name: 'Type', args: [] };
    case 'Invocation': {
      const n = callName(e);
      const target = callTarget(e);
      const tn = target ? dotted(target) : null;
      if (n === 'ToString' || n === 'Format' && (tn === 'string' || tn === 'String') || n === 'Join' && (tn === 'string' || tn === 'String') ||
        n === 'Trim' || n === 'TrimStart' || n === 'TrimEnd' || n === 'ToUpper' || n === 'ToLower' || n === 'ToUpperInvariant' || n === 'ToLowerInvariant' ||
        n === 'Substring' || n === 'Replace' && target && isStringy(target, project, depth) || n === 'nameof' || n === 'PadLeft' || n === 'PadRight') return { name: 'string', args: [] };
      if (n === 'ToList') return { name: 'List', args: [] };
      if (n === 'ToArray') return { name: '?', args: [], ranks: 1 };
      if (n === 'ToDictionary') return { name: 'Dictionary', args: [] };
      if (n === 'ToHashSet') return { name: 'HashSet', args: [] };
      if (n === 'Count' || n === 'IndexOf' || n === 'LastIndexOf' || n === 'CompareTo' || n === 'Compare' && (tn === 'string' || tn === 'String')) return { name: 'int', args: [] };
      if (['Any', 'All', 'Contains', 'StartsWith', 'EndsWith', 'Equals', 'IsNullOrEmpty', 'IsNullOrWhiteSpace', 'TryParse', 'Exists', 'ContainsKey'].includes(n)) return { name: 'bool', args: [] };
      if (n === 'Split') return { name: 'string', args: [], ranks: 1 };
      // project method
      const ms = resolveCall(e, project);
      if (ms && ms.length && ms[0].node.retType) return fromTypeNode(ms[0].node.retType);
      return null;
    }
    case 'Await': {
      const t = typeOf(e.expr, project, depth + 1);
      if (t && (t.name === 'Task' || t.name === 'ValueTask') && t.args && t.args[0]) return fromTypeNode(t.args[0]);
      return null;
    }
    default: return null;
  }
}

function isStringy(e, project, depth) {
  const t = typeOf(e, project, (depth || 0) + 1);
  return !!t && t.name === 'string';
}

function arith(l, r) {
  if (!l || !r) return l && r ? null : null;
  const order = ['decimal', 'double', 'float', 'ulong', 'long', 'uint', 'int'];
  for (const o of order) if (l.name === o || r.name === o) return { name: o, args: [] };
  if (INTEGRAL.has(l.name) && INTEGRAL.has(r.name)) return { name: 'int', args: [] };
  return null;
}

function symType(sym, project, depth = 0) {
  if (!sym) return null;
  if (sym._type !== undefined) return sym._type;
  sym._type = null; // recursion guard
  let t = fromTypeNode(sym.type);
  if (!t && sym.init) t = typeOf(sym.init, project, depth + 1);
  if (!t && sym.kind === 'foreach' && sym.decl && sym.decl.expr) {
    const ct = typeOf(sym.decl.expr, project, depth + 1);
    if (ct && ct.ranks && ct.name !== '?') t = { name: ct.name, args: ct.args || [] };
    else if (ct && ct.args && ct.args.length === 1 && CONCRETE_COLLECTIONS.has(ct.name)) t = fromTypeNode(ct.args[0]);
  }
  if (t && project && !t.info) {
    const arr = project.typesByName.get(t.name);
    if (arr && arr.length === 1) t.info = arr[0];
  }
  sym._type = t;
  return t;
}

// project methods a call may target: same type (unqualified/this) or receiver of known project type
function resolveCall(inv, project) {
  if (!project) return null;
  const e = unparen(inv.expr);
  const argc = inv.args.length;
  let entries = null;
  if (e.k === 'Name') entries = e.msym || null;
  else if (e.k === 'Member') {
    if (e.msym) entries = e.msym;
    else {
      const rt = typeOf(e.expr, project);
      if (rt && rt.info) entries = rt.info.lookup(e.name);
    }
  }
  if (!entries) return null;
  const ms = entries.filter((m) => m.kind === 'method' && arityOk(m.node, argc));
  return ms.length ? ms : null;
}

function arityOk(m, argc) {
  const ps = m.params || [];
  if (ps.some((p) => p.mods.includes('params'))) return argc >= ps.length - 1;
  const required = ps.filter((p) => !p.def && !p.mods.includes('this')).length;
  const max = ps.filter((p) => !p.mods.includes('this')).length;
  return argc >= required && argc <= max;
}

function isDisposableCreation(e, project) {
  e = unparen(e);
  if (!e) return false;
  if (e.k === 'New' && e.type) {
    const n = e.type.name;
    if (DISPOSABLE_NEW.has(n)) {
      if (n === 'Timer' || n === 'Process') return false; // ambiguous ownership patterns
      return true;
    }
    if (project) {
      const arr = project.typesByName.get(n);
      if (arr && arr.length === 1) {
        const info = arr[0];
        if (info.kind === 'class' && (info.inheritsFrom('IDisposable') || info.inheritsFrom('IAsyncDisposable')) && !info.hasExternalBase()) return true;
      }
    }
    return false;
  }
  if (e.k === 'Invocation') {
    const t = callTarget(e);
    const n = callName(e);
    const tn = t ? dotted(t) : null;
    if (tn && DISPOSABLE_FACTORY.has(`${tn.split('.').pop()}.${n}`) && n !== 'Start') return true;
  }
  return false;
}

module.exports = {
  fromTypeNode, typeOf, symType, isValueTypeName, isNullableValueType, isIntegral, resolveCall, arityOk, isDisposableCreation, normName,
  INTEGRAL, NUMERIC, VALUE_TYPES, COLLECTIONS, CONCRETE_COLLECTIONS, DISPOSABLE_NEW, DISPOSABLE_FACTORY, DISPOSABLE_METHODS,
};
