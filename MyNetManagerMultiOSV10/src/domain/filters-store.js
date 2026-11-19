// Saved display filters (bookmarks, filter buttons) and capture filters, shared by every window
// through localStorage. Wireshark ships similar starter lists.
import { FILTERS_KEY } from './settings.js';

export const DEFAULT_FILTERS = {
  display: [
    { name: 'HTTP', filter: 'http', button: false },
    { name: 'DNS', filter: 'dns', button: false },
    { name: 'TLS handshake', filter: 'tls.handshake', button: false },
    { name: 'TCP problems', filter: 'tcp.analysis.flags && !tcp.analysis.window_update', button: true },
    { name: 'No ARP and DNS', filter: 'not arp and not dns', button: false },
    { name: 'ICMP', filter: 'icmp || icmpv6', button: false },
    { name: 'TCP SYN', filter: 'tcp.flags.syn == 1 && tcp.flags.ack == 0', button: false },
    { name: 'Broadcast', filter: 'eth.dst == ff:ff:ff:ff:ff:ff', button: false },
  ],
  capture: [
    { name: 'IP only', filter: 'ip' },
    { name: 'IPv4 and IPv6', filter: 'ip or ip6' },
    { name: 'No ARP', filter: 'not arp' },
    { name: 'TCP only', filter: 'tcp' },
    { name: 'UDP only', filter: 'udp' },
    { name: 'HTTP TCP port (80)', filter: 'tcp port http' },
    { name: 'HTTPS (443)', filter: 'tcp port 443' },
    { name: 'DNS (53)', filter: 'port 53' },
    { name: 'Non-HTTP and non-SMTP', filter: 'not tcp port 80 and not tcp port 25' },
    { name: 'No broadcast and no multicast', filter: 'not broadcast and not multicast' },
    { name: 'Ethernet address 00:00:5e:00:53:00', filter: 'ether host 00:00:5e:00:53:00' },
  ],
};

const clean = (list, withButton) => (Array.isArray(list) ? list : [])
  .filter((f) => f && typeof f.filter === 'string' && f.filter.trim())
  .map((f) => ({ name: String(f.name ?? f.filter).slice(0, 80), filter: f.filter.trim(), ...(withButton ? { button: f.button === true } : {}) }));

export function loadSavedFilters(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(FILTERS_KEY) ?? 'null');
    if (saved && typeof saved === 'object') return { display: clean(saved.display, true), capture: clean(saved.capture, false) };
  } catch { /* defaults */ }
  return structuredClone(DEFAULT_FILTERS);
}

export function storeSavedFilters(saved, storage = globalThis.localStorage) {
  try {
    storage?.setItem(FILTERS_KEY, JSON.stringify({ display: clean(saved.display, true), capture: clean(saved.capture, false) }));
    return true;
  } catch {
    return false;
  }
}
