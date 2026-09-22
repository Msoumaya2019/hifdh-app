// Lecteur du Coran — deux affichages au choix.
//
//   - « Versets » : un verset par bloc, avec son numéro. Confortable pour
//     apprendre un passage précis, et pour le masquer verset par verset.
//   - « Page » : la page du moushaf, quinze lignes, les mots aux places que
//     l'imprimeur leur a données. C'est la disposition du Coran imprimé, et
//     donc celle que beaucoup connaissent.
//
// L'affichage « page » ne se réorganise pas selon la largeur de l'écran, et il
// n'a pas de réglage de taille : une page du moushaf ne se réagence pas. La
// taille du texte est calculée une fois, pour que chacune des quinze lignes
// tienne d'un seul tenant — un mot qui passerait à la ligne suivante ne serait
// plus à la place que le moushaf lui donne.
//
// D'où viennent les coupures de ligne : de la mise en page engendrée par
// `data/quran/generer_layout_moushaf.py`, recoupée sur cinq pages du moushaf
// imprimé (1, 2, 77, 128, 401). Le texte, lui, reste celui de Tanzil : la mise
// en page ne dit que des intervalles de jetons, jamais des lettres.

import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
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
  getLignesDuMoushaf,
  getEnteteEnMarge,
  getLignesParPageMoushaf,
  getTexteJetons,
} from '@/data/quranData';
import type { ElementMoushaf } from '@/data/quranData';
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
          {/* Le réglage de taille n'existe qu'en affichage « versets ». Une page
              du moushaf ne se réagence pas : laisser un bouton qui agrandit le
              texte laisserait croire le contraire, et la première ligne trop
              longue ferait passer des mots à la ligne suivante — donc à une
              place que l'imprimeur ne leur a pas donnée. */}
          {mode === 'versets' && (
            <>
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
            </>
          )}
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
//
// La page est rendue comme un seul bloc de texte, dont les quinze lignes sont
// séparées par des retours à la ligne. Le choix n'est pas cosmétique : dans un
// bloc de texte, `textAlign: 'justify'` étire **toutes** les lignes sauf la
// dernière. Quinze blocs séparés ne s'étireraient pas du tout — chacun serait
// la dernière ligne de son propre bloc — et la page aurait des bords en dents
// de scie au lieu des deux bords pleins du moushaf.
//
// La hauteur de ligne vaut le quinzième de la hauteur disponible, si bien que
// les quinze lignes remplissent exactement la page. La taille du texte, elle,
// est la plus grande qui laisse chaque ligne d'un seul tenant : on la cherche
// en réduisant tant qu'une ligne se coupe, ce que `onTextLayout` signale en
// rendant plus de quinze lignes.

/** Taille de départ de la recherche. Réduite tant qu'une ligne se coupe. */
const TAILLE_PAGE_DEPART = 26;

/** Plancher : en dessous, la page ne serait plus lisible. */
const TAILLE_PAGE_MIN = 11;

/** Part de la hauteur de ligne que la taille du texte ne doit pas dépasser. */
const PART_HAUTEUR_TEXTE = 0.82;

