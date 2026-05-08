const wsUrlEl = document.getElementById("wsUrl");
const statusEl = document.getElementById("status");
const roomListEl = document.getElementById("roomList");
const eventsEl = document.getElementById("events");

const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
wsUrlEl.textContent = wsUrl;

function appendEvent(message) {
  const time = new Date().toLocaleTimeString();
  eventsEl.textContent += `[${time}] ${message}\n`;
  eventsEl.scrollTop = eventsEl.scrollHeight;
}

function renderRooms(rooms) {
  roomListEl.innerHTML = "";

  if (!rooms.length) {
    const item = document.createElement("li");
    item.textContent = "활성 룸이 없습니다.";
    roomListEl.appendChild(item);
    return;
  }

  rooms.forEach((room) => {
    const item = document.createElement("li");
    item.textContent = `${room.roomId} - ${room.peerCount}명`;
    roomListEl.appendChild(item);
  });
}

async function loadRooms() {
  try {
    const response = await fetch("/api/rooms");
    const result = await response.json();
    renderRooms(result.rooms || []);
  } catch (_error) {
    appendEvent("룸 정보를 불러오지 못했습니다.");
  }
}

function connectAdminSocket() {
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    statusEl.textContent = "연결됨";
    ws.send(JSON.stringify({ type: "admin-subscribe" }));
    appendEvent("관리자 소켓 연결");
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.type === "admin-snapshot") {
      renderRooms(message.data.rooms || []);
      appendEvent("초기 스냅샷 수신");
      return;
    }

    if (message.type === "admin-event") {
      renderRooms(message.data.rooms || []);
      appendEvent(message.data.message);
    }
  };

  ws.onclose = () => {
    statusEl.textContent = "연결 종료 (3초 후 재연결)";
    appendEvent("관리자 소켓 종료");
    setTimeout(connectAdminSocket, 3000);
  };
}

loadRooms();
connectAdminSocket();
