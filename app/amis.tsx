// Écran des amis : demandes, amis, ajout, blocages.
//
// QUATRE SECTIONS, dans cet ordre, et l'ordre est une décision :
//
//   1. les demandes REÇUES — elles attendent une réponse, donc elles passent
//      avant tout le reste. Une demande qu'on ne voit pas est une demande qui
//      ne sera jamais acceptée ;
//   2. mes amis ;
//   3. ajouter un ami ;
//   4. ce qui est plus rare et moins agréable : les demandes envoyées, et les
//      personnes bloquées.
//
// Ce que cet écran ne fait pas, et c'est délibéré :
//   - il ne dit pas qui est « en avance » ou « en retard ». La fonctionnalité
//     met en relation des personnes, elle ne les classe pas ;
//   - il ne montre pas les passages échus en révision d'un ami. C'est le seul
//     indicateur qui dit « je suis en retard », et le rendre visible
//     changerait l'usage : on masquerait ses échecs au lieu de les travailler ;
//   - il ne devine pas les erreurs de la base. Les codes d'erreur viennent du
//     SQL, où ils sont posés explicitement ;
//   - il n'annonce JAMAIS à quelqu'un qu'il est bloqué. Bloquer est un geste
//     unilatéral et silencieux : celui qui est bloqué voit une amitié
//     disparaître, pas une raison.

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

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { colors, fontSizes, spacing, radii, useStyles, type Palette } from '@/theme';
import type { BlocageAmi, DemandeAmi, PointAmi, ProfilTrouve } from '@/lib/amis';
import {
  autrePartie,
  codePlausible,
  formaterCodeAmi,
  formaterDateCourte,
  formaterIdentifiantPublic,
  identifiantPlausible,
  messageErreurAmi,
  messageRefusDemande,
  nettoyerCodeSaisi,
  nettoyerIdentifiantPublic,
  normaliserNom,
  ouEnEst,
  repartirDemandes,
  resumeActivite,
  situationProfil,
} from '@/lib/amis';
import {
  annulerDemande,
  bloquerUtilisateur,
  debloquerUtilisateur,
  demanderAmiParCode,
  demanderAmiParIdentifiant,
  mesAmis,
  mesBlocages,
  mesDemandes,
  monCodeAmi,
  regenererMonCodeAmi,
  repondreDemande,
  rechercherParIdentifiant,
  retirerAmi,
} from '@/lib/sync/amis';

