// Lecteur du Coran — la page du moushaf.
//
// LA PAGE, ET RIEN D'AUTRE
// ------------------------
// L'affichage « verset par verset » a été **retiré de l'écran**, à la demande.
// Il n'a pas été supprimé : le mode existe encore dans les données
// (`ModeAffichage`), et les composants qui le dessinaient sont intacts. Rien
// n'est donc à réécrire pour le remettre — il suffit de rappeler son onglet.
//
// C'est un retrait, pas une suppression, et la distinction compte : le masquage
// verset par verset était l'outil de travail du mode texte, et le mode page ne
// l'offre pas de la même façon. Le jour où on le remet, il n'y aura rien à
// reconstruire.
//
// CE QUI EST MONTRÉ
// -----------------
// La page imprimée, presque plein écran, avec le surlignage des lignes qui
// portent la séance du jour. Le reste — les phrases d'explication, la plage de
// versets en clair — a été retiré : sur un écran de téléphone, l'utile c'est la
// page, et ces phrases prenaient la place qu'elle réclame.
//
// L'affichage « page » ne se réorganise pas selon la largeur de l'écran, et il
// n'a pas de réglage de taille : une page du moushaf ne se réagence pas. Elle
// est dessinée avec la police de page du complexe KFGQPC, celle du moushaf de
// Madine, où chaque mot imprimé est un seul glyphe.
//
// D'où viennent les coupures de ligne : de la mise en page engendrée par
// `data/quran/generer_layout_moushaf.py`, recoupée sur le moushaf imprimé —
// pages 1, 2, 77, 100, 128, 177, 208, 249, 443, 454. Le texte, lui, reste celui
// de Tanzil : la mise en page ne dit que des intervalles de jetons, jamais des
// lettres.
//
// LE SURLIGNAGE, ET SA LIMITE
// ---------------------------
// La page affichée est une image : on ne peut pas y colorer des mots. On
// surligne donc la **ligne**, en s'appuyant sur la mise en page qui dit, pour
// chacune des quinze lignes, quels versets elle porte. Un verset qui commence
// au milieu d'une ligne marque la ligne entière : c'est exact, et c'est la
// seule chose qui le soit sans mesurer la police de page. Voir
// `src/lib/surlignagePassage.ts`.

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, fonts, spacing, radii, fontWeights, useStyles, type Palette } from '@/theme';
import {
  getSurah,
  loadQuranText,
  getPageOfAyah,
  getPageBounds,
  getPagesOfRange,
  getPageCount,
} from '@/data/quranData';
import { LecteurPageMoushaf } from '@/components/LecteurPageMoushaf';
// `teintesMoushaf` reste : les styles du mode « verset par verset » en
// dérivent la couleur de l'encre (voir `verseText`).
import { teintesMoushaf } from '@/components/ornementsMoushaf';
import {
  updateSessionStatus,
  renforcerPassage,
  getUserConfig,
  saveUserConfig,
} from '@/lib/database';
import type { Surah, UserConfig } from '@/types';

