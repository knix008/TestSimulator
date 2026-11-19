# MyNetManager — architecture

MyNetManager is a network protocol analyzer in the spirit of Wireshark (live capture, capture files,
dissection, display filters, colouring, statistics, follow stream, export) for **Web, Windows, macOS
and Linux** (Tauri 2). The window chrome, themes, icons, start page (card board), popup windows,
settings, tutorial and documents follow `../MyUMLMakerMultiOSV10` exactly (that project is the
style reference: frameless window, brand + Home + menus in the title row, coloured icon toolbar,
status bar, card-board start page with moving background).

Product name `MyNetManager`, identifier `com.shkwon.mynetmanager`, package `mynetmanager`,
localStorage prefix `mynetmanager.`, env prefix `MYNETMANAGER_`, dev server port **1460**.

## Folders

```
src/
  main.js app.js popup.js viewer.js styles.css themes.js icons.js icon-tones.js i18n.js i18n/{ko,en}.js
  ui/        shell helpers copied from MyUMLMaker (dom, tooltip, dropdown, startboard, startlayout,
             startpage, background, tutorial) + packet UI (packetlist, details, bytes, filterbar)
  platform/  native.js (Tauri/web boundary), popups.js (popup windows), capture.js (live capture client)
  domain/
    settings.js recent.js helpdocs.js
    capture/   pcap.js (read/write pcap + pcapng), synth.js (packet builder, demo traffic, samples)
    dissect/   core.js (engine), index.js (registers every protocol), proto/*.js (one per protocol family)
    filter/    lexer/parser/eval of display filters, fields registry helpers, coloring rules
    analysis/  stats (hierarchy, conversations, endpoints, io graph, lengths, http, dns, flow, expert),
               follow stream, export (text/csv/json/pdml/psml, objects, specified packets)
src-tauri/   Rust: window/popups/state/files/fonts/instance (from MyUMLMaker) + capture.rs (libpcap/Npcap)
test/        unit (node:test), e2e (CDP), witness (tshark comparison when Wireshark is installed)
doc/         Tutorial.md, Tutorial.en.md, UserGuide.md, UserGuide.en.md, images/{ko,en}
samples/     generated sample captures (*.pcapng), made by `npm run samples`
```

## Contracts between modules

All domain modules are plain ES modules, no DOM, runnable under Node 22 (`node --test`).

### Capture files — `src/domain/capture/pcap.js`

```js
readCapture(bytes: Uint8Array, name?: string) → CaptureFile      // throws Error with a readable message
writePcapng(file: CaptureFile, frames?: Frame[]) → Uint8Array    // keeps comments, interfaces
writePcap(file: CaptureFile, frames?: Frame[]) → Uint8Array      // one link type (first frame's)
detectFormat(bytes) → 'pcap' | 'pcapng' | null

CaptureFile = {
  format: 'pcap' | 'pcapng', name, size,
  interfaces: [{ name, description, linktype, snaplen, tsresol /* digits after the point, 6 or 9 */, os?, filter? }],
  frames: Frame[],
  section: { comment?, hardware?, os?, application? },
}
Frame = {
  no,            // 1-based
  sec, nsec,     // absolute time (integers; nsec 0..999999999)
  caplen, len,   // captured / original length
  data,          // Uint8Array (caplen bytes)
  linktype,      // LINKTYPE_* number (1 Ethernet, 0 NULL, 101 RAW, 113 SLL, 276 SLL2, 228 IPv4, 229 IPv6, 105 802.11, 127 radiotap, 108 LOOP)
  iface,         // index into interfaces
  comment,       // string | null  (pcapng opt_comment; editable)
  flags?,        // pcapng epb_flags (direction)
}
```

Additions (implementation notes, all optional fields):

- `readCaptureAsync(bytes, name?) → Promise<CaptureFile>` also accepts gzip (`.pcapng.gz`) through
  `DecompressionStream`; `readCapture` throws a readable error for gzip. `isGzip(bytes)`.
- CaptureFile also has `truncated` (bool) and `error` (message) — a cut or corrupt file keeps the frames read
  so far — plus `byteOrder`, `version`, `compressed?`, and for pcapng `sections[]`, `names[{addr, names}]`
  (NRB) and `interfaceStats[{iface, ifrecv, ifdrop, ...}]` (ISB). Interfaces may carry `comment`, `os`,
  `filter`, `fcslen`, `tsoffset`, `tsresolRaw` (power-of-two resolution), `section`.
