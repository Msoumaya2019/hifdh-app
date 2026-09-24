// L'avatar d'une personne : ses initiales sur un disque coloré.
//
// POURQUOI UNE COULEUR, ET NON UNE IMAGE. Le projet a pesé les deux, et le
// choix est écrit ici parce qu'il se voit à l'écran : une photo suppose un
// compartiment de stockage, ses politiques d'accès, un sélecteur d'images
// natif — une dépendance de plus, et un service externe à configurer avant que
// l'avatar n'existe. Une couleur choisie dans un jeu fermé ne demande RIEN :
// elle marche hors ligne, ne se modère pas, et elle est disponible
// immédiatement. L'écran reste reconnaissable, ce qui est le but d'un avatar.
//
// LES TEINTES NE SUIVENT PAS LE THÈME, et c'est voulu. Un avatar est une
// personne, pas un élément d'interface : il doit rester le même quand on passe
// du thème vert au thème noir, sinon on ne reconnaît plus ses amis. Les six
// teintes sont donc des valeurs fixes, choisies assez sombres pour porter du
// texte blanc — lisible sur les quatre palettes de l'application.

import { StyleSheet, Text, View } from 'react-native';

import { initiales, type CouleurAvatar } from '@/lib/amis';
import { fonts, fontWeights } from '@/theme';

/** Le fond et l'encre de chaque teinte. Six entrées, comme la contrainte SQL. */
const TEINTES: Record<CouleurAvatar, { fond: string; encre: string }> = {
  vert: { fond: '#1E6B4C', encre: '#FFFFFF' },
  bleu: { fond: '#24506F', encre: '#FFFFFF' },
  rose: { fond: '#8E3A62', encre: '#FFFFFF' },
  or: { fond: '#9A7724', encre: '#FFFFFF' },
  ardoise: { fond: '#3B4453', encre: '#FFFFFF' },
  olive: { fond: '#556327', encre: '#FFFFFF' },
};

export function Avatar({
  nom,
  couleur,
  taille = 44,
}: {
  nom: string;
  couleur: CouleurAvatar;
  taille?: number;
}) {
  const teinte = TEINTES[couleur] ?? TEINTES.vert;
  return (
    <View
      // L'avatar est décoratif : le nom est écrit juste à côté, et le lire une
      // seconde fois au lecteur d'écran doublerait chaque annonce.
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.disque,
        {
          width: taille,
          height: taille,
          borderRadius: taille / 2,
          backgroundColor: teinte.fond,
        },
      ]}
    >
      <Text
        style={[
          styles.lettres,
          {
            // La taille suit celle du disque : une initiale figée déborderait
            // sur un petit avatar et flotterait sur un grand.
            fontSize: Math.round(taille * 0.38),
            color: teinte.encre,
          },
        ]}
      >
        {initiales(nom)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  disque: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lettres: {
    fontFamily: fonts.bold,
    fontWeight: fontWeights.bold,
    // Les initiales d'un pseudonyme arabe s'affichent telles quelles : aucune
    // transformation de casse n'est appliquée ici, elle l'est dans `initiales`.
    includeFontPadding: false,
  },
});
