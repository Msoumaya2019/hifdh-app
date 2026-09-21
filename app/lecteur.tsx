// Lecteur du Coran - Affichage du texte arabe avec navigation

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, fonts, spacing, radii, fontWeights, lineHeights } from '@/theme';
import { getSurah, loadQuranText, getAyahRangeText, getAyahText } from '@/data/quranData';
import { updateSessionStatus, addMemorizedPassage, saveReviewItem, saveSession } from '@/lib/database';
import { reviewCard, getNextReviewDate, createNewCard } from '@/lib/spacedRepetition';
import type { Surah, ReviewItem, LearningSession } from '@/types';

export default function LecteurScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    surah: string;
    startAyah: string;
    endAyah: string;
    sessionId?: string;
  }>();

  const surahNum = parseInt(params.surah || '1', 10);
  const startAyah = parseInt(params.startAyah || '1', 10);
  const endAyah = parseInt(params.endAyah || '7', 10);
  const sessionId = params.sessionId;

  const [surah, setSurah] = useState<Surah | undefined>();
  const [verses, setVerses] = useState<{ ayah: number; text: string }[]>([]);
  const [fontSize, setFontSize] = useState(28);
  const [hideMode, setHideMode] = useState(false);
  const [hiddenVerses, setHiddenVerses] = useState<Set<number>>(new Set());
  const [textLoaded, setTextLoaded] = useState(false);

  useEffect(() => {
    setSurah(getSurah(surahNum));
  }, [surahNum]);

  useEffect(() => {
    loadQuranText().then(() => {
      setTextLoaded(true);
      const text = getAyahRangeText(surahNum, startAyah, endAyah);
      setVerses(text);
      // Masquer tous les versets sauf le premier en mode mémorisation
      setHiddenVerses(new Set());
    });
  }, [surahNum, startAyah, endAyah]);

  const toggleVerseHidden = (ayahNum: number) => {
    const newHidden = new Set(hiddenVerses);
    if (newHidden.has(ayahNum)) {
      newHidden.delete(ayahNum);
    } else {
      newHidden.add(ayahNum);
    }
    setHiddenVerses(newHidden);
  };

  const handleValidate = (status: 'completed' | 'postponed') => {
    if (sessionId) {
      updateSessionStatus(sessionId, status).then(() => {
        if (status === 'completed') {
          // Ajouter aux mémorisés
          addMemorizedPassage(surahNum, startAyah, endAyah, 'perfect').then(() => {
            // Créer un item de révision
            const card = createNewCard();
            const reviewed = reviewCard(card, 'perfect');
            const reviewItem: ReviewItem = {
              id: `review_${sessionId}`,
              surah: surahNum,
              startAyah,
              endAyah,
              level: reviewed.level,
              nextReviewDate: getNextReviewDate(reviewed.intervalDays),
              reviewCount: 0,
              intervalDays: reviewed.intervalDays,
              createdAt: new Date().toISOString(),
            };
            saveReviewItem(reviewItem).then(() => {
              router.back();
            });
          });
        } else {
          router.back();
        }
      });
    } else {
      router.back();
    }
  };

  if (!surah || !textLoaded) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* En-tête */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.surahNameAr}>{surah.name}</Text>
          <Text style={styles.surahNameFr}>{surah.nameFr}</Text>
        </View>
        <View style={styles.headerActions}>
          {/* Zoom - */}
          <Pressable
            onPress={() => setFontSize(Math.max(16, fontSize - 4))}
            style={styles.zoomButton}
          >
            <Ionicons name="remove" size={20} color={colors.primary} />
          </Pressable>
          {/* Zoom + */}
          <Pressable
            onPress={() => setFontSize(Math.min(60, fontSize + 4))}
            style={styles.zoomButton}
          >
            <Ionicons name="add" size={20} color={colors.primary} />
          </Pressable>
          {/* Mode mémorisation */}
          <Pressable
            onPress={() => {
              setHideMode(!hideMode);
              if (!hideMode) {
                // Masquer tous les versets sauf le premier
                setHiddenVerses(new Set(verses.slice(1).map((v) => v.ayah)));
              } else {
                setHiddenVerses(new Set());
              }
            }}
            style={[styles.zoomButton, hideMode && styles.zoomButtonActive]}
          >
            <Ionicons
              name={hideMode ? 'eye-off' : 'eye'}
              size={20}
              color={hideMode ? colors.textOnPrimary : colors.primary}
            />
          </Pressable>
        </View>
      </View>

      {/* Numéro de page/versets */}
      <View style={styles.rangeBar}>
        <Text style={styles.rangeText}>
          Versets {startAyah} à {endAyah}
        </Text>
      </View>

      {/* Texte coranique */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.ayahContainer}>
          {/* Bismillah si premier verset de la sourate (sauf Al-Fatiha et At-Tawbah) */}
          {startAyah === 1 && surahNum !== 1 && surahNum !== 9 && (
            <Text style={[styles.bismillah, { fontSize: fontSize * 0.9 }]} selectable>
              بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
            </Text>
          )}

          {verses.map((verse, index) => {
            const isHidden = hiddenVerses.has(verse.ayah);
            return (
              <View key={verse.ayah} style={styles.verseBlock}>
                <Text
                  style={[
                    styles.verseText,
                    { fontSize },
                    isHidden && styles.verseHidden,
                  ]}
                  selectable
                  onPress={() => hideMode && toggleVerseHidden(verse.ayah)}
                >
                  {isHidden ? (
                    <Text style={styles.hiddenPlaceholder}>
                      ━━━━━━ ﴿{verse.ayah}﴾ ━━━━━━{'\n'}
                      <Text style={styles.revealHint}>Toucher pour révéler</Text>
                    </Text>
                  ) : (
                    <Text>
                      {verse.text}{' '}
                      <Text style={styles.verseNumber}>
                        ﴿{toArabicNumber(verse.ayah)}﴾
                      </Text>
                    </Text>
                  )}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Barre de validation */}
      {sessionId && (
        <View style={styles.validationBar}>
          <Pressable
            style={[styles.validateButton, styles.validateComplete]}
            onPress={() => handleValidate('completed')}
          >
            <Ionicons name="checkmark-circle" size={22} color={colors.textOnPrimary} />
            <Text style={styles.validateText}>J'ai mémorisé</Text>
          </Pressable>
          <Pressable
            style={[styles.validateButton, styles.validateReview]}
            onPress={() => Alert.alert(
              'Pas encore',
              'Continues à travailler ce passage. Il restera dans ton programme.',
              [{ text: 'OK', onPress: () => router.back() }]
            )}
          >
            <Ionicons name="time" size={22} color={colors.warning} />
            <Text style={[styles.validateText, { color: colors.warning }]}>
              À retravailler
            </Text>
          </Pressable>
          <Pressable
            style={[styles.validateButton, styles.validatePostpone]}
            onPress={() => handleValidate('postponed')}
          >
            <Ionicons name="calendar" size={22} color={colors.textSecondary} />
            <Text style={[styles.validateText, { color: colors.textSecondary }]}>
              Reporter
            </Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

// Convertir un nombre en chiffres arabes
function toArabicNumber(num: number): string {
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return num
    .toString()
    .split('')
    .map((d) => arabicDigits[parseInt(d, 10)] ?? d)
    .join('');
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: spacing.sm,
  },
  headerInfo: {
    flex: 1,
    alignItems: 'center',
  },
  surahNameAr: {
    fontSize: fontSizes.xl,
    color: colors.primary,
    fontFamily: fonts.araby,
  },
  surahNameFr: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  zoomButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomButtonActive: {
    backgroundColor: colors.primary,
  },
  rangeBar: {
    backgroundColor: colors.primarySurface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rangeText: {
    fontSize: fontSizes.sm,
    color: colors.primary,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingBottom: spacing.xxxl * 2,
  },
  ayahContainer: {
    alignItems: 'stretch',
  },
  bismillah: {
    textAlign: 'center',
    fontFamily: fonts.quran,
    color: colors.primary,
    marginBottom: spacing.lg,
    lineHeight: lineHeights.quran * 40,
  },
  verseBlock: {
    marginBottom: spacing.md,
  },
  verseText: {
    fontFamily: fonts.quran,
    color: colors.textPrimary,
    textAlign: 'justify' as const,
    lineHeight: lineHeights.quran * 40,
    writingDirection: 'rtl' as any,
  },
  verseHidden: {
    opacity: 0.5,
  },
  hiddenPlaceholder: {
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textTertiary,
  },
  revealHint: {
    fontSize: fontSizes.xs,
    color: colors.gold,
    fontStyle: 'italic',
  },
  verseNumber: {
    fontFamily: fonts.araby,
    fontSize: 18,
    color: colors.gold,
    marginHorizontal: 4,
  },
  validationBar: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  validateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
  validateComplete: {
    backgroundColor: colors.success,
  },
  validateReview: {
    backgroundColor: colors.warningLight,
  },
  validatePostpone: {
    backgroundColor: colors.surfaceVariant,
  },
  validateText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textOnPrimary,
  },
});
