import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

export type UiLanguage = "ru" | "en";
const KEY = "dualmind.ui.language";
const LanguageContext = createContext<{ language: UiLanguage; setLanguage: (value: UiLanguage) => void }>({language:"ru",setLanguage:()=>{}});
export function UiLanguageProvider({children}:{children:React.ReactNode}) {
  const [language, setState] = useState<UiLanguage>("ru");
  useEffect(() => { AsyncStorage.getItem(KEY).then(value => { if(value==="ru" || value==="en") setState(value); }).catch(()=>{}); }, []);
  const setLanguage = (value: UiLanguage) => {setState(value); AsyncStorage.setItem(KEY,value).catch(()=>{});};
  return <LanguageContext.Provider value={{language,setLanguage}}>{children}</LanguageContext.Provider>;
}
export const useUiLanguage = () => useContext(LanguageContext);
export const translateUi = (language: UiLanguage, ru: string, en: string) => language === "ru" ? ru : en;
