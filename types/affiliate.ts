// Affiliate Types for YASA
// Statisches Datenmodell für den Affiliate Reise-Bereich (MVP)

// --- Offer Categories ---
// Beschränkt auf reisbare Kategorien für MVP
export type OfferCategory =
  | 'hotel'              // Hotel nur
  | 'city'               // Städtetrip
  | 'wellness'           // Wellness/Wellbeing
  | 'family'             // Familienurlaub
  | 'shorttrip'          // Kurztrip (2-3 Tage)
  | 'beach';             // Strandurlaub

// --- Transport Types ---
export type TransportType = 'car' | 'train' | 'bus' | 'plane';

// --- Core Offer Type ---
export interface AffiliateOffer {
  // Pflichtfelder
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  
  // Kategorie & Typisierung
  category: OfferCategory;
  transport: TransportType;
  durationDays: number;           // Dauer in Tagen
  
  // Destination
  region: string;                 // z.B. "Bayern", "Nordsee", "Berlin"
  country: string;                // z.B. "Deutschland", "Spanien", "Italien"
  
  // Partner & Affiliate
  partner: string;                // 'booking', 'expedia', etc.
  affiliateBaseUrl: string;       // Basis-URL für Affiliate-Link
  
  // Bild
  image: string;                  // Bild-URL oder Asset-Name
  
  // Metadaten
  tags: string[];                // z.B. ['strand', 'meer', 'familie']
  isLastMinute: boolean;         // <= 7 Tage bis Reise
  
  // Optionale Felder
  departureWindow?: string;      // z.B. "März - Mai 2026"
  ratingLabel?: string;           // z.B. "4,5 Sterne", "Sehr gut"
  badge?: string;                // z.B. "Top Preis", "Nur noch 3"
  discountPercent?: number;      // Rabatt in Prozent
  validUntil?: string;           // Ablaufdatum der Offer
}

// --- Configuration ---
export interface AffiliateConfig {
  offers: AffiliateOffer[];
  lastUpdated: string;
  categories: OfferCategory[];
}

// --- Budget Questionnaire Types ---
export interface UserTravelPreferences {
  // Budget
  minBudget: number;
  maxBudget: number;
  currency: string;
  
  // Reiseinteressen
  interests: TravelInterest[];
  
  // Transport-Präferenz
  transportPreference: 'car' | 'train' | 'bus' | 'flexible';
  
  // Zeitraum
  travelMonth?: string;           // z.B. "2026-03"
  duration: 'weekend' | 'week' | 'extended';
  
  // Personen
  adults: number;
  children?: number;
  
  // Last-Minute vs. Geplant
  urgency: 'asap' | 'this_month' | 'flexible';
}

export type TravelInterest = 
  | 'beach'           // Strandurlaub
  | 'mountains'      // Berge
  | 'city'           // Städtetrip
  | 'wellness'       // Wellness
  | 'family'         // Familie
  | 'nature'         // Natur
  | 'culture';       // Kultur/History

export interface QuestionnaireResult {
  preferences: UserTravelPreferences;
  recommendedOffers: AffiliateOffer[];
  generatedAt: string;
}

// --- Click Tracking ---
export interface ClickEvent {
  offerId: string;
  timestamp: string;
  category: string;
  destination: string;
}

// --- Questionnaire Answer (A3) ---
export interface QuestionnaireAnswer {
  budgetRange: {
    min: number;
    max: number;
    label: string;
  };
  durationPreference: 'weekend' | 'week' | 'extended';
  interests: string[];
  transportPreference: 'car' | 'train' | 'bus' | 'flexible';
  departureWindow: 'asap' | 'this_month' | 'next_month' | 'flexible';
  answeredAt: string;
}

// --- Recommendation Types (A4) ---
export interface ScoredOffer {
  offer: AffiliateOffer;
  score: number;
  matchReasons: string[];
}

export interface RecommendationResult {
  scoredOffers: ScoredOffer[];
  topPicks: ScoredOffer[];
  fallbackUsed: boolean;
  generatedAt: string;
}
