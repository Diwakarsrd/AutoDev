import axios from 'axios';
import * as vscode from 'vscode';
import { AgentConfig, LLMMessage, LLMResponse, StreamCallback } from '../types';

export class LLMProvider {
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  async complete(messages: LLMMessage[], onStream?: StreamCallback): Promise<LLMResponse> {
    switch (this.config.provider) {
      case 'ollama':            return this.callOllama(messages, onStream);
      case 'gemini':            return this.callGemini(messages, onStream);
      case 'openai-compatible': return this.callOpenAICompatible(messages, onStream);
      case 'anthropic':         return this.callAnthropic(messages, onStream);
      case 'groq':              return this.callGroq(messages, onStream);
      case 'openai':            return this.callOpenAI(messages, onStream);
      default:                  return { content: '', error: `Unknown provider: ${this.config.provider}` };
    }
  }

  // Ollama - local, free, private
  private async callOllama(messages: LLMMessage[], onStream?: StreamCallback): Promise<LLMResponse> {
    const url = `${this.config.ollamaUrl}/api/chat`;
    try {
      if (onStream) {
        const response = await axios.post(url, { model: this.config.ollamaModel, messages, stream: true }, { responseType: 'stream', timeout: 120000 });
        return new Promise((resolve, reject) => {
          let fullContent = '';
          response.data.on('data', (chunk: Buffer) => {
            for (const line of chunk.toString().split('\n').filter(Boolean)) {
              try {
                const p = JSON.parse(line);
                if (p.message?.content) { fullContent += p.message.content; onStream(p.message.content); }
                if (p.done) resolve({ content: fullContent, model: this.config.ollamaModel });
              } catch { /* skip */ }
            }
          });
          response.data.on('error', (e: Error) => reject({ content: '', error: e.message }));
        });
      }
      const r = await axios.post(url, { model: this.config.ollamaModel, messages, stream: false }, { timeout: 120000 });
      return { content: r.data.message?.content ?? '', model: this.config.ollamaModel };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ECONNREFUSED')) return { content: '', error: `Ollama not running. Start with: ollama serve\nThen: ollama pull ${this.config.ollamaModel}` };
      return { content: '', error: `Ollama error: ${msg}` };
    }
  }

