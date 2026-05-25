const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const config = require('./config');
const mediasoupManager = require('./mediasoupManager');
const channelManager = require('./ChannelManager');
const setupSignaling = require('./signalingServer');

async function main() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../public')));

  // REST: channel list (useful for initial page load without socket)
  app.get('/api/channels', (_req, res) => {
    res.json({ channels: channelManager.getAllChannels() });
  });

  const server = http.createServer(app);

  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    // Allow large SDP messages
    maxHttpBufferSize: 1e6,
  });

  await mediasoupManager.init();
  setupSignaling(io);

  server.listen(config.server.port, () => {
    console.log(`\n========================================`);
    console.log(`  Streaming Server`);
    console.log(`  http://localhost:${config.server.port}`);
    console.log(`  ANNOUNCED_IP: ${config.server.announcedIp}`);
    console.log(`========================================\n`);
  });
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
