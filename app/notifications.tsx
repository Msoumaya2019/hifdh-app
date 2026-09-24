// Les réglages de notification.
//
// TROIS CHOSES S'Y DÉCIDENT, ET ELLES SONT LIÉES
// ----------------------------------------------
//  1. ce que l'on veut recevoir — six interrupteurs ;
//  2. l'autorisation du système, demandée AU MOMENT où l'on active quelque
//     chose, jamais à l'ouverture. Sur iOS un refus est définitif : le système
//     ne repose plus la question, et l'application ne peut plus rien proposer.
//     Demander avant que la personne sache à quoi cela sert, c'est donc perdre
//     la fonctionnalité pour de bon ;
//  3. le jeton de cet appareil, qu'il faut enregistrer pour que le serveur
//     sache où faire sonner.
//
// L'ORDRE COMPTE : on explique, puis on demande, puis on enregistre. Un
// enregistrement de jeton avant l'autorisation échouerait, et l'échec
// parlerait de réseau alors qu'il s'agirait d'une question de permission.
//
// CE QUI SE PASSE QUAND LE SERVEUR N'EST PAS ENCORE CONFIGURÉ
// ----------------------------------------------------------
// Rien ne casse, et l'écran le DIT. Les interrupteurs restent utilisables et
// les préférences s'enregistrent : elles seront respectées le jour où les
// notifications partiront. C'est le choix « code maintenant, activation
// ensuite » — et il ne doit pas se solder par six interrupteurs qui ne font
// rien sans que personne ne sache pourquoi.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Card } from '@/components/Card';
import {
  LIBELLES_PREFERENCES,
  PREFERENCES_PAR_DEFAUT,
  basculer,
  resumeNotifications,
  type PreferenceNotification,
  type PreferencesNotifications,
} from '@/lib/notifications';
import { enregistrerAppareil, enregistrerPreferences, mesPreferences } from '@/lib/sync/notifications';
import { obtenirJeton, type EtatPermission } from '@/lib/push';
import { colors, fontSizes, spacing, radii, useStyles, type Palette } from '@/theme';

