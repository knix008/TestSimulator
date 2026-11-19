// TLS and DTLS: records, handshake messages, extensions, X.509 certificates, JA3/JA4 fingerprints.
// No decryption: encrypted records are shown as Wireshark shows them without keys.
import { registerProtocol, u16, u24, u32, hexStr, ascii, utf8, hexPad, NULLNODE } from '../core.js';
import * as T from './tls-tables.js';
import { sha256 } from './quic-crypto.js';

const VERNAME = { 0x0300: 'SSLv3', 0x0301: 'TLSv1', 0x0302: 'TLSv1.1', 0x0303: 'TLSv1.2', 0x0304: 'TLSv1.3', 0xfeff: 'DTLSv1.0', 0xfefd: 'DTLSv1.2', 0xfefc: 'DTLSv1.3', 0x0100: 'DTLSv1.0' };
const SIG_HASH = { 0: 'None', 1: 'MD5', 2: 'SHA1', 3: 'SHA224', 4: 'SHA256', 5: 'SHA384', 6: 'SHA512' };
const SIG_SIG = { 0: 'Anonymous', 1: 'RSA', 2: 'DSA', 3: 'ECDSA' };
const CURVE_TYPE = { 1: 'explicit_prime', 2: 'explicit_char2', 3: 'named_curve' };
const HRR_RANDOM = 'cf21ad74e59a6111be1d8c021e65b891c2a211167abb8c5e079e09e2c8a8339c';
const isGrease = (v) => (v & 0x0f0f) === 0x0a0a && (v >> 8) === (v & 0xff);
const QUIC_PARAMS = {
  0x00: 'original_destination_connection_id', 0x01: 'max_idle_timeout', 0x02: 'stateless_reset_token', 0x03: 'max_udp_payload_size',
  0x04: 'initial_max_data', 0x05: 'initial_max_stream_data_bidi_local', 0x06: 'initial_max_stream_data_bidi_remote',
  0x07: 'initial_max_stream_data_uni', 0x08: 'initial_max_streams_bidi', 0x09: 'initial_max_streams_uni', 0x0a: 'ack_delay_exponent',
  0x0b: 'max_ack_delay', 0x0c: 'disable_active_migration', 0x0d: 'preferred_address', 0x0e: 'active_connection_id_limit',
  0x0f: 'initial_source_connection_id', 0x10: 'retry_source_connection_id', 0x11: 'version_information', 0x20: 'max_datagram_frame_size',
  0x2ab2: 'grease_quic_bit',
};
const QUIC_INT_PARAMS = new Set([0x01, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0e, 0x20]);
const QUIC_CID_PARAMS = new Set([0x00, 0x0f, 0x10]);
// Application protocol guessed for encrypted application data (ALPN for TLS <= 1.2, else server port).
const ALPN_PROTO = { 'http/1.1': 'Hypertext Transfer Protocol', h2: 'HyperText Transfer Protocol 2', 'http/1.0': 'Hypertext Transfer Protocol', h3: 'HTTP3' };
const PORT_PROTO = { 443: 'Hypertext Transfer Protocol', 993: 'Internet Message Access Protocol', 995: 'Post Office Protocol', 465: 'Simple Mail Transfer Protocol', 636: 'Lightweight Directory Access Protocol', 853: 'Domain Name System', 5061: 'Session Initiation Protocol', 989: 'File Transfer Protocol (FTP)', 990: 'File Transfer Protocol (FTP)', 563: 'Network News Transfer Protocol' };

// ---------------------------------------------------------------------------------------------
// Fields shared by TLS and DTLS (registered once per prefix).
function sharedFields(p) {
  return [
    [`${p}.stream`, 'Stream index', 'uint32'],
    [`${p}.record`, 'Record Layer', 'none'],
    [`${p}.record.content_type`, 'Content Type', 'uint8', { strings: T.CONTENT_TYPES }],
    [`${p}.record.version`, 'Version', 'uint16', { base: 'hex', strings: T.VERSIONS }],
    [`${p}.record.length`, 'Length', 'uint16'],
    [`${p}.app_data`, 'Encrypted Application Data', 'bytes'],
    [`${p}.app_data_proto`, 'Application Data Protocol', 'string'],
    [`${p}.alert_message`, 'Alert Message', 'none'],
    [`${p}.alert_message.level`, 'Level', 'uint8', { strings: T.ALERT_LEVEL }],
    [`${p}.alert_message.desc`, 'Description', 'uint8', { strings: T.ALERT_DESC }],
    [`${p}.change_cipher_spec`, 'Change Cipher Spec Message', 'none'],
    [`${p}.handshake`, 'Handshake Protocol', 'none'],
    [`${p}.handshake.type`, 'Handshake Type', 'uint8', { strings: T.HS_TYPES }],
    [`${p}.handshake.length`, 'Length', 'uint24'],
    [`${p}.handshake.version`, 'Version', 'uint16', { base: 'hex', strings: T.VERSIONS }],
    [`${p}.handshake.random`, 'Random', 'bytes'],
    [`${p}.handshake.random_time`, 'GMT Unix Time', 'abs_time'],
    [`${p}.handshake.random_bytes`, 'Random Bytes', 'bytes'],
    [`${p}.handshake.session_id_length`, 'Session ID Length', 'uint16'],
    [`${p}.handshake.session_id`, 'Session ID', 'bytes'],
    [`${p}.handshake.cipher_suites_length`, 'Cipher Suites Length', 'uint16'],
    [`${p}.handshake.ciphersuites`, 'Cipher Suites', 'none'],
    [`${p}.handshake.ciphersuite`, 'Cipher Suite', 'uint16', { base: 'hex', strings: T.CIPHER_SUITES }],
    [`${p}.handshake.comp_methods_length`, 'Compression Methods Length', 'uint8'],
    [`${p}.handshake.comp_methods`, 'Compression Methods', 'none'],
    [`${p}.handshake.comp_method`, 'Compression Method', 'uint8', { strings: T.COMP_METHODS }],
    [`${p}.handshake.extensions_length`, 'Extensions Length', 'uint16'],
    [`${p}.handshake.extension`, 'Extension', 'none'],
    [`${p}.handshake.extension.type`, 'Type', 'uint16', { strings: T.EXT_TYPES }],
    [`${p}.handshake.extension.len`, 'Length', 'uint16'],
    [`${p}.handshake.extension.data`, 'Data', 'bytes'],
    [`${p}.handshake.extensions_server_name_list_len`, 'Server Name list length', 'uint16'],
    [`${p}.handshake.extensions_server_name_type`, 'Server Name Type', 'uint8', { strings: T.SNI_TYPES }],
    [`${p}.handshake.extensions_server_name_len`, 'Server Name length', 'uint16'],
    [`${p}.handshake.extensions_server_name`, 'Server Name', 'string'],
    [`${p}.handshake.extensions_supported_groups_length`, 'Supported Groups List Length', 'uint16'],
    [`${p}.handshake.extensions_supported_groups`, 'Supported Groups List', 'none'],
    [`${p}.handshake.extensions_supported_group`, 'Supported Group', 'uint16', { base: 'hex', strings: T.GROUPS }],
    [`${p}.handshake.extensions_ec_point_formats_length`, 'EC point formats Length', 'uint8'],
    [`${p}.handshake.extensions_ec_point_formats`, 'EC point formats', 'none'],
    [`${p}.handshake.extensions_ec_point_format`, 'EC point format', 'uint8', { strings: T.EC_POINT_FORMATS }],
    [`${p}.handshake.extensions_alpn_len`, 'ALPN Extension Length', 'uint16'],
    [`${p}.handshake.extensions_alpn_list`, 'ALPN Protocol', 'none'],
    [`${p}.handshake.extensions_alpn_str_len`, 'ALPN string length', 'uint8'],
    [`${p}.handshake.extensions_alpn_str`, 'ALPN Next Protocol', 'string'],
    [`${p}.handshake.extensions_key_share_client_length`, 'Client Key Share Length', 'uint16'],
    [`${p}.handshake.extensions_key_share_group`, 'Group', 'uint16', { strings: T.GROUPS }],
    [`${p}.handshake.extensions_key_share_key_exchange_length`, 'Key Exchange Length', 'uint16'],
    [`${p}.handshake.extensions_key_share_key_exchange`, 'Key Exchange', 'bytes'],
    [`${p}.handshake.extensions_key_share_selected_group`, 'Selected Group', 'uint16', { strings: T.GROUPS }],
    [`${p}.handshake.extensions.supported_versions_len`, 'Supported Versions length', 'uint8'],
    [`${p}.handshake.extensions.supported_version`, 'Supported Version', 'uint16', { base: 'hex', strings: T.VERSIONS }],
    [`${p}.handshake.extensions.cookie_len`, 'Cookie length', 'uint16'],
    [`${p}.handshake.extensions.cookie`, 'Cookie', 'bytes'],
    [`${p}.handshake.extensions.session_ticket`, 'Session Ticket', 'bytes'],
    [`${p}.handshake.extensions_reneg_info_len`, 'Renegotiation info extension length', 'uint8'],
    [`${p}.handshake.extensions_reneg_info`, 'Renegotiation info', 'bytes'],
    [`${p}.handshake.extensions_padding_data`, 'Padding Data', 'bytes'],
    [`${p}.handshake.extensions_status_request_type`, 'Certificate Status Type', 'uint8', { strings: T.STATUS_TYPES }],
    [`${p}.handshake.extensions_status_request_responder_ids_len`, 'Responder ID list Length', 'uint16'],
    [`${p}.handshake.extensions_status_request_exts_len`, 'Request Extensions Length', 'uint16'],
    [`${p}.handshake.extensions.psk.identities.length`, 'Identities Length', 'uint16'],
    [`${p}.handshake.extensions.psk.binders_len`, 'PSK Binders length', 'uint16'],
    [`${p}.handshake.extensions.psk.identity.selected`, 'Selected Identity', 'uint16'],
    [`${p}.handshake.sig_hash_alg_len`, 'Signature Hash Algorithms Length', 'uint16'],
    [`${p}.handshake.sig_hash_algs`, 'Signature Algorithms', 'none'],
    [`${p}.handshake.sig_hash_alg`, 'Signature Algorithm', 'uint16', { base: 'hex', strings: T.SIG_ALGS }],
    [`${p}.handshake.sig_hash_hash`, 'Signature Hash Algorithm Hash', 'uint8', { strings: SIG_HASH }],
    [`${p}.handshake.sig_hash_sig`, 'Signature Hash Algorithm Signature', 'uint8', { strings: SIG_SIG }],
    [`${p}.handshake.certificates_length`, 'Certificates Length', 'uint24'],
    [`${p}.handshake.certificates`, 'Certificates', 'none'],
    [`${p}.handshake.certificate_length`, 'Certificate Length', 'uint24'],
    [`${p}.handshake.certificate`, 'Certificate', 'bytes'],
    [`${p}.handshake.certificate_request_context_length`, 'Certificate Request Context Length', 'uint8'],
    [`${p}.handshake.server_curve_type`, 'Curve Type', 'uint8', { base: 'hex', strings: CURVE_TYPE }],
    [`${p}.handshake.server_named_curve`, 'Named Curve', 'uint16', { base: 'hex', strings: T.GROUPS }],
    [`${p}.handshake.server_point_len`, 'Pubkey Length', 'uint8'],
    [`${p}.handshake.server_point`, 'Pubkey', 'bytes'],
    [`${p}.handshake.client_point_len`, 'Pubkey Length', 'uint8'],
    [`${p}.handshake.client_point`, 'Pubkey', 'bytes'],
    [`${p}.handshake.epms_len`, 'Encrypted PreMaster length', 'uint16'],
    [`${p}.handshake.epms`, 'Encrypted PreMaster', 'bytes'],
    [`${p}.handshake.sig_len`, 'Signature Length', 'uint16'],
    [`${p}.handshake.sig`, 'Signature', 'bytes'],
    [`${p}.handshake.cert_types_count`, 'Certificate types count', 'uint8'],
    [`${p}.handshake.cert_types`, 'Certificate types', 'none'],
    [`${p}.handshake.cert_type`, 'Certificate type', 'uint8', { strings: { 1: 'RSA Sign', 2: 'DSS Sign', 3: 'RSA Fixed DH', 4: 'DSS Fixed DH', 64: 'ECDSA Sign', 65: 'RSA Fixed ECDH', 66: 'ECDSA Fixed ECDH' } }],
    [`${p}.handshake.dnames_len`, 'Distinguished Names Length', 'uint16'],
    [`${p}.handshake.session_ticket_lifetime_hint`, 'Session Ticket Lifetime Hint', 'uint32'],
    [`${p}.handshake.session_ticket_age_add`, 'Session Ticket Age Add', 'uint32'],
    [`${p}.handshake.session_ticket_nonce_length`, 'Session Ticket Nonce Length', 'uint8'],
    [`${p}.handshake.session_ticket_nonce`, 'Session Ticket Nonce', 'bytes'],
    [`${p}.handshake.session_ticket_length`, 'Session Ticket Length', 'uint16'],
    [`${p}.handshake.session_ticket`, 'Session Ticket', 'bytes'],
    [`${p}.handshake.verify_data`, 'Verify Data', 'bytes'],
    [`${p}.handshake.ja3_full`, 'JA3 Fullstring', 'string'],
    [`${p}.handshake.ja3`, 'JA3', 'string'],
    [`${p}.handshake.ja3s_full`, 'JA3S Fullstring', 'string'],
    [`${p}.handshake.ja3s`, 'JA3S', 'string'],
    [`${p}.handshake.ja4`, 'JA4', 'string'],
    [`${p}.handshake.ja4_r`, 'JA4_r', 'string'],
  ];
}

