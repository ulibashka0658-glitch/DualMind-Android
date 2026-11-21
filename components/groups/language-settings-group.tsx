import { useUiLanguage, type UiLanguage, translateUi } from "@/context/ui-language";
import Dropdown from "@/components/dropdowns/dropdown";
import { useSystem } from "@/context";
import { StyleSheet, Text, View } from "react-native";

const items: {label:string;value:UiLanguage}[] = [{label:"Русский",value:"ru"},{label:"English",value:"en"}];
export default function LanguageSettingsGroup() {
 const {colorScheme}=useSystem();
 const {language,setLanguage}=useUiLanguage();
 const styles=StyleSheet.create({row:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:16,paddingVertical:8},label:{color:colorScheme.onSurface,fontSize:16}});
 return <View style={styles.row}><Text style={styles.label}>{translateUi(language,"Язык интерфейса","Interface language")}</Text><Dropdown<UiLanguage> items={items} selectedValue={language} onValueChange={setLanguage}/></View>;
}