function PageDuMoushaf({
  page,
  hideMode,
  hiddenVerses,
  onBasculerVerset,
  pagesDuPassage,
  onChangerPage,
}: {
  page: number;
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

  const lignes = getLignesDuMoushaf(page);
  const surahEnMarge = getEnteteEnMarge(page);
  const nombreDeLignes = getLignesParPageMoushaf();

  const [hauteur, setHauteur] = useState(0);
  const [taille, setTaille] = useState(TAILLE_PAGE_DEPART);
  const [coupee, setCoupee] = useState(false);

  // Une autre page : on repart de la taille haute, et on remesure.
  useEffect(() => {
    setTaille(TAILLE_PAGE_DEPART);
    setCoupee(false);
  }, [page]);

  // Tant qu'une ligne se coupe, on réduit. Le plancher arrête la boucle : au
  // plancher, la taille ne change plus, donc plus rien ne se remesure.
  useEffect(() => {
    if (!coupee) return;
    setCoupee(false);
    setTaille((precedente) => {
      if (precedente <= TAILLE_PAGE_MIN) return precedente;
      return Math.max(TAILLE_PAGE_MIN, Math.round(precedente * 0.94 * 10) / 10);
    });
  }, [coupee]);

  const hauteurDeLigne = hauteur > 0 ? hauteur / nombreDeLignes : 0;
  const tailleUtile = Math.min(taille, hauteurDeLigne * PART_HAUTEUR_TEXTE);

  const dansLePassage = pagesDuPassage.includes(page);

  return (
    <View style={styles.pageWrapper}>
      <View style={styles.feuille}>
        {/* Bande de marge, comme sur la page imprimée : le juz' et la sourate
            du premier verset, ou la sourate renvoyée en marge quand la page
            ouvre une sourate — c'est alors là, et non dans la page, que le
            moushaf écrit son nom. */}
        <View style={styles.enTetePage}>
          <Text style={styles.enTeteJuz}>{juz !== null ? `Juz' ${juz}` : ''}</Text>
          <Text style={styles.enTeteSourate}>
            {(() => {
              const nommee = surahEnMarge !== null ? getSurah(surahEnMarge) : surahDeLaPage;
              return nommee ? `${nommee.nameFr} ${nommee.name}` : '';
            })()}
          </Text>
        </View>

        <View
          style={styles.corpsPage}
          onLayout={(evenement) => setHauteur(evenement.nativeEvent.layout.height)}
        >
          {lignes === null ? (
            <Text style={styles.pageIndisponible}>
              La mise en page de cette page n’est pas disponible. Les versets
              restent lisibles dans l’affichage « Verset par verset ».
            </Text>
          ) : (
            hauteur > 0 && (
              <Text
                style={[
                  styles.texteMoushaf,
                  { fontSize: tailleUtile, lineHeight: hauteurDeLigne },
                ]}
                selectable
                onTextLayout={(evenement) => {
                  if (evenement.nativeEvent.lines.length > nombreDeLignes) setCoupee(true);
                }}
              >
                {lignes.map((ligne, indiceLigne) => (
                  <Text key={`ligne-${indiceLigne}`}>
                    {indiceLigne > 0 ? '\n' : ''}
                    {contenuDeLigne(ligne, indiceLigne, hideMode, hiddenVerses, onBasculerVerset)}
                  </Text>
                ))}
              </Text>
            )
          )}
        </View>

        <Text style={styles.numeroPage}>{toArabicNumber(page)}</Text>
      </View>

      <Text style={styles.notePage}>
        {dansLePassage
          ? 'Cette page porte une partie de ta séance du jour.'
          : 'Page hors de ta séance du jour.'}{' '}
        Les mots sont aux places que leur donne le moushaf imprimé.
      </Text>

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

/**
 * Le contenu d'une ligne : ses mots, ses médaillons, son en-tête, sa basmala.
 *
 * Les mots sont pris au texte de Tanzil par leurs indices, jamais recopiés : la
 * mise en page ne porte que des intervalles, et une plage qui sortirait du
 * verset rend `null` plutôt qu'un mot déplacé.
 */
function contenuDeLigne(
  ligne: ElementMoushaf[],
  indiceLigne: number,
  hideMode: boolean,
  hiddenVerses: Set<string>,
  onBasculerVerset: (cle: string) => void
): ReactNode[] {
  const noeuds: ReactNode[] = [];

  ligne.forEach((element, indiceElement) => {
    const cle = `l${indiceLigne}-e${indiceElement}`;
    if (indiceElement > 0) noeuds.push(' ');

    switch (element.type) {
      case 'entete': {
        const surah = getSurah(element.surah);
        noeuds.push(
          <Text key={cle} style={styles.enteteMoushaf}>
            {surah ? `سُورَةُ ${surah.name}` : ''}
          </Text>
        );
        break;
      }

      case 'basmala': {
        // La basmala est celle du verset 1 de la sourate, dans le texte de
        // Tanzil : elle y est écrite, on ne la fabrique pas.
        const texte = getTexteJetons(element.surah, 1, 0, 3);
        noeuds.push(
          <Text key={cle} style={styles.basmalaMoushaf}>
            {texte ?? ''}
          </Text>
        );
        break;
      }

      case 'verset': {
        const texte = getTexteJetons(element.surah, element.ayah, element.premier, element.dernier);
        const cleVerset = CLE(element.surah, element.ayah);
        const cache = hideMode && hiddenVerses.has(cleVerset);
        noeuds.push(
          <Text
            key={cle}
            style={cache ? styles.motCache : undefined}
            onPress={hideMode ? () => onBasculerVerset(cleVerset) : undefined}
          >
            {texte ?? ''}
          </Text>
        );
        break;
      }

      case 'medaillon':
        noeuds.push(
          <Text key={cle} style={styles.medaillonMoushaf}>
            {`﴿${toArabicNumber(element.ayah)}﴾`}
          </Text>
        );
        break;
    }
  });

  return noeuds;
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
  pageWrapper: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  // La feuille : fond légèrement crème et bord discret, comme une page.
  //
  // Elle occupe toute la hauteur disponible et ne défile pas : une page du
  // moushaf tient sur un écran, et ses quinze lignes se partagent la place. Un
  // défilement laisserait croire qu'on peut la faire glisser, alors que c'est
  // justement ce que le moushaf ne fait pas.
  feuille: {
    flex: 1,
    backgroundColor: '#FFFDF7',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.beige,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  enTetePage: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.xs,
    marginBottom: spacing.xs,
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
  // Le corps : c'est lui qui donne sa hauteur à la page, et donc la hauteur
  // d'une ligne — le quinzième. Il doit rester borné, sans quoi la mesure
  // n'aurait pas de sens.
  corpsPage: {
    flex: 1,
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
  numeroPage: {
    textAlign: 'center',
    marginTop: spacing.xs,
    fontSize: fontSizes.sm,
    color: colors.textTertiary,
    fontFamily: fonts.araby,
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