const TLS = registerProtocol({
  abbrev: 'tls', name: 'Transport Layer Security', short: 'TLS',
  fields: [
    ...sharedFields('tls'),
    ['tls.record.opaque_type', 'Opaque Type', 'uint8', { strings: T.CONTENT_TYPES }],
    ['tls.extension.psk_ke_modes_length', 'PSK Key Exchange Modes Length', 'uint8'],
    ['tls.extension.psk_ke_mode', 'PSK Key Exchange Mode', 'uint8', { strings: T.PSK_KE_MODES }],
    ['tls.quic.parameter', 'Parameter', 'none'],
    ['tls.quic.parameter.type', 'Type', 'uint64', { base: 'hex', strings: QUIC_PARAMS }],
    ['tls.quic.parameter.length', 'Length', 'uint64'],
    ['tls.quic.parameter.value', 'Value', 'bytes'],
    ...[...QUIC_INT_PARAMS].map((k) => [`tls.quic.parameter.${QUIC_PARAMS[k]}`, QUIC_PARAMS[k], 'uint64']),
    ...[...QUIC_CID_PARAMS].map((k) => [`tls.quic.parameter.${QUIC_PARAMS[k]}`, QUIC_PARAMS[k], 'bytes']),
    ['tls.segment.data', 'TLS segment data', 'bytes'],
  ],
  experts: [
    ['tls.handshake.legacy_version', 'chat', 'Deprecated', 'This legacy_version field MUST be ignored. The supported_versions extension is present and MUST be used instead.'],
    ['tls.record.length.invalid', 'error', 'Malformed', 'Record fragment length is too small or too large'],
    ['tls.malformed.buffer_too_small', 'error', 'Malformed', 'Malformed message, not enough data is available'],
    ['tls.ignored_unknown_record', 'warn', 'Protocol', 'Ignored Unknown Record'],
  ],
  // Wireshark's default TLS ports (https, smtps, nntps, ldaps, dns-over-tls, ftps, imaps, pop3s, ...)
  tables: { 'tcp.port': [443, 261, 448, 465, 563, 614, 636, 853, 989, 990, 992, 993, 994, 995, 3269, 5061, 5223, 8883] },
  heuristics: { tcp: (ctx, off, end) => looksLikeTls(ctx.d, off, end) },
  tcpPdu(ctx, off, end) {
    const d = ctx.d;
    if (end - off < 5) return validType(d[off]) ? -1 : 0;
    if (!validType(d[off]) || d[off + 1] !== 3 || d[off + 2] > 4) return 0;
    const len = u16(d, off + 3);
    // An impossible length is not waited for: the record is reported as invalid instead.
    return len > 18432 ? 0 : 5 + len;
  },
  dissect(ctx, off, end) { return dissectRecords(ctx, off, end, false); },
});

// Start of a record that continues in later segments, shown inside the TLS tree (tcp.js hook).
TLS.segmentData = (ctx, off, end) => {
  const top = ctx.vars.tlsTop;
  if (ctx.tree && top) ctx.add(top, 'tls.segment.data', off, end - off, ctx.d.subarray(off, end), `TLS segment data (${end - off} bytes)`);
};

registerProtocol({
  abbrev: 'dtls', name: 'Datagram Transport Layer Security', short: 'DTLS',
  fields: [
    ...sharedFields('dtls'),
    ['dtls.record.epoch', 'Epoch', 'uint16'],
    ['dtls.record.sequence_number', 'Sequence Number', 'uint64'],
    ['dtls.handshake.message_seq', 'Message Sequence', 'uint16'],
    ['dtls.handshake.fragment_offset', 'Fragment Offset', 'uint24'],
    ['dtls.handshake.fragment_length', 'Fragment Length', 'uint24'],
    ['dtls.handshake.cookie_length', 'Cookie Length', 'uint8'],
    ['dtls.handshake.cookie', 'Cookie', 'bytes'],
    ['dtls.extension.psk_ke_modes_length', 'PSK Key Exchange Modes Length', 'uint8'],
    ['dtls.extension.psk_ke_mode', 'PSK Key Exchange Mode', 'uint8', { strings: T.PSK_KE_MODES }],
  ],
  experts: [['dtls.handshake.legacy_version', 'chat', 'Deprecated', 'This legacy_version field MUST be ignored. The supported_versions extension is present and MUST be used instead.']],
  heuristics: { udp: (ctx, off, end) => looksLikeDtls(ctx.d, off, end) },
  dissect(ctx, off, end) { return dissectRecords(ctx, off, end, true); },
});

