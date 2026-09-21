// Écran Programme - Séances d'apprentissage et révisions

import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, SectionList } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { colors, fontSizes, fonts, spacing, radii, fontWeights } from '@/theme';
import { getUserConfig, getSessionsByDateRange, getReviewItemsDue, updateSessionStatus, saveReviewItem, addMemorizedPassage } from '@/lib/database';
import { formatDate } from '@/lib/progress';
import { reviewCard, getNextReviewDate, createNewCard } from '@/lib/spacedRepetition';
import type { UserConfig, LearningSession, ReviewItem, ReviewRating } from '@/types';
import { SafeAreaView } from 'react-native-safe-area-context';

type Tab = 'apprentissage' | 'revisions';

export default function ProgrammeScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('apprentissage');
  const [sessions, setSessions] = useState<LearningSession[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];
    const future = new Date();
    future.setDate(future.getDate() + 90);
    const futureStr = future.toISOString().split('T')[0];

    const sess = await getSessionsByDateRange(today, futureStr);
    setSessions(sess);

    const due = await getReviewItemsDue(today);
    setReviews(due);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleSessionComplete = async (sessionId: string) => {
    await updateSessionStatus(sessionId, 'completed');
    // Ajouter le passage aux mémorisés et créer un item de révision
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      await addMemorizedPassage(session.surah, session.startAyah, session.endAyah, 'perfect');
      
      const card = createNewCard();
      const reviewedCard = reviewCard(card, 'perfect');
      const reviewItem: ReviewItem = {
        id: `review_${sessionId}`,
        surah: session.surah,
        startAyah: session.startAyah,
        endAyah: session.endAyah,
        level: reviewedCard.level,
        nextReviewDate: getNextReviewDate(reviewedCard.intervalDays),
        reviewCount: 0,
        intervalDays: reviewedCard.intervalDays,
        createdAt: new Date().toISOString(),
      };
      await saveReviewItem(reviewItem);
    }
    await loadData();
  };

  const handleSessionPostpone = async (sessionId: string) => {
    await updateSessionStatus(sessionId, 'postponed');
    await loadData();
  };

  const handleReview = async (reviewId: string, rating: ReviewRating) => {
    const review = reviews.find((r) => r.id === reviewId);
    if (!review) return;

    const card = { level: review.level, reviewCount: review.reviewCount, intervalDays: review.intervalDays, easinessFactor: 2.5 };
    const updated = reviewCard(card, rating);
    
    const updatedReview: ReviewItem = {
      ...review,
      level: updated.level,
      reviewCount: updated.reviewCount,
      intervalDays: updated.intervalDays,
      nextReviewDate: getNextReviewDate(updated.intervalDays),
      lastReviewedAt: new Date().toISOString(),
    };
    await saveReviewItem(updatedReview);
    await loadData();
  };

  // Grouper les séances par date
  const sessionsByDate = sessions.reduce((acc, s) => {
    if (!acc[s.date]) acc[s.date] = [];
    acc[s.date].push(s);
    return acc;
  }, {} as Record<string, LearningSession[]>);

  const sections = Object.entries(sessionsByDate).map(([date, sess]) => ({
    title: date,
    data: sess,
  }));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Programme</Text>
      </View>

      {/* Onglets */}
      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, activeTab === 'apprentissage' && styles.tabActive]}
          onPress={() => setActiveTab('apprentissage')}
        >
          <Text style={[styles.tabText, activeTab === 'apprentissage' && styles.tabTextActive]}>
            Apprentissage
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'revisions' && styles.tabActive]}
          onPress={() => setActiveTab('revisions')}
        >
          <Text style={[styles.tabText, activeTab === 'revisions' && styles.tabTextActive]}>
            Révisions {reviews.length > 0 && `(${reviews.length})`}
          </Text>
        </Pressable>
      </View>

      {activeTab === 'apprentissage' ? (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderSectionHeader={({ section: { title } }) => (
            <Text style={styles.sectionHeader}>{formatDate(title)}</Text>
          )}
          renderItem={({ item: session }) => (
            <SessionCard
              session={session}
              onComplete={() => handleSessionComplete(session.id)}
              onPostpone={() => handleSessionPostpone(session.id)}
              onPress={() =>
                router.push({
                  pathname: '/lecteur',
                  params: {
                    surah: session.surah,
                    startAyah: session.startAyah,
                    endAyah: session.endAyah,
                    sessionId: session.id,
                  },
                })
              }
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
        />
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(item) => item.id}
          renderItem={({ item: review }) => (
            <ReviewCard
              review={review}
              onRate={(rating) => handleReview(review.id, rating)}
              onPress={() =>
                router.push({
                  pathname: '/lecteur',
                  params: {
                    surah: review.surah,
                    startAyah: review.startAyah,
                    endAyah: review.endAyah,
                  },
                })
              }
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-circle" size={48} color={colors.success} />
              <Text style={styles.emptyText}>Aucune révision en attente</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function SessionCard({ session, onComplete, onPostpone, onPress }: {
  session: LearningSession;
  onComplete: () => void;
  onPostpone: () => void;
  onPress: () => void;
}) {
  const statusIcon = session.status === 'completed' ? 'checkmark-circle' : 
    session.status === 'postponed' ? 'time-outline' : 'circle-outline';
  const statusColor = session.status === 'completed' ? colors.success :
    session.status === 'postponed' ? colors.warning : colors.textTertiary;

  return (
    <Card padding="md">
      <Pressable onPress={onPress} style={styles.sessionRow}>
        <Ionicons name={statusIcon as any} size={24} color={statusColor} />
        <View style={styles.sessionDetails}>
          <Text style={styles.sessionSurah}>Sourate {session.surah}</Text>
          <Text style={styles.sessionVerses}>
            Versets {session.startAyah} à {session.endAyah}
          </Text>
        </View>
      </Pressable>
      {session.status === 'todo' && (
        <View style={styles.sessionActions}>
          <Pressable style={[styles.actionBtn, styles.completeBtn]} onPress={onComplete}>
            <Ionicons name="checkmark" size={18} color={colors.textOnPrimary} />
            <Text style={styles.actionBtnText}>Mémorisé</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, styles.postponeBtn]} onPress={onPostpone}>
            <Ionicons name="time" size={18} color={colors.warning} />
            <Text style={[styles.actionBtnText, { color: colors.warning }]}>Reporter</Text>
          </Pressable>
        </View>
      )}
    </Card>
  );
}

function ReviewCard({ review, onRate, onPress }: {
  review: ReviewItem;
  onRate: (rating: ReviewRating) => void;
  onPress: () => void;
}) {
  return (
    <Card padding="md">
      <Pressable onPress={onPress} style={styles.sessionRow}>
        <Ionicons name="repeat" size={24} color={colors.gold} />
        <View style={styles.sessionDetails}>
          <Text style={styles.sessionSurah}>Sourate {review.surah}</Text>
          <Text style={styles.sessionVerses}>
            Versets {review.startAyah} à {review.endAyah}
          </Text>
          <Text style={styles.reviewLevel}>Niveau de maîtrise: {review.level}/8</Text>
        </View>
      </Pressable>
      <View style={styles.reviewActions}>
        <Pressable style={[styles.rateBtn, { backgroundColor: colors.masteryPerfect }]} onPress={() => onRate('perfect')}>
          <Text style={styles.rateBtnText}>Parfait</Text>
        </Pressable>
        <Pressable style={[styles.rateBtn, { backgroundColor: colors.masteryHesitant }]} onPress={() => onRate('hesitant')}>
          <Text style={styles.rateBtnText}>Hésitations</Text>
        </Pressable>
        <Pressable style={[styles.rateBtn, { backgroundColor: colors.masteryPoor }]} onPress={() => onRate('errors')}>
          <Text style={styles.rateBtnText}>Erreurs</Text>
        </Pressable>
        <Pressable style={[styles.rateBtn, { backgroundColor: colors.masteryRelearn }]} onPress={() => onRate('relearn')}>
          <Text style={styles.rateBtnText}>Réapprendre</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: fontSizes.xxxl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    alignItems: 'center',
    backgroundColor: colors.surfaceVariant,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  tabTextActive: {
    color: colors.textOnPrimary,
  },
  list: {
    padding: spacing.lg,
    paddingTop: 0,
  },
  sectionHeader: {
    fontSize: fontSizes.sm,
    color: colors.textTertiary,
    fontWeight: fontWeights.semibold,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    textTransform: 'uppercase' as const,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sessionDetails: {
    flex: 1,
  },
  sessionSurah: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  sessionVerses: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  reviewLevel: {
    fontSize: fontSizes.xs,
    color: colors.gold,
    marginTop: 2,
  },
  sessionActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
  },
  completeBtn: {
    backgroundColor: colors.success,
  },
  postponeBtn: {
    backgroundColor: colors.warningLight,
  },
  actionBtnText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  reviewActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
    flexWrap: 'wrap' as const,
  },
  rateBtn: {
    flex: 1,
    minWidth: 70,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    alignItems: 'center',
  },
  rateBtnText: {
    color: colors.textOnPrimary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl * 2,
    gap: spacing.md,
  },
  emptyText: {
    fontSize: fontSizes.md,
    color: colors.textTertiary,
  },
});
