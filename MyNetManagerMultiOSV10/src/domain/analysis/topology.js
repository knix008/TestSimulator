// The network map: hosts, routers, external hosts, multicast groups and the links between them,
// found from the traffic itself (Ethernet and IP addresses, ARP, DHCP, DNS answers, TLS SNI, HTTP
// Host, which side answers a TCP SYN). Every node and link carries the display filter that shows
// its packets, so selecting it in the map narrows the packet list.
//
// buildTopology(frames, summaries, getDissection, options) → { nodes, links, subnets, stats }
// layoutTopology(topology, { width, height, mode }) → Map(nodeId → { x, y })

const PRIVATE_V4 = [[10, 8], [172, 12, 16], [192, 168]];

export function ipv4ToInt(ip) {
  const parts = String(ip).split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function isPrivateV4(ip) {
  const n = ipv4ToInt(ip);
  if (n == null) return false;
  const a = n >>> 24;
  const b = (n >>> 16) & 255;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}
void PRIVATE_V4;

export const isMulticastV4 = (ip) => { const n = ipv4ToInt(ip); return n != null && (n >>> 28) === 14; };
export const isBroadcastV4 = (ip) => ip === '255.255.255.255' || /\.255$/.test(String(ip));
export const isUnspecified = (ip) => ip === '0.0.0.0' || ip === '::';
const isV6 = (ip) => String(ip).includes(':');
const isMulticastV6 = (ip) => /^ff/i.test(String(ip));
const isLocalV6 = (ip) => /^(fe8|fe9|fea|feb|fc|fd)/i.test(String(ip));
export const isLocalAddress = (ip) => (isV6(ip) ? isLocalV6(ip) : isPrivateV4(ip));
export const isGroupAddress = (ip) => (isV6(ip) ? isMulticastV6(ip) : isMulticastV4(ip) || isBroadcastV4(ip));
const isGroupMac = (mac) => /^(ff:ff:ff:ff:ff:ff|01:|33:33:)/i.test(String(mac));

/** The /24 (IPv4) or /64 (IPv6) a local address belongs to. */
export function subnetOf(ip) {
  if (isV6(ip)) {
    const lower = String(ip).toLowerCase();
    if (lower.startsWith('fe80')) return 'fe80::/64';
    const groups = expandV6(lower);
    return groups ? `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64` : 'IPv6';
  }
  const parts = String(ip).split('.');
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

function expandV6(ip) {
  const [head, tail = ''] = ip.split('::');
  const a = head ? head.split(':') : [];
  const b = tail ? tail.split(':') : [];
  if (b.some((g) => g.includes('.'))) return null;
  const fill = 8 - a.length - b.length;
  if (fill < 0) return null;
  return [...a, ...Array(fill).fill('0'), ...b].map((g) => g.padStart(4, '0'));
}

const first = (d, name) => d.fields?.get(name)?.[0]?.value ?? null;
const all = (d, name) => (d.fields?.get(name) ?? []).map((node) => node.value);
const str = (value) => (value == null ? null : String(value));

const SERVICE_ROLES = {
  53: 'dns', 67: 'dhcp', 547: 'dhcp', 80: 'web', 8080: 'web', 443: 'web', 8443: 'web', 123: 'ntp', 22: 'ssh', 23: 'telnet', 21: 'ftp',
  25: 'mail', 110: 'mail', 143: 'mail', 587: 'mail', 993: 'mail', 995: 'mail', 1883: 'mqtt', 8883: 'mqtt', 502: 'modbus', 161: 'snmp',
  5060: 'sip', 445: 'file', 139: 'file', 3389: 'rdp', 3306: 'db', 5432: 'db', 1433: 'db', 69: 'file', 389: 'directory', 88: 'directory',
  631: 'printer', 9100: 'printer', 5353: 'mdns', 1900: 'ssdp',
};

/**
 * Builds the map. `getDissection(index)` returns a full dissection (fields map).
 * options: { showExternal = true, showMulticast = false, maxExternal = 40, indices = null (all frames) }
 */
export function buildTopology(frames, summaries, getDissection, options = {}) {
  const { showExternal = true, showMulticast = false, maxExternal = 40, indices = null } = options;
  const hosts = new Map(); // ip → host record
  const macs = new Map(); // mac → { ips:Set, offLink:Set, packets, bytes, names:Set, vendor }
  const pairs = new Map(); // "a|b" → { a, b, packets, bytes, protocols:Map, viaMac }
  const arpPairs = new Map(); // "a|b" → the same, for ARP between two addresses (no IP header to pair them)
  const names = new Map(); // ip → Set(names)
  const dhcpServers = new Set();
  const routerHints = new Set(); // macs seen as routers (ICMPv6 RA, DHCP router option owner)
  let totalPackets = 0;
  let totalBytes = 0;
  let nonIp = 0;

  const host = (ip) => {
    let h = hosts.get(ip);
    if (!h) {
      h = { ip, macs: new Set(), packets: 0, bytes: 0, sent: 0, received: 0, protocols: new Map(), ports: new Map(), roles: new Set(), first: Infinity, last: -Infinity };
      hosts.set(ip, h);
    }
    return h;
  };
  const macRec = (mac) => {
    let m = macs.get(mac);
    if (!m) { m = { mac, ips: new Set(), offLink: new Set(), packets: 0, bytes: 0, vendor: '' }; macs.set(mac, m); }
    return m;
  };
  const addName = (ip, name) => {
    if (!ip || !name) return;
    const clean = String(name).replace(/\.$/, '');
    if (!clean || clean.length > 80) return;
    if (!names.has(ip)) names.set(ip, new Set());
    names.get(ip).add(clean);
  };

  const list = indices ?? frames.map((_, i) => i);
  for (const index of list) {
    const frame = frames[index];
    const summary = summaries[index] ?? {};
    let d;
    try { d = getDissection(index); } catch { continue; }
    if (!d) continue;
    const length = frame.len ?? frame.caplen ?? 0;
    totalPackets += 1;
    totalBytes += length;
    const time = frame.sec + frame.nsec / 1e9;
    const ethSrc = str(first(d, 'eth.src'));
    const ethDst = str(first(d, 'eth.dst'));
    const vendor = str(first(d, 'eth.src.oui_resolved')) ?? '';
    const ipSrc = str(first(d, 'ip.src') ?? first(d, 'ipv6.src'));
    const ipDst = str(first(d, 'ip.dst') ?? first(d, 'ipv6.dst'));
    const proto = summary.protocol || d.columns?.protocol || '';
    if (ethSrc) { const m = macRec(ethSrc); m.packets += 1; m.bytes += length; if (vendor && !m.vendor) m.vendor = vendor; }

    // ARP: the sender's MAC owns the sender's IP (the most reliable on-link evidence).
    const arpMac = str(first(d, 'arp.src.hw_mac'));
    const arpIp = str(first(d, 'arp.src.proto_ipv4'));
    if (arpMac && arpIp && !isUnspecified(arpIp)) {
      macRec(arpMac).ips.add(arpIp);
      const h = host(arpIp);
      h.macs.add(arpMac);
      h.arp = true;
      h.packets += 1; h.bytes += length; h.sent += length;
      h.first = Math.min(h.first, time); h.last = Math.max(h.last, time);
      h.protocols.set(proto, (h.protocols.get(proto) ?? 0) + 1);
      // Who-has / is-at between two addresses is traffic between them: a host seen only in ARP still gets
      // its link (drawn once the other end is a node too — a scanned address nobody answers for is not).
      const target = str(first(d, 'arp.dst.proto_ipv4'));
      if (target && target !== arpIp && !isUnspecified(target)) {
        const key = arpIp < target ? `${arpIp}|${target}` : `${target}|${arpIp}`;
        let pair = arpPairs.get(key);
        if (!pair) { pair = { a: arpIp < target ? arpIp : target, b: arpIp < target ? target : arpIp, packets: 0, bytes: 0, protocols: new Map(), viaMacs: new Set(), arp: true }; arpPairs.set(key, pair); }
        pair.packets += 1;
        pair.bytes += length;
        pair.protocols.set(proto, (pair.protocols.get(proto) ?? 0) + 1);
      }
    }

    // DHCP: the server, the router option, the client's host name and address.
    if (first(d, 'dhcp.type') != null || d.layers?.includes('dhcp')) {
      const op = first(d, 'dhcp.type');
      if (op === 2 && ipSrc && !isUnspecified(ipSrc)) dhcpServers.add(ipSrc);
      const your = str(first(d, 'dhcp.ip.your'));
      const client = str(first(d, 'dhcp.hw.mac_addr'));
      const hostname = str(first(d, 'dhcp.option.hostname'));
      if (your && !isUnspecified(your) && client) { host(your).macs.add(client); macRec(client).ips.add(your); }
      if (hostname && client) for (const ip of macRec(client).ips) addName(ip, hostname);
      for (const router of all(d, 'dhcp.option.router')) if (router) host(String(router)).roles.add('router');
    }
    if (first(d, 'icmpv6.type') === 134 && ethSrc) routerHints.add(ethSrc);

    // DNS answers name the addresses; mDNS / NBNS / LLMNR answers name local hosts.
    if (first(d, 'dns.flags.response')) {
      const query = str(first(d, 'dns.qry.name'));
      for (const a of [...all(d, 'dns.a'), ...all(d, 'dns.aaaa')]) addName(String(a), query);
    }
    const nbName = str(first(d, 'nbns.name'));
    if (nbName && ipSrc && first(d, 'nbns.flags.response')) addName(ipSrc, nbName.replace(/<..>$/, '').trim());
    const sni = str(first(d, 'tls.handshake.extensions_server_name'));
    if (sni && ipDst) addName(ipDst, sni);
    const httpHost = str(first(d, 'http.host'));
    if (httpHost && ipDst && first(d, 'http.request')) addName(ipDst, httpHost.replace(/:\d+$/, ''));

    if (!ipSrc || !ipDst) { nonIp += 1; continue; }
    const srcHost = host(ipSrc);
    const dstHost = host(ipDst);
    srcHost.packets += 1; srcHost.bytes += length; srcHost.sent += length;
    dstHost.packets += 1; dstHost.bytes += length; dstHost.received += length;
    for (const h of [srcHost, dstHost]) { h.first = Math.min(h.first, time); h.last = Math.max(h.last, time); h.protocols.set(proto, (h.protocols.get(proto) ?? 0) + 1); }
    if (ethSrc && !isGroupMac(ethSrc)) {
      const m = macRec(ethSrc);
      if (isLocalAddress(ipSrc)) { m.ips.add(ipSrc); srcHost.macs.add(ethSrc); } else m.offLink.add(ipSrc);
    }
    if (ethDst && !isGroupMac(ethDst)) {
      const m = macRec(ethDst);
      if (isLocalAddress(ipDst)) { m.ips.add(ipDst); dstHost.macs.add(ethDst); } else m.offLink.add(ipDst);
    }

    // Who serves: the side that answers a SYN (SYN+ACK source), or the well-known port side of UDP.
    const syn = first(d, 'tcp.flags.syn');
    const ack = first(d, 'tcp.flags.ack');
    const sport = first(d, 'tcp.srcport') ?? first(d, 'udp.srcport');
    const dport = first(d, 'tcp.dstport') ?? first(d, 'udp.dstport');
    if (syn && ack && sport != null) { srcHost.ports.set(sport, (srcHost.ports.get(sport) ?? 0) + 1); if (SERVICE_ROLES[sport]) srcHost.roles.add(SERVICE_ROLES[sport]); }
    else if (first(d, 'udp.srcport') != null && sport != null && dport != null && SERVICE_ROLES[sport] && !SERVICE_ROLES[dport]) srcHost.roles.add(SERVICE_ROLES[sport]);

    const key = ipSrc < ipDst ? `${ipSrc}|${ipDst}` : `${ipDst}|${ipSrc}`;
    let pair = pairs.get(key);
    if (!pair) { pair = { a: ipSrc < ipDst ? ipSrc : ipDst, b: ipSrc < ipDst ? ipDst : ipSrc, packets: 0, bytes: 0, protocols: new Map(), viaMacs: new Set() }; pairs.set(key, pair); }
    pair.packets += 1;
    pair.bytes += length;
    pair.protocols.set(proto, (pair.protocols.get(proto) ?? 0) + 1);
    // The MAC on the local side of an off-link packet is the gateway.
    if (!isLocalAddress(ipSrc) && ethSrc) pair.viaMacs.add(ethSrc);
    if (!isLocalAddress(ipDst) && ethDst && !isGroupMac(ethDst)) pair.viaMacs.add(ethDst);
  }

  // Routers: MACs that carry two or more off-link addresses, that announced themselves (RA), or that a
  // DHCP router option names.
  const routerMacs = new Map();
  for (const m of macs.values()) {
    const named = [...m.ips].some((ip) => hosts.get(ip)?.roles.has('router'));
    if (m.offLink.size >= 2 || routerHints.has(m.mac) || (named && m.offLink.size >= 1)) routerMacs.set(m.mac, m);
  }
  // A single off-link address behind one MAC still means that MAC routes.
  for (const pair of pairs.values()) for (const mac of pair.viaMacs) if (!routerMacs.has(mac) && macs.get(mac)?.offLink.size) routerMacs.set(mac, macs.get(mac));

  const nodes = [];
  const nodeById = new Map();
  const add = (node) => { nodeById.set(node.id, node); nodes.push(node); return node; };
  const nameOf = (ip) => [...(names.get(ip) ?? [])][0] ?? '';
  const rolesText = (h) => [...h.roles].filter((r) => r !== 'router');
  const v = (ip) => (isV6(ip) ? 'ipv6' : 'ip');

  // Routers first (a router's own LAN addresses belong to the router node, not a host node).
  const routerOfIp = new Map();
  let routerIndex = 0;
  for (const m of routerMacs.values()) {
    routerIndex += 1;
    const lanIps = [...m.ips];
    const node = add({
      id: `router:${m.mac}`, kind: 'router', mac: m.mac, ips: lanIps, vendor: m.vendor, name: lanIps.map(nameOf).find(Boolean) || '',
      label: lanIps[0] ?? m.mac, packets: m.packets, bytes: m.bytes, roles: ['router'], subnet: lanIps[0] ? subnetOf(lanIps[0]) : null,
      external: m.offLink.size, filter: `eth.addr == ${m.mac}`, index: routerIndex,
    });
    for (const ip of lanIps) {
      routerOfIp.set(ip, node);
      const h = hosts.get(ip);
      if (h) { node.packets = Math.max(node.packets, h.packets); for (const r of rolesText(h)) node.roles.push(r); }
    }
  }

  const localHosts = [...hosts.values()].filter((h) => isLocalAddress(h.ip) && !isGroupAddress(h.ip) && !isUnspecified(h.ip) && !routerOfIp.has(h.ip));
  for (const h of localHosts) {
    add({
      id: `host:${h.ip}`, kind: guessKind(h), ip: h.ip, macs: [...h.macs], name: nameOf(h.ip), label: h.ip, packets: h.packets, bytes: h.bytes,
      sent: h.sent, received: h.received, roles: rolesText(h), subnet: subnetOf(h.ip), protocols: topProtocols(h.protocols), first: h.first, last: h.last,
      vendor: [...h.macs].map((mac) => macs.get(mac)?.vendor).find(Boolean) ?? '',
      filter: h.arp ? `${v(h.ip)}.addr == ${h.ip} || arp.src.proto_ipv4 == ${h.ip} || arp.dst.proto_ipv4 == ${h.ip}` : `${v(h.ip)}.addr == ${h.ip}`,
    });
  }

  // External hosts: the busiest ones by bytes; the rest go into one "Internet" node.
  const externals = [...hosts.values()].filter((h) => !isLocalAddress(h.ip) && !isGroupAddress(h.ip) && !isUnspecified(h.ip)).sort((a, b) => b.bytes - a.bytes);
  const shownExternal = showExternal ? externals.slice(0, maxExternal) : [];
  const hiddenExternal = showExternal ? externals.slice(maxExternal) : externals;
  for (const h of shownExternal) {
    add({
      id: `ext:${h.ip}`, kind: 'external', ip: h.ip, name: nameOf(h.ip), label: h.ip, packets: h.packets, bytes: h.bytes, roles: rolesText(h),
      protocols: topProtocols(h.protocols), first: h.first, last: h.last, filter: `${v(h.ip)}.addr == ${h.ip}`,
    });
  }
  let internet = null;
  if (hiddenExternal.length) {
    const sample = hiddenExternal.slice(0, 200).map((h) => h.ip);
    const v4 = sample.filter((ip) => !isV6(ip));
    const v6 = sample.filter(isV6);
    const parts = [v4.length ? `ip.addr in {${v4.join(' ')}}` : '', v6.length ? `ipv6.addr in {${v6.join(' ')}}` : ''].filter(Boolean);
    internet = add({
      id: 'internet', kind: 'internet', label: 'Internet', count: hiddenExternal.length, packets: hiddenExternal.reduce((n, h) => n + h.packets, 0),
      bytes: hiddenExternal.reduce((n, h) => n + h.bytes, 0), roles: [], filter: parts.join(' || ') || null, members: hiddenExternal.map((h) => h.ip),
    });
  }
  if (showMulticast) {
    for (const h of hosts.values()) {
      if (!isGroupAddress(h.ip)) continue;
      add({ id: `group:${h.ip}`, kind: 'multicast', ip: h.ip, name: nameOf(h.ip), label: h.ip, packets: h.packets, bytes: h.bytes, roles: [], filter: `${v(h.ip)}.dst == ${h.ip}` });
    }
  }

  const nodeOfIp = (ip) => routerOfIp.get(ip) ?? nodeById.get(`host:${ip}`) ?? nodeById.get(`ext:${ip}`) ?? nodeById.get(`group:${ip}`) ?? (internet && internet.members.includes(ip) ? internet : null);
  const linkMap = new Map();
  // What each address pair / MAC / address lands on in the drawing: the filter highlight (matchTopology).
  const pairHits = new Map();
  const hitsOf = (pair) => {
    const key = `${pair.a}|${pair.b}`;
    if (!pairHits.has(key)) pairHits.set(key, { nodes: new Set(), links: new Set() });
    return pairHits.get(key);
  };
  const addLink = (from, to, pair, filter) => {
    if (from) hitsOf(pair).nodes.add(from.id);
    if (to) hitsOf(pair).nodes.add(to.id);
    if (!from || !to || from === to) return;
    const key = from.id < to.id ? `${from.id}|${to.id}` : `${to.id}|${from.id}`;
    hitsOf(pair).links.add(key);
    let link = linkMap.get(key);
    if (!link) { link = { id: key, source: from.id, target: to.id, packets: 0, bytes: 0, protocols: new Map(), filters: new Set() }; linkMap.set(key, link); }
    link.packets += pair.packets;
    link.bytes += pair.bytes;
    for (const [p, n] of pair.protocols) link.protocols.set(p, (link.protocols.get(p) ?? 0) + n);
    if (filter) link.filters.add(filter);
  };
  for (const pair of pairs.values()) {
    const a = nodeOfIp(pair.a);
    const b = nodeOfIp(pair.b);
    const aLocal = isLocalAddress(pair.a);
    const bLocal = isLocalAddress(pair.b);
    const both = `${v(pair.a)}.addr == ${pair.a} && ${v(pair.b)}.addr == ${pair.b}`;
    // Off-link traffic goes through the gateway: host — router — external.
    const via = [...pair.viaMacs].map((mac) => nodeById.get(`router:${mac}`)).find(Boolean);
    if (via && aLocal !== bLocal) {
      const local = aLocal ? a : b;
      const remote = aLocal ? b : a;
      const localIp = aLocal ? pair.a : pair.b;
      const remoteIp = aLocal ? pair.b : pair.a;
      addLink(local, via, pair, `${v(localIp)}.addr == ${localIp} && eth.addr == ${via.mac}`);
      if (remote) addLink(via, remote, pair, `${v(remoteIp)}.addr == ${remoteIp}`);
    } else {
      addLink(a, b, pair, both);
    }
  }
  for (const pair of arpPairs.values()) {
    const a = nodeOfIp(pair.a);
    const b = nodeOfIp(pair.b);
    addLink(a, b, pair, `arp.src.proto_ipv4 == ${pair.a} && arp.dst.proto_ipv4 == ${pair.b} || arp.src.proto_ipv4 == ${pair.b} && arp.dst.proto_ipv4 == ${pair.a}`);
  }
  const links = [...linkMap.values()].map((link) => {
    const filters = [...link.filters];
    return { ...link, protocols: topProtocols(link.protocols), filter: filters.length === 1 ? filters[0] : filters.slice(0, 30).map((f) => `(${f})`).join(' || ') };
  });

  // Subnets: the local hosts and routers grouped by /24 or /64.
  const subnetMap = new Map();
  for (const node of nodes) {
    const key = node.subnet ?? (node.kind === 'external' || node.kind === 'internet' ? 'external' : node.kind === 'multicast' ? 'multicast' : null);
    if (!key) continue;
    if (!subnetMap.has(key)) subnetMap.set(key, { id: key, nodes: [] });
    subnetMap.get(key).nodes.push(node.id);
  }
  const subnets = [...subnetMap.values()].map((subnet) => ({
    ...subnet,
    filter: subnet.id === 'external' || subnet.id === 'multicast' ? null : /\//.test(subnet.id) && !subnet.id.includes(':') ? `ip.addr == ${subnet.id}` : null,
  }));

  const macHits = new Map();
  const ipHits = new Map();
  const put = (map, key, id) => { if (!key) return; if (!map.has(key)) map.set(key, new Set()); map.get(key).add(id); };
  for (const node of nodes) {
    put(macHits, node.mac, node.id);
    for (const mac of node.macs ?? []) put(macHits, mac, node.id);
    put(ipHits, node.ip, node.id);
    for (const ip of node.ips ?? []) put(ipHits, ip, node.id);
    for (const ip of node.members ?? []) put(ipHits, ip, node.id);
  }

  return {
    nodes, links, subnets,
    lookup: { pairs: pairHits, macs: macHits, ips: ipHits },
    stats:{ packets: totalPackets, bytes: totalBytes, nonIp, hosts: localHosts.length, routers: routerMacs.size, external: externals.length, hiddenExternal: hiddenExternal.length },
  };
}

/**
 * The nodes and links that the given frames (the packets a display filter kept) touch, so the map can
 * draw them strong and fade the rest. Returns { nodes: Set<id>, links: Set<id>, packets }.
 */
export function matchTopology(topology, indices, getDissection) {
  const nodes = new Set();
  const links = new Set();
  const lookup = topology?.lookup;
  if (!lookup) return { nodes, links, packets: 0 };
  const addAll = (set, ids) => { if (ids) for (const id of ids) set.add(id); };
  let packets = 0;
  for (const index of indices) {
    let d;
    try { d = getDissection(index); } catch { continue; }
    if (!d) continue;
    packets += 1;
    const ipSrc = str(first(d, 'ip.src') ?? first(d, 'ipv6.src'));
    const ipDst = str(first(d, 'ip.dst') ?? first(d, 'ipv6.dst'));
    if (ipSrc && ipDst) {
      const hit = lookup.pairs.get(ipSrc < ipDst ? `${ipSrc}|${ipDst}` : `${ipDst}|${ipSrc}`);
      if (hit) { addAll(nodes, hit.nodes); addAll(links, hit.links); continue; }
    }
    // Pairs the (sampled) map never saw, ARP and other non-IP frames: the ends by address, then by MAC.
    let found = false;
    for (const ip of [ipSrc, ipDst, str(first(d, 'arp.src.proto_ipv4')), str(first(d, 'arp.dst.proto_ipv4'))]) {
      const ids = ip && lookup.ips.get(ip);
      if (ids) { addAll(nodes, ids); found = true; }
    }
    if (found) continue;
    for (const mac of [str(first(d, 'eth.src')), str(first(d, 'eth.dst'))]) addAll(nodes, mac && lookup.macs.get(mac));
  }
  return { nodes, links, packets };
}

function topProtocols(map, limit = 6) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, count]) => ({ name, count }));
}

