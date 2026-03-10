import * as LocalAuthentication from 'expo-local-authentication';

/**
 * Prüft ob biometrische Authentifizierung auf dem Gerät verfügbar ist
 */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return compatible && enrolled;
  } catch {
    return false;
  }
}

/**
 * Führt eine biometrische Authentifizierung durch
 * @returns true wenn Authentifizierung erfolgreich war
 */
export async function authenticateWithBiometrics(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Authentifiziere dich für den Admin-Bereich',
      cancelLabel: 'Abbrechen',
      disableDeviceFallback: false,
      fallbackLabel: 'Passwort verwenden',
    });
    return result.success;
  } catch {
    return false;
  }
}

/**
 * Gibt den Typ der verfügbaren biometrischen Hardware zurück
 */
export async function getBiometricType(): Promise<string> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return 'Face ID';
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return 'Fingerprint';
    } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      return 'Iris';
    }
    return 'Biometric';
  } catch {
    return 'Unknown';
  }
}