// X.509 pseudo-protocols (they appear in frame.protocols, one per attribute/extension).
registerProtocol({
  abbrev: 'x509af', name: 'X.509 Authentication Framework', short: 'X509AF',
  fields: [
    ['x509af.signedCertificate_element', 'signedCertificate', 'none'],
    ['x509af.version', 'version', 'int32', { strings: { 0: 'v1', 1: 'v2', 2: 'v3' } }],
    ['x509af.serialNumber', 'serialNumber', 'bytes'],
    ['x509af.signature_element', 'signature', 'none'],
    ['x509af.algorithm.id', 'Algorithm Id', 'oid'],
    ['x509af.issuer', 'issuer', 'uint32', { strings: { 0: 'rdnSequence' } }],
    ['x509af.validity_element', 'validity', 'none'],
    ['x509af.notBefore', 'notBefore', 'uint32', { strings: { 0: 'utcTime', 1: 'generalizedTime' } }],
    ['x509af.notAfter', 'notAfter', 'uint32', { strings: { 0: 'utcTime', 1: 'generalizedTime' } }],
    ['x509af.utcTime', 'utcTime', 'string'],
    ['x509af.generalizedTime', 'generalizedTime', 'string'],
    ['x509af.subject', 'subject', 'uint32', { strings: { 0: 'rdnSequence' } }],
    ['x509af.subjectPublicKeyInfo_element', 'subjectPublicKeyInfo', 'none'],
    ['x509af.algorithm_element', 'algorithm', 'none'],
    ['x509af.subjectPublicKey', 'subjectPublicKey', 'bytes'],
    ['x509af.extensions', 'extensions', 'uint32'],
    ['x509af.Extension_element', 'Extension', 'none'],
    ['x509af.extension.id', 'Extension Id', 'oid'],
    ['x509af.critical', 'critical', 'bool'],
    ['x509af.extnValue', 'extnValue', 'bytes'],
    ['x509af.algorithmIdentifier_element', 'algorithmIdentifier', 'none'],
    ['x509af.encrypted', 'encrypted', 'bytes'],
  ],
});
registerProtocol({
  abbrev: 'x509if', name: 'X.509 Information Framework', short: 'X509IF',
  fields: [
    ['x509if.rdnSequence', 'rdnSequence', 'uint32'],
    ['x509if.RDNSequence_item', 'RDNSequence item', 'uint32'],
    ['x509if.RelativeDistinguishedName_item_element', 'RelativeDistinguishedName item', 'none'],
    ['x509if.oid', 'Object Id', 'oid'],
  ],
});
registerProtocol({
  abbrev: 'x509sat', name: 'X.509 Selected Attribute Types', short: 'X509SAT',
  fields: [
    ['x509sat.CountryName', 'CountryName', 'string'],
    ['x509sat.DirectoryString', 'DirectoryString', 'uint32', { strings: { 0: 'teletexString', 1: 'printableString', 2: 'universalString', 3: 'bmpString', 4: 'uTF8String' } }],
    ['x509sat.teletexString', 'teletexString', 'string'],
    ['x509sat.printableString', 'printableString', 'string'],
    ['x509sat.universalString', 'universalString', 'string'],
    ['x509sat.bmpString', 'bmpString', 'string'],
    ['x509sat.uTF8String', 'uTF8String', 'string'],
    ['x509sat.IA5String', 'IA5String', 'string'],
    ['x509sat.PrintableString', 'PrintableString', 'string'],
  ],
});
registerProtocol({
  abbrev: 'x509ce', name: 'X.509 Certificate Extensions', short: 'X509CE',
  fields: [
    ['x509ce.GeneralNames', 'GeneralNames', 'uint32'],
    ['x509ce.GeneralName', 'GeneralName', 'uint32', { strings: { 1: 'rfc822Name', 2: 'dNSName', 6: 'uniformResourceIdentifier', 7: 'iPAddress' } }],
    ['x509ce.dNSName', 'dNSName', 'string'],
    ['x509ce.rfc822Name', 'rfc822Name', 'string'],
    ['x509ce.uniformResourceIdentifier', 'uniformResourceIdentifier', 'string'],
    ['x509ce.BasicConstraintsSyntax_element', 'BasicConstraintsSyntax', 'none'],
    ['x509ce.cA', 'cA', 'bool'],
    ['x509ce.pathLenConstraint', 'pathLenConstraint', 'uint64'],
    ['x509ce.KeyUsage', 'KeyUsage', 'bytes'],
    ['x509ce.SubjectKeyIdentifier', 'SubjectKeyIdentifier', 'bytes'],
    ['x509ce.keyIdentifier', 'keyIdentifier', 'bytes'],
    ['x509ce.KeyPurposeId', 'KeyPurposeId', 'oid'],
  ],
});
registerProtocol({
  abbrev: 'pkixalgs', name: 'PKIX Algorithms', short: 'PKIXALGS',
  fields: [['pkixalgs.modulus', 'modulus', 'bytes'], ['pkixalgs.publicExponent', 'publicExponent', 'int32']],
});

// ---------------------------------------------------------------------------------------------
function validType(t) { return t >= 20 && t <= 24; }
function looksLikeTls(d, off, end) {
  if (end - off < 5) return false;
  const t = d[off];
  if (!validType(t) || d[off + 1] !== 3 || d[off + 2] > 4) return false;
  const len = u16(d, off + 3);
  if (len === 0 || len > 18432) return false;
  if (t === 22 && end - off >= 6 && end - off >= 5 + 4 && len >= 4) return d[off + 5] >= 1 && d[off + 5] <= 24;
  return t !== 24;
}
function looksLikeDtls(d, off, end) {
  if (end - off < 13) return false;
  const t = d[off];
  if (!validType(t)) return false;
  const v = u16(d, off + 1);
  if (v !== 0xfeff && v !== 0xfefd && v !== 0xfefc && v !== 0x0100) return false;
  const len = u16(d, off + 11);
  return len > 0 && off + 13 + len <= end;
}

/** Per-connection state (keyed by the transport stream), shared by both passes. */
function connState(ctx, dtls) {
  const st = ctx.session.st(dtls ? 'dtls' : 'tls', () => ({ conns: new Map(), count: 0 }));
  const key = dtls ? 'u' + ctx.udpStream : 't' + ctx.tcpStream;
  let c = st.conns.get(key);
  if (!c) {
    c = { index: st.count++, version: 0, legacyVersion: 0, cipher: -1, alpn: null, client: null, ccs: [false, false], serverPort: 0 };
    st.conns.set(key, c);
  }
  return c;
}
function direction(ctx, c) {
  const me = ctx.netSrc + ':' + ctx.srcport;
  if (c.client === null) return ctx.srcport > ctx.dstport ? 0 : 1;
  return c.client === me ? 0 : 1;
}

function verName(v) { return VERNAME[v] || (v >> 8 === 3 ? 'TLS' : 'SSL'); }

// ---------------------------------------------------------------------------------------------
// Records
function dissectRecords(ctx, off, end, dtls) {
  const d = ctx.d;
  const P = dtls ? 'dtls' : 'tls';
  const c = connState(ctx, dtls);
  const fd = ctx.fd;
  let recs = fd[P];
  if (ctx.first && !recs) recs = fd[P] = [];
  if (!recs) recs = [];
  let top = ctx.vars[P + 'Top'];
  // A first record with an impossible length means this is not TLS at all (Wireshark rejects it too).
  if (!top && end - off >= (dtls ? 13 : 5) && validType(d[off]) && u16(d, off + (dtls ? 11 : 3)) > 18432) return false;
  if (!top) {
    top = ctx.proto(P, off, end - off, dtls ? 'Datagram Transport Layer Security' : 'Transport Layer Security');
    ctx.vars[P + 'Top'] = top;
    ctx.vars[P + 'Rec'] = 0;
    ctx.gen(top, P + '.stream', c.index);
  }
  const hl = dtls ? 13 : 5;
  let o = off;
  while (o < end) {
    const ri = ctx.vars[P + 'Rec']++;
    if (end - o < hl || !validType(d[o]) || (!dtls && (d[o + 1] !== 3 || d[o + 2] > 4))) {
      // Not a record header: data continuing an earlier record we could not frame.
      const un = ctx.text(top, 'Ignored Unknown Record', o, end - o);
      ctx.ei(un, 'tls.ignored_unknown_record', o, end - o);
      setCol(ctx, c, dtls, 0);
      ctx.pduInfo('tls', 'Ignored Unknown Record');
      return end - off;
    }
    const type = d[o], rver = u16(d, o + 1);
    const len = u16(d, o + hl - 2);
    const bodyOff = o + hl;
    if (len > 18432 || bodyOff + len > end) {
      const n = ctx.text(top, `${verName(rver)} Record Layer: ${T.CONTENT_TYPES[type]}`, o, end - o);
      ctx.add(n, P + '.record.content_type', o, 1, type);
      ctx.add(n, P + '.record.version', o + 1, 2, rver);
      const ln = ctx.add(n, P + '.record.length', o + hl - 2, 2, len);
      if (len > 18432) ctx.ei(ln, 'tls.record.length.invalid', o + hl - 2, 2);
      else if (ctx.tree) ctx.add(top, 'tls.segment.data', bodyOff, end - bodyOff, d.subarray(bodyOff, end), `TLS segment data (${end - bodyOff} bytes)`);
      setCol(ctx, c, dtls, rver);
      if (len > 18432) ctx.pduInfo('tls', 'Ignored Unknown Record');
      return end - off;
    }
    // First pass: remember decisions that depend on state at that moment.
    let rec = recs[ri];
    const dir = direction(ctx, c);
    if (ctx.first && !rec) {
      rec = recs[ri] = { enc: c.ccs[dir] || (c.version === 0x0304 && type === 22 && !isPlainHello(d, bodyOff, len, dtls)) };
    }
    if (!rec) rec = { enc: false };
    const verLabel = sessionVerName(c, rver, d, bodyOff, type, dtls);
    const rn = ctx.add(top, P + '.record', o, hl + len, null, '');
    if (ctx.tree) {
      if (!dtls && type === 23 && c.version === 0x0304) ctx.add(rn, 'tls.record.opaque_type', o, 1, type);
      else ctx.add(rn, P + '.record.content_type', o, 1, type);
      ctx.add(rn, P + '.record.version', o + 1, 2, rver);
      if (dtls) {
        ctx.add(rn, 'dtls.record.epoch', o + 3, 2, u16(d, o + 3));
        ctx.add(rn, 'dtls.record.sequence_number', o + 5, 6, (BigInt(u16(d, o + 5)) << 32n) | BigInt(u32(d, o + 7)));
      }
      ctx.add(rn, P + '.record.length', o + hl - 2, 2, len);
    }
    let desc;
    switch (type) {
      case 20: {
        desc = 'Change Cipher Spec Protocol: Change Cipher Spec';
        ctx.add(rn, P + '.change_cipher_spec', bodyOff, len, null);
        if (ctx.first) c.ccs[dir] = true;
        ctx.pduInfo('tls', 'Change Cipher Spec');
        break;
      }
      case 21: {
        // Without keys Wireshark treats any 2-byte alert with a valid level as plaintext.
        if (len === 2 && (d[bodyOff] === 1 || d[bodyOff] === 2)) {
          const lv = d[bodyOff], ds = d[bodyOff + 1];
          const txt = `Alert (Level: ${T.ALERT_LEVEL[lv] || 'Unknown'}, Description: ${T.ALERT_DESC[ds] || 'Unknown'})`;
          desc = txt;
          const an = ctx.add(rn, P + '.alert_message', bodyOff, 2, null);
          ctx.add(an, P + '.alert_message.level', bodyOff, 1, lv);
          ctx.add(an, P + '.alert_message.desc', bodyOff + 1, 1, ds);
          ctx.pduInfo('tls', txt);
        } else {
          desc = 'Encrypted Alert';
          ctx.add(rn, P + '.alert_message', bodyOff, len, null, 'Alert Message: Encrypted Alert');
          ctx.pduInfo('tls', 'Encrypted Alert');
        }
        break;
      }
      case 22: {
        if (rec.enc) {
          // DTLS without keys shows a bare 'Record Layer' / 'Handshake Protocol'.
          desc = dtls ? null : 'Handshake Protocol: Encrypted Handshake Message';
          ctx.add(rn, P + '.handshake', bodyOff, len, null, dtls ? 'Handshake Protocol' : 'Handshake Protocol: Encrypted Handshake Message');
          ctx.pduInfo('tls', 'Encrypted Handshake Message');
        } else {
          desc = handshakeMessages(ctx, rn, bodyOff, bodyOff + len, c, dtls, false);
        }
        break;
      }
      case 23: {
        const ap = appProto(ctx, c);
        desc = `Application Data Protocol: ${ap || 'Application Data'}`;
        ctx.add(rn, P + '.app_data', bodyOff, len, d.subarray(bodyOff, bodyOff + len), dtls ? 'Encrypted Application Data' : undefined);
        if (ap) ctx.gen(rn, P + '.app_data_proto', ap);
        ctx.pduInfo('tls', 'Application Data');
        break;
      }
      default:
        desc = T.CONTENT_TYPES[type] || 'Unknown';
        ctx.pduInfo('tls', desc);
    }
    if (rn !== NULLNODE) rn.label = desc === null ? 'Record Layer' : `${verLabel} Record Layer: ${desc}`;
    setCol(ctx, c, dtls, rver);
    o = bodyOff + len;
  }
  return end - off;
}

