// Une ligne de menu : une icône dans une pastille douce, un titre, un
// sous-titre, et un chevron.
//
// POURQUOI UN COMPOSANT PARTAGÉ. Le profil et les réglages montrent la même
// chose — une liste d'entrées qui mènent ailleurs — et la maquette les dessine
// à l'identique. Deux copies auraient divergé : c'est le genre d'écart qui ne
// se voit pas dans un fichier, seulement à l'écran, entre deux pages.
//
// LE SOUS-TITRE EST FACULTATIF, ET CE N'EST PAS UN DÉTAIL. Il porte l'état
// courant — « 12 enregistrements », « Tout le Coran · 1 page/jour ». Une entrée
// sans sous-titre est une entrée dont on ne sait rien avant d'y entrer ; une
// entrée avec un sous-titre vide afficherait un blanc qui ressemble à un défaut
// de chargement. Le composant n'affiche donc RIEN quand il n'y a rien à dire.
//
// LES COULEURS D'ALERTE VIENNENT DE LA PALETTE, ET PAS D'UN ROUGE ÉCRIT ICI. Le
// couple `error` / `errorLight` est le seul qui tienne sur les QUATRE thèmes :
// mesuré, `errorLight` vaut `#FFEBEE` sur les trois thèmes clairs et `#331B1B`
// sur le thème noir, où `error` passe à `#FF8A80`. Un rouge écrit en dur serait
// illisible sur l'un des deux fonds.

import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  spacing,
  useStyles,
  type Palette,
} from '@/theme';

/** Le nom d'une icône Ionicons, typé : `string` + `as any` ne vérifie rien. */
export type NomIcone = ComponentProps<typeof Ionicons>['name'];

export function LigneMenu({
  icone,
  titre,
  sousTitre,
  onPress,
  danger = false,
  dernier = false,
  sansChevron = false,
}: {
  icone: NomIcone;
  titre: string;
  sousTitre?: string;
  onPress: () => void;
  /** Une entrée qui détruit quelque chose : icône, pastille et titre en rouge. */
  danger?: boolean;
  /** La dernière ligne d'un groupe ne trace pas de séparateur sous elle. */
  dernier?: boolean;
  /**
   * Une entrée qui AGIT au lieu de MENER quelque part.
   *
   * Le chevron promet un écran ; sur une commande qui s'exécute sur place, il
   * promet une page qui n'arrive pas. Le retirer n'est pas cosmétique : c'est
   * dire la vérité sur ce que l'appui fait.
   */
  sansChevron?: boolean;
}) {
  const styles = useStyles(creerStyles);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={sousTitre ? `${titre}, ${sousTitre}` : titre}
      style={({ pressed }) => [
        styles.ligne,
        !dernier && styles.separateur,
        pressed && styles.pressee,
      ]}
    >
      <View style={[styles.pastille, danger && styles.pastilleDanger]}>
        <Ionicons name={icone} size={20} color={danger ? colors.error : colors.primary} />
      </View>

      <View style={styles.texte}>
        <Text style={[styles.titre, danger && styles.titreDanger]} numberOfLines={1}>
          {titre}
        </Text>
        {sousTitre !== undefined && sousTitre.length > 0 && (
          <Text style={styles.sousTitre} numberOfLines={2}>
            {sousTitre}
          </Text>
        )}
      </View>

      {!sansChevron && (
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      )}
    </Pressable>
  );
}

const creerStyles = (palette: Palette) =>
  StyleSheet.create({
    ligne: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
    },
    // Le séparateur s'arrête avant la pastille, comme sur la maquette : il
    // souligne le texte, il ne coupe pas la ligne.
    separateur: {
      borderBottomWidth: 1,
      borderBottomColor: palette.borderLight,
    },
    pressee: {
      backgroundColor: palette.surfaceVariant,
    },
    pastille: {
      width: 40,
      height: 40,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.primarySurface,
    },
    pastilleDanger: {
      backgroundColor: palette.errorLight,
    },
    texte: {
      flex: 1,
      gap: 2,
    },
    titre: {
      fontSize: fontSizes.md,
      fontWeight: fontWeights.semibold,
      color: palette.textPrimary,
    },
    titreDanger: {
      color: palette.error,
    },
    sousTitre: {
      fontSize: fontSizes.sm,
      color: palette.textSecondary,
    },
  });
