// L'écran qui reçoit un lien de courriel : confirmation d'adresse, ou
// réinitialisation de mot de passe.
//
// POURQUOI UN SEUL ÉCRAN POUR LES DEUX
// ------------------------------------
// Les deux liens arrivent à la même adresse (`hifdh://lien`) et ne diffèrent que
// par leur contenu. `lireLienAuth` dit lequel c'est ; l'écran décide ensuite.
// Deux écrans feraient la même chose à une ligne près, et il y aurait deux
// endroits où oublier de traiter le lien expiré.
//
// CE QUE CET ÉCRAN DOIT DIRE, ET POURQUOI C'EST LE PLUS IMPORTANT
// --------------------------------------------------------------
// Un lien de courriel échoue de trois façons, et l'utilisateur ne peut pas les
// distinguer : expiré (ils le sont au bout d'une heure), déjà servi (un lien ne
// marche qu'une fois), ou abîmé par le client de messagerie. Dans les trois cas
// il voit la même chose : rien ne se passe. Cet écran nomme donc la cause
// quand il la connaît, et propose toujours la seule action utile — en demander
// un nouveau depuis l'écran Profil.
//
// UN POINT QUI COMPTE
// -------------------
// Le lien arrive avec les jetons dans le FRAGMENT de l'adresse. `useURL()` les
// rend tels quels, mais il ne faut PAS les journaliser : ce sont des
// identifiants de session. Rien ici ne les affiche ni ne les écrit.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';

import { colors, fontSizes, fontWeights, radii, spacing } from '@/theme';
import {
  LONGUEUR_MOT_DE_PASSE,
  changerMotDePasse,
  ouvrirSessionDepuisLien,
  verifierNouveauMotDePasse,
} from '@/lib/auth';
import {
  lienDemandeUnNouveauMotDePasse,
  lienPorteDesJetons,
  lireLienAuth,
  messageDuLien,
} from '@/lib/lienAuth';

/** Ce que l'écran montre. Un état, et non un mélange de booléens. */
type Etat =
  | { nom: 'attente' }
  | { nom: 'ouverture' }
  | { nom: 'motDePasse' }
  | { nom: 'confirme' }
  | { nom: 'probleme'; message: string };

