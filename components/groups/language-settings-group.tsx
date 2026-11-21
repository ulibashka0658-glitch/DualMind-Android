import { useUiLanguage, type UiLanguage, translateUi } from "@/context/ui-language";
import Dropdown from "@/components/dropdowns/dropdown";
import { useLLM, useSystem } from "@/context";
import { StyleSheet, Text, View } from "react-native";

const items: {label:string;value:UiLanguage}[] = [{label:"Русский",value:"ru"},{label:"English",value:"en"}];
export default function LanguageSettingsGroup() {
 const {colorScheme}=useSystem();
 const {language,setLanguage}=useUiLanguage();
 const llm=useLLM();
 type Mode = "auto" | "ru" | "en" | "off";
 const modes: {label:string;value:Mode}[] = [{label:translateUi(language,"Автоматически","Automatic"),value:"auto"},{label:"Русский",value:"ru"},{label:"English",value:"en"},{label:translateUi(language,"Без инструкции","No instruction"),value:"off"}];
 const stored=llm.parameters.response_language;
 const mode: Mode = stored==="ru" || stored==="en" || stored==="off" ? stored : "auto";
 const styles=StyleSheet.create({row:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:16,paddingVertical:8},label:{color:colorScheme.onSurface,fontSize:16}});
 return <View><View style={styles.row}><Text style={styles.label}>{translateUi(language,"Язык интерфейса","Interface language")}</Text><Dropdown<UiLanguage> items={items} selectedValue={language} onValueChange={setLanguage}/></View>{llm.type==="Llama" && <View style={styles.row}><Text style={styles.label}>{translateUi(language,"Язык ответов","Response language")}</Text>{llm.busy ? <Text style={styles.label}>{modes.find(item=>item.value===mode)?.label}</Text> : <Dropdown<Mode> items={modes} selectedValue={mode} onValueChange={value=>llm.setParameters(prev=>({...prev,response_language:value}))}/>}</View>}</View>;
}
