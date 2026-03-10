// Questionnaire Screen (A3)
// Funktionaler Light-Questionnaire mit 5 Fragen

import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useState, useMemo } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { QuestionnaireAnswer } from '../../types/affiliate';

// Question 1: Budget
const BUDGET_RANGES = [
  { id: 'under200', label: 'Unter 200€', min: 0, max: 200 },
  { id: '200to500', label: '200€ - 500€', min: 200, max: 500 },
  { id: '500to1000', label: '500€ - 1000€', min: 500, max: 1000 },
  { id: 'over1000', label: 'Über 1000€', min: 1000, max: 5000 },
];

// Question 2: Duration
const DURATION_OPTIONS = [
  { id: 'weekend', label: 'Kurztrip', sublabel: '2-3 Tage', icon: '📅' },
  { id: 'week', label: 'Eine Woche', sublabel: '5-7 Tage', icon: '🗓️' },
  { id: 'extended', label: 'Länger', sublabel: '2+ Wochen', icon: '✈️' },
];

// Question 3: Interests (mapped to categories)
const INTEREST_OPTIONS = [
  { id: 'beach', label: 'Strand', icon: '🏖️' },
  { id: 'city', label: 'Stadt', icon: '🏙️' },
  { id: 'wellness', label: 'Wellness', icon: '💆' },
  { id: 'family', label: 'Familie', icon: '👨‍👩‍👧' },
  { id: 'shorttrip', label: 'Kurztrip', icon: '🚗' },
];

// Question 4: Transport
const TRANSPORT_OPTIONS = [
  { id: 'car', label: 'Auto', icon: '🚗' },
  { id: 'train', label: 'Zug', icon: '🚂' },
  { id: 'bus', label: 'Bus', icon: '🚌' },
  { id: 'flexible', label: 'Egal', icon: '✨' },
];

// Question 5: Departure Window
const DEPARTURE_OPTIONS = [
  { id: 'asap', label: 'Sofort', sublabel: 'So bald wie möglich', icon: '🔥' },
  { id: 'this_month', label: 'Diesen Monat', sublabel: 'Innerhalb der nächsten 4 Wochen', icon: '📆' },
  { id: 'next_month', label: 'Nächsten Monat', sublabel: 'In 1-2 Monaten', icon: '🗓️' },
  { id: 'flexible', label: 'Flexibel', sublabel: 'Ich bin offen', icon: '✨' },
];

type QuestionnaireStep = 'budget' | 'duration' | 'interests' | 'transport' | 'departure' | 'complete';

