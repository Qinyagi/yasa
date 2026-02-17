import React from "react";
import { SafeAreaView, View, Text, Pressable } from "react-native";

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 20, justifyContent: "center", gap: 16 }}>
        <Text style={{ fontSize: 28, fontWeight: "700" }}>
          YASA
        </Text>
        <Text style={{ fontSize: 16, opacity: 0.8 }}>
          Dein Schichtbegleiter.
        </Text>

        <View style={{ height: 16 }} />

        <Pressable
          onPress={() => {}}
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

        <Pressable
          onPress={() => {}}
          style={{
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#ddd",
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "600" }}>
            Ich habe schon ein Profil
          </Text>
        </Pressable>

        <Text style={{ marginTop: 24, fontSize: 12, opacity: 0.7 }}>
          Keine echten Namen. Keine E-Mail. Closed Circle via QR vor Ort.
        </Text>
      </View>
    </SafeAreaView>
  );
}