- Frame may carry `section` (pcapng section index, 0 omitted), `dropCount`, `packetId`, `queue`, `hash`.
  Several `opt_comment`s are joined with `\n` and written back as separate options.
- `synth.js` re-exports the low-level builder in `packet.js` (split to avoid an import cycle with the
  payload builders in `capture/build/*.js`) and adds `DemoTraffic` and `demoCapture({ seed, seconds })`.
  `samples.js` also exports `SAMPLE_GROUPS` ([{ id, ko, en }] in display order); `npm run samples` writes
  `samples/<id>.pcapng`.

### Dissection — `src/domain/dissect/`

```js
import { createSession, dissect, FIELDS, PROTOCOLS, fieldInfo } from './dissect/index.js';

session = createSession(file, prefs?)  // per capture file; holds TCP streams, conversations, request/response
                                        // matching, name resolution, "decode as" overrides
// First pass: frames in order, once. Stores per-frame state (TCP analysis flags, stream index,
// response-in / request-in links, reassembly results) so that later calls give identical trees.
summary = session.firstPass(frame)  → Summary          // cheap enough for 100k frames
d = dissect(session, frame, { tree: true }) → Dissection // full tree (selected packet, filters, export)

Summary = { no, protocol, info, src, dst, length, layers: 'eth:ethertype:ip:tcp:http', expert: maxSeverity|null,
            tcpStream?, udpStream?, srcport?, dstport? }

Dissection = {
  tree: Node[],           // top level: 'frame', then 'eth', 'ip', 'tcp', 'http' …
  columns: { protocol, info, src, dst, hwSrc, hwDst, netSrc, netDst, srcport, dstport },
  fields: Map<abbrev, Node[]>,   // every node with an abbrev, in tree order (includes hidden/generated)
  layers: string[],              // protocol abbrevs in order ('frame' first)
  expert: Expert[],              // { severity: 'chat'|'note'|'warn'|'error', group, message, abbrev, node }
  sources: [{ name, data }],     // data sources for the bytes pane: [0] = the frame, more = reassembled/decrypted
}
Node = {
  abbrev: string | null,  // filter field name ('tcp.srcport'), null for text-only lines
  label: string,          // the line shown in the details pane: 'Source Port: 443'
  value: any,             // typed value (see FT below); protocols: null
  type: FT,
  start, length,          // byte range in sources[source]; length 0 = no bytes
  source: number,         // index into sources (default 0)
  children: Node[] | null,
  generated?: true,       // shown in [brackets] (computed, e.g. [Stream index: 3])
  hidden?: true,          // in fields (filterable), not shown in the tree
  expert?: Expert,
}
FT = 'none' | 'protocol' | 'bool' | 'uint' | 'int' | 'uint64' (BigInt) | 'int64' | 'float' | 'double'
   | 'string' | 'bytes' | 'ether' (string 'aa:bb:..') | 'ipv4' (string) | 'ipv6' (string, compressed)
   | 'abs_time' ({sec,nsec}) | 'rel_time' (seconds float) | 'framenum' | 'guid' | 'oid' | 'char'

FIELDS: Map<abbrev, { abbrev, name, type, protocol, strings?: {value:label}, bitmask?, desc? }>
        // every registered field and protocol (protocols too: abbrev 'tcp', type 'protocol')
PROTOCOLS: [{ abbrev, name /* long */, short /* column */, enabled: true }]
```

Protocol modules register through `core.js` (`registerProtocol({...})`) with dissector tables
(`ethertype`, `ip.proto`, `tcp.port`, `udp.port`, `sctp.ppi`, `linktype`, `ppp.protocol`, `gre.proto`,
`llc.dsap`) and heuristic lists (`tcp`, `udp`), so "Decode As" can re-route a port.

Implementation notes / additions (nothing above changed):

- `session.firstPass()` sees only the frames before it, so forward references are missing from its
  Summary ("(no response found!)" instead of "(reply in 5)", no "[TCP PDU reassembled in 9]").
  `session.summarize(frame)` re-runs a tree-less dissection with the whole file known (Wireshark's columns
  after loading); the packet list should use it for the rows it shows. `dissect()` always has the full view.
- prefs: `{ resolve: { mac, transport, network }, tcp: { analyze, relativeSeq, reassemble, checksum },
  udp: { checksum }, ip: { checksum, reassemble }, decodeAs: [{ table, key | value, proto | null }],
  disabled: [protocol abbrev] }`; a changed prefs object needs a new session. `session.bugs` lists
  dissector exceptions that were not truncation (diagnostics; should stay empty).
