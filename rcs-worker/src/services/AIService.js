export class AIService {
  constructor(env) {
    this.env = env;
  }

  async generate(prompt, isPaid = false) {
    const provider = this.env.AI_PROVIDER || (isPaid ? 'anthropic' : 'google');
    if (provider === 'anthropic') return await this.callAnthropic(prompt);
    return await this.callGoogle(prompt);
  }

  async callAnthropic(prompt) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error?.message || 'Anthropic API Error');
    return {
      text: d.content[0].text,
      source: 'anthropic',
      usage: {
        input: d.usage.input_tokens,
        output: d.usage.output_tokens,
        total: d.usage.input_tokens + d.usage.output_tokens
      }
    };
  }

  async callGoogle(prompt) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.env.GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error?.message || 'Google API Error');
    return {
      text: d.candidates[0].content.parts[0].text,
      source: 'google',
      usage: { input: 0, output: 0, total: 0 }
    };
  }
}
