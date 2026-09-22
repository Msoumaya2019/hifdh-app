// Écran Progrès - Statistiques et progression

import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { ProgressBar } from '@/components/ProgressBar';
import { colors, fontSizes, fonts, spacing, radii, fontWeights } from '@/theme';
import { getUserConfig, getMemorizedPassages, getSessionsByDateRange, getReviewItemCount } from '@/lib/database';
import { computeProgressStats, computeActiviteHebdomadaire, formatDate } from '@/lib/progress';
import { aujourdHui, ilYAjours, analyserDateLocale } from '@/lib/dates';
import type {
  UserConfig,
  LearningSession,
  MemorizedPassage,
  ProgressStats,
  SemaineActivite,
} from '@/types';

type Period = 'jour' | 'semaine' | 'mois';

// Huit semaines : assez pour voir une régularité, assez peu pour que chaque
// barre reste lisible sur un téléphone.
const NOMBRE_SEMAINES = 8;

// Hauteur des barres en points. Une hauteur en pourcentage dans une colonne
// flexible se calcule par rapport à la colonne entière, étiquettes comprises :
// les barres finissaient par déborder du cadre.
const HAUTEUR_BARRE = 90;

export default function ProgresScreen() {
  const [period, setPeriod] = useState<Period>('semaine');
  const [stats, setStats] = useState<ProgressStats | null>(null);
  const [semaines, setSemaines] = useState<SemaineActivite[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const config = await getUserConfig();
    if (!config) return;

    const today = aujourdHui();
    const monthStr = ilYAjours(30);

    const sessions = await getSessionsByDateRange(monthStr, today);
    const memorized = await getMemorizedPassages();
    const reviewCount = await getReviewItemCount();

    const computed = computeProgressStats(config, sessions, memorized, reviewCount);
    setStats(computed);

    // La fenêtre du graphique est plus large que celle des statistiques. La
    // partager aurait changé en silence le sens de « jours d'apprentissage »,
    // qui se compte sur trente jours.
    const debutFenetre = ilYAjours(NOMBRE_SEMAINES * 7);
    const pourLeGraphe = await getSessionsByDateRange(debutFenetre, today);
    setSemaines(computeActiviteHebdomadaire(pourLeGraphe, NOMBRE_SEMAINES));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const periodValue = period === 'jour' ? stats?.todayPages ?? 0
    : period === 'semaine' ? stats?.weekPages ?? 0
    : stats?.monthPages ?? 0;

  const periodVerses = period === 'jour' ? stats?.todayVerses ?? 0
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

        {/* Pages mémorisées pour la période */}
        <Card>
          <View style={styles.statRow}>
            <View style={styles.statIcon}>
              <Ionicons name="book" size={28} color={colors.primary} />
            </View>
            <View style={styles.statTextes}>
              <Text style={styles.statValue}>{periodValue}</Text>
              <Text style={styles.statLabel}>
                Pages mémorisées ce {period} — {periodVerses} verset{periodVerses > 1 ? 's' : ''}
              </Text>
            </View>
          </View>
          <Text style={styles.noteMesure}>
            Une page compte pour la part de ses versets que tu connais : une page
            à moitié sue compte 0,5. C’est une quantité de texte, pas un nombre de
            pages achevées.
          </Text>
        </Card>

        {/* Grille de statistiques */}
        <View style={styles.statsGrid}>
          <StatCard label="Hizb terminés" value={stats?.hizbCompleted ?? 0} icon="trophy" />
          <StatCard label="Jours d'apprentissage" value={stats?.totalLearningDays ?? 0} icon="calendar" />
          {/* Ce nombre est celui des passages suivis par la révision espacée,
              et non celui des révisions effectuées : le libellé précédent
              annonçait un compte que la donnée ne portait pas. */}
          <StatCard label="Passages en révision" value={stats?.totalReviews ?? 0} icon="repeat" />
          <StatCard label="Pages (mois)" value={stats?.monthPages ?? 0} icon="trending-up" />
        </View>

        {/* Activité, semaine par semaine */}
        <Card>
          <Text style={styles.cardTitle}>Activité, semaine par semaine</Text>
          <Text style={styles.noteMesure}>
            Huit dernières semaines, en pages. La dernière barre est la semaine en
            cours, qui n’est pas terminée.
          </Text>
          <WeeksChart semaines={semaines} />
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

function WeeksChart({ semaines }: { semaines: SemaineActivite[] }) {
  if (semaines.length === 0) {
    return <Text style={styles.panelVide}>Pas encore d’activité à afficher.</Text>;
  }

  const maximum = Math.max(...semaines.map((s) => s.pages), 1);

  return (
    <View style={styles.chartContainer}>
      {semaines.map((semaine) => {
        const hauteur = semaine.pages > 0
          ? Math.max((semaine.pages / maximum) * HAUTEUR_BARRE, 6)
          : 2;

        return (
          <View key={semaine.debut} style={styles.chartBar}>
            <Text style={styles.chartValue}>
              {semaine.pages > 0 ? semaine.pages : ''}
            </Text>
            <View
              style={[
                styles.bar,
                { height: hauteur },
                semaine.enCours && styles.barEnCours,
              ]}
            />
            <Text style={styles.chartLabel}>{etiquetteSemaine(semaine.debut)}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** « 21/9 » : le jour et le mois du lundi, seuls lisibles sous une barre. */
function etiquetteSemaine(debut: string): string {
  const date = analyserDateLocale(debut);
  return `${date.getDate()}/${date.getMonth() + 1}`;
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
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  chartBar: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  bar: {
    width: '70%' as any,
    maxWidth: 28,
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    minHeight: 2,
  },
  barEnCours: {
    backgroundColor: colors.gold,
  },
  statTextes: {
    flex: 1,
  },
  noteMesure: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  panelVide: {
    fontSize: fontSizes.sm,
    color: colors.textTertiary,
    fontStyle: 'italic',
    marginTop: spacing.md,
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
