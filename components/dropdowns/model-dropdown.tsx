import { useUiLanguage, translateUi } from "@/context/ui-language";
import Dropdown from "@/components/dropdowns/dropdown";
import { useLLM, useSystem } from "@/context";
import { StyleSheet, Text, View } from "react-native";

function ModelDropdown({ small }: { small?: boolean }) {
  const { type, models, model, setModel } = useLLM();
  const { colorScheme } = useSystem();
  const { language } = useUiLanguage();

  if (!models || models.length === 0 || !setModel) {
    return null;
  }

  const items = models!.map((model) => {
    return {
      label: model,
      value: model
    }
  });

  if (small) {
    return (
      <Dropdown
        items={items}
        selectedValue={model ?? translateUi(language,"Выберите модель","Select Model")}
        onValueChange={setModel!}
      />
    );
  }

  const styles = StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
    },
    title: {
      color: colorScheme.onSurface,
      fontSize: 16
    }
  });
  
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{type} {translateUi(language,"модель","Model")}</Text>
      <Dropdown
        items={items}
        selectedValue={model ?? "Select Model"}
        onValueChange={setModel!}
      />
    </View>
  );
}

export default ModelDropdown;