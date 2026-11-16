// Reader for the Java Object Serialization Stream protocol (java.io,
// ObjectOutputStream, stream version 5): what a Java program writes with
// writeObject(). Used for Sweet Home 3D files saved before version 5.3, whose
// home is only stored that way.
//
// The stream describes every class it uses (name, flags, field names and
// types, superclass), so objects are read by field name without knowing the
// classes in advance. A class with its own writeObject() adds "annotation"
// data after its fields — raw block data and further objects — which is
// kept as a list (`annotations[className]`); the usual collections
// (ArrayList, HashMap, HashSet, LinkedList, TreeMap, Vector…) are turned
// into JS arrays / Maps from it.
//
// Result objects: { $class: "pkg.Name", $fields: {name: value} (all classes of
// the hierarchy, most derived wins), $byClass: {className: {fields}},
// $annotations: {className: [Uint8Array | value]} } — or a string, a number
// array / array (Java arrays), {$enum, name} for enum constants, {$class:
// "java.lang.Class", name} for class objects, null.

const TC = {
  NULL: 0x70, REFERENCE: 0x71, CLASSDESC: 0x72, OBJECT: 0x73, STRING: 0x74, ARRAY: 0x75, CLASS: 0x76,
  BLOCKDATA: 0x77, ENDBLOCKDATA: 0x78, RESET: 0x79, BLOCKDATALONG: 0x7a, EXCEPTION: 0x7b, LONGSTRING: 0x7c,
  PROXYCLASSDESC: 0x7d, ENUM: 0x7e,
};
const SC = { WRITE_METHOD: 0x01, SERIALIZABLE: 0x02, EXTERNALIZABLE: 0x04, BLOCK_DATA: 0x08, ENUM: 0x10 };
const BASE_HANDLE = 0x7e0000;

export class JavaSerialError extends Error {}

// Java "modified UTF-8" (NUL as C0 80, supplementary characters as surrogate pairs).
export function decodeModifiedUtf8(b, start = 0, end = b.length) {
  let s = "";
  let i = start;
  const parts = [];
  while (i < end) {
    const c = b[i++];
    let code;
    if (c < 0x80) code = c;
    else if ((c & 0xe0) === 0xc0) code = ((c & 0x1f) << 6) | (b[i++] & 0x3f);
    else if ((c & 0xf0) === 0xe0) { code = ((c & 0x0f) << 12) | ((b[i] & 0x3f) << 6) | (b[i + 1] & 0x3f); i += 2; }
    else code = 0xfffd;
    s += String.fromCharCode(code);
    if (s.length > 4096) { parts.push(s); s = ""; }
  }
  parts.push(s);
  return parts.join("");
}

export class JavaObjectReader {
  constructor(bytes) {
    this.b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.dv = new DataView(this.b.buffer, this.b.byteOffset, this.b.byteLength);
    this.p = 0;
    this.handles = [];
    this.depth = 0;
    if (this.b.length < 4 || this.u16() !== 0xaced) throw new JavaSerialError("not a Java serialization stream (no ACED magic)");
    const version = this.u16();
    if (version !== 5) throw new JavaSerialError(`unsupported serialization stream version ${version}`);
  }

  need(n) { if (this.p + n > this.b.length) throw new JavaSerialError(`unexpected end of stream at byte ${this.p}`); }
  u8() { this.need(1); return this.b[this.p++]; }
  i8() { this.need(1); return this.dv.getInt8(this.p++); }
  u16() { this.need(2); const v = this.dv.getUint16(this.p); this.p += 2; return v; }
  i16() { this.need(2); const v = this.dv.getInt16(this.p); this.p += 2; return v; }
  i32() { this.need(4); const v = this.dv.getInt32(this.p); this.p += 4; return v; }
  i64() { this.need(8); const v = this.dv.getBigInt64(this.p); this.p += 8; return v; }
  f32() { this.need(4); const v = this.dv.getFloat32(this.p); this.p += 4; return v; }
  f64() { this.need(8); const v = this.dv.getFloat64(this.p); this.p += 8; return v; }
  utf() { const n = this.u16(); this.need(n); const s = decodeModifiedUtf8(this.b, this.p, this.p + n); this.p += n; return s; }
  longUtf() { const n = Number(this.i64()); this.need(n); const s = decodeModifiedUtf8(this.b, this.p, this.p + n); this.p += n; return s; }

  newHandle(v) { this.handles.push(v); return this.handles.length - 1; }
  setHandle(h, v) { this.handles[h] = v; }

  // Every top-level content of the stream (objects and block data).
  readAll() {
    const out = [];
    while (this.p < this.b.length) out.push(this.content());
    return out;
  }

  // The next top-level object (skipping block data).
  readObject() {
    for (;;) {
      const v = this.content();
      if (!(v instanceof Uint8Array)) return v;
    }
  }