- FIELDS entries also have `ftype` (declared width, e.g. 'uint16'), `bits`, `base` ('dec'|'hex'|'dec_hex'|
  'hex_dec'|'oct'|'none'), `shift` (with `bitmask`), `tfs: [trueLabel, falseLabel]` for booleans, `unit`.
  `formatValue(field, value)` / `formatLabel(field, value)` render values like the details pane.
- Node always has `generated`, `hidden` (false) and `expert` (null) so all nodes share one shape.
  Expert items are a node `_ws.expert` "Expert Info (Warning/Sequence): msg" with the expert field
  (e.g. `tcp.analysis.retransmission`) and `_ws.expert.message/severity/group` below it.
- Malformed / short packets add a top-level `_ws.malformed` / `_ws.short` item and append
  "[Malformed Packet]" to Info, but — like Wireshark — are not listed in `layers` / frame.protocols.
- `frame.protocols` and Summary.layers omit 'frame'; `Dissection.layers` starts with 'frame'.
- Registration: `registerProtocol({ abbrev, name, short, fields: [[abbrev, name, 'uint16', opts]], experts:
  [[abbrev, severity, group, message]], tables, heuristics: { tcp|udp: check(ctx, off, end) → bool }
  (pure checks), heurEnabled: { udp: false }, tcpPdu(ctx, off, end) → length | -1 | 0, dissect })`.
  TCP frames/reassembles PDUs with `tcpPdu`; protocols that keep one tree per call store it in
  `ctx.vars['<abbrev>Top']`. `session.setConversationProto(ptype, addr, port, proto, fromFrame)` binds
  ephemeral ports (FTP-DATA, TFTP, RTP/RTCP from SDP). Extra tables used by modules: `llc.cisco_pid`,
  `media_type` (MIME string → protocol), `sctp.port`.
- A UDP/TCP/IP header quoted inside an ICMP error shows the stream index of its conversation
  (`udp.stream` etc., as Wireshark) but sets no Summary stream/ports and no columns.

### Display filters — `src/domain/filter/`

```js
compileFilter(text, { fields: FIELDS }) → { ok: true, test(d: Dissection) → bool, fieldsUsed: string[], text }
                                        | { ok: false, error, at /* char index */ }
checkFilter(text) → 'valid' | 'invalid' | 'deprecated' | 'empty'   // the green/red/yellow bar
suggestFields(prefix, limit) → [{ abbrev, name, type }]            // autocomplete
COLORING_RULES (Wireshark defaults) and matchColor(rules, d) → { name, fg, bg } | null
```
Language: Wireshark display filter syntax — protocols and fields, `== != > < >= <= eq ne gt lt ge le`,
`contains`, `matches` / `~` (regex, case-insensitive with `(?i)`), `&& || ! and or not xor ^^`,
parentheses, membership `in {a b c..d}`, slices `eth.src[0:3]`, `[1-2]`, `[:4]`, layer `ip#2`,
`any` / `all` quantifiers (`!=` is "all not equal"), functions `len() count() lower() upper() string()`,
literals: numbers (dec/hex/oct), strings "…" with escapes, byte strings `aa:bb:cc`, MAC, IPv4/IPv6 with
CIDR `ip.addr == 10.0.0.0/8`, booleans `True/False/1/0`, value strings (`tcp.flags.syn == 1`,
`dns.qry.type == AAAA`), arithmetic `+ - * / %` on numbers, field references `${tcp.port}`.

### Statistics, follow, export — `src/domain/analysis/`

Pure functions over `(session, frames, dissections/summaries)`; each returns plain data that the
UI shows in a popup: captureProperties, protocolHierarchy, conversations(kind), endpoints(kind),
ioGraph(intervalSec, series[{filter, style, calc}]), packetLengths, httpRequests, httpLoadDistribution,
dnsStats, flowGraph, expertInfo, followStream(kind: 'tcp'|'udp'|'tls'|'http', streamIndex) →
{ chunks:[{dir, frame, data}], client, server }, exportText/Csv/Json/Pdml/Psml, exportObjects('http'|'tftp'|...),
resolvedAddresses.

### Live capture — Rust `src-tauri/src/capture.rs`, JS `src/platform/capture.js`

libpcap is loaded at run time (`libloading`): Windows `%SystemRoot%\System32\Npcap\wpcap.dll`
(then `wpcap.dll` on PATH), Linux `libpcap.so.1` / `libpcap.so.0.8` / `libpcap.so`, macOS
`/usr/lib/libpcap.A.dylib`. No SDK is needed at build time; without the library the app runs and
says how to install Npcap/libpcap.

