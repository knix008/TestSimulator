const chatLog = document.getElementById("chatLog");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const modelInput = document.getElementById("modelInput");

const messages = [
  {
    role: "system",
    content: "You are a helpful assistant for a local demo page.",
  },
];

function appendMessage(role, text) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = text;
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
}

async function sendMessage(content) {
  messages.push({ role: "user", content });
  appendMessage("user", content);

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
      appendMessage("system", `오류: ${errorText}`);
      return;
    }

    const answer = data.answer || "(응답이 비어 있습니다.)";
    messages.push({ role: "assistant", content: answer });
    appendMessage("assistant", answer);
  } catch (error) {
    appendMessage("system", `네트워크 오류: ${error.message}`);
  } finally {
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

appendMessage("assistant", "안녕하세요. 로컬 Ollama 데모 챗봇입니다. 질문을 입력해 보세요.");
