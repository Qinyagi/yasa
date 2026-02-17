import React, { useEffect, useState } from "react";
import { SafeAreaView, View, Text, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { loadProfile } from "../lib/storage";

export default function Index() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    loadProfile().then((profile) => {
      if (cancelled) return;
      if (profile) {
        router.replace("/(space)/choose");
      } else {
        setChecking(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (checking) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 20, justifyContent: "center", gap: 16 }}>
        <Text style={{ fontSize: 28, fontWeight: "700" }}>YASA</Text>
        <Text style={{ fontSize: 16, opacity: 0.8 }}>Dein Schichtbegleiter.</Text>

        <View style={{ height: 16 }} />

        <Pressable
          onPress={() => router.push("/(auth)/create-profile")}
          style={{
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 12,
            backgroundColor: "black",
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
            ID-Profil erstellen
          </Text>
        </Pressable>

        <Text style={{ marginTop: 24, fontSize: 12, opacity: 0.7 }}>
          Keine echten Namen. Keine E-Mail. Closed Circle via QR vor Ort.
        </Text>
      </View>
    </SafeAreaView>
  );
}
