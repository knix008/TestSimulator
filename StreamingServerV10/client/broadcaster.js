import { io } from 'socket.io-client';
import { Device } from 'mediasoup-client';

const socket = io();
const device = new Device();

let sendTransport = null;
let producers = [];
let ownerToken = null;
let channelId = null;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const elStatus     = document.getElementById('status');
const elChannelId  = document.getElementById('channelId');
const elChName     = document.getElementById('chName');
const elChDesc     = document.getElementById('chDesc');
const elChPass     = document.getElementById('chPass');
const elBtnCreate  = document.getElementById('btnCreate');
const elBtnStart   = document.getElementById('btnStart');
const elBtnStop    = document.getElementById('btnStop');
const elBtnSetPass = document.getElementById('btnSetPass');
const elBtnDelete  = document.getElementById('btnDelete');
const elNewPass    = document.getElementById('newPass');
const elPreview    = document.getElementById('preview');
const elChannelMgmt = document.getElementById('channelMgmt');
const elBroadcastMgmt = document.getElementById('broadcastMgmt');

function setStatus(msg, cls = '') {
  elStatus.textContent = msg;
  elStatus.className = cls;
}

// ── Channel creation ─────────────────────────────────────────────────────────
elBtnCreate.addEventListener('click', async () => {
  const name = elChName.value.trim();
  if (!name) return alert('채널명을 입력하세요.');

  socket.emit('createChannel', {
    name,
    description: elChDesc.value.trim(),
    password: elChPass.value || null,
  }, (res) => {
    if (res.error) return alert(res.error);
    channelId = res.channel.id;
    ownerToken = res.ownerToken;
    elChannelId.textContent = channelId;
    elChannelMgmt.classList.remove('hidden');
    elBroadcastMgmt.classList.remove('hidden');
    elBtnCreate.disabled = true;
    setStatus('채널 생성됨. 방송을 시작하려면 [방송 시작]을 누르세요.', 'ok');
  });
});

// ── Start broadcasting ───────────────────────────────────────────────────────
elBtnStart.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    elPreview.srcObject = stream;
    elPreview.muted = true;

    socket.emit('joinAsProducer', { channelId, password: elChPass.value || null }, async (res) => {
      if (res.error) return alert(res.error);

      await device.load({ routerRtpCapabilities: res.rtpCapabilities });

      sendTransport = device.createSendTransport(res.transportParams);

      sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        socket.emit('connectProducerTransport', { dtlsParameters }, (r) => {
          r.error ? errback(r.error) : callback();
        });
      });

      sendTransport.on('produce', ({ kind, rtpParameters }, callback, errback) => {
        socket.emit('produce', { kind, rtpParameters }, (r) => {
          r.error ? errback(r.error) : callback({ id: r.producerId });
        });
      });

      // Produce video
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const videoProducer = await sendTransport.produce({ track: videoTrack });
        producers.push(videoProducer);
      }

      // Produce audio
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const audioProducer = await sendTransport.produce({ track: audioTrack });
        producers.push(audioProducer);
      }

      elBtnStart.disabled = true;
      elBtnStop.disabled = false;
      setStatus('방송 중...', 'live');
    });
  } catch (err) {
    alert('카메라/마이크 접근 실패: ' + err.message);
  }
});

// ── Stop broadcasting ────────────────────────────────────────────────────────
elBtnStop.addEventListener('click', () => {
  producers.forEach((p) => p.close());
  producers = [];
  if (sendTransport) { sendTransport.close(); sendTransport = null; }
  if (elPreview.srcObject) {
    elPreview.srcObject.getTracks().forEach((t) => t.stop());
    elPreview.srcObject = null;
  }
  socket.emit('leaveChannel');
  elBtnStart.disabled = false;
  elBtnStop.disabled = true;
  setStatus('방송 중지됨.');
});

// ── Password management ──────────────────────────────────────────────────────
elBtnSetPass.addEventListener('click', () => {
  const password = elNewPass.value || null;
  socket.emit('setChannelPassword', { channelId, ownerToken, password }, (res) => {
    if (res.error) return alert(res.error);
    setStatus(password ? '비밀번호가 변경되었습니다.' : '비밀번호가 제거되었습니다.', 'ok');
    elNewPass.value = '';
  });
});

// ── Delete channel ───────────────────────────────────────────────────────────
elBtnDelete.addEventListener('click', () => {
  if (!confirm('채널을 삭제하시겠습니까?')) return;
  socket.emit('deleteChannel', { channelId, ownerToken }, (res) => {
    if (res.error) return alert(res.error);
    location.href = '/';
  });
});
