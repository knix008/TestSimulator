// FFmpeg arguments that forward a Matroska stream from stdin to a server — the same choice the desktop app
// makes in src-tauri/src/broadcast.rs stream_args (FLV for RTMP / RTMPS, MPEG-TS for SRT / RIST / UDP, HLS
// for .m3u8; video copied; AAC for FLV when the stream's audio is Opus).
export function streamArgs(url, audioCodec = 'aac') {
  const lower = String(url).toLowerCase();
  let format; let audio;
  if (/^(srt|rist|udp):\/\//.test(lower)) { format = 'mpegts'; audio = ['-c:a', 'copy']; }
  else if (lower.endsWith('.m3u8')) { format = 'hls'; audio = ['-c:a', 'copy']; }
  else if (/^rtmps?:\/\//.test(lower)) { format = 'flv'; audio = audioCodec === 'aac' ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '160k']; }
  else { format = 'flv'; audio = ['-c:a', 'aac', '-b:a', '160k']; }
  return ['-hide_banner', '-loglevel', 'warning', '-fflags', '+genpts+nobuffer', '-f', 'matroska', '-i', 'pipe:0', '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'copy', ...audio, ...(format === 'flv' ? ['-flvflags', 'no_duration_filesize'] : []), '-f', format, url];
}
