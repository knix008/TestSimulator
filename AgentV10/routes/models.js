const { fetchModelList } = require("../ollama");

async function handleModels(_req, res, { sendJson }) {
  try {
    const modelData = await fetchModelList();
    sendJson(res, 200, {
      models: modelData.models,
      defaultModel: modelData.defaultModel,
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
      error: "Server error while loading models.",
      detail: error.message,
    });
  }
}

module.exports = { handleModels };
