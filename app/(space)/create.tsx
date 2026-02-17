import React, { useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
} from "react-native";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import { createInviteToken } from "../../services/inviteToken";
import { saveSpace, saveCurrentSpaceId, loadProfile } from "../../lib/storage";
import type { Space } from "../../types";

export default function SpaceCreate() {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const canCreate = useMemo(() => name.trim().length >= 2, [name]);

  async function handleCreate() {
    if (!canCreate || saving) return;
    setSaving(true);

    try {
      const profile = await loadProfile();
      if (!profile) {
        Alert.alert("Fehler", "Kein Profil gefunden. Bitte zuerst ein Profil erstellen.");
        setSaving(false);
        return;
      }

      const space: Space = {
        id: Crypto.randomUUID(),
        name: name.trim(),
        createdAt: new Date().toISOString(),
        ownerProfileId: profile.id,
        coAdminProfileIds: [],
        inviteToken: createInviteToken(),
      };

      await saveSpace(space);
      await saveCurrentSpaceId(space.id);

      setSaving(false);
      router.replace({ pathname: "/(space)/qr", params: { spaceId: space.id } });
    } catch {
      Alert.alert("Fehler", "Space konnte nicht erstellt werden.");
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 20, justifyContent: "center", gap: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: "700" }}>Space erstellen</Text>
        <Text style={{ opacity: 0.8 }}>
          Gib deinem Space einen Namen, z.B. „Station A" oder „Team 3".
        </Text>

        <View style={{ height: 8 }} />

        <Text style={{ fontWeight: "600" }}>Space-Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="z.B. Station A / Team 3"
          autoCapitalize="words"
          maxLength={60}
          style={{
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 12,
          }}
        />

        <Pressable
          onPress={handleCreate}
          disabled={!canCreate || saving}
          style={{
            marginTop: 6,
            paddingVertical: 14,
            borderRadius: 12,
            backgroundColor: canCreate && !saving ? "black" : "#aaa",
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>
            {saving ? "Wird erstellt …" : "Space erstellen"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
