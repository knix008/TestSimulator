const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/chat";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "gemma4:26b";
const OLLAMA_BASE_URL = new URL(OLLAMA_URL).origin;

function resolveModel(requestedModel) {
  if (typeof requestedModel === "string" && requestedModel.trim()) {
    return requestedModel.trim();
  }
  return DEFAULT_MODEL;
}

async function chatWithOllama(messages, requestedModel) {
  const model = resolveModel(requestedModel);
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error("Failed to call Ollama.");
    error.statusCode = response.status;
    error.detail = detail;
    throw error;
  }

  const data = await response.json();
  return {
    answer: data?.message?.content || "",
    model: data?.model || model,
    done: data?.done ?? true,
  };
}

async function fetchModelList() {
  const tagsUrl = new URL("/api/tags", OLLAMA_BASE_URL).toString();
  const response = await fetch(tagsUrl, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error("Failed to fetch Ollama models.");
    error.statusCode = response.status;
    error.detail = detail;
    throw error;
  }

  const data = await response.json();
  const models = Array.isArray(data?.models)
    ? data.models
        .map((model) => model?.name)
        .filter((name) => typeof name === "string" && name.trim())
    : [];

  return {
    models,
    defaultModel: models.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : models[0] || DEFAULT_MODEL,
  };
}

module.exports = {
  OLLAMA_URL,
  DEFAULT_MODEL,
  resolveModel,
  chatWithOllama,
  fetchModelList,
};
