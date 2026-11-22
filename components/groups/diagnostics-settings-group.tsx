import { useUiLanguage, translateUi } from "@/context/ui-language";
import { useLLM, useSystem } from "@/context";
import * as Application from "expo-application";
import * as Device from "expo-device";
import * as Network from "expo-network";
import { getLogs, subscribeLogs } from "@/utilities/logger";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, Share, StyleSheet, Text, View } from "react-native";
import * as Crypto from "expo-crypto";
import { createControlDispatcher } from "@/utils/dualmind-control-dispatcher";
import { redactDiagnostics } from "@/utils/dualmind-control-protocol";

function performanceSummary(logs: ReturnType<typeof getLogs>) {
  return logs.flatMap(entry => {
    const match = /^\[DualMind performance\] (metadata|load|generate|stop|release) (\{.*\})$/.exec(entry.message);
    if (!match) return [];
    try {
      const value = JSON.parse(match[2]);
      if (!Number.isFinite(value.durationMs) || value.durationMs < 0 || typeof value.success !== "boolean") return [];
      return [{ operation: match[1], durationMs: value.durationMs, success: value.success, time: entry.time }];
    } catch {
      return [];
    }
  }).slice(-20);
}

/**
 * Local-only diagnostic snapshot. No remote telemetry or background upload.
 * Sharing requires a user tap and Android's native share confirmation.
 */
