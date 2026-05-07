import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProviderName } from '../types';

type GenerateJsonInput = {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
};

type GenerateJsonOutput<T> = {
  provider: AiProviderName;
  model?: string;
  data: T;
  rawText: string;
};

@Injectable()
export class LlmClientService {
  constructor(private readonly config: ConfigService) {}

  async generateJson<T>(input: GenerateJsonInput): Promise<GenerateJsonOutput<T>> {
    const provider = this.getProvider();
    if (provider === 'mock') {
      throw new ServiceUnavailableException('AI_PROVIDER is mock. Configure OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY for real AI parsing.');
    }

    const rawText =
      provider === 'openai'
        ? await this.callOpenAi(input)
        : provider === 'anthropic'
          ? await this.callAnthropic(input)
          : await this.callGemini(input);

    return {
      provider,
      model: this.getModel(provider),
      data: this.parseJson<T>(rawText),
      rawText,
    };
  }

  getProvider(): AiProviderName {
    const configured = (this.config.get<string>('AI_PROVIDER') || '').toLowerCase();
    if (configured === 'openai' || configured === 'anthropic' || configured === 'gemini' || configured === 'mock') return configured;
    if (this.config.get<string>('OPENAI_API_KEY')) return 'openai';
    if (this.config.get<string>('ANTHROPIC_API_KEY')) return 'anthropic';
    if (this.config.get<string>('GEMINI_API_KEY')) return 'gemini';
    return 'mock';
  }

  private getModel(provider: AiProviderName) {
    if (provider === 'openai') return this.config.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';
    if (provider === 'anthropic') return this.config.get<string>('ANTHROPIC_MODEL') || 'claude-3-5-haiku-latest';
    if (provider === 'gemini') return this.config.get<string>('GEMINI_MODEL') || 'gemini-1.5-flash';
    return 'mock';
  }

  private async callOpenAi(input: GenerateJsonInput) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('OPENAI_API_KEY is missing');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.getModel('openai'),
        temperature: input.temperature ?? 0.1,
        response_format: { type: 'json_object' },
        max_tokens: input.maxTokens ?? 1200,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
      }),
    });

    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new ServiceUnavailableException(`OpenAI error: ${payload?.error?.message || res.statusText}`);
    return payload.choices?.[0]?.message?.content || '{}';
  }

  private async callAnthropic(input: GenerateJsonInput) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('ANTHROPIC_API_KEY is missing');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.getModel('anthropic'),
        temperature: input.temperature ?? 0.1,
        max_tokens: input.maxTokens ?? 1200,
        system: input.system,
        messages: [{ role: 'user', content: input.user }],
      }),
    });

    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new ServiceUnavailableException(`Anthropic error: ${payload?.error?.message || res.statusText}`);
    return payload.content?.map((part: { text?: string }) => part.text || '').join('\n') || '{}';
  }

  private async callGemini(input: GenerateJsonInput) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('GEMINI_API_KEY is missing');
    const model = this.getModel('gemini');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generationConfig: {
          temperature: input.temperature ?? 0.1,
          maxOutputTokens: input.maxTokens ?? 1200,
          responseMimeType: 'application/json',
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: `${input.system}\n\n${input.user}` }],
          },
        ],
      }),
    });

    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new ServiceUnavailableException(`Gemini error: ${payload?.error?.message || res.statusText}`);
    return payload.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('\n') || '{}';
  }

  private parseJson<T>(raw: string): T {
    const trimmed = raw.trim();
    try {
      return JSON.parse(trimmed) as T;
    } catch {}

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) return JSON.parse(fenced) as T;

    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1)) as T;

    throw new ServiceUnavailableException('AI provider did not return valid JSON');
  }
}
