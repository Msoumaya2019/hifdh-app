// Réglages — les réglages de l'application, rassemblés.
//
// CET ÉCRAN N'EXISTAIT PAS. Ses entrées étaient éparpillées : le choix du thème
// et la remise à zéro vivaient dans le profil, les notifications dans un écran
// à part, les licences dans une carte « À propos ». La maquette les rassemble
// ici, et le rassemblement a une raison : ce sont toutes des décisions SUR
// l'application, alors que le profil montre des choses SUR soi.
//
// LA REMISE À ZÉRO RESTE SUR CET ÉCRAN, ELLE NE MÈNE PAS AILLEURS. C'est une
// commande, pas une destination : un écran qui ne porterait qu'un bouton
// n'ajouterait pas de sécurité — ce sont les deux confirmations qui en donnent,
// et elles sont ici, inchangées. La ligne n'a donc pas de chevron.
//
// L'ENTRÉE « AFFICHAGE DU CORAN » N'EST PAS ICI, ET C'EST DÉLIBÉRÉ. La maquette
// la montre ; le code ne permet pas de l'honorer. Le lecteur ne connaît qu'un
// affichage — la page du moushaf — et il RAMÈNE au mode page une configuration
// restée sur « versets » (`app/lecteur.tsx`). Quant au tajweed, il n'existe
// nulle part dans le dépôt. Une entrée qui n'ouvrirait qu'un seul choix, ou qui
// promettrait un affichage absent, vaudrait moins que pas d'entrée du tout.

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable } from 'react-native';
import { Card } from '@/components/Card';
import { LigneMenu } from '@/components/LigneMenu';
import { EFFACEURS_APPAREIL } from '@/lib/effaceursAppareil';
import {
  messageDeSucces,
  messageEnCasDEchec,
  reinitialiserTout,
} from '@/lib/reinitialisation';
import {
  colors,
  fontSizes,
  fontWeights,
  PALETTE_PAR_DEFAUT,
  spacing,
  useStyles,
  useTheme,
  type Palette,
} from '@/theme';

export default function ReglagesScreen() {
  const styles = useStyles(creerStyles);
  const { changerTheme } = useTheme();
  const [remiseAZero, setRemiseAZero] = useState(false);

  /**
   * La remise à zéro, en deux temps.
   *
   * Deux confirmations, et non une seule : la première annonce ce qui va être
   * perdu, la seconde demande de le confirmer une fois que c'est lu. Un
   * effacement définitif de la progression ne se déclenche pas sur un appui
   * mal placé.
   */
  const handleReinitialiser = () => {
    Alert.alert(
      'Tout réinitialiser ?',
      'Cette action efface définitivement ta progression : passages mémorisés, séances, révisions espacées, pages gardées hors ligne, et ta connexion. Elle est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Continuer', style: 'destructive', onPress: confirmerReinitialisation },
      ]
    );
  };

  const confirmerReinitialisation = () => {
    Alert.alert(
      'Confirmer définitivement',
      'Dernière vérification : tout sera effacé, et l’application repartira comme à l’installation. Confirmer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Tout effacer', style: 'destructive', onPress: executerReinitialisation },
      ]
    );
  };

  const executerReinitialisation = async () => {
    setRemiseAZero(true);
    try {
      const resultat = await reinitialiserTout(EFFACEURS_APPAREIL);

      // Le magasin clé-valeur vient d'être vidé : la préférence de thème est
      // partie avec lui. Le fournisseur, lui, garde la palette en mémoire —
      // il faut donc la lui redire, sans quoi l'écran resterait rose après une
      // remise à zéro, alors que l'ouverture suivante afficherait du vert :
      // deux affichages différents de la même application.
      changerTheme(PALETTE_PAR_DEFAUT);

      if (resultat.echecs.length === 0) {
        Alert.alert('Remise à zéro', messageDeSucces(), [
          { text: 'Recommencer', onPress: () => router.replace('/onboarding') },
        ]);
        return;
      }

      // Une partie seulement a été effacée. On ne renvoie PAS au questionnaire :
      // y aller alors que la progression est restée ferait recalculer le
      // programme sur les anciennes données, et l'utilisateur croirait avoir
      // tout perdu sans que rien n'ait changé.
      Alert.alert('Remise à zéro incomplète', messageEnCasDEchec(resultat));
    } catch (erreur) {
      // `reinitialiserTout` rapporte ses échecs au lieu de les lever ; ce
      // `catch` ne doit donc jamais servir. Il est là pour qu'une panne
      // inattendue soit DITE, plutôt que de laisser l'écran sans réponse.
      Alert.alert(
        'Remise à zéro',
        "La remise à zéro n'a pas pu être menée à son terme. Ferme puis rouvre l'application, et réessaie."
      );
      void erreur;
    } finally {
      setRemiseAZero(false);
    }
  };

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
        <Text style={styles.titre}>Réglages</Text>
        <View style={styles.equilibre} />
      </View>

      <ScrollView contentContainerStyle={styles.contenu}>
        <Card padding="sm">
          <LigneMenu
            icone="color-palette-outline"
            titre="Apparence"
            sousTitre="Thèmes et couleurs"
            onPress={() => router.push('/apparence')}
          />
          <LigneMenu
            icone="notifications-outline"
            titre="Notifications"
            sousTitre="Rappels et messages"
            onPress={() => router.push('/notifications')}
          />
          <LigneMenu
            icone="book-outline"
            titre="Sources du Coran"
            sousTitre="Texte arabe, moushafs, traductions, récitations et licences"
            onPress={() => router.push('/sources')}
          />
        </Card>

        {/* La remise à zéro, seule dans sa carte et sous un titre qui prévient :
            c'est la seule commande de l'application qui détruise quelque chose,
            et elle ne doit pas se trouver à un appui d'une entrée ordinaire. */}
        <Text style={styles.sectionTitle}>Repartir de zéro</Text>

        <Card padding="sm">
          <LigneMenu
            icone={remiseAZero ? 'hourglass-outline' : 'trash-outline'}
            titre={remiseAZero ? 'Effacement en cours…' : 'Tout remettre à 0'}
            sousTitre="Réinitialiser mes données"
            onPress={handleReinitialiser}
            danger
            dernier
            sansChevron
          />
        </Card>

        <Text style={styles.avertissement}>
          Efface la progression, les séances, les révisions, les pages gardées
          hors ligne et la connexion. L’application redevient comme au premier
          lancement.
        </Text>

        {remiseAZero && (
          <View style={styles.attente}>
            <ActivityIndicator size="small" color={colors.error} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
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
      gap: spacing.md,
      paddingBottom: spacing.xxxl * 2,
    },
    sectionTitle: {
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.semibold,
      color: palette.textSecondary,
      marginTop: spacing.sm,
    },
    avertissement: {
      fontSize: fontSizes.xs,
      color: palette.textTertiary,
      lineHeight: 17,
      paddingHorizontal: spacing.xs,
    },
    attente: {
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
  });
