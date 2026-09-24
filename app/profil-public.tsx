// Mon profil public : ce que mes amis voient de moi, et ce que je partage.
//
// POURQUOI CET ÉCRAN EXISTE SÉPARÉMENT DES NOTIFICATIONS
// ------------------------------------------------------
// Ce sont deux questions différentes, et les mêler ferait douter de la seconde :
// « si je coupe les notifications, est-ce que je disparais de la liste de mes
// amis ? » Non — et deux écrans le disent mieux qu'un paragraphe.
//
// CE QUI N'EST PAS ICI, ET POURQUOI
// ---------------------------------
// Ni adresse électronique, ni numéro de téléphone. Ils ne sont pas cachés : ils
// ne sont pas dans la table des profils publics du tout, donc ils ne peuvent
// pas fuiter par un écran qu'on écrirait plus tard. On cherche un ami par son
// identifiant public, jamais par une adresse.
//
// LE PSEUDONYME N'EST PAS L'IDENTIFIANT
// -------------------------------------
// Le pseudonyme se change comme on veut, et deux personnes peuvent avoir le
// même : il s'affiche. L'identifiant public, lui, est unique et sert à être
// trouvé. Confondre les deux ferait qu'on ne pourrait plus changer d'affichage
// sans casser les recherches de ceux qui nous ont ajouté.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import {
  COULEURS_AVATAR,
  couleurAvatar,
  identifiantPlausible,
  initiales,
  nettoyerIdentifiantPublic,
  nomCouleurAvatar,
  type CouleurAvatar,
} from '@/lib/amis';
import { annoncerEtape } from '@/lib/sync/notifications';
import { enregistrerProfilPublic, monProfilPublic } from '@/lib/sync/amis';
import { colors, fontSizes, spacing, radii, useStyles, type Palette } from '@/theme';

/** La longueur maximale d'un pseudonyme, comme la contrainte de la base. */
const NOM_MAX = 40;

