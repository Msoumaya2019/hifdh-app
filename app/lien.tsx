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
// Le lien arrive avec les jetons dans le FRAGMENT de l'adresse. Les deux
// lectures d'adresse de l'écran les rendent tels quels, mais il ne faut PAS
// les journaliser : ce sont des identifiants de session. Rien ici ne les
// affiche ni ne les écrit.

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

import { colors, fontSizes, fontWeights, radii, spacing, useStyles, type Palette } from '@/theme';
import {
  LONGUEUR_MOT_DE_PASSE,
  changerMotDePasse,
  ouvrirSessionDepuisLien,
  verifierNouveauMotDePasse,
} from '@/lib/auth';
import type { LienAuth } from '@/lib/lienAuth';
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

/**
 * Le délai au-delà duquel un état d'attente devient un problème à dire.
 *
 * `attente` — aucune adresse reçue — et `ouverture` — échange des jetons — sont
 * les deux seuls états où l'écran ne fait qu'attendre, et ni l'un ni l'autre
 * n'offre d'action. Un lien qui n'atteint pas l'écran, ou un échange qui ne
 * rend pas, les laissait donc affichés POUR TOUJOURS : signalé depuis un
 * téléphone, et impossible à distinguer d'un traitement en cours.
 *
 * Huit secondes : au-delà, l'utilisateur n'attend plus rien d'utile, et la
 * seule action qui compte — demander un nouveau lien depuis le Profil — doit
 * lui être proposée.
 */
const DELAI_SANS_SORTIE_MS = 8000;

/** Ce qu'on dit quand l'attente n'a pas abouti. Une action, à chaque fois. */
const MESSAGE_SANS_SORTIE: Record<'attente' | 'ouverture', string> = {
  attente:
    'Aucun lien n’a été reçu. Demandez-en un nouveau depuis l’écran Profil, puis ouvrez-le ' +
    'depuis la messagerie de ce téléphone.',
  ouverture:
    'Le lien n’a pas pu être ouvert. Demandez-en un nouveau depuis l’écran Profil.',
};

