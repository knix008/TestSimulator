const STORAGE_PREFIX = 'p2pchat:history:';
const SERVER_ENDPOINT_KEY = 'p2pchat:serverEndpoint';
const NICKNAME_KEY = 'p2pchat:nickname';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'],
  video: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'],
  archive: ['application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed', 'application/x-7z-compressed', 'application/x-tar', 'application/gzip']
};

const $ = (id) => document.getElementById(id);

const lobby = $('lobby');
const chat = $('chat');
const userNicknameInput = $('userNickname');
const serverHostInput = $('serverHost');
const serverPortInput = $('serverPort');
const serverTlsInput = $('serverTls');
const btnServerConnect = $('btnServerConnect');
const btnServerDisconnect = $('btnServerDisconnect');
const btnRefreshRooms = $('btnRefreshRooms');
const newRoomNameInput = $('newRoomName');
const newRoomPasswordInput = $('newRoomPassword');
const newRoomMaxPeersInput = $('newRoomMaxPeers');
const btnCreateRoom = $('btnCreateRoom');
const roomTableBody = $('roomTableBody');
const emptyRooms = $('emptyRooms');
const lobbyStatus = $('lobbyStatus');
const roomLabel = $('roomLabel');
const connBadge = $('connBadge');
const btnChangePassword = $('btnChangePassword');
const btnLeaveRoom = $('btnLeaveRoom');
const messagesEl = $('messages');
const composer = $('composer');
const messageInput = $('messageInput');
const fileInput = $('fileInput');
const fileBtn = $('fileBtn');

/** @type {WebSocket | null} */
let ws = null;
/** @type {RTCPeerConnection | null} */
let pc = null;
/** @type {RTCDataChannel | null} */
let dc = null;
let currentRoomId = '';
let currentUseP2P = false;
let currentIsOwner = false;
let currentNickname = '';
let encryptionKey = null;
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
    const displayName = e.nickname || (e.from === 'self' ? '나' : '상대');
    meta.textContent = `${displayName} · ${new Date(e.ts).toLocaleString()}`;
    
    if (e.type === 'file' && e.fileData) {
      const fileDiv = document.createElement('div');
      fileDiv.className = 'file-content';
      
      if (e.fileData.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = e.fileData.data;
        img.alt = e.fileData.name;
        img.className = 'file-image';
        img.onclick = () => window.open(e.fileData.data, '_blank');
        fileDiv.appendChild(img);
      } else if (e.fileData.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = e.fileData.data;
        video.controls = true;
        video.className = 'file-video';
        fileDiv.appendChild(video);
      } else {
        const link = document.createElement('a');
        link.href = e.fileData.data;
        link.download = e.fileData.name;
        link.className = 'file-link';
        link.textContent = `📦 ${e.fileData.name} (${formatFileSize(e.fileData.size)})`;
        fileDiv.appendChild(link);
      }
      
      div.append(meta, fileDiv);
    } else {
      const body = document.createElement('div');
      body.textContent = e.text;
      div.append(meta, body);
    }
    
    messagesEl.appendChild(div);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * 방 ID와 비밀번호로부터 암호화 키 생성
 */
async function deriveEncryptionKey(roomId, password = '') {
  const keyMaterial = password || roomId;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(keyMaterial + ':p2pchat:salt');
  
  const importedKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(roomId),
      iterations: 100000,
      hash: 'SHA-256'
    },
    importedKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  
  return key;
}

/**
 * 텍스트 메시지 암호화
 */
async function encryptMessage(text, key) {
  if (!key || !text) return null;
  
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    
    // IV와 암호화된 데이터를 함께 Base64로 인코딩
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    return btoa(String.fromCharCode(...combined));
  } catch (err) {
    console.error('Encryption error:', err);
    return null;
  }
}

/**
 * 텍스트 메시지 복호화
 */
