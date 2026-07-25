import type { Env } from "../config/env.js";

export type AiProviderResult = {
  text: string;
  tokenUsage?: Record<string, number>;
};

export interface AiProvider {
  generateAnswer(systemInstructions: string, input: unknown): Promise<AiProviderResult>;
  summarizeEntity(systemInstructions: string, input: unknown): Promise<AiProviderResult>;
}

const OLLAMA_RESPONSE_FORMAT = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    summaryBullets: { type: "array", items: { type: "string" } },
    inferences: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          inference: { type: "string" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          sourceIds: { type: "array", items: { type: "string" } }
        },
        required: ["inference", "confidence", "sourceIds"]
      }
    },
    uncertainty: { type: "array", items: { type: "string" } },
    suggestedFollowUps: { type: "array", items: { type: "string" } }
  },
  required: [
    "answer",
    "summaryBullets",
    "inferences",
    "uncertainty",
    "suggestedFollowUps"
  ]
} as const;

export class OpenAiProvider implements AiProvider {
  constructor(private readonly env: Env) {}

  async generateAnswer(systemInstructions: string, input: unknown): Promise<AiProviderResult> {
    return this.request(this.env.OPENAI_MODEL, systemInstructions, input);
  }

  async summarizeEntity(systemInstructions: string, input: unknown): Promise<AiProviderResult> {
    return this.request(this.env.OPENAI_SUMMARY_MODEL ?? this.env.OPENAI_MODEL, systemInstructions, input);
  }

  private async request(model: string, systemInstructions: string, input: unknown): Promise<AiProviderResult> {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: systemInstructions },
          { role: "user", content: JSON.stringify(input) }
        ],
        text: { format: { type: "json_object" } }
      }),
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) throw new Error(`OPENAI_${response.status}`);
    const json = (await response.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
      usage?: Record<string, number>;
    };
    return {
      text: json.output_text ?? json.output?.flatMap((item) => item.content ?? []).map((content) => content.text).join("") ?? "",
      tokenUsage: json.usage
    };
  }
}

export class OllamaProvider implements AiProvider {
  constructor(private readonly env: Env) {}

  async generateAnswer(systemInstructions: string, input: unknown): Promise<AiProviderResult> {
    return this.request(systemInstructions, input);
  }

  async summarizeEntity(systemInstructions: string, input: unknown): Promise<AiProviderResult> {
    return this.request(systemInstructions, input);
  }

  private async request(systemInstructions: string, input: unknown): Promise<AiProviderResult> {
    const response = await fetch(new URL("/api/chat", this.env.OLLAMA_BASE_URL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.env.OLLAMA_MODEL,
        stream: false,
        think: false,
        format: OLLAMA_RESPONSE_FORMAT,
        messages: [
          { role: "system", content: systemInstructions },
          { role: "user", content: JSON.stringify(input) }
        ],
        options: { temperature: 0.1 }
      }),
      signal: AbortSignal.timeout(this.env.OLLAMA_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`OLLAMA_${response.status}`);
    const json = (await response.json()) as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };
    const inputTokens = json.prompt_eval_count ?? 0;
    const outputTokens = json.eval_count ?? 0;
    return {
      text: json.message?.content ?? "",
      tokenUsage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens
      }
    };
  }
}