/** A picture for the host: server, printer, phone, IoT, or plain host. */
function guessKind(h) {
  const roles = h.roles;
  if (roles.has('printer')) return 'printer';
  if (roles.has('mqtt') || roles.has('modbus')) return 'iot';
  if (roles.has('sip')) return 'phone';
  if ([...roles].some((r) => ['dns', 'dhcp', 'web', 'mail', 'file', 'db', 'directory', 'ssh', 'ftp', 'ntp', 'snmp', 'rdp'].includes(r))) return 'server';
  return 'host';
}

// ───────────────────────── layout

const hashOf = (text) => { let h = 2166136261; for (const c of String(text)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

/**
 * Positions for the nodes. mode 'subnet': routers in the middle, each subnet's hosts on an arc around
 * its router, external hosts on an outer ring; 'radial': busiest node in the centre, rings by hop;
 * 'force': a deterministic force-directed layout (seeded from the subnet layout).
 */
export function layoutTopology(topology, { width = 1000, height = 700, mode = 'subnet', iterations = 220 } = {}) {
  const { nodes, links } = topology;
  const positions = new Map();
  if (!nodes.length) return positions;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 60;

  if (mode === 'radial') {
    const degree = new Map(nodes.map((n) => [n.id, 0]));
    for (const l of links) { degree.set(l.source, degree.get(l.source) + 1); degree.set(l.target, degree.get(l.target) + 1); }
    const centre = [...nodes].sort((a, b) => degree.get(b.id) - degree.get(a.id) || b.bytes - a.bytes)[0];
    const hops = new Map([[centre.id, 0]]);
    const queue = [centre.id];
    const adjacent = new Map(nodes.map((n) => [n.id, []]));
    for (const l of links) { adjacent.get(l.source).push(l.target); adjacent.get(l.target).push(l.source); }
    while (queue.length) { const id = queue.shift(); for (const next of adjacent.get(id)) if (!hops.has(next)) { hops.set(next, hops.get(id) + 1); queue.push(next); } }
    const maxHop = Math.max(1, ...hops.values());
    const rings = new Map();
    for (const n of nodes) { const hop = hops.get(n.id) ?? maxHop + 1; if (!rings.has(hop)) rings.set(hop, []); rings.get(hop).push(n); }
    const ringCount = Math.max(...rings.keys());
    for (const [hop, list] of rings) {
      const r = hop === 0 ? 0 : (radius * hop) / Math.max(1, ringCount);
      list.forEach((n, i) => { const angle = (2 * Math.PI * i) / list.length - Math.PI / 2 + hop * 0.35; positions.set(n.id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }); });
    }
    return positions;
  }

  // Subnet layout (also the seed of the force layout).
  const routers = nodes.filter((n) => n.kind === 'router');
  const groups = new Map();
  for (const n of nodes) {
    if (n.kind === 'router') continue;
    const key = n.kind === 'external' || n.kind === 'internet' ? 'external' : n.kind === 'multicast' ? 'multicast' : n.subnet ?? 'other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }
  routers.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, routers.length);
    const r = routers.length > 1 ? radius * 0.18 : 0;
    positions.set(n.id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  });
  const localGroups = [...groups.keys()].filter((k) => k !== 'external' && k !== 'multicast');
  localGroups.forEach((key, gi) => {
    const list = groups.get(key).sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true }));
    const router = routers.find((r) => r.subnet === key);
    const base = (2 * Math.PI * gi) / Math.max(1, localGroups.length) + Math.PI / 2;
    const spread = Math.min(Math.PI * 1.6, (2 * Math.PI) / Math.max(1, localGroups.length) * 0.85);
    const centre = router ? positions.get(router.id) : { x: cx, y: cy };
    const r = radius * (routers.length ? 0.55 : 0.6);
    list.forEach((n, i) => {
      const t = list.length === 1 ? 0 : i / (list.length - 1) - 0.5;
      const ring = r * (1 + 0.12 * (i % 2));
      const angle = base + t * spread;
      positions.set(n.id, { x: centre.x + ring * Math.cos(angle), y: centre.y + ring * Math.sin(angle) });
    });
  });
  for (const key of ['external', 'multicast']) {
    const list = groups.get(key) ?? [];
    list.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / Math.max(1, list.length) - Math.PI / 2 + (key === 'multicast' ? 0.2 : 0);
      const r = radius * (key === 'external' ? 1 : 0.85);
      positions.set(n.id, { x: cx + r * Math.cos(angle), y: cy + r * 0.92 * Math.sin(angle) });
    });
  }
  if (mode !== 'force') return positions;

  // Force-directed refinement: springs on links, repulsion between nodes, a pull to the centre.
  const ids = nodes.map((n) => n.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const xs = ids.map((id) => positions.get(id).x + ((hashOf(id) % 7) - 3));
  const ys = ids.map((id) => positions.get(id).y + ((hashOf(`${id}y`) % 7) - 3));
  const edges = links.map((l) => [index.get(l.source), index.get(l.target)]).filter(([a, b]) => a != null && b != null);
  const ideal = Math.max(60, Math.sqrt((width * height) / Math.max(1, nodes.length)) * 0.75);
  let temperature = ideal;
  for (let step = 0; step < iterations; step += 1) {
    const dx = new Float64Array(ids.length);
    const dy = new Float64Array(ids.length);
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        let x = xs[i] - xs[j];
        let y = ys[i] - ys[j];
        let dist = Math.hypot(x, y);
        if (dist < 0.01) { x = 0.01 * ((i % 3) - 1 || 1); y = 0.01; dist = 0.015; }
        const force = (ideal * ideal) / dist;
        dx[i] += (x / dist) * force; dy[i] += (y / dist) * force;
        dx[j] -= (x / dist) * force; dy[j] -= (y / dist) * force;
      }
    }
    for (const [a, b] of edges) {
      const x = xs[a] - xs[b];
      const y = ys[a] - ys[b];
      const dist = Math.max(0.01, Math.hypot(x, y));
      const force = (dist * dist) / ideal;
      dx[a] -= (x / dist) * force; dy[a] -= (y / dist) * force;
      dx[b] += (x / dist) * force; dy[b] += (y / dist) * force;
    }
    for (let i = 0; i < ids.length; i += 1) {
      dx[i] += (cx - xs[i]) * 0.02;
      dy[i] += (cy - ys[i]) * 0.02;
      const len = Math.max(0.01, Math.hypot(dx[i], dy[i]));
      xs[i] += (dx[i] / len) * Math.min(len, temperature);
      ys[i] += (dy[i] / len) * Math.min(len, temperature);
      xs[i] = Math.min(width - 40, Math.max(40, xs[i]));
      ys[i] = Math.min(height - 40, Math.max(40, ys[i]));
    }
    temperature *= 0.975;
  }
  ids.forEach((id, i) => positions.set(id, { x: xs[i], y: ys[i] }));
  return positions;
}
