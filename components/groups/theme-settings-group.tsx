import { useUiLanguage, translateUi } from "@/context/ui-language";
import Dropdown from "@/components/dropdowns/dropdown";
import { useSystem } from "@/context";
import { ThemeMode } from "@/hooks/use-theme";
import { StyleSheet, Text, View } from "react-native";
import ColorPicker, { HueSlider } from "reanimated-color-picker";


function ThemeSettingsGroup() {
  const { colorScheme, accentColor, setAccentColor, themeMode, setThemeMode } = useSystem();
  const { language } = useUiLanguage();
  const themeModeItems: { label: string; value: ThemeMode }[] = [
    { label: translateUi(language, "Системная", "System"), value: "system" },
    { label: translateUi(language, "Светлая", "Light"), value: "light" },
    { label: translateUi(language, "Тёмная", "Dark"), value: "dark" },
  ];

  const styles = StyleSheet.create({
    view: {
      alignItems: "center",
      justifyContent: "flex-start",
      gap: 16,
      paddingHorizontal: 16
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
    },
    label: {
      color: colorScheme.onSurface,
      fontSize: 16
    },
    title: {
      color: colorScheme.onSurface,
      fontSize: 16,
      fontWeight: "bold"
    },
    colorPicker: {
      width: "100%",
    }
  });

  return (
    <View style={styles.view}>
      <View style={styles.row}>
        <Text style={styles.label}>{translateUi(language, "Тема", "Theme")}</Text>
        <Dropdown<ThemeMode>
          items={themeModeItems}
          selectedValue={themeMode}
          onValueChange={setThemeMode}
        />
      </View>
      <Text style={styles.title}>{translateUi(language, "Акцентный цвет", "Accent Color")}</Text>
      <ColorPicker
        style={styles.colorPicker}
        value={accentColor}
        onCompleteJS={(color) => setAccentColor(color.hex)}
      >
        <HueSlider />
      </ColorPicker>  
    </View>
  );
}

export default ThemeSettingsGroup;