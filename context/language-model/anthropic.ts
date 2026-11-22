import Anthropic from '@anthropic-ai/sdk';
import { fetch as expoFetch } from "expo/fetch";
import { isValidURL, LanguageModelClient, LanguageModelSettings } from "./types";

export async function connectAnthropic(
  { baseURL, apiKey, headers }: LanguageModelSettings,
  name: string
): Promise<LanguageModelClient | undefined> {
  if (!apiKey) {
    console.warn(`${name} API key not set`);
    return;
  }

  if (!isValidURL(baseURL)) return;

  const anthropic = new Anthropic({
    apiKey,
    baseURL,
    defaultHeaders: headers,
    fetch: expoFetch as typeof fetch,
  });

  return {
    listModels: async () => {
      const response = await anthropic.models.list();
      return { models: response.data.map((model) => model.id) };
    },
    prompt: async ({ model, messages, onUpdate, onUsage, shouldStop }) => {
      const stream = await anthropic.messages.stream({
        model,
        max_tokens: 1024,
        stream: true,
        messages: messages.map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
      });

      let inputTokens: number | null = null;
      let outputTokens: number | null = null;
      for await (const chunk of stream) {
        if (shouldStop()) {
          stream.abort();
          break;
        }

        if (chunk.type === 'message_start') {
          const count = chunk.message.usage.input_tokens;
          if (Number.isSafeInteger(count) && count >= 0) inputTokens = count;
        }
        if (chunk.type === 'message_delta') {
          const count = chunk.usage.output_tokens;
          if (Number.isSafeInteger(count) && count >= 0) outputTokens = count;
        }
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          onUpdate(chunk.delta.text);
        }
      }
      if (inputTokens !== null && outputTokens !== null) {
        onUsage?.({ inputTokens, outputTokens, source: 'provider' });
      }
    },
  };
}
