const { resolveModel, chatWithOllama } = require("../ollama");

async function handleChat(req, res, { readJsonBody, sendJson }) {
  try {
    const body = await readJsonBody(req);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const model = resolveModel(body.model);

    if (messages.length === 0) {
      sendJson(res, 400, { error: "messages is required." });
      return;
    }

    const result = await chatWithOllama(messages, model);
    sendJson(res, 200, {
      answer: result.answer,
      model: result.model,
      done: result.done,
    });
  } catch (error) {
    if (error.statusCode) {
      sendJson(res, error.statusCode, {
        error: error.message,
        detail: error.detail,
      });
      return;
    }

    sendJson(res, 500, {
      error: "Server error while handling chat.",
      detail: error.message,
    });
  }
}

module.exports = { handleChat };
