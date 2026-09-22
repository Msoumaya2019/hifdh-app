// Écran d'onboarding - Questionnaire initial en 4 étapes

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  FlatList,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { colors, fontSizes, fonts, spacing, radii, fontWeights } from '@/theme';
import { getAllSurahs, getAllJuz, getAllHizb } from '@/data/quranData';
import { saveUserConfig, addMemorizedPassage, getAllSessions, getMemorizedPassages, appliquerRecalcul, getUserConfig } from '@/lib/database';
import { planifierRecalcul } from '@/lib/programGenerator';
import { ScrollView as RNScrollView } from 'react-native';
import type {
  UserConfig,
  MemorizedPassage,
  Objective,
  LearningUnit,
  KnowledgeLevel,
} from '@/types';

const TOTAL_STEPS = 4;
const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // État pour chaque question
  const [memorized, setMemorized] = useState<MemorizedPassage[]>([]);
  const [objective, setObjective] = useState<Objective>({ type: 'juz_amma' });
  const [unit, setUnit] = useState<LearningUnit>({ type: 'verses', count: 5 });
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);

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

    // Sauvegarder les passages mémorisés en base
    for (const passage of memorized) {
      await addMemorizedPassage(passage.surah, passage.startAyah, passage.endAyah, passage.level);
    }

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

