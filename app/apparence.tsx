// Apparence — le choix du thème.
//
// CET ÉCRAN A DÉMÉNAGÉ, IL N'A PAS ÉTÉ CRÉÉ. Le choix de thème vivait dans le
// profil, sous un titre « Apparence », entre la configuration et les
// connaissances. La maquette en fait une entrée des réglages, ce qui est plus
// juste : changer de couleur n'est pas une information SUR soi, c'est un réglage
// DE l'application.
//
// RIEN N'A CHANGÉ DANS LE FONCTIONNEMENT. `changerTheme` écrit la préférence et
// l'applique pendant le rendu, comme avant ; c'est la même fonction, appelée
// depuis un autre écran.

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  colors,
  fontSizes,
  fontWeights,
  LIBELLES_PALETTES,
  ORDRE_PALETTES,
  PALETTES,
  radii,
  spacing,
  useStyles,
  useTheme,
  type NomPalette,
  type Palette,
} from '@/theme';

export default function ApparenceScreen() {
  const styles = useStyles(creerStyles);
  const { nom: nomTheme, changerTheme } = useTheme();

  return (
    <SafeAreaView style={styles.ecran} edges={['top']}>
      <View style={styles.entete}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Revenir en arrière"
        >
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.titre}>Apparence</Text>
        {/* Un vide de la largeur du chevron, pour que le titre reste centré
            sans être décalé par la flèche de retour. */}
        <View style={styles.equilibre} />
      </View>

      <ScrollView contentContainerStyle={styles.contenu}>
        <Text style={styles.aide}>
          Choisis la couleur de l’application. Le changement est immédiat, et
          conservé à la prochaine ouverture.
        </Text>

        <View style={styles.rangee}>
          {ORDRE_PALETTES.map((nom) => (
            <ChoixTheme
              key={nom}
              nom={nom}
              actif={nom === nomTheme}
              onChoisir={changerTheme}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Une pastille de thème.
 *
 * L'aperçu montre les DEUX jetons qui font un thème : le fond de l'écran et la
 * couleur principale. Une pastille qui n'en montrerait qu'un — la principale,
 * par exemple — ne dirait rien du thème noir, dont le fond est l'essentiel.
 */
function ChoixTheme({
  nom,
  actif,
  onChoisir,
}: {
  nom: NomPalette;
  actif: boolean;
  onChoisir: (nom: NomPalette) => void;
}) {
  const styles = useStyles(creerStyles);
  const palette = PALETTES[nom];

  return (
    <Pressable
      style={styles.choix}
      onPress={() => onChoisir(nom)}
      accessibilityRole="radio"
      accessibilityState={{ selected: actif }}
      accessibilityLabel={`Thème ${LIBELLES_PALETTES[nom]}`}
    >
      <View
        style={[
          styles.apercu,
          { backgroundColor: palette.background },
          actif && { borderColor: colors.primary, borderWidth: 2 },
        ]}
      >
        <View style={[styles.pastille, { backgroundColor: palette.primary }]}>
          {actif && (
            <Ionicons name="checkmark" size={14} color={palette.textOnPrimary} />
          )}
        </View>
      </View>
      <Text style={[styles.nomTheme, actif && styles.nomThemeActif]}>
        {LIBELLES_PALETTES[nom]}
      </Text>
    </Pressable>
  );
}

const creerStyles = (palette: Palette) =>
  StyleSheet.create({
    ecran: {
      flex: 1,
      backgroundColor: palette.background,
    },
    entete: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    titre: {
      fontSize: fontSizes.xl,
      fontWeight: fontWeights.bold,
      color: palette.textPrimary,
    },
    equilibre: {
      width: 26,
    },
    contenu: {
      padding: spacing.lg,
      gap: spacing.lg,
    },
    aide: {
      fontSize: fontSizes.sm,
      color: palette.textSecondary,
      lineHeight: 20,
    },
    rangee: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
    },
    choix: {
      alignItems: 'center',
      gap: spacing.xs,
    },
    apercu: {
      width: 64,
      height: 64,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pastille: {
      width: 28,
      height: 28,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nomTheme: {
      fontSize: fontSizes.xs,
      color: palette.textSecondary,
    },
    nomThemeActif: {
      color: palette.primary,
      fontWeight: fontWeights.semibold,
    },
  });
