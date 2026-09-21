// Écran d'accueil - Tableau de bord

import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { ProgressBar } from '@/components/ProgressBar';
import { colors, fontSizes, fonts, spacing, radii, fontWeights } from '@/theme';
import { getUserConfig, getTodaySessions, getMemorizedPassages, getReviewItemsDue, getReviewItemCount, getSessionsByDateRange } from '@/lib/database';
import { computeProgressStats, formatDate } from '@/lib/progress';
import type { UserConfig, LearningSession, MemorizedPassage } from '@/types';

export default function AccueilScreen() {
  const router = useRouter();
  const [config, setConfig] = useState<UserConfig | null>(null);
  const [todaySessions, setTodaySessions] = useState<LearningSession[]>([]);
  const [memorized, setMemorized] = useState<MemorizedPassage[]>([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [allSessions, setAllSessions] = useState<LearningSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const cfg = await getUserConfig();
    setConfig(cfg);

    if (!cfg?.onboardingCompleted) {
      router.replace('/onboarding');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const sessions = await getTodaySessions();
    setTodaySessions(sessions);

    // Charger les séances de cette semaine et ce mois pour les stats
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const monthStr = monthAgo.toISOString().split('T')[0];
    const monthSessions = await getSessionsByDateRange(monthStr, today);
    setAllSessions(monthSessions);

    const mem = await getMemorizedPassages();
    setMemorized(mem);

    const dueReviews = await getReviewItemsDue(today);
    setReviewCount(dueReviews.length);
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  if (!config) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  const stats = computeProgressStats(config, allSessions, memorized, reviewCount);
  const todaySession = todaySessions.find((s) => s.status === 'todo');

  const objectiveLabel = getObjectiveLabel(config);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* En-tête */}
      <View style={styles.header}>
        <Text style={styles.greeting}>Bonjour,</Text>
        <Text style={styles.welcome}>
          Bienvenue dans ton programme de mémorisation
        </Text>
      </View>

      {/* Objectif */}
      <Card variant="primary" padding="lg">
        <Text style={styles.sectionLabel}>Mon objectif</Text>
        <Text style={styles.objectiveText}>{objectiveLabel}</Text>
      </Card>

      {/* Progression */}
      <Card>
        <ProgressBar
          label="Coran mémorisé"
          value={stats.quranPercentage}
          color={colors.primary}
        />
        <View style={styles.spacing} />
        <ProgressBar
          label="Objectif atteint"
          value={stats.objectivePercentage}
          color={colors.gold}
        />
      </Card>

      {/* Programme du jour */}
      <Card>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Aujourd'hui</Text>
          <Text style={styles.cardDate}>{formatDate(new Date().toISOString())}</Text>
        </View>

        {todaySession ? (
          <View style={styles.sessionCard}>
            <View style={styles.sessionInfo}>
              <Text style={styles.sessionSurah}>
                Sourate {todaySession.surah}
              </Text>
              <Text style={styles.sessionRange}>
                Versets {todaySession.startAyah} - {todaySession.endAyah}
              </Text>
            </View>
            <Pressable
              style={styles.startButton}
              onPress={() =>
                router.push({
                  pathname: '/lecteur',
                  params: {
                    surah: todaySession.surah,
                    startAyah: todaySession.startAyah,
                    endAyah: todaySession.endAyah,
                    sessionId: todaySession.id,
                  },
                })
              }
            >
              <Text style={styles.startButtonText}>Commencer</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.noSession}>
            Aucune séance prévue aujourd'hui. Bonne journée !
          </Text>
        )}
      </Card>

      {/* Révisions */}
      {reviewCount > 0 && (
        <Card>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>À réviser</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{reviewCount}</Text>
            </View>
          </View>
          <Text style={styles.reviewText}>
            {reviewCount} passage{reviewCount > 1 ? 's' : ''} à réviser aujourd'hui
          </Text>
        </Card>
      )}

      {/* Statistiques rapides */}
      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{stats.todayVerses}</Text>
          <Text style={styles.statLabel}>Versets aujourd'hui</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalLearningDays}</Text>
          <Text style={styles.statLabel}>Jours d'apprentissage</Text>
        </Card>
      </View>

      {stats.estimatedCompletionDate && (
        <Card variant="surface">
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Estimation de fin</Text>
            <Ionicons name="calendar-outline" size={20} color={colors.gold} />
          </View>
          <Text style={styles.estimatedDate}>
            {formatDate(stats.estimatedCompletionDate)}
          </Text>
        </Card>
      )}

      {/* Boutons d'action */}
      <View style={styles.actions}>
        <Pressable
          style={[styles.actionButton, styles.learnButton]}
          onPress={() => {
            if (todaySession) {
              router.push({
                pathname: '/lecteur',
                params: {
                  surah: todaySession.surah,
                  startAyah: todaySession.startAyah,
                  endAyah: todaySession.endAyah,
                  sessionId: todaySession.id,
                },
              });
            }
          }}
        >
          <Ionicons name="book" size={24} color={colors.textOnPrimary} />
          <Text style={styles.actionButtonText}>Commencer mon apprentissage</Text>
        </Pressable>

        <Pressable
          style={[styles.actionButton, styles.reviewButton]}
          onPress={() => router.push('/(tabs)/programme')}
        >
          <Ionicons name="repeat" size={24} color={colors.primary} />
          <Text style={[styles.actionButtonText, { color: colors.primary }]}>
            Commencer mes révisions
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function getObjectiveLabel(config: UserConfig): string {
  switch (config.objective.type) {
    case 'full_quran': return 'Mémoriser tout le Coran';
    case 'juz_amma': return "Mémoriser Juz' 'Amma";
    case 'hizb_sabbih': return "Mémoriser Hizb Sabbih";
    case 'specific_juz': return `Mémoriser Juz' ${config.objective.juzNumber}`;
    case 'specific_hizb': return `Mémoriser Hizb ${config.objective.hizbNumbers?.join(', ')}`;
    case 'custom': return 'Objectif personnalisé';
    default: return 'Objectif';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxxl * 2,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  header: {
    paddingVertical: spacing.sm,
  },
  greeting: {
    fontSize: fontSizes.xxxl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    fontFamily: fonts.regular,
  },
  welcome: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  sectionLabel: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    textTransform: 'uppercase' as const,
    fontWeight: fontWeights.semibold,
    letterSpacing: 0.5,
  },
  objectiveText: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  cardDate: {
    fontSize: fontSizes.sm,
    color: colors.textTertiary,
  },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primarySurface,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionSurah: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
  sessionRange: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  startButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  startButtonText: {
    color: colors.textOnPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  noSession: {
    fontSize: fontSizes.md,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  badge: {
    backgroundColor: colors.gold,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: colors.textOnPrimary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  reviewText: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: fontSizes.xxxl,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
  statLabel: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  estimatedDate: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.gold,
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
    borderRadius: radii.lg,
  },
  learnButton: {
    backgroundColor: colors.primary,
  },
  reviewButton: {
    backgroundColor: colors.primarySurface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  actionButtonText: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.textOnPrimary,
  },
  spacing: {
    height: spacing.md,
  },
});
