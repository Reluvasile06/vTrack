import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet, View } from "react-native";
import "./src/i18n";
import AuthPhoneScreen from "./src/screens/AuthPhoneScreen";
import ProfileLanguageScreen from "./src/screens/ProfileLanguageScreen";
import { useState } from "react";

export default function App() {
  const [tab, setTab] = useState<"auth" | "profile">("auth");
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.body}>
        {tab === "auth" ? (
          <AuthPhoneScreen onGoProfile={() => setTab("profile")} />
        ) : (
          <ProfileLanguageScreen onBack={() => setTab("auth")} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B0F17" },
  body: { flex: 1, padding: 20 },
});