Commands:
- `capture_backend() → { available, library, version, error }`
- `capture_interfaces() → [{ name, description, friendly, addresses: [string], loopback, up, running, wireless, linktype }]`
- `capture_check_filter({ linktype, filter }) → { ok, error }`  (pcap_open_dead + pcap_compile)
- `capture_start({ iface, snaplen, promisc, filter, bufferMb, timeoutMs, monitor }, onPackets: Channel) → { id, linktype, snaplen }`
  packets arrive as raw binary batches (≈ every 100 ms):
  `[u32 count] then per packet [u32 sec][u32 nsec][u32 caplen][u32 len][caplen bytes]` (little endian)
- `capture_stop({ id }) → { recv, drop, ifdrop }`, `capture_stats({ id }) → { recv, drop, ifdrop }`
- event `capture-stopped` `{ id, error? }` when a capture ends on its own (interface gone, error).

Demo traffic — `src/domain/capture/synth.js`:
```js
const demo = new DemoTraffic({ seed = 1, rate = 40 /* packets per second, average */ });
demo.next(nowSec /* float seconds, absolute */) → [{ sec, nsec, caplen, len, data, linktype: 1 }]  // packets since the last call
SAMPLES (src/domain/capture/samples.js): [{ id, group, icon, ko: [title, desc], en: [title, desc], build() → CaptureFile }]
```

The web build has no live capture; it offers the **demo interface** (`synth.js` traffic generator)
which the desktop app offers too (tutorial, tests, no permissions needed).

### Network map — `src/domain/analysis/topology.js` (UI: `src/views/netmap.js`)

Built from the traffic: `buildTopology(frames, summaries, getDissection) → { nodes, links, subnets }`.
Nodes are hosts (MAC + the IPs seen behind it), gateways/routers (one MAC carrying many off-subnet
IPs, or DHCP/ICMP-redirect/router-advertisement evidence), external hosts (outside private ranges,
grouped behind the gateway), broadcast/multicast groups, with role guesses (DNS/DHCP/HTTP server,
client …), names (DNS answers, DHCP host names, NBNS/mDNS, TLS SNI) and packet/byte counts.
Links carry packets, bytes and protocols. Selecting a node or link in the map sets a display filter
(`ip.addr == a` / `eth.addr == m` / `ip.addr == a && ip.addr == b`) so the packet list shows only
the related packets.

### Display filters, colouring, statistics — API notes (filter/analysis agent)

- `src/domain/filter/index.js`: `compileFilter(text, { fields, reference?, unknownFields? })` →
  `{ ok, test(d, refDissection?), fieldsUsed, text, deprecated, empty }` | `{ ok: false, error, code, at, end, args }`
  (compiled filters are cached by text). `checkFilter(text, { fields })` returns the status string as above;
  `validateFilter(text, opts)` gives `{ status, error, code, at, end, deprecated }`. `FILTER_ERRORS` lists the
  error codes (English messages, the UI translates by code). `setDefaultFields(FIELDS)` once lets calls omit
  `{ fields }`. Also `suggestFields(prefix, limit, opts)`, `suggestValues(abbrev, opts)`, `completionContext(text, caret)`,
  `filterForNode(node, { mode: 'selected'|'not'|'and'|'or'|'andNot'|'orNot', current })`,
  `conversationFilter('eth'|'ip'|'ipv6'|'tcp'|'udp'|'sctp', summaryOrDissection)`.
- `${field}` references read the reference packet: `test(d, selectedDissection)` or `{ reference }` at compile time.
- Sets accept Wireshark 4.6 commas and the older space separation (reported as `deprecated`), like `~=`.
- `src/domain/filter/coloring.js`: `COLORING_RULES` (Wireshark 4.6 defaults), `DARK_COLORING_RULES`, `darkColors(rules)`,
  `compileRules(rules, { fields })` (unknown protocols count as absent), `matchColor(compiled, d)`,
  `parseColorfilters(text)` → `{ rules, errors }`, `formatColorfilters(rules)`.
- `src/domain/analysis/stats.js`: every statistic is `(frames, summaries, getDissection, opts)`; return shapes are
  documented at the top of the file. Taps and the protocol hierarchy walk the top-level protocol items of the tree
  (`protocolChain(d)`), stopping after `icmp`/`icmpv6` (a quoted header in an ICMP error is not a layer), as Wireshark does.
- Witness differences that come from the dissectors are listed with reasons in `test/witness/filters.test.mjs` (`KNOWN`).