function isPlainHello(d, o, len, dtls) {
  if (len < 4) return false;
  const t = d[o];
  const hl = dtls ? 12 : 4;
  return (t === 1 || t === 2) && hl + u24(d, o + 1) <= len;
}

function sessionVerName(c, rver, d, bodyOff, type, dtls) {
  if (c.version) return verName(c.version);
  if (dtls) return verName(c.recVer || rver);
  // Before the server picked a version, show the higher of record and hello versions.
  if (type === 22 && d[bodyOff] === 1) return verName(Math.max(rver, u16(d, bodyOff + 4)));
  return verName(rver);
}
function setCol(ctx, c, dtls, rver) {
  // DTLS sticks to the first record version until a ServerHello says otherwise.
  if (dtls && !c.version && rver) { if (ctx.first && !c.recVer) c.recVer = rver; ctx.setProtocol(verName(c.recVer || rver)); return; }
  if (c.version) ctx.setProtocol(verName(c.version));
  else ctx.setProtocol(rver ? verName(c.legacyVersion > rver ? c.legacyVersion : rver) : (dtls ? 'DTLS' : 'TLS'));
}
function appProto(ctx, c) {
  if (c.version !== 0x0304 && c.alpn && ALPN_PROTO[c.alpn]) return ALPN_PROTO[c.alpn];
  return PORT_PROTO[c.serverPort || Math.min(ctx.srcport, ctx.dstport)] || null;
}

// ---------------------------------------------------------------------------------------------
// Handshake messages (shared by TLS records, DTLS and QUIC CRYPTO frames)
/**
 * Dissect handshake messages in [o, end) under `parent`. Returns the record description text.
 * quic: called from QUIC CRYPTO frames (always TLS 1.3, JA4 'q').
 */
export function handshakeMessages(ctx, parent, o, end, c, dtls, quic) {
  const d = ctx.d;
  const P = dtls ? 'dtls' : 'tls';
  const hh = dtls ? 12 : 4;
  const names = [];
  let count = 0;
  while (o + hh <= end) {
    const ht = d[o], hlen = u24(d, o + 1);
    const mend = o + hh + hlen;
    let name = T.HS_TYPES[ht] || `Unknown (${ht})`;
    if (mend > end) {
      // Fragment of a message continued in the next record (or garbage).
      ctx.add(parent, P + '.handshake', o, end - o, null, `Handshake Protocol: ${name} (fragment)`);
      names.push(name + ' (fragment)');
      if (!quic) ctx.pduInfo('tls', `[${name} Fragment]`);
      break;
    }
    if (ht === 2 && hlen >= 34 && hexStr(d, o + hh + 2, 32) === HRR_RANDOM) name = 'Hello Retry Request';
    const hn = ctx.add(parent, P + '.handshake', o, hh + hlen, null, `Handshake Protocol: ${name}`);
    ctx.add(hn, P + '.handshake.type', o, 1, ht);
    ctx.add(hn, P + '.handshake.length', o + 1, 3, hlen);
    if (dtls) {
      ctx.add(hn, 'dtls.handshake.message_seq', o + 4, 2, u16(d, o + 4));
      ctx.add(hn, 'dtls.handshake.fragment_offset', o + 6, 3, u24(d, o + 6));
      ctx.add(hn, 'dtls.handshake.fragment_length', o + 9, 3, u24(d, o + 9));
    }
    const b = o + hh;
    let info = name;
    switch (ht) {
      case 1: info = clientHello(ctx, hn, b, mend, c, dtls, quic); break;
      case 2: serverHello(ctx, hn, b, mend, c, dtls, quic); break;
      case 3: helloVerify(ctx, hn, b, mend); break;
      case 4: newSessionTicket(ctx, hn, b, mend, c, P); break;
      case 11: certificate(ctx, hn, b, mend, c, P); break;
      case 12: serverKeyExchange(ctx, hn, b, mend, c, P); break;
      case 13: certificateRequest(ctx, hn, b, mend, c, P); break;
      case 16: clientKeyExchange(ctx, hn, b, mend, c, P); break;
      case 20: if (hlen && ctx.tree) ctx.add(hn, P + '.handshake.verify_data', b, hlen, d.subarray(b, mend)); break;
      default: break;
    }
    names.push(name);
    if (!quic) ctx.pduInfo('tls', info);
    count++;
    o = mend;
  }
  if (count > 1) return 'Handshake Protocol: Multiple Handshake Messages';
  return 'Handshake Protocol: ' + (names[0] || 'Unknown');
}

function addVersionExpert(ctx, node, dtls, has) {
  if (has && node !== NULLNODE) ctx.ei(node, dtls ? 'dtls.handshake.legacy_version' : 'tls.handshake.legacy_version');
}

function randomField(ctx, parent, P, o, c) {
  const d = ctx.d;
  const hrr = hexStr(d, o, 32) === HRR_RANDOM;
  const rn = ctx.add(parent, P + '.handshake.random', o, 32, d.subarray(o, o + 32), hrr ? `Random: ${HRR_RANDOM} (HelloRetryRequest magic)` : undefined);
  if (hrr) return;
  // GMT Unix Time is meaningless in TLS 1.3 randoms; Wireshark hides it there.
  if (rn !== NULLNODE && c.version !== 0x0304) {
    ctx.add(rn, P + '.handshake.random_time', o, 4, { sec: u32(d, o), nsec: 0 });
    ctx.add(rn, P + '.handshake.random_bytes', o + 4, 28, d.subarray(o + 4, o + 32));
  }
}

function clientHello(ctx, hn, o, end, c, dtls, quic) {
  const d = ctx.d;
  const P = dtls ? 'dtls' : 'tls';
  ctx.need(o, 35, end);
  const ver = u16(d, o);
  if (ctx.first) {
    c.client = ctx.netSrc + ':' + ctx.srcport;
    c.serverPort = ctx.dstport;
    c.legacyVersion = ver;
  }
  const vn = ctx.add(hn, P + '.handshake.version', o, 2, ver);
  randomField(ctx, hn, P, o + 2, c);
  let p = o + 34;
  const sl = d[p];
  ctx.add(hn, P + '.handshake.session_id_length', p, 1, sl);
  if (sl) ctx.add(hn, P + '.handshake.session_id', p + 1, sl, d.subarray(p + 1, p + 1 + sl));
  p += 1 + sl;
  if (dtls) {
    ctx.need(p, 1, end);
    const cl = d[p];
    ctx.add(hn, 'dtls.handshake.cookie_length', p, 1, cl);
    if (cl) ctx.add(hn, 'dtls.handshake.cookie', p + 1, cl, d.subarray(p + 1, p + 1 + cl));
    p += 1 + cl;
  }
  ctx.need(p, 2, end);
  const csl = u16(d, p);
  ctx.need(p + 2, csl, end);
  const ciphers = [];
  for (let i = 0; i + 1 < csl; i += 2) ciphers.push(u16(d, p + 2 + i));
  if (ctx.tree) {
    ctx.add(hn, P + '.handshake.cipher_suites_length', p, 2, csl);
    const cn = ctx.add(hn, P + '.handshake.ciphersuites', p + 2, csl, null, `Cipher Suites (${ciphers.length} suite${ciphers.length === 1 ? '' : 's'})`);
    for (let i = 0; i < ciphers.length; i++) ctx.add(cn, P + '.handshake.ciphersuite', p + 2 + 2 * i, 2, ciphers[i]);
  }
  p += 2 + csl;
  ctx.need(p, 1, end);
  const cml = d[p];
  if (ctx.tree) {
    ctx.add(hn, P + '.handshake.comp_methods_length', p, 1, cml);
    const cm = ctx.add(hn, P + '.handshake.comp_methods', p + 1, cml, null, `Compression Methods (${cml} method${cml === 1 ? '' : 's'})`);
    for (let i = 0; i < cml; i++) ctx.add(cm, P + '.handshake.comp_method', p + 1 + i, 1, d[p + 1 + i]);
  }
  p += 1 + cml;
  const ex = p + 2 <= end ? extensions(ctx, hn, p, end, c, P, 1, quic) : { types: [], sni: null };
  addVersionExpert(ctx, vn, dtls, ex.versions);
  if (ctx.tree) fingerprints(ctx, hn, ver, ciphers, ex, quic, P);
  return ex.sni != null ? `Client Hello (SNI=${ex.sni})` : 'Client Hello';
}

