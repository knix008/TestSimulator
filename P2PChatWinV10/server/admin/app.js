const tbody = document.getElementById('tbody');
const empty = document.getElementById('empty');
const statsLine = document.getElementById('statsLine');
const createMsg = document.getElementById('createMsg');
const listMsg = document.getElementById('listMsg');
const newName = document.getElementById('newName');
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
    tdName.textContent = r.name;
    const tdId = document.createElement('td');
    tdId.className = 'mono';
    tdId.textContent = r.id;
    const tdPeers = document.createElement('td');
    tdPeers.textContent = `${r.peerCount} / 2`;
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
  const res = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName.value.trim() }),
  });
  if (!res.ok) {
    setMsg(createMsg, `생성 실패 (${res.status})`, true);
    return;
  }
  newName.value = '';
  setMsg(createMsg, '방이 생성되었습니다.');
  await loadRooms();
});

btnRefresh.addEventListener('click', () => void loadRooms());

void loadRooms();
setInterval(() => void loadRooms(), 8000);
