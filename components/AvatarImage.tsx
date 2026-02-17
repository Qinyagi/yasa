import React, { useState } from "react";
import { Image, View, Text } from "react-native";

type Props = {
  uri: string;
  initials: string;
  size: number;
  borderRadius?: number;
};

/**
 * Displays a remote avatar image. Falls back to a coloured
 * initials circle if the image fails to load (offline / 4xx).
 */
export default function AvatarImage({
  uri,
  initials,
  size,
  borderRadius,
}: Props) {
  const [failed, setFailed] = useState(false);
  const radius = borderRadius ?? Math.round(size * 0.25);

  if (failed) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: "#4a4a4a",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color: "white",
            fontSize: size * 0.38,
            fontWeight: "700",
          }}
        >
          {initials}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      onError={() => setFailed(true)}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: "#f2f2f2",
      }}
    />
  );
}
