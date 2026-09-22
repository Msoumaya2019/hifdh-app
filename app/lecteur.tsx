// Lecteur du Coran — deux affichages au choix.
//
//   - « Versets » : un verset par bloc, avec son numéro. Confortable pour
//     apprendre un passage précis, et pour le masquer verset par verset.
//   - « Page » : la page du moushaf, texte continu justifié, médaillons de fin
//     de verset, bandeau de sourate, en-tête et numéro de page. C'est la
//     disposition du Coran imprimé, et donc celle que beaucoup connaissent.
//
// Ce qui est exact dans l'affichage « page » : les **bornes** de page, c'est-à-
// dire la liste des versets que porte chaque page. Elles viennent de la donnée,
// sont vérifiées par `data/quran/verifier_pages.py` et coïncident avec celles de
// l'API quran.com sur les 6 236 versets.
//
// Ce qui ne l'est pas : les **coupures de ligne**. Une page imprimée coupe le
// texte à des endroits fixés par sa fonte et sa justification ; l'écran, lui,
// coupe selon sa largeur. Les versets de la page sont donc bien les bons, dans
// le bon ordre, mais le retour à la ligne ne tombe pas au même endroit que sur
// la page de papier. Le dire est plus honnête que de laisser croire à une
// reproduction à l'identique.

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, fonts, spacing, radii, fontWeights, lineHeights } from '@/theme';
import {
  getSurah,
  loadQuranText,
  getAyahRangeText,
  getPageOfAyah,
  getPageBounds,
  getPageVerses,
  getJuzOfAyah,
  getPagesOfRange,
  getPageCount,
} from '@/data/quranData';
import {
  updateSessionStatus,
  renforcerPassage,
  getUserConfig,
  saveUserConfig,
} from '@/lib/database';
import type { Surah, UserConfig, ModeAffichage } from '@/types';

// Le texte coranique est entièrement vocalisé : les signes montent au-dessus et
// descendent sous la ligne. L'interligne doit donc être généreux — mais il doit
// suivre le zoom. La valeur précédente était fixe (80 points) : en agrandissant
// le texte, les signes finissaient par se toucher.
const RATIO_INTERLIGNE_CORAN = 2.8;

const CLE = (surah: number, ayah: number) => `${surah}:${ayah}`;

