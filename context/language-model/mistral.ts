import { Mistral } from '@mistralai/mistralai';
import { TextChunk } from "@mistralai/mistralai/models/components";
import { isValidURL, LanguageModelClient, LanguageModelSettings } from "./types";

export async function connectMistral(
  { baseURL, apiKey }: LanguageModelSettings,
  name: string
): Promise<LanguageModelClient | undefined> {
  if (!apiKey) {
    console.warn(`${name} API key not set`);
    return;
  }

  if (!isValidURL(baseURL)) return;

  const mistral = new Mistral({
    apiKey,
    serverURL: baseURL
  });

  return {
    listModels: async () => {
      const response = await mistral.models.list();
      return { models: response.data?.map((model) => model.id) ?? [] };
    },
    prompt: async ({ model, messages, parameters, onUpdate, onUsage, shouldStop }) => {
      const response = await mistral.chat.complete({
        model,
        messages: messages.map((msg) => ({
          role: msg.role as "system" | "user" | "assistant",
          content: msg.content,
        })),
        ...parameters,
      });

      // The Mistral SDK uses camelCase for completion usage fields.
      // Some compatible responses use snake_case, so validate both forms.
      const rawUsage: unknown = response.usage;
      if (rawUsage && typeof rawUsage === 'object') {
        const counts = rawUsage as Record<string, unknown>;
        const input = counts.promptTokens ?? counts.prompt_tokens;
        const output = counts.completionTokens ?? counts.completion_tokens;
        if (typeof input === 'number' && Number.isSafeInteger(input) && input >= 0 &&
            typeof output === 'number' && Number.isSafeInteger(output) && output >= 0) {
          onUsage?.({ inputTokens: input, outputTokens: output, source: 'provider' });
        }
      }

      const content = response.choices[0]?.message?.content ?? "";

      if (typeof content === "string") {
        onUpdate(content);
        return;
      }

      for (const chunk of content) {
        if (shouldStop()) break;
        if (chunk.type !== "text") continue;
        onUpdate((chunk as TextChunk).text);
      }
    },
  };
}
