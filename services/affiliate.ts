// Affiliate Service for YASA
// Basisfunktionen für den Affiliate-Bereich

import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AffiliateOffer, ClickEvent, QuestionnaireAnswer, ScoredOffer, RecommendationResult } from '../types/affiliate';
import { affiliateOffers } from '../data/affiliateOffers';

// Eigene Affiliate-ID (Placeholder - muss durch echte IDs ersetzt werden)
const AFFILIATE_ID = 'yasa_user_id';

/**
 * Affiliate Service - Hauptservice für Affiliate-Funktionen
 */
export class AffiliateService {
  private affiliateId: string = AFFILIATE_ID;
  
  /**
   * Generiert Affiliate-Link mit Tracking-Parametern
   */
  generateAffiliateLink(offer: AffiliateOffer): string {
    const url = new URL(offer.affiliateBaseUrl);
    url.searchParams.set('aff_id', this.affiliateId);
    // UTM-Parameter für Conversion-Tracking
    url.searchParams.set('utm_source', 'yasa_app');
    url.searchParams.set('utm_medium', 'mobile');
    return url.toString();
  }
  
  /**
   * Öffnet externes Angebot mit Affiliate-Link
   * Hinweis: In einer echten Implementierung würde dies den externen Browser öffnen
   */
  async openOffer(offer: AffiliateOffer): Promise<void> {
    const url = this.generateAffiliateLink(offer);
    // Öffnet externen Link
    await Linking.openURL(url);
    // Tracking-Event für Analytics
    this.trackClick(offer.id);
  }
  
  /**
   * Trackt Klick auf ein Angebot lokal
   */
  async trackClick(offerId: string): Promise<void> {
    try {
      const clickEvent: ClickEvent = {
        offerId,
        timestamp: new Date().toISOString(),
        category: 'affiliate',
        destination: 'external'
      };
      
      const existingClicks = await AsyncStorage.getItem('affiliate_clicks');
      const clicks: ClickEvent[] = existingClicks ? JSON.parse(existingClicks) : [];
      clicks.push(clickEvent);
      
      // Behalte nur die letzten 100 Klicks
      const trimmedClicks = clicks.slice(-100);
      await AsyncStorage.setItem('affiliate_clicks', JSON.stringify(trimmedClicks));
    } catch (error) {
      console.warn('Failed to track click:', error);
    }
  }
  
  /**
   * Gibt alle gespeicherten Klick-Events zurück
   */
  async getClickHistory(): Promise<ClickEvent[]> {
    try {
      const existingClicks = await AsyncStorage.getItem('affiliate_clicks');
      return existingClicks ? JSON.parse(existingClicks) : [];
    } catch (error) {
      console.warn('Failed to get click history:', error);
      return [];
    }
  }
}

/**
 * Holt alle verfügbaren Affiliate-Angebote
 */
export function getAffiliateOffers(): AffiliateOffer[] {
  return affiliateOffers;
}

/**
 * Holt ein einzelnes Angebot nach ID
 */
export function getOfferById(id: string): AffiliateOffer | undefined {
  return affiliateOffers.find((offer: AffiliateOffer) => offer.id === id);
}

/**
 * Filtert Angebote nach Kategorie
 */
export function getOffersByCategory(category: string): AffiliateOffer[] {
  return affiliateOffers.filter((offer: AffiliateOffer) => offer.category === category);
}

/**
 * Filtert Last-Minute Angebote (bis 7 Tage)
 */
export function getLastMinuteOffers(): AffiliateOffer[] {
  return affiliateOffers.filter((offer: AffiliateOffer) => offer.isLastMinute);
}

/**
 * Platzhalter für Affiliate-Link-Building
 * Hier können später echte Affiliate-IDs pro Partner eingefügt werden
 * 
 * Robust: Gibt gueltige URL zurueck oder zeigt dass kein Link verfuegbar ist
 */
export function buildAffiliateUrl(partner: string, offerId: string): string | null {
  // Validiere Input
  if (!partner || typeof partner !== 'string') {
    console.warn('Invalid partner:', partner);
    return null;
  }
  
  // Placeholder-Implementierung - muss durch echte Partner-URLs ersetzt werden
  const baseUrls: Record<string, string> = {
    booking: 'https://booking.com',
    expedia: 'https://expedia.com',
    getyourguide: 'https://getyourguide.com',
    rvshare: 'https://rvshare.com',
    viagogo: 'https://viagogo.com',
    flixbus: 'https://flixbus.com',
  };
  
  const baseUrl = baseUrls[partner.toLowerCase()];
  
  // Wenn kein gueltiger Partner, gib null zurueck
  if (!baseUrl) {
    console.warn('Unknown partner:', partner);
    return null;
  }
  
  return `${baseUrl}/offer/${encodeURIComponent(offerId)}?aff_id=${encodeURIComponent(AFFILIATE_ID)}`;
}

/**
 * Prueft ob ein Affiliate-Link gueltig ist
 */
export function isValidAffiliateLink(offer: AffiliateOffer): boolean {
  if (!offer?.affiliateBaseUrl) return false;
  try {
    new URL(offer.affiliateBaseUrl);
    return true;
  } catch {
    return false;
  }
}

// Exportiere Singleton-Instanz
export const affiliateService = new AffiliateService();

// --- Recommendation Functions (A4) ---

/**
 * Map user interests to offer categories
 */
const INTEREST_TO_CATEGORY: Record<string, string[]> = {
  beach: ['beach'],
  city: ['city', 'shorttrip'],
  wellness: ['wellness'],
  family: ['family'],
  shorttrip: ['shorttrip', 'city'],
};

