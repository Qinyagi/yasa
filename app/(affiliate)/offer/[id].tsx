// Offer Detail Screen
// Detailscreen für einzelne Angebote

import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { getOfferById, affiliateService, isValidAffiliateLink } from '../../../services/affiliate';
import { AffiliateOffer } from '../../../types/affiliate';

export default function OfferDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const [offer, setOffer] = useState<AffiliateOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const handleBack = () => {
    if (navigation.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(affiliate)');
  };

  useEffect(() => {
    if (id) {
      const foundOffer = getOfferById(id);
      setOffer(foundOffer || null);
      setLoading(false);
    }
  }, [id]);

  const handleBookNow = async () => {
    if (offer) {
      try {
        await affiliateService.openOffer(offer);
      } catch (error) {
        console.warn('Failed to open offer:', error);
      }
    }
  };

  const getCategoryLabel = (category: string): string => {
    const labels: Record<string, string> = {
      hotel: '🏨 Hotel',
      city: '🏙️ Städtetrip',
      wellness: '💆 Wellness',
      family: '👨‍👩‍👧‍👦 Familienurlaub',
      shorttrip: '📅 Kurztrip',
      beach: '🏖️ Strandurlaub',
    };
    return labels[category] || category;
  };

  const getTransportIcon = (transport: string): string => {
    const icons: Record<string, string> = {
      car: '🚗',
      train: '🚂',
      bus: '🚌',
      plane: '✈️',
    };
    return icons[transport] || '🚶';
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Lädt...</Text>
      </View>
    );
  }

  if (!offer) {
    return (
      <View style={styles.container}>
        <View style={styles.notFoundContent}>
          <Text style={styles.errorIcon}>🔍</Text>
          <Text style={styles.errorText}>Angebot nicht gefunden</Text>
          <Text style={styles.errorSubtext}>
            Das angeforderte Angebot ist nicht verfügbar oder wurde entfernt.
          </Text>
        </View>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={handleBack}
        >
          <Text style={styles.backButtonText}>← Zurück zur Übersicht</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Hero Image Placeholder */}
      <View style={styles.heroImage}>
        <Text style={styles.heroImageText}>🖼️</Text>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {/* Category & Transport */}
        <View style={styles.tagsRow}>
          <View style={styles.categoryTag}>
            <Text style={styles.categoryTagText}>
              {getCategoryLabel(offer.category)}
            </Text>
          </View>
          <View style={styles.transportTag}>
            <Text style={styles.transportTagText}>
              {getTransportIcon(offer.transport)} {offer.transport}
            </Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>{offer.title}</Text>

        {/* Destination */}
        <View style={styles.destinationRow}>
          <Text style={styles.destinationIcon}>📍</Text>
          <Text style={styles.destinationText}>{offer.region}, {offer.country}</Text>
        </View>

        {/* Duration */}
        <View style={styles.destinationRow}>
          <Text style={styles.destinationIcon}>📅</Text>
          <Text style={styles.destinationText}>{offer.durationDays} Tage</Text>
        </View>

        {/* Departure Window */}
        {offer.departureWindow && (
          <View style={styles.destinationRow}>
            <Text style={styles.destinationIcon}>🗓️</Text>
            <Text style={styles.destinationText}>{offer.departureWindow}</Text>
          </View>
        )}

        {/* Rating */}
        {offer.ratingLabel && (
          <View style={styles.ratingRow}>
            <Text style={styles.ratingText}>⭐ {offer.ratingLabel}</Text>
          </View>
        )}

        {/* Badge */}
        {offer.badge && (
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{offer.badge}</Text>
            </View>
          </View>
        )}

        {/* Price Section */}
        <View style={styles.priceSection}>
          {offer.discountPercent && (
            <Text style={styles.originalPrice}>
              {Math.round(offer.price / (1 - offer.discountPercent / 100))}€
            </Text>
          )}
          <Text style={styles.price}>
            ab {offer.price}€ 
            {offer.discountPercent && (
              <Text style={styles.discount}> -{offer.discountPercent}%</Text>
            )}
          </Text>
          <Text style={styles.priceNote}>pro Person</Text>
        </View>

        {/* Description */}
        <View style={styles.descriptionSection}>
          <Text style={styles.sectionTitle}>Beschreibung</Text>
          <Text style={styles.description}>{offer.description}</Text>
        </View>

        {/* Tags */}
        {offer.tags && offer.tags.length > 0 && (
          <View style={styles.tagsSection}>
            <Text style={styles.sectionTitle}>Merkmale</Text>
            <View style={styles.tagsList}>
              {offer.tags.map((tag, index) => (
                <View key={index} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Last Minute Badge */}
        {offer.isLastMinute && (
          <View style={styles.lastMinuteBox}>
            <Text style={styles.lastMinuteText}>🔥 LAST-MINUTE ANGEBOT</Text>
          </View>
        )}

        {/* Affiliate Disclosure - Clear and Visible */}
        <View style={styles.disclosureBox}>
          <Text style={styles.disclosureTitle}>📢 Werbehinweis</Text>
          <Text style={styles.disclosureText}>
            Dies ist ein externer Partnerlink. Bei Buchung über diesen Link kann YASA eine Provision erhalten.
            Die Buchung erfolgt direkt beim Anbieter - YASA ist nicht Vertragspartner.
          </Text>
        </View>

        {/* CTA Button */}
        {isValidAffiliateLink(offer) ? (
          <TouchableOpacity style={styles.bookButton} onPress={handleBookNow}>
            <Text style={styles.bookButtonText}>Zum Angebot →</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.bookButtonDisabled}>
            <Text style={styles.bookButtonTextDisabled}>
              Angebot aktuell nicht verfügbar
            </Text>
          </View>
        )}

        {/* Partner Info */}
        <View style={styles.partnerInfo}>
          <Text style={styles.partnerText}>
            Angebot von: {offer.partner}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  heroImage: {
    width: '100%',
    height: 250,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroImageText: {
    fontSize: 64,
  },
  content: {
    padding: 20,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  categoryTag: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  categoryTagText: {
    color: '#2e7d32',
    fontSize: 13,
    fontWeight: '600',
  },
  transportTag: {
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  transportTagText: {
    color: '#1565c0',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  destinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  destinationIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  destinationText: {
    fontSize: 15,
    color: '#555',
  },
  ratingRow: {
    marginBottom: 8,
  },
  ratingText: {
    fontSize: 15,
    color: '#f59e0b',
    fontWeight: '600',
  },
  badgeRow: {
    marginBottom: 12,
  },
  badge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeText: {
    color: '#92400e',
    fontSize: 13,
    fontWeight: '600',
  },
  priceSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  originalPrice: {
    fontSize: 18,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  price: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2e7d32',
  },
  discount: {
    color: '#e53935',
    fontSize: 20,
  },
  priceNote: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  descriptionSection: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: '#555',
    lineHeight: 22,
  },
  tagsSection: {
    marginTop: 20,
  },
  tagsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 12,
    color: '#6b7280',
  },
  lastMinuteBox: {
    marginTop: 20,
    backgroundColor: '#fee2e2',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  lastMinuteText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: 'bold',
  },
  affiliateInfo: {
    marginTop: 20,
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  affiliateInfoText: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
  },
  // A5: New Disclosure Styles
  disclosureBox: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#fff3e0',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ffb74d',
  },
  disclosureTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#e65100',
    marginBottom: 8,
  },
  disclosureText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 20,
  },
  bookButtonDisabled: {
    backgroundColor: '#ccc',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  bookButtonTextDisabled: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  bookButton: {
    backgroundColor: '#2e7d32',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  bookButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  partnerInfo: {
    marginTop: 16,
    alignItems: 'center',
  },
  partnerText: {
    fontSize: 12,
    color: '#999',
  },
  errorText: {
    fontSize: 18,
    color: '#e53935',
    textAlign: 'center',
    marginTop: 40,
  },
  backLink: {
    fontSize: 16,
    color: '#1565c0',
    textAlign: 'center',
    marginTop: 20,
  },
  // A5: New Not-Found Styles
  notFoundContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  backButton: {
    backgroundColor: '#1565c0',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 40,
    marginBottom: 40,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
