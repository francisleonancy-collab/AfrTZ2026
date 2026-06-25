export class AIService {
  constructor(env) {
    this.anthropicKey = env.ANTHROPIC_KEY;
    this.geminiKey = env.GEMINI_KEY;
  }

  async generate(prompt, isPaid = false) {
    let result = null, source = '';

    if (isPaid && this.anthropicKey) {
      try {
        result = await this.callClaude(prompt);
        source = 'claude';
      } catch(e) { console.warn('Claude failed:', e.message); }
    }

    if (!result && this.geminiKey) {
      try {
        result = await this.callGemini(prompt);
        source = 'gemini';
      } catch(e) { console.warn('Gemini failed:', e.message); }
    }

    if (!result) throw new Error('AI generation service unavailable');

    return { ...result, source };
  }

  async callClaude(prompt) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':this.anthropicKey,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:'claude-3-5-haiku-20241022',max_tokens:1000,messages:[{role:'user',content:prompt}]})
    });
    if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.error?.message||'Claude '+res.status); }
    const d = await res.json();
    return {
      text: d.content.map(b=>b.text||'').join('').trim(),
      usage: {
        input: d.usage.input_tokens,
        output: d.usage.output_tokens,
        total: d.usage.input_tokens + d.usage.output_tokens
      }
    };
  }

  async callGemini(prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.geminiKey}`;
    const res = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:1000,temperature:0.7}})});
    if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.error?.message||'Gemini '+res.status); }
    const d = await res.json();
    return {
      text: d.candidates[0].content.parts[0].text.trim(),
      usage: {
        input: d.usageMetadata.promptTokenCount,
        output: d.usageMetadata.candidatesTokenCount,
        total: d.usageMetadata.totalTokenCount
      }
    };
  }
}