/**
 * Map duration preference to day range
 */
const DURATION_RANGES: Record<string, { min: number; max: number }> = {
  weekend: { min: 2, max: 4 },
  week: { min: 5, max: 8 },
  extended: { min: 8, max: 30 },
};

/**
 * Berechnet Score für ein einzelnes Angebot basierend auf QuestionnaireAnswer
 * 
 * Scoring-Gewichtung:
 * - Budget: 0-30 Punkte
 * - Interessen/Kategorie: 0-25 Punkte
 * - Dauer: 0-20 Punkte
 * - Transport: 0-15 Punkte
 * - LastMinute Bonus: +10 Punkte
 */
function scoreOffer(offer: AffiliateOffer, prefs: QuestionnaireAnswer): ScoredOffer {
  let score = 0;
  const matchReasons: string[] = [];

  // 1. Budget Fit (0-30 Punkte)
  const { min: budgetMin, max: budgetMax } = prefs.budgetRange;
  if (offer.price >= budgetMin && offer.price <= budgetMax) {
    // Vollständiger Budget-Fit: 30 Punkte
    score += 30;
    matchReasons.push('passt zu deinem Budget');
  } else if (offer.price < budgetMin && offer.price >= budgetMin * 0.8) {
    // Leicht über Budget: 15 Punkte
    score += 15;
    matchReasons.push('nahe am Budget');
  } else if (offer.price > budgetMax && offer.price <= budgetMax * 1.2) {
    // Leicht über Budget: 15 Punkte
    score += 15;
    matchReasons.push('nahe am Budget');
  } else if (offer.price < budgetMin * 0.5) {
    // Deutlich unter Budget: 20 Punkte
    score += 20;
    matchReasons.push('günstiger als Budget');
  }

  // 2. Interessen/Kategorie Fit (0-25 Punkte)
  const matchedInterests = prefs.interests.filter(interest => {
    const relevantCategories = INTEREST_TO_CATEGORY[interest] || [];
    return relevantCategories.includes(offer.category) || 
           offer.tags.some(tag => tag.toLowerCase().includes(interest.toLowerCase()));
  });
  
  if (matchedInterests.length > 0) {
    const interestScore = Math.min(matchedInterests.length * 10, 25);
    score += interestScore;
    matchedInterests.forEach(interest => {
      const labels: Record<string, string> = {
        beach: 'Strand',
        city: 'Stadt',
        wellness: 'Wellness',
        family: 'Familie',
        shorttrip: 'Kurztrip',
      };
      matchReasons.push(labels[interest] || interest);
    });
  }

  // 3. Dauer Fit (0-20 Punkte)
  const durationRange = DURATION_RANGES[prefs.durationPreference];
  if (durationRange) {
    if (offer.durationDays >= durationRange.min && offer.durationDays <= durationRange.max) {
      score += 20;
      matchReasons.push('perfekte Dauer');
    } else if (offer.durationDays >= durationRange.min - 1 && offer.durationDays <= durationRange.max + 1) {
      // Nahe an Präferenz: 10 Punkte
      score += 10;
    }
  }

  // 4. Transport Fit (0-15 Punkte)
  if (prefs.transportPreference !== 'flexible') {
    if (offer.transport === prefs.transportPreference) {
      score += 15;
      const transportLabels: Record<string, string> = {
        car: 'Auto',
        train: 'Zug',
        bus: 'Bus',
      };
      matchReasons.push(transportLabels[offer.transport] || offer.transport);
    }
    // Keine Strafe für nicht-passenden Transport, nur 0 Punkte
  }

  // 5. LastMinute Bonus (+10 Punkte)
  if (prefs.departureWindow === 'asap' && offer.isLastMinute) {
    score += 10;
    matchReasons.push('Last-Minute');
  }

  return {
    offer,
    score,
    matchReasons: matchReasons.slice(0, 3), // Max 3 Gründe anzeigen
  };
}

/**
 * Hauptfunktion: Generiert Empfehlungen basierend auf QuestionnaireAnswer
 * 
 * @param prefs - Das QuestionnaireAnswer Objekt
 * @param maxResults - Maximale Anzahl an Ergebnissen (Standard: 10)
 * @returns RecommendationResult mit scoredOffers und topPicks
 */
export function recommendOffers(prefs: QuestionnaireAnswer, maxResults: number = 10): RecommendationResult {
  // Score alle Angebote
  const scoredOffers: ScoredOffer[] = affiliateOffers.map((offer: AffiliateOffer) => scoreOffer(offer, prefs));

  // Sortiere nach Score absteigend
  scoredOffers.sort((a: ScoredOffer, b: ScoredOffer) => b.score - a.score);

  // Bestimme ob Fallback nötig (wenn keine guten Treffer)
  const topScore = scoredOffers[0]?.score ?? 0;
  const threshold = topScore > 0 ? Math.max(topScore * 0.3, 10) : 0;
  
  // Filtere Angebote mit signifikantem Score (mindestens 30% des Top-Scores)
  const relevantOffers = scoredOffers.filter((s: ScoredOffer) => s.score >= threshold);
  
  const fallbackUsed = relevantOffers.length === 0 && scoredOffers.length > 0;
  
  return {
    scoredOffers: scoredOffers.slice(0, maxResults),
    topPicks: (fallbackUsed ? scoredOffers : relevantOffers).slice(0, 3),
    fallbackUsed,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Einfache Wrapper-Funktion für schnellen Zugriff
 */
export function getRecommendations(prefs: QuestionnaireAnswer): ScoredOffer[] {
  return recommendOffers(prefs, 10).scoredOffers;
}
