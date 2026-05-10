const STORAGE_PREFIX = 'p2pchat:history:';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const $ = (id) => document.getElementById(id);

const lobby = $('lobby');
const chat = $('chat');
const wsUrlInput = $('wsUrl');
const btnServerConnect = $('btnServerConnect');
const btnServerDisconnect = $('btnServerDisconnect');
const btnRefreshRooms = $('btnRefreshRooms');
const newRoomNameInput = $('newRoomName');
const btnCreateRoom = $('btnCreateRoom');
const roomTableBody = $('roomTableBody');
const emptyRooms = $('emptyRooms');
const lobbyStatus = $('lobbyStatus');
const roomLabel = $('roomLabel');
const connBadge = $('connBadge');
const btnLeaveRoom = $('btnLeaveRoom');
const messagesEl = $('messages');
const composer = $('composer');
const messageInput = $('messageInput');

/** @type {WebSocket | null} */
let ws = null;
/** @type {RTCPeerConnection | null} */
let pc = null;
/** @type {RTCDataChannel | null} */
let dc = null;
let currentRoomId = '';
let makingOffer = false;
/** @type {RTCIceCandidateInit[]} */
let icePending = [];
/** @type {'disconnected' | 'lobby' | 'chat'} */
let uiMode = 'disconnected';

function storageKey(roomId) {
  return `${STORAGE_PREFIX}${roomId}`;
}

function loadHistory(roomId) {
  try {
    const raw = localStorage.getItem(storageKey(roomId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(roomId, entries) {
  localStorage.setItem(storageKey(roomId), JSON.stringify(entries));
}

function setLobbyStatus(text) {
  lobbyStatus.textContent = text;
}

function setConnBadge(text, variant) {
  connBadge.textContent = text;
  connBadge.classList.remove('ok', 'warn');
  if (variant) connBadge.classList.add(variant);
}

function renderMessages(entries) {
  messagesEl.innerHTML = '';
  for (const e of entries) {
    const div = document.createElement('div');
    div.className = `msg ${e.from === 'self' ? 'self' : 'peer'}`;
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = `${e.from === 'self' ? '나' : '상대'} · ${new Date(e.ts).toLocaleString()}`;
    const body = document.createElement('div');
    body.textContent = e.text;
    div.append(meta, body);
    messagesEl.appendChild(div);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendLocalMessage(text, from) {
  const entries = loadHistory(currentRoomId);
  const entry = { id: crypto.randomUUID(), text, ts: Date.now(), from };
  entries.push(entry);
  saveHistory(currentRoomId, entries);
  renderMessages(entries);
}

function cleanupPeer() {
  if (dc) {
    try {
      dc.close();
    } catch {
      /* ignore */
    }
  }
  dc = null;
  if (pc) {
    try {
      pc.close();
    } catch {
      /* ignore */
    }
  }
  pc = null;
  icePending = [];
  makingOffer = false;
}

async function flushIcePending() {
  if (!pc) return;
  const batch = icePending;
  icePending = [];
  for (const c of batch) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(c));
    } catch {
      /* ignore */
    }
  }
}

function setLobbyControls(connected) {
  wsUrlInput.disabled = connected;
  btnServerConnect.disabled = connected;
  btnServerDisconnect.disabled = !connected;
  btnRefreshRooms.disabled = !connected;
  newRoomNameInput.disabled = !connected;
  btnCreateRoom.disabled = !connected;
}

function requestListRooms() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'list-rooms' }));
  }
}