  content() {
    const tc = this.b[this.p];
    if (tc === TC.BLOCKDATA) { this.p++; const n = this.u8(); this.need(n); const d = this.b.subarray(this.p, this.p + n); this.p += n; return d; }
    if (tc === TC.BLOCKDATALONG) { this.p++; const n = this.i32(); this.need(n); const d = this.b.subarray(this.p, this.p + n); this.p += n; return d; }
    return this.object();
  }

  object() {
    const tc = this.u8();
    switch (tc) {
      case TC.NULL: return null;
      case TC.REFERENCE: {
        const h = this.i32() - BASE_HANDLE;
        if (h < 0 || h >= this.handles.length) throw new JavaSerialError(`bad back reference ${h} at byte ${this.p}`);
        return this.handles[h];
      }
      case TC.STRING: { const s = this.utf(); this.newHandle(s); return s; }
      case TC.LONGSTRING: { const s = this.longUtf(); this.newHandle(s); return s; }
      case TC.CLASSDESC: this.p--; return this.classDesc();
      case TC.PROXYCLASSDESC: this.p--; return this.classDesc();
      case TC.CLASS: { const desc = this.classDesc(); const o = { $class: "java.lang.Class", name: desc ? desc.name : null }; this.newHandle(o); return o; }
      case TC.ARRAY: return this.array();
      case TC.ENUM: {
        const desc = this.classDesc();
        const o = { $enum: desc ? desc.name : "", name: null };
        const h = this.newHandle(o);
        o.name = this.object();
        this.setHandle(h, o);
        return o;
      }
      case TC.OBJECT: return this.newObject();
      case TC.RESET: this.handles = []; return this.object();
      case TC.EXCEPTION: throw new JavaSerialError("the stream holds an exception written while serializing");
      default: throw new JavaSerialError(`unknown type code 0x${tc.toString(16)} at byte ${this.p - 1}`);
    }
  }

  // classDesc: TC_CLASSDESC | TC_PROXYCLASSDESC | TC_NULL | TC_REFERENCE.
  classDesc() {
    const tc = this.u8();
    if (tc === TC.NULL) return null;
    if (tc === TC.REFERENCE) {
      const h = this.i32() - BASE_HANDLE;
      const d = this.handles[h];
      if (!d || !d.$desc) throw new JavaSerialError(`back reference ${h} is not a class description`);
      return d;
    }
    if (tc === TC.PROXYCLASSDESC) {
      const desc = { $desc: true, name: "$Proxy", flags: SC.SERIALIZABLE, fields: [], interfaces: [] };
      this.newHandle(desc);
      const n = this.i32();
      for (let i = 0; i < n; i++) desc.interfaces.push(this.utf());
      desc.annotation = this.annotation();
      desc.super = this.classDesc();
      return desc;
    }
    if (tc !== TC.CLASSDESC) throw new JavaSerialError(`expected a class description, found 0x${tc.toString(16)} at byte ${this.p - 1}`);
    const name = this.utf();
    const suid = this.i64();
    const desc = { $desc: true, name, suid, flags: 0, fields: [] };
    this.newHandle(desc);
    desc.flags = this.u8();
    const n = this.i16();
    for (let i = 0; i < n; i++) {
      const type = String.fromCharCode(this.u8());
      const fname = this.utf();
      let cls = null;
      if (type === "L" || type === "[") cls = this.object(); // the field's type name (a String)
      desc.fields.push({ type, name: fname, cls });
    }
    desc.annotation = this.annotation();
    desc.super = this.classDesc();
    return desc;
  }

  // Block data and objects up to TC_ENDBLOCKDATA.
  annotation() {
    const out = [];
    for (;;) {
      if (this.b[this.p] === TC.ENDBLOCKDATA) { this.p++; return out; }
      out.push(this.content());
    }
  }

  array() {
    const desc = this.classDesc();
    const n = this.i32();
    if (n < 0 || n > this.b.length * 8) throw new JavaSerialError(`bad array length ${n}`);
    const t = desc && desc.name.length > 1 ? desc.name[1] : "L";
    let arr;
    const h = this.newHandle(null);
    switch (t) {
      case "B": arr = new Int8Array(n); for (let i = 0; i < n; i++) arr[i] = this.i8(); break;
      case "Z": arr = new Array(n); for (let i = 0; i < n; i++) arr[i] = this.u8() !== 0; break;
      case "C": arr = new Array(n); for (let i = 0; i < n; i++) arr[i] = String.fromCharCode(this.u16()); break;
      case "S": arr = new Int16Array(n); for (let i = 0; i < n; i++) arr[i] = this.i16(); break;
      case "I": arr = new Int32Array(n); for (let i = 0; i < n; i++) arr[i] = this.i32(); break;
      case "J": arr = new Array(n); for (let i = 0; i < n; i++) arr[i] = Number(this.i64()); break;
      case "F": arr = new Float32Array(n); for (let i = 0; i < n; i++) arr[i] = this.f32(); break;
      case "D": arr = new Float64Array(n); for (let i = 0; i < n; i++) arr[i] = this.f64(); break;
      default: {
        arr = new Array(n);
        this.setHandle(h, arr); // elements may refer back to the array
        for (let i = 0; i < n; i++) arr[i] = this.object();
      }
    }
    this.setHandle(h, arr);
    return arr;
  }