function serverHello(ctx, hn, o, end, c, dtls, quic) {
  const d = ctx.d;
  const P = dtls ? 'dtls' : 'tls';
  ctx.need(o, 35, end);
  const ver = u16(d, o);
  const vn = ctx.add(hn, P + '.handshake.version', o, 2, ver);
  let p = o + 34;
  const sl = d[p];
  // Peek at extensions first on the first pass so the session version is known for the random field.
  let p2 = p + 1 + sl;
  const cipher = u16(d, p2);
  if (ctx.first) {
    c.cipher = cipher;
    c.version = ver;
    if (!c.client) c.client = ctx.netDst + ':' + ctx.dstport;
    if (!c.serverPort) c.serverPort = ctx.srcport;
    const sv = findExt(d, p2 + 3, end, 43);
    if (sv >= 0 && u16(d, sv + 2) >= 2) c.version = u16(d, sv + 4);
    const al = findExt(d, p2 + 3, end, 16);
    if (al >= 0) { const sl2 = d[al + 6]; c.alpn = ascii(d, al + 7, sl2); }
  }
  randomField(ctx, hn, P, o + 2, c);
  ctx.add(hn, P + '.handshake.session_id_length', p, 1, sl);
  if (sl) ctx.add(hn, P + '.handshake.session_id', p + 1, sl, d.subarray(p + 1, p + 1 + sl));
  p = p2;
  ctx.need(p, 3, end);
  ctx.add(hn, P + '.handshake.ciphersuite', p, 2, cipher);
  ctx.add(hn, P + '.handshake.comp_method', p + 2, 1, d[p + 2]);
  p += 3;
  const ex = p + 2 <= end ? extensions(ctx, hn, p, end, c, P, 2, quic) : { types: [] };
  addVersionExpert(ctx, vn, dtls, ex.versions);
  if (ctx.tree) {
    const full = `${ver},${cipher},${ex.types.join('-')}`;
    ctx.gen(hn, P + '.handshake.ja3s_full', full, `JA3S Fullstring: ${full}`);
    ctx.gen(hn, P + '.handshake.ja3s', md5hex(full), `JA3S: ${md5hex(full)}`);
  }
}

/** Offset of extension `type` (its type field) inside an extensions block starting at o (length prefix), or -1. */
function findExt(d, o, end, type) {
  if (o + 2 > end) return -1;
  const lim = Math.min(end, o + 2 + u16(d, o));
  let p = o + 2;
  while (p + 4 <= lim) {
    const t = u16(d, p), l = u16(d, p + 2);
    if (t === type) return p;
    p += 4 + l;
  }
  return -1;
}

function helloVerify(ctx, hn, o, end) {
  const d = ctx.d;
  ctx.need(o, 3, end);
  ctx.add(hn, 'dtls.handshake.version', o, 2, u16(d, o));
  const cl = d[o + 2];
  ctx.add(hn, 'dtls.handshake.cookie_length', o + 2, 1, cl);
  if (cl) ctx.add(hn, 'dtls.handshake.cookie', o + 3, cl, d.subarray(o + 3, Math.min(end, o + 3 + cl)));
}

function newSessionTicket(ctx, hn, o, end, c, P) {
  if (!ctx.tree) return;
  const d = ctx.d;
  ctx.need(o, 6, end);
  const tn = ctx.text(hn, 'TLS Session Ticket', o, end - o);
  const life = u32(d, o);
  ctx.add(tn, P + '.handshake.session_ticket_lifetime_hint', o, 4, life, `Session Ticket Lifetime Hint: ${life} seconds${lifeText(life)}`);
  let p = o + 4;
  if (c.version === 0x0304) {
    ctx.add(tn, P + '.handshake.session_ticket_age_add', p, 4, u32(d, p));
    const nl = d[p + 4];
    ctx.add(tn, P + '.handshake.session_ticket_nonce_length', p + 4, 1, nl);
    ctx.add(tn, P + '.handshake.session_ticket_nonce', p + 5, nl, d.subarray(p + 5, p + 5 + nl));
    p += 5 + nl;
  }
  const tl = u16(d, p);
  ctx.add(tn, P + '.handshake.session_ticket_length', p, 2, tl);
  ctx.add(tn, P + '.handshake.session_ticket', p + 2, tl, d.subarray(p + 2, Math.min(end, p + 2 + tl)));
}
function lifeText(s) {
  if (!s) return '';
  const parts = [];
  const days = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (days) parts.push(`${days} day${days > 1 ? 's' : ''}`);
  if (h) parts.push(`${h} hour${h > 1 ? 's' : ''}`);
  if (m) parts.push(`${m} minute${m > 1 ? 's' : ''}`);
  if (sec) parts.push(`${sec} second${sec > 1 ? 's' : ''}`);
  return ` (${parts.join(', ')})`;
}

function certificate(ctx, hn, o, end, c, P) {
  const d = ctx.d;
  let p = o;
  if (c.version === 0x0304) { const cl = d[p]; ctx.add(hn, P + '.handshake.certificate_request_context_length', p, 1, cl); p += 1 + cl; }
  ctx.need(p, 3, end);
  const total = u24(d, p);
  ctx.add(hn, P + '.handshake.certificates_length', p, 3, total);
  const lim = Math.min(end, p + 3 + total);
  const cn = ctx.add(hn, P + '.handshake.certificates', p + 3, lim - p - 3, null, `Certificates (${total} bytes)`);
  p += 3;
  while (p + 3 <= lim) {
    const cl = u24(d, p);
    ctx.add(cn, P + '.handshake.certificate_length', p, 3, cl);
    const ce = Math.min(lim, p + 3 + cl);
    const node = ctx.add(cn, P + '.handshake.certificate', p + 3, ce - p - 3, d.subarray(p + 3, ce));
    x509(ctx, node, p + 3, ce);
    p = ce;
    if (c.version === 0x0304 && p + 2 <= lim) { const el = u16(d, p); p += 2 + el; }
  }
}

function serverKeyExchange(ctx, hn, o, end, c, P) {
  if (!ctx.tree) return;
  const d = ctx.d;
  const name = T.CIPHER_SUITES[c.cipher] || '';
  if (/_(EC)?DHE_|ECDH_anon/.test(name) && name.includes('ECDHE') && d[o] === 3) {
    const n = ctx.text(hn, 'EC Diffie-Hellman Server Params', o, end - o);
    ctx.add(n, P + '.handshake.server_curve_type', o, 1, d[o]);
    ctx.add(n, P + '.handshake.server_named_curve', o + 1, 2, u16(d, o + 1));
    const pl = d[o + 3];
    ctx.add(n, P + '.handshake.server_point_len', o + 3, 1, pl);
    ctx.add(n, P + '.handshake.server_point', o + 4, pl, d.subarray(o + 4, o + 4 + pl));
    let p = o + 4 + pl;
    if (c.version === 0x0303 && p + 2 <= end) { sigAlg(ctx, n, P, p); p += 2; }
    if (p + 2 <= end) {
      const sl = u16(d, p);
      ctx.add(n, P + '.handshake.sig_len', p, 2, sl);
      ctx.add(n, P + '.handshake.sig', p + 2, sl, d.subarray(p + 2, Math.min(end, p + 2 + sl)));
    }
  } else if (end > o) ctx.text(hn, `Server Key Exchange parameters (${end - o} bytes)`, o, end - o);
}
function clientKeyExchange(ctx, hn, o, end, c, P) {
  if (!ctx.tree) return;
  const d = ctx.d;
  const name = T.CIPHER_SUITES[c.cipher] || '';
  if (name.includes('ECDH')) {
    const n = ctx.text(hn, 'EC Diffie-Hellman Client Params', o, end - o);
    const pl = d[o];
    ctx.add(n, P + '.handshake.client_point_len', o, 1, pl);
    ctx.add(n, P + '.handshake.client_point', o + 1, pl, d.subarray(o + 1, Math.min(end, o + 1 + pl)));
  } else if (name.startsWith('TLS_RSA_')) {
    const n = ctx.text(hn, 'RSA Encrypted PreMaster Secret', o, end - o);
    const l = u16(d, o);
    ctx.add(n, P + '.handshake.epms_len', o, 2, l);
    ctx.add(n, P + '.handshake.epms', o + 2, l, d.subarray(o + 2, Math.min(end, o + 2 + l)));
  } else if (end > o) ctx.text(hn, `Client Key Exchange parameters (${end - o} bytes)`, o, end - o);
}
function certificateRequest(ctx, hn, o, end, c, P) {
  if (!ctx.tree || c.version === 0x0304) return;
  const d = ctx.d;
  const n = d[o];
  ctx.add(hn, P + '.handshake.cert_types_count', o, 1, n);
  const ct = ctx.add(hn, P + '.handshake.cert_types', o + 1, n, null, `Certificate types (${n} type${n === 1 ? '' : 's'})`);
  for (let i = 0; i < n; i++) ctx.add(ct, P + '.handshake.cert_type', o + 1 + i, 1, d[o + 1 + i]);
  let p = o + 1 + n;
  if (c.version === 0x0303) {
    const l = u16(d, p);
    ctx.add(hn, P + '.handshake.sig_hash_alg_len', p, 2, l);
    const sn = ctx.add(hn, P + '.handshake.sig_hash_algs', p + 2, l, null, `Signature Hash Algorithms (${l >> 1} algorithm${l === 2 ? '' : 's'})`);
    for (let i = 0; i + 1 < l; i += 2) sigAlg(ctx, sn, P, p + 2 + i);
    p += 2 + l;
  }
  if (p + 2 <= end) ctx.add(hn, P + '.handshake.dnames_len', p, 2, u16(d, p));
}
function sigAlg(ctx, parent, P, o) {
  const d = ctx.d;
  const v = u16(d, o);
  const n = ctx.add(parent, P + '.handshake.sig_hash_alg', o, 2, v);
  ctx.add(n, P + '.handshake.sig_hash_hash', o, 1, d[o]);
  ctx.add(n, P + '.handshake.sig_hash_sig', o + 1, 1, d[o + 1]);
}