function sendSignal(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function disconnectServer() {
  cleanupPeer();
  if (ws) {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }
  ws = null;
  currentRoomId = '';
  uiMode = 'disconnected';
  setLobbyControls(false);
  roomTableBody.innerHTML = '';
  emptyRooms.classList.remove('hidden');
  lobby.classList.remove('hidden');
  chat.classList.add('hidden');
  setLobbyStatus('');
}

/**
 * @param {Array<{ id: string, name: string, createdAt: number, peerCount: number }>} rooms
 */
function renderRoomList(rooms) {
  roomTableBody.innerHTML = '';
  if (!rooms.length) {
    emptyRooms.classList.remove('hidden');
    return;
  }
  emptyRooms.classList.add('hidden');
  for (const r of rooms) {
    roomDisplayNames.set(r.id, r.name);
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    const title = document.createElement('div');
    title.textContent = r.name;
    const idSpan = document.createElement('span');
    idSpan.className = 'room-id';
    idSpan.textContent = r.id;
    tdName.append(title, idSpan);

    const tdPeers = document.createElement('td');
    tdPeers.textContent = `${r.peerCount} / 2`;

    const tdAct = document.createElement('td');
    tdAct.className = 'col-actions';
    const joinBtn = document.createElement('button');
    joinBtn.type = 'button';
    joinBtn.textContent = '입장';
    joinBtn.disabled = uiMode !== 'lobby' || r.peerCount >= 2;
    joinBtn.addEventListener('click', () => joinChatRoom(r.id));
    tdAct.appendChild(joinBtn);

    tr.append(tdName, tdPeers, tdAct);
    roomTableBody.appendChild(tr);
  }
}

function showChatUi(roomId, displayName) {
  uiMode = 'chat';
  lobby.classList.add('hidden');
  chat.classList.remove('hidden');
  const label = displayName && displayName !== roomId ? `${displayName}` : roomId;
  roomLabel.textContent = `방: ${label}`;
  setConnBadge('시그널링 / P2P 연결 중…', 'warn');
  messageInput.disabled = true;
  messagesEl.innerHTML = '';
  renderMessages(loadHistory(roomId));
}

function showLobbyUi() {
  uiMode = 'lobby';
  lobby.classList.remove('hidden');
  chat.classList.add('hidden');
  currentRoomId = '';
  setConnBadge('연결 중…');
  setLobbyControls(true);
  requestListRooms();
}

async function createHostConnection() {
  cleanupPeer();
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  dc = pc.createDataChannel('chat', { ordered: true });
  wireDataChannel(dc);

  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      sendSignal({ type: 'ice-candidate', candidate: ev.candidate });
    }
  };

  pc.onnegotiationneeded = async () => {
    if (makingOffer) return;
    if (pc.signalingState !== 'stable') return;
    try {
      makingOffer = true;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal({ type: 'offer', sdp: pc.localDescription });
    } catch (err) {
      setLobbyStatus(`WebRTC 오류: ${err?.message || err}`);
    } finally {
      makingOffer = false;
    }
  };
}

function wireDataChannel(channel) {
  channel.onopen = () => {
    setConnBadge('P2P 연결됨', 'ok');
    messageInput.disabled = false;
  };
  channel.onclose = () => {
    setConnBadge('데이터 채널 종료', 'warn');
    messageInput.disabled = true;
  };
  channel.onmessage = (ev) => {
    const text = typeof ev.data === 'string' ? ev.data : '';
    if (text) appendLocalMessage(text, 'peer');
  };
}

async function ensureGuestPc() {
  if (pc) return pc;
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  pc.ondatachannel = (ev) => {
    dc = ev.channel;
    wireDataChannel(dc);
  };
  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      sendSignal({ type: 'ice-candidate', candidate: ev.candidate });
    }
  };
  return pc;
}

async function onOffer(sdp) {
  const peer = await ensureGuestPc();
  await peer.setRemoteDescription(new RTCSessionDescription(sdp));
  await flushIcePending();
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  sendSignal({ type: 'answer', sdp: peer.localDescription });
}