  // Gemini - free tier 1500 req/day
  private async callGemini(messages: LLMMessage[], onStream?: StreamCallback): Promise<LLMResponse> {
    if (!this.config.geminiApiKey) return { content: '', error: 'Gemini API key not set. Get one free at aistudio.google.com' };
    const systemMsg = messages.find(m => m.role === 'system');
    const contents  = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const body: Record<string, unknown> = { contents, generationConfig: { maxOutputTokens: 8192, temperature: 0.2 } };
    if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    const ep  = onStream ? 'streamGenerateContent' : 'generateContent';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.geminiModel}:${ep}?key=${this.config.geminiApiKey}`;
    try {
      if (onStream) {
        const response = await axios.post(url, body, { responseType: 'stream', timeout: 120000 });
        let fullContent = '';
        return new Promise((resolve, reject) => {
          let buffer = '';
          response.data.on('data', (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try { const t = JSON.parse(line.slice(6)).candidates?.[0]?.content?.parts?.[0]?.text ?? ''; if (t) { fullContent += t; onStream(t); } } catch { /* skip */ }
              }
            }
          });
          response.data.on('end', () => resolve({ content: fullContent, model: this.config.geminiModel }));
          response.data.on('error', (e: Error) => reject({ content: '', error: e.message }));
        });
      }
      const r = await axios.post(url, body, { timeout: 120000 });
      return { content: r.data.candidates?.[0]?.content?.parts?.[0]?.text ?? '', model: this.config.geminiModel };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (axios.isAxiosError(err) && err.response?.status === 403) return { content: '', error: 'Gemini API key invalid or expired.' };
      return { content: '', error: `Gemini error: ${msg}` };
    }
  }

  // Anthropic Claude - best code quality
  private async callAnthropic(messages: LLMMessage[], onStream?: StreamCallback): Promise<LLMResponse> {
    if (!this.config.anthropicApiKey) return { content: '', error: 'Anthropic API key not set. Get one at console.anthropic.com' };
    const systemMsg = messages.find(m => m.role === 'system');
    const userMsgs  = messages.filter(m => m.role !== 'system');
    const headers   = { 'Content-Type': 'application/json', 'x-api-key': this.config.anthropicApiKey, 'anthropic-version': '2023-06-01' };
    const body      = { model: this.config.anthropicModel, max_tokens: 8192, system: systemMsg?.content ?? 'You are an expert software developer.', messages: userMsgs.map(m => ({ role: m.role, content: m.content })), stream: !!onStream };
    try {
      if (onStream) {
        const response = await axios.post('https://api.anthropic.com/v1/messages', body, { headers, responseType: 'stream', timeout: 120000 });
        let fullContent = '';
        return new Promise((resolve, reject) => {
          let buffer = '';
          response.data.on('data', (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try { const t = JSON.parse(line.slice(6)).delta?.text ?? ''; if (t) { fullContent += t; onStream(t); } } catch { /* skip */ }
              }
            }
          });
          response.data.on('end', () => resolve({ content: fullContent, model: this.config.anthropicModel }));
          response.data.on('error', (e: Error) => reject({ content: '', error: e.message }));
        });
      }
      const r = await axios.post('https://api.anthropic.com/v1/messages', { ...body, stream: false }, { headers, timeout: 120000 });
      return { content: r.data.content?.[0]?.text ?? '', model: this.config.anthropicModel };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (axios.isAxiosError(err) && err.response?.status === 401) return { content: '', error: 'Invalid Anthropic API key.' };
      if (axios.isAxiosError(err) && err.response?.status === 429) return { content: '', error: 'Anthropic rate limit. Wait a moment and retry.' };
      return { content: '', error: `Anthropic error: ${msg}` };
    }
  }

  // Groq - free tier, fastest inference
  private async callGroq(messages: LLMMessage[], onStream?: StreamCallback): Promise<LLMResponse> {
    if (!this.config.groqApiKey) return { content: '', error: 'Groq API key not set. Get one free at console.groq.com' };
    const saved = { url: this.config.openaiCompatibleUrl, key: this.config.openaiCompatibleKey, model: this.config.openaiCompatibleModel };
    this.config.openaiCompatibleUrl   = 'https://api.groq.com/openai/v1';
    this.config.openaiCompatibleKey   = this.config.groqApiKey;
    this.config.openaiCompatibleModel = this.config.groqModel;
    const result = await this.callOpenAICompatible(messages, onStream);
    this.config.openaiCompatibleUrl   = saved.url;
    this.config.openaiCompatibleKey   = saved.key;
    this.config.openaiCompatibleModel = saved.model;
    return result.error ? { content: '', error: result.error.replace('API error', 'Groq error') } : { ...result, model: this.config.groqModel };
  }

  // OpenAI GPT-4o - paid, enterprise
  private async callOpenAI(messages: LLMMessage[], onStream?: StreamCallback): Promise<LLMResponse> {
    if (!this.config.openaiApiKey) return { content: '', error: 'OpenAI API key not set. Get one at platform.openai.com' };
    const saved = { url: this.config.openaiCompatibleUrl, key: this.config.openaiCompatibleKey, model: this.config.openaiCompatibleModel };
    this.config.openaiCompatibleUrl   = 'https://api.openai.com/v1';
    this.config.openaiCompatibleKey   = this.config.openaiApiKey;
    this.config.openaiCompatibleModel = this.config.openaiModel;
    const result = await this.callOpenAICompatible(messages, onStream);
    this.config.openaiCompatibleUrl   = saved.url;
    this.config.openaiCompatibleKey   = saved.key;
    this.config.openaiCompatibleModel = saved.model;
    return result.error ? { content: '', error: result.error.replace('API error', 'OpenAI error') } : { ...result, model: this.config.openaiModel };
  }

  // OpenAI-compatible base - LM Studio, LocalAI, any endpoint
  private async callOpenAICompatible(messages: LLMMessage[], onStream?: StreamCallback): Promise<LLMResponse> {
    const url     = `${this.config.openaiCompatibleUrl}/chat/completions`;
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.config.openaiCompatibleKey}` };
    try {
      if (onStream) {
        const response = await axios.post(url, { model: this.config.openaiCompatibleModel, messages, stream: true, max_tokens: 8192, temperature: 0.2 }, { headers, responseType: 'stream', timeout: 120000 });
        let fullContent = '';
        return new Promise((resolve, reject) => {
          let buffer = '';
          response.data.on('data', (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
            for (const line of lines) {
              if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                try { const d = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content ?? ''; if (d) { fullContent += d; onStream(d); } } catch { /* skip */ }
              }
            }
          });
          response.data.on('end', () => resolve({ content: fullContent }));
          response.data.on('error', (e: Error) => reject({ content: '', error: e.message }));
        });
      }
      const r = await axios.post(url, { model: this.config.openaiCompatibleModel, messages, max_tokens: 8192, temperature: 0.2 }, { headers, timeout: 120000 });
      return { content: r.data.choices?.[0]?.message?.content ?? '', tokensUsed: r.data.usage?.total_tokens };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (axios.isAxiosError(err) && err.response?.status === 401) return { content: '', error: 'Invalid API key.' };
      if (axios.isAxiosError(err) && err.response?.status === 429) return { content: '', error: 'Rate limit hit. Wait a moment and retry.' };
      if (msg.includes('ECONNREFUSED')) return { content: '', error: `Cannot connect to ${this.config.openaiCompatibleUrl}` };
      return { content: '', error: `API error: ${msg}` };
    }
  }

  // Health check
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const result = await this.complete([{ role: 'user', content: 'Reply with exactly: OK' }]);
      if (result.error) return { ok: false, message: result.error };
      return { ok: true, message: `Connected to ${this.config.provider}${result.model ? ` (${result.model})` : ''}` };
    } catch (err) {
      return { ok: false, message: String(err) };
    }
  }

  static fromVSCodeConfig(): LLMProvider {
    const cfg    = vscode.workspace.getConfiguration('autodev');
    const config: AgentConfig = {
      provider:              cfg.get('provider', 'ollama') as AgentConfig['provider'],
      ollamaUrl:             cfg.get('ollamaUrl', 'http://localhost:11434'),
      ollamaModel:           cfg.get('ollamaModel', 'qwen2.5-coder:7b'),
      geminiApiKey:          cfg.get('geminiApiKey', ''),
      geminiModel:           cfg.get('geminiModel', 'gemini-1.5-flash'),
      openaiCompatibleUrl:   cfg.get('openaiCompatibleUrl', 'http://localhost:1234/v1'),
      openaiCompatibleKey:   cfg.get('openaiCompatibleKey', 'local'),
      openaiCompatibleModel: cfg.get('openaiCompatibleModel', 'local-model'),
      anthropicApiKey:       cfg.get('anthropicApiKey', ''),
      anthropicModel:        cfg.get('anthropicModel', 'claude-3-5-haiku-20241022'),
      groqApiKey:            cfg.get('groqApiKey', ''),
      groqModel:             cfg.get('groqModel', 'llama-3.3-70b-versatile'),
      openaiApiKey:          cfg.get('openaiApiKey', ''),
      openaiModel:           cfg.get('openaiModel', 'gpt-4o-mini'),
      maxFilesPerScan:             cfg.get('maxFilesPerScan', 50),
      autoRunTests:                cfg.get('autoRunTests', false),
      showDiffBeforeApply:         cfg.get('showDiffBeforeApply', true),
      excludePatterns:             cfg.get('excludePatterns', ['node_modules', '.git', 'dist', 'build', 'out']),
      selfHealingEnabled:          cfg.get('selfHealingEnabled', true),
      selfHealingMaxRetries:       cfg.get('selfHealingMaxRetries', 3),
      conversationMemoryEnabled:   cfg.get('conversationMemoryEnabled', true),
      conversationMemoryMaxTurns:  cfg.get('conversationMemoryMaxTurns', 10),
    };
    return new LLMProvider(config);
  }
}