// ---------------------------------------------------------------------------------------------
// Extensions. hsType 1 = ClientHello, 2 = ServerHello. Returns facts for Info and fingerprints.
function extensions(ctx, hn, o, end, c, P, hsType, quic) {
  const d = ctx.d;
  const tree = ctx.tree;
  const total = u16(d, o);
  ctx.add(hn, P + '.handshake.extensions_length', o, 2, total);
  const lim = Math.min(end, o + 2 + total);
  const r = { types: [], sni: null, groups: [], formats: [], alpn: [], sigalgs: [], versions: null };
  let p = o + 2;
  while (p + 4 <= lim) {
    const t = u16(d, p), l = u16(d, p + 2);
    const b = p + 4, e = Math.min(lim, b + l);
    if (!isGrease(t)) r.types.push(t);
    let extra = '';
    switch (t) {
      case 0: // server_name
        if (hsType === 1 && l >= 5) {
          const nl = u16(d, b + 3);
          r.sni = utf8(d, b + 5, Math.min(nl, e - b - 5));
          extra = ` name=${r.sni}`;
        }
        break;
      case 10: for (let i = b + 2; i + 1 < e; i += 2) { const g = u16(d, i); if (!isGrease(g)) r.groups.push(g); } break;
      case 11: for (let i = b + 1; i < e; i++) r.formats.push(d[i]); break;
      case 13: for (let i = b + 2; i + 1 < e; i += 2) r.sigalgs.push(u16(d, i)); break;
      case 16: if (hsType === 1) { for (let i = b + 2; i < e;) { const sl = d[i]; r.alpn.push(ascii(d, i + 1, sl)); i += 1 + sl; } } break;
      case 43:
        r.versions = [];
        if (hsType === 1) for (let i = b + 1; i + 1 < e; i += 2) r.versions.push(u16(d, i));
        else if (l >= 2) r.versions.push(u16(d, b));
        extra = ' ' + r.versions.filter((v) => !isGrease(v)).map((v) => T.VERSIONS[v] || hexPad(v, 4)).join(', ');
        break;
      case 51:
        if (hsType === 2 && l >= 2) extra = ' ' + (T.GROUPS[u16(d, b)] || u16(d, b));
        else if (hsType === 1) {
          const gs = [];
          for (let i = b + 2; i + 4 <= e;) { const g = u16(d, i); if (!isGrease(g)) gs.push(T.GROUPS[g] || g); i += 4 + u16(d, i + 2); }
          extra = gs.length ? ' ' + gs.join(', ') : '';
        }
        break;
      default: break;
    }
    if (tree) {
      const tname = T.EXT_TYPES[t] || 'Unknown';
      const en = ctx.add(hn, P + '.handshake.extension', p, 4 + l, null, `Extension: ${tname} (len=${l})${extra}`);
      ctx.add(en, P + '.handshake.extension.type', p, 2, t);
      ctx.add(en, P + '.handshake.extension.len', p + 2, 2, l);
      extensionBody(ctx, en, t, b, e, P, hsType, l);
    }
    p = b + l;
  }
  return r;
}

function extensionBody(ctx, en, t, b, e, P, hsType, l) {
  const d = ctx.d;
  switch (t) {
    case 0: {
      if (l === 0) return;
      const sn = ctx.text(en, 'Server Name Indication extension', b, e - b);
      ctx.add(sn, P + '.handshake.extensions_server_name_list_len', b, 2, u16(d, b));
      for (let i = b + 2; i + 3 <= e;) {
        const nl = u16(d, i + 1);
        ctx.add(sn, P + '.handshake.extensions_server_name_type', i, 1, d[i]);
        ctx.add(sn, P + '.handshake.extensions_server_name_len', i + 1, 2, nl);
        ctx.add(sn, P + '.handshake.extensions_server_name', i + 3, nl, utf8(d, i + 3, Math.min(nl, e - i - 3)));
        i += 3 + nl;
      }
      return;
    }
    case 10: {
      const gl = u16(d, b);
      ctx.add(en, P + '.handshake.extensions_supported_groups_length', b, 2, gl);
      const n = gl >> 1;
      const gn = ctx.add(en, P + '.handshake.extensions_supported_groups', b + 2, gl, null, `Supported Groups (${n} group${n === 1 ? '' : 's'})`);
      for (let i = b + 2; i + 1 < e; i += 2) ctx.add(gn, P + '.handshake.extensions_supported_group', i, 2, u16(d, i));
      return;
    }
    case 11: {
      const fl = d[b];
      ctx.add(en, P + '.handshake.extensions_ec_point_formats_length', b, 1, fl);
      const fn = ctx.add(en, P + '.handshake.extensions_ec_point_formats', b + 1, fl, null, `Elliptic curves point formats (${fl})`);
      for (let i = b + 1; i < e; i++) ctx.add(fn, P + '.handshake.extensions_ec_point_format', i, 1, d[i]);
      return;
    }
    case 13: {
      const sl = u16(d, b);
      ctx.add(en, P + '.handshake.sig_hash_alg_len', b, 2, sl);
      const n = sl >> 1;
      const sn = ctx.add(en, P + '.handshake.sig_hash_algs', b + 2, sl, null, `Signature Hash Algorithms (${n} algorithm${n === 1 ? '' : 's'})`);
      for (let i = b + 2; i + 1 < e; i += 2) sigAlg(ctx, sn, P, i);
      return;
    }
    case 16: {
      ctx.add(en, P + '.handshake.extensions_alpn_len', b, 2, u16(d, b));
      const an = ctx.add(en, P + '.handshake.extensions_alpn_list', b + 2, e - b - 2, null);
      for (let i = b + 2; i < e;) {
        const sl = d[i];
        ctx.add(an, P + '.handshake.extensions_alpn_str_len', i, 1, sl);
        ctx.add(an, P + '.handshake.extensions_alpn_str', i + 1, sl, ascii(d, i + 1, Math.min(sl, e - i - 1)));
        i += 1 + sl;
      }
      return;
    }
    case 43: {
      if (hsType === 1) {
        ctx.add(en, P + '.handshake.extensions.supported_versions_len', b, 1, d[b]);
        for (let i = b + 1; i + 1 < e; i += 2) ctx.add(en, P + '.handshake.extensions.supported_version', i, 2, u16(d, i));
      } else if (l >= 2) ctx.add(en, P + '.handshake.extensions.supported_version', b, 2, u16(d, b));
      return;
    }
    case 51: {
      const kn = ctx.text(en, 'Key Share extension', b, e - b);
      if (hsType === 2) {
        if (l === 2) { ctx.add(kn, P + '.handshake.extensions_key_share_selected_group', b, 2, u16(d, b)); return; }
        keyShareEntry(ctx, kn, b, e, P);
        return;
      }
      ctx.add(kn, P + '.handshake.extensions_key_share_client_length', b, 2, u16(d, b));
      for (let i = b + 2; i + 4 <= e;) i = keyShareEntry(ctx, kn, i, e, P);
      return;
    }
    case 45: {
      const n = d[b];
      ctx.add(en, P + '.extension.psk_ke_modes_length', b, 1, n);
      for (let i = b + 1; i < e; i++) ctx.add(en, P + '.extension.psk_ke_mode', i, 1, d[i]);
      return;
    }
    case 0xff01: {
      const rn = ctx.text(en, 'Renegotiation Info extension', b, e - b);
      ctx.add(rn, P + '.handshake.extensions_reneg_info_len', b, 1, d[b]);
      if (d[b]) ctx.add(rn, P + '.handshake.extensions_reneg_info', b + 1, d[b], d.subarray(b + 1, e));
      return;
    }
    case 35:
      ctx.add(en, P + '.handshake.extensions.session_ticket', b, l, d.subarray(b, e));
      return;
    case 5:
      if (hsType === 1 && l >= 5) {
        ctx.add(en, P + '.handshake.extensions_status_request_type', b, 1, d[b]);
        ctx.add(en, P + '.handshake.extensions_status_request_responder_ids_len', b + 1, 2, u16(d, b + 1));
        ctx.add(en, P + '.handshake.extensions_status_request_exts_len', b + 3, 2, u16(d, b + 3));
      }
      return;
    case 21:
      ctx.add(en, P + '.handshake.extensions_padding_data', b, l, d.subarray(b, e));
      return;
    case 44:
      ctx.add(en, P + '.handshake.extensions.cookie_len', b, 2, u16(d, b));
      ctx.add(en, P + '.handshake.extensions.cookie', b + 2, e - b - 2, d.subarray(b + 2, e));
      return;
    case 41:
      if (hsType === 2 && l === 2) ctx.add(en, P + '.handshake.extensions.psk.identity.selected', b, 2, u16(d, b));
      else if (l >= 2) {
        const il = u16(d, b);
        ctx.add(en, P + '.handshake.extensions.psk.identities.length', b, 2, il);
        if (b + 2 + il + 2 <= e) ctx.add(en, P + '.handshake.extensions.psk.binders_len', b + 2 + il, 2, u16(d, b + 2 + il));
      }
      return;
    case 57: case 0xffa5:
      if (P === 'tls') quicParams(ctx, en, b, e);
      return;
    case 18: case 23: case 22: case 49:
      return; // empty extensions (SCT request, extended_master_secret, encrypt_then_mac, post_handshake_auth)
    default:
      if (isGrease(t) && l === 0) { ctx.add(en, P + '.handshake.extension.data', b, 0, new Uint8Array(0)); return; }
      if (l) ctx.add(en, P + '.handshake.extension.data', b, l, d.subarray(b, e));
  }
}
function keyShareEntry(ctx, parent, i, e, P) {
  const d = ctx.d;
  const g = u16(d, i), kl = u16(d, i + 2);
  const gname = T.GROUPS[g] || 'Unknown';
  const n = ctx.text(parent, `Key Share Entry: Group: ${gname}, Key Exchange length: ${kl}`, i, 4 + kl);
  ctx.add(n, P + '.handshake.extensions_key_share_group', i, 2, g);
  ctx.add(n, P + '.handshake.extensions_key_share_key_exchange_length', i + 2, 2, kl);
  if (kl) ctx.add(n, P + '.handshake.extensions_key_share_key_exchange', i + 4, kl, d.subarray(i + 4, Math.min(e, i + 4 + kl)));
  return i + 4 + kl;
}
function varint(d, o) {
  const l = 1 << (d[o] >> 6);
  let v = d[o] & 0x3f;
  for (let i = 1; i < l; i++) v = v * 256 + d[o + i];
  return [v, l];
}
function quicParams(ctx, en, b, e) {
  const d = ctx.d;
  for (let i = b; i < e;) {
    const [t, tl] = varint(d, i);
    const [l, ll] = varint(d, i + tl);
    const vo = i + tl + ll;
    const name = QUIC_PARAMS[t] || 'Unknown';
    let summary = '';
    let iv = null;
    if (QUIC_INT_PARAMS.has(t) && l) { iv = varint(d, vo)[0]; summary = ' ' + iv + (t === 1 || t === 0x0b ? ' ms' : ''); }
    const pn = ctx.add(en, 'tls.quic.parameter', i, tl + ll + l, null, `Parameter: ${name} (len=${l})${summary}`);
    ctx.add(pn, 'tls.quic.parameter.type', i, tl, BigInt(t), `Type: ${name} (${hexPad(t, t > 0xff ? 4 : 2)})`);
    ctx.add(pn, 'tls.quic.parameter.length', i + tl, ll, BigInt(l));
    if (l) ctx.add(pn, 'tls.quic.parameter.value', vo, l, d.subarray(vo, vo + l));
    if (iv !== null) ctx.add(pn, `tls.quic.parameter.${name}`, vo, l, BigInt(iv));
    else if (QUIC_CID_PARAMS.has(t)) ctx.add(pn, `tls.quic.parameter.${name}`, vo, l, d.subarray(vo, vo + l));
    i = vo + l;
  }
}