export default function LecteurScreen() {
  const styles = useStyles(creerStyles);
  const router = useRouter();
  const params = useLocalSearchParams<{
    surah: string;
    startAyah: string;
    endAyah: string;
    sessionId?: string;
    /** « 1 » lorsque l'écran est ouvert depuis la liste « À renforcer ». */
    renforcer?: string;
  }>();

  const surahNum = parseInt(params.surah || '1', 10);
  const startAyah = parseInt(params.startAyah || '1', 10);
  const endAyah = parseInt(params.endAyah || '7', 10);
  const sessionId = params.sessionId;
  const depuisRenforcement = params.renforcer === '1';

  // La plage à surligner : c'est la séance ouverte, telle qu'elle a été
  // demandée. On ne la dérive pas de la page affichée — la page porte ce
  // qu'elle porte — et on ne la recalcule pas non plus : le lecteur a reçu ces
  // bornes en paramètres, et elles sont la vérité de ce qu'on est venu réciter.
  const passage = { surah: surahNum, startAyah, endAyah };

  const [surah, setSurah] = useState<Surah | undefined>();
  const [textLoaded, setTextLoaded] = useState(false);
  const [page, setPage] = useState(1);

  // Le plein écran du mode page.
  //
  // **Vrai par défaut**, désormais : la page doit occuper l'écran, et l'en-tête
  // avec le nom de la sourate n'apprend rien pendant la récitation. La sortie
  // existe — voir plus bas — et la barre de navigation réapparaît avec elle.
  const [pleinEcran, setPleinEcran] = useState(true);

  useEffect(() => {
    setSurah(getSurah(surahNum));
  }, [surahNum]);

  // Le texte des versets n'est plus chargé : plus rien ne l'affiche. Il reste
  // disponible par `getPageVerses` et `getAyahRangeText`, et le mode « verset
  // par verset » le relira le jour où on le remettra.
  useEffect(() => {
    loadQuranText().then(() => setTextLoaded(true));
  }, []);

  // La configuration enregistrée, corrigée si elle porte encore l'ancien mode.
  //
  // Un seul affichage est désormais offert — la page du moushaf. Une
  // configuration restée en mode « versets » est donc **ramenée** au mode page
  // plutôt que respectée : la respecter afficherait un écran dont l'onglet
  // n'existe plus, et l'utilisateur n'aurait aucun moyen d'en sortir. On écrit
  // la correction, pour que l'ouverture suivante n'ait plus à la refaire.
  //
  // Le mode n'a plus d'état : la page est le seul affichage. Le champ reste
  // écrit dans la configuration pour que le retour du mode « versets » se fasse
  // en rappelant un onglet, sans migration de données.
  useEffect(() => {
    let actif = true;
    (async () => {
      const existante = await getUserConfig();
      if (!actif) return;
      if (existante?.affichage?.mode === 'versets') {
        const corrigee: UserConfig = { ...existante, affichage: { mode: 'page' } };
        await saveUserConfig(corrigee);
      }
    })();
    return () => {
      actif = false;
    };
  }, []);

  // En mode page, on ouvre sur la page qui porte le premier verset du passage.
  useEffect(() => {
    setPage(getPageOfAyah(surahNum, startAyah) ?? 1);
  }, [surahNum, startAyah]);

  /**
   * Le verdict de l'apprenant sur la séance du jour.
   *
   * « J'ai mémorisé » et « À retravailler » passent par le même chemin que
   * l'onglet « À renforcer » : `renforcerPassage` écrit le niveau de
   * connaissance **et** fait avancer la révision espacée, dans une seule
   * transaction. Auparavant, seul « J'ai mémorisé » écrivait quelque chose ;
   * « À retravailler » se contentait d'un message et n'enregistrait rien, si
   * bien que le passage marqué était aussitôt oublié.
   */
  const handleValiderSeance = (statut: 'completed' | 'postponed') => {
    if (!sessionId) {
      router.back();
      return;
    }
    const passage = { surah: surahNum, startAyah, endAyah };
    updateSessionStatus(sessionId, statut).then(async () => {
      // Une séance reportée n'est pas un jugement sur le passage : elle ne
      // touche ni son niveau ni sa révision.
      if (statut === 'completed') await renforcerPassage(passage, true);
      router.back();
    });
  };

  /**
   * « À retravailler » : le passage rejoint « À renforcer ».
   *
   * La séance reste à faire — l'apprenant ne l'a pas mémorisée — et la
   * révision espacée retombe au niveau 0, donc à demain.
   */
  const handleARetravailler = () => {
    renforcerPassage({ surah: surahNum, startAyah, endAyah }, false).then(() => {
      Alert.alert(
        'À renforcer',
        'Ce passage t’attend dans « À renforcer », dans l’onglet Programme. La séance reste à faire.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    });
  };

  /** « Renforcé », depuis la liste : le passage quitte « À renforcer ». */
  const handleRenforce = () => {
    renforcerPassage({ surah: surahNum, startAyah, endAyah }, true).then(() => router.back());
  };

  /** « Pas encore », depuis la liste : il y reste, et revient demain. */
  const handlePasEncore = () => {
    renforcerPassage({ surah: surahNum, startAyah, endAyah }, false).then(() => router.back());
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

  const pagesDuPassage = getPagesOfRange(surahNum, startAyah, endAyah);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Les commandes flottantes du plein écran, portées par l'écran lui-même.
          Elles sont ici, et non seulement dans le composant de page, pour une
          raison précise : un mode plein écran dont la sortie dépend d'un
          composant enfant disparaît avec lui. Si la page échoue à charger, si
          l'image ne s'affiche pas, les boutons doivent rester — sans quoi
          l'écran devient un cul-de-sac.

          Deux commandes, et non une : REVENIR EN ARRIÈRE — quitter le lecteur —
          et QUITTER LE PLEIN ÉCRAN sont deux gestes différents. Le lecteur en
          plein écran n'en offrait aucun des deux, et les confondre obligerait à
          sortir du plein écran avant de pouvoir revenir : un détour pour une
          chose qu'on veut faire en un geste. */}
      {pleinEcran && (
        <View style={styles.barreHautePleinEcran}>
          <Pressable
            style={styles.boutonFlottant}
            onPress={() => router.back()}
            accessibilityLabel="Revenir en arrière"
            accessibilityRole="button"
            hitSlop={12}
          >
            <Ionicons name="arrow-back" size={22} color={colors.textOnPrimary} />
          </Pressable>
          <Pressable
            style={styles.boutonFlottant}
            onPress={() => setPleinEcran(false)}
            accessibilityLabel="Quitter le plein écran"
            accessibilityRole="button"
            hitSlop={12}
          >
            <Ionicons name="contract-outline" size={22} color={colors.textOnPrimary} />
          </Pressable>
        </View>
      )}

      {/* L'en-tête. Masqué en plein écran, qui est désormais l'état par défaut :
          pendant la récitation, le nom de la sourate et les boutons de zoom ne
          servent à rien. Les commandes du plein écran — revenir en arrière,
          quitter le plein écran — vivent au-dessus de la page, juste plus haut ;
          les flèches de page, elles, sont dans `LecteurPageMoushaf`, qui les
          garde désormais visibles dans les deux modes.

          L'onglet « Verset par verset » qui vivait ici a été retiré : il menait
          à un affichage qu'on ne veut plus montrer. Le mode existe toujours
          dans les données ; le remettre ne demandera que de rappeler cet
          onglet. */}
      {!pleinEcran && (
        <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.surahNameAr}>{surah.name}</Text>
          <Text style={styles.surahNameFr}>{surah.nameFr}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.zoomButton}
            onPress={() => setPleinEcran(true)}
            accessibilityLabel="Passer en plein écran"
          >
            <Ionicons name="expand-outline" size={20} color={colors.primary} />
          </Pressable>
        </View>
      </View>
      )}

      {/* La page du moushaf, avec le surlignage des lignes de la séance.

          L'image ne peut pas être coloriée mot à mot ; la mise en page dit en
          revanche quelles lignes portent quels versets. On surligne donc les
          lignes, ce qui est exact et suffisant — voir
          `src/lib/surlignagePassage.ts` pour la raison et pour la limite. */}
      <LecteurPageMoushaf
        page={page}
        total={getPageCount()}
        dansLePassage={pagesDuPassage.includes(page)}
        plageDeVersets={(() => {
          const bornes = getPageBounds(page);
          return bornes === null
            ? null
            : `Versets ${bornes.start.surah}:${bornes.start.ayah} à ${bornes.end.surah}:${bornes.end.ayah}`;
        })()}
        passage={passage}
        onPrecedente={() => setPage((p) => Math.max(1, p - 1))}
        onSuivante={() => setPage((p) => Math.min(getPageCount(), p + 1))}
        onAllerA={setPage}
        pleinEcran={pleinEcran}
        onBasculerPleinEcran={() => setPleinEcran((v) => !v)}
      />

      {/* Barre de validation.
          Elle a deux formes selon d'où l'on vient : une séance du programme se
          juge (« mémorisé / à retravailler / reporter »), un passage ouvert
          depuis « À renforcer » se solde (« renforcé / pas encore »). Les deux
          écrivent la même chose au même endroit.

          Elle reste visible EN PLEIN ÉCRAN. Elle y disparaissait au motif que
          « juger sa séance ne se fait pas sur une page qu'on feuillette » — un
          raisonnement tenable, mais qui laissait l'utilisateur réciter sa page
          sans aucun moyen de dire qu'il l'avait mémorisée. Il devait sortir du
          plein écran pour cela, c'est-à-dire faire un geste qui n'a rien à voir
          avec ce qu'il venait faire. */}
      {(sessionId || depuisRenforcement) && (
        <View style={styles.validationBar}>
          {sessionId ? (
            <>
              <Pressable
                style={[styles.validateButton, styles.validateComplete]}
                onPress={() => handleValiderSeance('completed')}
              >
                <Ionicons name="checkmark-circle" size={22} color={colors.textOnPrimary} />
                <Text style={styles.validateText}>J'ai mémorisé</Text>
              </Pressable>
              <Pressable
                style={[styles.validateButton, styles.validateReview]}
                onPress={handleARetravailler}
              >
                <Ionicons name="time" size={22} color={colors.warning} />
                <Text style={[styles.validateText, { color: colors.warning }]}>À retravailler</Text>
              </Pressable>
              <Pressable
                style={[styles.validateButton, styles.validatePostpone]}
                onPress={() => handleValiderSeance('postponed')}
              >
                <Ionicons name="calendar" size={22} color={colors.textSecondary} />
                <Text style={[styles.validateText, { color: colors.textSecondary }]}>Reporter</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                style={[styles.validateButton, styles.validateComplete]}
                onPress={handleRenforce}
              >
                <Ionicons name="checkmark-circle" size={22} color={colors.textOnPrimary} />
                <Text style={styles.validateText}>Renforcé</Text>
              </Pressable>
              <Pressable
                style={[styles.validateButton, styles.validateReview]}
                onPress={handlePasEncore}
              >
                <Ionicons name="time" size={22} color={colors.warning} />
                <Text style={[styles.validateText, { color: colors.warning }]}>Pas encore</Text>
              </Pressable>
            </>
          )}
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

const creerStyles = (colors: Palette) => StyleSheet.create({
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
  // Les commandes flottantes du plein écran : au-dessus de la page, dans le
  // coin. Elles restent visibles même si la page ne charge pas.
  barreHautePleinEcran: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    zIndex: 10,
  },
  boutonFlottant: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
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
  modeBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rangeBarInline: {
    backgroundColor: colors.primarySurface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    marginBottom: spacing.lg,
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
  pageWrapper: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  // La feuille : le crème de l'imprimé, et rien d'autre.
  //
  // Ce n'est pas le blanc de l'application, c'est le fond de la page du moushaf :
  // un blanc pur ferait ressortir les ornements comme des collages, là où le
  // crème les fond dans la page comme sur le papier.
  //
  // Elle occupe toute la hauteur disponible et ne défile pas : une page du
  // moushaf tient sur un écran, et ses quinze lignes se partagent la place. Un
  // défilement laisserait croire qu'on peut la faire glisser, alors que c'est
  // justement ce que le moushaf ne fait pas.
  feuille: {
    flex: 1,
    backgroundColor: teintesMoushaf.cremeClair,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: teintesMoushaf.brun,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    overflow: 'hidden',
  },
  enTetePage: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.xs,
    marginBottom: spacing.xs,
  },
  enTeteJuz: {
    fontSize: fontSizes.xs,
    color: teintesMoushaf.brunFonce,
    fontWeight: fontWeights.medium,
  },
  enTeteSourate: {
    fontSize: fontSizes.sm,
    color: teintesMoushaf.encre,
    fontFamily: fonts.araby,
  },
  // Le corps : c'est lui qui donne sa hauteur à la page, et donc la hauteur
  // d'une ligne — le quinzième. Il doit rester borné, sans quoi la mesure
  // n'aurait pas de sens.
  corpsPage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Le bloc des quinze lignes : ses dimensions sont celles de la page
  // imprimée, calculées à partir de sa largeur. Il est centré dans la place
  // disponible, et ne s'étire jamais.
  blocMoushaf: {
    justifyContent: 'center',
  },
  // Le cartouche d'une ligne d'en-tête, posé en arrière-plan de cette ligne.
  bandeauDerriereLigne: {
    position: 'absolute',
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Le support ovale d'un numéro de verset : il réserve la place du médaillon
  // dans la ligne, et le glyphe du numéro vient par-dessus.
  supportMedaillon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  numeroVersetDansMedaillon: {
    fontFamily: fonts.araby,
    color: teintesMoushaf.encre,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  // Une ligne du moushaf : un seul `Text`, dont les mots sont les codes de la
  // police de page collés les uns aux autres. Aucun séparateur, aucun
  // `letterSpacing`, aucune marge : le blanc entre les mots est dans l'avance
  // du glyphe, et l'ajouter élargirait la ligne de 2 %.
  ligneMoushaf: {
    color: teintesMoushaf.encre,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  // Le pied de page : le numéro, dans son cartouche, centré.
  piedPage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xs,
  },
  numeroDansCartouche: {
    fontFamily: fonts.araby,
    color: teintesMoushaf.encre,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  texteMoushaf: {
    fontFamily: fonts.quran,
    color: colors.textPrimary,
    textAlign: 'justify',
    writingDirection: 'rtl',
  },
  enteteMoushaf: {
    color: colors.primary,
    fontFamily: fonts.araby,
  },
  basmalaMoushaf: {
    color: colors.primary,
    fontFamily: fonts.quran,
  },
  medaillonMoushaf: {
    fontFamily: fonts.araby,
    color: colors.gold,
  },
  // Un verset masqué garde sa place : seuls ses mots disparaissent. Les retirer
  // redistribuerait la ligne, et la page ne serait plus celle du moushaf.
  motCache: {
    opacity: 0,
  },
  pageIndisponible: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textTertiary,
    lineHeight: 20,
  },
  notePage: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  navPages: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  navPageBouton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.primarySurface,
  },
  navPageBoutonInactif: {
    opacity: 0.35,
  },
  navPageTexte: {
    fontSize: fontSizes.sm,
    color: colors.primary,
    fontWeight: fontWeights.medium,
  },
  navPageCompteur: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: fontWeights.semibold,
  },
  navPageRepere: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingBottom: spacing.xs,
    backgroundColor: colors.surface,
  },
  ayahContainer: {
    alignItems: 'stretch',
  },
  bismillah: {
    textAlign: 'center',
    fontFamily: fonts.quran,
    color: colors.primary,
    marginBottom: spacing.lg,
  },
  verseBlock: {
    marginBottom: spacing.md,
  },
  verseText: {
    fontFamily: fonts.quran,
    color: colors.textPrimary,
    textAlign: 'justify',
    writingDirection: 'rtl',
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
