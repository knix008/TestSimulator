#!/usr/bin/env node
/**
 * Out-of-process YouTube resolve via youtubei.js.
 * Electron 26 ships Node 18 which cannot parse youtubei.js `import … with { type: 'json' }`.
 * Web (`npm run web`) uses system Node and may import youtubei in-process; Electron
 * main must spawn this CLI with a modern `node` on PATH.
 *
 * Usage: node youtube-resolve.mjs <youtube-url-or-id>
 * stdout: JSON { ok, videoId, title, duration, author, thumbnailUrl, hasMuxed, picked }
 */
import { Innertube, UniversalCache, ClientType } from 'youtubei.js';
import { URL } from 'url';

function youtubeVideoId(urlOrId) {
  const raw = String(urlOrId || '').trim();
  if (!raw) return null;
  if (/^[\w-]{11}$/.test(raw)) return raw;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (host.includes('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
    const v = u.searchParams.get('v');
    if (v) return v;
    const m = u.pathname.match(/\/(?:embed|shorts|live)\/([^/?#]+)/i);
    return m?.[1] || null;
  } catch {
    return null;
  }
}

function qualityRank(fmt) {
  const label = parseInt(String(fmt.quality_label || fmt.quality || ''), 10);
  if (Number.isFinite(label)) return label;
  return Number(fmt.bitrate) || 0;
}

function pickYoutubeStream(info) {
  const formats = info?.streaming_data?.formats || [];
  const adaptive = info?.streaming_data?.adaptive_formats || [];
  const muxed = formats
    .filter((f) => f?.url && f.has_video && f.has_audio)
    .sort((a, b) => qualityRank(b) - qualityRank(a));
  if (muxed[0]) return { format: muxed[0], kind: 'muxed' };
  const videoOnly = adaptive
    .filter((f) => f?.url && f.has_video && !f.has_audio)
    .sort((a, b) => qualityRank(b) - qualityRank(a));
  if (videoOnly[0]) return { format: videoOnly[0], kind: 'video' };
  const any = [...formats, ...adaptive].find((f) => f?.url);
  return any ? { format: any, kind: 'any' } : null;
}

function fail(msg) {
  process.stdout.write(JSON.stringify({ ok: false, error: msg }));
  process.exit(1);
}

const input = process.argv[2];
const videoId = youtubeVideoId(input);
if (!videoId) fail('Not a valid YouTube URL');

try {
  const yt = await Innertube.create({
    cache: new UniversalCache(false),
    client_type: ClientType.ANDROID,
  });
  const info = await yt.getBasicInfo(videoId, 'ANDROID');
  const basic = info.basic_info || {};
  const picked = pickYoutubeStream(info);
  const thumbs = basic.thumbnail || basic.thumbnails || [];
  const thumbList = Array.isArray(thumbs) ? thumbs : (thumbs ? [thumbs] : []);
  const thumbnailUrl = thumbList.slice(-1)[0]?.url
    || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  let pickedOut = null;
  if (picked?.format) {
    pickedOut = {
      kind: picked.kind,
      format: {
        url: picked.format.url || null,
        mime_type: picked.format.mime_type || null,
        itag: picked.format.itag ?? null,
        quality_label: picked.format.quality_label || picked.format.quality || null,
      },
    };
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    videoId,
    title: basic.title || input,
    duration: Math.round(Number(basic.duration) || 0),
    author: basic.author || basic.channel?.name || '',
    thumbnailUrl,
    hasMuxed: picked?.kind === 'muxed',
    picked: pickedOut,
  }));
} catch (e) {
  fail(e?.message || String(e));
}
