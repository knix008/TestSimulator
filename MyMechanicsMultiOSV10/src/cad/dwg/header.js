// The DWG header variables (Open Design Specification chapter 9) as one table that both reads and writes them, in
// file order, each with the releases it appears in. The section: a sentinel, a size, the bit-coded variables, a
// CRC (seed 0xC0C1) and an end sentinel. Read and written here for R13–R2004 (variables inline); R2007+ keep
// their strings and handles in separate streams (not needed by the reader, which goes by the object map).
import { BitReader, BitWriter, R2000, R2004, R2007, R2010, R2013, crc8, dwgError } from './bits.js';

export const HEADER_START = [0xcf, 0x7b, 0x1f, 0x23, 0xfd, 0xde, 0x38, 0xa9, 0x5f, 0x7c, 0x68, 0xb8, 0x4e, 0x6d, 0x33, 0x5f];
export const HEADER_END = [0x30, 0x84, 0xe0, 0xdc, 0x02, 0x21, 0xc7, 0x56, 0xa0, 0x83, 0x97, 0x47, 0xb1, 0x92, 0xcc, 0xa0];

// Release conditions.
const ALL = () => true;
const R13_14 = (v) => v < R2000;
const R2000P = (v) => v >= R2000;
const R2004P = (v) => v >= R2004;
const R2007P = (v) => v >= R2007;
const R2010P = (v) => v >= R2010;
const R2013P = (v) => v >= R2013;
const PRE2004 = (v) => v < R2004;
const R13_18 = (v) => v < R2007;
const R13_15 = (v) => v <= R2000;

const V = (when, type, name, def, code) => ({ when, type, name, def, code });
const many = (when, type, names, def, code) => names.split(/\s+/).map((n) => V(when, type, n, def, code));