async function onAnswer(sdp) {
  if (!pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  await flushIcePending();
}

async function onIce(candidate) {
  if (!pc) {
    icePending.push(candidate);
    return;
  }
  if (!pc.remoteDescription) {
    icePending.push(candidate);
    return;
  }
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch {
    /* ignore late / invalid candidates */
  }
}

/** @type {Map<string, string>} */
const roomDisplayNames = new Map();

function handleSignalMessage(data) {
  switch (data.type) {
    case 'room-list':
      if (uiMode === 'lobby') {
        renderRoomList(data.rooms || []);
      }
      break;
    case 'room-created':
      if (data.room?.id && data.room?.name) {
        roomDisplayNames.set(data.room.id, data.room.name);
      }
      setLobbyStatus('새 방이 생성되었습니다. 목록에서 입장하세요.');
      break;
    case 'left-room':
      break;
    case 'joined':
      setLobbyStatus(
        data.isInitiator ? '상대 입장 대기 중…' : '방에 입장했습니다. 시그널링 대기 중…',
      );
      break;
    case 'peer-joined':
      setLobbyStatus('상대가 입장했습니다. P2P 연결을 시작합니다.');
      void createHostConnection();
      break;
    case 'peer-left':
      setConnBadge('상대 연결 끊김', 'warn');
      messageInput.disabled = true;
      cleanupPeer();
      break;
    case 'room-deleted':
      cleanupPeer();
      if (uiMode === 'chat') {
        showLobbyUi();
        setLobbyStatus('이 방은 서버에서 삭제되었습니다. 로비로 돌아왔습니다.');
      }
      break;
    case 'offer':
      void onOffer(data.sdp);
      break;
    case 'answer':
      void onAnswer(data.sdp);
      break;
    case 'ice-candidate':
      void onIce(data.candidate);
      break;
    case 'error':
      setLobbyStatus(data.message || '오류');
      break;
    default:
      break;
  }
}

function joinChatRoom(roomId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    setLobbyStatus('먼저 서버에 연결하세요.');
    return;
  }
  if (uiMode !== 'lobby') return;
  cleanupPeer();
  currentRoomId = roomId;
  sendSignal({ type: 'join', roomId });
}

/** @param {string} raw */
function normalizeWsUrl(raw) {
  let u = raw.trim();
  if (!u) return u;
  if (u.startsWith('http://')) u = `ws://${u.slice('http://'.length)}`;
  else if (u.startsWith('https://')) u = `wss://${u.slice('https://'.length)}`;
  else if (!/^wss?:\/\//i.test(u)) u = `ws://${u.replace(/^\/+/, '')}`;
  return u;
}

function connectToServer() {
  const normalized = normalizeWsUrl(wsUrlInput.value);
  if (!normalized) {
    setLobbyStatus('WebSocket 주소를 입력하세요.');
    return;
  }
  wsUrlInput.value = normalized;
  disconnectServer();
  setLobbyStatus('서버에 연결 중…');
  uiMode = 'lobby';

  ws = new WebSocket(normalized);
  ws.onopen = () => {
    setLobbyControls(true);
    setLobbyStatus('연결됨. 방을 만들거나 목록에서 입장하세요.');
    requestListRooms();
  };
  ws.onmessage = (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (data.type === 'joined') {
      const name = roomDisplayNames.get(data.roomId) || data.roomId;
      showChatUi(data.roomId, name);
    }
    handleSignalMessage(data);
  };
  ws.onerror = () => {
    setLobbyStatus('WebSocket 연결에 실패했습니다.');
    setLobbyControls(false);
  };
  ws.onclose = () => {
    const wasChat = uiMode === 'chat';
    ws = null;
    uiMode = 'disconnected';
    cleanupPeer();
    setLobbyControls(false);
    lobby.classList.remove('hidden');
    chat.classList.add('hidden');
    currentRoomId = '';
    if (wasChat) {
      setLobbyStatus('시그널 서버와의 연결이 끊어졌습니다.');
    } else if (lobbyStatus.textContent.includes('연결')) {
      setLobbyStatus('연결이 종료되었습니다.');
    }
    roomTableBody.innerHTML = '';
    emptyRooms.classList.remove('hidden');
  };
}

function leaveChatToLobby() {
  cleanupPeer();
  sendSignal({ type: 'leave-room' });
  showLobbyUi();
  setLobbyStatus('로비입니다. 다른 방에 입장할 수 있습니다.');
}

btnServerConnect.addEventListener('click', () => {
  connectToServer();
});

btnServerDisconnect.addEventListener('click', () => {
  disconnectServer();
});

btnRefreshRooms.addEventListener('click', () => {
  requestListRooms();
  setLobbyStatus('목록을 불러왔습니다.');
});

btnCreateRoom.addEventListener('click', () => {
  const name = newRoomNameInput.value.trim();
  sendSignal({ type: 'create-room', name });
  newRoomNameInput.value = '';
});

btnLeaveRoom.addEventListener('click', () => {
  leaveChatToLobby();
});

composer.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !dc || dc.readyState !== 'open') return;
  dc.send(text);
  appendLocalMessage(text, 'self');
  messageInput.value = '';
});

window.addEventListener('beforeunload', () => {
  disconnectServer();
});
