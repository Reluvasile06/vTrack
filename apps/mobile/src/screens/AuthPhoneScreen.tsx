import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { supabase } from "../services/supabase";

type Props = { onGoProfile: () => void };

export default function AuthPhoneScreen({ onGoProfile }: Props) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sendOtp() {
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) setMessage(error.message);
    else {
      setSent(true);
      setMessage("OTP sent (Twilio must be configured in Supabase Auth).");
    }
  }

  async function verifyOtp() {
    setMessage(null);
    const { error } = await supabase.auth.verifyOtp({ phone, token: otp, type: "sms" });
    if (error) setMessage(error.message);
    else setMessage("Signed in");
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.brand}>vTrack</Text>
      <Text style={styles.title}>{t("auth.title")}</Text>
      <Text style={styles.label}>{t("auth.phone")}</Text>
      <TextInput
        style={styles.input}
        keyboardType="phone-pad"
        autoComplete="tel"
        placeholder="+40..."
        placeholderTextColor="#64748b"
        value={phone}
        onChangeText={setPhone}
      />
      <Pressable style={styles.btn} onPress={() => void sendOtp()}>
        <Text style={styles.btnText}>{t("auth.sendOtp")}</Text>
      </Pressable>
      {sent && (
        <>
          <Text style={styles.label}>{t("auth.otp")}</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={otp}
            onChangeText={setOtp}
            placeholderTextColor="#64748b"
          />
          <Pressable style={styles.btn} onPress={() => void verifyOtp()}>
            <Text style={styles.btnText}>{t("auth.verify")}</Text>
          </Pressable>
        </>
      )}
      <Pressable onPress={onGoProfile}>
        <Text style={styles.link}>{t("profile.title")}</Text>
      </Pressable>
      {message ? <Text style={styles.msg}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  brand: { color: "#fff", fontSize: 28, fontWeight: "700" },
  title: { color: "#94a3b8", marginBottom: 12 },
  label: { color: "#64748b", fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: "#2A364F",
    backgroundColor: "#151C28",
    color: "#e2e8f0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  btn: {
    backgroundColor: "#3B82F6",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "600" },
  link: { color: "#3B82F6", marginTop: 16 },
  msg: { color: "#94a3b8", marginTop: 8 },
});