export default function ProfilPublicScreen() {
  const styles = useStyles(creerStyles);

  const [nom, setNom] = useState('');
  const [identifiant, setIdentifiant] = useState('');
  const [teinte, setTeinte] = useState<CouleurAvatar>(couleurAvatar(null));
  const [partageProgression, setPartageProgression] = useState(true);
  const [partageObjectif, setPartageObjectif] = useState(false);

  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [annonce, setAnnonce] = useState('');
  const [envoiAnnonce, setEnvoiAnnonce] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      void (async () => {
        try {
          const resultat = await monProfilPublic();
          if (!vivant) return;
          if (resultat.statut === 'ok') {
            setNom(resultat.profil.nomAffiche ?? '');
            setIdentifiant(resultat.profil.identifiantPublic ?? '');
            setTeinte(couleurAvatar(resultat.profil.avatarCouleur));
            setPartageProgression(resultat.profil.partageProgression);
            setPartageObjectif(resultat.profil.partageObjectif);
            setErreur(null);
          } else if (resultat.statut === 'erreur') {
            setErreur(resultat.message);
          } else if (resultat.statut === 'non_authentifie') {
            setErreur('Connectez-vous pour régler votre profil public.');
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

  const identifiantPropre = nettoyerIdentifiantPublic(identifiant);
  // Un identifiant vide est PERMIS : on peut ne pas vouloir être trouvable.
  // Mais un identifiant saisi et mal formé ne l'est pas — et le dire avant
  // l'enregistrement évite un refus de la base, qui parlerait de contrainte.
  const identifiantValide = identifiantPropre.length === 0 || identifiantPlausible(identifiantPropre);

  async function enregistrer() {
    if (!identifiantValide) {
      setErreur(
        'L’identifiant doit commencer par une lettre, puis des lettres, des chiffres ou « _ » (3 à 30 signes).'
      );
      return;
    }

    setEnregistrement(true);
    setErreur(null);
    setConfirmation(null);
    try {
      const resultat = await enregistrerProfilPublic({
        nomAffiche: nom.trim().length > 0 ? nom.trim() : null,
        identifiantPublic: identifiantPropre.length > 0 ? identifiantPropre : null,
        avatarCouleur: teinte,
        partageProgression,
        partageObjectif,
      });

      if (resultat.statut === 'ok') {
        setConfirmation('Profil enregistré.');
        setIdentifiant(resultat.profil.identifiantPublic ?? '');
        return;
      }
      if (resultat.statut === 'refuse') {
        // Le seul refus réel ici est « cet identifiant est déjà pris ». Le dire
        // ainsi, plutôt que de recopier le message de la base qui parle
        // d'unicité, évite de faire chercher ce qu'il faut changer.
        setErreur(
          resultat.code === '23505'
            ? 'Cet identifiant est déjà pris. Essayez-en un autre.'
            : resultat.message
        );
        return;
      }
      if (resultat.statut === 'erreur') {
        setErreur(resultat.message);
        return;
      }
      setErreur('Le profil n’a pas pu être enregistré. Vérifiez votre connexion.');
    } finally {
      setEnregistrement(false);
    }
  }

  async function partagerUneEtape() {
    const texte = annonce.trim();
    if (texte.length === 0) return;

    setEnvoiAnnonce(true);
    setErreur(null);
    try {
      const resultat = await annoncerEtape(texte);
      if (resultat.statut === 'ok') {
        setAnnonce('');
        // Zéro est une réponse utile, et on la dit : « personne n'a été
        // prévenu » n'est pas un succès, et l'annoncer comme tel ferait croire
        // que le message est parti.
        setConfirmation(
          resultat.nombre === 0
            ? 'Personne n’a été prévenu : vos amis ont coupé les étapes partagées, ou vous n’avez pas encore d’ami.'
            : `${resultat.nombre} ami${resultat.nombre > 1 ? 's' : ''} prévenu${resultat.nombre > 1 ? 's' : ''}.`
        );
        return;
      }
      if (resultat.statut === 'erreur') {
        setErreur(resultat.message);
        return;
      }
      setErreur('L’annonce n’a pas pu être envoyée.');
    } finally {
      setEnvoiAnnonce(false);
    }
  }

  function expliquerLePartage() {
    Alert.alert(
      'Partager ma progression',
      'Vos amis verront les versets et les pages de la semaine, votre dernière séance et vos jours d’étude. Jamais vos passages à renforcer, jamais vos messages.',
      [{ text: 'Compris' }]
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
        <Text style={styles.titre}>Profil public</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
        <Card>
          <View style={styles.apercu}>
            <Avatar nom={nom} couleur={teinte} taille={56} />
            <View style={styles.apercuTexte}>
              <Text style={styles.apercuNom} numberOfLines={1}>
                {nom.trim().length > 0 ? nom.trim() : 'Sans pseudonyme'}
              </Text>
              <Text style={styles.apercuIdentifiant}>
                {identifiantPropre.length > 0 ? `@${identifiantPropre}` : 'Aucun identifiant public'}
              </Text>
            </View>
          </View>

          <Text style={styles.libelle}>Pseudonyme</Text>
          <TextInput
            style={styles.champ}
            value={nom}
            onChangeText={setNom}
            placeholder="Par exemple : Mohammed"
            placeholderTextColor={colors.textTertiary}
            maxLength={NOM_MAX}
            accessibilityLabel="Pseudonyme"
          />
          <Text style={styles.aide}>
            C’est le nom que vos amis voient. Il peut être changé quand vous voulez.
          </Text>

          <Text style={[styles.libelle, styles.libelleApres]}>Identifiant public</Text>
          <View style={styles.champPrefixe}>
            <Text style={styles.prefixe}>@</Text>
            <TextInput
              style={styles.champSansBordure}
              value={identifiant}
              onChangeText={setIdentifiant}
              placeholder="apprenant_1"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={31}
              accessibilityLabel="Identifiant public"
            />
          </View>
          <Text style={[styles.aide, !identifiantValide && styles.aideErreur]}>
            {identifiantValide
              ? 'Vos amis vous trouvent avec cet identifiant. Laissez vide pour n’être trouvable par personne.'
              : 'Doit commencer par une lettre, puis des lettres, des chiffres ou « _ » (3 à 30 signes).'}
          </Text>
        </Card>

        <Card>
          <Text style={styles.libelle}>Couleur de l’avatar</Text>
          <View style={styles.teintes}>
            {COULEURS_AVATAR.map((couleur) => {
              const choisie = couleur === teinte;
              return (
                <Pressable
                  key={couleur}
                  onPress={() => setTeinte(couleur)}
                  style={[styles.teinte, choisie && styles.teinteChoisie]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: choisie }}
                  accessibilityLabel={nomCouleurAvatar(couleur)}
                >
                  <Avatar nom={nom.trim().length > 0 ? nom : 'Ami'} couleur={couleur} taille={40} />
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.aide}>
            L’avatar n’est pas une photo : une couleur ne demande aucun envoi, marche hors ligne et
            reste reconnaissable.
          </Text>
        </Card>

        <Card>
          <View style={styles.ligne}>
            <View style={styles.texteLigne}>
              <Text style={styles.titreLigne}>Partager ma progression</Text>
              <Text style={styles.aideLigne}>
                Versets et pages de la semaine, dernière séance, jours d’étude.
              </Text>
            </View>
            <Switch
              value={partageProgression}
              onValueChange={setPartageProgression}
              trackColor={{ false: colors.border, true: colors.primarySurface }}
              thumbColor={partageProgression ? colors.primary : colors.surface}
              accessibilityLabel="Partager ma progression"
            />
          </View>

          <Pressable
            onPress={expliquerLePartage}
            accessibilityRole="button"
            accessibilityLabel="Ce que mes amis voient"
            style={styles.lienAide}
          >
            <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.texteLienAide}>Ce que mes amis voient</Text>
          </Pressable>

          <View style={[styles.ligne, styles.ligneSeparee]}>
            <View style={styles.texteLigne}>
              <Text style={styles.titreLigne}>Partager mon objectif</Text>
              <Text style={styles.aideLigne}>
                L’objectif de mémorisation que vous avez choisi. Désactivé par défaut.
              </Text>
            </View>
            <Switch
              value={partageObjectif}
              onValueChange={setPartageObjectif}
              trackColor={{ false: colors.border, true: colors.primarySurface }}
              thumbColor={partageObjectif ? colors.primary : colors.surface}
              accessibilityLabel="Partager mon objectif"
            />
          </View>
        </Card>

        {partageProgression && (
          <Card>
            <Text style={styles.titreLigne}>Annoncer une étape</Text>
            <Text style={styles.aide}>
              Vos amis qui ont gardé les étapes partagées recevront une notification. Une annonce
              par heure au maximum.
            </Text>
            <TextInput
              style={[styles.champ, styles.champApres]}
              value={annonce}
              onChangeText={setAnnonce}
              placeholder="Par exemple : j’ai terminé la sourate Al-Mulk"
              placeholderTextColor={colors.textTertiary}
              maxLength={140}
              multiline
              accessibilityLabel="Votre annonce"
            />
            <Pressable
              style={[styles.boutonSecondaire, (annonce.trim().length === 0 || envoiAnnonce) && styles.boutonInactif]}
              onPress={partagerUneEtape}
              disabled={annonce.trim().length === 0 || envoiAnnonce}
              accessibilityRole="button"
              accessibilityLabel="Annoncer cette étape à mes amis"
            >
              {envoiAnnonce ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <>
                  <Ionicons name="megaphone-outline" size={18} color={colors.primary} />
                  <Text style={styles.texteBoutonSecondaire}>Annoncer à mes amis</Text>
                </>
              )}
            </Pressable>
          </Card>
        )}

        {erreur !== null && <Text style={styles.erreur}>{erreur}</Text>}
        {confirmation !== null && <Text style={styles.confirmation}>{confirmation}</Text>}

        <Pressable
          style={[styles.bouton, enregistrement && styles.boutonInactif]}
          onPress={enregistrer}
          disabled={enregistrement}
          accessibilityRole="button"
          accessibilityLabel="Enregistrer mon profil public"
        >
          {enregistrement ? (
            <ActivityIndicator color={colors.textOnPrimary} size="small" />
          ) : (
            <Text style={styles.texteBouton}>Enregistrer</Text>
          )}
        </Pressable>
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
  apercu: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  apercuTexte: {
    flex: 1,
  },
  apercuNom: {
    fontSize: fontSizes.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  apercuIdentifiant: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  libelle: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  libelleApres: {
    marginTop: spacing.lg,
  },
  champ: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  champApres: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  champPrefixe: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceVariant,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  prefixe: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    marginRight: spacing.xs,
  },
  champSansBordure: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  aide: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: spacing.sm,
  },
  aideErreur: {
    color: colors.error,
  },
  teintes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  teinte: {
    padding: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  teinteChoisie: {
    borderColor: colors.primary,
  },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  ligneSeparee: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
    marginTop: spacing.sm,
  },
  texteLigne: {
    flex: 1,
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
  lienAide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  texteLienAide: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
  bouton: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  boutonSecondaire: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
  },
  boutonInactif: {
    opacity: 0.5,
  },
  texteBouton: {
    color: colors.textOnPrimary,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  texteBoutonSecondaire: {
    color: colors.primary,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  erreur: {
    fontSize: fontSizes.sm,
    color: colors.error,
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 19,
  },
  confirmation: {
    fontSize: fontSizes.sm,
    color: colors.primary,
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 19,
  },
});
