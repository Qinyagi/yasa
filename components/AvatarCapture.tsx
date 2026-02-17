import React, { useRef, useCallback, useState } from "react";
import { View } from "react-native";
import { SvgXml } from "react-native-svg";
import { captureRef } from "react-native-view-shot";

const CAPTURE_SIZE = 200;

type CaptureHandle = {
  viewRef: React.RefObject<View | null>;
  svgXml: string | null;
  setSvgXml: (xml: string | null) => void;
  capture: () => Promise<string | null>;
};

/**
 * Hook that pairs with <AvatarCaptureTarget>.
 * Call `setSvgXml(xml)` to load an SVG, then `capture()` to get a
 * data:image/png;base64,… string.
 */
export function useAvatarCapture(): CaptureHandle {
  const viewRef = useRef<View | null>(null);
  const [svgXml, setSvgXml] = useState<string | null>(null);

  const capture = useCallback(async (): Promise<string | null> => {
    if (!viewRef.current || !svgXml) return null;
    try {
      // Small delay so the SVG is fully rendered after state update
      await new Promise((r) => setTimeout(r, 100));
      const base64 = await captureRef(viewRef, {
        format: "png",
        quality: 1,
        result: "base64",
      });
      return `data:image/png;base64,${base64.replace(/\n/g, "")}`;
    } catch {
      return null;
    }
  }, [svgXml]);

  return { viewRef, svgXml, setSvgXml, capture };
}

/**
 * Hidden off-screen target that renders the SVG for capture.
 * Mount this once in the screen's tree.
 */
export function AvatarCaptureTarget({
  viewRef,
  svgXml,
}: {
  viewRef: React.RefObject<View | null>;
  svgXml: string | null;
}) {
  if (!svgXml) return null;

  return (
    <View
      ref={viewRef}
      collapsable={false}
      style={{
        position: "absolute",
        left: -9999,
        width: CAPTURE_SIZE,
        height: CAPTURE_SIZE,
        backgroundColor: "white",
      }}
    >
      <SvgXml xml={svgXml} width={CAPTURE_SIZE} height={CAPTURE_SIZE} />
    </View>
  );
}
