const chatLog = document.getElementById("chatLog");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const modelInput = document.getElementById("modelInput");
const refreshModelsBtn = document.getElementById("refreshModelsBtn");
const chatLauncher = document.getElementById("chatLauncher");
const chatPanel = document.getElementById("chatPanel");

const messages = [
  {
    role: "system",
    content: "You are a helpful assistant for a local demo page.",
  },
];

const ERROR_VISIBLE_MS = 5000;
const ERROR_FADE_MS = 400;

function setModelOptions(models, defaultModel) {
  modelInput.innerHTML = "";
  if (!Array.isArray(models) || models.length === 0) {
    const option = document.createElement("option");
    option.value = defaultModel || "";
    option.textContent = defaultModel || "모델 없음";
    modelInput.appendChild(option);
    modelInput.value = option.value;
    return;
  }

  models.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    modelInput.appendChild(option);
  });

  modelInput.value = models.includes(defaultModel) ? defaultModel : models[0];
}

async function loadModels() {
  const previousValue = modelInput.value;
  modelInput.disabled = true;
  refreshModelsBtn.disabled = true;
  try {
    const res = await fetch("/api/models");
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.detail || data?.error || "모델 목록 조회 실패");
    }
    setModelOptions(data.models, data.defaultModel);
    if (previousValue && data.models.includes(previousValue)) {
      modelInput.value = previousValue;
    }
    clearChatErrors();
  } catch (error) {
    setModelOptions([], "gemma4:26b");
    appendErrorMessage(`모델 목록을 가져오지 못했습니다. 기본 모델로 진행합니다. (${error.message})`);
  } finally {
    modelInput.disabled = false;
    refreshModelsBtn.disabled = false;
  }
}

function appendMessage(role, text) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = text;
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function appendErrorMessage(text) {
  const el = document.createElement("div");
  el.className = "msg system chat-error";
  el.setAttribute("role", "alert");
  el.textContent = text;
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;

  const startFade = setTimeout(() => {
    el.classList.add("chat-error--hiding");
  }, ERROR_VISIBLE_MS);
  const removeEl = setTimeout(() => {
    el.remove();
  }, ERROR_VISIBLE_MS + ERROR_FADE_MS);
  el._errorTimers = [startFade, removeEl];
}

function clearChatErrors() {
  chatLog.querySelectorAll(".chat-error").forEach((el) => {
    if (Array.isArray(el._errorTimers)) {
      el._errorTimers.forEach(clearTimeout);
    }
    el.remove();
  });
}

function appendTypingIndicator() {
  const el = document.createElement("div");
  el.className = "msg assistant typing";
  el.innerHTML = `
    <span class="typing-spinner" aria-hidden="true"></span>
    <span class="typing-label">답변 생성 중</span>
  `;
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
  return el;
}

function toggleChatPanel() {
  const isHidden = chatPanel.classList.toggle("is-hidden");
  chatLauncher.setAttribute("aria-expanded", String(!isHidden));
  if (!isHidden) {
    userInput.focus();
  }
}

async function sendMessage(content) {
  messages.push({ role: "user", content });
  appendMessage("user", content);
  const typingIndicator = appendTypingIndicator();

  sendBtn.disabled = true;
  userInput.disabled = true;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelInput.value.trim(),
        messages,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      const errorText = data?.detail || data?.error || "Unknown error";
      appendErrorMessage(`오류: ${errorText}`);
      return;
    }

    const answer = data.answer || "(응답이 비어 있습니다.)";
    messages.push({ role: "assistant", content: answer });
    clearChatErrors();
    appendMessage("assistant", answer);
  } catch (error) {
    appendErrorMessage(`네트워크 오류: ${error.message}`);
  } finally {
    typingIndicator.remove();
    sendBtn.disabled = false;
    userInput.disabled = false;
    userInput.focus();
  }
}

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const content = userInput.value.trim();
  if (!content) {
    return;
  }
  userInput.value = "";
  sendMessage(content);
});

chatLauncher.addEventListener("click", toggleChatPanel);
refreshModelsBtn.addEventListener("click", loadModels);

loadModels();
appendMessage("assistant", "안녕하세요. 로컬 Ollama 데모 챗봇입니다. 질문을 입력해 보세요.");
