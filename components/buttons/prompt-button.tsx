import type { TokenUsage } from "@/lib/token-usage";
import { readUsageRates } from "@/lib/usage-rates";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialIconButton } from "@/components/buttons/icon-button";
import { useChat, useLLM, useSystem } from "@/context";
import getMetadata from "@/utilities/metadata";
import { randomUUID } from "expo-crypto";
import { ImagePickerAsset } from "expo-image-picker";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { addNode, getConversation, updateContent } from "message-nodes";
import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";

interface PromptButtonProps {
  promptText: string; 
  setPromptText: Dispatch<SetStateAction<string>>;
  images: Array<ImagePickerAsset>;
  setImages: Dispatch<SetStateAction<Array<ImagePickerAsset>>>;
};

function PromptButton({ promptText, setPromptText, images, setImages }: PromptButtonProps) {
  const { mappings, setMappings, root, setRoot } = useChat();
  const { colorScheme, systemPrompt } = useSystem();
  const LLM = useLLM();

  const [dictating, setDictating] = useState(false);
  const [startingDictation, setStartingDictation] = useState(false);
  const transcriptRef = useRef("");

  const prompt = () => {
    if (!LLM.ready || LLM.busy) return;
    if (images.length && !LLM.imagesSupported) {
      Alert.alert("Нужна модель с поддержкой изображений", "Переключите модель или удалите вложения перед отправкой.");
      return;
    }
    if (images.some(image => !image.base64 || !image.mimeType)) {
      Alert.alert("Не удалось прочитать изображение", "Удалите повреждённое вложение и выберите его повторно.");
      return;
    }

    let next = mappings;
    let parent: string | undefined;

    if (root) {
      const thread = getConversation(mappings, root);
      parent = thread[thread.length - 1].id;
    } else {
      parent = randomUUID();
      next = addNode<string>(
        next,
        parent,
        "system",
        systemPrompt || "You are a helpful assistant.",
        parent,
        undefined,
        undefined,
        { title: "New Chat", ...getMetadata() }
      );
    }

    const id = randomUUID();
    next = addNode<string>(next, id, "user", promptText, root || parent, parent, undefined, getMetadata());
    setPromptText("");

    if (images.length > 0) {
      const filePaths: Array<string> = [];

      for (const image of images) {
        if (image.base64 && image.mimeType) {
          filePaths.push(`data:${image.mimeType};base64,${image.base64}`);
        }
      }

      next = updateContent(next, id, prev => prev, meta => ({
        ...meta,
        images: filePaths,
      }));
      setImages([]);
    }

    const responseId = randomUUID();
    next = addNode<string>(
      next,
      responseId,
      "assistant",
      "",
      root || parent,
      id,
      undefined,
      {
        ...getMetadata(),
        ...LLM.parameters,
        provider: LLM.type.toLowerCase().replace(" ", "-"),
        model: LLM.model || LLM.modelKey,
      }
    );

    setMappings(next);
    setRoot(root || parent);

    const conversation = getConversation(next, root || parent);

    let buffer = "";
    LLM.prompt(conversation, (chunk: string) => {
      buffer += chunk;
      setMappings(prev =>
        updateContent(prev, responseId, buffer, meta => ({
          ...meta,
          updateTime: new Date().toISOString(),
        }))
      );
    }, async (usage: TokenUsage) => {
      // Snapshot the manual rates when usage arrives, not at render time.
      let rates = readUsageRates(null);
      try {
        const saved = await AsyncStorage.getItem("dual-mind-usage-rates-v1");
        if (saved) rates = readUsageRates(JSON.parse(saved));
      } catch (error) {
        console.warn("Unable to read token pricing:", error);
      }
      setMappings(prev => updateContent(prev, responseId, content => content, meta => ({
        ...meta,
        tokenUsage: {
          usage,
          mode: ["Llama", "Ollama", "llmman"].includes(LLM.type) ? "local" : "cloud",
          pricing: rates.pricing,
          fx: rates.fx,
        },
      })));
    });
  };

  const dictate = async () => {
    setStartingDictation(true);
    transcriptRef.current = "";
    try {
      let granted = false;
      const perms = await ExpoSpeechRecognitionModule.getPermissionsAsync();
      if (perms.granted) {
        granted = true;
      }
      else if (perms.canAskAgain) {
        const request = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        granted = request.granted;
      }
      else {
        console.warn("Microphone permission denied and cannot ask again.");
        setStartingDictation(false);
        return;
      }

      if (!granted) {
        console.warn("Microphone permission denied.");
        setStartingDictation(false);
        return;
      }
    } catch (error) {
      console.error("Error requesting microphone permission:", error);
      setStartingDictation(false);
      return;
    }

    try {
      ExpoSpeechRecognitionModule.start({
        lang: "ru-RU",
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        androidIntentOptions: {
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 10000,
          EXTRA_MASK_OFFENSIVE_WORDS: false,
        }
      });
    } catch (error) {
      console.error("Error starting speech recognition:", error);
      setStartingDictation(false);
    }
  };

  useEffect(() => {
    const startListener = ExpoSpeechRecognitionModule.addListener("start", () => {
      setDictating(true);
      setStartingDictation(false);
    });

    const endListener = ExpoSpeechRecognitionModule.addListener("end", () => {
      setDictating(false);
      setStartingDictation(false);
    });

    const resultListener = ExpoSpeechRecognitionModule.addListener("result", (event) => {
      const transcript = event.results?.[0]?.transcript ?? "";
      if (!transcript.trim()) return;
      // Interim results replace the current hypothesis rather than duplicating words.
      setPromptText(prev => {
        const previousHypothesis = transcriptRef.current;
        const base = previousHypothesis && prev.endsWith(previousHypothesis)
          ? prev.slice(0, -previousHypothesis.length) : prev;
        const glue = base.trim().length > 0 && !base.endsWith(" ") ? " " : "";
        transcriptRef.current = transcript;
        return base + glue + transcript;
      });
      // Do not stop or submit automatically. The user controls both actions.
    });

    // If the lib supports it, this is worth having:
    const errorListener = ExpoSpeechRecognitionModule.addListener?.("error" as any, (event: any) => {
      console.error("Speech recognition error:", event);
      setDictating(false);
      setStartingDictation(false);
    });

    return () => {
      startListener.remove();
      endListener.remove();
      resultListener.remove();
      errorListener?.remove?.();
    };
  }, [setPromptText]);

  if (dictating) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text accessibilityRole="text" style={{ color: colorScheme.primary, fontWeight: "bold" }}>● Запись</Text>
        <MaterialIconButton testID="stop-dictate-button" icon="stop-circle" size={28}
          color={colorScheme.primary} onPress={() => ExpoSpeechRecognitionModule.stop()} />
        {promptText.trim().length > 0 && (
          <MaterialIconButton testID="send-dictated-button" icon="send" size={28}
            color={colorScheme.primary} disabled={!LLM.ready}
            onPress={() => { ExpoSpeechRecognitionModule.stop(); prompt(); }} />
        )}
      </View>
    );
  }
    else if (LLM.ready && LLM.busy) {
    return (
      <MaterialIconButton
        testID="stop-button"
        icon="stop-circle"
        size={28}
        color={colorScheme.onError}
        onPress={LLM.stop}
      />
    );
  }
  else if (promptText.trim().length > 0 || images.length > 0) {
    return (
      <MaterialIconButton
        testID="send-button"
        icon="send"
        size={28}
        color={colorScheme.primary}
        onPress={prompt}
        disabled={!LLM.ready}
      />
    );
  }

  return (
    <MaterialIconButton
      testID="dictate-button"
      icon="mic"
      size={28}
      color={colorScheme.primary}
      onPress={dictate}
      disabled={startingDictation} 
    />
  );
}

export default PromptButton;