function StepKnowledge({
  memorized,
  setMemorized,
}: {
  memorized: MemorizedPassage[];
  setMemorized: (m: MemorizedPassage[]) => void;
}) {
  const surahs = getAllSurahs();

  const toggleSurah = (surahNum: number, level: KnowledgeLevel) => {
    const existing = memorized.find((m) => m.surah === surahNum);
    if (existing && existing.level === level) {
      // Retirer
      setMemorized(memorized.filter((m) => m.surah !== surahNum));
    } else {
      // Ajouter ou mettre à jour
      const surah = surahs.find((s) => s.number === surahNum);
      if (!surah) return;
      const newMem = memorized.filter((m) => m.surah !== surahNum);
      newMem.push({
        surah: surahNum,
        startAyah: 1,
        endAyah: surah.ayahCount,
        level,
      });
      setMemorized(newMem);
    }
  };

  const getLevel = (surahNum: number): KnowledgeLevel | undefined => {
    return memorized.find((m) => m.surah === surahNum)?.level;
  };

  const renderSurah = ({ item: surah }: { item: typeof surahs[0] }) => {
    const level = getLevel(surah.number);
    return (
      <View style={styles.surahItem}>
        <View style={styles.surahInfo}>
          <Text style={styles.surahName}>{surah.nameFr}</Text>
          <Text style={styles.surahDetails}>
            {surah.ayahCount} versets · {surah.isMeccan ? 'Mecquoise' : 'Médinoise'}
          </Text>
        </View>
        <View style={styles.levelButtons}>
          <Pressable
            style={[styles.levelBtn, level === 'perfect' && styles.levelBtnPerfect]}
            onPress={() => toggleSurah(surah.number, 'perfect')}
          >
            <Ionicons
              name="checkmark"
              size={14}
              color={level === 'perfect' ? colors.textOnPrimary : colors.textTertiary}
            />
          </Pressable>
          <Pressable
            style={[styles.levelBtn, level === 'needs_review' && styles.levelBtnReview]}
            onPress={() => toggleSurah(surah.number, 'needs_review')}
          >
            <Ionicons
              name="time"
              size={14}
              color={level === 'needs_review' ? colors.textOnPrimary : colors.textTertiary}
            />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View>
      <Text style={styles.stepTitle}>Que connais-tu déjà du Coran ?</Text>
      <Text style={styles.stepSubtitle}>
        Sélectionne les sourates que tu connais. Tu pourras modifier cela plus tard.
      </Text>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
          <Text style={styles.legendText}>Parfaitement mémorisé</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
          <Text style={styles.legendText}>À réviser</Text>
        </View>
      </View>

      <FlatList
        data={surahs}
        keyExtractor={(item) => String(item.number)}
        renderItem={renderSurah}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
        style={styles.surahList}
      />
    </View>
  );
}

// === Étape 2: Quel est ton objectif ? ===

function StepObjective({
  objective,
  setObjective,
}: {
  objective: Objective;
  setObjective: (o: Objective) => void;
}) {
  const objectives: { type: Objective['type']; label: string; icon: string }[] = [
    { type: 'full_quran', label: 'Mémoriser tout le Coran', icon: 'library' },
    { type: 'juz_amma', label: "Mémoriser Juz' 'Amma", icon: 'book' },
    { type: 'hizb_sabbih', label: 'Mémoriser Hizb Sabbih', icon: 'bookmark' },
    { type: 'specific_juz', label: "Mémoriser un juz' précis", icon: 'document' },
    { type: 'specific_hizb', label: 'Mémoriser un ou plusieurs hizb', icon: 'bookmarks' },
    { type: 'custom', label: 'Créer un objectif personnalisé', icon: 'create' },
  ];

  return (
    <View>
      <Text style={styles.stepTitle}>Quel est ton objectif ?</Text>
      <Text style={styles.stepSubtitle}>
        Choisis ce que tu souhaites mémoriser.
      </Text>

      {objectives.map((obj) => (
        <Pressable
          key={obj.type}
          onPress={() => setObjective({ type: obj.type } as Objective)}
          style={({ pressed }) => [
            styles.objectiveCard,
            objective.type === obj.type && styles.objectiveCardActive,
            pressed && { opacity: 0.8 },
          ]}
        >
          <Ionicons
            name={obj.icon as any}
            size={24}
            color={objective.type === obj.type ? colors.textOnPrimary : colors.primary}
          />
          <Text
            style={[
              styles.objectiveText,
              objective.type === obj.type && styles.objectiveTextActive,
            ]}
          >
            {obj.label}
          </Text>
          {objective.type === obj.type && (
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

function StepRhythm({
  unit,
  setUnit,
}: {
  unit: LearningUnit;
  setUnit: (u: LearningUnit) => void;
}) {
  const rhythms: { unit: LearningUnit; label: string; icon: string }[] = [
    { unit: { type: 'verses', count: 3 }, label: '3 versets par jour', icon: 'text' },
    { unit: { type: 'verses', count: 5 }, label: '5 versets par jour', icon: 'text' },
    { unit: { type: 'half_page' }, label: '1/2 page par jour', icon: 'document' },
    { unit: { type: 'page', count: 1 }, label: '1 page par jour', icon: 'document' },
    { unit: { type: 'thumn', count: 1 }, label: '1 toumoun par jour', icon: 'square' },
    { unit: { type: 'rub', count: 1 }, label: "1 rub' par jour", icon: 'square' },
    { unit: { type: 'nisf', count: 1 }, label: '1 nisf par jour', icon: 'square' },
    { unit: { type: 'hizb', count: 1 }, label: '1 hizb par jour', icon: 'square' },
  ];

  const isSameUnit = (a: LearningUnit, b: LearningUnit) => {
    if (a.type !== b.type) return false;
    if ('count' in a && 'count' in b) return a.count === b.count;
    return true;
  };

  return (
    <View>
      <Text style={styles.stepTitle}>Quel rythme souhaites-tu ?</Text>
      <Text style={styles.stepSubtitle}>
        Choisis la quantité à apprendre par séance.
      </Text>

      {rhythms.map((r, i) => (
        <Pressable
          key={i}
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

const styles = StyleSheet.create({
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
    flex: 1,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
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
  levelBtnPerfect: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  levelBtnReview: {
    backgroundColor: colors.warning,
    borderColor: colors.warning,
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
  objectiveText: {
    flex: 1,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    fontWeight: fontWeights.medium,
  },
  objectiveTextActive: {
    color: colors.textOnPrimary,
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
