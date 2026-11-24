import { Platform } from "react-native";
import { readLlamaCompletionUsage } from "@/lib/llama-usage";
import { DocumentPickerAsset, getDocumentAsync } from "expo-document-picker";
import * as FileSystem from 'expo-file-system/legacy';
import { initLlama, loadLlamaModelInfo, RNLlamaOAICompatibleMessage } from 'llama.rn';
import { MessageNode } from 'message-nodes';
import { LanguageModelClient, LanguageModelSettings } from "./types";

async function measureLlama<T>(operation: string, run: () => Promise<T>): Promise<T> {
  const started = performance.now();
  let success = false;
  try {
    const result = await run();
    success = true;
    return result;
  } finally {
    console.log("[DualMind performance]", operation, {
      durationMs: Math.round(performance.now() - started),
      success,
    });
  }
}

async function isGGUF(fileUri: string): Promise<boolean> {
  try {
    // Read first 4 bytes as base64, then decode to bytes
    const b64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
      length: 4,
      position: 0,
    });

    // atob is available in RN; if not, use a small base64 decoder util
    const bin = globalThis.atob ? globalThis.atob(b64) : Buffer.from(b64, "base64").toString("binary");
    if (bin.length < 4) return false;

    const b0 = bin.charCodeAt(0) & 0xff;
    const b1 = bin.charCodeAt(1) & 0xff;
    const b2 = bin.charCodeAt(2) & 0xff;
    const b3 = bin.charCodeAt(3) & 0xff;

    return b0 === 0x47 && b1 === 0x47 && b2 === 0x55 && b3 === 0x46;
  } catch {
    return false;
  }
};

function parseMessages(messages: Array<MessageNode>): Array<RNLlamaOAICompatibleMessage> {
  return messages.map((message) => {
    const images: Array<string> | undefined = (message.metadata as any)?.images;

    if (images && images.length > 0) {
      return {
        role: message.role,
        content: [
          { type: "text", text: message.content as string },
          ...images.map((uri) => ({
            type: "image_url" as const,
            image_url: { url: uri },
          })),
        ],
      } as RNLlamaOAICompatibleMessage;
    }

    return message as unknown as RNLlamaOAICompatibleMessage;
  });
}

// Keep the original chat intact; guide the local model only at inference time.
export function withRussianLanguageHint(messages: RNLlamaOAICompatibleMessage[], mode: unknown = 'auto'): RNLlamaOAICompatibleMessage[] {
  const lastUser = [...messages].reverse().find(message => message.role === "user");
  const content = lastUser?.content;
  const userText = typeof content === "string" ? content : Array.isArray(content)
    ? content.map(part => part.type === "text" ? part.text : "").join(" ")
    : "";
  if (mode === "off" || (mode !== "ru" && mode !== "en" && !/[А-Яа-яЁё]/.test(userText))) return messages;
  const hint = mode === "en" ? "Respond in English unless the user explicitly requests another language. Avoid unnecessary language mixing. Admit uncertainty rather than inventing facts." : "Отвечай на русском языке, если пользователь явно не попросил другой язык. Не смешивай языки без необходимости. Если не знаешь ответа, скажи об этом, не выдумывай факты.";
  const first = messages[0];
  if (first?.role === "system") {
    if (typeof first.content !== "string") return messages;
    return [{ ...first, content: first.content + "\n" + hint }, ...messages.slice(1)];
  }
  return [{ role: "system", content: hint }, ...messages];
}

export interface PickedFile {
  key: string;
  files: Record<string, string>;
}

async function pickFile(): Promise<DocumentPickerAsset | undefined> {
  const file = await getDocumentAsync({
    multiple: false,
  });
  return file.assets?.[0];
}

// Store each imported file separately, without replacing previously imported files.
async function importLocalFile(asset: DocumentPickerAsset, files: Record<string, string>): Promise<PickedFile> {
  const name = asset.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const base = asset.name.replace(/\.[^/.]+$/, "");
  let key = base + " (local)";
  let suffix = 2;
  while (Object.prototype.hasOwnProperty.call(files, key)) {
    key = base + " " + suffix++ + " (local)";
  }
  if (!FileSystem.documentDirectory) throw new Error("Model storage unavailable");
  const directory = FileSystem.documentDirectory + "local-models/";
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  let path: string;
  do {
    path = directory + Date.now() + "-" + Math.random().toString(36).slice(2) + "-" + name;
  } while ((await FileSystem.getInfoAsync(path)).exists);
  await FileSystem.moveAsync({ from: asset.uri, to: path });
  return { key, files: { ...files, [key]: path } };
}

