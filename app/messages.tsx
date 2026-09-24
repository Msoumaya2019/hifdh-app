// L'écran « Messages » : la liste des conversations.
//
// C'est la porte d'entrée de la messagerie, atteinte depuis la pastille de
// l'accueil et depuis l'écran des amis. Elle répond à une seule question —
// « qui m'a écrit, et ai-je quelque chose à lire ? » — et c'est pour cela
// qu'elle se range par RÉCENCE et non par ordre alphabétique : une liste de
// noms triés ne dit rien de ce qui attend.
//
// Ce que cet écran ne fait pas, et c'est délibéré :
//   - il n'affiche pas les amis sans conversation en tête de liste. Ils sont là
//     — sinon on ne pourrait pas écrire le premier mot — mais après ceux qui
//     ont un fil, parce qu'un ami avec qui l'on n'a jamais parlé n'est pas une
//     conversation ;
//   - il ne compose pas de groupe, n'appelle personne, n'envoie aucun fichier.
//     La table des messages n'a que `corps TEXT` (voir `supabase/discussions.sql`) ;
//   - il ne décide pas ce qui est lisible : `mesAmis`, `mesNonLus` et
//     `mesApercus` passent par des fonctions SQL, et les politiques RLS
//     tranchent. Un fil fermé ne remonte pas ici.
//
// L'écran se recharge à CHAQUE retour de focus, et pas seulement au montage :
// un écran de pile reste monté quand on ouvre une conversation, donc un
// chargement unique laisserait la pastille allumée après qu'on a lu le message.
// C'est le même piège que le projet a déjà payé sur un écran d'onglet.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { aujourdHui } from '@/lib/dates';
import {
  apercuTexte,
  badgeNonLus,
  formaterApercuDate,
  indexerApercus,
  indexerNonLus,
  rangerConversations,
  type ApercuFil,
  type NonLusFil,
} from '@/lib/discussion';
import { formaterIdentifiantPublic, type PointAmi } from '@/lib/amis';
import { mesAmis } from '@/lib/sync/amis';
import { abonnerFils, mesApercus, mesNonLus } from '@/lib/sync/discussion';
import { colors, fontSizes, spacing, radii, useStyles, type Palette } from '@/theme';

