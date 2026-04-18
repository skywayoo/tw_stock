const MODELS = [
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
  'gemini-3.1-flash-lite-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

interface GeminiPart {
  text: string;
}

export async function callGemini(apiKey: string, prompt: string): Promise<string> {
  let lastError = '';
  for (const model of MODELS) {
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
    };
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    const data = await res.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      error?: { code: number; message: string };
    };
    if (data.error) {
      lastError = `${model}: ${data.error.message}`;
      continue;
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  }
  throw new Error(`All models exhausted. ${lastError}`);
}
