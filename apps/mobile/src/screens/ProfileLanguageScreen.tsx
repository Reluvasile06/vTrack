import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGS, type AppLang } from "../i18n";
import { supabase } from "../services/supabase";

type Props = { onBack: () => void };

export default function ProfileLanguageScreen({ onBack }: Props) {
  const { t, i18n } = useTranslation();
  const [lang, setLang] = useState<AppLang>((i18n.language as AppLang) || "ro");
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    await i18n.changeLanguage(lang);
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) {
      setMessage("Language applied locally (sign in to persist).");
      return;
    }
    const { error } = await supabase.from("profiles").update({ preferred_language: lang }).eq("id", uid);
    setMessage(error ? error.message : "preferred_language saved");
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t("profile.title")}</Text>
      <Text style={styles.label}>{t("profile.language")}</Text>
      <View style={styles.row}>
        {SUPPORTED_LANGS.map((code) => (
          <Pressable
            key={code}
            onPress={() => setLang(code)}
            style={[styles.chip, lang === code && styles.chipOn]}
          >
            <Text style={styles.chipText}>{code.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.btn} onPress={() => void save()}>
        <Text style={styles.btnText}>{t("profile.saveLanguage")}</Text>
      </Pressable>
      <Pressable onPress={onBack}>
        <Text style={styles.link}>← Auth</Text>
      </Pressable>
      {message ? <Text style={styles.msg}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  title: { color: "#fff", fontSize: 22, fontWeight: "600" },
  label: { color: "#64748b" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#2A364F",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: "#3B82F6", borderColor: "#3B82F6" },
  chipText: { color: "#e2e8f0", fontWeight: "600" },
  btn: {
    backgroundColor: "#3B82F6",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "600" },
  link: { color: "#3B82F6" },
  msg: { color: "#94a3b8" },
});
