import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import ro from "./ro.json";
import en from "./en.json";
import es from "./es.json";
import pt from "./pt.json";
import fr from "./fr.json";

export const SUPPORTED_LANGS = ["ro", "en", "es", "pt", "fr"] as const;
export type AppLang = (typeof SUPPORTED_LANGS)[number];

const deviceLang = (Localization.getLocales()?.[0]?.languageCode ?? "ro").slice(0, 2);
const initial = (SUPPORTED_LANGS as readonly string[]).includes(deviceLang)
  ? (deviceLang as AppLang)
  : "ro";

void i18n.use(initReactI18next).init({
  resources: {
    ro: { translation: ro },
    en: { translation: en },
    es: { translation: es },
    pt: { translation: pt },
    fr: { translation: fr },
  },
  lng: initial,
  fallbackLng: "ro",
  supportedLngs: [...SUPPORTED_LANGS],
  interpolation: { escapeValue: false },
});

export default i18n;