/** The variables in file order: { when(version), type, name, def }. */
export const HEADER_VARS = [
  V(R2013P, 'BLL', 'REQUIREDVERSIONS', 0),
  V(ALL, 'BD', 'unknown1', 412148564080.0), V(ALL, 'BD', 'unknown2', 1), V(ALL, 'BD', 'unknown3', 1), V(ALL, 'BD', 'unknown4', 1),
  V(ALL, 'TV', 'unknownText1', ''), V(ALL, 'TV', 'unknownText2', ''), V(ALL, 'TV', 'unknownText3', ''), V(ALL, 'TV', 'unknownText4', ''),
  V(ALL, 'BL', 'unknown5', 24), V(ALL, 'BL', 'unknown6', 0),
  V(R13_14, 'BS', 'unknown7', 0),
  V(PRE2004, 'H', 'VIEWPORT_ENTITY_HEADER', 0),
  V(ALL, 'B', 'DIMASO', 1), V(ALL, 'B', 'DIMSHO', 1),
  V(R13_14, 'B', 'DIMSAV', 0),
  ...many(ALL, 'B', 'PLINEGEN ORTHOMODE REGENMODE FILLMODE QTEXTMODE PSLTSCALE LIMCHECK', 0),
  V(R13_14, 'B', 'BLIPMODE', 0),
  V(R2004P, 'B', 'undocumented1', 0),
  ...many(ALL, 'B', 'USRTIMER SKPOLY ANGDIR SPLFRAME', 0),
  V(R13_14, 'B', 'ATTREQ', 1), V(R13_14, 'B', 'ATTDIA', 1),
  V(ALL, 'B', 'MIRRTEXT', 0), V(ALL, 'B', 'WORLDVIEW', 1),
  V(R13_14, 'B', 'WIREFRAME', 0),
  V(ALL, 'B', 'TILEMODE', 1), V(ALL, 'B', 'PLIMCHECK', 0), V(ALL, 'B', 'VISRETAIN', 1),
  V(R13_14, 'B', 'DELOBJ', 1),
  V(ALL, 'B', 'DISPSILH', 0), V(ALL, 'B', 'PELLIPSE', 0),
  V(ALL, 'BS', 'PROXYGRAPHICS', 1),
  V(R13_14, 'BS', 'DRAGMODE', 2),
  V(ALL, 'BS', 'TREEDEPTH', 3020), V(ALL, 'BS', 'LUNITS', 2), V(ALL, 'BS', 'LUPREC', 4), V(ALL, 'BS', 'AUNITS', 0), V(ALL, 'BS', 'AUPREC', 0),
  V(R13_14, 'BS', 'OSMODE', 0),
  V(ALL, 'BS', 'ATTMODE', 1),
  V(R13_14, 'BS', 'COORDS', 1),
  V(ALL, 'BS', 'PDMODE', 0),
  V(R13_14, 'BS', 'PICKSTYLE', 1),
  V(R2004P, 'BL', 'unknown8', 0), V(R2004P, 'BL', 'unknown9', 0), V(R2004P, 'BL', 'unknown10', 0),
  ...many(ALL, 'BS', 'USERI1 USERI2 USERI3 USERI4 USERI5', 0),
  V(ALL, 'BS', 'SPLINESEGS', 8), V(ALL, 'BS', 'SURFU', 6), V(ALL, 'BS', 'SURFV', 6), V(ALL, 'BS', 'SURFTYPE', 6),
  V(ALL, 'BS', 'SURFTAB1', 6), V(ALL, 'BS', 'SURFTAB2', 6), V(ALL, 'BS', 'SPLINETYPE', 6), V(ALL, 'BS', 'SHADEDGE', 3),
  V(ALL, 'BS', 'SHADEDIF', 70), V(ALL, 'BS', 'UNITMODE', 0), V(ALL, 'BS', 'MAXACTVP', 64), V(ALL, 'BS', 'ISOLINES', 4),
  V(ALL, 'BS', 'CMLJUST', 0), V(ALL, 'BS', 'TEXTQLTY', 50),
  V(ALL, 'BD', 'LTSCALE', 1), V(ALL, 'BD', 'TEXTSIZE', 2.5), V(ALL, 'BD', 'TRACEWID', 1), V(ALL, 'BD', 'SKETCHINC', 1),
  V(ALL, 'BD', 'FILLETRAD', 0), V(ALL, 'BD', 'THICKNESS', 0), V(ALL, 'BD', 'ANGBASE', 0), V(ALL, 'BD', 'PDSIZE', 0),
  V(ALL, 'BD', 'PLINEWID', 0),
  ...many(ALL, 'BD', 'USERR1 USERR2 USERR3 USERR4 USERR5', 0),
  V(ALL, 'BD', 'CHAMFERA', 0), V(ALL, 'BD', 'CHAMFERB', 0), V(ALL, 'BD', 'CHAMFERC', 0), V(ALL, 'BD', 'CHAMFERD', 0),
  V(ALL, 'BD', 'FACETRES', 0.5), V(ALL, 'BD', 'CMLSCALE', 20), V(ALL, 'BD', 'CELTSCALE', 1),
  V(R13_18, 'TV', 'MENUNAME', 'acad'),
  V(ALL, 'BL', 'TDCREATE_DAY', 0), V(ALL, 'BL', 'TDCREATE_MS', 0), V(ALL, 'BL', 'TDUPDATE_DAY', 0), V(ALL, 'BL', 'TDUPDATE_MS', 0),
  V(R2004P, 'BL', 'unknown11', 0), V(R2004P, 'BL', 'unknown12', 0), V(R2004P, 'BL', 'unknown13', 0),
  V(ALL, 'BL', 'TDINDWG_DAY', 0), V(ALL, 'BL', 'TDINDWG_MS', 0), V(ALL, 'BL', 'TDUSRTIMER_DAY', 0), V(ALL, 'BL', 'TDUSRTIMER_MS', 0),
  V(ALL, 'CMC', 'CECOLOR', 256),
  V(ALL, 'H0', 'HANDSEED', 0),
  V(ALL, 'H', 'CLAYER', 0), V(ALL, 'H', 'TEXTSTYLE', 0), V(ALL, 'H', 'CELTYPE', 0),
  V(R2007P, 'H', 'CMATERIAL', 0),
  V(ALL, 'H', 'DIMSTYLE', 0), V(ALL, 'H', 'CMLSTYLE', 0),
  V(R2000P, 'BD', 'PSVPSCALE', 0),
  V(ALL, '3BD', 'PINSBASE', [0, 0, 0]), V(ALL, '3BD', 'PEXTMIN', [1e20, 1e20, 1e20]), V(ALL, '3BD', 'PEXTMAX', [-1e20, -1e20, -1e20]),
  V(ALL, '2RD', 'PLIMMIN', [0, 0]), V(ALL, '2RD', 'PLIMMAX', [420, 297]), V(ALL, 'BD', 'PELEVATION', 0),
  V(ALL, '3BD', 'PUCSORG', [0, 0, 0]), V(ALL, '3BD', 'PUCSXDIR', [1, 0, 0]), V(ALL, '3BD', 'PUCSYDIR', [0, 1, 0]), V(ALL, 'H', 'PUCSNAME', 0),
  V(R2000P, 'H', 'PUCSORTHOREF', 0), V(R2000P, 'BS', 'PUCSORTHOVIEW', 0), V(R2000P, 'H', 'PUCSBASE', 0),
  ...many(R2000P, '3BD', 'PUCSORGTOP PUCSORGBOTTOM PUCSORGLEFT PUCSORGRIGHT PUCSORGFRONT PUCSORGBACK', [0, 0, 0]),
  V(ALL, '3BD', 'INSBASE', [0, 0, 0]), V(ALL, '3BD', 'EXTMIN', [1e20, 1e20, 1e20]), V(ALL, '3BD', 'EXTMAX', [-1e20, -1e20, -1e20]),
  V(ALL, '2RD', 'LIMMIN', [0, 0]), V(ALL, '2RD', 'LIMMAX', [420, 297]), V(ALL, 'BD', 'ELEVATION', 0),
  V(ALL, '3BD', 'UCSORG', [0, 0, 0]), V(ALL, '3BD', 'UCSXDIR', [1, 0, 0]), V(ALL, '3BD', 'UCSYDIR', [0, 1, 0]), V(ALL, 'H', 'UCSNAME', 0),
  V(R2000P, 'H', 'UCSORTHOREF', 0), V(R2000P, 'BS', 'UCSORTHOVIEW', 0), V(R2000P, 'H', 'UCSBASE', 0),
  ...many(R2000P, '3BD', 'UCSORGTOP UCSORGBOTTOM UCSORGLEFT UCSORGRIGHT UCSORGFRONT UCSORGBACK', [0, 0, 0]),
  V(R2000P, 'TV', 'DIMPOST', ''), V(R2000P, 'TV', 'DIMAPOST', ''),
  ...many(R13_14, 'B', 'DIMTOL_ DIMLIM_ DIMTIH_ DIMTOH_ DIMSE1_ DIMSE2_ DIMALT_ DIMTOFL_ DIMSAH_ DIMTIX_ DIMSOXD_', 0),
  ...many(R13_14, 'RC', 'DIMALTD_ DIMZIN_', 0), ...many(R13_14, 'B', 'DIMSD1_ DIMSD2_', 0), ...many(R13_14, 'RC', 'DIMTOLJ_ DIMJUST_ DIMFIT_', 0),
  V(R13_14, 'B', 'DIMUPT_', 0), ...many(R13_14, 'RC', 'DIMTZIN_ DIMALTZ_ DIMALTTZ_ DIMTAD_', 0),
  ...many(R13_14, 'BS', 'DIMUNIT_ DIMAUNIT_ DIMDEC_ DIMTDEC_ DIMALTU_ DIMALTTD_', 0), V(R13_14, 'H', 'DIMTXSTY_', 0),
  V(ALL, 'BD', 'DIMSCALE', 1), V(ALL, 'BD', 'DIMASZ', 2.5), V(ALL, 'BD', 'DIMEXO', 0.625), V(ALL, 'BD', 'DIMDLI', 3.75),
  V(ALL, 'BD', 'DIMEXE', 1.25), V(ALL, 'BD', 'DIMRND', 0), V(ALL, 'BD', 'DIMDLE', 0), V(ALL, 'BD', 'DIMTP', 0), V(ALL, 'BD', 'DIMTM', 0),
  V(R2007P, 'BD', 'DIMFXL', 1), V(R2007P, 'BD', 'DIMJOGANG', Math.PI / 4), V(R2007P, 'BS', 'DIMTFILL', 0), V(R2007P, 'CMC', 'DIMTFILLCLR', 0),
  ...many(R2000P, 'B', 'DIMTOL DIMLIM DIMTIH DIMTOH DIMSE1 DIMSE2', 0),
  V(R2000P, 'BS', 'DIMTAD', 1), V(R2000P, 'BS', 'DIMZIN', 8), V(R2000P, 'BS', 'DIMAZIN', 0),
  V(R2007P, 'BS', 'DIMARCSYM', 0),
  V(ALL, 'BD', 'DIMTXT', 2.5), V(ALL, 'BD', 'DIMCEN', 2.5), V(ALL, 'BD', 'DIMTSZ', 0), V(ALL, 'BD', 'DIMALTF', 25.4),
  V(ALL, 'BD', 'DIMLFAC', 1), V(ALL, 'BD', 'DIMTVP', 0), V(ALL, 'BD', 'DIMTFAC', 1), V(ALL, 'BD', 'DIMGAP', 0.625),
  ...many(R13_14, 'T', 'DIMPOST_ DIMAPOST_ DIMBLK_ DIMBLK1_ DIMBLK2_', ''),
  V(R2000P, 'BD', 'DIMALTRND', 0), V(R2000P, 'B', 'DIMALT', 0), V(R2000P, 'BS', 'DIMALTD', 3),
  ...many(R2000P, 'B', 'DIMTOFL DIMSAH DIMTIX DIMSOXD', 0), V(ALL, 'CMC', 'DIMCLRD', 0), V(ALL, 'CMC', 'DIMCLRE', 0), V(ALL, 'CMC', 'DIMCLRT', 0),
  V(R2000P, 'BS', 'DIMADEC', 0), V(R2000P, 'BS', 'DIMDEC', 2), V(R2000P, 'BS', 'DIMTDEC', 2), V(R2000P, 'BS', 'DIMALTU', 2),
  V(R2000P, 'BS', 'DIMALTTD', 3), V(R2000P, 'BS', 'DIMAUNIT', 0), V(R2000P, 'BS', 'DIMFRAC', 0), V(R2000P, 'BS', 'DIMLUNIT', 2),
  V(R2000P, 'BS', 'DIMDSEP', 46), V(R2000P, 'BS', 'DIMTMOVE', 0), V(R2000P, 'BS', 'DIMJUST', 0),
  V(R2000P, 'B', 'DIMSD1', 0), V(R2000P, 'B', 'DIMSD2', 0),
  V(R2000P, 'BS', 'DIMTOLJ', 1), V(R2000P, 'BS', 'DIMTZIN', 0), V(R2000P, 'BS', 'DIMALTZ', 0), V(R2000P, 'BS', 'DIMALTTZ', 0),
  V(R2000P, 'B', 'DIMUPT', 0), V(R2000P, 'BS', 'DIMATFIT', 3),
  V(R2007P, 'B', 'DIMFXLON', 0),
  V(R2010P, 'B', 'DIMTXTDIRECTION', 0), V(R2010P, 'BD', 'DIMALTMZF', 0), V(R2010P, 'T', 'DIMALTMZS', ''), V(R2010P, 'BD', 'DIMMZF', 0), V(R2010P, 'T', 'DIMMZS', ''),
  ...many(R2000P, 'H', 'DIMTXSTY DIMLDRBLK DIMBLK DIMBLK1 DIMBLK2', 0),
  ...many(R2007P, 'H', 'DIMLTYPE DIMLTEX1 DIMLTEX2', 0),
  V(R2000P, 'BS', 'DIMLWD', -2), V(R2000P, 'BS', 'DIMLWE', -2),
  // The tables' control objects and the named-object dictionary are hard owners (code 3), the rest hard pointers (5).
  ...many(ALL, 'H', 'BLOCK_CONTROL LAYER_CONTROL STYLE_CONTROL LTYPE_CONTROL VIEW_CONTROL UCS_CONTROL VPORT_CONTROL APPID_CONTROL DIMSTYLE_CONTROL', 0, 3),
  V(R13_15, 'H', 'VX_CONTROL', 0, 3),
  V(ALL, 'H', 'DICT_ACAD_GROUP', 0), V(ALL, 'H', 'DICT_ACAD_MLINESTYLE', 0), V(ALL, 'H', 'DICT_NAMED_OBJECTS', 0, 3),
  V(R2000P, 'BS', 'TSTACKALIGN', 1), V(R2000P, 'BS', 'TSTACKSIZE', 70), V(R2000P, 'TV', 'HYPERLINKBASE', ''), V(R2000P, 'TV', 'STYLESHEET', ''),
  ...many(R2000P, 'H', 'DICT_LAYOUTS DICT_PLOTSETTINGS DICT_PLOTSTYLES', 0),
  ...many(R2004P, 'H', 'DICT_MATERIALS DICT_COLORS', 0),
  V(R2007P, 'H', 'DICT_VISUALSTYLE', 0), V(R2013P, 'H', 'unknownHandle', 0),
  V(R2000P, 'BL', 'FLAGS', 0x2a1d), V(R2000P, 'BS', 'INSUNITS', 4), V(R2000P, 'BS', 'CEPSNTYPE', 0),
  V((v, vars) => v >= R2000 && vars.CEPSNTYPE === 3, 'H', 'CPSNID', 0),
  V(R2000P, 'TV', 'FINGERPRINTGUID', ''), V(R2000P, 'TV', 'VERSIONGUID', ''),
  ...many(R2004P, 'RC', 'SORTENTS INDEXCTL HIDETEXT XCLIPFRAME DIMASSOC HALOGAP', 0),
  V(R2004P, 'BS', 'OBSCUREDCOLOR', 0), V(R2004P, 'BS', 'INTERSECTIONCOLOR', 0), V(R2004P, 'RC', 'OBSCUREDLTYPE', 0), V(R2004P, 'RC', 'INTERSECTIONDISPLAY', 0),
  V(R2004P, 'TV', 'PROJECTNAME', ''),
  ...many(ALL, 'H', 'BLOCK_RECORD_PSPACE BLOCK_RECORD_MSPACE LTYPE_BYLAYER LTYPE_BYBLOCK LTYPE_CONTINUOUS', 0),
  // R2007+ camera, lofting, lighting, … variables follow here; not read or written by this module.
  V((v) => v >= 14 && v < R2007, 'BS', 'unknown54', 4), V((v) => v >= 14 && v < R2007, 'BS', 'unknown55', 0x1a),
  V((v) => v >= 14 && v < R2007, 'BS', 'unknown56', 0), V((v) => v >= 14 && v < R2007, 'BS', 'unknown57', 0),
];

