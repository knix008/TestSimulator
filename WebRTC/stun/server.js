import { createServer } from 'stun';

// STUN 서버 포트 (기본: 3478)
const PORT = process.env.STUN_PORT || 3478;
const HOST = process.env.STUN_HOST || '0.0.0.0';

// STUN 서버 생성
const server = createServer();

// 바인딩 이벤트
server.on('bindingRequest', (req, res) => {
  console.log(`[STUN] Binding Request from ${req.address}:${req.port}`);
});

// 에러 핸들링
server.on('error', (err) => {
  console.error('[STUN] Server error:', err);
});

// 서버 시작
server.listen(PORT, HOST, () => {
  console.log('═══════════════════════════════════════');
  console.log('   STUN Server Started');
  console.log('═══════════════════════════════════════');
  console.log(`Host: ${HOST}`);
  console.log(`Port: ${PORT}`);
  console.log(`Protocol: UDP`);
  console.log('═══════════════════════════════════════');
  console.log('Server is ready to accept STUN requests');
  console.log('Press Ctrl+C to stop\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[STUN] Shutting down server...');
  server.close(() => {
    console.log('[STUN] Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n[STUN] Shutting down server...');
  server.close(() => {
    console.log('[STUN] Server closed');
    process.exit(0);
  });
});