export default function DiagnosticsSettingsGroup() {
  const { language } = useUiLanguage();
  const { colorScheme } = useSystem();
  const [busy, setBusy] = useState(false);
  const sharing = useRef(false);
  const llm = useLLM();
  const [slowCleanup, setSlowCleanup] = useState(false);
  useEffect(() => {
    if (!llm.busy) {
      setSlowCleanup(false);
      return;
    }
    const started = Date.now();
    const refresh = () => setSlowCleanup(getLogs().some(entry =>
      entry.time >= started && entry.level === "warn" &&
      entry.message.startsWith("DualMind: model cleanup is taking longer")
    ));
    return subscribeLogs(refresh);
  }, [llm.busy]);
  const latestLLM = useRef(llm);
  latestLLM.current = llm;
  const t = (ru: string, en: string) => translateUi(language, ru, en);
  const styles = StyleSheet.create({
    view: { paddingHorizontal: 16, gap: 10 },
    title: { color: colorScheme.onSurface, fontSize: 16, fontWeight: "bold" },
    body: { color: colorScheme.onSurface, fontSize: 13, opacity: 0.8 },
    button: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colorScheme.primary },
    buttonText: { color: colorScheme.onPrimary, fontSize: 14, fontWeight: "600", textAlign: "center" },
  });

  const showCopyableResult = (title: string, result: unknown) => {
    const value = JSON.stringify(result, null, 2);
    Alert.alert(title, value, [
      { text: t("Закрыть", "Close"), style: "cancel" },
      { text: t("Скопировать / поделиться", "Copy / Share"), onPress: () => { void Share.share({ message: value }); } },
    ]);
  };

  const availableModels = () => llm.type === "Llama" && llm.modelFiles ? Object.keys(llm.modelFiles) : (llm.models ?? []);
  const modelStatus = () => ({
    provider: llm.type, ready: llm.ready, busy: llm.busy, imagesSupported: llm.imagesSupported,
    selectedModel: (llm.type === "Llama" ? llm.modelKey : llm.model) ?? null,
    availableModelCount: availableModels().length,
  });
  const runLocalCheck = async () => {
    if (sharing.current) return;
    sharing.current = true;
    setBusy(true);
    try {
      // Only read actions are wired here. Mutation handlers fail closed until their dedicated integration stages.
      const dispatcher = createControlDispatcher({
        status: modelStatus,
        diagnostics: () => ({ modelStatus: modelStatus(), logCount: getLogs().length, performance: performanceSummary(getLogs()), remoteControlConnected: false }),
        models: availableModels,
        tasks: () => [],
        selectModel: () => { throw new Error("Not enabled"); },
        cancelTask: () => { throw new Error("Not enabled"); },
        confirm: async () => false,
      });
      const results = [];
      for (const action of ["status.read", "diagnostics.read", "models.list"]) {
        results.push(await dispatcher({ version: 1, id: Crypto.randomUUID(), action }));
      }
      showCopyableResult(t("Локальная проверка команд", "Local command check"), results);
    } catch {
      Alert.alert(t("Ошибка", "Error"), t("Проверка не выполнена.", "Check failed."));
    } finally {
      sharing.current = false;
      setBusy(false);
    }
  };

  const runConsentCheck = async () => {
    if (sharing.current) return;
    sharing.current = true;
    setBusy(true);
    try {
      let simulated = false;
      // A deliberately isolated fixture: never changes the real model.
      const dispatcher = createControlDispatcher({
        status: modelStatus,
        diagnostics: () => ({ remoteControlConnected: false }),
        models: () => ["local-test-model"],
        tasks: () => [],
        selectModel: () => { simulated = true; },
        cancelTask: () => { throw new Error("Not enabled"); },
        confirm: () => new Promise<boolean>(resolve => {
          Alert.alert(
            t("Подтверждение тестовой команды", "Confirm test command"),
            t("Разрешить имитацию переключения модели? Реальная модель не изменится.", "Allow a simulated model selection? Your real model will not change."),
            [
              { text: t("Отмена", "Cancel"), style: "cancel", onPress: () => resolve(false) },
              { text: t("Разрешить", "Allow"), onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          );
        }),
      });
      const result = await dispatcher({ version: 1, id: Crypto.randomUUID(), action: "models.select", params: { modelId: "local-test-model" } });
      showCopyableResult(t("Результат теста", "Test result"), { ...result, simulated });
    } catch {
      Alert.alert(t("Ошибка", "Error"), t("Проверка не выполнена.", "Check failed."));
    } finally {
      sharing.current = false;
      setBusy(false);
    }
  };

  const selectRealModel = async (modelId: string) => {
    if (sharing.current || latestLLM.current.busy) return;
    sharing.current = true;
    setBusy(true);
    const provider = latestLLM.current.type;
    const currentModels = () => {
      const current = latestLLM.current;
      if (current.type !== provider || current.busy) return [];
      return current.type === "Llama" && current.modelFiles ? Object.keys(current.modelFiles) : (current.models ?? []);
    };
    try {
      const dispatcher = createControlDispatcher({
        status: modelStatus,
        diagnostics: modelStatus,
        models: currentModels,
        tasks: () => [],
        selectModel: id => {
          const current = latestLLM.current;
          if (!currentModels().includes(id)) throw new Error("Model unavailable");
          const setter = current.type === "Llama" ? current.setModelKey : current.setModel;
          if (!setter) throw new Error("Selection unavailable");
          setter(id);
        },
        cancelTask: () => { throw new Error("Not enabled"); },
        confirm: () => new Promise<boolean>(resolve => Alert.alert(
          t("Переключение модели", "Switch model"),
          t("Выбрать модель: ", "Select model: ") + modelId,
          [
            { text: t("Отмена", "Cancel"), style: "cancel", onPress: () => resolve(false) },
            { text: t("Разрешить", "Allow"), onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        )),
      });
      const result = await dispatcher({ version: 1, id: Crypto.randomUUID(), action: "models.select", params: { modelId } });
      showCopyableResult(t("Результат команды", "Command result"), result);
    } finally {
      sharing.current = false;
      setBusy(false);
    }
  };

  const runModelLifecycle = async (action: "stop" | "unload") => {
    if (sharing.current) return;
    const initial = latestLLM.current;
    if (action === "unload" && (initial.type !== "Llama" || initial.busy || !initial.modelKey)) return;
    if (action === "stop" && (!initial.busy || !initial.ready)) return;
    sharing.current = true;
    setBusy(true);
    try {
      const checkedModel = () => {
        const current = latestLLM.current;
        if (current.type !== initial.type || current.modelKey !== initial.modelKey || current.model !== initial.model) {
          throw new Error("Model changed");
        }
        return current;
      };
      const dispatcher = createControlDispatcher({
        status: modelStatus,
        diagnostics: modelStatus,
        models: availableModels,
        tasks: () => [],
        selectModel: () => { throw new Error("Not enabled"); },
        cancelTask: () => { throw new Error("Not enabled"); },
        stopModel: async () => {
          const current = checkedModel();
          if (!current.busy || !current.ready) throw new Error("No active ready model");
          await current.stop();
        },
        unloadModel: () => {
          const current = checkedModel();
          if (current.type !== "Llama" || current.busy || !current.modelKey || !current.setModelKey) {
            throw new Error("Unload unavailable");
          }
          current.setModelKey(undefined);
        },
        confirm: () => new Promise<boolean>(resolve => Alert.alert(
          t("Подтверждение", "Confirmation"),
          action === "stop" ? t("Остановить генерацию?", "Stop generation?") : t("Выгрузить модель из памяти? Файл сохранится.", "Unload model from memory? The file will be kept."),
          [
            { text: t("Отмена", "Cancel"), style: "cancel", onPress: () => resolve(false) },
            { text: t("Разрешить", "Allow"), onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        )),
      });
      const result = await dispatcher({
        version: 1, id: Crypto.randomUUID(),
        action: action === "stop" ? "models.stop" : "models.unload",
      });
      showCopyableResult(t("Результат команды", "Command result"), result);
    } catch {
      Alert.alert(t("Ошибка", "Error"), t("Не удалось выполнить действие.", "Action failed."));
    } finally {
      sharing.current = false;
      setBusy(false);
    }
  };

  const shareDiagnostics = async () => {
    if (sharing.current) return;
    sharing.current = true;
    setBusy(true);
    try {
      const network = await Network.getNetworkStateAsync().catch(() => null);
      const logs = getLogs();
      const snapshot = redactDiagnostics({
        schema: "dualmind-diagnostics-v2",
        timestamp: new Date().toISOString(),
        application: {
          id: Application.applicationId ?? "unknown",
          version: Application.nativeApplicationVersion ?? "unknown",
          build: Application.nativeBuildVersion ?? "unknown",
        },
        device: {
          osName: Device.osName ?? "unknown",
          osVersion: Device.osVersion ?? "unknown",
          modelName: Device.modelName ?? "unknown",
          totalMemoryBytes: Device.totalMemory ?? null,
        },
        interfaceLanguage: language,
        modelStatus: modelStatus(),
        network: network ? { type: network.type, connected: network.isConnected ?? null, internetReachable: network.isInternetReachable ?? null } : null,
        performance: performanceSummary(logs),
        logSummary: { total: logs.length, warnings: logs.filter(e => e.level === "warn").length, errors: logs.filter(e => e.level === "error").length },
        remoteControlConnected: false,
      });
      await Share.share({ message: JSON.stringify(snapshot, null, 2), title: "DualMind diagnostics" });
    } catch {
      Alert.alert(t("Ошибка", "Error"), t("Не удалось открыть отправку диагностики.", "Could not open diagnostic sharing."));
    } finally {
      sharing.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={styles.view}>
      <Text style={styles.title}>{t("Диагностика и подключение", "Diagnostics and connection")}</Text>
      <Text style={styles.body}>{t("Удалённое управление: не подключено. Диагностика остаётся на устройстве, пока вы сами не решите поделиться ею.", "Remote control: not connected. Diagnostics stay on your device unless you choose to share them.")}</Text>
      <Text style={styles.body}>{t("Источник модели", "Model provider")}: {llm.type} · {llm.busy ? t("занят", "busy") : llm.ready ? t("готов", "ready") : t("не готов", "not ready")}</Text>
      {llm.busy && slowCleanup && (
        <Text accessibilityLiveRegion="polite" style={styles.body}>
          {t("Выгрузка модели затянулась. Дождитесь освобождения ресурсов. Если приложение не отвечает, перезапустите его.", "Model cleanup is taking longer than expected. Wait for resources to be released. If the app is unresponsive, restart it.")}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("Поделиться диагностикой", "Share diagnostics")}
        disabled={busy}
        onPress={shareDiagnostics}
        style={styles.button}
      >
        <Text style={styles.buttonText}>{t("Поделиться сведениями об устройстве", "Share device diagnostics")}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={runLocalCheck} style={styles.button}>
        <Text style={styles.buttonText}>{t("Проверить локальные команды", "Check local commands")}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={runConsentCheck} style={styles.button}>
        <Text style={styles.buttonText}>{t("Проверить подтверждение команд", "Check command confirmation")}</Text>
      </Pressable>
      {llm.busy && llm.ready && (
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => runModelLifecycle("stop")} style={styles.button}>
          <Text style={styles.buttonText}>{t("Запросить остановку генерации", "Request generation stop")}</Text>
        </Pressable>
      )}
      {llm.type === "Llama" && !!llm.modelKey && (
        <Pressable accessibilityRole="button" disabled={busy || llm.busy} onPress={() => runModelLifecycle("unload")} style={styles.button}>
          <Text style={styles.buttonText}>{t("Выгрузить модель", "Unload model")}</Text>
        </Pressable>
      )}
      {availableModels().map(id => (
        <Pressable key={id} accessibilityRole="button" disabled={busy || llm.busy} onPress={() => selectRealModel(id)} style={styles.button}>
          <Text style={styles.buttonText}>{t("Выбрать модель: ", "Select model: ")}{id}</Text>
        </Pressable>
      ))}
    </View>
  );
}