/** Header variables of an R13–R2004 header section starting at `offset` (its sentinel): { vars, endBit, sizeBytes }. */
export function readHeader(bytes, offset, version) {
  if (version >= R2007) throw dwgError('R2007+ header variables are not read', 'dwg-version');
  for (let i = 0; i < 16; i++) if (bytes[offset + i] !== HEADER_START[i]) throw dwgError('the header section sentinel is missing');
  const r = new BitReader(bytes, (offset + 16) * 8, version);
  const size = r.RL();
  if (version >= R2010) r.RL();
  const vars = {};
  for (const f of HEADER_VARS) {
    if (!f.when(version, vars)) continue;
    vars[f.name] = readValue(r, f.type);
  }
  const dataStart = (offset + 20) * 8;
  return { vars, usedBits: r.bit - dataStart, sizeBytes: size, crc: (bytes[offset + 20 + size] | bytes[offset + 21 + size] << 8), crcComputed: crc8(0xc0c1, bytes, offset + 16, offset + 20 + size) };
}

function readValue(r, type) {
  switch (type) {
    case 'B': return r.B();
    case 'BS': return r.BS();
    case 'BL': return r.BL();
    case 'BLL': return r.BLL();
    case 'BD': return r.BD();
    case 'RC': return r.RC();
    case '3BD': return r.BD3();
    case '2RD': return r.RD2();
    case 'TV': return r.TV();
    case 'T': return r.T();
    case 'H': case 'H0': return r.H().value;
    case 'CMC': return r.CMC().index;
    default: throw dwgError(`unknown header type ${type}`);
  }
}

