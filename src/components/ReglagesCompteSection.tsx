// Les deux portes du compte : le profil public, et les notifications.
//
// Pourquoi un composant, et pourquoi ces deux-là ensemble : ce sont les deux
// seuls réglages qui dépendent d'un SERVEUR — les autres vivent dans la base
// locale du téléphone. Les ranger côte à côte permet de n'expliquer qu'une fois
// ce qu'ils ont en commun, et de le dire franchement : sans compte relié, ils
// n'ont rien à régler.
//
// Ils restent DEUX écrans, et non un seul : « qui peut me voir » et « qui peut
// me déranger » sont deux questions distinctes. Les mêler ferait craindre que
// couper les notifications ne fasse disparaître de la liste des amis.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Card } from '@/components/Card';
import { colors, fontSizes, spacing, radii, useStyles, type Palette } from '@/theme';
import { isSupabaseConfigured } from '@/lib/supabase';
import { utilisateurCourant } from '@/lib/auth';

/** Délai au-delà duquel on cesse d'attendre la session. */
const DELAI_SESSION_MS = 8000;

const DELAI_DEPASSE = Symbol('delai-depasse');

function repondreDans<T>(promesse: Promise<T>, ms: number): Promise<T | typeof DELAI_DEPASSE> {
  return Promise.race([
    promesse,
    new Promise<typeof DELAI_DEPASSE>((resoudre) => setTimeout(() => resoudre(DELAI_DEPASSE), ms)),
  ]);
}

export function ReglagesCompteSection() {
  const styles = useStyles(creerStyles);
  const configure = isSupabaseConfigured();
  const [connecte, setConnecte] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      if (!configure) {
        setConnecte(false);
        return;
      }
      void (async () => {
        try {
          const oui = await repondreDans(utilisateurCourant(), DELAI_SESSION_MS);
          if (!vivant) return;
          setConnecte(oui !== DELAI_DEPASSE && oui !== null);
        } catch {
          // Un rejet n'est pas un délai : `Promise.race` rend la première
          // promesse achevée, et un rejet en est une. On le traite comme
          // « pas connecté », qui est un état que l'écran sait déjà montrer.
          if (vivant) setConnecte(false);
        }
      })();
      return () => {
        vivant = false;
      };
    }, [configure])
  );

  if (!configure) {
    return (
      <>
        <Text style={styles.sectionTitle}>Mon compte</Text>
        <Card>
          <Text style={styles.texte}>
            Le profil public et les notifications nécessitent la sauvegarde en ligne, qui n’est
            pas configurée sur cette version de l’application.
          </Text>
        </Card>
      </>
    );
  }

  if (connecte === null) {
    return (
      <>
        <Text style={styles.sectionTitle}>Mon compte</Text>
        <Card>
          <ActivityIndicator color={colors.primary} />
        </Card>
      </>
    );
  }

  if (!connecte) {
    return (
      <>
        <Text style={styles.sectionTitle}>Mon compte</Text>
        <Card>
          <Text style={styles.texte}>
            Connectez-vous, plus haut dans cette page, pour régler votre profil public et vos
            notifications.
          </Text>
        </Card>
      </>
    );
  }

  return (
    <>
      <Text style={styles.sectionTitle}>Mon compte</Text>
      <Card>
        <Ligne
          icone="person-circle-outline"
          titre="Profil public"
          detail="Pseudonyme, identifiant, avatar, ce que vous partagez."
          destination="/profil-public"
        />
        <View style={styles.separateur} />
        <Ligne
          icone="notifications-outline"
          titre="Notifications"
          detail="Messages, demandes d’amis, étapes partagées, rappels."
          destination="/notifications"
        />
      </Card>
    </>
  );
}

function Ligne({
  icone,
  titre,
  detail,
  destination,
}: {
  icone: string;
  titre: string;
  detail: string;
  destination: string;
}) {
  const styles = useStyles(creerStyles);
  return (
    <Pressable
      style={styles.ligne}
      // `navigate` plutôt que `push` : un retour depuis ces écrans doit ramener
      // au Profil, pas empiler une seconde copie de la page.
      onPress={() => router.navigate(destination as never)}
      accessibilityRole="button"
      accessibilityLabel={`${titre}. ${detail}`}
    >
      <View style={styles.pastille}>
        <Ionicons name={icone as never} size={20} color={colors.primary} />
      </View>
      <View style={styles.texteLigne}>
        <Text style={styles.titreLigne}>{titre}</Text>
        <Text style={styles.detailLigne}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
    </Pressable>
  );
}

const creerStyles = (colors: Palette) => StyleSheet.create({
  // SOUS-TITRE, ET NON TITRE DE SECTION — même raison que dans `AmisSection`.
  //
  // « Mon compte » était un titre de section quand le profil n'en avait pas.
  // Il vit maintenant sous « Amis et entraide », à côté de « Sauvegarde en
  // ligne » et de « Mes amis » : trois blocs sous un titre, donc trois
  // sous-titres dans le même style discret. Le mot et le contenu sont intacts.
  sectionTitle: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
    color: colors.textTertiary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  texte: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  separateur: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
  },
  pastille: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texteLigne: {
    flex: 1,
  },
  titreLigne: {
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  detailLigne: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
