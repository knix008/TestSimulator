// "TLS decryption with a key log": real TLS sessions (build/tls-keylog-data.js, recorded from Node's OpenSSL by
// scripts/make-tls-keylog-data.mjs) replayed as TCP connections to an HTTPS server, with their key log kept in
// the file as a pcapng Decryption Secrets Block — so MyNetManager and Wireshark decrypt them at once.
import { Capture, TcpConversation } from '../packet.js';
import { TLS_KEYLOG, TLS_SESSIONS } from './tls-keylog-data.js';

const CLIENT = { mac: 'a4:83:e7:12:34:56', ip: '192.168.0.23' };
const SERVER = { mac: '00:11:32:5a:0c:21', ip: '192.168.0.10' };

const fromBase64 = (s) => (typeof atob === 'function' ? Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) : new Uint8Array(Buffer.from(s, 'base64')));

function tlsKeylogCapture() {
  const cap = new Capture(1763460000.5, { comment: 'TLS sessions with their key log in a Decryption Secrets Block (TLS 1.3 and 1.2, AES-GCM, ChaCha20-Poly1305, AES-CBC)' });
  TLS_SESSIONS.forEach((session, i) => {
    if (i) cap.wait(0.4);
    const c = new TcpConversation(cap, { ...CLIENT, port: 50100 + i, isn: 0x10000000 + i * 0x01010101 }, { ...SERVER, port: 443, isn: 0x70000000 + i * 0x00f0f0f1 }, { rtt: 0.0012 });
    c.handshake();
    for (const [dir, b64] of session.writes) {
      cap.wait(0.0006);
      c.send(dir, fromBase64(b64));
    }
    cap.wait(0.002);
    c.close('c');
  });
  const file = cap.file('tls-keylog.pcapng');
  file.secrets = [{ type: 'tls', text: TLS_KEYLOG }];
  return file;
}

export const samples = [
  {
    id: 'tls-keylog', group: 'web', icon: 'lock',
    ko: ['TLS 복호화 (키 로그)', '키 로그가 들어 있는 HTTPS: TLS 1.3·1.2, AES-GCM·ChaCha20·AES-CBC로 암호화된 HTTP 요청과 응답이 풀려 보임'],
    en: ['TLS decryption (key log)', 'HTTPS with its key log inside: TLS 1.3 and 1.2 sessions (AES-GCM, ChaCha20, AES-CBC) whose HTTP requests and responses show decrypted'],
    build: tlsKeylogCapture,
  },
];
