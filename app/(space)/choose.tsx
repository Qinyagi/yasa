import React, { useCallback, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  loadCurrentSpaceId,
  loadSpaceById,
  loadProfile,
  deleteSpace,
  resetAll,
} from "../../lib/storage";
import { initialsFrom } from "../../services/avatar";
import AvatarImage from "../../components/AvatarImage";
import type { Space, UserProfile } from "../../types";

export default function SpaceChoose() {
  const [loading, setLoading] = useState(true);
  const [space, setSpace] = useState<Space | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const load = useCallback(async (signal: { cancelled: boolean }) => {
    const [prof, spaceId] = await Promise.all([
      loadProfile(),
      loadCurrentSpaceId(),
    ]);
    if (signal.cancelled) return;

    setProfile(prof);

    if (spaceId) {
      const s = await loadSpaceById(spaceId);
      if (!signal.cancelled) setSpace(s);
    } else {
      setSpace(null);
    }

    if (!signal.cancelled) setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const signal = { cancelled: false };
      setLoading(true);
      load(signal);
      return () => {
        signal.cancelled = true;
      };
    }, [load]),
  );

  // ── Derived ──

  const isOwner = !!(space && profile && space.ownerProfileId === profile.id);

  function roleLabel(): string {
    if (!space || !profile) return "";
    if (isOwner) return "Eigentümer";
    if (space.coAdminProfileIds.includes(profile.id)) return "CoAdmin";
    return "Mitglied";
  }

  // ── Delete handlers ──

  function handleResetProfile() {
    Alert.alert(
      "Profil zurücksetzen",
      "Dein Profil und alle Spaces werden gelöscht. Du startest komplett neu.",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Zurücksetzen",
          style: "destructive",
          onPress: async () => {
            await resetAll();
            router.replace("/");
          },
        },
      ],
    );
  }

  function handleDelete() {
    if (!space) return;
    Alert.alert(
      "Space löschen",
      `„${space.name}" wirklich löschen? Das kann nicht rückgängig gemacht werden.`,
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Löschen",
          style: "destructive",
          onPress: async () => {
            await deleteSpace(space.id);
            setSpace(null);
          },
        },
      ],
    );
  }

  // ── Loading ──

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 20, justifyContent: "center", gap: 12 }}>

        {/* ── Profile header ── */}
        {profile && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              marginBottom: 8,
            }}
          >
            <AvatarImage
              uri={profile.avatarUrl}
              initials={initialsFrom(profile.displayName)}
              size={44}
              borderRadius={12}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700" }}>
                {profile.displayName}
              </Text>
              <Text style={{ opacity: 0.5, fontSize: 12 }}>Dein Profil</Text>
            </View>
          </View>
        )}

        <Text style={{ fontSize: 22, fontWeight: "700" }}>Space</Text>

        {/* ── Active Space Card ── */}
        {space ? (
          <>
            <View
              style={{
                padding: 16,
                borderRadius: 14,
                backgroundColor: "#f5f5f5",
                gap: 6,
              }}
            >
              <Text style={{ fontSize: 17, fontWeight: "700" }}>
                {space.name}
              </Text>
              <Text style={{ opacity: 0.6, fontSize: 13 }}>
                {roleLabel()} · erstellt{" "}
                {new Date(space.createdAt).toLocaleDateString("de-DE")}
              </Text>
              {profile && (
                <Text style={{ opacity: 0.5, fontSize: 12 }}>
                  Eigentümer: {profile.displayName}
                </Text>
              )}
            </View>

            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/(space)/qr",
                  params: { spaceId: space.id },
                })
              }
              style={{
                paddingVertical: 14,
                borderRadius: 12,
                backgroundColor: "black",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "white", fontWeight: "600" }}>
                QR anzeigen
              </Text>
            </Pressable>

            {isOwner && (
              <Pressable
                onPress={handleDelete}
                style={{
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#c00", fontWeight: "600", fontSize: 14 }}>
                  Space löschen
                </Text>
              </Pressable>
            )}
          </>
        ) : (
          <Text style={{ opacity: 0.8 }}>
            Als nächstes: Space erstellen oder per QR beitreten.
          </Text>
        )}

        <View style={{ height: 12 }} />

        {/* ── Actions ── */}
        <Pressable
          onPress={() => router.push("/(space)/create")}
          style={{
            paddingVertical: 14,
            borderRadius: 12,
            backgroundColor: space ? "white" : "black",
            borderWidth: space ? 1 : 0,
            borderColor: "#ddd",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: space ? "black" : "white",
              fontWeight: "600",
            }}
          >
            {space ? "Neuen Space erstellen" : "Space erstellen"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {}}
          style={{
            paddingVertical: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#ddd",
            alignItems: "center",
          }}
        >
          <Text style={{ fontWeight: "600" }}>Per QR beitreten</Text>
        </Pressable>

        {/* ── Dev: Reset ── */}
        {profile && (
          <Pressable
            onPress={handleResetProfile}
            style={{
              marginTop: 16,
              paddingVertical: 10,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#999", fontSize: 13 }}>
              Profil zurücksetzen
            </Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}
