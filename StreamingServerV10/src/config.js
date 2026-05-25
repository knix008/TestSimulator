const os = require('os');

module.exports = {
  server: {
    port: process.env.PORT || 3000,
    // Set ANNOUNCED_IP env var to your public IP for LAN/internet access
    announcedIp: process.env.ANNOUNCED_IP || '127.0.0.1',
  },

  mediasoup: {
    // One worker per CPU core for maximum throughput
    numWorkers: Math.min(os.cpus().length, 4),

    workerSettings: {
      logLevel: 'warn',
      logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
      rtcMinPort: 40000,
      rtcMaxPort: 49999,
    },

    routerOptions: {
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters: { 'x-google-start-bitrate': 1000 },
        },
        {
          kind: 'video',
          mimeType: 'video/VP9',
          clockRate: 90000,
          parameters: {
            'profile-id': 2,
            'x-google-start-bitrate': 1000,
          },
        },
        {
          kind: 'video',
          mimeType: 'video/h264',
          clockRate: 90000,
          parameters: {
            'packetization-mode': 1,
            'profile-level-id': '4d0032',
            'level-asymmetry-allowed': 1,
            'x-google-start-bitrate': 1000,
          },
        },
        {
          kind: 'video',
          mimeType: 'video/h264',
          clockRate: 90000,
          parameters: {
            'packetization-mode': 1,
            'profile-level-id': '42e01f',
            'level-asymmetry-allowed': 1,
            'x-google-start-bitrate': 1000,
          },
        },
      ],
    },

    webRtcTransportOptions: {
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1_000_000,
      minimumAvailableOutgoingBitrate: 600_000,
      maxSctpMessageSize: 262144,
      maxIncomingBitrate: 1_500_000,
    },
  },
};
