import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { loadSpaceById, loadProfile } from "../../lib/storage";
import { encodeInvitePayload } from "../../services/inviteToken";
import { initialsFrom } from "../../services/avatar";
import AvatarImage from "../../components/AvatarImage";
import type { Space, UserProfile } from "../../types";

export default function SpaceQR() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const [space, setSpace] = useState<Space | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!spaceId) return;
    let cancelled = false;

    Promise.all([loadSpaceById(spaceId), loadProfile()]).then(([s, p]) => {
      if (cancelled) return;
      setSpace(s);
      setProfile(p);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  if (!space) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>Space nicht gefunden.</Text>
      </SafeAreaView>
    );
  }

  const payload = encodeInvitePayload({
    spaceId: space.id,
    token: space.inviteToken,
  });

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View
        style={{
          flex: 1,
          padding: 20,
          justifyContent: "center",
          alignItems: "center",
          gap: 16,
        }}
      >
        {/* ── Profile badge ── */}
        {profile && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <AvatarImage
              uri={profile.avatarUrl}
              initials={initialsFrom(profile.displayName)}
              size={36}
              borderRadius={10}
            />
            <Text style={{ fontSize: 14, fontWeight: "600" }}>
              {profile.displayName}
            </Text>
          </View>
        )}

        <Text style={{ fontSize: 22, fontWeight: "700" }}>Einladung</Text>
        <Text style={{ opacity: 0.8, textAlign: "center" }}>
          Zeige diesen QR-Code anderen Personen,{"\n"}damit sie „{space.name}"
          beitreten können.
        </Text>

        <View
          style={{
            marginTop: 12,
            padding: 20,
            backgroundColor: "white",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#eee",
          }}
        >
          <QRCode value={payload} size={220} />
        </View>

        <Text style={{ opacity: 0.5, fontSize: 12, textAlign: "center", marginTop: 8 }}>
          Nur in der App sichtbar – nicht teilbar.
        </Text>

        <Pressable
          onPress={() => router.back()}
          style={{
            marginTop: 20,
            paddingVertical: 14,
            paddingHorizontal: 40,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#ddd",
            alignItems: "center",
          }}
        >
          <Text style={{ fontWeight: "600" }}>Fertig</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
