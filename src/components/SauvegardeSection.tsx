// Section « Sauvegarde en ligne » de l'écran Profil.
//
// Elle couvre trois situations distinctes, et les distingue explicitement :
//   - l'application n'est pas reliée à un projet Supabase ;
//   - elle l'est, mais personne n'est connecté ;
//   - un compte est connecté.
//
// La confirmation avant restauration n'est pas décidée ici : elle vient du
// refus `ecrasement_non_confirme` rendu par la logique de synchronisation. Il
// n'existe donc pas de chemin qui écrase la progression locale sans être passé
// par cette question.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Card } from '@/components/Card';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/theme';
import {
  creerCompte,
  ecouterSession,
  isSupabaseConfigured,
  seConnecter,
  seDeconnecter,
  utilisateurCourant,
  type ResultatAuth,
  type Utilisateur,
} from '@/lib/auth';
import {
  restaurerDepuisCloud,
  sauvegarderMaintenant,
  type ResultatService,
} from '@/lib/sync/service';

interface Props {
  /** Appelé après une restauration, pour que l'écran relise ses données. */
  onDonneesChangees?: () => void;
}

interface Message {
  texte: string;
  ton: 'succes' | 'erreur' | 'info';
}

/**
 * Délai au-delà duquel on cesse d'attendre une réponse de la sauvegarde.
 *
 * Assez long pour un réseau lent, assez court pour que l'utilisateur ne reste
 * pas devant un rond qui tourne : la connexion se fait en une à deux secondes
 * dans le cas normal.
 */
const DELAI_AUTH_MS = 15000;

/** Marqueur d'un délai dépassé. Jamais `null`, qui veut dire « déconnecté ». */
const TIMEOUT = Symbol('delai-depasse');

/**
 * Borne une promesse.
 *
 * La promesse d'origine n'est pas annulée — on ne peut pas interrompre un appel
 * déjà parti — mais on cesse de l'attendre, ce qui suffit : l'écran reprend la
 * main et l'utilisateur peut réessayer.
 */
function withTimeout<T>(promesse: Promise<T>, ms: number = DELAI_AUTH_MS): Promise<T | typeof TIMEOUT> {
  return Promise.race([
    promesse,
    new Promise<typeof TIMEOUT>((resoudre) => setTimeout(() => resoudre(TIMEOUT), ms)),
  ]);
}

/** Une tentative d'authentification bornée, traduite en résultat affichable. */
async function borner(tentative: Promise<ResultatAuth>): Promise<ResultatAuth> {
  const resultat = await withTimeout(tentative);
  if (resultat === TIMEOUT) {
    return {
      ok: false,
      message:
        'La connexion n’a pas répondu à temps. Vérifie ta connexion et réessaie.',
    };
  }
  return resultat;
}

/** Une exception inattendue devient un message, jamais un écran figé. */
function messageDePanique(erreur: unknown): ResultatAuth {
  return {
    ok: false,
    message:
      erreur instanceof Error
        ? `La connexion a échoué : ${erreur.message}`
        : 'La connexion a échoué.',
  };
}