export default function AmisScreen() {
  const styles = useStyles(creerStyles);
  const [code, setCode] = useState<string | null>(null);
  const [saisie, setSaisie] = useState('');
  const [recherche, setRecherche] = useState('');
  const [trouves, setTrouves] = useState<ProfilTrouve[] | null>(null);
  const [amis, setAmis] = useState<PointAmi[] | null>(null);
  const [demandes, setDemandes] = useState<DemandeAmi[] | null>(null);
  const [blocages, setBlocages] = useState<BlocageAmi[]>([]);
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    // `setChargement(false)` est dans un `finally`, et c'est lui qui ferme les
    // trois issues ordinaires : les appels réussissent, l'un rend une erreur,
    // l'un REJETTE.
    //
    // Ce qu'il ne fait PAS : couvrir une promesse qui ne se règle jamais. Un
    // `finally` s'exécute quand la promesse s'achève, pas avant. Cette
    // éventualité est bornée dans la couche de données, qui accorde dix
    // secondes à chaque appel (`src/lib/sync/amis.ts`). La borner une seconde
    // fois ici donnerait deux délais à tenir d'accord.
    try {
      const resultatCode = await monCodeAmi();
      if (resultatCode.statut === 'ok') setCode(resultatCode.code);
      else if (resultatCode.statut === 'erreur') setErreur(resultatCode.message);

      const [listeAmis, listeDemandes, listeBlocages] = await Promise.all([
        mesAmis(),
        mesDemandes(),
        mesBlocages(),
      ]);

      if (listeAmis.statut === 'ok') setAmis(listeAmis.amis);
      else if (listeAmis.statut === 'erreur') setErreur(listeAmis.message);

      if (listeDemandes.statut === 'ok') setDemandes(listeDemandes.demandes);
      else if (listeDemandes.statut === 'erreur') setErreur(listeDemandes.message);

      // Les blocages ne sont pas indispensables à l'écran : un échec ici ne
      // doit pas effacer ce qui a déjà été lu, ni poser une phrase d'erreur
      // pour une section qui n'existe que si elle a du contenu.
      if (listeBlocages.statut === 'ok') setBlocages(listeBlocages.blocages);
    } catch {
      // Un REJET, lui, n'était rattrapé par rien : il partait en rejet non
      // traité, aucune phrase n'était posée, et l'écran se refermait sans rien
      // dire.
      setErreur("La liste n'a pas pu être lue. Vérifiez votre connexion, puis réessayez.");
    } finally {
      setChargement(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  /** Le canal commun des gestes : on efface, on agit, on recharge. */
  async function geste(action: () => Promise<{ statut: string; message?: string }>) {
    setErreur(null);
    setSucces(null);
    const resultat = await action();
    if (resultat.statut === 'erreur') setErreur(resultat.message ?? 'Le geste n’a pas abouti.');
    return resultat;
  }

  async function ajouterParCode() {
    const propre = nettoyerCodeSaisi(saisie);
    if (!codePlausible(propre)) {
      setErreur('Ce code n’est pas valide.');
      setSucces(null);
      return;
    }

    setEnvoi(true);
    setErreur(null);
    setSucces(null);
    const resultat = await demanderAmiParCode(propre);
    setEnvoi(false);

    if (resultat.statut === 'ok') {
      setSaisie('');
      setTrouves(null);
      setSucces('Demande envoyée. Elle apparaîtra comme amie dès qu’elle l’aura acceptée.');
      await charger();
      return;
    }
    if (resultat.statut === 'refuse') {
      setErreur(messageRefusDemande(resultat.code, resultat.message));
      return;
    }
    if (resultat.statut === 'non_authentifie') {
      setErreur('Connectez-vous pour envoyer une demande.');
      return;
    }
    setErreur('La demande n’a pas pu aboutir. Vérifiez votre connexion.');
  }

  async function chercher() {
    const propre = nettoyerIdentifiantPublic(recherche);
    if (!identifiantPlausible(propre)) {
      setErreur('Cet identifiant n’est pas valide.');
      setTrouves(null);
      return;
    }
    setEnvoi(true);
    setErreur(null);
    setSucces(null);
    const resultat = await rechercherParIdentifiant(propre);
    setEnvoi(false);
    if (resultat.statut === 'ok') setTrouves(resultat.profils);
    else if (resultat.statut === 'erreur') setErreur(resultat.message);
  }

  async function inviter(profil: ProfilTrouve) {
    setEnvoi(true);
    const resultat = await demanderAmiParIdentifiant(profil.identifiantPublic ?? '');
    setEnvoi(false);
    if (resultat.statut === 'ok') {
      setSucces(`Demande envoyée à ${normaliserNom(profil.nom)}.`);
      setTrouves(null);
      setRecherche('');
      await charger();
      return;
    }
    if (resultat.statut === 'refuse') {
      setErreur(messageRefusDemande(resultat.code, resultat.message));
      return;
    }
    setErreur('La demande n’a pas pu aboutir.');
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
              setErreur(null);
              setSucces(null);
            } else if (resultat.statut === 'erreur') {
              setErreur(resultat.message);
            }
          },
        },
      ]
    );
  }

  function confirmerBlocage(cible: { userId: string; nom: string }) {
    // Le texte dit les TROIS effets, parce qu'ils sont tous définitifs du point
    // de vue de l'utilisateur : l'amitié tombe, la discussion se ferme, et
    // débloquer ne la rouvrira pas. Le taire ferait croire à un geste
    // réversible d'un seul appui.
    Alert.alert(
      `Bloquer ${normaliserNom(cible.nom)} ?`,
      "Vous ne serez plus amis, la discussion se ferme, et cette personne ne pourra plus vous envoyer de demande. La débloquer ne rétablira pas l'amitié : il faudra redemander.",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Bloquer',
          style: 'destructive',
          onPress: async () => {
            const resultat = await geste(() => bloquerUtilisateur(cible.userId));
            if (resultat.statut === 'ok') {
              setTrouves(null);
              await charger();
            }
          },
        },
      ]
    );
  }

  function confirmerRegeneration() {
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

  const { recues, envoyees } = repartirDemandes(demandes ?? []);
  const aRepondre = recues.length > 0;

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
        <Pressable
          onPress={() => router.push('/messages')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir mes messages"
        >
          <Ionicons name="chatbubbles-outline" size={24} color={colors.textPrimary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
          {erreur !== null && <Text style={styles.erreur}>{erreur}</Text>}
          {succes !== null && <Text style={styles.succes}>{succes}</Text>}

          {/* 1. Les demandes reçues */}
          {aRepondre && (
            <>
              <Text style={styles.sectionTitle}>Demandes reçues ({recues.length})</Text>
              {recues.map((demande) => (
                <Card key={demande.demandeur} style={styles.carte}>
                  <View style={styles.ligne}>
                    <Avatar nom={demande.nom} couleur={demande.avatarCouleur} />
                    <View style={styles.texte}>
                      <Text style={styles.nom} numberOfLines={1}>
                        {normaliserNom(demande.nom)}
                      </Text>
                      <Text style={styles.detail}>
                        {demande.identifiantPublic !== null
                          ? formaterIdentifiantPublic(demande.identifiantPublic)
                          : 'Souhaite vous ajouter'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.actions}>
                    <Pressable
                      style={[styles.bouton, styles.boutonMoitie]}
                      onPress={async () => {
                        const r = await geste(() => repondreDemande(demande.demandeur, true));
                        if (r.statut === 'ok') await charger();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Accepter ${normaliserNom(demande.nom)}`}
                    >
                      <Ionicons name="checkmark" size={20} color={colors.textOnPrimary} />
                      <Text style={styles.texteBouton}>Accepter</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.boutonSecondaireCadre, styles.boutonMoitie]}
                      onPress={async () => {
                        const r = await geste(() => repondreDemande(demande.demandeur, false));
                        if (r.statut === 'ok') await charger();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Refuser ${normaliserNom(demande.nom)}`}
                    >
                      <Text style={styles.texteSecondaire}>Refuser</Text>
                    </Pressable>
                  </View>
                </Card>
              ))}
            </>
          )}

          {/* 2. Mes amis */}
          <Text style={styles.sectionTitle}>
            {amis === null
              ? 'Mes amis'
              : `Mes amis${amis.length > 0 ? ` (${amis.length})` : ''}`}
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
                La liste n’a pas pu être affichée. Appuyez sur « Réessayer » ci-dessous.
              </Text>
              <Pressable
                style={styles.boutonSecondaire}
                onPress={charger}
                accessibilityRole="button"
                accessibilityLabel="Réessayer de charger la liste"
              >
                <Ionicons name="refresh-outline" size={18} color={colors.primary} />
                <Text style={styles.texteSecondaire}>Réessayer</Text>
              </Pressable>
            </Card>
          )}

          {amis !== null && amis.length === 0 && (
            <Card>
              <Text style={styles.aide}>
                Personne pour l’instant. Partagez votre code, ou saisissez celui d’un ami
                ci-dessous.
              </Text>
            </Card>
          )}

          {amis !== null &&
            amis.map((ami) => (
              <Card key={ami.userId} style={styles.carte}>
                <View style={styles.ligne}>
                  <Avatar nom={ami.nom} couleur={ami.avatarCouleur} />
                  <View style={styles.texte}>
                    <Text style={styles.nom} numberOfLines={1}>
                      {normaliserNom(ami.nom)}
                    </Text>
                    <Text style={styles.detail}>
                      {ami.identifiantPublic !== null
                        ? formaterIdentifiantPublic(ami.identifiantPublic)
                        : resumeActivite(ami)}
                    </Text>
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

                {/* Les mesures ne sont affichées que si l'ami partage : sinon
                    elles seraient des zéros, et l'écran écrirait « rien cette
                    semaine » là où la vérité est « ne partage pas ». */}
                {ami.partage && (
                  <>
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
                  </>
                )}
                {!ami.partage && <Text style={styles.ouEnEst}>{ouEnEst(ami)}</Text>}

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
                  accessibilityLabel={`Envoyer un message à ${normaliserNom(ami.nom)}`}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
                  <Text style={styles.texteDiscuter}>Envoyer un message</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </Pressable>

                <Pressable
                  style={styles.boutonDiscret}
                  onPress={() => confirmerBlocage({ userId: ami.userId, nom: ami.nom })}
                  accessibilityRole="button"
                  accessibilityLabel={`Bloquer ${normaliserNom(ami.nom)}`}
                >
                  <Ionicons name="hand-left-outline" size={16} color={colors.textTertiary} />
                  <Text style={styles.texteDiscret}>Bloquer</Text>
                </Pressable>
              </Card>
            ))}

          {/* 3. Ajouter un ami */}
          <Text style={styles.sectionTitle}>Ajouter un ami</Text>
          <Card>
            <Text style={styles.libelle}>Par code d’invitation</Text>
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
              onSubmitEditing={ajouterParCode}
            />
            <Pressable
              style={[styles.bouton, (envoi || !codePlausible(saisie)) && styles.boutonInactif]}
              onPress={ajouterParCode}
              disabled={envoi || !codePlausible(saisie)}
              accessibilityRole="button"
              accessibilityLabel="Envoyer une demande à ce code"
            >
              <Ionicons name="person-add-outline" size={20} color={colors.textOnPrimary} />
              <Text style={styles.texteBouton}>Envoyer une demande</Text>
            </Pressable>

            <View style={styles.separateur} />

            <Text style={styles.libelle}>Par identifiant public</Text>
            <TextInput
              style={styles.champ}
              value={recherche}
              onChangeText={(t) => {
                setRecherche(t);
                setTrouves(null);
                setErreur(null);
                setSucces(null);
              }}
              placeholder="@aicha"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={31}
              accessibilityLabel="Identifiant public de la personne"
              returnKeyType="search"
              onSubmitEditing={chercher}
            />
            <Pressable
              style={[
                styles.boutonSecondaireCadre,
                (envoi || !identifiantPlausible(recherche)) && styles.boutonInactif,
              ]}
              onPress={chercher}
              disabled={envoi || !identifiantPlausible(recherche)}
              accessibilityRole="button"
              accessibilityLabel="Chercher cette personne"
            >
              <Ionicons name="search-outline" size={18} color={colors.primary} />
              <Text style={styles.texteSecondaire}>Chercher</Text>
            </Pressable>

            {trouves !== null && trouves.length === 0 && (
              <Text style={styles.aide}>
                Personne ne porte cet identifiant. Vérifiez-le auprès de votre ami.
              </Text>
            )}

            {trouves !== null &&
              trouves.map((profil) => {
                const situation = situationProfil(profil);
                return (
                  <View key={profil.userId} style={styles.resultat}>
                    <Avatar nom={profil.nom} couleur={profil.avatarCouleur} taille={40} />
                    <View style={styles.texte}>
                      <Text style={styles.nom} numberOfLines={1}>
                        {normaliserNom(profil.nom)}
                      </Text>
                      <Text style={styles.detail}>
                        {formaterIdentifiantPublic(profil.identifiantPublic)}
                      </Text>
                    </View>
                    {situation === 'libre' && (
                      <Pressable
                        style={styles.petitBouton}
                        onPress={() => inviter(profil)}
                        disabled={envoi}
                        accessibilityRole="button"
                        accessibilityLabel={`Demander ${normaliserNom(profil.nom)} en ami`}
                      >
                        <Text style={styles.textePetitBouton}>Demander</Text>
                      </Pressable>
                    )}
                    {situation === 'deja_ami' && <Text style={styles.etat}>Déjà ami</Text>}
                    {situation === 'demande_envoyee' && <Text style={styles.etat}>Demande envoyée</Text>}
                    {situation === 'demande_recue' && (
                      <Text style={styles.etat}>Vous a demandé</Text>
                    )}
                  </View>
                );
              })}
          </Card>

          {/* Mon code */}
          <Text style={styles.sectionTitle}>Mon code d’invitation</Text>
          <Card>
            {code !== null ? (
              <Text style={styles.code} selectable accessibilityLabel={`Code d'invitation ${code}`}>
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
                <Text style={styles.texteEchecCode}>Le code n’a pas pu être affiché.</Text>
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
              Donnez-le à la personne que vous souhaitez ajouter. En le saisissant, elle vous
              enverra une demande, que vous accepterez.
            </Text>
            <Pressable
              style={styles.boutonSecondaire}
              onPress={confirmerRegeneration}
              accessibilityRole="button"
              accessibilityLabel="Créer un nouveau code d’invitation"
            >
              <Ionicons name="refresh-outline" size={18} color={colors.primary} />
              <Text style={styles.texteSecondaire}>Créer un nouveau code</Text>
            </Pressable>
          </Card>

          {/* 4. Les demandes envoyées */}
          {envoyees.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Demandes envoyées ({envoyees.length})</Text>
              {envoyees.map((demande) => (
                <Card key={demande.destinataire} style={styles.carte}>
                  <View style={styles.ligne}>
                    <Avatar nom={demande.nom} couleur={demande.avatarCouleur} taille={40} />
                    <View style={styles.texte}>
                      <Text style={styles.nom} numberOfLines={1}>
                        {normaliserNom(demande.nom)}
                      </Text>
                      <Text style={styles.detail}>
                        {demande.createdAt !== null
                          ? `Envoyée le ${formaterDateCourte(demande.createdAt)}`
                          : 'En attente de réponse'}
                      </Text>
                    </View>
                    <Pressable
                      onPress={async () => {
                        const r = await geste(() => annulerDemande(autrePartie(demande)));
                        if (r.statut === 'ok') await charger();
                      }}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel={`Annuler la demande à ${normaliserNom(demande.nom)}`}
                    >
                      <Ionicons name="close-circle-outline" size={22} color={colors.textTertiary} />
                    </Pressable>
                  </View>
                </Card>
              ))}
            </>
          )}

          {/* Les blocages */}
          {blocages.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Bloqués ({blocages.length})</Text>
              <Card>
                <Text style={styles.aide}>
                  Ces personnes ne peuvent plus vous envoyer de demande, et la discussion est
                  fermée. Les débloquer ne rétablit pas l’amitié.
                </Text>
              </Card>
              {blocages.map((blocage) => (
                <Card key={blocage.bloque} style={styles.carte}>
                  <View style={styles.ligne}>
                    <Avatar nom={blocage.nom} couleur={blocage.avatarCouleur} taille={40} />
                    <View style={styles.texte}>
                      <Text style={styles.nom} numberOfLines={1}>
                        {normaliserNom(blocage.nom)}
                      </Text>
                      {blocage.identifiantPublic !== null && (
                        <Text style={styles.detail}>
                          {formaterIdentifiantPublic(blocage.identifiantPublic)}
                        </Text>
                      )}
                    </View>
                    <Pressable
                      style={styles.petitBoutonSecondaire}
                      onPress={async () => {
                        const r = await geste(() => debloquerUtilisateur(blocage.bloque));
                        if (r.statut === 'ok') await charger();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Débloquer ${normaliserNom(blocage.nom)}`}
                    >
                      <Text style={styles.texteSecondaire}>Débloquer</Text>
                    </Pressable>
                  </View>
                </Card>
              ))}
            </>
          )}

          <View style={{ height: spacing.xxxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const creerStyles = (colors: Palette) =>
  StyleSheet.create({
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
    boutonSecondaireCadre: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 48,
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
    carte: {
      marginBottom: spacing.md,
    },
    ligne: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    texte: {
      flex: 1,
    },
    nom: {
      fontSize: fontSizes.md,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    detail: {
      fontSize: fontSizes.xs,
      color: colors.textSecondary,
      marginTop: 2,
    },
    etat: {
      fontSize: fontSizes.xs,
      color: colors.textTertiary,
      fontWeight: '600',
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    boutonMoitie: {
      flex: 1,
    },
    resultat: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.borderLight,
    },
    petitBouton: {
      backgroundColor: colors.primary,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    petitBoutonSecondaire: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    textePetitBouton: {
      color: colors.textOnPrimary,
      fontSize: fontSizes.xs,
      fontWeight: '600',
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
    boutonDiscret: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    texteDiscret: {
      fontSize: fontSizes.xs,
      color: colors.textTertiary,
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