  value(type) {
    switch (type) {
      case "B": return this.i8();
      case "C": return String.fromCharCode(this.u16());
      case "D": return this.f64();
      case "F": return this.f32();
      case "I": return this.i32();
      case "J": return Number(this.i64());
      case "S": return this.i16();
      case "Z": return this.u8() !== 0;
      default: return this.object();
    }
  }

  newObject() {
    const desc = this.classDesc();
    if (!desc) throw new JavaSerialError("object without a class description");
    const o = { $class: desc.name, $fields: {}, $byClass: {}, $annotations: {} };
    this.newHandle(o);
    if (++this.depth > 2000) throw new JavaSerialError("objects nested too deep");
    // Superclass first.
    const chain = [];
    for (let d = desc; d; d = d.super) chain.unshift(d);
    for (const d of chain) {
      const own = {};
      if (d.flags & SC.EXTERNALIZABLE) {
        if (!(d.flags & SC.BLOCK_DATA)) throw new JavaSerialError(`externalizable class ${d.name} written in the old protocol`);
        o.$annotations[d.name] = this.annotation();
      } else if (d.flags & SC.SERIALIZABLE) {
        for (const f of d.fields) own[f.name] = this.value(f.type);
        if (d.flags & SC.WRITE_METHOD) o.$annotations[d.name] = this.annotation();
      }
      o.$byClass[d.name] = own;
      Object.assign(o.$fields, own);
    }
    this.depth--;
    return o;
  }
}

// Read the first object of a stream.
export function readJavaObject(bytes) {
  return new JavaObjectReader(bytes).readObject();
}

// ---------------------------------------------------------------- plain values
const LISTS = /^java\.util\.(?:ArrayList|LinkedList|ArrayDeque|HashSet|LinkedHashSet|TreeSet|PriorityQueue|concurrent\.CopyOnWriteArrayList)$/;
const MAPS = /^java\.util\.(?:HashMap|LinkedHashMap|TreeMap|Hashtable|IdentityHashMap|WeakHashMap|Properties|concurrent\.ConcurrentHashMap)$/;
const BOXES = /^java\.lang\.(?:Integer|Long|Short|Byte|Float|Double|Boolean|Character)$/;

const objectsOf = (items) => (items || []).filter((x) => !(x instanceof Uint8Array));

// A Java collection / boxed value / string as plain JS: lists and sets →
// arrays, maps → Map, boxed numbers → numbers. Anything else is returned as is.
export function javaValue(v) {
  if (v === null || v === undefined || typeof v !== "object" || !v.$class) return v;
  const c = v.$class;
  if (BOXES.test(c)) return v.$fields.value;
  if (LISTS.test(c)) return objectsOf(v.$annotations[c] || Object.values(v.$annotations)[0]);
  if (c === "java.util.Vector" || c === "java.util.Stack") {
    const data = v.$fields.elementData || [];
    return data.slice(0, v.$fields.elementCount ?? data.length);
  }
  if (MAPS.test(c)) {
    const items = objectsOf(v.$annotations[c] || Object.values(v.$annotations)[0]);
    const m = new Map();
    for (let i = 0; i + 1 < items.length; i += 2) m.set(items[i], items[i + 1]);
    return m;
  }
  if (/^java\.util\.Collections\$(?:Unmodifiable|Synchronized|Checked)(?:Random)?(?:List|Collection|Set|SortedSet)$/.test(c)) return javaValue(v.$fields.c || v.$fields.list);
  if (/^java\.util\.Collections\$(?:Unmodifiable|Synchronized)(?:Sorted)?Map$/.test(c)) return javaValue(v.$fields.m);
  if (c === "java.util.Arrays$ArrayList") return v.$fields.a || [];
  if (/^java\.util\.Collections\$Empty(?:List|Set)$/.test(c)) return [];
  if (c === "java.util.Collections$EmptyMap") return new Map();
  if (c === "java.util.Collections$SingletonList" || c === "java.util.Collections$SingletonSet") return [v.$fields.element];
  if (c === "java.math.BigDecimal") {
    const bi = v.$fields.intVal;
    const mag = bi && bi.$fields ? bi.$fields.magnitude : null;
    let n = 0;
    if (mag) for (const byte of mag) n = n * 256 + (byte & 0xff);
    if (bi && bi.$fields && bi.$fields.signum < 0) n = -n;
    return n / Math.pow(10, v.$fields.scale || 0);
  }
  if (c === "java.net.URL") {
    const f = v.$fields;
    const port = f.port >= 0 ? `:${f.port}` : "";
    const auth = f.authority != null ? f.authority : f.host ? `${f.host}${port}` : null;
    return `${f.protocol}:${auth ? `//${auth}` : ""}${f.file || ""}${f.ref ? `#${f.ref}` : ""}`;
  }
  return v;
}
