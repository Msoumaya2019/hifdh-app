// La fonction serveur d'envoi, l'ordonnanceur qui l'appelle, et la boîte qu'ils
// vident.
//
// CE QUI EST ÉPROUVÉ ICI, ET POURQUOI AILLEURS NE LE PEUT
// ------------------------------------------------------
// `supabase/functions/envoyer-notifications/index.ts` ne s'exécute nulle part
// dans la chaîne de vérification : c'est du Deno, et il n'y a pas de Deno dans
// `ci.yml`. La fonction pourrait donc perdre sa PORTE — le contrôle du secret —
// sans qu'aucun contrôle ne s'en aperçoive.
//
// C'est le défaut le plus grave de cette fonctionnalité, et il est muet : une
// fonction d'envoi sans porte laisse n'importe qui faire sonner les téléphones
// de tous les utilisateurs, et rien dans les journaux ne le dira, puisque les
// appels refusés n'y apparaissent que si le code les refuse.
//
// Ce fichier lit donc la SOURCE et vérifie les invariants qui ne se voient pas
// à l'usage. Il ne remplace pas un appel réel à Expo : celui-là demande un
// projet relié, un compte Apple payant et un projet Firebase, et il est décrit
// dans `docs/notifications-push.md`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const RACINE = new URL('..', import.meta.url);
const lire = (chemin) => readFileSync(fileURLToPath(new URL(chemin, RACINE)), 'utf8');

const FONCTION = lire('supabase/functions/envoyer-notifications/index.ts');
const FLUX = lire('.github/workflows/notifications.yml');
const SQL = lire('supabase/notifications.sql');
const PUSH = lire('src/lib/push.ts');

// === La porte ==============================================================

