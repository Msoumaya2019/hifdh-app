// Écran Programme — deux entrées distinctes : Apprentissage et Révision.
//
// POURQUOI DEUX ENTRÉES AVEC UNE ICÔNE, ET NON DEUX ONGLETS DE TEXTE
// ------------------------------------------------------------------
// La demande les nomme « Apprentissage » (livre ouvert) et « Révision » (deux
// flèches circulaires), et veut qu'elles se distinguent. Un changement de
// libellé n'y suffirait pas : chaque entrée porte donc son icône, et l'entrée
// active se voit à sa couleur. Le contenu, lui, ne change pas.
//
// LE MOT « RÉVISION » A DÉJÀ ÉTÉ ÉCARTÉ UNE FOIS, ET VOICI POURQUOI IL REVIENT.
// Ce fichier portait la décision inverse : « À renforcer » avait remplacé
// « Révisions », parce que l'apprenant ne reliait pas le mot à son travail. Ce
// qui avait réellement levé la confusion n'est pas le titre, c'est que CHAQUE
// LIGNE dit d'où elle vient — « Marqué à retravailler » ou « Révision prévue ».
// Cette ligne existe toujours ; le titre peut donc reprendre le mot de la
// demande sans réintroduire ce qui avait gêné.
//
// ELLE RESTE VISIBLE QUAND LES RÉVISIONS SONT ÉTEINTES. L'interrupteur du profil
// (section « Apprentissage ») décide si les passages à renforcer sont PROPOSÉS.
// L'éteindre ne supprime rien : l'entrée demeure, la liste aussi, et un bandeau
// dit l'état avec le moyen de le changer. Masquer l'entrée cacherait des données
// que personne n'a demandé à supprimer.
//
// La liste réunit les deux signaux qui, ensemble, disent qu'un passage n'est pas
// solide :
//
//   - le marquage explicite de l'apprenant ;
//   - l'échéance de la révision espacée.
//
// Les deux mènent aux mêmes deux gestes — « Renforcé » et « Pas encore » — qui
// écrivent au même endroit : `renforcerPassage`, dans `lib/database.ts`.

import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, SectionList } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { colors, fontSizes, fonts, spacing, radii, fontWeights, useStyles, type Palette } from '@/theme';
import {
  getUserConfig,
  getSessionsByDateRange,
  getSessionsATraiter,
  getMemorizedPassages,
  getReviewItemsDue,
  updateSessionStatus,
  reporterSession,
  renforcerPassage,
} from '@/lib/database';
import { formatDate } from '@/lib/progress';
import { aujourdHui, dansJours, ilYAjours } from '@/lib/dates';
import { reporterSeance } from '@/lib/programGenerator';
import { passagesARenforcer, type PassageARenforcer } from '@/lib/renforcement';
import { revisionsActives } from '@/lib/apprentissage';
import { getSurah } from '@/data/quranData';
import { useAudio } from '@/lib/audio/ContexteAudio';
import { versetsDeLaPlage } from '@/lib/audio/plan';
import type { UserConfig, LearningSession } from '@/types';
import { SafeAreaView } from 'react-native-safe-area-context';

type Tab = 'apprentissage' | 'renforcer';

