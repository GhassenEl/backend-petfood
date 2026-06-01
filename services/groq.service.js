const VET_SYSTEM_PROMPT = `Tu es un assistant clinique vétérinaire pour PetfoodTN.
Tu aides les vétérinaires à structurer leurs analyses, poser des hypothèses diagnostiques et suggérer des pistes de traitement.
Règles importantes :
- Réponds en français, de manière concise et professionnelle.
- Ne remplace jamais le jugement clinique du vétérinaire.
- Rappelle que seul un examen physique complet permet de confirmer un diagnostic.
- Ne prescris pas de médicaments sans mentionner les contre-indications possibles.
- En cas d'urgence, recommande une consultation immédiate en clinique.`;

const SAFE_FALLBACK =
  "Je ne peux pas répondre pour le moment. Veuillez vous appuyer sur votre expertise clinique et réessayer plus tard.";

const isRetryableGroqError = (err) => {
  const status = err?.status;
  return status === 429 || status === 503 || status === 502;
};

const callGroq = async (model, messages, options = {}) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.4,
      max_tokens: options.max_tokens ?? 1024,
    }),
  });

  if (!response.ok) {
    const err = new Error(`Groq API error: ${response.status}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || SAFE_FALLBACK;
};

const chatWithGroq = async (userMessage, context = {}) => {
  const primary = process.env.GROQ_PRIMARY_MODEL || 'llama-3.3-70b-versatile';
  const fallback = process.env.GROQ_FALLBACK_MODEL || 'qwen/qwen3-32b';

  const contextBlock = context?.appointmentId || context?.petName
    ? `\n\nContexte consultation :\n${JSON.stringify(context, null, 2)}`
    : '';

  const messages = [
    { role: 'system', content: VET_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${userMessage}${contextBlock}`,
    },
  ];

  try {
    return await callGroq(primary, messages);
  } catch (primaryErr) {
    if (!isRetryableGroqError(primaryErr)) {
      console.error('Groq primary model failed:', primaryErr.message);
      return SAFE_FALLBACK;
    }
    console.warn('Groq primary rate-limited, trying fallback model...');
    try {
      return await callGroq(fallback, messages);
    } catch (fallbackErr) {
      console.error('Groq fallback model failed:', fallbackErr.message);
      return SAFE_FALLBACK;
    }
  }
};

const completionWithSystem = async (systemPrompt, userContent, options = {}) => {
  const primary = process.env.GROQ_PRIMARY_MODEL || 'llama-3.3-70b-versatile';
  const fallback = process.env.GROQ_FALLBACK_MODEL || 'qwen/qwen3-32b';
  const temperature = options.temperature ?? 0.35;
  const max_tokens = options.max_tokens ?? 1200;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ];

  try {
    return await callGroq(primary, messages, { temperature, max_tokens });
  } catch (primaryErr) {
    if (!isRetryableGroqError(primaryErr)) {
      console.error('Groq completion failed:', primaryErr.message);
      return null;
    }
    try {
      return await callGroq(fallback, messages, { temperature, max_tokens });
    } catch (fallbackErr) {
      console.error('Groq fallback failed:', fallbackErr.message);
      return null;
    }
  }
};

module.exports = {
  chatWithGroq,
  completionWithSystem,
  VET_SYSTEM_PROMPT,
  SAFE_FALLBACK,
};
