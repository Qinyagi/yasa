// Affiliate Index Screen
// Hauptuebersicht mit kurzer Erklärung + CTA zum Questionnaire

import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useMemo } from 'react';
import { getAffiliateOffers, getLastMinuteOffers, recommendOffers } from '../../services/affiliate';
import { QuestionnaireAnswer, RecommendationResult } from '../../types/affiliate';

export default function AffiliateIndex() {
  const router = useRouter();
  const params = useLocalSearchParams<{ result?: string }>();
  const [questionnaireResult, setQuestionnaireResult] = useState<QuestionnaireAnswer | null>(null);
  
  const allOffers = getAffiliateOffers();
  const lastMinuteOffers = getLastMinuteOffers();

  // Compute recommendations when questionnaire result is available
  const recommendationResult: RecommendationResult | null = useMemo(() => {
    if (!questionnaireResult) return null;
    return recommendOffers(questionnaireResult);
  }, [questionnaireResult]);

  // Parse result from questionnaire
  useEffect(() => {
    if (params.result) {
      try {
        const decoded = decodeURIComponent(params.result);
        const parsed = JSON.parse(decoded) as QuestionnaireAnswer;
        setQuestionnaireResult(parsed);
      } catch (e) {
        console.warn('Failed to parse questionnaire result:', e);
      }
    }
  }, [params.result]);

  const handleStartQuestionnaire = () => {
    router.push('/(affiliate)/questionnaire');
  };

  const handleOfferPress = (offerId: string) => {
    router.push(`/(affiliate)/offer/${offerId}`);
  };

  const handleDismissResult = () => {
    setQuestionnaireResult(null);
  };

  // Helper to get interest labels
  const getInterestLabels = (interests: string[]): string => {
    const labels: Record<string, string> = {
      beach: 'Strand',
      city: 'Stadt',
      wellness: 'Wellness',
      family: 'Familie',
      shorttrip: 'Kurztrip',
    };
    return interests.map(i => labels[i] || i).join(', ');
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header Section */}
      <View style={styles.header}>
        <Text style={styles.title}>Reisen & Freizeit</Text>
        <Text style={styles.subtitle}>
          Finde die perfekte Reise oder Freizeitaktivität für dich
        </Text>
      </View>

      {/* Questionnaire Result Summary */}
      {questionnaireResult && (
        <View style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>✨ Deine Präferenzen</Text>
            <TouchableOpacity onPress={handleDismissResult}>
              <Text style={styles.resultDismiss}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.resultContent}>
            <Text style={styles.resultItem}>
              <Text style={styles.resultLabel}>Budget: </Text>
              {questionnaireResult.budgetRange.label}
            </Text>
            <Text style={styles.resultItem}>
              <Text style={styles.resultLabel}>Dauer: </Text>
              {questionnaireResult.durationPreference === 'weekend' ? 'Kurztrip' : 
               questionnaireResult.durationPreference === 'week' ? 'Eine Woche' : 'Länger'}
            </Text>
            <Text style={styles.resultItem}>
              <Text style={styles.resultLabel}>Interessen: </Text>
              {getInterestLabels(questionnaireResult.interests)}
            </Text>
            <Text style={styles.resultItem}>
              <Text style={styles.resultLabel}>Anreise: </Text>
              {questionnaireResult.transportPreference === 'flexible' ? 'Egal' : 
               questionnaireResult.transportPreference === 'car' ? 'Auto' :
               questionnaireResult.transportPreference === 'train' ? 'Zug' : 'Bus'}
            </Text>
            <Text style={styles.resultItem}>
              <Text style={styles.resultLabel}>Start: </Text>
              {questionnaireResult.departureWindow === 'asap' ? 'Sofort' :
               questionnaireResult.departureWindow === 'this_month' ? 'Diesen Monat' :
               questionnaireResult.departureWindow === 'next_month' ? 'Nächsten Monat' : 'Flexibel'}
            </Text>
          </View>
          <Text style={styles.resultNote}>
            Basierend auf deinen Präferenzen zeigen wir dir passende Angebote.
          </Text>
        </View>
      )}

      {/* Recommendations Section - A4 */}
      {recommendationResult && recommendationResult.scoredOffers.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>✨ Passend für dich</Text>
          
          {/* Top Picks - Highlighted */}
          {recommendationResult.topPicks.map((scored, index) => (
            <TouchableOpacity
              key={scored.offer.id}
              style={[styles.recommendationCard, index === 0 && styles.topPickCard]}
              onPress={() => handleOfferPress(scored.offer.id)}
            >
              <View style={styles.recommendationImagePlaceholder}>
                <Text style={styles.recommendationImageText}>🖼️</Text>
                {index === 0 && (
                  <View style={styles.topPickBadge}>
                    <Text style={styles.topPickBadgeText}>Top-Tipp</Text>
                  </View>
                )}
              </View>
              <View style={styles.recommendationInfo}>
                <Text style={styles.recommendationTitle} numberOfLines={2}>
                  {scored.offer.title}
                </Text>
                <Text style={styles.recommendationDestination} numberOfLines={1}>
                  {scored.offer.region}, {scored.offer.country}
                </Text>
                <View style={styles.recommendationMatchRow}>
                  <Text style={styles.recommendationPrice}>
                    ab {scored.offer.price}€
                  </Text>
                  {scored.matchReasons.length > 0 && (
                    <View style={styles.matchTags}>
                      {scored.matchReasons.slice(0, 2).map((reason, i) => (
                        <View key={i} style={styles.matchTag}>
                          <Text style={styles.matchTagText}>{reason}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ))}

          {/* Additional Recommendations */}
          {recommendationResult.scoredOffers.length > 3 && (
            <>
              <View style={styles.sectionDivider}>
                <Text style={styles.moreTitle}>Weitere {recommendationResult.scoredOffers.length - 3} Empfehlungen</Text>
              </View>
              {recommendationResult.scoredOffers.slice(3).map((scored) => (
                <TouchableOpacity
                  key={scored.offer.id}
                  style={styles.offerListItem}
                  onPress={() => handleOfferPress(scored.offer.id)}
                >
                  <View style={styles.offerListImagePlaceholder}>
                    <Text style={styles.offerListImageText}>🖼️</Text>
                  </View>
                  <View style={styles.offerListInfo}>
                    <Text style={styles.offerListTitle} numberOfLines={1}>
                      {scored.offer.title}
                    </Text>
                    <Text style={styles.offerListDestination} numberOfLines={1}>
                      {scored.offer.region}, {scored.offer.country}
                    </Text>
                    <Text style={styles.offerListPrice}>
                      ab {scored.offer.price}€
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* Fallback Notice */}
          {recommendationResult.fallbackUsed && (
            <View style={styles.fallbackBox}>
              <Text style={styles.fallbackTitle}>ℹ️ Keine exakten Treffer</Text>
              <Text style={styles.fallbackNotice}>
                Wir haben die Kriterien etwas gelockert, um dir passende Angebote zu zeigen.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* CTA Section */}
      <View style={styles.ctaSection}>
        <Text style={styles.ctaTitle}>🎯 Finde deine Traumreise</Text>
        <Text style={styles.ctaText}>
          Mit wenigen Klicks zu passenden Angeboten - komplett kostenlos
        </Text>
        <TouchableOpacity 
          style={styles.ctaButton}
          onPress={handleStartQuestionnaire}
        >
          <Text style={styles.ctaButtonText}>Fragen beantworten</Text>
        </TouchableOpacity>
      </View>

      {/* Last Minute Section */}
      {lastMinuteOffers.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔥 Last-Minute Angebote</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {lastMinuteOffers.map((offer) => (
              <TouchableOpacity
                key={offer.id}
                style={styles.offerCard}
                onPress={() => handleOfferPress(offer.id)}
              >
                <View style={styles.offerImagePlaceholder}>
                  <Text style={styles.offerImageText}>🖼️</Text>
                </View>
                <View style={styles.offerInfo}>
                  <Text style={styles.offerTitle} numberOfLines={2}>
                    {offer.title}
                  </Text>
                  <Text style={styles.offerDestination} numberOfLines={1}>
                    {offer.region}, {offer.country}
                  </Text>
                  <View style={styles.offerPriceRow}>
                    <Text style={styles.offerPrice}>
                      ab {offer.price}€ 
                      {offer.discountPercent && (
                        <Text style={styles.offerDiscount}>
                          {' '}-{offer.discountPercent}%
                        </Text>
                      )}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* All Offers Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📋 Alle Angebote</Text>
        {allOffers.map((offer) => (
          <TouchableOpacity
            key={offer.id}
            style={styles.offerListItem}
            onPress={() => handleOfferPress(offer.id)}
          >
            <View style={styles.offerListImagePlaceholder}>
              <Text style={styles.offerListImageText}>🖼️</Text>
            </View>
            <View style={styles.offerListInfo}>
              <Text style={styles.offerListTitle} numberOfLines={1}>
                {offer.title}
              </Text>
              <Text style={styles.offerListDestination} numberOfLines={1}>
                {offer.region}, {offer.country}
              </Text>
              <Text style={styles.offerListPrice}>
                ab {offer.price}€ 
                {offer.isLastMinute && (
                  <Text style={styles.lastMinuteBadge}> Last-Minute</Text>
                )}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Disclaimer */}
      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          * YASA erhält eine Provision bei Buchung über diese Links.
          Die Buchung erfolgt direkt beim Anbieter.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  ctaSection: {
    backgroundColor: '#e8f5e9',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderRadius: 12,
  },
  ctaTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2e7d32',
    marginBottom: 8,
  },
  resultCard: {
    backgroundColor: '#e8f5e9',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2e7d32',
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2e7d32',
  },
  resultDismiss: {
    fontSize: 18,
    color: '#666',
    padding: 4,
  },
  resultContent: {
    marginBottom: 12,
  },
  resultItem: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  resultLabel: {
    fontWeight: '600',
  },
  resultNote: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
  },
  ctaText: {
    fontSize: 14,
    color: '#555',
    marginBottom: 16,
  },
  ctaButton: {
    backgroundColor: '#2e7d32',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  ctaButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  offerCard: {
    width: 180,
    backgroundColor: '#fff',
    marginLeft: 16,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  offerImagePlaceholder: {
    width: '100%',
    height: 100,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  offerImageText: {
    fontSize: 32,
  },
  offerInfo: {
    padding: 12,
  },
  offerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  offerDestination: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  offerPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  offerPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2e7d32',
  },
  offerDiscount: {
    color: '#e53935',
    fontSize: 12,
  },
  offerListItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  offerListImagePlaceholder: {
    width: 80,
    height: 80,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  offerListImageText: {
    fontSize: 24,
  },
  offerListInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  offerListTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  offerListDestination: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  offerListPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2e7d32',
  },
  lastMinuteBadge: {
    fontSize: 11,
    fontWeight: 'normal',
    color: '#e53935',
    backgroundColor: '#ffebee',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  disclaimer: {
    padding: 16,
    marginBottom: 32,
  },
  disclaimerText: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
  },
  // A4 Recommendation Styles
  recommendationCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  topPickCard: {
    borderWidth: 2,
    borderColor: '#2e7d32',
    backgroundColor: '#f1f8e9',
  },
  recommendationImagePlaceholder: {
    width: 100,
    height: 100,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recommendationImageText: {
    fontSize: 32,
  },
  topPickBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#2e7d32',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  topPickBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  recommendationInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  recommendationTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  recommendationDestination: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  recommendationMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recommendationPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2e7d32',
  },
  matchTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
    justifyContent: 'flex-end',
    marginLeft: 8,
  },
  matchTag: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
  },
  matchTagText: {
    fontSize: 10,
    color: '#2e7d32',
  },
  moreTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
  },
  fallbackNotice: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    backgroundColor: '#fff3e0',
    borderRadius: 8,
  },
  // A6: UX Polish Styles
  sectionDivider: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    marginBottom: 8,
  },
  fallbackBox: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#fff3e0',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ffb74d',
  },
  fallbackTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e65100',
    marginBottom: 4,
  },
});