/**
 * The header section bytes (R2000): sentinel, size, the variables (`values` over the defaults; handle variables
 * as numbers, written as hard pointers — HANDSEED with code 0), CRC, end sentinel.
 */
export function writeHeader(values, version = R2000) {
  const w = new BitWriter(version);
  const vars = {};
  for (const f of HEADER_VARS) {
    if (!f.when(version, vars)) continue;
    const x = values[f.name] ?? f.def;
    vars[f.name] = x;
    switch (f.type) {
      case 'B': w.B(x ? 1 : 0); break;
      case 'BS': w.BS(x); break;
      case 'BL': w.BL(x); break;
      case 'BD': w.BD(x); break;
      case 'RC': w.RC(x); break;
      case '3BD': w.BD3(x); break;
      case '2RD': w.RD2(x); break;
      case 'TV': case 'T': w.T(x); break;
      case 'H0': w.H(0, x); break;
      case 'H': w.H(f.code ?? 5, x); break;
      case 'CMC': w.BS(x); break;
      default: throw dwgError(`cannot write header type ${f.type}`, 'dwg-write');
    }
  }
  const data = w.bytes();
  const out = new Uint8Array(16 + 4 + data.length + 2 + 16);
  out.set(HEADER_START, 0);
  out[16] = data.length & 255; out[17] = (data.length >> 8) & 255; out[18] = (data.length >> 16) & 255; out[19] = (data.length >>> 24) & 255;
  out.set(data, 20);
  const crc = crc8(0xc0c1, out, 16, 20 + data.length);
  out[20 + data.length] = crc & 255; out[21 + data.length] = crc >> 8;
  out.set(HEADER_END, 22 + data.length);
  return out;
}
