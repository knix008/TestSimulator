import turn from 'node-turn';

// TURN 서버 설정
const PORT = process.env.TURN_PORT || 3478;
const HOST = process.env.TURN_HOST || '0.0.0.0';
const AUTH_SECRET = process.env.TURN_SECRET || 'my-secret-key';
const REALM = process.env.TURN_REALM || 'webrtc-turn-server';

// 사용자 인증 정보 (username:password)
const credentials = {
  username: process.env.TURN_USERNAME || 'webrtc',
  password: process.env.TURN_PASSWORD || 'webrtc123'
};

// TURN 서버 생성
const server = new turn({
  authMech: 'long-term',
  credentials: credentials,
  realm: REALM,
  listeningPort: PORT,
  listeningIps: [HOST],
  relayIps: [HOST],
  minPort: 49152,
  maxPort: 65535,
  debugLevel: 'INFO'
});

// 서버 시작
server.start();

console.log('═══════════════════════════════════════');
console.log('   TURN Server Started');
console.log('═══════════════════════════════════════');
console.log(`Host: ${HOST}`);
console.log(`Port: ${PORT}`);
console.log(`Realm: ${REALM}`);
console.log(`Username: ${credentials.username}`);
console.log(`Password: ${credentials.password}`);
console.log('═══════════════════════════════════════');
console.log('Server is ready to relay WebRTC traffic');
console.log('Press Ctrl+C to stop\n');

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[TURN] Shutting down server...');
  server.stop();
  console.log('[TURN] Server closed');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[TURN] Shutting down server...');
  server.stop();
  console.log('[TURN] Server closed');
  process.exit(0);
});
