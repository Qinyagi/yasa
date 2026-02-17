import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SvgXml } from "react-native-svg";
import { router } from "expo-router";
import { generateFantasyOptions, pickFantasyLastName } from "../../services/nameGenerator";
import { fetchAvatarSvg, initialsFrom } from "../../services/avatar";
import { useAvatarCapture, AvatarCaptureTarget } from "../../components/AvatarCapture";
import { saveProfile } from "../../lib/storage";
import type { UserProfile } from "../../types";

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Nickname validation ──

const NICKNAME_RE = /^[a-zA-ZäöüÄÖÜß0-9 ]+$/;
const BLOCKED_RE = /[@/\\:]|https?|www\.|\.com|\.de|\+?\d{6,}/;

function isNicknameValid(raw: string): boolean {
  const v = raw.trim();
  if (v.length < 3 || v.length > 20) return false;
  if (!NICKNAME_RE.test(v)) return false;
  if (BLOCKED_RE.test(v)) return false;
  return true;
}

// ── Modes ──

type Mode = "generator" | "nickname";

type Option = { displayName: string; seed: string; svg: string | null };

export default function CreateProfile() {
  const [mode, setMode] = useState<Mode>("generator");
  const [saving, setSaving] = useState(false);

  // ── Generator state ──
  const [firstPref, setFirstPref] = useState("");
  const [lastPref, setLastPref] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [loadingSvgs, setLoadingSvgs] = useState(false);
  const [selected, setSelected] = useState<Option | null>(null);

  // ── Nickname state ──
  const [nickname, setNickname] = useState("");
  const [fantasyLast, setFantasyLast] = useState(() => pickFantasyLastName());
  const [nicknameSvg, setNicknameSvg] = useState<string | null>(null);

  // ── Capture hook (for the selected avatar → PNG) ──
  const captureHandle = useAvatarCapture();

  // ── Derived ──
  const canGenerate = useMemo(
    () => firstPref.trim().length >= 2 && lastPref.trim().length >= 2,
    [firstPref, lastPref],
  );

  const nicknameValid = useMemo(() => isNicknameValid(nickname), [nickname]);

  const nicknameDisplayName = useMemo(
    () => `${nickname.trim()} ${fantasyLast}`,
    [nickname, fantasyLast],
  );

  const nicknameSeed = useMemo(
    () => nicknameDisplayName.replace(/\s+/g, "-").toLowerCase(),
    [nicknameDisplayName],
  );

  // ── Fetch nickname SVG when seed changes ──
  useEffect(() => {
    if (!nicknameValid) {
      setNicknameSvg(null);
      return;
    }
    let cancelled = false;
    fetchAvatarSvg(nicknameSeed).then((svg) => {
      if (!cancelled) setNicknameSvg(svg);
    });
    return () => { cancelled = true; };
  }, [nicknameSeed, nicknameValid]);

  // ── Actions ──

  const generate = useCallback(async () => {
    const raw = generateFantasyOptions(firstPref, lastPref, 5);
    if (raw.length === 0) {
      Alert.alert("Bitte prüfen", "Gib je 2–3 Buchstaben für Vor- und Nachnamen ein.");
      return;
    }
    setSelected(null);
    setLoadingSvgs(true);

    const withSvg: Option[] = await Promise.all(
      raw.map(async (r) => ({
        ...r,
        svg: await fetchAvatarSvg(r.seed),
      })),
    );

    setOptions(withSvg);
    setLoadingSvgs(false);
  }, [firstPref, lastPref]);

  function randomizeLast() {
    setFantasyLast(pickFantasyLastName());
  }

  async function chooseAndContinue(opt: Option) {
    if (saving) return;
    setSaving(true);

    // Load SVG into the offscreen capture target
    captureHandle.setSvgXml(opt.svg);

    // Wait a tick for render, then capture
    await new Promise((r) => setTimeout(r, 200));
    const pngDataUri = await captureHandle.capture();

    const profile: UserProfile = {
      id: uuid(),
      displayName: opt.displayName,
      avatarUrl: pngDataUri ?? "",
      createdAt: new Date().toISOString(),
    };
    await saveProfile(profile);
    setSaving(false);
    router.replace("/(space)/choose");
  }

  // ── Inline SVG avatar preview (56×56) ──

  function AvatarPreview({ svg, name }: { svg: string | null; name: string }) {
    if (svg) {
      return (
        <View style={{ width: 56, height: 56, borderRadius: 14, overflow: "hidden", backgroundColor: "#f2f2f2" }}>
          <SvgXml xml={svg} width={56} height={56} />
        </View>
      );
    }
    // Initials fallback
    return (
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          backgroundColor: "#4a4a4a",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "white", fontSize: 21, fontWeight: "700" }}>
          {initialsFrom(name)}
        </Text>
      </View>
    );
  }

  // ── Segment control ──

  function Segment() {
    return (
      <View
        style={{
          flexDirection: "row",
          borderRadius: 10,
          backgroundColor: "#f0f0f0",
          padding: 3,
        }}
      >
        {(["generator", "nickname"] as const).map((m) => {
          const active = mode === m;
          return (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 8,
                backgroundColor: active ? "white" : "transparent",
                alignItems: "center",
              }}
            >
              <Text style={{ fontWeight: active ? "700" : "500", fontSize: 14 }}>
                {m === "generator" ? "Generator" : "Nickname"}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  // ── Render ──

  return (
    <SafeAreaView style={{ flex: 1 }}>
      {/* Offscreen capture target */}
      <AvatarCaptureTarget viewRef={captureHandle.viewRef} svgXml={captureHandle.svgXml} />

      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: "700" }}>ID-Profil erstellen</Text>

        <Segment />

        {/* ════════════ GENERATOR MODE ════════════ */}
        {mode === "generator" && (
          <>
            <Text style={{ opacity: 0.8 }}>
              Gib nur 2–3 Buchstaben ein. Keine echten Namen. Danach wählst du Fantasiename + Avatar.
            </Text>

            <View style={{ height: 8 }} />

            <Text style={{ fontWeight: "600" }}>Vorname (2–3 Buchstaben)</Text>
            <TextInput
              value={firstPref}
              onChangeText={setFirstPref}
              placeholder="z.B. Th oder Tho"
              autoCapitalize="none"
              style={inputStyle}
            />

            <Text style={{ fontWeight: "600" }}>Nachname (2–3 Buchstaben)</Text>
            <TextInput
              value={lastPref}
              onChangeText={setLastPref}
              placeholder="z.B. Mü oder Mue"
              autoCapitalize="none"
              style={inputStyle}
            />

            <Pressable
              onPress={generate}
              disabled={!canGenerate || loadingSvgs}
              style={{
                marginTop: 6,
                paddingVertical: 14,
                borderRadius: 12,
                backgroundColor: canGenerate && !loadingSvgs ? "black" : "#aaa",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "white", fontWeight: "600" }}>
                {loadingSvgs ? "Laden …" : "Vorschläge generieren"}
              </Text>
            </Pressable>

            {options.length > 0 && (
              <>
                <View style={{ height: 8 }} />
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 16, fontWeight: "700" }}>Deine Vorschläge</Text>
                  <Pressable onPress={generate}>
                    <Text style={{ fontWeight: "700" }}>Randomize ↻</Text>
                  </Pressable>
                </View>

                <View style={{ gap: 10 }}>
                  {options.map((opt) => {
                    const isSel = selected?.seed === opt.seed;
                    return (
                      <Pressable
                        key={opt.seed}
                        onPress={() => setSelected(opt)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                          padding: 12,
                          borderRadius: 14,
                          borderWidth: 2,
                          borderColor: isSel ? "black" : "#eee",
                          backgroundColor: "white",
                        }}
                      >
                        <AvatarPreview svg={opt.svg} name={opt.displayName} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 16, fontWeight: "700" }}>{opt.displayName}</Text>
                          <Text style={{ opacity: 0.7, marginTop: 2 }}>Tippe zum Auswählen</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>

                {selected && (
                  <Pressable
                    onPress={() => chooseAndContinue(selected)}
                    disabled={saving}
                    style={[confirmButtonStyle, saving && { backgroundColor: "#aaa" }]}
                  >
                    {saving ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text style={{ color: "white", fontWeight: "700" }}>Dieses ID-Profil verwenden</Text>
                    )}
                  </Pressable>
                )}
              </>
            )}
          </>
        )}

        {/* ════════════ NICKNAME MODE ════════════ */}
        {mode === "nickname" && (
          <>
            <Text style={{ opacity: 0.8 }}>
              Wähle einen Nickname (kein echter Name). Ein Fantasy-Nachname wird ergänzt.
            </Text>

            <View style={{ height: 8 }} />

            <Text style={{ fontWeight: "600" }}>Nickname (3–20 Zeichen)</Text>
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              placeholder="z.B. Sparky oder Turbo"
              autoCapitalize="none"
              maxLength={20}
              style={inputStyle}
            />

            {nickname.trim().length > 0 && !nicknameValid && (
              <Text style={{ color: "#c00", fontSize: 12 }}>
                Nur Buchstaben, Zahlen und Leerzeichen (3–20). Keine @, URLs oder Telefonnummern.
              </Text>
            )}

            {nicknameValid && (
              <>
                <View style={{ height: 8 }} />
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 16, fontWeight: "700" }}>Dein Profil</Text>
                  <Pressable onPress={randomizeLast}>
                    <Text style={{ fontWeight: "700" }}>Nachname ↻</Text>
                  </Pressable>
                </View>

                <Pressable
                  onPress={() =>
                    setSelected({
                      displayName: nicknameDisplayName,
                      seed: nicknameSeed,
                      svg: nicknameSvg,
                    })
                  }
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    padding: 12,
                    borderRadius: 14,
                    borderWidth: 2,
                    borderColor: selected?.seed === nicknameSeed ? "black" : "#eee",
                    backgroundColor: "white",
                  }}
                >
                  <AvatarPreview svg={nicknameSvg} name={nicknameDisplayName} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700" }}>
                      {nicknameDisplayName}
                    </Text>
                    <Text style={{ opacity: 0.7, marginTop: 2 }}>Tippe zum Auswählen</Text>
                  </View>
                </Pressable>

                {selected?.seed === nicknameSeed && (
                  <Pressable
                    onPress={() =>
                      chooseAndContinue({
                        displayName: nicknameDisplayName,
                        seed: nicknameSeed,
                        svg: nicknameSvg,
                      })
                    }
                    disabled={saving}
                    style={[confirmButtonStyle, saving && { backgroundColor: "#aaa" }]}
                  >
                    {saving ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text style={{ color: "white", fontWeight: "700" }}>Dieses ID-Profil verwenden</Text>
                    )}
                  </Pressable>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Shared styles ──

const inputStyle = {
  borderWidth: 1,
  borderColor: "#ddd",
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 12,
} as const;

const confirmButtonStyle = {
  marginTop: 12,
  paddingVertical: 14,
  borderRadius: 12,
  backgroundColor: "black",
  alignItems: "center",
} as const;
