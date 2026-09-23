// Écran des amis : ajouter, voir, retirer.
//
// Ce que cet écran ne fait pas, et c'est délibéré :
//   - il ne dit pas qui est « en avance » ou « en retard ». La fonctionnalité
//     met en relation des personnes, elle ne les classe pas ;
//   - il ne montre pas les passages échus en révision d'un ami. C'est le seul
//     indicateur qui dit « je suis en retard », et le rendre visible
//     changerait l'usage : on masquerait ses échecs au lieu de les travailler ;
//   - il ne devine pas les erreurs de la base. Les codes d'erreur viennent du
//     SQL, où ils sont posés explicitement.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
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

import { Card } from '@/components/Card';
import { colors, fontSizes, spacing, radii } from '@/theme';
import type { PointAmi } from '@/lib/amis';
import {
  codePlausible,
  formaterCodeAmi,
  messageErreurAmi,
  nettoyerCodeSaisi,
  normaliserNom,
  ouEnEst,
  resumeActivite,
} from '@/lib/amis';
import { ajouterAmiParCode, mesAmis, monCodeAmi, regenererMonCodeAmi, retirerAmi } from '@/lib/sync/amis';

export default function AmisScreen() {
  const [code, setCode] = useState<string | null>(null);
  const [saisie, setSaisie] = useState('');
  const [amis, setAmis] = useState<PointAmi[] | null>(null);
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    // `setChargement(false)` est dans un `finally`, et c'est lui qui ferme les
    // trois issues ordinaires : les deux appels réussissent, l'un rend une
    // erreur, l'un REJETTE.
    //
    // Ce qu'il ne fait PAS, contrairement à ce qu'annonçait le commentaire
    // précédent : couvrir une promesse qui ne se règle jamais. Un `finally`
    // s'exécute quand la promesse s'achève, pas avant. Cette éventualité n'est
    // donc pas traitée ici, et c'est délibéré : elle est bornée dans la couche
    // de données, qui accorde dix secondes à chaque appel
    // (`src/lib/sync/amis.ts`). La borner une seconde fois ici donnerait deux
    // délais à tenir d'accord, et un résultat arrivé après coup écraserait un
    // état d'échec déjà affiché.
    try {
      const resultatCode = await monCodeAmi();
      if (resultatCode.statut === 'ok') setCode(resultatCode.code);
      else if (resultatCode.statut === 'erreur') setErreur(resultatCode.message);

      const resultat = await mesAmis();
      if (resultat.statut === 'ok') setAmis(resultat.amis);
      else if (resultat.statut === 'erreur') setErreur(resultat.message);
    } catch {
      // Un REJET, lui, n'était rattrapé par rien : il partait en rejet non
      // traité, aucune phrase n'était posée, et l'écran se refermait sans rien
      // dire. C'est le canal d'erreur de cet écran qui parle — le même que
      // celui des erreurs de lecture rendues par la base.
      setErreur(
        "La progression n'a pas pu être lue. Vérifiez votre connexion, puis réessayez."
      );
    } finally {
      setChargement(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  async function ajouter() {
    const propre = nettoyerCodeSaisi(saisie);
    if (!codePlausible(propre)) {
      setErreur('Ce code n’est pas valide.');
      setSucces(null);
      return;
    }

    setEnvoi(true);
    setErreur(null);
    setSucces(null);
    const resultat = await ajouterAmiParCode(propre);
    setEnvoi(false);

    if (resultat.statut === 'ok') {
      setSaisie('');
      setSucces('Vous vous suivez maintenant, tous les deux.');
      await charger();
      return;
    }
    if (resultat.statut === 'refuse') {
      setErreur(messageErreurAmi(resultat.code, resultat.message));
      return;
    }
    if (resultat.statut === 'non_authentifie') {
      setErreur('Connectez-vous pour ajouter un ami.');
      return;
    }
    setErreur('L’ajout n’a pas pu aboutir. Vérifiez votre connexion.');
  }

  function confirmerRetrait(ami: PointAmi) {
    // Rompre est réciproque : l'autre ne verra plus rien non plus. On le dit
    // avant, pas après — c'est la seule information qui manque au geste.
    Alert.alert(
      'Retirer cet ami ?',
      `${normaliserNom(ami.nom)} ne verra plus votre progression, et vous ne verrez plus la sienne.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: async () => {
            const resultat = await retirerAmi(ami.userId);
            if (resultat.statut === 'ok') {
              setAmis(resultat.amis);
              setSucces(null);
              setErreur(null);
            } else if (resultat.statut === 'erreur') {
              setErreur(resultat.message);
            }
          },
        },
      ]
    );
  }

  async function regenerer() {
    Alert.alert(
      'Créer un nouveau code ?',
      'L’ancien code ne fonctionnera plus. Vos amis actuels restent vos amis.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Créer',
          onPress: async () => {
            const resultat = await regenererMonCodeAmi();
            if (resultat.statut === 'ok') {
              setCode(resultat.code);
              setErreur(null);
            } else if (resultat.statut === 'erreur') {
              setErreur(resultat.message);
            }
          },
        },
      ]
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
        <Text style={styles.titre}>Mes amis</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.contenu}
          keyboardShouldPersistTaps="handled"
        >
          {/* Mon code */}
          <Card>
            <Text style={styles.libelle}>Votre code d’invitation</Text>
            {code !== null ? (
              <Text
                style={styles.code}
                selectable
                accessibilityLabel={`Code d'invitation ${code}`}
              >
                {formaterCodeAmi(code)}
              </Text>
            ) : chargement ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
            ) : (
              // L'échec n'est plus un rond sans fin.
              //
              // Quand le code n'arrive pas, on ne laisse pas l'utilisateur
              // devant une animation : on lui dit que ça n'a pas abouti, et on
              // lui donne le moyen de réessayer. C'est la différence entre
              // « ça charge » et « ça a échoué, appuie ici ».
              <View style={styles.echecCode}>
                <Text style={styles.texteEchecCode}>
                  Le code n’a pas pu être affiché.
                </Text>
                <Pressable
                  style={styles.boutonSecondaire}
                  onPress={charger}
                  accessibilityRole="button"
                  accessibilityLabel="Réessayer d’obtenir le code"
                >
                  <Ionicons name="refresh-outline" size={18} color={colors.primary} />
                  <Text style={styles.texteSecondaire}>Réessayer</Text>
                </Pressable>
              </View>
            )}
            <Text style={styles.aide}>
              Donnez-le à la personne que vous souhaitez suivre. En le saisissant, elle vous
              suivra et vous la suivrez.
            </Text>
            <Pressable
              style={styles.boutonSecondaire}
              onPress={regenerer}
              accessibilityRole="button"
              accessibilityLabel="Créer un nouveau code d’invitation"
            >
              <Ionicons name="refresh-outline" size={18} color={colors.primary} />
              <Text style={styles.texteSecondaire}>Créer un nouveau code</Text>
            </Pressable>
          </Card>

          {/* Ajouter */}
          <Text style={styles.sectionTitle}>Ajouter un ami</Text>
          <Card>
            <TextInput
              style={styles.champ}
              value={saisie}
              onChangeText={(t) => {
                setSaisie(t);
                setErreur(null);
                setSucces(null);
              }}
              placeholder="ABCDE FGHJK"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={13}
              accessibilityLabel="Code d’invitation de votre ami"
              returnKeyType="done"
              onSubmitEditing={ajouter}
            />
            <Pressable
              style={[styles.bouton, (envoi || !codePlausible(saisie)) && styles.boutonInactif]}
              onPress={ajouter}
              disabled={envoi || !codePlausible(saisie)}
              accessibilityRole="button"
              accessibilityLabel="Ajouter cet ami"
            >
              {envoi ? (
                <ActivityIndicator color={colors.textOnPrimary} />
              ) : (
                <>
                  <Ionicons name="person-add-outline" size={20} color={colors.textOnPrimary} />
                  <Text style={styles.texteBouton}>Ajouter</Text>
                </>
              )}
            </Pressable>

            {erreur !== null && <Text style={styles.erreur}>{erreur}</Text>}
            {succes !== null && <Text style={styles.succes}>{succes}</Text>}
          </Card>

          {/* La liste */}
          <Text style={styles.sectionTitle}>
            {amis === null
              ? 'Ma progression partagée'
              : `Ma progression partagée${amis.length > 0 ? ` (${amis.length})` : ''}`}
          </Text>

          {chargement && amis === null && (
            <Card>
              <ActivityIndicator color={colors.primary} />
            </Card>
          )}

          {!chargement && amis === null && (
            // Le chargement s'est arrêté sans liste. Sans cette branche, la
            // section restait vide sous son titre, sans rien dire : ni liste,
            // ni phrase, ni rond. Le silence est le pire des trois états.
            <Card>
              <Text style={styles.aide}>
                La liste n’a pas pu être affichée. Appuyez sur « Réessayer » ci-dessus.
              </Text>
            </Card>
          )}

          {amis !== null && amis.length === 0 && (
            <Card>
              <Text style={styles.aide}>
                Personne pour l’instant. Partagez votre code, ou saisissez celui d’un ami
                ci-dessus.
              </Text>
            </Card>
          )}

          {amis !== null &&
            amis.map((ami) => (
              <Card key={ami.userId} style={styles.carteAmi}>
                <View style={styles.ligneAmi}>
                  <View style={styles.pastille}>
                    <Ionicons name="person" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.texteAmi}>
                    <Text style={styles.nomAmi} numberOfLines={1}>
                      {normaliserNom(ami.nom)}
                    </Text>
                    <Text style={styles.detailAmi}>{resumeActivite(ami)}</Text>
                  </View>
                  <Pressable
                    onPress={() => confirmerRetrait(ami)}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={`Retirer ${normaliserNom(ami.nom)}`}
                  >
                    <Ionicons name="close-circle-outline" size={22} color={colors.textTertiary} />
                  </Pressable>
                </View>

                <View style={styles.separateur} />

                {/* Discuter : du texte seul, et un espace modéré. On le dit ici,
                    en une ligne, plutôt que de laisser la découverte se faire au
                    moment d'envoyer quelque chose qui n'a pas sa place. */}
                <Pressable
                  style={styles.boutonDiscuter}
                  onPress={() =>
                    router.push({
                      pathname: '/discussion',
                      params: { amiId: ami.userId, nom: normaliserNom(ami.nom) },
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Discuter avec ${normaliserNom(ami.nom)}`}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
                  <Text style={styles.texteDiscuter}>Discuter</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </Pressable>

                <View style={styles.separateur} />

                <View style={styles.mesures}>
                  <View style={styles.mesure}>
                    <Text style={styles.valeur}>{ami.versetsCetteSemaine}</Text>
                    <Text style={styles.unite}>
                      verset{ami.versetsCetteSemaine > 1 ? 's' : ''} cette semaine
                    </Text>
                  </View>
                  {ami.pagesCetteSemaine > 0 && (
                    <View style={styles.mesure}>
                      <Text style={styles.valeur}>{ami.pagesCetteSemaine}</Text>
                      <Text style={styles.unite}>
                        page{ami.pagesCetteSemaine > 1 ? 's' : ''} cette semaine
                      </Text>
                    </View>
                  )}
                  <View style={styles.mesure}>
                    <Text style={styles.valeur}>{ami.joursDEtude7j}</Text>
                    <Text style={styles.unite}>
                      jour{ami.joursDEtude7j > 1 ? 's' : ''} sur 7
                    </Text>
                  </View>
                </View>

                <Text style={styles.ouEnEst}>{ouEnEst(ami)}</Text>
              </Card>
            ))}

          <View style={{ height: spacing.xxxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    fontWeight: '600',
    color: colors.textPrimary,
  },
  contenu: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sectionTitle: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.xs,
  },
  libelle: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  code: {
    fontSize: fontSizes.xxxl,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 3,
    fontVariant: ['tabular-nums'],
  },
  aide: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: spacing.md,
  },
  champ: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSizes.lg,
    color: colors.textPrimary,
    letterSpacing: 2,
    backgroundColor: colors.surfaceVariant,
    marginBottom: spacing.md,
    fontVariant: ['tabular-nums'],
  },
  bouton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    minHeight: 48,
  },
  boutonInactif: {
    opacity: 0.45,
  },
  texteBouton: {
    color: colors.textOnPrimary,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  boutonSecondaire: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  texteSecondaire: {
    color: colors.primary,
    fontSize: fontSizes.sm,
    fontWeight: '500',
  },
  echecCode: {
    marginVertical: spacing.sm,
  },
  texteEchecCode: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  erreur: {
    fontSize: fontSizes.sm,
    color: colors.error,
    marginTop: spacing.md,
    lineHeight: 19,
  },
  succes: {
    fontSize: fontSizes.sm,
    color: colors.success,
    marginTop: spacing.md,
    lineHeight: 19,
  },
  carteAmi: {
    marginBottom: spacing.md,
  },
  ligneAmi: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pastille: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  texteAmi: {
    flex: 1,
  },
  nomAmi: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  detailAmi: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  separateur: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.md,
  },
  boutonDiscuter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  texteDiscuter: {
    flex: 1,
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: colors.primary,
  },
  mesures: {
    flexDirection: 'row',
    gap: spacing.xl,
  },
  mesure: {
    alignItems: 'flex-start',
  },
  valeur: {
    fontSize: fontSizes.xl,
    fontWeight: '700',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  unite: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
  ouEnEst: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    marginTop: spacing.md,
  },
});