export function SauvegardeSection({ onDonneesChangees }: Props) {
  const configure = isSupabaseConfigured();

  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  // Le verrou de réentrance, et pourquoi il n'est pas `enCours`.
  //
  // `enCours` désactive le bouton, mais React n'applique un état qu'au rendu
  // suivant. Deux appuis dans le même cycle — un doigt qui tremble, une
  // connexion lente — lancent donc deux tentatives. La seconde, hors de la
  // borne, remet `setEnCours(false)` et fait disparaître « en cours » pendant
  // que la première attend encore. Le bouton redevient actif, l'utilisateur
  // appuie une troisième fois, et l'on ne sait plus quel résultat s'affiche.
  //
  // Une référence, elle, est lue immédiatement. C'est la seule forme qui
  // refuse le second appui avant qu'il n'ait lancé quoi que ce soit.
  const enCoursReference = useRef(false);

  // `utilisateurCourant()` peut ne jamais rendre.
  //
  // La lecture de session passe par le client Supabase, qui la sérialise
  // derrière un verrou de stockage. Un verrou jamais relâché — une écriture de
  // session interrompue, un redémarrage au mauvais moment — et la promesse
  // reste en attente indéfiniment. Sur l'écran, `await` sans borne est
  // indiscernable d'un plantage : le rond tourne, et il n'y a rien à lire.
  //
  // On borne donc l'attente. Ce n'est pas une supposition sur la cause : c'est
  // la raison pour laquelle ce module ne peut pas rester bloqué, quelle que
  // soit la cause. Passé le délai, on rend « déconnecté », et l'écran propose
  // de se connecter — un état faux, mais un état *agissable*, et le prochain
  // appui le corrige.
  const rafraichirUtilisateur = useCallback(async () => {
    const resultat = await withTimeout(utilisateurCourant());
    setUtilisateur(resultat === TIMEOUT ? null : resultat);
  }, []);

  useEffect(() => {
    if (!configure) return;
    rafraichirUtilisateur();
    // Le désabonnement évite qu'un écran quitté continue d'être rappelé.
    return ecouterSession(setUtilisateur);
  }, [configure, rafraichirUtilisateur]);

  function afficher(resultat: ResultatService) {
    if (resultat.statut === 'reussi') {
      setMessage({ texte: resultat.message, ton: 'succes' });
      return;
    }
    if (resultat.statut === 'indisponible') {
      setMessage({ texte: resultat.message, ton: 'info' });
      return;
    }
    setMessage({ texte: resultat.message, ton: 'erreur' });
  }

  async function executer(action: () => Promise<ResultatService>) {
    setEnCours(true);
    setMessage(null);
    try {
      const resultat = await action();
      afficher(resultat);
      return resultat;
    } catch (erreur) {
      setMessage({
        texte:
          erreur instanceof Error
            ? `La sauvegarde a échoué : ${erreur.message}`
            : 'La sauvegarde a échoué.',
        ton: 'erreur',
      });
      return null;
    } finally {
      setEnCours(false);
    }
  }

  // Les deux gestes d'authentification sont bornés, et leur résultat traduit
  // avant d'être affiché. « En cours… » est écrit AVANT l'appel et retiré dans
  // un `finally` : quelle que soit l'issue — succès, refus, exception, délai —
  // il n'existe plus de chemin où le rond reste.
  const handleCreerCompte = async () => {
    if (enCoursReference.current) return;
    enCoursReference.current = true;
    setEnCours(true);
    setMessage(null);
    let resultat: ResultatAuth;
    try {
      resultat = await borner(creerCompte(email, motDePasse));
    } catch (erreur) {
      resultat = messageDePanique(erreur);
    } finally {
      enCoursReference.current = false;
      setEnCours(false);
    }
    setMessage({ texte: resultat.message, ton: resultat.ok ? 'succes' : 'erreur' });
    if (resultat.ok) {
      setMotDePasse('');
      await rafraichirUtilisateur();
    }
  };

  const handleConnexion = async () => {
    if (enCoursReference.current) return;
    enCoursReference.current = true;
    setEnCours(true);
    setMessage(null);
    let resultat: ResultatAuth;
    try {
      resultat = await borner(seConnecter(email, motDePasse));
    } catch (erreur) {
      resultat = messageDePanique(erreur);
    } finally {
      enCoursReference.current = false;
      setEnCours(false);
    }
    setMessage({ texte: resultat.message, ton: resultat.ok ? 'succes' : 'erreur' });
    if (resultat.ok) {
      setMotDePasse('');
      await rafraichirUtilisateur();
    }
  };

  const lancerRestauration = async (confirmer: boolean) => {
    const resultat = await executer(() => restaurerDepuisCloud(confirmer));
    if (resultat?.statut === 'reussi') {
      onDonneesChangees?.();
    }
  };

  const handleRestaurer = async () => {
    // Premier appel sans confirmation : s'il y a quelque chose à perdre, la
    // logique refuse, et c'est ce refus qui déclenche la question.
    const premier = await executer(() => restaurerDepuisCloud(false));

    if (premier?.statut === 'refuse' && premier.raison === 'ecrasement_non_confirme') {
      Alert.alert(
        'Remplacer la progression de cet appareil ?',
        'La progression enregistrée ici sera remplacée par celle de votre compte. ' +
          'Les séances terminées sur cet appareil seront perdues.',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Remplacer',
            style: 'destructive',
            onPress: () => lancerRestauration(true),
          },
        ]
      );
    }
  };

  const handleDeconnexion = () => {
    Alert.alert(
      'Se déconnecter ?',
      'Votre progression reste sur cet appareil et dans votre compte. ' +
        'Vous pourrez la retrouver en vous reconnectant.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Se déconnecter',
          style: 'destructive',
          onPress: async () => {
            await seDeconnecter();
            setUtilisateur(null);
            setMessage({ texte: 'Vous êtes déconnecté.', ton: 'info' });
          },
        },
      ]
    );
  };

  return (
    <>
      <Text style={styles.sectionTitle}>Sauvegarde en ligne</Text>

      {!configure && (
        <Card>
          <View style={styles.ligneInfo}>
            <Ionicons name="cloud-offline-outline" size={20} color={colors.textTertiary} />
            <Text style={styles.texteInfo}>
              La sauvegarde en ligne n’est pas configurée sur cette version. Votre progression
              reste enregistrée sur cet appareil.
            </Text>
          </View>
        </Card>
      )}

      {configure && utilisateur === null && (
        <Card>
          <Text style={styles.intro}>
            Créez un compte pour retrouver votre progression sur un autre téléphone. Sans compte,
            tout reste sur cet appareil.
          </Text>

          <TextInput
            style={styles.champ}
            placeholder="Adresse électronique"
            placeholderTextColor={colors.textTertiary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            editable={!enCours}
          />
          <TextInput
            style={styles.champ}
            placeholder="Mot de passe"
            placeholderTextColor={colors.textTertiary}
            value={motDePasse}
            onChangeText={setMotDePasse}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            editable={!enCours}
          />

          <View style={styles.boutons}>
            <Pressable
              style={[styles.bouton, styles.boutonPrincipal, enCours && styles.boutonInactif]}
              onPress={handleConnexion}
              disabled={enCours}
            >
              <Text style={styles.texteBoutonPrincipal}>Se connecter</Text>
            </Pressable>
            <Pressable
              style={[styles.bouton, styles.boutonSecondaire, enCours && styles.boutonInactif]}
              onPress={handleCreerCompte}
              disabled={enCours}
            >
              <Text style={styles.texteBoutonSecondaire}>Créer un compte</Text>
            </Pressable>
          </View>
        </Card>
      )}

      {configure && utilisateur !== null && (
        <Card>
          <View style={styles.ligneInfo}>
            <Ionicons name="cloud-done-outline" size={20} color={colors.success} />
            <View style={styles.blocIdentite}>
              <Text style={styles.libelleCompte}>Compte connecté</Text>
              <Text style={styles.emailCompte}>{utilisateur.email}</Text>
            </View>
          </View>
        </Card>
      )}

      {configure && utilisateur !== null && (
        <>
          <Pressable
            style={[styles.actionRow, enCours && styles.boutonInactif]}
            onPress={() => executer(() => sauvegarderMaintenant())}
            disabled={enCours}
          >
            <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
            <Text style={styles.actionText}>Sauvegarder ma progression</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </Pressable>

          <Pressable
            style={[styles.actionRow, enCours && styles.boutonInactif]}
            onPress={handleRestaurer}
            disabled={enCours}
          >
            <Ionicons name="cloud-download-outline" size={20} color={colors.primary} />
            <Text style={styles.actionText}>Restaurer depuis mon compte</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </Pressable>

          <Pressable style={styles.actionRow} onPress={handleDeconnexion} disabled={enCours}>
            <Ionicons name="log-out-outline" size={20} color={colors.error} />
            <Text style={[styles.actionText, styles.actionTextDanger]}>Se déconnecter</Text>
          </Pressable>
        </>
      )}

      {enCours && (
        <View style={styles.ligneInfo}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.texteInfo}>En cours…</Text>
        </View>
      )}

      {message !== null && !enCours && (
        <View style={[styles.message, styles[`message_${message.ton}`]]}>
          <Text style={styles.texteMessage}>{message.texte}</Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: fontSizes.sm,
    color: colors.textTertiary,
    fontWeight: fontWeights.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  intro: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  champ: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    marginBottom: spacing.sm,
  },
  boutons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  bouton: {
    flex: 1,
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
  ligneInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  blocIdentite: {
    flex: 1,
  },
  libelleCompte: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
  },
  emailCompte: {
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    fontWeight: fontWeights.medium,
    marginTop: 2,
  },
  texteInfo: {
    flex: 1,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionText: {
    flex: 1,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  actionTextDanger: {
    color: colors.error,
  },
  message: {
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
  },
  message_succes: {
    backgroundColor: colors.successLight,
    borderColor: colors.success,
  },
  message_erreur: {
    backgroundColor: colors.errorLight,
    borderColor: colors.error,
  },
  message_info: {
    backgroundColor: colors.infoLight,
    borderColor: colors.info,
  },
  texteMessage: {
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
    lineHeight: 20,
  },
});
