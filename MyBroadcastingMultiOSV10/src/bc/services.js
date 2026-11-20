// Streaming services (Settings › Stream). Servers are the ones the services publish; they change now and
// then, so every one can be edited and "Custom…" takes any URL. Protocols: RTMP · RTMPS (through FFmpeg),
// SRT · RIST (FFmpeg, MPEG-TS), WHIP (WebRTC, straight from the app), and "direct": viewers connect to this
// program and watch without any service (bc/engine/viewers.js).

export const SERVICES = [
  { id: 'direct', name: 'Direct viewing', servers: [], codecs: ['avc', 'vp8', 'vp9', 'av1'], direct: true },
  { id: 'twitch', name: 'Twitch', keyUrl: 'https://dashboard.twitch.tv/settings/stream', servers: [['auto', 'rtmp://live.twitch.tv/app'], ['rtmps', 'rtmps://live.twitch.tv:443/app']], maxVideo: 6000, maxAudio: 320, codecs: ['avc'], bandwidthTest: true },
  { id: 'youtube', name: 'YouTube - RTMPS', keyUrl: 'https://studio.youtube.com/channel/UC/livestreaming', servers: [['primary', 'rtmps://a.rtmps.youtube.com:443/live2'], ['backup', 'rtmps://b.rtmps.youtube.com:443/live2?backup=1'], ['rtmp', 'rtmp://a.rtmp.youtube.com/live2']], maxVideo: 51000, maxAudio: 160, codecs: ['avc', 'hevc', 'av1'] },
  { id: 'chzzk', name: 'CHZZK (치지직)', keyUrl: 'https://studio.chzzk.naver.com/', servers: [['default', 'rtmp://global-rtmp.lip2.navercorp.com:8080/relay']], maxVideo: 8000, maxAudio: 192, codecs: ['avc'] },
  { id: 'soop', name: 'SOOP (아프리카TV)', keyUrl: 'https://www.sooplive.co.kr/', servers: [['default', 'rtmp://stream.sooplive.co.kr/app']], maxVideo: 8000, maxAudio: 192, codecs: ['avc'] },
  { id: 'kick', name: 'Kick', keyUrl: 'https://kick.com/dashboard/settings/stream', servers: [['default', 'rtmps://fa723fc1b171.global-contribute.live-video.net/app']], maxVideo: 8000, maxAudio: 160, codecs: ['avc'] },
  { id: 'facebook', name: 'Facebook Live', keyUrl: 'https://www.facebook.com/live/producer', servers: [['default', 'rtmps://live-api-s.facebook.com:443/rtmp']], maxVideo: 6000, maxAudio: 128, codecs: ['avc'] },
  { id: 'x', name: 'X (Twitter)', keyUrl: 'https://studio.x.com/producer', servers: [['default', 'rtmps://va.pscp.tv:443/x']], maxVideo: 9000, maxAudio: 128, codecs: ['avc'] },
  { id: 'tiktok', name: 'TikTok', keyUrl: 'https://www.tiktok.com/live', servers: [['default', 'rtmp://push.tiktok.com/live']], maxVideo: 6000, maxAudio: 128, codecs: ['avc'] },
  { id: 'custom', name: 'Custom…', servers: [], codecs: ['avc', 'hevc', 'av1', 'vp9'] },
  { id: 'whip', name: 'WHIP (WebRTC)', servers: [], codecs: ['avc', 'vp8', 'vp9', 'av1'], whip: true },
];

export const serviceById = (id) => SERVICES.find((s) => s.id === id) ?? SERVICES.find((s) => s.id === 'custom');

/** The protocol of a server URL. */
export function protocolOf(url) {
  const m = /^([a-z]+):\/\//i.exec(String(url || '').trim());
  const p = m?.[1]?.toLowerCase();
  if (!p) return null;
  if (p === 'http' || p === 'https') return 'whip';
  return ['rtmp', 'rtmps', 'srt', 'rist'].includes(p) ? p : null;
}

/** A stream setting checked before going live: list of problems (empty: fine). */
export function checkStream(s) {
  const problems = [];
  const service = serviceById(s.service);
  if (service.direct) return { problems, server: null, protocol: 'direct' };
  const server = s.service === 'custom' || s.service === 'whip' ? s.server : (service.servers.find(([id]) => id === s.serverId)?.[1] ?? service.servers[0]?.[1]);
  const protocol = protocolOf(server);
  if (!server) problems.push('noServer');
  else if (!protocol) problems.push('badServer');
  if (service.id !== 'whip' && protocol !== 'srt' && protocol !== 'rist' && !String(s.key || '').trim()) problems.push('noKey');
  if (service.maxVideo && s.videoBitrate > service.maxVideo) problems.push('bitrateHigh');
  if (service.maxAudio && s.audioBitrate > service.maxAudio) problems.push('audioBitrateHigh');
  return { problems, server, protocol: service.whip ? 'whip' : protocol };
}

/** Recommended video bitrate (kbps) for a size and frame rate (the auto-configuration wizard). */
export function recommendedBitrate(width, height, fps) {
  const pixelsPerSecond = width * height * fps;
  const k = pixelsPerSecond / (1280 * 720 * 30);
  return Math.round(Math.min(9000, Math.max(1500, 2500 * k ** 0.75)) / 100) * 100;
}
