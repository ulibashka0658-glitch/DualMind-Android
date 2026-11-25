import { useUiLanguage, translateUi } from "@/context/ui-language";
import { useSystem } from "@/context";
import * as ImagePicker from 'expo-image-picker';
import { ImagePickerAsset } from "expo-image-picker";
import { Dispatch, SetStateAction, useRef } from "react";
import { Alert } from "react-native";
import { MaterialIconButton } from "./icon-button";

interface PromptImageButtonProps {
  setImages: Dispatch<SetStateAction<Array<ImagePickerAsset>>>;
};

function PromptImageButton({ setImages }: PromptImageButtonProps) {
  const { colorScheme } = useSystem();
  const { language } = useUiLanguage();

  const picking = useRef(false);
  const onImagePress = async () => {
    if (picking.current) return;
    picking.current = true;
    try {

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      // Reduce JPEG encoding size for inference attachments; original gallery files are unchanged.
      quality: 0.8,
      base64: true,
    });

    if (!pickerResult.canceled) {
      const assets = pickerResult.assets;
      if (assets.some(asset => !asset.base64 || asset.base64.length > 8 * 1024 * 1024)) {
        Alert.alert(translateUi(language, "Слишком большое или недоступное изображение", "Image too large or unavailable"),
          translateUi(language, "Выберите изображение меньшего размера (до 6 МиБ после кодирования JPEG).", "Choose a smaller image (up to 6 MiB after JPEG encoding)."));
        return;
      }
      setImages(images => [ ...images || [], ...assets ]);
    }
    } catch {
      Alert.alert(
        translateUi(language, "Не удалось открыть галерею", "Unable to open gallery"),
        translateUi(language, "Повторите попытку или проверьте разрешения приложения.", "Try again or check the app permissions."),
      );
    } finally {
      picking.current = false;
    }
  };

  return (
    <MaterialIconButton
      icon="image"
      size={28}
      color={colorScheme.primary}
      onPress={onImagePress}
    />
  );
};

export default PromptImageButton;