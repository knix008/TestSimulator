const tbody = document.getElementById('tbody');
const empty = document.getElementById('empty');
const lobbyTbody = document.getElementById('lobbyTbody');
const lobbyEmpty = document.getElementById('lobbyEmpty');
const statsLine = document.getElementById('statsLine');
const createMsg = document.getElementById('createMsg');
const listMsg = document.getElementById('listMsg');
const newName = document.getElementById('newName');
const newPassword = document.getElementById('newPassword');
const newMaxPeers = document.getElementById('newMaxPeers');
const btnCreate = document.getElementById('btnCreate');
const btnRefresh = document.getElementById('btnRefresh');

function setMsg(el, text, isErr) {
  el.textContent = text;
  el.classList.toggle('err', Boolean(isErr));
}

async function loadRooms() {
  listMsg.textContent = '';
  const res = await fetch('/api/rooms');
  if (!res.ok) {
    setMsg(listMsg, `목록을 불러오지 못했습니다 (${res.status})`, true);
    return;
  }
  const data = await res.json();
  const list = data.rooms || [];
  statsLine.textContent = `시그널 연결 ${data.signalingConnections ?? '—'}개 · 방 ${list.length}개`;
  tbody.innerHTML = '';
  if (!list.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  for (const r of list) {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    const nameDiv = document.createElement('div');
    nameDiv.style.display = 'flex';
    nameDiv.style.alignItems = 'center';
    nameDiv.style.gap = '0.35rem';
    nameDiv.textContent = r.name;
    if (r.hasPassword) {
      const lockIcon = document.createElement('span');
      lockIcon.textContent = '🔒';
      lockIcon.style.fontSize = '0.8em';
      lockIcon.style.opacity = '0.7';
      lockIcon.title = '비밀번호가 설정된 방';
      nameDiv.appendChild(lockIcon);
    }
    tdName.appendChild(nameDiv);
    const tdId = document.createElement('td');
    tdId.className = 'mono';
    tdId.textContent = r.id;
    const tdPeers = document.createElement('td');
    const maxPeers = r.maxPeers || 2;
    tdPeers.textContent = `${r.peerCount} / ${maxPeers}`;
    const tdTime = document.createElement('td');
    tdTime.textContent = new Date(r.createdAt).toLocaleString();
    const tdAct = document.createElement('td');
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'danger';
    del.textContent = '삭제';
    del.addEventListener('click', () => void deleteRoom(r.id));
    tdAct.appendChild(del);
    tr.append(tdName, tdId, tdPeers, tdTime, tdAct);
    tbody.appendChild(tr);
  }
}

async function loadLobbyClients() {
  const res = await fetch('/api/lobby-clients');
  if (!res.ok) {
    return;
  }
  const data = await res.json();
  const list = data.lobbyClients || [];
  lobbyTbody.innerHTML = '';
  if (!list.length) {
    lobbyEmpty.classList.remove('hidden');
    return;
  }
  lobbyEmpty.classList.add('hidden');
  for (const client of list) {
    const tr = document.createElement('tr');
    const tdNickname = document.createElement('td');
    tdNickname.textContent = client.nickname;
    const tdId = document.createElement('td');
    tdId.className = 'mono';
    tdId.textContent = client.clientId;
    const tdTime = document.createElement('td');
    tdTime.textContent = new Date(client.connectedAt).toLocaleString();
    tr.append(tdNickname, tdId, tdTime);
    lobbyTbody.appendChild(tr);
  }
}

async function deleteRoom(id) {
  if (!confirm('이 방을 삭제할까요? 접속 중인 클라이언트는 연결이 끊깁니다.')) return;
  listMsg.textContent = '';
  const res = await fetch(`/api/rooms/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    setMsg(listMsg, `삭제 실패 (${res.status})`, true);
    return;
  }
  await loadRooms();
}

btnCreate.addEventListener('click', async () => {
  createMsg.textContent = '';
  const maxPeersStr = newMaxPeers.value.trim();
  const maxPeersValue = maxPeersStr ? parseInt(maxPeersStr, 10) : undefined;
  const res = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      name: newName.value.trim(),
      password: newPassword.value.trim(),
      maxPeers: maxPeersValue
    }),
  });
  if (!res.ok) {
    setMsg(createMsg, `생성 실패 (${res.status})`, true);
    return;
  }
  newName.value = '';
  newPassword.value = '';
  newMaxPeers.value = '';
  setMsg(createMsg, '방이 생성되었습니다.');
  await loadRooms();
  await loadLobbyClients();
});

btnRefresh.addEventListener('click', async () => {
  await loadRooms();
  await loadLobbyClients();
});

async function refreshAll() {
  await loadRooms();
  await loadLobbyClients();
}

void refreshAll();
setInterval(() => void refreshAll(), 8000);