async function decryptMessage(encryptedText, key) {
  if (!key || !encryptedText) return null;
  
  try {
    const combined = Uint8Array.from(atob(encryptedText), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (err) {
    console.error('Decryption error:', err);
    return '[복호화 실패]';
  }
}

function appendLocalMessage(text, from, fileData = null, nickname = null) {
  const entries = loadHistory(currentRoomId);
  const entry = { 
    id: crypto.randomUUID(), 
    text, 
    ts: Date.now(), 
    from,
    type: fileData ? 'file' : 'text'
  };
  if (fileData) {
    entry.fileData = fileData;
  }
  if (nickname) {
    entry.nickname = nickname;
  }
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
  encryptionKey = null;
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
  serverHostInput.disabled = connected;
  serverPortInput.disabled = connected;
  serverTlsInput.disabled = connected;
  btnServerConnect.disabled = connected;
  btnServerDisconnect.disabled = !connected;
  btnRefreshRooms.disabled = !connected;
  newRoomNameInput.disabled = !connected;
  newRoomPasswordInput.disabled = !connected;
  newRoomMaxPeersInput.disabled = !connected;
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
 * @param {Array<{ id: string, name: string, createdAt: number, peerCount: number, hasPassword?: boolean, maxPeers?: number }>} rooms
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
    title.className = 'room-title';
    title.textContent = r.name;
    if (r.hasPassword) {
      const lockIcon = document.createElement('span');
      lockIcon.className = 'lock-icon';
      lockIcon.textContent = '🔒';
      lockIcon.title = '비밀번호가 설정된 방입니다';
      title.appendChild(lockIcon);
    }
    const idSpan = document.createElement('span');
    idSpan.className = 'room-id';
    idSpan.textContent = r.id;
    tdName.append(title, idSpan);

    const tdPeers = document.createElement('td');
    const maxPeers = r.maxPeers || 2;
    tdPeers.textContent = `${r.peerCount} / ${maxPeers}`;

    const tdAct = document.createElement('td');
    tdAct.className = 'col-actions';
    const joinBtn = document.createElement('button');
    joinBtn.type = 'button';
    joinBtn.textContent = '입장';
    joinBtn.disabled = uiMode !== 'lobby' || r.peerCount >= maxPeers;
    joinBtn.addEventListener('click', () => joinChatRoom(r.id, r.hasPassword));
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
  setConnBadge(currentUseP2P ? '시그널링 / P2P 연결 중…' : '서버 연결됨 🔒', currentUseP2P ? 'warn' : 'ok');
  messageInput.disabled = !currentUseP2P;
  fileInput.disabled = !currentUseP2P;
  messagesEl.innerHTML = '';
  renderMessages(loadHistory(roomId));
}

function showLobbyUi() {
  uiMode = 'lobby';
  lobby.classList.remove('hidden');
  chat.classList.add('hidden');
  currentRoomId = '';
  currentIsOwner = false;
  btnChangePassword.classList.add('hidden');
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
    setConnBadge('P2P 연결됨 🔒', 'ok');
    messageInput.disabled = false;
    fileInput.disabled = false;
  };
  channel.onclose = () => {
    setConnBadge('데이터 채널 종료', 'warn');
    messageInput.disabled = true;
    fileInput.disabled = true;
  };
  channel.onmessage = async (ev) => {
    if (typeof ev.data === 'string') {
      try {
        const parsed = JSON.parse(ev.data);
        if (parsed.encrypted && parsed.type === 'text' && parsed.text) {
          const decrypted = await decryptMessage(parsed.text, encryptionKey);
          if (decrypted) {
            appendLocalMessage(decrypted, 'peer', null, parsed.nickname);
          }
          return;
        }
        if (parsed.type === 'file' && parsed.fileData) {
          appendLocalMessage('', 'peer', parsed.fileData, parsed.nickname);
          return;
        }
        if (parsed.type === 'text' && parsed.text) {
          appendLocalMessage(parsed.text, 'peer', null, parsed.nickname);
          return;
        }
      } catch {
        // 일반 텍스트 메시지 (호환성)
      }
      if (ev.data) appendLocalMessage(ev.data, 'peer');
    }
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
      currentUseP2P = Boolean(data.useP2P);
      currentIsOwner = Boolean(data.isOwner);
      btnChangePassword.classList.toggle('hidden', !currentIsOwner);
      if (currentUseP2P) {
        setLobbyStatus(
          data.isInitiator ? '상대 입장 대기 중…' : '방에 입장했습니다. 시그널링 대기 중…',
        );
      } else {
        setLobbyStatus('방에 입장했습니다. 암호화된 서버 중계 모드로 연결됩니다. 🔒');
        messageInput.disabled = false;
        fileInput.disabled = false;
      }
      break;
    case 'peer-joined':
      if (currentUseP2P) {
        setLobbyStatus('상대가 입장했습니다. P2P 연결을 시작합니다.');
        void createHostConnection();
      }
      break;
    case 'peer-left':
      if (currentUseP2P) {
        setConnBadge('상대 연결 끊김', 'warn');
        messageInput.disabled = true;
        fileInput.disabled = true;
        cleanupPeer();
      }
      break;
    case 'chat-message':
      if (!currentUseP2P) {
        if (data.encrypted && data.text) {
          void (async () => {
            const decrypted = await decryptMessage(data.text, encryptionKey);
            if (decrypted) {
              appendLocalMessage(decrypted, 'peer', null, data.nickname);
            }
          })();
        } else if (data.fileData) {
          appendLocalMessage('', 'peer', data.fileData, data.nickname);
        } else if (data.text) {
          appendLocalMessage(data.text, 'peer', null, data.nickname);
        }
      }
      break;
    case 'owner-transferred':
      currentIsOwner = true;
      btnChangePassword.classList.remove('hidden');
      setLobbyStatus(data.message || '방 개설자 권한이 이전되었습니다.');
      break;
    case 'password-changed':
      alert(data.message || '비밀번호가 변경되었습니다.');
      break;
    case 'room-deleted':
      cleanupPeer();
      if (uiMode === 'chat') {
        showLobbyUi();
        setLobbyStatus('이 방은 서버에서 삭제되었습니다. 로비로 돌아왔습니다.');
      }
      break;
    case 'offer':
      if (currentUseP2P) {
        void onOffer(data.sdp);
      }
      break;
    case 'answer':
      if (currentUseP2P) {
        void onAnswer(data.sdp);
      }
      break;
    case 'ice-candidate':
      if (currentUseP2P) {
        void onIce(data.candidate);
      }
      break;
    case 'error':
      setLobbyStatus(data.message || '오류');
      break;
    default:
      break;
  }
}

function joinChatRoom(roomId, hasPassword) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    setLobbyStatus('먼저 서버에 연결하세요.');
    return;
  }
  if (uiMode !== 'lobby') return;
  
  const nickname = userNicknameInput.value.trim();
  if (!nickname) {
    alert('닉네임을 입력해주세요.');
    userNicknameInput.focus();
    return;
  }
  
  cleanupPeer();
  currentRoomId = roomId;
  currentNickname = nickname;
  saveNickname(nickname);
  
  let password = '';
  if (hasPassword) {
    password = prompt('이 방은 비밀번호가 설정되어 있습니다. 비밀밀호를 입력하세요:');
    if (password === null) {
      currentRoomId = '';
      return;
    }
  }
  
  sendSignal({ type: 'join', roomId, password, nickname });
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

