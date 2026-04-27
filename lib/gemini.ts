// Gemma fallback chain — try the strongest first, fall back when quota is exhausted.
const MODELS = [
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
  'gemma-3-27b-it',
];

export async function callGemini(apiKey: string, prompt: string): Promise<string> {
  let lastError = '';
  for (const model of MODELS) {
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 0 },
      },
    };
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    const data = await res.json() as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
      error?: { code: number; message: string };
    };
    if (data.error) {
      lastError = `${model}: ${data.error.message}`;
      continue;
    }
    // Gemma/Gemini thinking models return parts: [{thought: true, text: '...reasoning...'}, {text: '...answer...'}]
    // Skip thought parts and take the actual answer.
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const answer = parts.filter((p) => !p.thought).map((p) => p.text ?? '').join('').trim();
    return answer;
  }
  throw new Error(`All models exhausted. ${lastError}`);
}
