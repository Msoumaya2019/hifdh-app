// La barre d'onglets, en HAUT de l'écran.
//
// POURQUOI ELLE EST EN HAUT, ET PAS EN BAS.
//
// La barre du bas a été retirée sur décision du propriétaire, qui a fourni la
// maquette des neuf écrans. Deux conséquences qu'il faut lire ensemble, parce
// que l'une ne va pas sans l'autre :
//
//   1. **Profil quitte la barre.** La cinquième entrée est désormais « Amis ».
//      Le compte reste à cinq, ce qui est la contrainte que la spécification
//      pose (`app/_layout.tsx` la rappelle : « la spécification interdit d'y
//      ajouter une sixième entrée »). Ce n'est donc pas une entrée ajoutée,
//      c'est une entrée remplacée.
//   2. **Le profil devient joignable par l'avatar**, à droite de cette barre.
//      Il redevient un écran empilé, avec son retour — ce que la maquette
//      montre. Sans cet avatar, sortir Profil de la barre le rendrait
//      inatteignable, et c'est le genre de régression qui ne se voit qu'en
//      cherchant un écran qu'on ne trouve plus.
//
// POURQUOI `tabBarPosition` EST DANS `screenOptions`.
//
// Ce n'est pas une préférence : `BottomTabView` lit la position dans les
// OPTIONS de l'écran qui a le focus —
// `const { tabBarPosition = 'bottom' } = descriptors[focusedRouteKey].options`
// (`@react-navigation/bottom-tabs` 7.19.2, `lib/module/views/BottomTabView.js`
// ligne 181). La poser sur `<Tabs>` ne ferait rien, en silence.
//
// Bénéfice mesuré de la même lecture : quand la position vaut `top`, le
// décalage bas du contenu vaut 0 (ligne 245) — les écrans ne reçoivent donc
// aucune marge fantôme à compenser.
//
// POURQUOI ELLE AJOUTE ELLE-MÊME LA MARGE DU HAUT.
//
// `SafeAreaProviderCompat` ne retire PAS la hauteur de la barre des marges
// qu'il transmet (vérifié dans son source : il repasse les marges de la
// fenêtre telles quelles). Un écran qui garderait `edges={['top']}` sous cette
// barre compterait donc l'encoche deux fois. La marge du haut est prise ici,
// une seule fois, et les écrans d'onglet passent à `edges={['bottom']}`.

import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  spacing,
  useStyles,
  type Palette,
} from '@/theme';

export function BarreOngletsHaut({ state, descriptors, navigation }: BottomTabBarProps) {
  const styles = useStyles(creerStyles);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.barre, { paddingTop: insets.top }]}>
      <View style={styles.rang}>
        {state.routes.map((route, index) => {
          const actif = state.index === index;
          const libelle = descriptors[route.key].options.title ?? route.name;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: actif }}
              accessibilityLabel={libelle}
              onPress={() => {
                // L'événement est émis AVANT de naviguer, et son refus est
                // respecté : c'est ce qui permet à un écran de retenir l'appui
                // — par exemple pour proposer d'abandonner une saisie en cours.
                // Naviguer d'abord rendrait ce refus sans effet.
                const evenement = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!actif && !evenement.defaultPrevented) {
                  navigation.navigate(route.name, route.params);
                }
              }}
              style={[styles.onglet, actif && styles.ongletActif]}
            >
              <Text
                numberOfLines={1}
                style={[styles.libelle, actif && styles.libelleActif]}
              >
                {libelle}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.espace} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Notifications"
        onPress={() => router.push('/notifications')}
        style={styles.icone}
      >
        <Ionicons name="notifications-outline" size={22} color={colors.textSecondary} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mon profil"
        onPress={() => router.push('/profil')}
        style={styles.icone}
      >
        <Ionicons name="person-circle-outline" size={28} color={colors.primary} />
      </Pressable>
    </View>
  );
}

const creerStyles = (palette: Palette) =>
  StyleSheet.create({
    barre: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
      paddingHorizontal: spacing.sm,
      paddingBottom: spacing.sm,
      gap: spacing.xs,
    },
    rang: {
      flexDirection: 'row',
      alignItems: 'center',
      // Les cinq libellés doivent tenir sur la largeur d'un petit téléphone à
      // côté des deux icônes. `flexShrink` les laisse se resserrer plutôt que
      // de pousser les icônes hors de l'écran, et `numberOfLines={1}` évite
      // qu'un libellé trop long passe à la ligne et fasse grandir la barre.
      flexShrink: 1,
      gap: 2,
    },
    onglet: {
      paddingHorizontal: 6,
      paddingVertical: 6,
      borderRadius: radii.pill,
    },
    ongletActif: {
      backgroundColor: palette.primary,
    },
    libelle: {
      fontSize: fontSizes.xs,
      fontWeight: fontWeights.medium,
      color: palette.textSecondary,
    },
    libelleActif: {
      color: palette.textOnPrimary,
      fontWeight: fontWeights.semibold,
    },
    espace: {
      flex: 1,
    },
    icone: {
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xs,
    },
  });