function loadServerEndpoint() {
  try {
    const raw = localStorage.getItem(SERVER_ENDPOINT_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (typeof o.host !== 'string') return null;
    return {
      host: o.host,
      port: typeof o.port === 'string' && o.port ? o.port : '8787',
      tls: Boolean(o.tls),
    };
  } catch {
    return null;
  }
}

function saveServerEndpoint() {
  const payload = {
    host: serverHostInput.value.trim(),
    port: serverPortInput.value.trim() || '8787',
    tls: serverTlsInput.checked,
  };
  localStorage.setItem(SERVER_ENDPOINT_KEY, JSON.stringify(payload));
}

function saveNickname(nickname) {
  localStorage.setItem(NICKNAME_KEY, nickname);
}

function loadNickname() {
  try {
    return localStorage.getItem(NICKNAME_KEY) || '';
  } catch {
    return '';
  }
}

function applyServerEndpointToInputs() {
  const saved = loadServerEndpoint();
  if (saved) {
    serverHostInput.value = saved.host;
    serverPortInput.value = saved.port;
    serverTlsInput.checked = saved.tls;
  } else {
    serverHostInput.value = 'localhost';
    serverPortInput.value = '8787';
    serverTlsInput.checked = false;
  }
  
  const nickname = loadNickname();
  if (nickname) {
    userNicknameInput.value = nickname;
  }
}

function buildSignalingUrl() {
  const hostRaw = serverHostInput.value.trim();
  if (!hostRaw) return '';
  if (/^wss?:\/\//i.test(hostRaw)) {
    return normalizeWsUrl(hostRaw);
  }
  let authority = hostRaw.replace(/^https?:\/\//i, '');
  const slash = authority.indexOf('/');
  if (slash !== -1) {
    authority = authority.slice(0, slash);
  }
  const hasPort = /:\d+$/.test(authority);
  if (hasPort) {
    const scheme = serverTlsInput.checked ? 'wss' : 'ws';
    return normalizeWsUrl(`${scheme}://${authority}`);
  }
  const port = serverPortInput.value.trim() || '8787';
  const scheme = serverTlsInput.checked ? 'wss' : 'ws';
  return normalizeWsUrl(`${scheme}://${authority}:${port}`);
}

function connectToServer() {
  const normalized = buildSignalingUrl();
  if (!normalized) {
    setLobbyStatus('시그널 서버 호스트를 입력하세요.');
    return;
  }
  disconnectServer();
  setLobbyStatus('서버에 연결 중…');
  uiMode = 'lobby';

  ws = new WebSocket(normalized);
  ws.onopen = () => {
    saveServerEndpoint();
    setLobbyControls(true);
    setLobbyStatus(`연결됨: ${normalized}. 방을 만들거나 목록에서 입장하세요.`);
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

applyServerEndpointToInputs();

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
  const password = newRoomPasswordInput.value.trim();
  const maxPeersStr = newRoomMaxPeersInput.value.trim();
  const maxPeers = maxPeersStr ? parseInt(maxPeersStr, 10) : undefined;
  sendSignal({ type: 'create-room', name, password, maxPeers });
  newRoomNameInput.value = '';
  newRoomPasswordInput.value = '';
  newRoomMaxPeersInput.value = '';
});

btnChangePassword.addEventListener('click', () => {
  if (!currentIsOwner) {
    alert('방 개설자만 비밀번호를 변경할 수 있습니다.');
    return;
  }
  const newPassword = prompt('새 비밀번호를 입력하세요 (비워두면 비밀번호 제거):');
  if (newPassword === null) return;
  
  sendSignal({ 
    type: 'change-password', 
    password: newPassword.trim(),
    roomId: currentRoomId 
  });
});

btnLeaveRoom.addEventListener('click', () => {
  leaveChatToLobby();
});

async function sendFile(file) {
  if (!file) return;
  
  // 파일 타입 검증
  const isAllowed = Object.values(ALLOWED_FILE_TYPES).flat().some(type => {
    if (type.includes('*')) {
      return file.type.startsWith(type.replace('*', ''));
    }
    return file.type === type;
  });
  
  if (!isAllowed) {
    alert('이미지, 동영상, 압축 파일만 전송할 수 있습니다.');
    return;
  }
  
  if (file.size > MAX_FILE_SIZE) {
    alert(`파일 크기는 ${MAX_FILE_SIZE / (1024 * 1024)}MB를 초과할 수 없습니다.`);
    return;
  }
  
  try {
    const reader = new FileReader();
    const dataUrl = await new Promise((resolve, reject) => {
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    
    const fileData = {
      name: file.name,
      type: file.type,
      size: file.size,
      data: dataUrl
    };
    
    if (currentUseP2P) {
      if (!dc || dc.readyState !== 'open') {
        alert('P2P 연결이 활성화되지 않았습니다.');
        return;
      }
      dc.send(JSON.stringify({ type: 'file', fileData, nickname: currentNickname }));
    } else {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('서버 연결이 끊어졌습니다.');
        return;
      }
      sendSignal({ type: 'chat-message', fileData, roomId: currentRoomId, nickname: currentNickname });
    }
    
    appendLocalMessage('', 'self', fileData, currentNickname);
  } catch (err) {
    alert('파일 전송 중 오류가 발생했습니다: ' + err.message);
  }
}

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    void sendFile(file);
  }
  fileInput.value = '';
});

composer.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;
  
  if (currentUseP2P) {
    if (!dc || dc.readyState !== 'open') return;
    void (async () => {
      const encrypted = await encryptMessage(text, encryptionKey);
      if (encrypted) {
        dc.send(JSON.stringify({ type: 'text', text: encrypted, nickname: currentNickname, encrypted: true }));
      }
    })();
  } else {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    void (async () => {
      const encrypted = await encryptMessage(text, encryptionKey);
      if (encrypted) {
        sendSignal({ type: 'chat-message', text: encrypted, roomId: currentRoomId, nickname: currentNickname, encrypted: true });
      }
    })();
  }
  
  appendLocalMessage(text, 'self', null, currentNickname);
  messageInput.value = '';
});

window.addEventListener('beforeunload', () => {
  disconnectServer();
});
