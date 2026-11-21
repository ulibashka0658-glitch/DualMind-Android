import { MaterialIconButton } from "@/components/buttons/icon-button";
import Dropdown from "@/components/dropdowns/dropdown";
import { useLLM, useSystem } from "@/context";
import { nativeDownloads, nativeDownloaderAvailable } from "@/utils/dualmind-native-download";
import HuggingfaceModelsRaw from "@/models.json";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface HuggingfaceModel {
  id: string;
  name: string;
  repo: string;
  branch: string;
  parameters: number;
  tags: Record<string, string | Array<string> | undefined>;
}

const HuggingfaceModels = HuggingfaceModelsRaw as Array<HuggingfaceModel>;

const activeTransfers = new Set<string>();

function ModelDownload({ source }: { source: HuggingfaceModel }) {
  const { modelFiles, setModelFiles, modelKey, setModelKey, projectorFiles, setProjectorFiles, projectorKey, setProjectorKey } = useLLM();
  const { colorScheme } = useSystem();
  const { id, name, repo, branch, tags } = source;

  const pauseRequested = useRef(false);
  const pausePending = useRef<Promise<void> | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<FileSystem.DownloadProgressData | undefined>(undefined);
  const [projectorProgress, setProjectorProgress] = useState<FileSystem.DownloadProgressData | undefined>(undefined);
  const [tag, setTag] = useState<string>(Object.keys(tags)[0]);

  // Holds the active download even across re-renders
  const downloadRef = useRef<FileSystem.DownloadResumable | null>(null);
  const projectorDownloadRef = useRef<FileSystem.DownloadResumable | null>(null);

  // Prevent setState after navigate-away / unmount
  const mountedRef = useRef(true);

  // Track which model/tag the ref is currently downloading
  const activeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // IMPORTANT: we do NOT cancel here, because you want it to keep going.
      // Just stop UI updates.
    };
  }, []);

  const currentKey = useMemo(() => `${id}:${tag}`, [id, tag]);

  const modelFileName = useMemo(() => Array.isArray(tags[tag]) ? tags[tag][0] : tags[tag], [tags, tag]);
  const modelUrl = useMemo(() => `https://huggingface.co/${repo}/resolve/${branch}/${modelFileName}`, [repo, branch, modelFileName]);
  const modelFilePath = useMemo(() => `${FileSystem.documentDirectory}${modelFileName}`, [modelFileName]);

  const projectorFileName = useMemo(() => Array.isArray(tags[tag]) ? tags[tag][1] : undefined, [tags, tag]);
  const projectorUrl = useMemo(() => projectorFileName ? `https://huggingface.co/${repo}/resolve/${branch}/${projectorFileName}` : undefined, [repo, branch, projectorFileName]);
  const projectorFilePath = useMemo(() => projectorFileName ? `${FileSystem.documentDirectory}${projectorFileName}` : undefined, [projectorFileName]);

  const downloaded = !!modelFiles?.[currentKey] && (!projectorFileName || !!projectorFiles?.[currentKey]);

  const useNative = nativeDownloaderAvailable();
  const [nativeStatus, setNativeStatus] = useState("");
  const downloadModel = async () => {
    if (downloaded) return;

    if (activeKeyRef.current || activeTransfers.has(modelFilePath) || (projectorFilePath && activeTransfers.has(projectorFilePath))) return;
    if (!FileSystem.documentDirectory || !modelFileName || !setModelFiles || !setModelKey) {
      Alert.alert("Ошибка загрузки / Download error", "Model storage unavailable");
      return;
    }
    activeKeyRef.current = currentKey;
    activeTransfers.add(modelFilePath);
    if (projectorFilePath) activeTransfers.add(projectorFilePath);
    pauseRequested.current = false;
    setIsDownloading(true);
    try {
      const transfer = async (url: string, path: string, update: (p: FileSystem.DownloadProgressData) => void, projector = false) => {
        if (useNative) {
          const key = JSON.stringify([currentKey, url, projector]);
          const filename = url.slice(url.lastIndexOf("/") + 1);
          await nativeDownloads.enqueue(key, url, filename);
          while (true) {
            if (!mountedRef.current) return undefined;
            const snapshot = await nativeDownloads.query(key);
            if (!snapshot || snapshot.state === "failed" || snapshot.state === "unknown") {
              throw new Error("Android download failed: " + (snapshot?.reason ?? "missing record"));
            }
            if (mountedRef.current) {
              update({ totalBytesWritten: snapshot.bytes, totalBytesExpectedToWrite: snapshot.total ?? 0 });
              setNativeStatus(snapshot.state === "completed" ? "Импорт модели..." : snapshot.state === "waiting" ? "Ожидание сети..." : "");
            }
            if (snapshot.state === "completed") return nativeDownloads.importCompleted(key);
            await new Promise<void>(resolve => setTimeout(resolve, 1000));
          }
        }
        const storageKey = `dualmind-resume:${url}:${path}`;
        const saved = await AsyncStorage.getItem(storageKey);
        const existing = await FileSystem.getInfoAsync(path);
        const resumeData = saved && existing.exists && !existing.isDirectory && existing.size ? saved : undefined;
        const job = FileSystem.createDownloadResumable(url, path, {}, p => {
          if (mountedRef.current) update(p);
        }, resumeData);
        if (projector) projectorDownloadRef.current = job;
        else downloadRef.current = job;
        const result = await (resumeData ? job.resumeAsync() : job.downloadAsync());
        if (pauseRequested.current && !result) return undefined;
        if (!result || (result.status !== 200 && !(resumeData && result.status === 206))) throw new Error("Download HTTP status: " + (result?.status ?? "no result"));
        const info = await FileSystem.getInfoAsync(result.uri);
        if (!info.exists || info.isDirectory || !info.size) throw new Error("Downloaded file missing or empty");
        const header = await FileSystem.readAsStringAsync(result.uri, { encoding: FileSystem.EncodingType.Base64, position: 0, length: 4 });
        if (header !== "R0dVRg==") throw new Error("Invalid GGUF header");
        await AsyncStorage.removeItem(storageKey);
        return result.uri;
      };
      const uri = await transfer(modelUrl, modelFilePath, setProgress);
      if (!uri || pauseRequested.current) return;
      if (projectorUrl && projectorFilePath) {
        if (!setProjectorFiles || !setProjectorKey) throw new Error("Projector storage unavailable");
        const projectorUri = await transfer(projectorUrl, projectorFilePath, setProjectorProgress, true);
        if (!projectorUri || pauseRequested.current) return;
        setProjectorFiles(prev => ({ ...prev, [currentKey]: projectorUri }));
        setProjectorKey(currentKey);
      } else {
        setProjectorKey?.(undefined);
      }
      setModelFiles(prev => ({ ...prev, [currentKey]: uri }));
      if (mountedRef.current) setModelKey(currentKey);
      if (mountedRef.current) Alert.alert("Файл скачан / File downloaded", name + " " + tag);
    } catch (error) {
      console.error("Download failed:", error);
      if (mountedRef.current) Alert.alert("Ошибка загрузки / Download error", error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, "[URL]") : "Unknown error");
    } finally {
      await pausePending.current;
      downloadRef.current = null;
      projectorDownloadRef.current = null;
      activeKeyRef.current = null;
      activeTransfers.delete(modelFilePath);
      if (projectorFilePath) activeTransfers.delete(projectorFilePath);
      if (mountedRef.current) {
        setIsDownloading(false);
        setProgress(undefined);
        setProjectorProgress(undefined);
        setNativeStatus("");
      }
    }
  };

  // Reattach only to an existing Android job; never start a new model on mount.
  useEffect(() => {
    if (!useNative || downloaded || isDownloading || !modelFileName) return;
    let alive = true;
    const restore = async () => {
      const key = JSON.stringify([currentKey, modelUrl, false]);
      const snapshot = await nativeDownloads.query(key);
      if (alive && snapshot && ["pending", "running", "waiting", "completed"].includes(snapshot.state)) {
        void downloadModel();
      }
    };
    void restore().catch(error => console.error("Download restoration failed:", error));
    return () => { alive = false; };
    // Reattach when opening this card or changing the selected quantization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useNative, downloaded, currentKey, modelUrl, modelFileName]);

  const pauseDownload = async () => {
    const projector = projectorDownloadRef.current;
    const job = projector ?? downloadRef.current;
    if (!job || pauseRequested.current) return;
    pauseRequested.current = true;
    let finishPause!: () => void;
    pausePending.current = new Promise<void>(resolve => { finishPause = resolve; });
    try {
      const state = await job.pauseAsync();
      if (!state.resumeData) throw new Error("Resume data unavailable");
      const url = projector ? projectorUrl : modelUrl;
      const path = projector ? projectorFilePath : modelFilePath;
      await AsyncStorage.setItem(`dualmind-resume:${url}:${path}`, state.resumeData);
      if (mountedRef.current) Alert.alert("Загрузка приостановлена", "Нажмите скачивание для продолжения.");
    } catch (error) {
      pauseRequested.current = false;
      console.error("Pause failed:", error);
      if (mountedRef.current) Alert.alert("Не удалось сохранить паузу");
    } finally {
      finishPause();
      pausePending.current = null;
    }
  };

  const deleteModel = async () => {
    const existing = modelFiles?.[currentKey];
    if (!existing) return;

    // If THIS file is downloading, cancel first so you don't delete mid-stream
    if (downloadRef.current && activeKeyRef.current === currentKey) {
      try { await downloadRef.current.cancelAsync(); } catch {}
      if (projectorDownloadRef.current) {
        try { await projectorDownloadRef.current.cancelAsync(); } catch {}
        projectorDownloadRef.current = null;
      }
      downloadRef.current = null;
      activeKeyRef.current = null;
      if (mountedRef.current) {
        setProgress(undefined);
        setProjectorProgress(undefined);
      }
    }

    try {
      await FileSystem.deleteAsync(existing, { idempotent: true });
      setModelFiles?.((prev) => {
        const updated = { ...prev };
        delete updated[currentKey];
        return updated;
      });
      if (modelKey === currentKey) setModelKey?.(undefined);

      const existingProjector = projectorFiles?.[currentKey];
      if (existingProjector) {
        await FileSystem.deleteAsync(existingProjector, { idempotent: true });
        setProjectorFiles?.((prev) => {
          const updated = { ...prev };
          delete updated[currentKey];
          return updated;
        });
        if (projectorKey === currentKey) setProjectorKey?.(undefined);
      }
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const selectModel = () => {
    const existing = modelFiles?.[currentKey];
    if (!existing) {
      console.warn("Model file not found, cannot select");
      return;
    }
    setModelKey?.(currentKey);
    if (projectorFiles?.[currentKey]) {
      setProjectorKey?.(currentKey);
    } else {
      setProjectorKey?.(undefined);
    }
  };

  useEffect(() => {
    let alive = true;
    const loadTag = async () => {
      try {
        const storedTag = await AsyncStorage.getItem(`model-${id}-selected-tag`);
        if (alive && storedTag && tags[storedTag] && !activeKeyRef.current) setTag(storedTag);
      } catch (error) {
        console.error("Error loading selected tag:", error);
      }
    };
    void loadTag();
    return () => { alive = false; };
  }, [id, tags]);

  const chooseTag = (value: string) => {
    if (activeKeyRef.current) return;
    setTag(value);
    void AsyncStorage.setItem(`model-${id}-selected-tag`, value).catch(error => console.error("Error saving selected tag:", error));
  };

  const styles = StyleSheet.create({
    view: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomColor: colorScheme.outlineVariant,
      borderBottomWidth: 1,
      padding: 16,
    },
    downloadedOptions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    button: {
      backgroundColor: colorScheme.primaryContainer,
      borderRadius: 16,
      padding: 4,
    },
    deleteButton: {
      backgroundColor: colorScheme.errorContainer,
      borderRadius: 16,
      padding: 4,
    },
    titleView: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    name: {
      color: colorScheme.secondary,
    },
    textButton: {
      color: modelKey === currentKey ? colorScheme.onPrimary : colorScheme.onPrimaryContainer,
      backgroundColor: modelKey === currentKey ? colorScheme.primary : colorScheme.primaryContainer,
      paddingVertical: 4,
      paddingHorizontal: 12,
      borderRadius: 20,
    },
  });

  const percent =
    progress?.totalBytesExpectedToWrite
      ? Math.min(99, Math.floor((progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 100))
      : undefined;

  const projectorPercent =
    projectorProgress?.totalBytesExpectedToWrite
      ? Math.min(99, Math.floor((projectorProgress.totalBytesWritten / projectorProgress.totalBytesExpectedToWrite) * 100))
      : undefined;

  return (
    <View style={styles.view}>
      <View style={styles.titleView}>
        <Text style={styles.name}>{name}</Text>
        <Dropdown
          items={Object.keys(tags).map((key) => ({ label: key, value: key }))}
          selectedValue={tag}
          onValueChange={chooseTag}
        />
      </View>

      {isDownloading && (
        <Text style={styles.name}>
          {nativeStatus || (projectorFileName ? `Model: ${percent}%  Proj: ${projectorPercent ?? 0}%` : percent === undefined ? "Starting..." : `${percent}%`)}
        </Text>
      )}

      {isDownloading && !useNative && progress && <TouchableOpacity onPress={pauseDownload}><Text style={styles.textButton}>Пауза</Text></TouchableOpacity>}

      {!isDownloading && !downloaded && (
        <MaterialIconButton
          icon="download"
          size={18}
          style={styles.button}
          color={colorScheme.onPrimaryContainer}
          onPress={downloadModel}
        />
      )}

      {downloaded && (
        <View style={styles.downloadedOptions}>
          <MaterialIconButton
            icon="delete"
            size={18}
            style={styles.deleteButton}
            color={colorScheme.onErrorContainer}
            onPress={deleteModel}
          />
          <TouchableOpacity onPress={selectModel}>
            <Text style={styles.textButton}>Select</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function Download() {
  const { colorScheme } = useSystem();
  const { modelFiles, modelKey, busy, ready, setModelKey, projectorFiles, setProjectorKey, pickModelFile } = useLLM();
  const [tab, setTab] = useState<"library" | "catalog">("library");
  const insets = useSafeAreaInsets();

  const styles = StyleSheet.create({
    view: {
      flex: 1,
      flexDirection: "column",
      backgroundColor: colorScheme.surface,
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 8
    },
    content: {
      // Edge-to-edge: keep the last model card clear of the navigation bar.
      paddingBottom: insets.bottom + 8,
    }
  });

  return (
    <ScrollView
      testID="download-page"
      style={styles.view}
      contentContainerStyle={styles.content}
    >
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {(["library", "catalog"] as const).map(item => (
          <TouchableOpacity key={item} accessibilityRole="button" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)}
            style={{ padding: 12, borderRadius: 16, backgroundColor: tab === item ? colorScheme.primary : colorScheme.primaryContainer }}>
            <Text style={{ color: tab === item ? colorScheme.onPrimary : colorScheme.onPrimaryContainer }}>{item === "library" ? "Скачанные модели" : "Скачать модели"}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity accessibilityRole="button" disabled={busy || !pickModelFile} onPress={() => { void pickModelFile?.().catch(() => Alert.alert("Не удалось импортировать модель")); }}
          style={{ padding: 12, borderRadius: 16, backgroundColor: colorScheme.primaryContainer, opacity: busy || !pickModelFile ? 0.5 : 1 }}>
          <Text style={{ color: colorScheme.onPrimaryContainer }}>Импорт GGUF</Text>
        </TouchableOpacity>
      </View>
      {tab === "library" && (
        <View style={{ gap: 12 }}>
          {Object.keys(modelFiles ?? {}).length === 0 && <Text style={{ color: colorScheme.onSurface }}>Нет скачанных моделей. Откройте каталог или импортируйте GGUF.</Text>}
          {Object.keys(modelFiles ?? {}).sort().map(key => (
            <View key={key} style={{ padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: colorScheme.outlineVariant }}>
              <Text style={{ color: colorScheme.onSurface }}>{key}</Text>
              <TouchableOpacity accessibilityRole="button" disabled={busy || !setModelKey || (modelKey === key && ready)}
                onPress={() => { setProjectorKey?.(projectorFiles?.[key] ? key : undefined); setModelKey?.(key); }}
                style={{ padding: 12, borderRadius: 12, backgroundColor: colorScheme.primaryContainer, opacity: busy ? 0.5 : 1 }}>
                <Text style={{ color: colorScheme.onPrimaryContainer }}>{modelKey === key ? (busy ? "Загрузка / ожидание" : ready ? "Активна" : "Загрузить в память") : "Выбрать модель"}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
      <View style={{ display: tab === "catalog" ? "flex" : "none" }}>
      {HuggingfaceModels.map((model, index) => (
        <ModelDownload 
          key={index}
          source={model}
        />
      ))}
      </View>
    </ScrollView>
  );
}

export default Download;