test('la fonction refuse de s’exécuter quand le secret n’est pas configuré', () => {
  // Un secret absent doit faire REFUSER, jamais laisser ouvert. La borne de
  // longueur est là parce qu'un secret d'un caractère serait un secret vide
  // déguisé, et qu'un `NOTIFICATIONS_SECRET=1` posé à la hâte ouvrirait la
  // fonction à tout le monde.
  assert.match(FONCTION, /if \(secret\.length < 16\) \{/);
  assert.match(FONCTION, /'secret_non_configure'[\s\S]{0,60}503/);
});

test('un appel sans le bon secret est refusé', () => {
  assert.match(FONCTION, /requete\.headers\.get\('x-notifications-secret'\) !== secret/);
  assert.match(FONCTION, /'refuse'[\s\S]{0,60}401/);
});

test('la porte est franchie avant toute lecture de la base', () => {
  // L'ORDRE est le sujet de ce test, pas la présence. Une porte vérifiée après
  // `createClient` laisserait un appelant non authentifié faire créer un client
  // avec la clé de service — et l'erreur qu'il obtiendrait lui apprendrait que
  // le projet existe.
  //
  // L'ancre est l'APPEL, et non le nom de l'en-tête : celui-ci est cité dans
  // l'en-tête du fichier pour expliquer comment la fonction est appelée, et un
  // `indexOf` sur le nom trouverait le commentaire. Le contrôle passerait alors
  // sur une porte déplacée — c'est-à-dire précisément sur ce qu'il doit
  // interdire.
  const porte = FONCTION.indexOf("requete.headers.get('x-notifications-secret')");
  const client = FONCTION.indexOf('createClient(');
  assert.ok(porte > 0, 'la porte est introuvable');
  assert.ok(client > 0, 'le client est introuvable');
  assert.ok(porte < client, 'la porte est vérifiée après la création du client');

  // Et le secret partagé est lu avant la clé de service : l'ordre des lectures
  // dit lequel des deux est la condition d'entrée.
  assert.ok(
    FONCTION.indexOf('NOTIFICATIONS_SECRET') < FONCTION.indexOf('SUPABASE_SERVICE_ROLE_KEY')
  );
});

test('la clé de service vient de l’environnement, jamais du code', () => {
  assert.match(FONCTION, /Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/);
  // Aucun JWT en clair : la clé de service EST un JWT, et un JWT recopié dans
  // le source est une clé publiée — ce dépôt est public.
  assert.doesNotMatch(FONCTION, /eyJ[A-Za-z0-9_-]{20,}/);
});

// === La prise et l'envoi ===================================================

test('la prise passe par la fonction de réclamation, jamais par une lecture', () => {
  // `reclamer_envois` marque ET rend dans la même instruction. Un `select`
  // suivi d'un `update` laisserait deux passages simultanés prendre la même
  // ligne, et la personne recevrait deux fois la même notification.
  assert.match(FONCTION, /\.rpc\('reclamer_envois'/);
  assert.doesNotMatch(FONCTION, /from\('envois_notification'\)\s*\.select/);
});

test('l’envoi respecte la limite documentée du service', () => {
  // Au-delà de cent messages, le service d'Expo tronque SANS LE DIRE. Une
  // troncature silencieuse ferait perdre des notifications sans qu'aucune
  // erreur n'apparaisse nulle part.
  assert.match(FONCTION, /const MAX_PAR_REQUETE = 100;/);
  assert.match(FONCTION, /debut \+= MAX_PAR_REQUETE/);
});

test('seul un jeton déclaré mort est retiré', () => {
  assert.match(FONCTION, /if \(code === 'DeviceNotRegistered'\) \{/);
  assert.match(FONCTION, /from\('appareils'\)\.delete\(\)\.in\('jeton'/);
  // Un seul endroit remplit la liste des jetons morts : si un compteur
  // d'échecs venait à en ajouter, la suppression cesserait d'être fondée sur la
  // parole d'Expo.
  assert.equal(FONCTION.split('jetonsMorts.push(').length - 1, 1);
});

// === Les textes ============================================================

test('les textes sont ceux du cahier des charges', () => {
  assert.match(FONCTION, /t’a envoyé un message/);
  assert.match(FONCTION, /'Vous avez reçu un nouveau message'/);
});

test('un message masqué ne fait pas fuiter son texte', () => {
  // `??` et non `||` : le corps masqué est NUL, et c'est la seule phrase qui
  // existe alors. Ce repli n'est donc pas un confort — c'est le texte que la
  // personne a demandé à recevoir à la place du message.
  assert.match(FONCTION, /body: envoi\.corps \?\? 'Vous avez reçu un nouveau message'/);
});

test('un appui sur un message mène à la bonne conversation', () => {
  assert.match(
    FONCTION,
    /data: \{ genre: envoi\.genre, conversationAvec: envoi\.conversation_avec \}/
  );
});

test('le canal Android du serveur est celui que l’application crée', () => {
  // Deux fichiers portent la même vérité sans pouvoir se lire. Un canal nommé
  // différemment d'un côté et de l'autre ne casse rien : sur Android, la
  // notification n'apparaît simplement pas.
  const cote = PUSH.match(/export const CANAL_ANDROID = '([^']+)';/);
  assert.ok(cote !== null, 'le canal de l’application est introuvable');
  assert.match(FONCTION, new RegExp(`channelId: '${cote[1]}'`));
});

test('l’affichage emploie les clés du SDK installé, pas celles du suivant', () => {
  // `shouldShowAlert` est la clé que le module natif LIT en SDK 52, où le projet
  // est (`expo-notifications` 0.29). Le couple `shouldShowBanner` /
  // `shouldShowList` appartient au SDK 53 : il n'existe NULLE PART dans le paquet
  // installé — vérifié dans `node_modules` — et l'employer laisse la clé
  // attendue indéfinie. La notification reçue pendant que l'application est
  // ouverte ne s'afficherait alors pas : sans erreur, sans trace, et c'est
  // exactement le défaut que ce réglage existe pour éviter.
  //
  // On ne lit QUE le corps du gestionnaire, jamais le fichier entier : les deux
  // noms du SDK suivant sont cités dans le commentaire qui explique pourquoi on
  // ne les emploie pas, si bien qu'une assertion sur tout le fichier serait
  // satisfaite — ou mise en échec — par un commentaire.
  const corps = PUSH.match(/handleNotification:\s*async\s*\(\)\s*=>\s*\(\{([\s\S]*?)\}\)/);
  assert.ok(corps !== null, 'le corps du gestionnaire d’affichage est introuvable');
  assert.match(corps[1], /shouldShowAlert:\s*true/);
  assert.doesNotMatch(corps[1], /shouldShowBanner/);
  assert.doesNotMatch(corps[1], /shouldShowList/);
});

// === L'ordonnanceur ========================================================

test('l’ordonnanceur porte le secret et refuse un échec silencieux', () => {
  assert.match(FLUX, /secrets\.NOTIFICATIONS_SECRET/);
  assert.match(FLUX, /x-notifications-secret: \$\{NOTIFICATIONS_SECRET\}/);
  // Sans `--fail-with-body`, `curl` sort en succès sur une erreur serveur : le
  // flux annoncerait « vert » sans qu'aucune notification ne soit partie.
  //
  // L'ancre exige la ligne de COMMANDE — indentation puis barre oblique
  // inversée de continuation. L'option est aussi nommée dans le commentaire
  // qui l'explique juste au-dessus : un motif qui se contenterait du mot
  // passerait sur un `curl` dont l'option aurait été retirée.
  assert.match(FLUX, /^\s+--fail-with-body \\$/m);
});

test('l’ordonnanceur est planifié, et se tait tant qu’il n’est pas configuré', () => {
  assert.match(FLUX, /cron: '\*\/5 \* \* \* \*'/);
  // Un dépôt non configuré sort en succès avec une annotation : un flux rouge
  // en permanence apprendrait à ignorer le rouge, ce qui est pire que le bruit.
  assert.match(FLUX, /exit 0/);
});

// === La boîte d'envoi ======================================================

test('la boîte d’envoi n’est lisible par aucune politique', () => {
  assert.match(SQL, /ALTER TABLE public\.envois_notification ENABLE ROW LEVEL SECURITY;/);
  // RLS activée SANS aucune politique : ce n'est pas un oubli, c'est le
  // mécanisme. Une politique ajoutée ici ouvrirait la file d'attente — donc les
  // messages qu'on s'apprête à envoyer, avant qu'ils ne partent.
  assert.doesNotMatch(SQL, /CREATE POLICY[^;]{0,120}ON public\.envois_notification/);
});

test('la prise des envois n’est accordée qu’au rôle de service', () => {
  // Un utilisateur qui pourrait réclamer des envois pourrait les consommer sans
  // qu'ils partent : il éteindrait les notifications de n'importe qui, en
  // silence, et la file paraîtrait vide plutôt que fautive.
  const lignes = SQL.split('\n').filter(
    (ligne) => ligne.startsWith('GRANT') && ligne.includes('reclamer_envois')
  );
  assert.equal(lignes.length, 1, `${lignes.length} autorisation(s) trouvée(s), une seule attendue`);
  assert.match(lignes[0], /TO service_role;/);
});

// === La déconnexion oublie l'appareil ======================================

test('la déconnexion retire le jeton avant de fermer la session', () => {
  const session = lire('src/lib/sessionAppareil.ts');

  // Le geste doit EXISTER. Sans lui, le compte quitté continue de recevoir ses
  // notifications sur ce téléphone — et de les lire.
  assert.match(session, /oublierAppareil\(jeton\)/);
  assert.match(session, /jetonSansDemander\(\)/);

  // Et il doit passer AVANT la fermeture de session : la politique de la table
  // `appareils` exige `auth.uid() = user_id`, donc il faut être encore
  // connecté. Appelé après, il ne ferait rien du tout, en silence.
  //
  // L'appartenance est vérifiée SÉPARÉMENT de l'ordre, et ce n'est pas une
  // redondance : `indexOf` rend −1 pour ce qui manque, si bien qu'un appel
  // simplement RETIRÉ satisfaisait « −1 < position ». Le contrôle d'ordre seul
  // aurait donc laissé passer exactement le défaut qu'il vise.
  const corps = session.split('export async function quitterLeCompte')[1] ?? '';
  assert.ok(corps.length > 0, 'quitterLeCompte est introuvable');
  assert.ok(corps.includes('oublierLeJeton()'), 'quitterLeCompte ne retire pas le jeton');
  assert.ok(
    corps.indexOf('oublierLeJeton()') < corps.indexOf('seDeconnecter()'),
    'le jeton est oublié après la fermeture de session : le retrait ne fera rien'
  );
});

test('aucun écran ne se déconnecte en gardant le téléphone joignable', () => {
  // `seDeconnecter` reste exporté — la remise à zéro en a besoin à travers
  // `effacerSession`. Ce qui est interdit, c'est de l'appeler depuis un écran :
  // l'appareil resterait attaché au compte quitté.
  const ecran = lire('src/components/SauvegardeSection.tsx');
  assert.match(ecran, /await quitterLeCompte\(\)/);
  assert.doesNotMatch(ecran, /await seDeconnecter\(\)/);
});

// === La promesse de fond : aucune clé dans ce qui est distribué ============

test('aucune clé de service ne se trouve dans le code de l’application', () => {
  // L'énumération est récursive et c'est la SEULE à parcourir ces dossiers :
  // un contrôle qui compterait les fichiers trouvés sans exiger de plancher
  // passerait sur un dossier vide. D'où le seuil.
  const fichiers = [...fichiersSource(fileURLToPath(new URL('src', RACINE))),
                    ...fichiersSource(fileURLToPath(new URL('app', RACINE)))];
  assert.ok(
    fichiers.length >= 60,
    `seulement ${fichiers.length} fichier(s) énuméré(s) : le contrôle ne porte sur rien`
  );

  for (const fichier of fichiers) {
    const contenu = readFileSync(fichier, 'utf8');
    assert.doesNotMatch(contenu, /eyJ[A-Za-z0-9_-]{20,}/, `${fichier} porte une clé en clair`);
    assert.doesNotMatch(contenu, /SUPABASE_SERVICE_ROLE_KEY/, `${fichier} lit la clé de service`);
  }
});

function fichiersSource(dossier) {
  const trouves = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiersSource(chemin));
    else if (entree.endsWith('.ts') || entree.endsWith('.tsx')) trouves.push(chemin);
  }
  return trouves;
}