export default function LienScreen() {
  // `useURL` rend l'adresse qui a ouvert l'application, et la met à jour quand
  // une nouvelle arrive. Elle couvre donc les deux cas : application fermée
  // (démarrage à froid) et application déjà ouverte (lien suivi depuis la
  // messagerie). Un `getInitialURL()` seul raterait le second.
  const url = Linking.useURL();
  const lien = lireLienAuth(url);

  const [etat, setEtat] = useState<Etat>({ nom: 'attente' });
  const [motDePasse, setMotDePasse] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  // Un lien ne doit être traité QU'UNE FOIS.
  //
  // `useURL` peut rendre la même adresse à plusieurs rendus — un changement
  // d'état suffit. Sans ce garde, l'échange des jetons serait relancé, et
  // `setSession` consommerait deux fois le même jeton de rafraîchissement : la
  // seconde tentative échouerait, et l'écran afficherait une erreur alors que
  // tout s'était bien passé.
  const dejaTraite = useRef<string | null>(null);

  const traiter = useCallback(async (adresse: string) => {
    const lu = lireLienAuth(adresse);

    if (lu.erreur !== null) {
      setEtat({ nom: 'probleme', message: lu.erreur });
      return;
    }

    if (lu.type === 'confirmation') {
      // Le lien de confirmation a déjà validé l'adresse côté Supabase : il n'y
      // a rien à échanger. Si des jetons sont là, on ouvre la session, ce qui
      // évite une reconnexion — mais ce n'est pas indispensable.
      if (lienPorteDesJetons(lu) && lu.refreshToken !== null) {
        await ouvrirSessionDepuisLien(lu.accessToken ?? '', lu.refreshToken);
      }
      setEtat({ nom: 'confirme' });
      return;
    }

    if (lienDemandeUnNouveauMotDePasse(lu)) {
      if (!lienPorteDesJetons(lu) || lu.refreshToken === null) {
        // Sans jetons, il n'y a rien à ouvrir. C'est le cas d'un lien PKCE
        // (`?code=…`) : l'échange exigerait le vérificateur déposé par
        // l'appareil qui a DEMANDÉ le lien. Suivre le lien sur un autre
        // appareil ne peut donc pas marcher, et le dire vaut mieux qu'un
        // échec muet.
        setEtat({
          nom: 'probleme',
          message:
            'Ce lien doit être ouvert sur le téléphone qui a demandé la ' +
            'réinitialisation. Demandez-en un nouveau depuis l’application.',
        });
        return;
      }

      setEtat({ nom: 'ouverture' });
      const resultat = await ouvrirSessionDepuisLien(lu.accessToken ?? '', lu.refreshToken);
      if (!resultat.ok) {
        setEtat({ nom: 'probleme', message: resultat.message });
        return;
      }
      setEtat({ nom: 'motDePasse' });
      return;
    }

    setEtat({
      nom: 'probleme',
      message:
        'Ce lien n’a pas pu être reconnu. Demandez-en un nouveau depuis ' +
        'l’application, dans l’écran Profil.',
    });
  }, []);

  useEffect(() => {
    if (url === null || url === '') return;
    if (dejaTraite.current === url) return;
    dejaTraite.current = url;
    void traiter(url);
  }, [url, traiter]);

  const enregistrer = async () => {
    const probleme = verifierNouveauMotDePasse(motDePasse);
    if (probleme !== null) {
      setMessage(probleme);
      return;
    }

    setEnCours(true);
    setMessage(null);
    try {
      const resultat = await changerMotDePasse(motDePasse);
      setMessage(resultat.message);
      if (resultat.ok) {
        setMotDePasse('');
        // Le mot de passe est changé et la session est ouverte : l'écran
        // Profil est l'endroit où l'on voit qu'on est connecté.
        router.replace('/(tabs)/profil');
      }
    } catch (erreur) {
      setMessage(
        erreur instanceof Error
          ? `Le mot de passe n’a pas pu être changé : ${erreur.message}`
          : 'Le mot de passe n’a pas pu être changé.'
      );
    } finally {
      setEnCours(false);
    }
  };

  return (
    <SafeAreaView style={styles.ecran} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.contenu}>
        <View style={styles.entete}>
          <Ionicons name="key-outline" size={40} color={colors.primary} />
          <Text style={styles.titre}>Lien de courriel</Text>
        </View>

        {etat.nom === 'attente' && (
          <Text style={styles.texte}>
            Ouverture du lien… Si rien ne se passe, revenez à l’écran Profil et demandez un
            nouveau lien.
          </Text>
        )}

        {etat.nom === 'ouverture' && (
          <View style={styles.ligne}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.texte}>Vérification du lien…</Text>
          </View>
        )}

        {etat.nom === 'confirme' && (
          <>
            <View style={styles.ligne}>
              <Ionicons name="checkmark-circle-outline" size={22} color={colors.success} />
              <Text style={styles.texte}>
                {messageDuLien(lien) ?? 'Votre adresse est confirmée.'}
              </Text>
            </View>
            <Pressable
              style={[styles.bouton, styles.boutonPrincipal]}
              onPress={() => router.replace('/(tabs)/profil')}
            >
              <Text style={styles.texteBoutonPrincipal}>Aller à mon profil</Text>
            </Pressable>
          </>
        )}

        {etat.nom === 'motDePasse' && (
          <>
            <Text style={styles.texte}>
              Choisissez un nouveau mot de passe. Il doit contenir au moins{' '}
              {LONGUEUR_MOT_DE_PASSE} caractères.
            </Text>

            <TextInput
              style={styles.champ}
              placeholder="Nouveau mot de passe"
              placeholderTextColor={colors.textTertiary}
              value={motDePasse}
              onChangeText={setMotDePasse}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              editable={!enCours}
            />

            <Pressable
              style={[styles.bouton, styles.boutonPrincipal, enCours && styles.boutonInactif]}
              onPress={enregistrer}
              disabled={enCours}
            >
              <Text style={styles.texteBoutonPrincipal}>Enregistrer</Text>
            </Pressable>

            {enCours && (
              <View style={styles.ligne}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.texte}>Enregistrement…</Text>
              </View>
            )}

            {message !== null && !enCours && <Text style={styles.texteErreur}>{message}</Text>}
          </>
        )}

        {etat.nom === 'probleme' && (
          <>
            <View style={styles.ligne}>
              <Ionicons name="alert-circle-outline" size={22} color={colors.error} />
              <Text style={styles.texteErreur}>{etat.message}</Text>
            </View>
            <Pressable
              style={[styles.bouton, styles.boutonSecondaire]}
              onPress={() => router.replace('/(tabs)/profil')}
            >
              <Text style={styles.texteBoutonSecondaire}>Retour au profil</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  ecran: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contenu: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  entete: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  titre: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  texte: {
    flex: 1,
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  texteErreur: {
    flex: 1,
    fontSize: fontSizes.md,
    color: colors.error,
    lineHeight: 22,
  },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  champ: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  bouton: {
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  boutonPrincipal: {
    backgroundColor: colors.primary,
  },
  boutonSecondaire: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  boutonInactif: {
    opacity: 0.5,
  },
  texteBoutonPrincipal: {
    color: colors.textOnPrimary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  texteBoutonSecondaire: {
    color: colors.primary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
});
