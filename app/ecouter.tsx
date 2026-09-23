// Écouter un passage choisi à la main : sourate, versets, récitateur, répétitions.
//
// POURQUOI UN ÉCRAN, ET POURQUOI PAS UN ONGLET
// --------------------------------------------
// La spécification interdit d'ajouter un onglet de navigation principal, et
// c'est une bonne contrainte : écouter est un geste qu'on fait **depuis** un
// passage, pas un endroit où l'on vit. Cet écran est donc atteint depuis le
// programme, et il revient.
//
// CE QUE L'ÉCRAN NE REFAIT PAS
// ----------------------------
// Il ne choisit pas le récitateur, le nombre de répétitions, le mode ni la
// pause : ces réglages sont dans la barre du lecteur, une seule fois, et ils
// s'appliquent à tout ce qui joue. Les redonner ici créerait deux endroits où
// les changer, donc deux vérités.
//
// Il ne définit pas non plus ce qu'est « la séance du jour » : il construit une
// plage à partir de ce que l'utilisateur désigne. Le programme, lui, garde ses
// bornes.

import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { fonts, radii, spacing, useColors, useStyles, type Palette } from '@/theme';
import { getAllSurahs, getSurahAyahCount } from '@/data/quranData';
import { LecteurAudio } from '@/components/LecteurAudio';
import { useAudio } from '@/lib/audio/ContexteAudio';
import { versetsDeLaPlage } from '@/lib/audio/plan';

/** Lit un numéro de verset saisi, ou `null` si la saisie n'en est pas un. */
function lireNumero(texte: string): number | null {
  const chiffres = texte.replace(/[^0-9]/g, '');
  if (chiffres === '') return null;
  const nombre = Number(chiffres);
  return Number.isFinite(nombre) && nombre > 0 ? nombre : null;
}

export default function EcouterScreen() {
  const styles = useStyles(creerStyles);
  const palette = useColors();
  const router = useRouter();
  const { ouvrir } = useAudio();

  const surahs = useMemo(() => getAllSurahs(), []);
  const [surah, setSurah] = useState(1);
  const [premier, setPremier] = useState('1');
  const [dernier, setDernier] = useState('7');

  const nombreDeVersets = getSurahAyahCount(surah);
  const debut = Math.min(lireNumero(premier) ?? 1, nombreDeVersets);
  const fin = Math.min(lireNumero(dernier) ?? nombreDeVersets, nombreDeVersets);
  const versets = versetsDeLaPlage(surah, debut, fin);
  const nomSurah = surahs.find((s) => s.number === surah)?.nameFr ?? `Sourate ${surah}`;

  /** Changer de sourate remet la plage entière : les bornes de l'ancienne
   *  n'ont aucun sens dans la nouvelle, et les garder ferait écouter autre
   *  chose que ce qui est écrit à l'écran. */
  const choisirSurah = (numero: number) => {
    setSurah(numero);
    setPremier('1');
    setDernier(String(getSurahAyahCount(numero)));
  };

  return (
    <SafeAreaView style={styles.racine} edges={['top']}>
      <View style={styles.enTete}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Revenir en arrière"
          hitSlop={12}
        >
          <Ionicons name="arrow-back" size={24} color={palette.textPrimary} />
        </Pressable>
        <Text style={styles.titre}>Écouter un passage</Text>
      </View>

      {/* La plage choisie, en clair, toujours visible : c'est ce qui sera
          écouté, et l'utilisateur doit pouvoir le relire avant d'appuyer. */}
      <View style={styles.resume}>
        <Text style={styles.resumeTitre}>
          {nomSurah} · versets {debut} à {fin}
        </Text>
        <Text style={styles.resumeDetail}>
          {versets.length === 0
            ? 'Aucun verset dans cette plage'
            : `${versets.length} verset${versets.length > 1 ? 's' : ''} · ${nombreDeVersets} dans la sourate`}
        </Text>
      </View>

      <View style={styles.bornes}>
        <View style={styles.borne}>
          <Text style={styles.borneEtiquette}>Premier verset</Text>
          <TextInput
            style={styles.champ}
            value={premier}
            onChangeText={setPremier}
            keyboardType="number-pad"
            maxLength={3}
            placeholder="1"
            placeholderTextColor={palette.textTertiary}
            accessibilityLabel="Premier verset"
          />
        </View>
        <View style={styles.borne}>
          <Text style={styles.borneEtiquette}>Dernier verset</Text>
          <TextInput
            style={styles.champ}
            value={dernier}
            onChangeText={setDernier}
            keyboardType="number-pad"
            maxLength={3}
            placeholder={String(nombreDeVersets)}
            placeholderTextColor={palette.textTertiary}
            accessibilityLabel="Dernier verset"
          />
        </View>
      </View>

      <Text style={styles.sectionTitre}>Sourate</Text>

      <FlatList
        style={styles.liste}
        data={surahs}
        keyExtractor={(item) => String(item.number)}
        contentContainerStyle={styles.listeContenu}
        initialNumToRender={20}
        windowSize={9}
        renderItem={({ item }) => {
          const choisie = item.number === surah;
          return (
            <Pressable
              style={[styles.ligneSurah, choisie && styles.ligneSurahChoisie]}
              onPress={() => choisirSurah(item.number)}
              accessibilityRole="button"
              accessibilityState={{ selected: choisie }}
              accessibilityLabel={`${item.nameFr}, ${item.ayahCount} versets`}
            >
              <Text style={[styles.numeroSurah, choisie && styles.texteChoisi]}>
                {item.number}
              </Text>
              <Text style={[styles.nomSurah, choisie && styles.texteChoisi]} numberOfLines={1}>
                {item.nameFr}
              </Text>
              <Text style={styles.nombreVersets}>{item.ayahCount}</Text>
            </Pressable>
          );
        }}
      />

      {/* La barre du lecteur : c'est elle qui porte tous les réglages, et c'est
          son bouton qui lance la sélection. */}
      <LecteurAudio
        onOuvrir={() => ouvrir(versetsDeLaPlage(surah, debut, fin))}
        libelleOuvrir="Écouter cette sélection"
      />
    </SafeAreaView>
  );
}

const creerStyles = (colors: Palette) => StyleSheet.create({
  racine: {
    flex: 1,
    backgroundColor: colors.background,
  },
  enTete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  titre: {
    fontFamily: fonts.medium,
    fontSize: 20,
    color: colors.textPrimary,
  },
  resume: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.primarySurface,
  },
  resumeTitre: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.primary,
  },
  resumeDetail: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  bornes: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  borne: {
    flex: 1,
    gap: spacing.xs,
  },
  borneEtiquette: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textTertiary,
  },
  champ: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    textAlign: 'center',
    backgroundColor: colors.surface,
  },
  sectionTitre: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  liste: {
    flex: 1,
  },
  listeContenu: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  ligneSurah: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
  },
  ligneSurahChoisie: {
    backgroundColor: colors.primarySurface,
  },
  numeroSurah: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textTertiary,
    minWidth: 28,
  },
  nomSurah: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.textPrimary,
  },
  texteChoisi: {
    fontFamily: fonts.medium,
    color: colors.primary,
  },
  nombreVersets: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textTertiary,
  },
});