export default function ProgrammeScreen() {
  const styles = useStyles(creerStyles);
  const router = useRouter();
  const params = useLocalSearchParams<{ onglet?: string; t?: string }>();
  const [activeTab, setActiveTab] = useState<Tab>(
    params.onglet === 'renforcer' ? 'renforcer' : 'apprentissage'
  );
  const [sessions, setSessions] = useState<LearningSession[]>([]);
  const [aRenforcer, setARenforcer] = useState<PassageARenforcer[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [config, setConfig] = useState<UserConfig | null>(null);

  // Un écran d'onglet reste monté : sa première initialisation ne se rejoue
  // pas, et le paramètre reçu de l'accueil serait donc ignoré — le bouton
  // « Renforcer mes passages » ne ferait rien, la seconde fois et toutes les
  // suivantes. L'accueil joint un horodatage pour que la valeur change à
  // chaque appui, sans quoi l'effet ne se déclencherait pas non plus.
  useEffect(() => {
    if (params.onglet === 'renforcer') setActiveTab('renforcer');
  }, [params.onglet, params.t]);

  const loadData = useCallback(async () => {
    const today = aujourdHui();

    // L'historique récent et l'avenir proche, pour l'affichage…
    const plage = await getSessionsByDateRange(ilYAjours(30), dansJours(90));
    // …et toutes les séances restant à faire, même en retard : sans cela une
    // séance manquée ou reportée sortirait de la plage et disparaîtrait.
    const aTraiter = await getSessionsATraiter();

    const parId = new Map<string, LearningSession>();
    for (const s of [...plage, ...aTraiter]) parId.set(s.id, s);
    const toutes = [...parId.values()].sort((a, b) => a.date.localeCompare(b.date));

    setSessions(toutes);
    setConfig(await getUserConfig());

    // Les deux sources de « à renforcer », réunies par une fonction pure.
    const memorises = await getMemorizedPassages();
    const dues = await getReviewItemsDue(today);
    setARenforcer(passagesARenforcer(memorises, dues, today));
  }, []);

  // `useFocusEffect` et non `useEffect` : cet écran doit se relire en revenant.
  //
  // Un écran d'onglet reste monté, et un `useEffect` ne se rejoue donc jamais.
  // Après une remise à zéro, l'onglet Programme continuait d'afficher les
  // séances d'avant — alors même que la base était vide. C'est le symptôme que
  // la remise à zéro doit faire disparaître.
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleSessionComplete = async (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    await updateSessionStatus(sessionId, 'completed');
    // Le passage est acquis : niveau de connaissance et révision espacée
    // avancent ensemble, par le même chemin que « Renforcé ».
    if (session) {
      await renforcerPassage(
        { surah: session.surah, startAyah: session.startAyah, endAyah: session.endAyah },
        true
      );
    }
    await loadData();
  };

  const handleSessionPostpone = async (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;

    // Le report doit réellement déplacer la séance. Se contenter de changer le
    // statut laissait la séance datée dans le passé, hors de la plage
    // affichée : elle disparaissait sans avoir été faite.
    const jours = config?.schedule.days ?? [];
    if (jours.length === 0) return;

    await reporterSession(sessionId, reporterSeance(session, jours));
    await loadData();
  };

  const handleRenforcement = async (passage: PassageARenforcer, renforce: boolean) => {
    await renforcerPassage(
      { surah: passage.surah, startAyah: passage.startAyah, endAyah: passage.endAyah },
      renforce
    );
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

  // Le réglage posé dans le profil. « Absent vaut actif » — la règle vit dans
  // `@/lib/apprentissage` et nulle part ailleurs : recopiée ici, elle serait
  // inversée un jour sans que rien ne le dise.
  const revisionsOuvertes = revisionsActives(config);

  return (
    // La barre d'onglets occupe le HAUT : la marge du haut y est prise une
    // seule fois. Ici, c'est donc le BAS qu'il faut protéger (voir
    // `src/components/BarreOngletsHaut.tsx`).
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Programme</Text>
        {/* L'accès à la sélection manuelle. Il est ici, et non dans la barre
            d'onglets, parce que la spécification interdit d'y ajouter une
            entrée — et parce qu'écouter se fait depuis un passage. */}
        <Pressable
          style={styles.boutonEcouter}
          onPress={() => router.push('/ecouter')}
          accessibilityRole="button"
          accessibilityLabel="Écouter un passage choisi à la main"
          hitSlop={8}
        >
          <Ionicons name="headset-outline" size={22} color={colors.primary} />
        </Pressable>
      </View>

      {/* Les deux entrées. Chacune porte son icône — un livre ouvert pour ce
          qu'on apprend, deux flèches circulaires pour ce sur quoi on revient.
          Le libellé seul ne les distinguait pas assez. */}
      <View style={styles.entrees}>
        <Pressable
          style={[styles.entree, activeTab === 'apprentissage' && styles.entreeActive]}
          onPress={() => setActiveTab('apprentissage')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'apprentissage' }}
        >
          <Ionicons
            name="book-outline"
            size={18}
            color={activeTab === 'apprentissage' ? colors.textOnPrimary : colors.textSecondary}
          />
          <Text
            style={[styles.entreeTexte, activeTab === 'apprentissage' && styles.entreeTexteActive]}
          >
            Apprentissage
          </Text>
        </Pressable>

        <Pressable
          style={[styles.entree, activeTab === 'renforcer' && styles.entreeActive]}
          onPress={() => setActiveTab('renforcer')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'renforcer' }}
          accessibilityLabel={
            revisionsOuvertes ? 'Révision' : 'Révision, désactivée dans le profil'
          }
        >
          {/* L'icône garde la MÊME teinte que sa voisine, même révisions
              éteintes : l'entrée n'est pas désactivée — elle reste appuyable, et
              la liste est là — donc une teinte éteinte le dirait à tort. Mesuré
              au passage : `textTertiary` sur `surfaceVariant` donne 2,93 sur les
              trois palettes claires, sous le seuil de 3,0 que ce projet tient
              pour une icône. L'état, lui, se DIT — bandeau et libellé vocal. */}
          <Ionicons
            name="sync-outline"
            size={18}
            color={activeTab === 'renforcer' ? colors.textOnPrimary : colors.textSecondary}
          />
          <Text
            style={[styles.entreeTexte, activeTab === 'renforcer' && styles.entreeTexteActive]}
          >
            {/* Le compte n'apparaît QUE si les révisions sont proposées : un
                nombre à côté d'une entrée éteinte annoncerait un travail qui
                n'est plus demandé. */}
            Révision
            {revisionsOuvertes && aRenforcer.length > 0 ? ` (${aRenforcer.length})` : ''}
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
          data={aRenforcer}
          keyExtractor={(item) => `${item.surah}:${item.startAyah}-${item.endAyah}`}
          renderItem={({ item: passage }) => (
            <RenforcementCard
              passage={passage}
              onRenforce={() => handleRenforcement(passage, true)}
              onPasEncore={() => handleRenforcement(passage, false)}
              onPress={() =>
                router.push({
                  pathname: '/lecteur',
                  params: {
                    surah: passage.surah,
                    startAyah: passage.startAyah,
                    endAyah: passage.endAyah,
                    renforcer: '1',
                  },
                })
              }
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
          ListHeaderComponent={
            <>
              {/* Le bandeau dit l'état ET comment le changer. Sans lui, l'entrée
                  « Révision » semblerait cassée : la liste est là, mais plus
                  rien ne la propose. */}
              {!revisionsOuvertes && (
                <View style={styles.bandeau}>
                  <View style={styles.bandeauLigne}>
                    <Ionicons name="pause-circle-outline" size={20} color={colors.textSecondary} />
                    <Text style={styles.bandeauTitre}>Révisions désactivées</Text>
                  </View>
                  <Text style={styles.bandeauAide}>
                    Vos passages à renforcer sont conservés : rien n’est supprimé, et la liste
                    reste consultable ci-dessous. Ils ne sont simplement plus mis en avant.
                  </Text>
                  <Pressable
                    style={styles.bandeauBouton}
                    onPress={() => router.push('/profil')}
                    accessibilityRole="button"
                    accessibilityLabel="Ouvrir le profil pour réactiver les révisions"
                  >
                    <Text style={styles.bandeauBoutonTexte}>Réactiver dans le profil</Text>
                  </Pressable>
                </View>
              )}

              {aRenforcer.length > 0 && (
                <Text style={styles.intro}>
                  Ces passages ne sont pas encore solides. Lis-les, puis dis où tu en es.
                </Text>
              )}
            </>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-circle" size={48} color={colors.success} />
              <Text style={styles.emptyText}>Rien à renforcer</Text>
              <Text style={styles.emptyHint}>
                Les passages que tu marques « À retravailler » dans le lecteur
                apparaîtront ici, ainsi que ceux dont la révision est arrivée à
                échéance.
              </Text>
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
  const styles = useStyles(creerStyles);
  const { ouvrir } = useAudio();
  const statusIcon = session.status === 'completed' ? 'checkmark-circle' : 
    session.status === 'postponed' ? 'time-outline' : 'circle-outline';
  const statusColor = session.status === 'completed' ? colors.success :
    session.status === 'postponed' ? colors.warning : colors.textTertiary;

  // « Écouter » ouvre la séance du jour avec **exactement** les bornes qu'elle
  // porte : ce sont celles du programme, et le lecteur audio ne les redéfinit
  // pas. Écouter ne marque rien — la spécification l'exige, et c'est aussi ce
  // qui rend le geste sans conséquence : on peut écouter un passage qu'on n'a
  // pas encore mémorisé.
  const ecouter = () =>
    ouvrir(versetsDeLaPlage(session.surah, session.startAyah, session.endAyah));

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
      {/* La barre d'actions est désormais TOUJOURS rendue : « Écouter » vaut
          pour une séance à faire comme pour une séance déjà faite — on peut
          vouloir réécouter un passage mémorisé. Les deux boutons de jugement,
          eux, ne concernent que ce qui reste à faire. */}
      <View style={styles.sessionActions}>
        <Pressable
          style={[styles.actionBtn, styles.ecouterBtn]}
          onPress={ecouter}
          accessibilityRole="button"
          accessibilityLabel={`Écouter les versets ${session.startAyah} à ${session.endAyah}`}
        >
          <Ionicons name="headset-outline" size={18} color={colors.primary} />
          <Text style={[styles.actionBtnText, { color: colors.primary }]}>Écouter</Text>
        </Pressable>
        {session.status === 'todo' && (
          <>
            <Pressable style={[styles.actionBtn, styles.completeBtn]} onPress={onComplete}>
              <Ionicons name="checkmark" size={18} color={colors.textOnPrimary} />
              <Text style={[styles.actionBtnText, { color: colors.textOnPrimary }]}>Mémorisé</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, styles.postponeBtn]} onPress={onPostpone}>
              <Ionicons name="time" size={18} color={colors.warning} />
              <Text style={[styles.actionBtnText, { color: colors.warning }]}>Reporter</Text>
            </Pressable>
          </>
        )}
      </View>
    </Card>
  );
}

/**
 * Une ligne de la liste « Révision ».
 *
 * L'origine est écrite noir sur blanc : l'apprenant doit pouvoir distinguer ce
 * qu'il a lui-même signalé de ce que l'application lui propose de revoir. Sans
 * cela, il ne saurait pas pourquoi un passage qu'il croyait acquis se retrouve
 * dans la liste.
 */
function RenforcementCard({ passage, onRenforce, onPasEncore, onPress }: {
  passage: PassageARenforcer;
  onRenforce: () => void;
  onPasEncore: () => void;
  onPress: () => void;
}) {
  const styles = useStyles(creerStyles);
  const { ouvrir } = useAudio();
  const surah = getSurah(passage.surah);
  const marque = passage.origine === 'marque';

  return (
    <Card padding="md">
      <Pressable onPress={onPress} style={styles.sessionRow}>
        <Ionicons
          name={marque ? 'flag' : 'repeat'}
          size={24}
          color={marque ? colors.warning : colors.gold}
        />
        <View style={styles.sessionDetails}>
          <Text style={styles.sessionSurah}>
            {surah ? surah.nameFr : `Sourate ${passage.surah}`}
          </Text>
          <Text style={styles.sessionVerses}>
            Versets {passage.startAyah} à {passage.endAyah}
          </Text>
          <Text style={styles.reviewLevel}>
            {marque ? 'Marqué à retravailler' : 'Révision prévue'}
          </Text>
        </View>
      </Pressable>
      <View style={styles.sessionActions}>
        {/* « Écouter » ici aussi : c'est souvent en réécoutant qu'on débloque un
            passage qu'on n'arrivait pas à retenir — et un passage « à renforcer »
            est précisément celui-là. */}
        <Pressable
          style={[styles.actionBtn, styles.ecouterBtn]}
          onPress={() =>
            ouvrir(versetsDeLaPlage(passage.surah, passage.startAyah, passage.endAyah))
          }
          accessibilityRole="button"
          accessibilityLabel={`Écouter les versets ${passage.startAyah} à ${passage.endAyah}`}
        >
          <Ionicons name="headset-outline" size={18} color={colors.primary} />
          <Text style={[styles.actionBtnText, { color: colors.primary }]}>Écouter</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.completeBtn]} onPress={onRenforce}>
          <Ionicons name="checkmark" size={18} color={colors.textOnPrimary} />
          <Text style={[styles.actionBtnText, { color: colors.textOnPrimary }]}>Renforcé</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.postponeBtn]} onPress={onPasEncore}>
          <Ionicons name="time" size={18} color={colors.warning} />
          <Text style={[styles.actionBtnText, { color: colors.warning }]}>Pas encore</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const creerStyles = (colors: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  boutonEcouter: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySurface,
  },
  title: {
    fontSize: fontSizes.xxxl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  entrees: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  // Une entrée porte une ICÔNE et un libellé, sur une ligne : c'est ce qui la
  // distingue de sa voisine sans qu'il faille lire le texte.
  entree: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceVariant,
  },
  entreeActive: {
    backgroundColor: colors.primary,
  },
  entreeTexte: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  entreeTexteActive: {
    color: colors.textOnPrimary,
  },
  list: {
    padding: spacing.lg,
    paddingTop: 0,
  },
  intro: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: fontSizes.sm * 1.5,
  },
  // Le bandeau des révisions éteintes. Il est discret, mais il porte une SORTIE :
  // dire « c'est désactivé » sans dire comment le rallumer laisserait la personne
  // devant un état qu'elle ne saurait pas défaire.
  bandeau: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  bandeauLigne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bandeauTitre: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  bandeauAide: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: fontSizes.sm * 1.5,
  },
  bandeauBouton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
  },
  bandeauBoutonTexte: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textOnPrimary,
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
  // « Écouter » : fond discret, contour de la couleur du thème. C'est une
  // commande d'étude, pas un jugement — elle ne doit donc pas peser autant que
  // « Mémorisé », qui écrit un résultat.
  ecouterBtn: {
    flex: 0,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySurface,
  },
  actionBtnText: {
    fontSize: fontSizes.sm,
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
  emptyHint: {
    fontSize: fontSizes.sm,
    color: colors.textTertiary,
    textAlign: 'center' as const,
    lineHeight: fontSizes.sm * 1.5,
    paddingHorizontal: spacing.lg,
  },
});
