import { useUiLanguage, translateUi } from "@/context/ui-language";
import { useSystem } from "@/context";
import * as Application from "expo-application";
import * as Device from "expo-device";
import { useState } from "react";
import { Alert, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { redactDiagnostics } from "@/utils/dualmind-control-protocol";

/**
 * Local-only diagnostic snapshot. No remote telemetry or background upload.
 * Sharing requires a user tap and Android's native share confirmation.
 */
export default function DiagnosticsSettingsGroup() {
  const { language } = useUiLanguage();
  const { colorScheme } = useSystem();
  const [busy, setBusy] = useState(false);
  const t = (ru: string, en: string) => translateUi(language, ru, en);
  const styles = StyleSheet.create({
    view: { paddingHorizontal: 16, gap: 10 },
    title: { color: colorScheme.onSurface, fontSize: 16, fontWeight: "bold" },
    body: { color: colorScheme.onSurface, fontSize: 13, opacity: 0.8 },
    button: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colorScheme.primary },
    buttonText: { color: colorScheme.onPrimary, fontSize: 14, fontWeight: "600", textAlign: "center" },
  });

  const shareDiagnostics = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const snapshot = redactDiagnostics({
        schema: "dualmind-diagnostics-v1",
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
        },
        interfaceLanguage: language,
        remoteControlConnected: false,
      });
      await Share.share({ message: JSON.stringify(snapshot, null, 2), title: "DualMind diagnostics" });
    } catch {
      Alert.alert(t("Ошибка", "Error"), t("Не удалось открыть отправку диагностики.", "Could not open diagnostic sharing."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.view}>
      <Text style={styles.title}>{t("Диагностика и подключение", "Diagnostics and connection")}</Text>
      <Text style={styles.body}>{t("Удалённое управление: не подключено. Диагностика остаётся на устройстве, пока вы сами не решите поделиться ею.", "Remote control: not connected. Diagnostics stay on your device unless you choose to share them.")}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("Поделиться диагностикой", "Share diagnostics")}
        disabled={busy}
        onPress={shareDiagnostics}
        style={styles.button}
      >
        <Text style={styles.buttonText}>{t("Поделиться сведениями об устройстве", "Share device diagnostics")}</Text>
      </Pressable>
    </View>
  );
}