export async function pickModelFile(modelFiles: Record<string, string>): Promise<PickedFile | undefined> {
  const asset = await pickFile();
  if (!asset) return;

  if (!/\.gguf$/i.test(asset.name) || !(await isGGUF(asset.uri))) {
    alert("Please select a valid GGUF model file");
    return;
  }

  return importLocalFile(asset, modelFiles);
}

export async function pickProjectorFile(projectorFiles: Record<string, string>): Promise<PickedFile | undefined> {
  const asset = await pickFile();
  if (!asset) return;

  if (!/\.(mmproj|gguf)$/i.test(asset.name) || !(await isGGUF(asset.uri))) {
    alert("Please select a valid GGUF multimodal projector file");
    return;
  }

  return importLocalFile(asset, projectorFiles);
}

/** Loads the selected GGUF model (and projector, if any) into memory with llama.rn. */
export async function connectLlama(
  { modelKey, modelFiles, projectorKey, projectorFiles, parameters }: LanguageModelSettings
): Promise<LanguageModelClient | undefined> {
  if (!modelKey || !modelFiles[modelKey]) return;

  const modelFile = modelFiles[modelKey];

  // Ensure the selected file is a GGUF model before proceeding
  if (!(await isGGUF(modelFile))) return;

  const info = await measureLlama("metadata", () => loadLlamaModelInfo(modelFile)) as Record<string, any>;
  const ctx_key = Object.keys(info).find(key => key.toLowerCase().endsWith("context_length"));
  const advertisedContext = ctx_key ? Number(info[ctx_key]) : 2048;
  const n_ctx = Number.isFinite(advertisedContext) && advertisedContext > 0
    ? Math.min(4096, Math.floor(advertisedContext))
    : 2048;

  const projectorFile =
    projectorKey &&
    (projectorKey === modelKey || modelKey.endsWith("(local)"))
      ? projectorFiles[projectorKey]
      : undefined;

  // Revalidate persisted projector paths before passing them to native code.
  if (projectorFile && !(await isGGUF(projectorFile))) {
    throw new Error("Selected multimodal projector is missing or is not a valid GGUF file");
  }

  const { response_language: _responseLanguage, ...contextParameters } = parameters;
  const llama = await measureLlama("load", () => initLlama({
    model: modelFile,
    use_mlock: Platform.OS !== "android",
    n_ctx,
    n_gpu_layers: 99,
    // Conservative Android defaults; explicit user settings still take priority.
    ...(Platform.OS === "android" ? { n_threads: 4, n_batch: 128 } : {}),
    ...contextParameters,
    ctx_shift: !projectorFile
  }));

  let imagesSupported = false;

  if (projectorFile) {
    try {
      const initialized = await llama.initMultimodal({
        path: projectorFile,
        use_gpu: true
      });

      if (initialized === false) {
        throw new Error("Multimodal projector initialization failed");
      }
      const support = await llama.getMultimodalSupport();
      imagesSupported = support.vision === true;
    } catch (error) {
      await llama.release();
      throw error;
    }
  }

  return {
    imagesSupported,
    prompt: async ({ messages, onUpdate, onUsage, parameters: sampling }) => {
      const bounded = (key: string, fallback: number, min: number, max: number) => {
        const value = sampling[key];
        return typeof value === "number" && Number.isFinite(value)
          ? Math.max(min, Math.min(max, value)) : fallback;
      };
      const result = await measureLlama("generate", () => llama.completion({
        temperature: bounded("temperature", 0.6, 0, 2),
        top_p: bounded("top_p", 0.9, 0, 1),
        top_k: Math.round(bounded("top_k", 40, 0, 200)),
        messages: withRussianLanguageHint(parseMessages(messages), sampling.response_language)
      }, (data) => onUpdate(data.token)));

      const usage = readLlamaCompletionUsage(result.timings);
      if (usage) onUsage?.(usage);
      console.log('Timings:', result.timings);
    },
    stop: () => measureLlama("stop", () => llama.stopCompletion()),
    release: () => measureLlama("release", () => llama.release()),
  };
}