// ---------------------------------------------------------------------------------------------
// JA3 / JA4 fingerprints of a ClientHello
function fingerprints(ctx, hn, ver, ciphers, ex, quic, P) {
  const cs = ciphers.filter((v) => !isGrease(v));
  const full = `${ver},${cs.join('-')},${ex.types.join('-')},${ex.groups.join('-')},${ex.formats.join('-')}`;
  const vers = (ex.versions || []).filter((v) => !isGrease(v));
  const top = vers.length ? Math.max(...vers) : ver;
  const vmap = { 0x0304: '13', 0x0303: '12', 0x0302: '11', 0x0301: '10', 0x0300: 's3', 0x0002: 's2', 0xfeff: 'd1', 0xfefd: 'd2', 0xfefc: 'd3' };
  const alpn = ex.alpn.length ? ex.alpn[0] : '';
  const a = alpn ? (alpn.length >= 2 ? alpn[0] + alpn[alpn.length - 1] : alpn + alpn) : '00';
  const nn = (n) => String(Math.min(n, 99)).padStart(2, '0');
  const h4 = (v) => v.toString(16).padStart(4, '0');
  const ja4a = `${quic ? 'q' : P === 'dtls' ? 'd' : 't'}${vmap[top] || '00'}${ex.sni != null ? 'd' : 'i'}${nn(cs.length)}${nn(ex.types.length)}${a}`;
  const cSorted = cs.map(h4).sort().join(',');
  const eSorted = ex.types.filter((t) => t !== 0 && t !== 16).map(h4).sort().join(',');
  const sig = ex.sigalgs.map(h4).join(',');
  const eStr = sig ? `${eSorted}_${sig}` : eSorted;
  const h12 = (s) => (s ? hexStr(sha256(new TextEncoder().encode(s)), 0, 6) : '000000000000');
  const ja4 = `${ja4a}_${h12(cSorted)}_${h12(eStr)}`;
  ctx.gen(hn, P + '.handshake.ja4', ja4, `JA4: ${ja4}`);
  ctx.gen(hn, P + '.handshake.ja4_r', `${ja4a}_${cSorted}_${eStr}`, `JA4_r: ${ja4a}_${cSorted}_${eStr}`);
  ctx.gen(hn, P + '.handshake.ja3_full', full, `JA3 Fullstring: ${full}`);
  ctx.gen(hn, P + '.handshake.ja3', md5hex(full), `JA3: ${md5hex(full)}`);
}

// Compact MD5 (RFC 1321) for JA3.
const MD5S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const MD5K = new Int32Array(64).map((_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0);
export function md5hex(str) {
  const msg = new TextEncoder().encode(str);
  const n = ((msg.length + 8) >> 6) + 1;
  const w = new Int32Array(n * 16);
  for (let i = 0; i < msg.length; i++) w[i >> 2] |= msg[i] << ((i % 4) * 8);
  w[msg.length >> 2] |= 0x80 << ((msg.length % 4) * 8);
  w[n * 16 - 2] = msg.length * 8;
  let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
  for (let k = 0; k < n * 16; k += 16) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const s = MD5S[(i >> 4) * 4 + (i % 4)];
      const x = (a + f + MD5K[i] + w[k + g]) | 0;
      a = d; d = c; c = b; b = (b + ((x << s) | (x >>> (32 - s)))) | 0;
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
  }
  let out = '';
  for (const v of [a0, b0, c0, d0]) for (let i = 0; i < 4; i++) out += ((v >>> (8 * i)) & 255).toString(16).padStart(2, '0');
  return out;
}

// ---------------------------------------------------------------------------------------------
// X.509 (DER). Layers 'x509sat' per attribute value and 'x509ce' per known extension are pushed
// on every pass (frame.protocols needs them); tree items only when building a tree.
const OIDS = {
  '2.5.4.3': 'id-at-commonName', '2.5.4.6': 'id-at-countryName', '2.5.4.7': 'id-at-localityName', '2.5.4.8': 'id-at-stateOrProvinceName',
  '2.5.4.9': 'id-at-streetAddress', '2.5.4.10': 'id-at-organizationName', '2.5.4.11': 'id-at-organizationalUnitName', '2.5.4.5': 'id-at-serialNumber',
  '2.5.4.17': 'id-at-postalCode', '2.5.4.4': 'id-at-surname', '2.5.4.42': 'id-at-givenName', '2.5.4.12': 'id-at-title',
  '1.2.840.113549.1.9.1': 'pkcs-9-at-emailAddress', '0.9.2342.19200300.100.1.25': 'id-domainComponent',
  '1.2.840.113549.1.1.1': 'rsaEncryption', '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption', '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption',
  '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption', '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption', '1.2.840.113549.1.1.10': 'id-RSASSA-PSS',
  '1.2.840.10045.2.1': 'id-ecPublicKey', '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256', '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384',
  '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512', '1.2.840.10045.3.1.7': 'secp256r1', '1.3.132.0.34': 'secp384r1', '1.3.132.0.35': 'secp521r1',
  '1.3.101.112': 'id-Ed25519', '1.3.101.113': 'id-Ed448',
  '2.5.29.14': 'id-ce-subjectKeyIdentifier', '2.5.29.15': 'id-ce-keyUsage', '2.5.29.17': 'id-ce-subjectAltName', '2.5.29.18': 'id-ce-issuerAltName',
  '2.5.29.19': 'id-ce-basicConstraints', '2.5.29.31': 'id-ce-cRLDistributionPoints', '2.5.29.32': 'id-ce-certificatePolicies',
  '2.5.29.35': 'id-ce-authorityKeyIdentifier', '2.5.29.37': 'id-ce-extKeyUsage',
  '1.3.6.1.5.5.7.1.1': 'id-pe-authorityInfoAccess', '1.3.6.1.4.1.11129.2.4.2': 'SignedCertificateTimestampList',
};
function tlv(d, o, end) {
  if (o + 2 > end) return null;
  const tag = d[o];
  let l = d[o + 1], h = 2;
  if (l & 0x80) {
    const n = l & 0x7f;
    if (n === 0 || n > 3 || o + 2 + n > end) return null;
    l = 0;
    for (let i = 0; i < n; i++) l = l * 256 + d[o + 2 + i];
    h = 2 + n;
  }
  const v = o + h;
  if (v + l > end) return null;
  return { tag, v, end: v + l, o };
}
function children(d, t) { const out = []; for (let p = t.v; p < t.end;) { const c = tlv(d, p, t.end); if (!c) break; out.push(c); p = c.end; } return out; }
function oidStr(d, o, end) {
  if (o >= end) return '';
  const parts = [Math.floor(d[o] / 40) > 2 ? 2 : Math.floor(d[o] / 40), d[o] < 80 ? d[o] % 40 : d[o] - 80];
  let v = 0;
  for (let i = o + 1; i < end; i++) { v = v * 128 + (d[i] & 0x7f); if (!(d[i] & 0x80)) { parts.push(v); v = 0; } }
  return parts.join('.');
}
const oidLabel = (oid) => (OIDS[oid] ? `${oid} (${OIDS[oid]})` : oid);

