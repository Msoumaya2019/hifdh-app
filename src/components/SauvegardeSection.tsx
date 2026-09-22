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

import { useCallback, useEffect, useState } from 'react';
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

export function SauvegardeSection({ onDonneesChangees }: Props) {
  const configure = isSupabaseConfigured();

  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const rafraichirUtilisateur = useCallback(async () => {
    setUtilisateur(await utilisateurCourant());
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

  const handleCreerCompte = async () => {
    setEnCours(true);
    setMessage(null);
    const resultat = await creerCompte(email, motDePasse);
    setEnCours(false);
    setMessage({ texte: resultat.message, ton: resultat.ok ? 'succes' : 'erreur' });
    if (resultat.ok) {
      setMotDePasse('');
      await rafraichirUtilisateur();
    }
  };

  const handleConnexion = async () => {
    setEnCours(true);
    setMessage(null);
    const resultat = await seConnecter(email, motDePasse);
    setEnCours(false);
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
