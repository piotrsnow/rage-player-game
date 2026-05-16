/**
 * OpenAI reasoning-family models (o-series, gpt-5.5+, gpt-5.4-nano) only accept
 * the default temperature (1). Sending 0, 0.8, etc. yields:
 *   "Unsupported value: 'temperature' does not support X with this model."
 *
 * Omit the parameter and the API uses the default.
 */

export function isOpenAiFixedTemperatureModel(model) {
  if (!model || typeof model !== 'string') return false;
  const m = model.toLowerCase();
  if (/^o\d/.test(m)) return true;
  if (m.startsWith('gpt-5.5')) return true;
  if (m.startsWith('gpt-5.4-nano')) return true;
  return false;
}

/** Mutates `body` — adds `temperature` only when the model supports custom values. */
export function applyOpenAiTemperature(body, model, temperature) {
  if (!isOpenAiFixedTemperatureModel(model) && temperature != null) {
    body.temperature = temperature;
  }
  return body;
}