export default function NotificationsScreen() {
  const styles = useStyles(creerStyles);

  const [preferences, setPreferences] = useState<PreferencesNotifications>({
    ...PREFERENCES_PAR_DEFAUT,
  });
  const [permission, setPermission] = useState<EtatPermission>('non_demandee');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  // Le message qui explique POURQUOI les notifications ne partiront pas encore,
  // quand ce n'est ni un refus ni une panne — un projet non relié, par exemple.
  const [avertissement, setAvertissement] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      void (async () => {
        try {
          const resultat = await mesPreferences();
          if (!vivant) return;
          if (resultat.statut === 'ok') {
            setPreferences(resultat.preferences);
            setErreur(null);
          } else if (resultat.statut === 'erreur') {
            setErreur(resultat.message);
          }
        } finally {
          if (vivant) setChargement(false);
        }
      })();
      return () => {
        vivant = false;
      };
    }, [])
  );

  /**
   * S'assure qu'un jeton est enregistré, et dit ce qui manque quand il ne l'est
   * pas. Rend `true` si l'appareil est joignable par le serveur.
   */
  async function assurerLeJeton(): Promise<boolean> {
    const resultat = await obtenirJeton();

    if (resultat.statut === 'ok') {
      const enregistre = await enregistrerAppareil(resultat.jeton, resultat.plateforme);
      if (enregistre.statut === 'ok' && enregistre.fait) {
        setPermission('accordee');
        setAvertissement(null);
        return true;
      }
      setAvertissement(
        "Cet appareil n'a pas pu être enregistré. Les notifications ne partiront pas tant qu'il ne l'est pas."
      );
      return false;
    }

    if (resultat.statut === 'refusee') {
      setPermission('refusee');
      setAvertissement(null);
      return false;
    }

    if (resultat.statut === 'projet_absent') {
      // Le cas le plus probable tant que rien n'est configuré, et celui qu'il
      // faut nommer précisément : « notifications indisponibles » ferait
      // chercher au mauvais endroit.
      setAvertissement(
        "Cet exemplaire n'est pas relié à un projet Expo : les notifications ne peuvent pas encore partir. Voir docs/notifications-push.md."
      );
      return false;
    }

    setAvertissement(resultat.message);
    return false;
  }

  async function basculerUne(cle: PreferenceNotification) {
    const suivantes = basculer(preferences, cle);
    const avant = preferences;
    setPreferences(suivantes);
    setErreur(null);

    // On ne demande l'autorisation QUE pour un interrupteur qui reçoit quelque
    // chose. Le masquage n'envoie rien : le demander pour lui ferait demander
    // une autorisation sans rapport avec le geste.
    if (suivantes[cle] && cle !== 'masquer_contenu') {
      await assurerLeJeton();
    }

    const resultat = await enregistrerPreferences(suivantes);
    if (resultat.statut === 'ok' && resultat.fait) return;

    // Le réglage n'a pas été écrit : on REMET l'interrupteur où il était. Un
    // interrupteur qui reste basculé sans que rien ne soit enregistré est un
    // mensonge qui se découvre le jour où la notification n'arrive pas.
    setPreferences(avant);
    setErreur(
      resultat.statut === 'erreur'
        ? resultat.message
        : "Ce réglage n'a pas pu être enregistré. Vérifiez votre connexion."
    );
  }

  if (chargement) {
    return (
      <SafeAreaView style={styles.ecran} edges={['top']}>
        <View style={styles.centre}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

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
        <Text style={styles.titre}>Notifications</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.contenu}>
        {/* Ce qui est expliqué AVANT que le système ne demande. */}
        <Card>
          <Text style={styles.introTitre}>Ce que tu recevras</Text>
          <Text style={styles.introTexte}>
            Un message d’un ami, une demande d’ami, ou une étape qu’il a choisi de partager.
            Rien d’autre. Tu peux tout couper ici, et le contenu des messages peut rester
            masqué même quand les notifications sont actives.
          </Text>
        </Card>

        {permission === 'refusee' && (
          <Card>
            <Text style={styles.alerte}>
              Les notifications sont refusées pour cette application. Pour les réactiver,
              ouvre les réglages du téléphone, cherche « Hifdh », puis « Notifications ».
              Un refus ne peut pas être levé depuis l’application.
            </Text>
          </Card>
        )}

        {avertissement !== null && (
          <Card>
            <Text style={styles.alerte}>{avertissement}</Text>
          </Card>
        )}

        <Card>
          {LIBELLES_PREFERENCES.map((entree, index) => (
            <View
              key={entree.cle}
              style={[styles.ligne, index > 0 && styles.ligneSeparee]}
            >
              <View style={styles.texteLigne}>
                <View style={styles.titreRangee}>
                  <Text style={styles.titreLigne}>{entree.titre}</Text>
                  {/* Deux réglages sont rangés sans rien envoyer encore. Le
                      dire sur la ligne évite d'attendre une notification qui
                      ne viendrait pas, et de chercher la panne du mauvais
                      côté. */}
                  {entree.bientot && (
                    <View style={styles.pastille}>
                      <Text style={styles.textePastille}>Bientôt</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.aideLigne}>{entree.aide}</Text>
              </View>
              <Switch
                value={preferences[entree.cle]}
                onValueChange={() => basculerUne(entree.cle)}
                trackColor={{ false: colors.border, true: colors.primarySurface }}
                thumbColor={preferences[entree.cle] ? colors.primary : colors.surface}
                accessibilityLabel={entree.titre}
                accessibilityHint={entree.aide}
              />
            </View>
          ))}
        </Card>

        <Text style={styles.resume}>{resumeNotifications(preferences)}</Text>

        {erreur !== null && <Text style={styles.erreur}>{erreur}</Text>}

        <Text style={styles.note}>
          Les notifications partent du serveur, jamais de l’appareil de ton ami : elles
          arrivent même s’il ferme l’application aussitôt après avoir écrit.
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
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contenu: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  introTitre: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  introTexte: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  alerte: {
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
  ligneSeparee: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  texteLigne: {
    flex: 1,
  },
  titreRangee: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pastille: {
    backgroundColor: colors.surfaceVariant,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  textePastille: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  titreLigne: {
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  aideLigne: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  resume: {
    fontSize: fontSizes.sm,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  erreur: {
    fontSize: fontSizes.sm,
    color: colors.error,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 19,
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
