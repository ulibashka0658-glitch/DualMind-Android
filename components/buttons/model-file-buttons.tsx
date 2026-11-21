import { useUiLanguage, translateUi } from "@/context/ui-language";
import { useLLM, useSystem } from "@/context";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

function ModelFileButtons() {
  const { modelKey, pickModelFile, projectorKey, pickProjectorFile } = useLLM();
  const { colorScheme } = useSystem();
  const { language } = useUiLanguage();

  const styles = StyleSheet.create({
    view: {
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16
    },
    label: {
      color: colorScheme.onSurface,
      fontSize: 14,
    },
    button: {
      color: colorScheme.primary,
      backgroundColor: colorScheme.surfaceVariant,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 20,
    },
  });

  if (!pickModelFile) return null;

  return (
    <View style={styles.view}>
      {modelKey && <Text style={styles.label}>{modelKey}</Text>}
      <TouchableOpacity
        onPress={pickModelFile}
      >
        <Text style={styles.button}>{translateUi(language,"Загрузить модель","Load Model")}</Text>
      </TouchableOpacity>
      {projectorKey && <Text style={styles.label}>{projectorKey}</Text>}
      <TouchableOpacity
        onPress={pickProjectorFile}
      >
        <Text style={styles.button}>{translateUi(language,"Загрузить проектор","Load Projector")}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default ModelFileButtons;