const BASE_URL = 'https://api.elevenlabs.io/v1';

export const elevenlabsService = {
  async getVoices(apiKey) {
    const response = await fetch(`${BASE_URL}/voices`, {
      headers: {
        'xi-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail?.message || `ElevenLabs API error: ${response.status}`);
    }

    const data = await response.json();
    return data.voices.map((v) => ({
      voiceId: v.voice_id,
      name: v.name,
      category: v.category,
      labels: v.labels,
      previewUrl: v.preview_url,
    }));
  },

  async generateSoundEffect(apiKey, text, durationSeconds = 4) {
    const response = await fetch(`${BASE_URL}/sound-generation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        duration_seconds: durationSeconds,
        prompt_influence: 0.3,
        output_format: 'mp3_44100_128',
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail?.message || `ElevenLabs SFX error: ${response.status}`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },

  async textToSpeechStream(apiKey, voiceId, text, modelId = 'eleven_multilingual_v2') {
    const response = await fetch(`${BASE_URL}/text-to-speech/${voiceId}/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
        output_format: 'mp3_44100_128',
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail?.message || `ElevenLabs TTS error: ${response.status}`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },
};