export default function LienScreen() {
  const styles = useStyles(creerStyles);
  // DEUX SOURCES, ET IL FAUT LES DEUX.
  //
  // Le commentaire qui tenait ici affirmait que `useURL` couvrait « application
  // fermée » et « application déjà ouverte ». C'est faux, et c'est ce qui a été
  // signalé depuis un téléphone : le lien ouvre bien l'application, et l'écran
  // reste sur « Ouverture du lien… » pour toujours. L'origine est dans le
  // paquet installé, `expo-linking/ios/` :
  //
  //   • `Linking.useURL()` s'appuie sur React Native. Son `getInitialURL()` ne
  //     rend l'adresse que si l'application a été LANCÉE par le lien, et son
  //     événement `url` ne touche que les écouteurs DÉJÀ posés. Or l'écran
  //     `/lien` est monté par le routeur APRÈS l'arrivée de l'adresse : à
  //     l'ouverture à chaud — l'application tournait, ce qui est le cas quand
  //     on vient de demander le lien depuis l'écran Profil — les deux
  //     manquent, et `useURL` rend `null` sans fin.
  //   • `Linking.useLinkingURL()` lit `ExpoLinking.getLinkingURL()`, et le
  //     délégué d'application renseigne ce registre à CHAQUE ouverture par
  //     lien (`LinkingAppDelegateSubscriber` →
  //     `ExpoLinkingRegistry.shared.initialURL = url`). L'adresse y SURVIT à
  //     l'événement, et la lecture est synchrone au premier rendu.
  //
  // Aucune des deux ne suffit seule : sur un lancement à froid, le registre
  // d'Expo reste vide, parce qu'iOS n'appelle pas le délégué `open url` quand
  // l'application démarre — c'est React Native qui a l'adresse. On lit donc les
  // deux, et l'on traite la première adresse qui n'a pas encore été traitée.
  const urlNative = Linking.useURL();
  const urlExpo = Linking.useLinkingURL();

  const [etat, setEtat] = useState<Etat>({ nom: 'attente' });
  // Le lien lu, gardé pour l'affichage : le message de confirmation dépend de
  // son type, et le relire à chaque rendu depuis une adresse qui peut changer
  // afficherait le message d'une autre ouverture.
  const [lien, setLien] = useState<LienAuth>(() => lireLienAuth(null));
  const [motDePasse, setMotDePasse] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  // Un lien ne doit être traité QU'UNE FOIS.
  //
  // Les deux sources peuvent annoncer la même ouverture — un changement d'état
  // suffit à faire rendre la même adresse à plusieurs rendus. Sans ce garde,
  // l'échange des jetons serait relancé, et `setSession` consommerait deux fois
  // le même jeton de rafraîchissement : la seconde tentative échouerait, et
  // l'écran afficherait une erreur alors que tout s'était bien passé.
  const dejaTraitees = useRef<Set<string>>(new Set());

  const traiter = useCallback(async (adresse: string) => {
    // `lireLienAuth` ne lève jamais — c'est écrit dans son contrat. La lecture
    // reste donc hors du rattrapage, qui ne vise que le réseau et le stockage.
    const lu = lireLienAuth(adresse);
    setLien(lu);

    try {
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
    } catch (erreur) {
      // `ouvrirSessionDepuisLien` peut REJETER, et pas seulement rendre
      // `{ ok: false }`. Mesuré : `client.auth.setSession` rejette quand le
      // stockage refuse une clé, parce qu'il écrit la session. Sans ce
      // rattrapage, l'écran restait sur « Vérification du lien… » sans jamais
      // rien dire — et le rejet partait en rejet non traité.
      setEtat({
        nom: 'probleme',
        message:
          erreur instanceof Error
            ? `Le lien n’a pas pu être traité : ${erreur.message}`
            : 'Le lien n’a pas pu être traité. Demandez-en un nouveau depuis l’écran Profil.',
      });
    }
  }, []);

  useEffect(() => {
    const candidates = [urlNative, urlExpo].filter(
      (adresse): adresse is string => typeof adresse === 'string' && adresse !== ''
    );

    for (const adresse of candidates) {
      if (dejaTraitees.current.has(adresse)) continue;
      dejaTraitees.current.add(adresse);
      void traiter(adresse);
      // UNE SEULE adresse par passage : les deux sources annoncent la même
      // ouverture, et traiter la seconde relancerait l'échange des jetons que
      // la première vient de consommer.
      return;
    }
  }, [urlNative, urlExpo, traiter]);

  // AUCUN ÉTAT D'ATTENTE NE DOIT DURER SANS SORTIE.
  //
  // C'est la garantie que cet écran n'avait pas, et c'est ce qui a été signalé
  // depuis un téléphone : le lien ouvre bien l'application, l'écran s'affiche,
  // et « Ouverture du lien… » reste là — sans bouton, sans erreur, sans fin.
  // Un état qui attend doit avoir une échéance, et son échéance doit proposer
  // l'action utile.
  //
  // On ne rétrograde QUE l'état observé : si `traiter` a entre-temps avancé —
  // la session s'est ouverte, le lien a été reconnu — on ne l'écrase pas.
  useEffect(() => {
    if (etat.nom !== 'attente' && etat.nom !== 'ouverture') return;
    const attendu = etat.nom;

    const minuterie = setTimeout(() => {
      setEtat((precedent) =>
        precedent.nom === attendu
          ? { nom: 'probleme', message: MESSAGE_SANS_SORTIE[attendu] }
          : precedent
      );
    }, DELAI_SANS_SORTIE_MS);

    return () => clearTimeout(minuterie);
  }, [etat.nom]);

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

const creerStyles = (colors: Palette) => StyleSheet.create({
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
