import { io } from 'socket.io-client';
import { Device } from 'mediasoup-client';

const socket = io();
const device = new Device();

let recvTransport = null;
let currentChannelId = null;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const elStatus      = document.getElementById('status');
const elChannelList = document.getElementById('channelList');
const elPlayer      = document.getElementById('player');
const elBtnLeave    = document.getElementById('btnLeave');
const elViewerCount = document.getElementById('viewerCount');

function setStatus(msg, cls = '') {
  elStatus.textContent = msg;
  elStatus.className = cls;
}

// ── Fetch and render channel list ────────────────────────────────────────────
function renderChannels(channels) {
  elChannelList.innerHTML = '';
  if (!channels.length) {
    elChannelList.innerHTML = '<p class="empty">현재 개설된 채널이 없습니다.</p>';
    return;
  }
  channels.forEach((ch) => {
    const card = document.createElement('div');
    card.className = 'channel-card';
    card.dataset.id = ch.id;
    card.innerHTML = `
      <div class="ch-name">${escHtml(ch.name)} ${ch.hasPassword ? '🔒' : ''}</div>
      <div class="ch-desc">${escHtml(ch.description || '')}</div>
      <div class="ch-meta">
        <span class="${ch.isLive ? 'live' : 'offline'}">${ch.isLive ? '● LIVE' : '○ 오프라인'}</span>
        <span>시청자 ${ch.viewerCount}명</span>
      </div>
      <button class="btn-join" data-id="${ch.id}" data-has-pass="${ch.hasPassword}">입장</button>
    `;
    elChannelList.appendChild(card);
  });

  elChannelList.querySelectorAll('.btn-join').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const hasPass = btn.dataset.hasPass === 'true';
      const password = hasPass ? prompt('비밀번호를 입력하세요:') : null;
      if (hasPass && password === null) return; // cancelled
      joinChannel(id, password);
    });
  });
}

async function loadChannels() {
  socket.emit('getChannels', {}, (res) => renderChannels(res.channels));
}

// ── Join a channel as viewer ─────────────────────────────────────────────────
async function joinChannel(channelId, password) {
  if (currentChannelId) await leaveChannel();

  setStatus('연결 중...', '');

  // Load device RTP capabilities first (need them for consume)
  // We'll load inside the callback after getting routerRtpCapabilities
  const rtpCapabilities = device.loaded ? device.rtpCapabilities : null;

  // If device not loaded yet, we need router caps — we'll get them from joinAsConsumer
  socket.emit('joinAsConsumer', {
    channelId,
    password: password || null,
    // Send empty caps first; server responds with transportParams + consumers
    // mediasoup-client needs to load before we can send real caps
    rtpCapabilities: device.loaded ? device.rtpCapabilities : {},
  }, async (res) => {
    if (res.error) {
      setStatus('입장 실패: ' + res.error, 'error');
      return;
    }

    // If device not loaded, we need router caps — rejoin after loading
    if (!device.loaded) {
      // Leave and rejoin with proper caps
      socket.emit('leaveChannel');
      await _loadDevice(channelId);
      _doJoin(channelId, password);
      return;
    }

    currentChannelId = channelId;
    elBtnLeave.disabled = false;

    recvTransport = device.createRecvTransport(res.transportParams);

    recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
      socket.emit('connectConsumerTransport', { dtlsParameters }, (r) => {
        r.error ? errback(r.error) : callback();
      });
    });

    if (res.consumers.length === 0) {
      setStatus('채널에 입장했습니다. 방송을 기다리는 중...', 'waiting');
    } else {
      await _consumeAll(res.consumers);
      setStatus('시청 중', 'live');
    }
  });
}

async function _loadDevice(channelId) {
  // Temporarily join to get router caps, then leave
  return new Promise((resolve) => {
    socket.emit('joinAsConsumer', { channelId, password: null, rtpCapabilities: {} }, async (res) => {
      if (res.routerRtpCapabilities) {
        await device.load({ routerRtpCapabilities: res.routerRtpCapabilities });
      }
      socket.emit('leaveChannel');
      resolve();
    });
  });
}

async function _doJoin(channelId, password) {
  socket.emit('joinAsConsumer', {
    channelId,
    password: password || null,
    rtpCapabilities: device.rtpCapabilities,
  }, async (res) => {
    if (res.error) {
      setStatus('입장 실패: ' + res.error, 'error');
      return;
    }

    currentChannelId = channelId;
    elBtnLeave.disabled = false;

    recvTransport = device.createRecvTransport(res.transportParams);
    recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
      socket.emit('connectConsumerTransport', { dtlsParameters }, (r) => {
        r.error ? errback(r.error) : callback();
      });
    });

    if (res.consumers.length === 0) {
      setStatus('채널에 입장했습니다. 방송을 기다리는 중...', 'waiting');
    } else {
      await _consumeAll(res.consumers);
      setStatus('시청 중', 'live');
    }
  });
}

async function _consumeAll(consumerParams) {
  const stream = new MediaStream();
  for (const params of consumerParams) {
    const consumer = await recvTransport.consume(params);
    stream.addTrack(consumer.track);
    socket.emit('resumeConsumer', { consumerId: consumer.id }, () => {});
  }
  elPlayer.srcObject = stream;
  elViewerCount.textContent = '';
}

// ── New producer arrives while viewing ───────────────────────────────────────
socket.on('newProducer', async ({ producerId, kind }) => {
  if (!currentChannelId || !recvTransport) return;
  socket.emit('consumeNewProducer', { producerId }, async (res) => {
    if (res.error || !res.consumer) return;
    const consumer = await recvTransport.consume(res.consumer);
    const stream = elPlayer.srcObject || new MediaStream();
    stream.addTrack(consumer.track);
    elPlayer.srcObject = stream;
    socket.emit('resumeConsumer', { consumerId: consumer.id }, () => {});
    setStatus('시청 중', 'live');
  });
});

// ── Leave channel ────────────────────────────────────────────────────────────
async function leaveChannel() {
  socket.emit('leaveChannel');
  if (recvTransport) { recvTransport.close(); recvTransport = null; }
  if (elPlayer.srcObject) {
    elPlayer.srcObject.getTracks().forEach((t) => t.stop());
    elPlayer.srcObject = null;
  }
  currentChannelId = null;
  elBtnLeave.disabled = true;
  setStatus('');
}

elBtnLeave.addEventListener('click', leaveChannel);

// ── Socket events ─────────────────────────────────────────────────────────────
socket.on('channelCreated', (ch) => {
  // Re-fetch list to keep it in sync
  loadChannels();
});

socket.on('channelDeleted', ({ channelId }) => {
  if (currentChannelId === channelId) {
    leaveChannel();
    alert('시청 중인 채널이 삭제되었습니다.');
  }
  loadChannels();
});

socket.on('channelUpdated', (partial) => {
  // Update the card in place without full reload
  const card = elChannelList.querySelector(`[data-id="${partial.id}"]`);
  if (!card) return loadChannels();

  if (partial.isLive !== undefined) {
    const badge = card.querySelector('.live, .offline');
    if (badge) {
      badge.textContent = partial.isLive ? '● LIVE' : '○ 오프라인';
      badge.className = partial.isLive ? 'live' : 'offline';
    }
  }
  if (partial.viewerCount !== undefined) {
    const spans = card.querySelectorAll('.ch-meta span');
    if (spans[1]) spans[1].textContent = `시청자 ${partial.viewerCount}명`;
    if (currentChannelId === partial.id) {
      elViewerCount.textContent = `시청자 ${partial.viewerCount}명`;
    }
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
loadChannels();

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
