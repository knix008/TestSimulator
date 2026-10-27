// A small RTSP server for the tests: loops an H.264 Annex-B file as RTP over interleaved
// TCP (RTSP/1.0, RFC 6184 single NAL + FU-A). Enough for ffmpeg-based clients such as the app.
// ffmpeg itself cannot serve RTSP to players (-rtsp_flags listen only accepts pushed streams).

import fs from "node:fs";
import net from "node:net";

const MTU = 1400;

function splitNals(buf) {
  const nals = [];
  let start = -1;
  for (let i = 0; i + 3 < buf.length; i++) {
    const three = buf[i] === 0 && buf[i + 1] === 0 && buf[i + 2] === 1;
    if (!three) continue;
    if (start >= 0) {
      let end = i;
      if (end > start && buf[end - 1] === 0) end--; // 4-byte start code
      nals.push(buf.subarray(start, end));
    }
    start = i + 3;
    i += 2;
  }
  if (start >= 0) nals.push(buf.subarray(start));
  return nals.filter((n) => n.length);
}

/** NAL groups, one per frame (x264 writes one slice per frame). */
function frames(nals) {
  const out = [];
  let pending = [];
  for (const nal of nals) {
    pending.push(nal);
    const type = nal[0] & 0x1f;
    if (type === 1 || type === 5) {
      out.push(pending);
      pending = [];
    }
  }
  return out;
}

export async function startRtspServer(h264File, { fps = 25 } = {}) {
  const nals = splitNals(fs.readFileSync(h264File));
  const sps = nals.find((n) => (n[0] & 0x1f) === 7);
  const pps = nals.find((n) => (n[0] & 0x1f) === 8);
  if (!sps || !pps) throw new Error("H.264 file has no SPS/PPS");
  const list = frames(nals);
  const profileLevel = sps.subarray(1, 4).toString("hex");
  const step = 90000 / fps;

  const server = net.createServer((sock) => {
    let buffer = "";
    let timer = null;
    let channel = 0;
    let seq = Math.floor(Math.random() * 60000);
    let ts = Math.floor(Math.random() * 1e6);
    let index = 0;
    const ssrc = Math.floor(Math.random() * 0xffffffff);
    const session = String(Math.floor(Math.random() * 1e9));

    const rtp = (payload, marker) => {
      const head = Buffer.alloc(12);
      head[0] = 0x80;
      head[1] = (marker ? 0x80 : 0) | 96;
      head.writeUInt16BE(seq & 0xffff, 2);
      head.writeUInt32BE(ts >>> 0, 4);
      head.writeUInt32BE(ssrc >>> 0, 8);
      seq++;
      const packet = Buffer.concat([head, payload]);
      const frame = Buffer.alloc(4);
      frame[0] = 0x24; // '$'
      frame[1] = channel;
      frame.writeUInt16BE(packet.length, 2);
      sock.write(Buffer.concat([frame, packet]));
    };

    const sendNal = (nal, last) => {
      if (nal.length <= MTU) {
        rtp(nal, last);
        return;
      }
      const header = nal[0];
      const fuIndicator = (header & 0xe0) | 28;
      let offset = 1;
      while (offset < nal.length) {
        const chunk = nal.subarray(offset, offset + MTU);
        const first = offset === 1;
        offset += chunk.length;
        const end = offset >= nal.length;
        const fuHeader = (first ? 0x80 : 0) | (end ? 0x40 : 0) | (header & 0x1f);
        rtp(Buffer.concat([Buffer.from([fuIndicator, fuHeader]), chunk]), last && end);
      }
    };

    const tick = () => {
      if (sock.destroyed) return;
      const frame = list[index];
      index = (index + 1) % list.length;
      const isKey = frame.some((n) => (n[0] & 0x1f) === 5);
      const units = isKey && !frame.some((n) => (n[0] & 0x1f) === 7) ? [sps, pps, ...frame] : frame;
      units.forEach((nal, i) => sendNal(nal, i === units.length - 1));
      ts += step;
    };

    const reply = (cseq, lines = [], body = "") => {
      const head = ["RTSP/1.0 200 OK", `CSeq: ${cseq}`, ...lines];
      if (body) head.push("Content-Type: application/sdp", `Content-Length: ${Buffer.byteLength(body)}`);
      sock.write(head.join("\r\n") + "\r\n\r\n" + body);
    };

    sock.on("data", (data) => {
      // Interleaved RTCP from the client ('$' frames) is ignored.
      let text = data.toString("latin1");
      while (text.startsWith("$") && text.length >= 4) {
        const len = (text.charCodeAt(2) << 8) | text.charCodeAt(3);
        text = text.slice(4 + len);
      }
      buffer += text;
      let end;
      while ((end = buffer.indexOf("\r\n\r\n")) >= 0) {
        const req = buffer.slice(0, end);
        buffer = buffer.slice(end + 4);
        const [first, ...headers] = req.split("\r\n");
        const method = first.split(" ")[0];
        const get = (name) => headers.find((h) => h.toLowerCase().startsWith(name + ":"))?.split(":").slice(1).join(":").trim() || "";
        const cseq = get("cseq");
        if (method === "OPTIONS") reply(cseq, ["Public: OPTIONS, DESCRIBE, SETUP, PLAY, TEARDOWN"]);
        else if (method === "DESCRIBE") {
          const url = first.split(" ")[1];
          const sdp = [
            "v=0",
            "o=- 0 0 IN IP4 127.0.0.1",
            "s=MyVideoPlayer test camera",
            "c=IN IP4 0.0.0.0",
            "t=0 0",
            "m=video 0 RTP/AVP 96",
            "a=rtpmap:96 H264/90000",
            `a=fmtp:96 packetization-mode=1;profile-level-id=${profileLevel};sprop-parameter-sets=${sps.toString("base64")},${pps.toString("base64")}`,
            "a=control:trackID=0",
            "",
          ].join("\r\n");
          reply(cseq, [`Content-Base: ${url}/`], sdp);
        } else if (method === "SETUP") {
          const transport = get("transport");
          const m = transport.match(/interleaved=(\d+)/);
          channel = m ? Number(m[1]) : 0;
          reply(cseq, [`Transport: RTP/AVP/TCP;unicast;interleaved=${channel}-${channel + 1}`, `Session: ${session};timeout=60`]);
        } else if (method === "PLAY") {
          reply(cseq, [`Session: ${session}`, "Range: npt=0.000-"]);
          clearInterval(timer);
          timer = setInterval(tick, 1000 / fps);
        } else if (method === "TEARDOWN") {
          reply(cseq, [`Session: ${session}`]);
          clearInterval(timer);
          sock.end();
        } else {
          reply(cseq);
        }
      }
    });
    const stop = () => clearInterval(timer);
    sock.on("close", stop);
    sock.on("error", stop);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const sockets = new Set();
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  return {
    url: `rtsp://127.0.0.1:${server.address().port}/live`,
    stop: () => {
      for (const s of sockets) s.destroy();
      server.close();
    },
  };
}
