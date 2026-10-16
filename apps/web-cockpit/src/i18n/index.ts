import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import ro from "../locales/ro.json";
import en from "../locales/en.json";
import es from "../locales/es.json";
import pt from "../locales/pt.json";
import fr from "../locales/fr.json";

export const SUPPORTED_LANGS = ["ro", "en", "es", "pt", "fr"] as const;
export type AppLang = (typeof SUPPORTED_LANGS)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ro: { translation: ro },
      en: { translation: en },
      es: { translation: es },
      pt: { translation: pt },
      fr: { translation: fr },
    },
    fallbackLng: "ro",
    supportedLngs: [...SUPPORTED_LANGS],
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
    },
  });

export default i18n;
