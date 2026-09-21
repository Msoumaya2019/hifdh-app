// Écran Progrès - Statistiques et progression

import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { ProgressBar } from '@/components/ProgressBar';
import { colors, fontSizes, fonts, spacing, radii, fontWeights } from '@/theme';
import { getUserConfig, getMemorizedPassages, getSessionsByDateRange, getReviewItemCount, getReviewItemsDue } from '@/lib/database';
import { computeProgressStats, formatDate } from '@/lib/progress';
import type { UserConfig, LearningSession, MemorizedPassage, ProgressStats } from '@/types';

type Period = 'jour' | 'semaine' | 'mois';

export default function ProgresScreen() {
  const [period, setPeriod] = useState<Period>('semaine');
  const [stats, setStats] = useState<ProgressStats | null>(null);
  const [weekSessions, setWeekSessions] = useState<LearningSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const config = await getUserConfig();
    if (!config) return;

    const today = new Date().toISOString().split('T')[0];
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const monthStr = monthAgo.toISOString().split('T')[0];

    const sessions = await getSessionsByDateRange(monthStr, today);
    const memorized = await getMemorizedPassages();
    const reviewCount = await getReviewItemCount();

    const computed = computeProgressStats(config, sessions, memorized, reviewCount);
    setStats(computed);
    setWeekSessions(sessions);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const periodValue = period === 'jour' ? stats?.todayVerses ?? 0
    : period === 'semaine' ? stats?.weekVerses ?? 0
    : stats?.monthVerses ?? 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Ma progression</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Pourcentages */}
        <Card>
          <ProgressBar
            label="Coran mémorisé"
            value={stats?.quranPercentage ?? 0}
            color={colors.primary}
            height={12}
          />
          <View style={{ height: spacing.md }} />
          <ProgressBar
            label="Objectif atteint"
            value={stats?.objectivePercentage ?? 0}
            color={colors.gold}
            height={12}
          />
        </Card>

        {/* Sélecteur de période */}
        <View style={styles.periodSelector}>
          {(['jour', 'semaine', 'mois'] as Period[]).map((p) => (
            <Pressable
              key={p}
              style={[styles.periodTab, period === p && styles.periodTabActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodTabText, period === p && styles.periodTabTextActive]}>
                {p === 'jour' ? 'Jour' : p === 'semaine' ? 'Semaine' : 'Mois'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Versets mémorisés pour la période */}
        <Card>
          <View style={styles.statRow}>
            <View style={styles.statIcon}>
              <Ionicons name="book" size={28} color={colors.primary} />
            </View>
            <View>
              <Text style={styles.statValue}>{periodValue}</Text>
              <Text style={styles.statLabel}>
                Versets mémorisés ce {period}
              </Text>
            </View>
          </View>
        </Card>

        {/* Grille de statistiques */}
        <View style={styles.statsGrid}>
          <StatCard label="Hizb terminés" value={stats?.hizbCompleted ?? 0} icon="trophy" />
          <StatCard label="Jours d'apprentissage" value={stats?.totalLearningDays ?? 0} icon="calendar" />
          <StatCard label="Révisions effectuées" value={stats?.totalReviews ?? 0} icon="repeat" />
          <StatCard label="Versets (mois)" value={stats?.monthVerses ?? 0} icon="trending-up" />
        </View>

        {/* Graphique simple de la semaine */}
        <Card>
          <Text style={styles.cardTitle}>Activité de la semaine</Text>
          <WeekChart sessions={weekSessions} />
        </Card>

        {/* Estimation */}
        {stats?.estimatedCompletionDate && (
          <Card variant="surface">
            <View style={styles.cardHeader}>
              <Ionicons name="flag-outline" size={20} color={colors.gold} />
              <Text style={styles.cardTitle}>Estimation de fin d'objectif</Text>
            </View>
            <Text style={styles.estimatedDate}>
              {formatDate(stats.estimatedCompletionDate)}
            </Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <Card style={styles.gridCard} padding="md">
      <Ionicons name={icon as any} size={22} color={colors.primary} />
      <Text style={styles.gridValue}>{value}</Text>
      <Text style={styles.gridLabel}>{label}</Text>
    </Card>
  );
}

function WeekChart({ sessions }: { sessions: LearningSession[] }) {
  const dayLabels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const dayOffsets = [1, 2, 3, 4, 5, 6, 0]; // Lundi=1, ..., Dimanche=0

  // Calculer les versets mémorisés pour chaque jour de la semaine en cours
  const today = new Date();
  const startOfWeek = new Date(today);
  const dayOfWeek = today.getDay(); // 0=Dim, 1=Lun, ...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  startOfWeek.setDate(today.getDate() + mondayOffset);

  const data = dayOffsets.map((_, i) => {
    const dayDate = new Date(startOfWeek);
    dayDate.setDate(startOfWeek.getDate() + i);
    const dateStr = dayDate.toISOString().split('T')[0];
    return sessions
      .filter((s) => s.date === dateStr && s.status === 'completed')
      .reduce((sum, s) => sum + (s.endAyah - s.startAyah + 1), 0);
  });

  const max = Math.max(...data, 1);

  return (
    <View style={styles.chartContainer}>
      {data.map((value, i) => (
        <View key={i} style={styles.chartBar}>
          <View style={[styles.bar, { height: `${Math.max((value / max) * 100, value > 0 ? 8 : 0)}%` }]} />
          <Text style={styles.chartLabel}>{dayLabels[i]}</Text>
          {value > 0 && <Text style={styles.chartValue}>{value}</Text>}
        </View>
      ))}
    </View>
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
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxxl * 2,
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceVariant,
    borderRadius: radii.md,
    padding: 4,
  },
  periodTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    alignItems: 'center',
  },
  periodTabActive: {
    backgroundColor: colors.primary,
  },
  periodTabText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  periodTabTextActive: {
    color: colors.textOnPrimary,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statValue: {
    fontSize: fontSizes.xxxl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap' as const,
    gap: spacing.sm,
  },
  gridCard: {
    width: '48%' as any,
    flex: 1,
    minWidth: '48%' as any,
    alignItems: 'center',
    gap: spacing.xs,
  },
  gridValue: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
  gridLabel: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  cardTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  estimatedDate: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.semibold,
    color: colors.gold,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 120,
    marginTop: spacing.md,
  },
  chartBar: {
    alignItems: 'center',
    flex: 1,
    height: '100%' as any,
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  bar: {
    width: 24,
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    minHeight: 4,
  },
  chartLabel: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
  },
  chartValue: {
    fontSize: fontSizes.xs,
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
});