export default function MessagesScreen() {
  const styles = useStyles(creerStyles);

  const [amis, setAmis] = useState<PointAmi[] | null>(null);
  const [nonLus, setNonLus] = useState<Record<string, NonLusFil>>({});
  const [apercus, setApercus] = useState<Record<string, ApercuFil>>({});
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      // Les trois lectures partent ENSEMBLE. En séquence, l'écran attendrait
      // trois allers-retours pour afficher une liste qui n'en a besoin que d'un
      // — et chacune est bornée à dix secondes, donc l'attente s'additionnerait.
      const [listeAmis, comptes, apercuFils] = await Promise.all([
        mesAmis(),
        mesNonLus(),
        mesApercus(),
      ]);

      if (listeAmis.statut === 'ok') {
        setAmis(listeAmis.amis);
        setErreur(null);
      } else {
        setAmis([]);
        if (listeAmis.statut === 'erreur') setErreur(listeAmis.message);
        else if (listeAmis.statut === 'non_authentifie') setErreur('Connectez-vous pour voir vos messages.');
      }

      // Les non-lus et les aperçus sont des CONFORTS : s'ils échouent, la liste
      // des amis reste affichée et l'écran reste utilisable. On ne remplace
      // donc pas `erreur` ici — une panne de pastille ne doit pas effacer la
      // liste.
      if (comptes.statut === 'ok') setNonLus(indexerNonLus(comptes.fils));
      if (apercuFils.statut === 'ok') setApercus(indexerApercus(apercuFils.apercus));
    } finally {
      setChargement(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  // Le temps réel : une pastille qui ne s'allume qu'en rouvrant l'écran ne sert
  // à rien. L'abonnement est posé ici et retiré au démontage — la fonction
  // rendue par `abonnerFils` est ce retrait, et `useEffect` l'appelle.
  useEffect(() => abonnerFils(() => charger()), [charger]);

  const jour = aujourdHui();
  const rangees = useMemo(
    () => rangerConversations(amis ?? [], apercus, nonLus),
    [amis, apercus, nonLus]
  );

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
        <Text style={styles.titre}>Messages</Text>
        <Pressable
          onPress={() => router.push('/amis')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Voir mes amis"
        >
          <Ionicons name="people-outline" size={24} color={colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.liste}>
        {chargement && amis === null && (
          <View style={styles.centre}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {amis !== null && amis.length === 0 && !chargement && (
          <View style={styles.vide}>
            <View style={styles.pastilleVide}>
              <Ionicons name="chatbubbles-outline" size={26} color={colors.primary} />
            </View>
            <Text style={styles.titreVide}>Aucune conversation</Text>
            <Text style={styles.texteVide}>
              Ajoutez un ami pour vous encourager mutuellement. Vous ne pouvez envoyer que
              du texte : ni photo, ni fichier, ni vidéo.
            </Text>
            <Pressable
              style={styles.boutonPlein}
              onPress={() => router.push('/amis')}
              accessibilityRole="button"
              accessibilityLabel="Ajouter un ami"
            >
              <Text style={styles.texteBoutonPlein}>Ajouter un ami</Text>
            </Pressable>
          </View>
        )}

        {rangees.map((ami) => {
          const compte = nonLus[ami.userId]?.nonLus ?? 0;
          const pastille = badgeNonLus(compte);
          const apercu = apercus[ami.userId] ?? null;
          const quand = formaterApercuDate(apercu?.dernierLe ?? null, jour);
          const identifiant = formaterIdentifiantPublic(ami.identifiantPublic);

          return (
            <Pressable
              key={ami.userId}
              style={({ pressed }) => [styles.ligne, pressed && styles.lignePressee]}
              onPress={() =>
                router.push({ pathname: '/discussion', params: { amiId: ami.userId, nom: ami.nom } })
              }
              accessibilityRole="button"
              accessibilityLabel={
                pastille === null
                  ? `Conversation avec ${ami.nom}`
                  : `Conversation avec ${ami.nom}, ${compte} message${compte > 1 ? 's' : ''} non lu${compte > 1 ? 's' : ''}`
              }
            >
              <Avatar nom={ami.nom} couleur={ami.avatarCouleur} />

              <View style={styles.colonne}>
                <View style={styles.premiereLigne}>
                  <Text style={[styles.nom, pastille !== null && styles.nomNonLu]} numberOfLines={1}>
                    {ami.nom}
                  </Text>
                  {quand.length > 0 && <Text style={styles.quand}>{quand}</Text>}
                </View>
                <View style={styles.secondeLigne}>
                  <Text
                    style={[styles.apercu, pastille !== null && styles.apercuNonLu]}
                    numberOfLines={1}
                  >
                    {/* Sans fil, l'identifiant public prend la place de
                        l'aperçu : il dit à qui l'on a affaire, ce qui est la
                        seule chose utile tant qu'aucun mot n'a été échangé. */}
                    {apercu === null && identifiant.length > 0
                      ? identifiant
                      : apercuTexte(apercu)}
                  </Text>
                  {pastille !== null && (
                    <View style={styles.pastille}>
                      <Text style={styles.textePastille}>{pastille}</Text>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          );
        })}

        {erreur !== null && <Text style={styles.erreur}>{erreur}</Text>}

        <Text style={styles.note}>
          Espace privé et modéré. Seuls vos amis acceptés peuvent vous écrire, et un ami
          bloqué ne le peut plus.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const creerStyles = (colors: Palette) => StyleSheet.create({
  ecran: {
    flex: 1,
    backgroundColor: colors.background,
  },
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  titre: {
    fontSize: fontSizes.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  liste: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
  },
  vide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxxl,
  },
  pastilleVide: {
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  titreVide: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  texteVide: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  boutonPlein: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
  },
  texteBoutonPlein: {
    color: colors.textOnPrimary,
    fontWeight: '600',
    fontSize: fontSizes.sm,
  },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
  },
  lignePressee: {
    backgroundColor: colors.surfaceVariant,
  },
  colonne: {
    flex: 1,
  },
  premiereLigne: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  nom: {
    flex: 1,
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  nomNonLu: {
    fontWeight: '700',
  },
  quand: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
  },
  secondeLigne: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: 2,
  },
  apercu: {
    flex: 1,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  apercuNonLu: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  pastille: {
    minWidth: 20,
    height: 20,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xs,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textePastille: {
    fontSize: fontSizes.xs,
    fontWeight: '700',
    color: colors.textOnPrimary,
  },
  erreur: {
    fontSize: fontSizes.sm,
    color: colors.error,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  note: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 15,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
});
