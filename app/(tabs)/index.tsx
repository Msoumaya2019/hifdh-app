// Écran d'accueil - Tableau de bord

import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { ProgressBar } from '@/components/ProgressBar';
import { colors, fontSizes, fonts, spacing, radii, fontWeights, useStyles, type Palette } from '@/theme';
import { badgeNonLus } from '@/lib/discussion';
import { abonnerFils, totalNonLus } from '@/lib/sync/discussion';
import { getUserConfig, getTodaySessions, getMemorizedPassages, getReviewItemsDue, getReviewItemCount, getSessionsByDateRange } from '@/lib/database';
import { computeProgressStats, formatDate } from '@/lib/progress';
import { passagesARenforcer } from '@/lib/renforcement';
import { aujourdHui, ilYAjours } from '@/lib/dates';
import { libelleObjectif } from '@/lib/libelles';
import type { UserConfig, LearningSession, MemorizedPassage } from '@/types';

export default function AccueilScreen() {
  const styles = useStyles(creerStyles);
  const router = useRouter();
  const [config, setConfig] = useState<UserConfig | null>(null);
  const [todaySessions, setTodaySessions] = useState<LearningSession[]>([]);
  const [memorized, setMemorized] = useState<MemorizedPassage[]>([]);
  // Le nombre de passages à renforcer, et non le seul nombre de révisions dues :
  // un passage marqué « à retravailler » n'a pas forcément d'item de révision,
  // et il comptait donc pour rien dans la pastille de l'accueil.
  const [aRenforcer, setARenforcer] = useState(0);
  // Le nombre de passages suivis par la révision espacée — ce que la table
  // contient, et non ce qui est dû aujourd'hui.
  const [revisionsSuivies, setRevisionsSuivies] = useState(0);
  const [allSessions, setAllSessions] = useState<LearningSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // Le nombre de messages non lus, pour la pastille de l'en-tête. Il reste à
  // zéro quand il n'y a pas de compte configuré : l'accueil fonctionne hors
  // ligne, et une pastille ne doit pas y faire apparaître une erreur de réseau.
  const [nonLus, setNonLus] = useState(0);

  /**
   * Le seul nombre, et rien d'autre.
   *
   * L'accueil affiche une pastille ; il n'a donc pas à charger une ligne par
   * conversation. Un échec n'est PAS montré : la pastille est un confort, et
   * une erreur de réseau sur un écran qui fonctionne hors ligne ferait plus de
   * bruit que de bien. On retombe simplement sur « rien à lire ».
   */
  const chargerPastille = useCallback(async () => {
    const resultat = await totalNonLus();
    setNonLus(resultat.statut === 'ok' ? resultat.total : 0);
  }, []);

  const loadData = useCallback(async () => {
    const cfg = await getUserConfig();
    setConfig(cfg);

    if (!cfg?.onboardingCompleted) {
      router.replace('/onboarding');
      return;
    }

    const today = aujourdHui();
    const sessions = await getTodaySessions();
    setTodaySessions(sessions);

    // Charger les séances de cette semaine et ce mois pour les stats
    const monthStr = ilYAjours(30);
    const monthSessions = await getSessionsByDateRange(monthStr, today);
    setAllSessions(monthSessions);

    const mem = await getMemorizedPassages();
    setMemorized(mem);

    const dueReviews = await getReviewItemsDue(today);
    setARenforcer(passagesARenforcer(mem, dueReviews, today).length);
    setRevisionsSuivies(await getReviewItemCount());
  }, [router]);

  // `useFocusEffect` et non `useEffect` : cet écran doit se relire en revenant.
  //
  // Un écran d'onglet reste monté, et un `useEffect` ne se rejoue donc jamais.
  // Après une remise à zéro, l'accueil continuait d'annoncer les versets
  // mémorisés d'avant, alors même que la base était vide — exactement le
  // symptôme qui a fait demander un bouton de remise à zéro.
  useFocusEffect(
    useCallback(() => {
      loadData();
      chargerPastille();
    }, [loadData, chargerPastille])
  );

  // La pastille doit s'allumer SANS qu'on revienne sur l'accueil : un ami qui
  // écrit pendant qu'on regarde l'écran ne fait rien bouger autrement. C'est
  // `abonnerFils` — tous les fils, puisqu'une pastille ne connaît pas le fil
  // d'avance — et la fonction rendue est le retrait au démontage.
  useEffect(() => abonnerFils(() => chargerPastille()), [chargerPastille]);

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

  const stats = computeProgressStats(config, allSessions, memorized, revisionsSuivies);
  const todaySession = todaySessions.find((s) => s.status === 'todo');

  const objectiveLabel = getObjectiveLabel(config);

  // `null` quand il n'y a rien à lire : une pastille qui affiche « 0 » est un
  // signe qui ne dit rien et qui attire l'œil.
  const pastille = badgeNonLus(nonLus);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* En-tête */}
      <View style={styles.header}>
        <View style={styles.headerTexte}>
          <Text style={styles.greeting}>Bonjour,</Text>
          <Text style={styles.welcome}>
            Bienvenue dans ton programme de mémorisation
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/messages')}
          hitSlop={12}
          style={styles.boutonMessages}
          accessibilityRole="button"
          accessibilityLabel={
            pastille === null
              ? 'Messages'
              : `Messages, ${nonLus} message${nonLus > 1 ? 's' : ''} non lu${nonLus > 1 ? 's' : ''}`
          }
        >
          <Ionicons name="chatbubble-ellipses-outline" size={24} color={colors.primary} />
          {pastille !== null && (
            <View style={styles.pastille}>
              <Text style={styles.textePastille}>{pastille}</Text>
            </View>
          )}
        </Pressable>
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

      {/* Révision. La carte EST le raccourci : un appui mène directement à
          l'entrée « Révision » de l'onglet Programme, où la liste est groupée
          par sourate. Le chevron est là pour que la carte se voie cliquable —
          sans lui, un raccourci invisible ne vaut pas mieux que pas de
          raccourci. Le titre reprend le mot de l'entrée qu'il ouvre : deux noms
          pour un même endroit feraient douter d'y être arrivé. */}
      {aRenforcer > 0 && (
        <Pressable
          onPress={() =>
            // L'horodatage n'est pas décoratif : l'écran Programme reste monté
            // entre deux visites, et sans une valeur qui change, son effet ne
            // se rejouerait pas — le second appui ne ferait rien.
            router.push({
              pathname: '/(tabs)/programme',
              params: { onglet: 'renforcer', t: String(Date.now()) },
            })
          }
          accessibilityRole="button"
          accessibilityLabel={`Voir les ${aRenforcer} passage${aRenforcer > 1 ? 's' : ''} en révision`}
          style={({ pressed }) => [styles.carteCliquable, pressed && styles.cartePressee]}
        >
          <Card>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Révision</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{aRenforcer}</Text>
              </View>
            </View>
            <View style={styles.ligneRenforcer}>
              <Text style={styles.reviewText}>
                {aRenforcer} passage{aRenforcer > 1 ? 's' : ''} à renforcer
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </View>
          </Card>
        </Pressable>
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
          onPress={() =>
            // L'horodatage n'est pas décoratif : l'écran Programme reste monté
            // entre deux visites, et sans une valeur qui change, son effet ne
            // se rejouerait pas — le bouton ne ferait rien au second appui.
            router.push({
              pathname: '/(tabs)/programme',
              params: { onglet: 'renforcer', t: String(Date.now()) },
            })
          }
        >
          <Ionicons name="repeat" size={24} color={colors.primary} />
          <Text style={[styles.actionButtonText, { color: colors.primary }]}>
            Renforcer mes passages
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function getObjectiveLabel(config: UserConfig): string {
  return libelleObjectif(config.objective);
}

const creerStyles = (colors: Palette) => StyleSheet.create({
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTexte: {
    flex: 1,
  },
  boutonMessages: {
    marginTop: spacing.sm,
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastille: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xs,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textePastille: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.textOnPrimary,
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
  // Le conteneur de la carte cliquable. Il ne porte aucun habillage : le style
  // de la carte reste celui de `Card`, une seule source pour la forme.
  carteCliquable: {
    borderRadius: radii.lg,
  },
  // L'appui doit se voir. `opacity` plutôt qu'un changement de fond : la carte
  // garde sa couleur, donc rien ne saute à l'écran quand le doigt arrive.
  cartePressee: {
    opacity: 0.7,
  },
  // Le texte et le chevron sur une même ligne : le chevron se place au bout,
  // contre le bord, et non collé au texte.
  ligneRenforcer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