function x509(ctx, node, o, end) {
  const d = ctx.d;
  const cert = tlv(d, o, end);
  if (!cert || cert.tag !== 0x30) return;
  const parts = children(d, cert);
  if (parts.length < 3) return;
  const [tbs, sigAlgT, sigVal] = parts;
  const tree = ctx.tree;
  const sc = ctx.add(node, 'x509af.signedCertificate_element', tbs.o, tbs.end - tbs.o, null);
  const f = children(d, tbs);
  let i = 0;
  if (f[i] && f[i].tag === 0xa0) {
    const vt = tlv(d, f[i].v, f[i].end);
    if (tree && vt) ctx.add(sc, 'x509af.version', vt.v, vt.end - vt.v, d[vt.v]);
    i++;
  } else if (tree) ctx.add(sc, 'x509af.version', 0, 0, 0);
  const serial = f[i++];
  if (tree && serial) ctx.add(sc, 'x509af.serialNumber', serial.v, serial.end - serial.v, d.subarray(serial.v, serial.end), `serialNumber: 0x${hexStr(d, serial.v, serial.end - serial.v)}`);
  const sig = f[i++];
  if (sig) algorithm(ctx, sc, 'x509af.signature_element', 'signature', sig);
  const issuer = f[i++];
  if (issuer) rdnSequence(ctx, sc, 'x509af.issuer', issuer);
  const validity = f[i++];
  if (validity && tree) {
    const vn = ctx.add(sc, 'x509af.validity_element', validity.o, validity.end - validity.o, null);
    const ts = children(d, validity);
    ['x509af.notBefore', 'x509af.notAfter'].forEach((a, k) => {
      const t = ts[k];
      if (!t) return;
      const gen = t.tag === 0x18;
      const tn = ctx.add(vn, a, t.o, t.end - t.o, gen ? 1 : 0);
      const s = ascii(d, t.v, t.end - t.v);
      ctx.add(tn, gen ? 'x509af.generalizedTime' : 'x509af.utcTime', t.v, t.end - t.v, derTime(s, gen));
    });
  }
  const subject = f[i++];
  if (subject) rdnSequence(ctx, sc, 'x509af.subject', subject);
  const spki = f[i++];
  if (spki) { const a0 = children(d, spki)[0]; if (a0) algLayers(ctx, a0); }
  if (spki && tree) {
    const sn = ctx.add(sc, 'x509af.subjectPublicKeyInfo_element', spki.o, spki.end - spki.o, null);
    const [alg, key] = children(d, spki);
    let algName = '';
    if (alg) algName = algorithm(ctx, sn, 'x509af.algorithm_element', 'algorithm', alg);
    if (key && key.tag === 0x03) {
      ctx.text(sn, `Padding: ${d[key.v]}`, key.v, 1);
      const kn = ctx.add(sn, 'x509af.subjectPublicKey', key.v + 1, key.end - key.v - 1, d.subarray(key.v + 1, key.end));
      if (algName === 'rsaEncryption') {
        const rk = tlv(d, key.v + 1, key.end);
        if (rk && rk.tag === 0x30) {
          const [m, ex] = children(d, rk);
          const rn = ctx.text(kn, 'RSA Public Key', rk.o, rk.end - rk.o);
          if (m) ctx.add(rn, 'pkixalgs.modulus', m.v, m.end - m.v, d.subarray(m.v, m.end), `modulus: 0x${hexStr(d, m.v, Math.min(36, m.end - m.v))}${m.end - m.v > 36 ? '…' : ''}`);
          if (ex) { let v = 0; for (let k = ex.v; k < ex.end; k++) v = v * 256 + d[k]; ctx.add(rn, 'pkixalgs.publicExponent', ex.v, ex.end - ex.v, v); }
        }
      }
    }
  }
  // optional unique ids [1] [2], then extensions [3]
  for (; i < f.length; i++) {
    if (f[i].tag !== 0xa3) continue;
    const seq = tlv(d, f[i].v, f[i].end);
    if (!seq) break;
    const exts = children(d, seq);
    const en = ctx.add(sc, 'x509af.extensions', seq.o, seq.end - seq.o, exts.length, `extensions: ${exts.length} item${exts.length === 1 ? '' : 's'}`);
    for (const e of exts) x509Extension(ctx, en, e);
  }
  if (sigAlgT) algorithm(ctx, node, 'x509af.algorithmIdentifier_element', 'algorithmIdentifier', sigAlgT);
  if (sigVal && sigVal.tag === 0x03 && tree) {
    ctx.text(node, `Padding: ${d[sigVal.v]}`, sigVal.v, 1);
    ctx.add(node, 'x509af.encrypted', sigVal.v + 1, sigVal.end - sigVal.v - 1, d.subarray(sigVal.v + 1, sigVal.end));
  }
}
function derTime(s, gen) {
  // YYMMDDhhmmssZ / YYYYMMDDhhmmssZ -> 'YYYY-MM-DD hh:mm:ss (UTC)'
  let y, r;
  if (gen) { y = s.slice(0, 4); r = s.slice(4); } else { const yy = +s.slice(0, 2); y = String(yy >= 50 ? 1900 + yy : 2000 + yy); r = s.slice(2); }
  return `${y}-${r.slice(0, 2)}-${r.slice(2, 4)} ${r.slice(4, 6)}:${r.slice(6, 8)}:${r.slice(8, 10) || '00'} (UTC)`;
}
function algorithm(ctx, parent, abbrev, label, t) {
  const d = ctx.d;
  const [oidT, params] = children(d, t);
  const oid = oidT && oidT.tag === 0x06 ? oidStr(d, oidT.v, oidT.end) : '';
  const name = OIDS[oid] || oid;
  if (!ctx.tree) return name;
  const n = ctx.add(parent, abbrev, t.o, t.end - t.o, null, `${label} (${name})`);
  if (oidT) ctx.add(n, 'x509af.algorithm.id', oidT.v, oidT.end - oidT.v, oid, `Algorithm Id: ${oidLabel(oid)}`);
  if (params && params.tag === 0x06) {
    const po = oidStr(d, params.v, params.end);
    const ep = ctx.text(n, 'ECParameters: namedCurve (1)', params.o, params.end - params.o);
    ctx.text(ep, `namedCurve: ${oidLabel(po)}`, params.v, params.end - params.v);
  }
  return name;
}
/** EC curve parameters are dissected by pkixalgs, which then shows up as a layer. */
function algLayers(ctx, t) {
  const ch = children(ctx.d, t);
  if (ch[1] && ch[1].tag === 0x06) ctx.layers.push('pkixalgs');
}
function rdnSequence(ctx, parent, abbrev, t) {
  const d = ctx.d;
  const rdns = children(d, t);
  const items = [];
  for (const set of rdns) {
    for (const atv of children(d, set)) {
      const [oidT, val] = children(d, atv);
      if (!oidT || !val) continue;
      const oid = oidStr(d, oidT.v, oidT.end);
      const s = val.tag === 0x1e ? bmp(d, val.v, val.end) : utf8(d, val.v, val.end - val.v);
      items.push({ set, atv, oidT, val, oid, s });
      // Attribute values with a registered dissector add an x509sat layer.
      if (oid.startsWith('2.5.4.')) ctx.layers.push('x509sat');
    }
  }
  if (!ctx.tree) return;
  const short = (it) => `${OIDS[it.oid] || it.oid}=${it.s}`;
  const n = ctx.add(parent, abbrev, t.o, t.end - t.o, 0, `${abbrev.slice(7)}: rdnSequence (0)`);
  const rn = ctx.add(n, 'x509if.rdnSequence', t.o, t.end - t.o, rdns.length,
    `rdnSequence: ${rdns.length} item${rdns.length === 1 ? '' : 's'} (${items.slice().reverse().map(short).join(',')})`);
  for (const it of items) {
    const si = ctx.add(rn, 'x509if.RDNSequence_item', it.set.o, it.set.end - it.set.o, 1, `RDNSequence item: 1 item (${short(it)})`);
    const ai = ctx.add(si, 'x509if.RelativeDistinguishedName_item_element', it.atv.o, it.atv.end - it.atv.o, null, `RelativeDistinguishedName item (${short(it)})`);
    ctx.add(ai, 'x509if.oid', it.oidT.v, it.oidT.end - it.oidT.v, it.oid, `Object Id: ${oidLabel(it.oid)}`);
    const vlen = it.val.end - it.val.v;
    if (it.oid === '2.5.4.6') ctx.add(ai, 'x509sat.CountryName', it.val.v, vlen, it.s);
    else if (it.val.tag === 0x16) ctx.add(ai, 'x509sat.IA5String', it.val.v, vlen, it.s);
    else {
      const kind = { 0x14: 0, 0x13: 1, 0x1c: 2, 0x1e: 3, 0x0c: 4 }[it.val.tag] ?? 4;
      const names = ['teletexString', 'printableString', 'universalString', 'bmpString', 'uTF8String'];
      const ds = ctx.add(ai, 'x509sat.DirectoryString', it.val.o, it.val.end - it.val.o, kind);
      ctx.add(ds, 'x509sat.' + names[kind], it.val.v, vlen, it.s);
    }
  }
}
function bmp(d, o, end) { let s = ''; for (let i = o; i + 1 < end; i += 2) s += String.fromCharCode((d[i] << 8) | d[i + 1]); return s; }
function x509Extension(ctx, parent, e) {
  const d = ctx.d;
  const ch = children(d, e);
  if (!ch.length) return;
  const oid = oidStr(d, ch[0].v, ch[0].end);
  let k = 1;
  let critical = null;
  if (ch[k] && ch[k].tag === 0x01) { critical = d[ch[k].v] !== 0; k++; }
  const val = ch[k];
  const known = oid.startsWith('2.5.29.') || oid === '1.3.6.1.4.1.11129.2.4.2';
  if (known) ctx.layers.push('x509ce');
  else if (oid === '1.3.6.1.5.5.7.1.1') ctx.layers.push('pkix1implicit');
  if (!ctx.tree) return;
  const en = ctx.add(parent, 'x509af.Extension_element', e.o, e.end - e.o, null, `Extension (${OIDS[oid] || oid})`);
  ctx.add(en, 'x509af.extension.id', ch[0].v, ch[0].end - ch[0].v, oid, `Extension Id: ${oidLabel(oid)}`);
  if (critical !== null) ctx.add(en, 'x509af.critical', ch[1].v, 1, critical);
  if (!val) return;
  const inner = tlv(d, val.v, val.end);
  if (oid === '2.5.29.17' && inner && inner.tag === 0x30) {
    const names = children(d, inner);
    const gn = ctx.add(en, 'x509ce.GeneralNames', inner.o, inner.end - inner.o, names.length, `GeneralNames: ${names.length} item${names.length === 1 ? '' : 's'}`);
    for (const g of names) {
      const kind = g.tag & 0x1f;
      const s = ascii(d, g.v, g.end - g.v);
      const gi = ctx.add(gn, 'x509ce.GeneralName', g.o, g.end - g.o, kind);
      if (kind === 2) ctx.add(gi, 'x509ce.dNSName', g.v, g.end - g.v, s);
      else if (kind === 1) ctx.add(gi, 'x509ce.rfc822Name', g.v, g.end - g.v, s);
      else if (kind === 6) ctx.add(gi, 'x509ce.uniformResourceIdentifier', g.v, g.end - g.v, s);
    }
  } else if (oid === '2.5.29.19' && inner && inner.tag === 0x30) {
    const bc = children(d, inner);
    const bn = ctx.add(en, 'x509ce.BasicConstraintsSyntax_element', inner.o, inner.end - inner.o, null, bc.length ? 'BasicConstraintsSyntax' : 'BasicConstraintsSyntax [0 length]');
    for (const x of bc) {
      if (x.tag === 0x01) ctx.add(bn, 'x509ce.cA', x.v, 1, d[x.v] !== 0);
      else if (x.tag === 0x02) ctx.add(bn, 'x509ce.pathLenConstraint', x.v, x.end - x.v, BigInt(d[x.v]));
    }
  } else if (oid === '2.5.29.14' && inner && inner.tag === 0x04) {
    ctx.add(en, 'x509ce.SubjectKeyIdentifier', inner.v, inner.end - inner.v, d.subarray(inner.v, inner.end));
  } else {
    ctx.add(en, 'x509af.extnValue', val.v, val.end - val.v, d.subarray(val.v, val.end));
  }
}