export default function LecteurScreen() {
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

  const [surah, setSurah] = useState<Surah | undefined>();
  const [verses, setVerses] = useState<{ ayah: number; text: string }[]>([]);
  const [fontSize, setFontSize] = useState(28);
  const [hideMode, setHideMode] = useState(false);
  const [hiddenVerses, setHiddenVerses] = useState<Set<string>>(new Set());
  const [textLoaded, setTextLoaded] = useState(false);
  const [mode, setMode] = useState<ModeAffichage>('versets');
  const [config, setConfig] = useState<UserConfig | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setSurah(getSurah(surahNum));
  }, [surahNum]);

  useEffect(() => {
    loadQuranText().then(() => {
      setTextLoaded(true);
      setVerses(getAyahRangeText(surahNum, startAyah, endAyah));
      setHiddenVerses(new Set());
    });
  }, [surahNum, startAyah, endAyah]);

  // Le mode d'affichage vit dans la configuration : il est donc retrouvé à la
  // prochaine ouverture, et suit la sauvegarde d'un téléphone à l'autre.
  useEffect(() => {
    let actif = true;
    (async () => {
      const existante = await getUserConfig();
      if (!actif) return;
      setConfig(existante);
      setMode(existante?.affichage?.mode ?? 'versets');
    })();
    return () => {
      actif = false;
    };
  }, []);

  // En mode page, on ouvre sur la page qui porte le premier verset du passage.
  useEffect(() => {
    setPage(getPageOfAyah(surahNum, startAyah) ?? 1);
  }, [surahNum, startAyah]);

  const changerMode = useCallback(
    async (nouveau: ModeAffichage) => {
      setMode(nouveau);
      setHiddenVerses(new Set());
      if (config === null) return;
      const miseAJour: UserConfig = { ...config, affichage: { mode: nouveau } };
      setConfig(miseAJour);
      await saveUserConfig(miseAJour);
    },
    [config]
  );

  const basculerVersetCache = (cle: string) => {
    const nouveau = new Set(hiddenVerses);
    if (nouveau.has(cle)) nouveau.delete(cle);
    else nouveau.add(cle);
    setHiddenVerses(nouveau);
  };

  const basculerModeMasque = () => {
    if (!hideMode) {
      // Tout masquer sauf le premier verset du passage : c'est le point de
      // départ du travail de mémoire.
      setHiddenVerses(new Set(verses.slice(1).map((v) => CLE(surahNum, v.ayah))));
    } else {
      setHiddenVerses(new Set());
    }
    setHideMode(!hideMode);
  };

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
          <Pressable
            onPress={() => setFontSize(Math.max(16, fontSize - 4))}
            style={styles.zoomButton}
            accessibilityLabel="Réduire le texte"
          >
            <Ionicons name="remove" size={20} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={() => setFontSize(Math.min(60, fontSize + 4))}
            style={styles.zoomButton}
            accessibilityLabel="Agrandir le texte"
          >
            <Ionicons name="add" size={20} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={basculerModeMasque}
            style={[styles.zoomButton, hideMode && styles.zoomButtonActive]}
            accessibilityLabel="Mode mémorisation"
          >
            <Ionicons
              name={hideMode ? 'eye-off' : 'eye'}
              size={20}
              color={hideMode ? colors.textOnPrimary : colors.primary}
            />
          </Pressable>
        </View>
      </View>

      {/* Choix de l'affichage */}
      <View style={styles.modeBar}>
        {(['versets', 'page'] as ModeAffichage[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => changerMode(m)}
            style={[styles.modeOnglet, mode === m && styles.modeOngletActif]}
          >
            <Ionicons
              name={m === 'versets' ? 'list' : 'book'}
              size={16}
              color={mode === m ? colors.textOnPrimary : colors.primary}
            />
            <Text style={[styles.modeOngletTexte, mode === m && styles.modeOngletTexteActif]}>
              {m === 'versets' ? 'Verset par verset' : 'Page du moushaf'}
            </Text>
          </Pressable>
        ))}
      </View>

      {mode === 'versets' ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.rangeBarInline}>
            <Text style={styles.rangeText}>
              Versets {startAyah} à {endAyah}
            </Text>
          </View>

          {startAyah === 1 && surahNum !== 1 && surahNum !== 9 && (
            <Text style={[styles.bismillah, { fontSize: fontSize * 0.9 }]} selectable>
              بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
            </Text>
          )}

          {verses.map((verse) => {
            const cle = CLE(surahNum, verse.ayah);
            const cache = hiddenVerses.has(cle);
            return (
              <View key={verse.ayah} style={styles.verseBlock}>
                <Text
                  style={[styles.verseText, { fontSize, lineHeight: fontSize * RATIO_INTERLIGNE_CORAN }, cache && styles.verseHidden]}
                  selectable
                  onPress={() => hideMode && basculerVersetCache(cle)}
                >
                  {cache ? (
                    <Text style={styles.hiddenPlaceholder}>
                      ━━━━━━ ﴿{toArabicNumber(verse.ayah)}﴾ ━━━━━━{'\n'}
                      <Text style={styles.revealHint}>Toucher pour révéler</Text>
                    </Text>
                  ) : (
                    <Text>
                      {verse.text}{' '}
                      <Text style={styles.verseNumber}>﴿{toArabicNumber(verse.ayah)}﴾</Text>
                    </Text>
                  )}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <PageDuMoushaf
          page={page}
          fontSize={fontSize}
          hideMode={hideMode}
          hiddenVerses={hiddenVerses}
          onBasculerVerset={basculerVersetCache}
          pagesDuPassage={pagesDuPassage}
          onChangerPage={setPage}
        />
      )}

      {/* Barre de validation.
          Elle a deux formes selon d'où l'on vient : une séance du programme se
          juge (« mémorisé / à retravailler / reporter »), un passage ouvert
          depuis « À renforcer » se solde (« renforcé / pas encore »). Les deux
          écrivent la même chose au même endroit. */}
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

// === L'affichage « page du moushaf » =======================================

function PageDuMoushaf({
  page,
  fontSize,
  hideMode,
  hiddenVerses,
  onBasculerVerset,
  pagesDuPassage,
  onChangerPage,
}: {
  page: number;
  fontSize: number;
  hideMode: boolean;
  hiddenVerses: Set<string>;
  onBasculerVerset: (cle: string) => void;
  pagesDuPassage: number[];
  onChangerPage: (page: number) => void;
}) {
  const total = getPageCount();
  const bornes = getPageBounds(page);
  const versets = getPageVerses(page);
  const premier = versets[0];
  const surahDeLaPage = premier ? getSurah(premier.surah) : undefined;
  const juz = premier ? getJuzOfAyah(premier.surah, premier.ayah) : null;

  // Une page peut traverser une frontière de sourate — la dernière page du
  // moushaf en porte même trois. Le texte est donc découpé en groupes, un par
  // sourate, chacun précédé de son bandeau.
  const groupes: { surah: number; commence: boolean; versets: typeof versets }[] = [];
  for (const verset of versets) {
    const dernier = groupes.at(-1);
    if (dernier === undefined || dernier.surah !== verset.surah) {
      groupes.push({ surah: verset.surah, commence: verset.ayah === 1, versets: [verset] });
    } else {
      dernier.versets.push(verset);
    }
  }

  const dansLePassage = pagesDuPassage.includes(page);
  const interLigne = fontSize * RATIO_INTERLIGNE_CORAN;

  return (
    <View style={styles.pageWrapper}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContentPage}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.feuille}>
          {/* En-tête courant, comme sur la page imprimée */}
          <View style={styles.enTetePage}>
            <Text style={styles.enTeteJuz}>{juz !== null ? `Juz' ${juz}` : ''}</Text>
            <Text style={styles.enTeteSourate}>
              {surahDeLaPage ? `${surahDeLaPage.nameFr} ${surahDeLaPage.name}` : ''}
            </Text>
          </View>

          {groupes.map((groupe) => {
            const surahDuGroupe = getSurah(groupe.surah);
            return (
              <View key={`${groupe.surah}-${groupe.versets[0].ayah}`}>
                {groupe.commence && surahDuGroupe && (
                  <View style={styles.bandeauSourate}>
                    <Text style={styles.bandeauSourateTexte}>
                      {surahDuGroupe.nameFr} · {surahDuGroupe.name}
                    </Text>
                  </View>
                )}

                {groupe.commence && groupe.surah !== 1 && groupe.surah !== 9 && (
                  <Text style={[styles.basmalaPage, { fontSize: fontSize * 0.85, lineHeight: interLigne * 0.85 }]}>
                    بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
                  </Text>
                )}

                <Text
                  style={[styles.pageTexte, { fontSize, lineHeight: interLigne }]}
                  selectable
                >
                  {groupe.versets.map((verset) => {
                    const cle = CLE(verset.surah, verset.ayah);
                    const cache = hideMode && hiddenVerses.has(cle);
                    return (
                      <Text
                        key={cle}
                        onPress={hideMode ? () => onBasculerVerset(cle) : undefined}
                      >
                        {!cache && `${verset.text} `}
                        <Text style={[styles.medaillon, { fontSize: fontSize * 0.55 }]}>
                          {` ﴿${toArabicNumber(verset.ayah)}﴾ `}
                        </Text>
                      </Text>
                    );
                  })}
                </Text>
              </View>
            );
          })}

          <Text style={styles.numeroPage}>{toArabicNumber(page)}</Text>
        </View>

        <Text style={styles.notePage}>
          {dansLePassage
            ? 'Cette page porte une partie de ta séance du jour.'
            : 'Page hors de ta séance du jour.'}{' '}
          Les versets de la page sont ceux du moushaf ; les coupures de ligne, elles,
          suivent la largeur de ton écran et non celles de la page imprimée.
        </Text>
      </ScrollView>

      {/* Navigation de page */}
      <View style={styles.navPages}>
        <Pressable
          style={[styles.navPageBouton, page <= 1 && styles.navPageBoutonInactif]}
          disabled={page <= 1}
          onPress={() => onChangerPage(Math.max(1, page - 1))}
          accessibilityLabel="Page précédente"
        >
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
          <Text style={styles.navPageTexte}>Précédente</Text>
        </Pressable>

        <Text style={styles.navPageCompteur}>
          {page} / {total}
        </Text>

        <Pressable
          style={[styles.navPageBouton, page >= total && styles.navPageBoutonInactif]}
          disabled={page >= total}
          onPress={() => onChangerPage(Math.min(total, page + 1))}
          accessibilityLabel="Page suivante"
        >
          <Text style={styles.navPageTexte}>Suivante</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </Pressable>
      </View>

      {bornes && (
        <Text style={styles.navPageRepere}>
          Versets {bornes.start.surah}:{bornes.start.ayah} à {bornes.end.surah}:{bornes.end.ayah}
        </Text>
      )}
    </View>
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
  modeBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modeOnglet: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.primarySurface,
  },
  modeOngletActif: {
    backgroundColor: colors.primary,
  },
  modeOngletTexte: {
    fontSize: fontSizes.sm,
    color: colors.primary,
    fontWeight: fontWeights.medium,
  },
  modeOngletTexteActif: {
    color: colors.textOnPrimary,
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
  scrollContentPage: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  pageWrapper: {
    flex: 1,
  },
  // La feuille : fond légèrement crème et bord discret, comme une page.
  feuille: {
    backgroundColor: '#FFFDF7',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.beige,
    padding: spacing.lg,
  },
  enTetePage: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.sm,
    marginBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.beige,
  },
  enTeteJuz: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    fontWeight: fontWeights.medium,
  },
  enTeteSourate: {
    fontSize: fontSizes.sm,
    color: colors.primary,
    fontFamily: fonts.araby,
  },
  bandeauSourate: {
    backgroundColor: colors.primarySurface,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  bandeauSourateTexte: {
    fontSize: fontSizes.sm,
    color: colors.primary,
    fontFamily: fonts.araby,
  },
  basmalaPage: {
    textAlign: 'center',
    fontFamily: fonts.quran,
    color: colors.primary,
    marginBottom: spacing.md,
  },
  pageTexte: {
    fontFamily: fonts.quran,
    color: colors.textPrimary,
    textAlign: 'justify',
    writingDirection: 'rtl',
  },
  medaillon: {
    fontFamily: fonts.araby,
    color: colors.gold,
  },
  numeroPage: {
    textAlign: 'center',
    marginTop: spacing.lg,
    fontSize: fontSizes.sm,
    color: colors.textTertiary,
    fontFamily: fonts.araby,
  },
  notePage: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    lineHeight: 18,
    marginTop: spacing.md,
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
