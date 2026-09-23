// L'écran de discussion entre deux amis : des mots, et rien d'autre.
//
// Ce que cet écran ne fait pas, et c'est délibéré :
//   - il n'y a AUCUN bouton pour joindre quoi que ce soit. Pas d'image, pas de
//     fichier, pas de vidéo — et ce n'est pas une omission d'interface : la
//     table n'a aucune colonne pour les ranger (voir `supabase/discussions.sql`).
//     Un bouton qui n'existe pas ne peut pas être ajouté par erreur plus tard ;
//   - il ne laisse pas modifier un message déjà envoyé. Le texte part, et il
//     reste. On peut le RETIRER — le fil garde une pierre tombale — mais pas le
//     réécrire ;
//   - il ne décide pas de la longueur permis : `refusEnvoi` le fait, dans
//     `src/lib/discussion.ts`, où la règle se teste sans réseau.
//
// Ce que l'utilisateur doit savoir, et qui est dit sur l'écran : l'espace est
// MODÉRÉ. Un message masqué par la modération disparaît du fil, et le texte
// n'est pas effacé pour autant — il reste lisible par le modérateur. C'est un
// choix, et il se dit à l'endroit où l'on écrit, pas dans un document séparé.

import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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

import { colors, fontSizes, spacing, radii, useStyles, type Palette } from '@/theme';
import {
  LONGUEUR_MESSAGE_MAX,
  caracteresRestants,
  formaterEnvoi,
  messageErreurDiscussion,
  refusEnvoi,
  rangerFil,
  resumerFil,
  separateurDeJour,
  texteAffiche,
  type MessageDiscussion,
} from '@/lib/discussion';
import { envoyerMessage, lireFil, retirerMessage } from '@/lib/sync/discussion';

/**
 * Le jour d'aujourd'hui, au format `AAAA-MM-JJ`.
 *
 * Construit à la main plutôt que par `toISOString()` : celui-ci convertit en
 * UTC et ferait basculer la date d'un jour en soirée, ce que ce projet a déjà
 * payé une fois. Voir `src/lib/dates.ts`.
 */
