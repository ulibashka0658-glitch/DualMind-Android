import { MaterialIconButton } from "@/components/buttons/icon-button";
import Dropdown from "@/components/dropdowns/dropdown";
import { useLLM, useSystem } from "@/context";
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
    setIsDownloading(true);
    try {
      const transfer = async (url: string, path: string, update: (p: FileSystem.DownloadProgressData) => void, projector = false) => {
        const job = FileSystem.createDownloadResumable(url, path, {}, p => {
          if (mountedRef.current) update(p);
        });
        if (projector) projectorDownloadRef.current = job;
        else downloadRef.current = job;
        const result = await job.downloadAsync();
        if (!result || result.status !== 200) throw new Error("Download HTTP status: " + (result?.status ?? "no result"));
        const info = await FileSystem.getInfoAsync(result.uri);
        if (!info.exists || info.isDirectory || !info.size) throw new Error("Downloaded file missing or empty");
        const header = await FileSystem.readAsStringAsync(result.uri, { encoding: FileSystem.EncodingType.Base64, position: 0, length: 4 });
        if (header !== "R0dVRg==") throw new Error("Invalid GGUF header");
        return result.uri;
      };
      const uri = await transfer(modelUrl, modelFilePath, setProgress);
      if (projectorUrl && projectorFilePath) {
        if (!setProjectorFiles || !setProjectorKey) throw new Error("Projector storage unavailable");
        const projectorUri = await transfer(projectorUrl, projectorFilePath, setProjectorProgress, true);
        setProjectorFiles(prev => ({ ...prev, [currentKey]: projectorUri }));
        setProjectorKey(currentKey);
      } else {
        setProjectorKey?.(undefined);
      }
      setModelFiles(prev => ({ ...prev, [currentKey]: uri }));
      setModelKey(currentKey);
      if (mountedRef.current) Alert.alert("Файл скачан / File downloaded", name + " " + tag);
    } catch (error) {
      console.error("Download failed:", error);
      if (mountedRef.current) Alert.alert("Ошибка загрузки / Download error", error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, "[URL]") : "Unknown error");
    } finally {
      downloadRef.current = null;
      projectorDownloadRef.current = null;
      activeKeyRef.current = null;
      activeTransfers.delete(modelFilePath);
      if (projectorFilePath) activeTransfers.delete(projectorFilePath);
      if (mountedRef.current) {
        setIsDownloading(false);
        setProgress(undefined);
        setProjectorProgress(undefined);
      }
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
      setModelKey?.(undefined);

      const existingProjector = projectorFiles?.[currentKey];
      if (existingProjector) {
        await FileSystem.deleteAsync(existingProjector, { idempotent: true });
        setProjectorFiles?.((prev) => {
          const updated = { ...prev };
          delete updated[currentKey];
          return updated;
        });
        setProjectorKey?.(undefined);
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
          {projectorFileName ? `Model: ${percent}%  Proj: ${projectorPercent ?? 0}%` : percent === undefined ? "Starting..." : `${percent}%`}
        </Text>
      )}

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
      {HuggingfaceModels.map((model, index) => (
        <ModelDownload 
          key={index}
          source={model}
        />
      ))}
    </ScrollView>
  );
}

export default Download;