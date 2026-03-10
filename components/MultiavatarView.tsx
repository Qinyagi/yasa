/**
 * MultiavatarView (Iteration 8 / BUG-004 Fix)
 *
 * Rendert Multiavatar-Avatare vollständig offline und ohne externe API.
 *
 * Strategie:
 *   1. Primär: SvgXml aus react-native-svg → rendert lokal generierten SVG-String
 *   2. Fallback: <Image> mit PNG-URL (api.multiavatar.com/<seed>.png)
 *      – nur aktiv wenn SVG-String leer oder seed fehlt
 *   3. Letzter Fallback: Initialen-Platzhalter (grauer Kreis)
 *
 * Props:
 *   seed   – Avatar-Seed (displayName oder profileId) für lokale Generierung
 *   uri    – (legacy) alte SVG-URL aus AsyncStorage; Seed wird extrahiert
 *   size   – Breite & Höhe in px (default: 48)
 *
 * Rückwärtskompatibilität:
 *   Alle bestehenden Aufrufe mit `uri=` funktionieren weiterhin –
 *   der Seed wird automatisch aus der Legacy-URL extrahiert.
 */
import { useState } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  buildMultiavatarSvg,
  buildMultiavatarPngUrl,
  extractSeedFromLegacyUrl,
} from '../services/multiavatar';

interface Props {
  /** Seed für lokale SVG-Generierung (bevorzugt) */
  seed?: string;
  /**
   * Legacy: alte avatarUrl aus AsyncStorage (https://api.multiavatar.com/…svg).
   * Seed wird automatisch extrahiert. Wird ignoriert wenn `seed` gesetzt ist.
   */
  uri?: string;
  /** Größe in px, default 48 */
  size?: number;
}

export function MultiavatarView({ seed, uri, size = 48 }: Props) {
  const [pngFailed, setPngFailed] = useState(false);

  // ── Effektiven Seed bestimmen ─────────────────────────────────────────────
  // Priorität: seed-Prop > aus Legacy-URI extrahiert > URI direkt als Seed
  const effectiveSeed: string = (() => {
    if (seed) return seed;
    if (uri) {
      const extracted = extractSeedFromLegacyUrl(uri);
      if (extracted) return extracted;
      // Falls kein Legacy-Format: URI direkt als Seed verwenden
      return uri;
    }
    return '';
  })();

  // ── SVG lokal generieren ──────────────────────────────────────────────────
  const svgString = effectiveSeed ? buildMultiavatarSvg(effectiveSeed) : '';
  const hasSvg = svgString.length > 0;

  // ── PNG-Fallback-URL ──────────────────────────────────────────────────────
  const pngUrl = effectiveSeed ? buildMultiavatarPngUrl(effectiveSeed) : '';

  const wrapperStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  // ── 1. Primär: SVG lokal ──────────────────────────────────────────────────
  if (hasSvg) {
    return (
      <View style={[styles.wrapper, wrapperStyle]}>
        <SvgXml
          xml={svgString}
          width={size}
          height={size}
        />
      </View>
    );
  }

  // ── 2. Fallback: PNG via API ──────────────────────────────────────────────
  if (pngUrl && !pngFailed) {
    return (
      <View style={[styles.wrapper, wrapperStyle]}>
        <Image
          source={{ uri: pngUrl }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          onError={() => setPngFailed(true)}
        />
      </View>
    );
  }

  // ── 3. Letzter Fallback: Initialen-Platzhalter ────────────────────────────
  const initial = effectiveSeed ? effectiveSeed.charAt(0).toUpperCase() : '?';
  const fontSize = Math.round(size * 0.4);

  return (
    <View style={[styles.wrapper, styles.placeholder, wrapperStyle]}>
      <Text style={[styles.placeholderText, { fontSize }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  placeholder: {
    backgroundColor: '#6B7280',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#fff',
    fontWeight: '700',
  },
});
