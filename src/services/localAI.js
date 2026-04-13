function normalizeEndpoint(endpoint) {
  return String(endpoint || '').replace(/\/+$/, '');
}

function parseAssistantJSON(content) {
  if (content == null) throw new Error('Empty response from local LLM');
  const trimmed = String(content).trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Failed to parse local LLM response as JSON');
    return JSON.parse(jsonMatch[0]);
  }
}

/**
 * @returns {Promise<{ provider: 'ollama'|'lmstudio'|'unknown', models: string[] }>}
 */
export async function detectLocalLLMProvider(endpoint) {
  const base = normalizeEndpoint(endpoint);
  if (!base) return { provider: 'unknown', models: [] };

  try {
    const r = await fetch(`${base}/api/tags`, { method: 'GET' });
    if (r.ok) {
      const data = await r.json().catch(() => ({}));
      const models = (data.models || []).map((m) => m.name || m.model).filter(Boolean);
      return { provider: 'ollama', models };
    }
  } catch {
    /* try LM Studio */
  }

  try {
    const r = await fetch(`${base}/v1/models`, { method: 'GET' });
    if (r.ok) {
      const data = await r.json().catch(() => ({}));
      const models = (data.data || []).map((m) => m.id).filter(Boolean);
      return { provider: 'lmstudio', models };
    }
  } catch {
    /* unknown */
  }

  return { provider: 'unknown', models: [] };
}

export async function isLocalLLMAvailable(endpoint) {
  const { provider } = await detectLocalLLMProvider(endpoint);
  return provider === 'ollama' || provider === 'lmstudio';
}

async function callOllamaChat(base, model, systemPrompt, userPrompt, maxTokens) {
  const response = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
      format: 'json',
      options: { temperature: 0.8, num_predict: maxTokens },
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`Ollama API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  const content = data.message?.content;
  const result = parseAssistantJSON(content);
  const usage = {
    prompt_tokens: data.prompt_eval_count ?? 0,
    completion_tokens: data.eval_count ?? 0,
    model: data.model || model,
  };
  return { result, usage };
}

async function callLMStudioChat(base, model, systemPrompt, userPrompt, maxTokens) {
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.8,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `LM Studio API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const result = parseAssistantJSON(content);
  const usage = {
    prompt_tokens: data.usage?.prompt_tokens ?? 0,
    completion_tokens: data.usage?.completion_tokens ?? 0,
    model: data.model || model,
  };
  return { result, usage };
}

/**
 * @returns {Promise<{ result: object, usage: { prompt_tokens: number, completion_tokens: number, model: string } }>}
 */
export async function callLocalLLM(endpoint, model, systemPrompt, userPrompt, maxTokens = 2000) {
  const base = normalizeEndpoint(endpoint);
  if (!base) throw new Error('Local LLM endpoint is required');

  const { provider } = await detectLocalLLMProvider(base);
  if (provider === 'ollama') {
    return callOllamaChat(base, model, systemPrompt, userPrompt, maxTokens);
  }
  if (provider === 'lmstudio') {
    return callLMStudioChat(base, model, systemPrompt, userPrompt, maxTokens);
  }
  throw new Error('Could not reach Ollama (/api/tags) or LM Studio (/v1/models) at this endpoint');
}

