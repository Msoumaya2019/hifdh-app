// Section « Mon prénom » du profil — la première des six.
//
// POURQUOI ELLE MONTRE PLUTÔT QU'ELLE NE SAISIT. Le prénom se règle dans
// `app/profil-public.tsx`, avec l'identifiant public, la couleur d'avatar et les
// partages : c'est un même objet, et le découper ferait deux écrans pour un seul
// réglage. Ici, le profil doit pouvoir DIRE qui l'on est sans qu'il faille ouvrir
// un écran pour l'apprendre — c'est le rôle d'une section de profil.
//
// LE PRÉNOM VIENT DU SERVEUR, ET PAS DU TÉLÉPHONE. C'est celui que les amis
// voient (`profiles.display_name`, lu par `amis.sql`), donc le seul qui soit
// vrai : l'afficher depuis un réglage local montrerait un nom que personne
// d'autre ne voit. Il faut donc être connecté, et l'écran le dit quand on ne
// l'est pas — au lieu de rester vide.
//
// QUATRE ÉTATS, ET ILS SONT DISTINCTS : pas de serveur configuré, pas connecté,
// lecture en panne, ou lu. Les confondre ferait afficher « aucun prénom » à
// quelqu'un qui en a un, ce qui est la pire des réponses.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { LigneMenu } from '@/components/LigneMenu';
import { colors, fontSizes, fontWeights, spacing, useStyles, type Palette } from '@/theme';
import { monProfilPublic } from '@/lib/sync/amis';

/**
 * Ce que la section sait montrer.
 *
 * `nom` porte `null` quand la personne est connectée mais n'a rien choisi : c'est
 * une information, et non une absence de réponse — d'où deux états distincts.
 */
type Etat =
  | { sorte: 'chargement' }
  | { sorte: 'nom'; nom: string | null }
  | { sorte: 'non_connecte' }
  | { sorte: 'indisponible' }
  | { sorte: 'souci'; message: string };

const MESSAGE_PANNE =
  "Le prénom n'a pas pu être lu. Vérifiez votre connexion, puis revenez sur cet écran.";

export function PrenomSection() {
  const styles = useStyles(creerStyles);
  const [etat, setEtat] = useState<Etat>({ sorte: 'chargement' });

  const charger = useCallback(async () => {
    try {
      const resultat = await monProfilPublic();

      switch (resultat.statut) {
        case 'ok':
          setEtat({ sorte: 'nom', nom: resultat.profil.nomAffiche });
          return;
        case 'non_authentifie':
          setEtat({ sorte: 'non_connecte' });
          return;
        case 'indisponible':
          setEtat({ sorte: 'indisponible' });
          return;
        default:
          // Reste `refuse` et `erreur`, qui portent tous deux un message.
          setEtat({ sorte: 'souci', message: resultat.message });
      }
    } catch {
      // LA BORNE NE COUVRE PAS LE REJET. `monProfilPublic` borne déjà ses appels,
      // mais `Promise.race` rend la première promesse ACHEVÉE — et un rejet en
      // est une. Sans ce rattrapage, l'état resterait sur « chargement » et
      // l'indicateur tournerait sans fin, ce qui est exactement le défaut que
      // cette application a déjà connu.
      setEtat({ sorte: 'souci', message: MESSAGE_PANNE });
    }
  }, []);

  // `useFocusEffect` et non `useEffect` : le prénom se règle sur l'écran d'à
  // côté, et revenir ici doit montrer le nouveau. Un écran d'onglet reste monté,
  // donc un `useEffect` ne se rejouerait jamais et la section resterait en
  // arrière d'un changement.
  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const sousTitre = (() => {
    switch (etat.sorte) {
      case 'chargement':
        return 'Lecture…';
      case 'nom':
        return etat.nom !== null && etat.nom.length > 0 ? etat.nom : 'Aucun prénom choisi';
      case 'non_connecte':
        return 'Connectez-vous pour choisir le prénom que vos amis verront';
      case 'indisponible':
        return "Le suivi entre amis n'est pas configuré sur cette version";
      case 'souci':
        return 'Prénom indisponible';
    }
  })();

  return (
    <>
      <Text style={styles.sectionTitle}>Mon prénom</Text>

      {/* `xs` et non `lg` : la ligne de menu porte déjà son propre retrait, et le
          doubler laisserait un vide qui ne ressemble à aucune autre carte. */}
      <Card padding="xs">
        <LigneMenu
          icone="person-outline"
          titre="Prénom affiché à mes amis"
          sousTitre={sousTitre}
          onPress={() => router.push('/profil-public')}
          dernier
        />

        {etat.sorte === 'chargement' && (
          <View style={styles.attente}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {etat.sorte === 'souci' && <Text style={styles.souci}>{etat.message}</Text>}

        {etat.sorte === 'nom' && (
          <Text style={styles.aide}>
            C'est ce prénom, et lui seul, que vos amis voient à côté de votre progression. Votre
            identifiant public, lui, sert à vous faire trouver.
          </Text>
        )}
      </Card>
    </>
  );
}

const creerStyles = (palette: Palette) =>
  StyleSheet.create({
    // Le même en-tête que les cinq autres sections du profil : six titres qui se
    // ressemblent font six sections, six titres différents feraient six blocs.
    sectionTitle: {
      fontSize: fontSizes.lg,
      fontWeight: fontWeights.semibold,
      color: palette.textPrimary,
      marginTop: spacing.xl,
      marginBottom: spacing.md,
      marginHorizontal: spacing.xs,
    },
    attente: {
      paddingBottom: spacing.lg,
      alignItems: 'center',
    },
    souci: {
      fontSize: fontSizes.sm,
      color: palette.error,
      lineHeight: 19,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    aide: {
      fontSize: fontSizes.xs,
      color: palette.textSecondary,
      lineHeight: 17,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
  });
