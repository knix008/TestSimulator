const roomIdInput = document.getElementById("roomIdInput");
const signalingUrlInput = document.getElementById("signalingUrlInput");
const joinBtn = document.getElementById("joinBtn");
const startVideoBtn = document.getElementById("startVideoBtn");
const stopVideoBtn = document.getElementById("stopVideoBtn");
const startAudioBtn = document.getElementById("startAudioBtn");
const stopAudioBtn = document.getElementById("stopAudioBtn");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const logEl = document.getElementById("log");

let ws;
let pc;
let roomId = "";
let localStream = new MediaStream();
let remoteStream = new MediaStream();
let isMakingOffer = false;

const senderByKind = {
  video: null,
  audio: null,
};

localVideo.srcObject = localStream;
remoteVideo.srcObject = remoteStream;

function log(message) {
  const time = new Date().toLocaleTimeString();
  logEl.textContent += `[${time}] ${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function send(payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }
  ws.send(JSON.stringify(payload));
}

function sendTrackState(kind, enabled) {
  send({
    type: "track-state",
    data: { kind, enabled },
  });
}

function createPeerConnection() {
  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  pc.onicecandidate = (event) => {
    if (!event.candidate) {
      return;
    }
    send({ type: "signal", data: { candidate: event.candidate } });
  };

  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      const existing = remoteStream.getTracks().find((t) => t.id === track.id);
      if (!existing) {
        remoteStream.addTrack(track);
      }
    });
  };

  pc.onnegotiationneeded = async () => {
    try {
      isMakingOffer = true;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ type: "signal", data: { description: pc.localDescription } });
      log("재협상(offer) 전송");
    } catch (error) {
      log(`offer 생성 실패: ${error.message}`);
    } finally {
      isMakingOffer = false;
    }
  };

  pc.onconnectionstatechange = () => {
    log(`연결 상태: ${pc.connectionState}`);
  };
}

async function ensureVideoTrack() {
  const existing = localStream.getVideoTracks()[0];
  if (existing) {
    return existing;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  const track = stream.getVideoTracks()[0];
  localStream.addTrack(track);
  localVideo.srcObject = localStream;
  return track;
}

async function ensureAudioTrack() {
  const existing = localStream.getAudioTracks()[0];
  if (existing) {
    return existing;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
  const track = stream.getAudioTracks()[0];
  localStream.addTrack(track);
  return track;
}

async function addTrackByKind(kind) {
  if (!pc) {
    log("먼저 방에 입장해 주세요.");
    return;
  }

  const track = kind === "video" ? await ensureVideoTrack() : await ensureAudioTrack();
  if (senderByKind[kind]) {
    senderByKind[kind].replaceTrack(track);
  } else {
    senderByKind[kind] = pc.addTrack(track, localStream);
  }
  sendTrackState(kind, true);
  log(`${kind} 트랙 송신 시작`);
}

function stopTrackByKind(kind) {
  const track = kind === "video" ? localStream.getVideoTracks()[0] : localStream.getAudioTracks()[0];
  if (!track) {
    return;
  }

  track.stop();
  localStream.removeTrack(track);

  if (senderByKind[kind]) {
    senderByKind[kind].replaceTrack(null);
  }

  if (kind === "video") {
    localVideo.srcObject = localStream;
  }

  sendTrackState(kind, false);
  log(`${kind} 트랙 송신 중지`);
}

async function handleSignal(data) {
  if (!pc) {
    createPeerConnection();
  }

  if (data.description) {
    const readyForOffer = !isMakingOffer && (pc.signalingState === "stable" || pc.signalingState === "have-local-offer");
    const offerCollision = data.description.type === "offer" && !readyForOffer;

    if (offerCollision) {
      log("offer collision 감지, 상대 offer 우선 처리");
    }

    try {
      await pc.setRemoteDescription(data.description);
      if (data.description.type === "offer") {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send({ type: "signal", data: { description: pc.localDescription } });
        log("answer 전송");
      }
    } catch (error) {
      log(`SDP 처리 오류: ${error.message}`);
    }
  } else if (data.candidate) {
    try {
      await pc.addIceCandidate(data.candidate);
    } catch (error) {
      log(`ICE 추가 오류: ${error.message}`);
    }
  }
}

function connectSignaling(signalingUrl) {
  ws = new WebSocket(signalingUrl);

  ws.onopen = () => {
    send({ type: "join", roomId });
    log(`시그널링 연결 완료, room: ${roomId}`);
  };

  ws.onmessage = async (event) => {
    const message = JSON.parse(event.data);

    if (message.type === "joined") {
      if (!pc) {
        createPeerConnection();
      }
      log("방 입장 완료");
      return;
    }

    if (message.type === "peer-joined") {
      log("상대가 입장했습니다.");
      return;
    }

    if (message.type === "peer-left") {
      log("상대가 나갔습니다.");
      remoteStream.getTracks().forEach((track) => {
        remoteStream.removeTrack(track);
      });
      return;
    }

    if (message.type === "track-state") {
      log(`상대 ${message.data.kind} ${message.data.enabled ? "시작" : "중지"}`);
      return;
    }

    if (message.type === "signal") {
      await handleSignal(message.data);
    }
  };

  ws.onclose = () => {
    log("시그널링 연결 종료");
  };
}

joinBtn.addEventListener("click", () => {
  roomId = roomIdInput.value.trim();
  const signalingUrl = signalingUrlInput.value.trim();

  if (!roomId) {
    log("Room ID를 입력해 주세요.");
    return;
  }
  if (!signalingUrl) {
    log("Signaling URL을 입력해 주세요.");
    return;
  }

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }

  connectSignaling(signalingUrl);
});

startVideoBtn.addEventListener("click", async () => {
  try {
    await addTrackByKind("video");
  } catch (error) {
    log(`영상 시작 실패: ${error.message}`);
  }
});

stopVideoBtn.addEventListener("click", () => {
  stopTrackByKind("video");
});

startAudioBtn.addEventListener("click", async () => {
  try {
    await addTrackByKind("audio");
  } catch (error) {
    log(`음성 시작 실패: ${error.message}`);
  }
});

stopAudioBtn.addEventListener("click", () => {
  stopTrackByKind("audio");
});
