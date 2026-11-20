// Registers every protocol module and re-exports the public dissection API.
// Import order matters only for table defaults; each module registers itself on import.
import './proto/frame.js';
import './proto/eth.js';
import './proto/arp.js';
import './proto/ip.js';
import './proto/icmp.js';
import './proto/tcp.js';
import './proto/udp.js';
// link layers, tunnels, routing & LAN control protocols
import './proto/icmpv6.js';
import './proto/igmp.js';
import './proto/tunnel.js';
import './proto/l2.js';
import './proto/routing.js';
import './proto/wlan.js';
// name services and UDP applications
import './proto/dns.js';
import './proto/dhcp.js';
import './proto/udpapps.js';
// web and text protocols
import './proto/http.js';
import './proto/http2.js';
import './proto/textproto.js';
import './proto/ssh.js';
// security
import './proto/tls.js';
import './proto/quic.js';
// VoIP, file sharing, industrial / IoT
import './proto/sip.js';
import './proto/rtp.js';
import './proto/smb.js';
import './proto/iot.js';
import './proto/bluetooth.js';

export {
  createSession, dissect, FIELDS, PROTOCOLS, fieldInfo, registerProtocol, formatValue, formatLabel,
  getProtocol, setHeuristicEnabled, TABLES, HEURISTICS, SEVERITY_RANK,
} from './core.js';
export { resolveMac, serviceName, ouiVendor } from './names.js';
