// Écran d'onboarding - Questionnaire initial en 4 étapes

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { colors, fontSizes, fonts, spacing, radii, fontWeights, useStyles, type Palette } from '@/theme';
import { getAllSurahs, getAllJuz, getAllHizb, getCompteLimitesEstimees } from '@/data/quranData';
import { getObjectiveVerseCount, getTotalQuranVerses } from '@/lib/progress';
import { saveUserConfig, synchroniserPassagesDeclares, getAllSessions, getMemorizedPassages, appliquerRecalcul, getUserConfig } from '@/lib/database';
import { planifierRecalcul } from '@/lib/programGenerator';
import { LIBELLES_QUESTIONNAIRE, ORDRE_OBJECTIFS } from '@/lib/libelles';
import type {
  UserConfig,
  MemorizedPassage,
  Objective,
  ObjectiveType,
  LearningUnit,
  KnowledgeLevel,
  Surah,
} from '@/types';

const TOTAL_STEPS = 4;
const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

// Lu dans les donnees, jamais recopie : le compte des limites estimees baisse a
// chaque relecture appliquee.
const compteToumoun = getCompteLimitesEstimees();

export default function OnboardingScreen() {
  const styles = useStyles(creerStyles);
  const router = useRouter();
  const [step, setStep] = useState(0);

  // État pour chaque question
  const [memorized, setMemorized] = useState<MemorizedPassage[]>([]);
  const [objective, setObjective] = useState<Objective>({ type: 'juz_amma' });
  const [unit, setUnit] = useState<LearningUnit>({ type: 'verses', count: 5 });
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);

  // La liste déclarée au chargement, conservée pour savoir ce qui a été
  // décoché. Sans elle, impossible de distinguer « jamais déclaré » de
  // « déclaré puis retiré » — et donc impossible de retirer quoi que ce soit.
  const declareesAuChargement = useRef<MemorizedPassage[]>([]);

  // Reprendre la configuration existante au lieu de repartir des valeurs par
  // défaut.
  //
  // Sans cela, refaire le questionnaire pour corriger un seul réglage remettait
  // l'objectif à « Juz' 'Amma », le rythme à 5 versets et les jours à
  // lundi-vendredi : un changement de rythme devenait un changement d'objectif,
  // en silence, et l'utilisateur n'avait aucun moyen de le voir avant de valider.
  //
  // Cela ne duplique rien : `addMemorizedPassage` met à jour la ligne existante
  // au lieu d'en ajouter une seconde, et `planifierRecalcul` conserve
  // l'historique des séances passées ou terminées.
  useEffect(() => {
    let actif = true;
    (async () => {
      const existante = await getUserConfig();
      if (!actif || existante === null) return;
      declareesAuChargement.current = existante.memorizedPassages ?? [];
      setMemorized(existante.memorizedPassages ?? []);
      setObjective(existante.objective);
      setUnit(existante.schedule.unit);
      setSelectedDays(existante.schedule.days);
    })();
    return () => {
      actif = false;
    };
  }, []);

  const handleComplete = useCallback(async () => {
    const config: UserConfig = {
      memorizedPassages: memorized,
      objective,
      schedule: { unit, days: selectedDays },
      onboardingCompleted: true,
    };

    await saveUserConfig(config);

    // Aligner la base sur la liste déclarée.
    //
    // La boucle précédente se contentait d'ajouter : décocher une sourate la
    // laissait en base, le recalcul la comptait comme connue, et la
    // réouverture la recochait. La désélection était donc sans effet, tout en
    // paraissant l'avoir été.
    await synchroniserPassagesDeclares(declareesAuChargement.current, memorized);
    declareesAuChargement.current = memorized;

    // Recalculer le programme en tenant compte de l'existant.
    //
    // Sans cela, refaire le questionnaire depuis le profil empilait un second
    // programme sur le premier : les séances déjà enregistrées n'étaient pas
    // connues du générateur, et deux séances se retrouvaient à la même date.
    // L'historique — séances terminées ou passées — est conservé.
    const existantes = await getAllSessions();
    // Les passages viennent de la base, où les séances terminées les ont ajoutés :
    // `config.memorizedPassages` ne reflète que le questionnaire.
    const memorises = await getMemorizedPassages();
    await appliquerRecalcul(planifierRecalcul(config, existantes, memorises));

    router.replace('/(tabs)');
  }, [memorized, objective, unit, selectedDays, router]);

  const canProceed = () => {
    if (step === 0) return true; // Peut ne rien connaître
    if (step === 1) return objective.type !== undefined;
    if (step === 2) return unit.type !== undefined;
    if (step === 3) return selectedDays.length > 0;
    return false;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Barre de progression */}
      <View style={styles.progressContainer}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View
            key={i}
            style={[styles.progressDot, i <= step && styles.progressDotActive]}
          />
        ))}
      </View>

      {/* Contenu */}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {step === 0 && (
          <StepKnowledge memorized={memorized} setMemorized={setMemorized} />
        )}
        {step === 1 && (
          <StepObjective objective={objective} setObjective={setObjective} />
        )}
        {step === 2 && (
          <StepRhythm unit={unit} setUnit={setUnit} />
        )}
        {step === 3 && (
          <StepDays selectedDays={selectedDays} setSelectedDays={setSelectedDays} />
        )}
      </ScrollView>

      {/* Navigation */}
      <View style={styles.navigation}>
        {step > 0 && (
          <Pressable style={styles.navButtonSecondary} onPress={() => setStep(step - 1)}>
            <Ionicons name="arrow-back" size={20} color={colors.primary} />
            <Text style={styles.navButtonTextDark}>Précédent</Text>
          </Pressable>
        )}
        {step < TOTAL_STEPS - 1 ? (
          <Pressable
            style={[styles.navButtonPrimary, !canProceed() && styles.navButtonDisabled]}
            onPress={() => canProceed() && setStep(step + 1)}
            disabled={!canProceed()}
          >
            <Text style={styles.navButtonTextLight}>Continuer</Text>
            <Ionicons name="arrow-forward" size={20} color={colors.textOnPrimary} />
          </Pressable>
        ) : (
          <Pressable style={styles.navButtonPrimary} onPress={handleComplete}>
            <Text style={styles.navButtonTextLight}>Terminer</Text>
            <Ionicons name="checkmark" size={20} color={colors.textOnPrimary} />
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

// === Étape 1: Que connais-tu déjà ? ===

// Les trois niveaux de la spécification. « unknown » n'est pas l'absence de
// déclaration : c'est un passage que l'on sait ne pas connaître. Il compte donc
// dans le programme à venir, mais pas dans la progression — ce que
// `subtractMemorized` et `computeProgressStats` traduisent déjà.
const NIVEAUX: {
  niveau: KnowledgeLevel;
  libelle: string;
  court: string;
  icone: string;
  couleur: string;
}[] = [
  { niveau: 'perfect', libelle: 'Parfaitement mémorisé', court: 'Parfait', icone: 'checkmark', couleur: colors.success },
  { niveau: 'needs_review', libelle: 'À réviser', court: 'À réviser', icone: 'time', couleur: colors.warning },
  { niveau: 'unknown', libelle: 'Pas encore connu', court: 'Inconnu', icone: 'help', couleur: colors.textTertiary },
];

function libelleNiveau(niveau: KnowledgeLevel): string {
  return NIVEAUX.find((n) => n.niveau === niveau)?.libelle ?? niveau;
}

function memePassage(
  a: { surah: number; startAyah: number; endAyah: number },
  b: { surah: number; startAyah: number; endAyah: number }
): boolean {
  return a.surah === b.surah && a.startAyah === b.startAyah && a.endAyah === b.endAyah;
}

function StepKnowledge({
  memorized,
  setMemorized,
}: {
  memorized: MemorizedPassage[];
  setMemorized: (m: MemorizedPassage[]) => void;
}) {
  const styles = useStyles(creerStyles);
  const surahs = getAllSurahs();
  const [ouverte, setOuverte] = useState<number | null>(null);
  const [debut, setDebut] = useState('1');
  const [fin, setFin] = useState('1');
  const [niveauPassage, setNiveauPassage] = useState<KnowledgeLevel>('perfect');
  const [message, setMessage] = useState<string | null>(null);

  const passagesDe = (surahNum: number) => memorized.filter((m) => m.surah === surahNum);

  const declarationEntiere = (surah: Surah) =>
    memorized.find(
      (m) => m.surah === surah.number && m.startAyah === 1 && m.endAyah === surah.ayahCount
    );

  /**
   * Pose, change ou retire le niveau d'une sourate entière.
   *
   * Toucher le niveau déjà actif **décoche** : c'est le seul geste qui retire
   * une déclaration, et il doit être possible sans détour. Les passages précis
   * de la même sourate ne sont pas touchés — un chevauchement est sans effet,
   * la progression comptant des versets distincts.
   */
  const basculerSourate = (surah: Surah, niveauChoisi: KnowledgeLevel) => {
    const entiere = declarationEntiere(surah);
    const sansEntiere = memorized.filter((m) => !memePassage(m, {
      surah: surah.number,
      startAyah: 1,
      endAyah: surah.ayahCount,
    }));

    if (entiere?.level === niveauChoisi) {
      setMemorized(sansEntiere);
      return;
    }

    setMemorized([
      ...sansEntiere,
      { surah: surah.number, startAyah: 1, endAyah: surah.ayahCount, level: niveauChoisi },
    ]);
  };

  const ajouterPassage = (surah: Surah) => {
    const d = parseInt(debut, 10);
    const f = parseInt(fin, 10);

    if (!Number.isFinite(d) || !Number.isFinite(f)) {
      setMessage('Indique un début et une fin, en chiffres.');
      return;
    }
    if (d < 1 || f > surah.ayahCount || d > f) {
      setMessage(
        `La sourate ${surah.nameFr} compte ${surah.ayahCount} versets : choisis un intervalle entre 1 et ${surah.ayahCount}.`
      );
      return;
    }

    const voulu = { surah: surah.number, startAyah: d, endAyah: f, level: niveauPassage };
    setMemorized([...memorized.filter((m) => !memePassage(m, voulu)), voulu]);
    setMessage(null);
  };

  const retirerPassage = (passage: MemorizedPassage) => {
    setMemorized(memorized.filter((m) => !memePassage(m, passage)));
  };

  const entieres = memorized.filter((m) =>
    surahs.some((s) => s.number === m.surah && m.startAyah === 1 && m.endAyah === s.ayahCount)
  ).length;
  const precis = memorized.length - entieres;

  const ouvrir = (surah: Surah) => {
    const dejaOuverte = ouverte === surah.number;
    setOuverte(dejaOuverte ? null : surah.number);
    setDebut('1');
    setFin(String(surah.ayahCount));
    setNiveauPassage('perfect');
    setMessage(null);
  };

  return (
    <View>
      <Text style={styles.stepTitle}>Que connais-tu déjà du Coran ?</Text>
      <Text style={styles.stepSubtitle}>
        Sélectionne les sourates que tu connais, avec leur niveau. Touche à nouveau
        un niveau pour décocher. Tu pourras modifier cela plus tard.
      </Text>

      <View style={styles.legend}>
        {NIVEAUX.map((n) => (
          <View key={n.niveau} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: n.couleur }]} />
            <Text style={styles.legendText}>{n.libelle}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.knowledgeSummary}>
        {memorized.length === 0
          ? 'Aucune connaissance déclarée pour le moment.'
          : `${entieres} sourate${entieres > 1 ? 's' : ''} entière${entieres > 1 ? 's' : ''}` +
            (precis > 0 ? ` et ${precis} passage${precis > 1 ? 's' : ''} précis` : '') +
            ' déclarés.'}
      </Text>

      <View style={styles.surahList}>
        {surahs.map((surah, index) => {
          const entiere = declarationEntiere(surah);
          const passages = passagesDe(surah.number);
          const estOuverte = ouverte === surah.number;

          return (
            <View key={surah.number}>
              {index > 0 && <View style={styles.separateur} />}

              <View style={styles.surahItem}>
                <Pressable style={styles.surahInfo} onPress={() => ouvrir(surah)}>
                  <Text style={styles.surahName}>{surah.nameFr}</Text>
                  <Text style={styles.surahDetails}>
                    {surah.ayahCount} versets · {surah.isMeccan ? 'Mecquoise' : 'Médinoise'}
                    {passages.length > 0
                      ? ` · ${passages.length} déclaration${passages.length > 1 ? 's' : ''}`
                      : ''}
                  </Text>
                </Pressable>

                <View style={styles.levelButtons}>
                  {NIVEAUX.map((n) => {
                    const actif = entiere?.level === n.niveau;
                    return (
                      <Pressable
                        key={n.niveau}
                        accessibilityLabel={`${n.libelle} — sourate ${surah.nameFr}`}
                        accessibilityState={{ selected: actif }}
                        onPress={() => basculerSourate(surah, n.niveau)}
                        style={[
                          styles.levelBtn,
                          actif && { backgroundColor: n.couleur, borderColor: n.couleur },
                        ]}
                      >
                        <Ionicons
                          name={n.icone as any}
                          size={14}
                          color={actif ? colors.textOnPrimary : colors.textTertiary}
                        />
                      </Pressable>
                    );
                  })}
                  <Pressable
                    accessibilityLabel={`Passages précis — sourate ${surah.nameFr}`}
                    onPress={() => ouvrir(surah)}
                    style={[styles.levelBtn, estOuverte && styles.levelBtnOuvert]}
                  >
                    <Ionicons
                      name={estOuverte ? 'chevron-up' : 'ellipsis-horizontal'}
                      size={14}
                      color={estOuverte ? colors.textOnPrimary : colors.primary}
                    />
                  </Pressable>
                </View>
              </View>

              {estOuverte && (
                <View style={styles.passagePanel}>
                  <Text style={styles.panelTitle}>Passages précis</Text>
                  <Text style={styles.panelHint}>
                    Pour une partie de sourate seulement. Touche une déclaration
                    ci-dessous pour la retirer.
                  </Text>

                  <View style={styles.passageForm}>
                    <TextInput
                      style={styles.champNombre}
                      keyboardType="number-pad"
                      value={debut}
                      onChangeText={setDebut}
                      placeholder="du"
                      accessibilityLabel="Premier verset"
                    />
                    <Text style={styles.passageFormSep}>à</Text>
                    <TextInput
                      style={styles.champNombre}
                      keyboardType="number-pad"
                      value={fin}
                      onChangeText={setFin}
                      placeholder="au"
                      accessibilityLabel="Dernier verset"
                    />
                    <Pressable style={styles.boutonAjouter} onPress={() => ajouterPassage(surah)}>
                      <Ionicons name="add" size={18} color={colors.textOnPrimary} />
                      <Text style={styles.boutonAjouterTexte}>Ajouter</Text>
                    </Pressable>
                  </View>

                  <View style={styles.niveauxLigne}>
                    {NIVEAUX.map((n) => (
                      <Pressable
                        key={n.niveau}
                        onPress={() => setNiveauPassage(n.niveau)}
                        style={[
                          styles.niveauPuce,
                          niveauPassage === n.niveau && {
                            backgroundColor: n.couleur,
                            borderColor: n.couleur,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.niveauPuceTexte,
                            niveauPassage === n.niveau && styles.niveauPuceTexteActif,
                          ]}
                        >
                          {n.court}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {message !== null && <Text style={styles.messageErreur}>{message}</Text>}

                  {passages.length === 0 ? (
                    <Text style={styles.panelVide}>Aucune déclaration pour cette sourate.</Text>
                  ) : (
                    passages
                      .slice()
                      .sort((a, b) => a.startAyah - b.startAyah)
                      .map((p) => (
                        <Pressable
                          key={`${p.startAyah}-${p.endAyah}`}
                          style={styles.declaration}
                          onPress={() => retirerPassage(p)}
                          accessibilityLabel={`Retirer les versets ${p.startAyah} à ${p.endAyah}`}
                        >
                          <Ionicons name="close-circle" size={18} color={colors.error} />
                          <Text style={styles.declarationTexte}>
                            {p.startAyah === 1 && p.endAyah === surah.ayahCount
                              ? `Sourate entière · ${libelleNiveau(p.level)}`
                              : `Versets ${p.startAyah} à ${p.endAyah} · ${libelleNiveau(p.level)}`}
                          </Text>
                        </Pressable>
                      ))
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// === Étape 2: Quel est ton objectif ? ===

/**
 * Les objectifs, **du plus facile au plus difficile**.
 *
 * L'ordre vient de `ORDRE_OBJECTIFS`, où il est tenu par un test — et non de
 * cette liste, qui ne fait que porter les icônes. Une liste recopiée ici aurait
 * pu diverger de celle qu'énumère le test sans que rien ne le dise.
 *
 * Le nombre de versets, lui, se calcule : l'écran affiche « 564 versets ·
 * 1/11e du Coran » à partir des seules données, jamais d'un chiffre écrit ici.
 */
const ICONES_OBJECTIFS: Record<ObjectiveType, string> = {
  short_surahs: 'sparkles',
  juz_amma: 'book',
  up_to_yassin: 'bookmark',
  half_quran: 'pie-chart',
  full_quran: 'library',
  hizb_sabbih: 'bookmark',
  specific_juz: 'document',
  specific_hizb: 'bookmarks',
  custom: 'create',
};

function StepObjective({
  objective,
  setObjective,
}: {
  objective: Objective;
  setObjective: (o: Objective) => void;
}) {
  const styles = useStyles(creerStyles);
  // Le nombre de versets de chaque objectif se mesure, il ne s'écrit pas. Un
  // objectif dont les données ne rendraient aucune plage affiche « à définir »
  // plutôt qu'un « 0 verset » qui ferait croire à un objectif vide.
  const versetsDe = (type: ObjectiveType): number =>
    type === 'specific_juz' || type === 'specific_hizb' || type === 'custom'
      ? -1
      : getObjectiveVerseCount({ type } as Objective);

  const total = getTotalQuranVerses();

  /** « 564 versets · 1/11e du Coran » — la part arrondie, jamais fausse. */
  const description = (type: ObjectiveType): string | null => {
    const n = versetsDe(type);
    if (n <= 0) return null;
    const part = total / n;
    const partTexte =
      part >= 2 ? `1/${Math.round(part)}e du Coran` : `${Math.round((n / total) * 100)} % du Coran`;
    return `${n} versets · ${partTexte}`;
  };

  return (
    <View>
      <Text style={styles.stepTitle}>Quel est ton objectif ?</Text>
      <Text style={styles.stepSubtitle}>
        Du plus court au plus long. Choisis ce que tu souhaites mémoriser.
      </Text>

      {ORDRE_OBJECTIFS.map((type) => (
        <Pressable
          key={type}
          onPress={() => setObjective({ type } as Objective)}
          style={({ pressed }) => [
            styles.objectiveCard,
            objective.type === type && styles.objectiveCardActive,
            pressed && { opacity: 0.8 },
          ]}
        >
          <Ionicons
            name={ICONES_OBJECTIFS[type] as any}
            size={24}
            color={objective.type === type ? colors.textOnPrimary : colors.primary}
          />
          <View style={styles.objectiveTextBloc}>
            <Text
              style={[
                styles.objectiveText,
                objective.type === type && styles.objectiveTextActive,
              ]}
            >
              {LIBELLES_QUESTIONNAIRE[type]}
            </Text>
            {description(type) !== null && (
              <Text
                style={[
                  styles.objectiveDetail,
                  objective.type === type && styles.objectiveDetailActif,
                ]}
              >
                {description(type)}
              </Text>
            )}
          </View>
          {objective.type === type && (
            <Ionicons name="checkmark-circle" size={24} color={colors.textOnPrimary} />
          )}
        </Pressable>
      ))}

      {/* Sélecteur de juz' */}
      {objective.type === 'specific_juz' && (
        <View style={styles.pickerContainer}>
          <Text style={styles.pickerLabel}>Choisis ton juz' (1-30) :</Text>
          <View style={styles.juzGrid}>
            {Array.from({ length: 30 }, (_, i) => i + 1).map((juzNum) => (
              <Pressable
                key={juzNum}
                onPress={() => setObjective({ type: 'specific_juz', juzNumber: juzNum })}
                style={[styles.juzItem, objective.juzNumber === juzNum && styles.juzItemActive]}
              >
                <Text style={[styles.juzItemText, objective.juzNumber === juzNum && styles.juzItemTextActive]}>
                  {juzNum}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Sélecteur de hizb */}
      {objective.type === 'specific_hizb' && (
        <View style={styles.pickerContainer}>
          <Text style={styles.pickerLabel}>Choisis un ou plusieurs hizb (1-60) :</Text>
          <View style={styles.juzGrid}>
            {Array.from({ length: 60 }, (_, i) => i + 1).map((hizbNum) => {
              const selected = objective.hizbNumbers?.includes(hizbNum) ?? false;
              return (
                <Pressable
                  key={hizbNum}
                  onPress={() => {
                    const current = objective.hizbNumbers ?? [];
                    const newHizbs = selected
                      ? current.filter((h) => h !== hizbNum)
                      : [...current, hizbNum].sort();
                    setObjective({ type: 'specific_hizb', hizbNumbers: newHizbs });
                  }}
                  style={[styles.juzItem, selected && styles.juzItemActive]}
                >
                  <Text style={[styles.juzItemText, selected && styles.juzItemTextActive]}>
                    {hizbNum}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Objectif personnalisé */}
      {objective.type === 'custom' && (
        <View style={styles.pickerContainer}>
          <Text style={styles.pickerLabel}>Sélectionne les sourates à mémoriser :</Text>
          <Text style={styles.pickerHint}>
            L'objectif doit représenter au minimum un hizb (environ 100 versets).
          </Text>
          <View style={styles.juzGrid}>
            {getAllSurahs().map((surah) => {
              const selected = objective.passages?.some(
                (p) => p.surah === surah.number && p.startAyah === 1 && p.endAyah === surah.ayahCount
              ) ?? false;
              return (
                <Pressable
                  key={surah.number}
                  onPress={() => {
                    const current = objective.passages ?? [];
                    const newPassages = selected
                      ? current.filter((p) => p.surah !== surah.number)
                      : [...current, { surah: surah.number, startAyah: 1, endAyah: surah.ayahCount }];
                    setObjective({ type: 'custom', passages: newPassages });
                  }}
                  style={[styles.juzItem, selected && styles.juzItemActive]}
                >
                  <Text style={[styles.juzItemText, selected && styles.juzItemTextActive]}>
                    {surah.number}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

// === Étape 3: Quel rythme souhaites-tu ? ===

/** Les trois niveaux, du plus léger au plus lourd. */
const ORDRE_NIVEAUX = ['debutant', 'intermediaire', 'intensif'] as const;

type NiveauRythme = (typeof ORDRE_NIVEAUX)[number];

/**
 * Ce que chaque niveau demande, en une phrase.
 *
 * Écrit ici, dans un `Record` complet : ajouter un niveau oblige à lui donner
 * un nom et un résumé, sinon le fichier ne compile pas. Un niveau sans libellé
 * afficherait un titre vide, au-dessus de ses choix — l'apprenant verrait trois
 * groupes dont l'un n'a pas de nom.
 */
const LIBELLES_NIVEAUX: Record<NiveauRythme, { nom: string; resume: string }> = {
  debutant: { nom: 'Débutant', resume: '1 ou 3 versets par jour' },
  intermediaire: { nom: 'Intermédiaire', resume: 'Une demi-page par jour' },
  intensif: { nom: 'Intensif', resume: '1 page, 1 toumoun ou 1 rub’ par jour' },
};

/**
 * Les six rythmes proposés, du plus léger au plus lourd.
 *
 * La liste s'arrête volontairement au rub' : au-delà, la séance quotidienne
 * devient une séance de révision plus qu'une mémorisation, et l'apprenant qui
 * veut davantage dispose du nisf et du hizb comme objectifs. Les unités
 * `nisf` et `hizb` restent dans le modèle et restent lisibles — c'est le
 * **choix** qui n'est plus offert au questionnaire, pas la donnée.
 *
 * « Une demi-page » ne porte pas de `count` : c'est le type `half_page`, dont la
 * quantité est définie par la page, pas par un multiplicateur.
 *
 * Le champ `niveau` ne remplace rien : il range. La liste reste la source
 * unique de ce que le questionnaire propose — un rythme qui n'y serait pas
 * n'existerait pas — et les niveaux ne font que la présenter par groupes. Un
 * rythme dont le niveau n'est pas dans `ORDRE_NIVEAUX` n'apparaîtrait nulle
 * part, et c'est `tests/objectifs_ordre.test.mjs` qui le dit.
 */
const RYTHMES: { unit: LearningUnit; label: string; icon: string; niveau: NiveauRythme }[] = [
  { unit: { type: 'verses', count: 1 }, label: '1 verset par jour', icon: 'ellipse-outline', niveau: 'debutant' },
  { unit: { type: 'verses', count: 3 }, label: '3 versets par jour', icon: 'text', niveau: 'debutant' },
  { unit: { type: 'half_page' }, label: 'Une demi-page par jour', icon: 'document-outline', niveau: 'intermediaire' },
  { unit: { type: 'page', count: 1 }, label: '1 page par jour', icon: 'document', niveau: 'intensif' },
  { unit: { type: 'thumn', count: 1 }, label: '1 toumoun par jour', icon: 'square-outline', niveau: 'intensif' },
  { unit: { type: 'rub', count: 1 }, label: "1 rub' par jour", icon: 'square', niveau: 'intensif' },
];

function StepRhythm({
  unit,
  setUnit,
}: {
  unit: LearningUnit;
  setUnit: (u: LearningUnit) => void;
}) {
  const styles = useStyles(creerStyles);
  const isSameUnit = (a: LearningUnit, b: LearningUnit) => {
    if (a.type !== b.type) return false;
    if ('count' in a && 'count' in b) return a.count === b.count;
    return true;
  };

  return (
    <View>
      <Text style={styles.stepTitle}>Quel rythme souhaites-tu ?</Text>
      <Text style={styles.stepSubtitle}>
        Trois niveaux, du plus léger au plus lourd. Choisis la quantité à
        apprendre par séance.
      </Text>

      {ORDRE_NIVEAUX.map((niveau) => (
        <View key={niveau} style={styles.niveau}>
          {/* Le nom du niveau, et ce qu'il demande. Le résumé est là parce que
              « Débutant » seul ne dit pas ce qu'on choisit : trois personnes
              sur quatre comprendraient « je débute » là où le niveau dit
              seulement « quelques versets par jour ». */}
          <Text style={styles.niveauNom}>{LIBELLES_NIVEAUX[niveau].nom}</Text>
          <Text style={styles.niveauResume}>{LIBELLES_NIVEAUX[niveau].resume}</Text>

          {RYTHMES.filter((r) => r.niveau === niveau).map((r) => (
            <Pressable
              key={r.label}
              onPress={() => setUnit(r.unit)}
              style={({ pressed }) => [
                styles.objectiveCard,
                isSameUnit(unit, r.unit) && styles.objectiveCardActive,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Ionicons
                name={r.icon as any}
                size={24}
                color={isSameUnit(unit, r.unit) ? colors.textOnPrimary : colors.primary}
              />
              <Text
                style={[
                  styles.objectiveText,
                  isSameUnit(unit, r.unit) && styles.objectiveTextActive,
                ]}
              >
                {r.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ))}

      {/* Une borne estimee est presentee dans l'application comme n'importe
          quelle autre. Le choix du toumoun comme rythme est donc le seul endroit
          ou l'utilisateur doit apprendre que des limites sont deduites et non
          relevees. Le dire ici plutot que de le taire.

          Le nombre se lit dans les donnees : une limite relue quitte
          `estimated_offset`, et un texte fige continuerait d'annoncer le chiffre
          d'avant la relecture. Les 240 limites de rub' al-hizb, elles, sont
          structurelles — un rub' vient des donnees Hafs et ne se relit pas. */}
      {unit.type === 'thumn' && (
        <Text style={styles.precisionNote}>
          {compteToumoun.estimees} des {compteToumoun.total} limites de toumoun ne sont
          pas vérifiées : elles ont été reportées depuis la lecture Qaloun et peuvent
          s'écarter d'un verset. Les 240 limites de rub' al-hizb, elles, viennent des
          données Hafs.
        </Text>
      )}
    </View>
  );
}

// === Étape 4: Quels jours souhaites-tu apprendre ? ===

function StepDays({
  selectedDays,
  setSelectedDays,
}: {
  selectedDays: number[];
  setSelectedDays: (d: number[]) => void;
}) {
  const styles = useStyles(creerStyles);
  const toggleDay = (day: number) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter((d) => d !== day));
    } else {
      setSelectedDays([...selectedDays, day].sort());
    }
  };

  // Afficher Lundi à Dimanche (1-6, 0)
  const displayDays = [1, 2, 3, 4, 5, 6, 0];

  return (
    <View>
      <Text style={styles.stepTitle}>Quels jours souhaites-tu apprendre ?</Text>
      <Text style={styles.stepSubtitle}>
        Tu peux réserver certains jours aux révisions.
      </Text>

      <View style={styles.daysGrid}>
        {displayDays.map((day) => (
          <Pressable
            key={day}
            onPress={() => toggleDay(day)}
            style={[
              styles.dayCard,
              selectedDays.includes(day) && styles.dayCardActive,
            ]}
          >
            <Text
              style={[
                styles.dayText,
                selectedDays.includes(day) && styles.dayTextActive,
              ]}
            >
              {DAY_NAMES[day]}
            </Text>
            {selectedDays.includes(day) && (
              <Ionicons name="checkmark" size={16} color={colors.textOnPrimary} />
            )}
          </Pressable>
        ))}
      </View>

      <Card variant="surface" padding="md">
        <Text style={styles.tipText}>
          Astuce: Tu peux choisir d'apprendre du lundi au vendredi et réserver
          le week-end aux révisions.
        </Text>
      </Card>
    </View>
  );
}

const creerStyles = (colors: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  progressDotActive: {
    backgroundColor: colors.primary,
    width: 24,
  },
  content: {
    // `flex: 1` figeait la hauteur du contenu à celle de la fenêtre : les 114
    // sourates de la première étape débordaient alors sous le bas de l'écran
    // sans que le défilement les atteigne — impossible d'aller jusqu'au bout de
    // la liste. `flexGrow` laisse le contenu grandir autant qu'il faut.
    flexGrow: 1,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl * 2,
  },
  stepTitle: {
    fontSize: fontSizes.xxxl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  stepSubtitle: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  precisionNote: {
    fontSize: fontSizes.sm,
    color: colors.textTertiary,
    lineHeight: 20,
    marginTop: spacing.lg,
  },
  legend: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  surahList: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  surahItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  surahInfo: {
    flex: 1,
  },
  surahName: {
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    fontWeight: fontWeights.medium,
  },
  surahDetails: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  levelButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  levelBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  levelBtnOuvert: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  separateur: {
    height: 1,
    backgroundColor: colors.border,
  },
  knowledgeSummary: {
    fontSize: fontSizes.sm,
    color: colors.primary,
    fontWeight: fontWeights.medium,
    marginBottom: spacing.md,
  },
  passagePanel: {
    backgroundColor: colors.surfaceVariant,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  panelTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
    paddingTop: spacing.md,
  },
  panelHint: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    lineHeight: 18,
  },
  passageForm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  champNombre: {
    width: 56,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    textAlign: 'center',
  },
  passageFormSep: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  boutonAjouter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  boutonAjouterTexte: {
    color: colors.textOnPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  niveauxLigne: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  niveauPuce: {
    flex: 1,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  niveauPuceTexte: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  niveauPuceTexteActif: {
    color: colors.textOnPrimary,
  },
  messageErreur: {
    fontSize: fontSizes.xs,
    color: colors.error,
    lineHeight: 18,
  },
  panelVide: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  declaration: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  declarationTexte: {
    flex: 1,
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
  },
  // Le groupe d'un niveau, dans le questionnaire du rythme.
  //
  // `marginTop` plutôt qu'un séparateur : trois groupes de cartes se lisent
  // déjà comme trois groupes, et une ligne de plus surchargerait un écran qui
  // porte déjà six choix.
  niveau: {
    marginTop: spacing.md,
  },
  niveauNom: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.primary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  niveauResume: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  objectiveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  objectiveCardActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  objectiveTextBloc: {
    flex: 1,
  },
  objectiveText: {
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    fontWeight: fontWeights.medium,
  },
  objectiveTextActive: {
    color: colors.textOnPrimary,
  },
  objectiveDetail: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  objectiveDetailActif: {
    color: colors.primarySurface,
  },
  daysGrid: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  dayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayCardActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayText: {
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    fontWeight: fontWeights.medium,
    flex: 1,
  },
  dayTextActive: {
    color: colors.textOnPrimary,
  },
  tipText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.lg,
    gap: spacing.md,
  },
  navButtonPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
  },
  navButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarySurface,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  navButtonTextLight: {
    color: colors.textOnPrimary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  navButtonTextDark: {
    color: colors.primary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  pickerContainer: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerLabel: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  pickerHint: {
    fontSize: fontSizes.sm,
    color: colors.textTertiary,
    marginBottom: spacing.md,
    fontStyle: 'italic',
  },
  juzGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  juzItem: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  juzItemActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  juzItemText: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  juzItemTextActive: {
    color: colors.textOnPrimary,
  },
});