function aujourdhuiLocal(): string {
  const d = new Date();
  const mois = String(d.getMonth() + 1).padStart(2, '0');
  const jour = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mois}-${jour}`;
}

export default function DiscussionScreen() {
  const styles = useStyles(creerStyles);
  // Le nom de l'ami et son identifiant viennent de l'écran des amis, qui les
  // passe en paramètre. Un paramètre lu une seule fois à l'initialisation serait
  // ignoré si l'écran est déjà monté — le projet a mesuré ce comportement sur un
  // écran d'onglet —, d'où la lecture à chaque rendu plutôt qu'un `useState`.
  const params = useLocalSearchParams<{ amiId?: string; nom?: string }>();
  const amiId = typeof params.amiId === 'string' ? params.amiId : '';
  const nom = typeof params.nom === 'string' && params.nom.length > 0 ? params.nom : 'Votre ami';

  const [messages, setMessages] = useState<MessageDiscussion[] | null>(null);
  const [saisie, setSaisie] = useState('');
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Deux appuis sur « envoyer » lanceraient deux envois. `envoi` (un `useState`)
  // désactive le bouton visuellement, mais React ne l'applique qu'au rendu
  // suivant — donc pas avant que le second appui n'arrive. Une référence est la
  // seule forme qui refuse le second appui AVANT qu'il ne commence.
  const envoiEnCours = useRef(false);

  const charger = useCallback(async () => {
    setChargement(true);
    // `setChargement(false)` est dans un `finally` : quelle que soit l'issue —
    // y compris une promesse qui ne rend jamais — l'indicateur s'arrête. Un
    // rond qui tourne sans fin est le défaut que ce projet a déjà payé.
    try {
      const resultat = await lireFil(amiId);
      if (resultat.statut === 'ok') {
        setMessages(rangerFil(resultat.messages));
        setErreur(null);
      } else if (resultat.statut === 'refuse') {
        setErreur(messageErreurDiscussion(resultat.code, resultat.message));
        setMessages([]);
      } else if (resultat.statut === 'erreur') {
        setErreur(resultat.message);
        setMessages([]);
      } else {
        setMessages([]);
      }
    } finally {
      setChargement(false);
    }
  }, [amiId]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  async function envoyer() {
    if (envoiEnCours.current) return;

    const refus = refusEnvoi(saisie);
    if (refus !== null) {
      setErreur(refus);
      return;
    }

    envoiEnCours.current = true;
    setEnvoi(true);
    setErreur(null);
    let resultat;
    try {
      resultat = await envoyerMessage(amiId, saisie);
    } finally {
      envoiEnCours.current = false;
      setEnvoi(false);
    }

    if (resultat.statut === 'ok') {
      setSaisie('');
      await charger();
      return;
    }
    if (resultat.statut === 'refuse') {
      setErreur(messageErreurDiscussion(resultat.code, resultat.message));
      return;
    }
    if (resultat.statut === 'non_authentifie') {
      setErreur('Connectez-vous pour écrire dans la discussion.');
      return;
    }
    if (resultat.statut === 'erreur') {
      setErreur(resultat.message);
      return;
    }
    setErreur('Le message n’a pas pu être envoyé. Vérifiez votre connexion.');
  }

  function confirmerRetrait(message: MessageDiscussion) {
    // Retirer laisse une pierre tombale : on le dit avant, pas après. C'est la
    // seule information qui manque à quelqu'un qui croit effacer.
    Alert.alert(
      'Retirer ce message ?',
      'Le texte ne s’affichera plus dans la discussion. Il en reste une trace, que la modération peut relire.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: async () => {
            const resultat = await retirerMessage(message.id);
            if (resultat.statut === 'ok') {
              await charger();
              return;
            }
            if (resultat.statut === 'refuse') {
              setErreur(messageErreurDiscussion(resultat.code, resultat.message));
              return;
            }
            if (resultat.statut === 'erreur') {
              setErreur(resultat.message);
            }
          },
        },
      ]
    );
  }

  const restants = caracteresRestants(saisie);
  const tropLong = saisie.length > LONGUEUR_MESSAGE_MAX;
  const peutEnvoyer = saisie.trim().length > 0 && !tropLong && !envoi;

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
        <View style={styles.enteteTexte}>
          <Text style={styles.titre} numberOfLines={1}>
            {nom}
          </Text>
          <Text style={styles.sousTitre} numberOfLines={1}>
            {messages === null ? 'Discussion' : resumerFil(messages)}
          </Text>
        </View>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.fil}
          keyboardShouldPersistTaps="handled"
          ref={(ref) => {
            // On se pose en bas du fil à l'ouverture : une discussion se lit par
            // la fin, et arriver en haut d'un fil ancien ferait croire qu'il n'y
            // a rien de neuf.
            if (ref !== null && messages !== null && messages.length > 0) {
              ref.scrollToEnd({ animated: false });
            }
          }}
        >
          {chargement && messages === null && (
            <View style={styles.centre}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )}

          {messages !== null && messages.length === 0 && !chargement && (
            <View style={styles.vide}>
              <View style={styles.pastilleVide}>
                <Ionicons name="chatbubbles-outline" size={26} color={colors.primary} />
              </View>
              <Text style={styles.titreVide}>Aucun message</Text>
              <Text style={styles.texteVide}>
                Écrivez le premier mot pour vous encourager. Vous ne pouvez envoyer que du
                texte : ni photo, ni fichier, ni vidéo.
              </Text>
            </View>
          )}

          {messages !== null &&
            messages.map((message, index) => {
              const precedent = index > 0 ? messages[index - 1] : null;
              const separateur = separateurDeJour(message, precedent, aujourdhuiLocal());
              // Un message de moi se range à droite ; de l'autre, à gauche. On
              // compare l'auteur à l'identifiant de l'ami : ce qui n'est pas de
              // lui est de moi, et il n'y a personne d'autre dans un fil.
              const deMoi = message.auteur !== amiId;

              return (
                <View key={message.id}>
                  {separateur !== null && (
                    <Text style={styles.separateurJour}>{separateur}</Text>
                  )}

                  <View style={[styles.ligne, deMoi ? styles.ligneDroite : styles.ligneGauche]}>
                    <Pressable
                      onLongPress={() => confirmerRetrait(message)}
                      delayLongPress={400}
                      accessibilityRole="button"
                      accessibilityLabel={
                        message.retire
                          ? 'Message retiré'
                          : `Message du ${formaterEnvoi(message.envoyeLe)}. Appui long pour le retirer.`
                      }
                      style={[
                        styles.bulle,
                        deMoi ? styles.bulleMoi : styles.bulleAutre,
                        message.retire && styles.bulleRetiree,
                      ]}
                    >
                      <Text
                        style={[
                          styles.texteMessage,
                          deMoi && styles.texteMoi,
                          message.retire && styles.texteRetire,
                        ]}
                      >
                        {texteAffiche(message)}
                      </Text>
                      {!message.retire && (
                        <Text style={[styles.heure, deMoi && styles.heureMoi]}>
                          {formaterEnvoi(message.envoyeLe)}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              );
            })}

          {erreur !== null && <Text style={styles.erreur}>{erreur}</Text>}
        </ScrollView>

        {/* La note de modération, dite à l'endroit où l'on écrit. */}
        <Text style={styles.noteModeration}>
          Espace modéré. Seul le texte est permis. Un message masqué disparaît de la
          discussion, et sa trace reste lisible par la modération.
        </Text>

        <View style={styles.barre}>
          <TextInput
            style={styles.champ}
            value={saisie}
            onChangeText={(t) => {
              setSaisie(t);
              setErreur(null);
            }}
            placeholder="Écrivez un mot d’encouragement…"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={LONGUEUR_MESSAGE_MAX + 100}
            accessibilityLabel="Votre message"
            returnKeyType="default"
          />
          <Pressable
            style={[styles.boutonEnvoi, !peutEnvoyer && styles.boutonInactif]}
            onPress={envoyer}
            disabled={!peutEnvoyer}
            accessibilityRole="button"
            accessibilityLabel="Envoyer le message"
          >
            {envoi ? (
              <ActivityIndicator color={colors.textOnPrimary} size="small" />
            ) : (
              <Ionicons name="send" size={20} color={colors.textOnPrimary} />
            )}
          </Pressable>
        </View>

        {/* Le compteur n'apparaît que quand il devient utile : l'afficher en
            permanence ferait lire une contrainte là où l'on veut écrire. */}
        {saisie.length > LONGUEUR_MESSAGE_MAX - 100 && (
          <Text style={[styles.compteur, tropLong && styles.compteurDepasse]}>
            {tropLong
              ? `${saisie.length - LONGUEUR_MESSAGE_MAX} caractère${saisie.length - LONGUEUR_MESSAGE_MAX > 1 ? 's' : ''} de trop`
              : `${restants} caractère${restants > 1 ? 's' : ''} restant${restants > 1 ? 's' : ''}`}
          </Text>
        )}
      </KeyboardAvoidingView>
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  enteteTexte: {
    flex: 1,
    alignItems: 'center',
  },
  titre: {
    fontSize: fontSizes.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sousTitre: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  fil: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
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
  },
  separateurJour: {
    alignSelf: 'center',
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    backgroundColor: colors.surfaceVariant,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    marginVertical: spacing.md,
    overflow: 'hidden',
  },
  ligne: {
    marginVertical: spacing.xs,
  },
  ligneDroite: {
    alignItems: 'flex-end',
  },
  ligneGauche: {
    alignItems: 'flex-start',
  },
  bulle: {
    maxWidth: '82%',
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bulleMoi: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: radii.sm,
  },
  bulleAutre: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  bulleRetiree: {
    backgroundColor: colors.surfaceVariant,
    borderWidth: 1,
    borderColor: colors.border,
  },
  texteMessage: {
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    lineHeight: 21,
  },
  texteMoi: {
    color: colors.textOnPrimary,
  },
  texteRetire: {
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  heure: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    alignSelf: 'flex-end',
  },
  heureMoi: {
    color: colors.primarySurface,
  },
  erreur: {
    fontSize: fontSizes.sm,
    color: colors.error,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  noteModeration: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    lineHeight: 15,
  },
  barre: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  champ: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  boutonEnvoi: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonInactif: {
    backgroundColor: colors.textTertiary,
  },
  compteur: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    textAlign: 'right',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  compteurDepasse: {
    color: colors.error,
  },
});
