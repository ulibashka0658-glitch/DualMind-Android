import { useUiLanguage, translateUi } from "@/context/ui-language";
import { useSystem } from "@/context";
import * as ImagePicker from 'expo-image-picker';
import { ImagePickerAsset } from "expo-image-picker";
import { Dispatch, SetStateAction } from "react";
import { Alert } from "react-native";
import { MaterialIconButton } from "./icon-button";

interface PromptImageButtonProps {
  setImages: Dispatch<SetStateAction<Array<ImagePickerAsset>>>;
};

function PromptImageButton({ setImages }: PromptImageButtonProps) {
  const { colorScheme } = useSystem();
  const { language } = useUiLanguage();

  const onImagePress = async () => {
    try {

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      // Reduce JPEG encoding size for inference attachments; original gallery files are unchanged.
      quality: 0.8,
      base64: true,
    });

    if (!pickerResult.canceled) {
      setImages(images => [ ...images || [], ...pickerResult.assets ]);
    }
    } catch {
      Alert.alert(
        translateUi(language, "Не удалось открыть галерею", "Unable to open gallery"),
        translateUi(language, "Повторите попытку или проверьте разрешения приложения.", "Try again or check the app permissions."),
      );
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