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

  const onImagePress = async () => {
    try {

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
      base64: true,
    });

    if (!pickerResult.canceled) {
      setImages(images => [ ...images || [], ...pickerResult.assets ]);
    }
    } catch {
      Alert.alert("Не удалось открыть галерею", "Повторите попытку или проверьте разрешения приложения.");
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