export default function QuestionnaireScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // State for answers
  const [currentStep, setCurrentStep] = useState<QuestionnaireStep>('budget');
  const [budget, setBudget] = useState<typeof BUDGET_RANGES[0] | null>(null);
  const [duration, setDuration] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [transport, setTransport] = useState<string | null>(null);
  const [departure, setDeparture] = useState<string | null>(null);

  // Computed result
  const result = useMemo((): QuestionnaireAnswer | null => {
    if (!budget || !duration || !transport || !departure) return null;
    
    return {
      budgetRange: {
        min: budget.min,
        max: budget.max,
        label: budget.label,
      },
      durationPreference: duration as 'weekend' | 'week' | 'extended',
      interests,
      transportPreference: transport as 'car' | 'train' | 'bus' | 'flexible',
      departureWindow: departure as 'asap' | 'this_month' | 'next_month' | 'flexible',
      answeredAt: new Date().toISOString(),
    };
  }, [budget, duration, interests, transport, departure]);

  // Progress calculation
  const stepIndex = ['budget', 'duration', 'interests', 'transport', 'departure', 'complete'].indexOf(currentStep);
  const progress = ((stepIndex) / 5) * 100;

  // Navigation handlers
  const canProceed = () => {
    switch (currentStep) {
      case 'budget': return !!budget;
      case 'duration': return !!duration;
      case 'interests': return interests.length > 0;
      case 'transport': return !!transport;
      case 'departure': return !!departure;
      default: return false;
    }
  };

  const handleNext = () => {
    if (!canProceed()) return;
    
    switch (currentStep) {
      case 'budget': setCurrentStep('duration'); break;
      case 'duration': setCurrentStep('interests'); break;
      case 'interests': setCurrentStep('transport'); break;
      case 'transport': setCurrentStep('departure'); break;
      case 'departure': setCurrentStep('complete'); break;
    }
  };

  const handleBack = () => {
    switch (currentStep) {
      case 'duration': setCurrentStep('budget'); break;
      case 'interests': setCurrentStep('duration'); break;
      case 'transport': setCurrentStep('interests'); break;
      case 'departure': setCurrentStep('transport'); break;
      case 'complete': setCurrentStep('departure'); break;
    }
  };

  const handleFinish = () => {
    // Navigate back to index with result as params
    const resultJson = encodeURIComponent(JSON.stringify(result));
    router.replace(`(affiliate)?result=${resultJson}`);
  };

  const getInterestLabel = (id: string) => {
    const opt = INTEREST_OPTIONS.find(o => o.id === id);
    return opt?.label || id;
  };

  const getDurationLabel = (id: string) => {
    const opt = DURATION_OPTIONS.find(o => o.id === id);
    return opt?.label || id;
  };

  const getTransportLabel = (id: string) => {
    const opt = TRANSPORT_OPTIONS.find(o => o.id === id);
    return opt?.label || id;
  };

  const getDepartureLabel = (id: string) => {
    const opt = DEPARTURE_OPTIONS.find(o => o.id === id);
    return opt?.label || id;
  };

  // Render step
  const renderStep = () => {
    switch (currentStep) {
      case 'budget':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>💰 Dein Budget</Text>
            <Text style={styles.stepSubtitle}>Was möchtest du maximal ausgeben?</Text>
            {BUDGET_RANGES.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.optionCard, budget?.id === item.id && styles.optionCardSelected]}
                onPress={() => setBudget(item)}
              >
                <Text style={[styles.optionLabel, budget?.id === item.id && styles.optionLabelSelected]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        );

      case 'duration':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>⏱️ Reisedauer</Text>
            <Text style={styles.stepSubtitle}>Wie lange möchtest du weg sein?</Text>
            {DURATION_OPTIONS.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.optionCard, duration === item.id && styles.optionCardSelected]}
                onPress={() => setDuration(item.id)}
              >
                <Text style={styles.optionIcon}>{item.icon}</Text>
                <View style={styles.optionContent}>
                  <Text style={[styles.optionLabel, duration === item.id && styles.optionLabelSelected]}>
                    {item.label}
                  </Text>
                  <Text style={styles.optionSublabel}>{item.sublabel}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        );

      case 'interests':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>✨ Was interessiert dich?</Text>
            <Text style={styles.stepSubtitle}>Wähle mindestens einen Bereich</Text>
            <View style={styles.chipContainer}>
              {INTEREST_OPTIONS.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.chip, interests.includes(item.id) && styles.chipSelected]}
                  onPress={() => {
                    setInterests(prev => 
                      prev.includes(item.id)
                        ? prev.filter(id => id !== item.id)
                        : [...prev, item.id]
                    );
                  }}
                >
                  <Text style={styles.chipIcon}>{item.icon}</Text>
                  <Text style={[styles.chipLabel, interests.includes(item.id) && styles.chipLabelSelected]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      case 'transport':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>🚗 Anreise</Text>
            <Text style={styles.stepSubtitle}>Wie möchtest du reisen?</Text>
            {TRANSPORT_OPTIONS.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.optionCard, transport === item.id && styles.optionCardSelected]}
                onPress={() => setTransport(item.id)}
              >
                <Text style={styles.optionIcon}>{item.icon}</Text>
                <Text style={[styles.optionLabel, transport === item.id && styles.optionLabelSelected]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        );

      case 'departure':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>📆 Wann möchtest du reisen?</Text>
            <Text style={styles.stepSubtitle}>Wann soll die Reise starten?</Text>
            {DEPARTURE_OPTIONS.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.optionCard, departure === item.id && styles.optionCardSelected]}
                onPress={() => setDeparture(item.id)}
              >
                <Text style={styles.optionIcon}>{item.icon}</Text>
                <View style={styles.optionContent}>
                  <Text style={[styles.optionLabel, departure === item.id && styles.optionLabelSelected]}>
                    {item.label}
                  </Text>
                  <Text style={styles.optionSublabel}>{item.sublabel}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        );

      case 'complete':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.completeIcon}>🎉</Text>
            <Text style={styles.stepTitle}>Fertig!</Text>
            <Text style={styles.stepSubtitle}>Deine Präferenzen sind gespeichert.</Text>
            
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Zusammenfassung</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Budget:</Text>
                <Text style={styles.summaryValue}>{budget?.label}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Dauer:</Text>
                <Text style={styles.summaryValue}>{duration && getDurationLabel(duration)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Interessen:</Text>
                <Text style={styles.summaryValue}>{interests.map(getInterestLabel).join(', ')}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Anreise:</Text>
                <Text style={styles.summaryValue}>{transport && getTransportLabel(transport)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Start:</Text>
                <Text style={styles.summaryValue}>{departure && getDepartureLabel(departure)}</Text>
              </View>
            </View>

            <Text style={styles.nextStepText}>
              Im nächsten Schritt zeigen wir dir passende Angebote basierend auf deinen Präferenzen.
            </Text>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {/* Progress Bar */}
      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBar, { width: `${progress}%` }]} />
      </View>

      {/* Step Indicator */}
      <View style={styles.stepIndicator}>
        {['budget', 'duration', 'interests', 'transport', 'departure'].map((step, idx) => {
          const isActive = currentStep === step;
          const isCompleted = ['budget', 'duration', 'interests', 'transport', 'departure'].indexOf(currentStep) > idx;
          return (
            <View
              key={step}
              style={[
                styles.stepDot,
                isActive && styles.stepDotActive,
                isCompleted && styles.stepDotCompleted,
              ]}
            />
          );
        })}
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {renderStep()}
      </ScrollView>

      {/* Navigation */}
      <View style={styles.navContainer}>
        {currentStep !== 'budget' && currentStep !== 'complete' && (
          <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
            <Text style={styles.backBtnText}>← Zurück</Text>
          </TouchableOpacity>
        )}
        
        {currentStep !== 'complete' ? (
          <TouchableOpacity
            style={[styles.nextBtn, !canProceed() && styles.nextBtnDisabled]}
            onPress={handleNext}
            disabled={!canProceed()}
          >
            <Text style={styles.nextBtnText}>Weiter →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.finishBtn} onPress={handleFinish}>
            <Text style={styles.finishBtnText}>Angebote sehen</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: '#e9ecef',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#2e7d32',
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#dee2e6',
  },
  stepDotActive: {
    backgroundColor: '#2e7d32',
    width: 24,
  },
  stepDotCompleted: {
    backgroundColor: '#2e7d32',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  stepContainer: {
    padding: 20,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 4,
  },
  stepSubtitle: {
    fontSize: 15,
    color: '#6c757d',
    marginBottom: 20,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#dee2e6',
  },
  optionCardSelected: {
    borderColor: '#2e7d32',
    backgroundColor: '#f0f9f0',
  },
  optionIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
  },
  optionLabelSelected: {
    color: '#2e7d32',
  },
  optionSublabel: {
    fontSize: 13,
    color: '#6c757d',
    marginTop: 2,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#dee2e6',
  },
  chipSelected: {
    borderColor: '#2e7d32',
    backgroundColor: '#f0f9f0',
  },
  chipIcon: {
    fontSize: 18,
    marginRight: 6,
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#495057',
  },
  chipLabelSelected: {
    color: '#2e7d32',
    fontWeight: '600',
  },
  completeIcon: {
    fontSize: 48,
    textAlign: 'center',
    marginBottom: 8,
  },
  summaryCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f5',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6c757d',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212529',
  },
  nextStepText: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
    marginTop: 20,
    fontStyle: 'italic',
  },
  navContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  backBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#495057',
  },
  nextBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#2e7d32',
    alignItems: 'center',
  },
  nextBtnDisabled: {
    backgroundColor: '#a5d6a7',
  },
  nextBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#fff',
  },
  finishBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#2e7d32',
    alignItems: 'center',
  },
  finishBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#fff',
  },
});
