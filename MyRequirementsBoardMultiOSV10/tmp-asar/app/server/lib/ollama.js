const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
const TIMEOUT_MS = 15 * 60 * 1000;

export class OllamaClient {
  constructor(baseUrl = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async isAvailable() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async listModels() {
    const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Ollama 응답 오류: ${res.status}`);
    const payload = await res.json();
    return (payload.models || [])
      .map((m) => m.name)
      .filter(Boolean);
  }

  async resolveModel(preferredModel) {
    const models = await this.listModels();
    if (models.length === 0) {
      throw new Error("설치된 Ollama 모델이 없습니다. 'ollama pull <model>'을 실행하세요.");
    }
    if (preferredModel) {
      const match = models.find((m) => m.toLowerCase() === preferredModel.trim().toLowerCase());
      if (!match) {
        throw new Error(`모델 '${preferredModel}'이 없습니다. 사용 가능: ${models.join(', ')}`);
      }
      return match;
    }
    return models[0];
  }

  async chatJson(model, systemPrompt, userPrompt, maxTokens = 8192) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',
          options: { temperature: 0.1, num_predict: maxTokens },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama 요청 실패: ${res.status} ${text}`);
      }

      const payload = await res.json();
      const content = payload?.message?.content?.trim();
      if (!content) throw new Error('Ollama가 빈 응답을 반환했습니다.');
      return content;
    } finally {
      clearTimeout(timer);
    }
  }

  async refineRequirement(model, requirement, locale = 'ko') {
    const { buildRefineSystemPrompt, buildRefineUserPrompt } = await import('./ollamaPrompts.js');
    const systemPrompt = buildRefineSystemPrompt(locale);
    const userPrompt = buildRefineUserPrompt(requirement, locale);
    const raw = await this.chatJson(model, systemPrompt, userPrompt);
    return parseJsonResponse(raw);
  }
}

export function parseJsonResponse(raw) {
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return JSON.parse(text);
}
