// L'attente bornée, et les écrans qui ne doivent plus tourner sans fin.
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// Un rond qui tourne sans s'arrêter a été signalé TROIS fois depuis un
// téléphone : après la création d'un compte, à la place du code d'invitation,
// et sur « Mes amis ». Une QUATRIÈME fois, la même famille de défaut s'est
// présentée sans indicateur du tout : l'écran du lien de courriel restait sur
// « Ouverture du lien… » pour toujours. Les quatre ont la même cause de forme,
// et elle n'est pas
// dans la logique métier : c'est un `await` dont la promesse peut ne jamais se
// résoudre — ou qui REJETTE — sur un écran qui n'affiche « en cours » que tant
// qu'il attend.
//
// La cause est réelle et connue : le client Supabase sérialise la lecture de
// session derrière un verrou de stockage, et un verrou jamais relâché laisse la
// promesse en attente indéfiniment. Mais la correction ne dépend pas de cette
// cause : elle consiste à ne jamais attendre sans borne, et à ne jamais laisser
// un état d'attente sans sortie — ce qui rend le défaut impossible **quelle que
// soit** la raison pour laquelle une promesse ne rend pas : réseau, verrou,
// récursion, bibliothèque.
//
// CE QUI SE VÉRIFIE ICI
// ---------------------
// Deux choses, et il faut les deux :
//
//   - le **comportement** de l'attente bornée, qui se calcule donc se teste ;
//   - la **forme** des écrans concernés : l'indicateur qui peut tourner doit
//     avoir une sortie dans tous les cas, l'état « en cours » doit être retiré
//     dans un `finally` et non après le dernier `await`, un REJET doit être
//     rattrapé — une borne ne l'arrête pas —, un état qui attend doit avoir
//     une échéance, et une adresse reçue doit PARVENIR à l'écran qui la traite,
//     depuis les deux sources possibles.
//
// Un test de comportement seul ne suffirait pas : on peut écrire une attente
// bornée parfaite et ne jamais l'appeler. Un test de forme seul ne suffirait
// pas non plus : une chaîne présente dans un commentaire satisfait un `grep`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const lire = (chemin) => readFileSync(join(RACINE, chemin), 'utf8');

/**
 * Une attente bornée, réécrite ici pour être éprouvée.
 *
 * Elle est volontairement identique dans sa forme à celle des trois écrans.
 * La dupliquer est assumé : les écrans sont du JSX, qu'on ne peut pas importer
 * sans un moteur de rendu, et la valeur du test est de fixer la **propriété**
 * — « une promesse qui ne rend jamais ne bloque pas l'appelant » — pas de
 * vérifier une implémentation.
 */
function borner(promesse, ms, marqueur) {
  return Promise.race([
    promesse,
    new Promise((resoudre) => setTimeout(() => resoudre(marqueur), ms)),
  ]);
}

// === Le comportement de l'attente bornée ====================================

test('une promesse qui ne rend jamais est abandonnée, et l’attente rend la main', async () => {
  // Le cœur du défaut signalé : la promesse ne se résout jamais, ne rejette
  // jamais. Sans borne, l'appelant attend pour toujours.
  const jamais = new Promise(() => {});
  const marqueur = Symbol('depasse');

  const debut = Date.now();
  const resultat = await borner(jamais, 30, marqueur);
  const ecoule = Date.now() - debut;

  assert.equal(resultat, marqueur, 'le délai dépassé doit être rendu, pas la promesse');
  assert.ok(ecoule < 2000, `l’attente a rendu en ${ecoule} ms : elle n’a pas attendu indéfiniment`);
});

test('une promesse qui rend à temps n’est pas retardée par la borne', async () => {
  // La borne ne doit pas transformer une réponse rapide en attente de dix
  // secondes : sinon on aurait remplacé un rond qui tourne par un rond qui
  // tourne dix secondes pour rien.
  const marqueur = Symbol('depasse');
  const rapide = Promise.resolve('valeur');

  const resultat = await borner(rapide, 5000, marqueur);
  assert.equal(resultat, 'valeur', 'une réponse rapide est rendue telle quelle');
});

test('une promesse qui rejette propage son rejet, elle n’est pas avalée', async () => {
  // Un `Promise.race` mal écrit — ou un `catch` trop large posé autour —
  // transformerait une panne en silence. Ici le rejet doit remonter : c'est
  // l'appelant qui décide quoi en dire.
  const marqueur = Symbol('depasse');
  const echouee = Promise.reject(new Error('panne réseau'));

  await assert.rejects(
    () => borner(echouee, 5000, marqueur),
    /panne réseau/,
    'le rejet doit remonter, pas être confondu avec un délai'
  );
});

test('« null » et « délai dépassé » sont deux issues distinctes', async () => {
  // C'est le piège du correctif : `utilisateurCourant()` rend `null` quand
  // personne n'est connecté. Si le délai dépassé valait aussi `null`, un
  // verrou bloqué se présenterait comme « pas connecté » — un mensonge
  // silencieux, exactement ce qu'on cherche à supprimer.
  const marqueur = Symbol('depasse');

  assert.equal(await borner(Promise.resolve(null), 5000, marqueur), null);
  assert.equal(await borner(new Promise(() => {}), 20, marqueur), marqueur);

  assert.notEqual(marqueur, null, 'le marqueur ne doit pas être confondu avec « personne »');
});

// === La forme des trois écrans ==============================================

test('l’écran de sauvegarde retire « en cours » dans un finally, jamais après un await', () => {
  // LA FORME A CHANGÉ, LA GARANTIE NON — et elle porte sur plus de gestes.
  //
  // Avant, chacun des deux gestes recopiait sa borne, son verrou et son
  // `finally`. Ce fichier comptait donc « deux » de chaque, et une quatrième
  // copie oubliant l'un des trois serait passée inaperçue. Il n'y a
  // maintenant qu'UN lanceur, par lequel passent les quatre gestes : il suffit
  // qu'il soit juste, et qu'aucun geste ne le contourne. C'est ce que les
  // comptages ci-dessous vérifient.
  const source = lire('src/components/SauvegardeSection.tsx');

  assert.match(
    source,
    /async function borner\(tentative: Promise<ResultatAuth>\)/,
    'la borne de l’authentification doit exister'
  );

  // La borne est appelée UNE fois, dans le lanceur partagé. Compter, plutôt que
  // chercher : deux appels signifieraient qu'un geste s'est remis à appeler la
  // borne pour son compte, donc qu'il a quitté le lanceur.
  const bornes = source.match(/await borner\(action\(\)\)/g) ?? [];
  assert.equal(
    bornes.length,
    1,
    `la borne doit être appelée une seule fois, dans le lanceur — ${bornes.length} trouvée(s)`
  );

  // Le retrait de « en cours » est dans un `finally`, avec le relâchement du
  // verrou — les deux ensemble, sinon l'un des deux peut être oublié seul.
  assert.match(
    source,
    /finally \{\s*\n\s*enCoursReference\.current = false;\s*\n\s*setEnCours\(false\);\s*\n\s*\}/,
    '« en cours » doit être retiré dans un finally, avec le relâchement du verrou'
  );

  // Et il ne l'est plus nulle part ailleurs : une seconde sortie serait une
  // sortie qui ne s'exécute pas dans le cas qu'on veut couvrir.
  assert.equal(
    /await [a-zA-Z]+\([^)]*\);\s*\n\s*setEnCours\(false\);/.test(source),
    false,
    '« en cours » ne doit plus être retiré juste après un await'
  );

  // Aucun geste ne contourne le lanceur : les quatre y passent. C'est la
  // contrepartie du regroupement — un seul chemin, mais il faut qu'il soit le
  // SEUL. Un `await seConnecter(...)` écrit directement dans un gestionnaire
  // échapperait au verrou et à la borne sans que rien ne le dise.
  const parLeLanceur = source.match(/\blancer\(/g) ?? [];
  assert.equal(
    parLeLanceur.length,
    4,
    `les quatre gestes doivent passer par le lanceur, ${parLeLanceur.length} trouvé(s)`
  );

  for (const geste of [
    'creerCompte',
    'seConnecter',
    'reinitialiserMotDePasse',
    'renvoyerConfirmation',
  ]) {
    assert.ok(
      new RegExp(`lancer\\(\\s*\\n?\\s*\\(\\) => ${geste}\\(`).test(source),
      `${geste} doit passer par le lanceur, et non l’appeler directement`
    );
  }

  // La lecture de session est bornée elle aussi : c'est là que le verrou agit.
  assert.match(
    source,
    /withTimeout\(utilisateurCourant\(\)\)/,
    'la lecture de session doit être bornée'
  );

  // Le délai dépassé n'est PAS « personne n'est connecté ».
  //
  // Les deux ont `null` pour forme, et c'est justement le piège : si le délai
  // dépassé était posé tel quel dans `utilisateur`, l'écran afficherait le
  // formulaire de connexion à un utilisateur déjà connecté — un mensonge
  // silencieux, et il essaierait de se reconnecter sans comprendre pourquoi.
  assert.match(
    source,
    /setUtilisateur\(resultat === TIMEOUT \? null : resultat\)/,
    'le délai dépassé doit être distingué de « pas connecté »'
  );
});

test('deux appuis sur un bouton d’authentification ne laissent pas deux attentes en course', async () => {
  // Le défaut que cette assertion ferme, et il n'était pas visible à l'œil :
  // `enCours` désactive le bouton, mais React n'applique l'état qu'au rendu
  // suivant. Deux appuis dans le même cycle — un doigt qui tremble, une
  // connexion lente — lancent donc deux tentatives. La seconde, hors de la
  // borne, remet `setEnCours(false)` et fait disparaître « en cours » pendant
  // que la première attend encore : le bouton redevient actif, et l'utilisateur
  // appuie une troisième fois. On vérifie donc que le refus de réentrance est
  // lu sur une valeur synchrone, pas sur l'état rendu.
  const source = lire('src/components/SauvegardeSection.tsx');

  assert.match(
    source,
    /if \(enCoursReference\.current\) \{\s*\n\s*return /,
    'la réentrance doit être refusée sur une référence synchrone'
  );

  // Un seul verrou, posé une fois et relâché une fois — dans le lanceur
  // partagé. Compter reste indispensable : posé sans être relâché, le bouton ne
  // marcherait plus jamais ; relâché sans être posé, deux appuis lanceraient
  // deux attentes. Le regroupement en un lanceur supprime la quatrième copie
  // où l'un des deux aurait pu manquer.
  const verrous = source.match(/if \(enCoursReference\.current\) \{/g) ?? [];
  assert.equal(verrous.length, 1, `le verrou doit être posé une fois, ${verrous.length} trouvé(s)`);

  const poses = source.match(/enCoursReference\.current = true;/g) ?? [];
  assert.equal(poses.length, 1, `la référence doit être posée une fois, ${poses.length} fois`);

  const relaches = source.match(/enCoursReference\.current = false;/g) ?? [];
  assert.equal(
    relaches.length,
    1,
    `le verrou doit être relâché une fois, ${relaches.length} fois — un verrou posé ` +
      'sans être relâché rend le bouton définitivement inerte'
  );

  assert.match(
    source,
    /enCoursReference\.current = false;\n\s*setEnCours\(false\);/,
    'la référence doit être relâchée avant que le rond ne s’arrête'
  );
});

test('la section des amis ne laisse pas « connecte » à null quand la session ne répond pas', () => {
  // `connecte === null` affiche un rond. C'est le seul état de ce composant qui
  // n'a pas de sortie : si `utilisateurCourant()` ne rend jamais, `connecte`
  // reste `null` et l'écran tourne indéfiniment. Le délai dépassé doit donc
  // mener à un état affichable.
  const source = lire('src/components/AmisSection.tsx');

  assert.match(
    source,
    /const oui = await repondreDans\(utilisateurCourant\(\), DELAI_SESSION_MS\);/,
    'la lecture de session doit être bornée dans la section des amis'
  );

  assert.match(
    source,
    /if \(oui === DELAI_DEPASSE\) \{\s*\n\s*setConnecte\(false\);\s*\n\s*return;\s*\n\s*\}/,
    'un délai dépassé doit mener à un état affichable, pas à un rond'
  );

  // Et le composant ne doit pas rendre `null` sans sortie : l'état « inconnu »
  // est le seul qui affiche un indicateur, et il doit être atteignable par un
  // chemin borné.
  assert.match(source, /if \(connecte === null\)/, 'l’état inconnu existe toujours');

  // LA BORNE NE COUVRE PAS LE REJET, et c'est la moitié du défaut qui manquait.
  // `Promise.race` rend la première promesse qui s'achève — un rejet est un
  // achèvement, il remonte donc tel quel. Mesuré : `getSession()` rejette quand
  // le stockage refuse une clé. Sans rattrapage, `setConnecte` n'est jamais
  // atteint et `connecte` reste `null` : le rond, indéfiniment.
  assert.match(
    source,
    /\n    \} catch \{\n/,
    'un rejet doit être rattrapé : la borne ne l’arrête pas'
  );

  // Et l'état de panne doit être rendu AVANT l'état inconnu. Placé après, il ne
  // servirait à rien : `connecte === null` gagnerait et l'indicateur
  // reviendrait exactement là où la panne vient d'être constatée.
  assert.match(
    source,
    /if \(panne !== null\) \{/,
    'le rejet doit mener à un état affichable'
  );
  assert.ok(
    source.indexOf('if (panne !== null) {') < source.indexOf('if (connecte === null) {'),
    'l’état de panne doit être rendu avant l’état inconnu, sinon le rond gagne'
  );

  // Et l'état de panne offre un moyen d'agir : un échec sans recours vaut un
  // échec qu'on subit.
  assert.match(
    source,
    /accessibilityLabel="Réessayer de lire la progression des amis"/,
    'la panne doit offrir un moyen d’agir'
  );
});

test('l’écran des amis arrête son indicateur dans un finally et offre un réessai', () => {
  const source = lire('app/amis.tsx');

  assert.match(
    source,
    /finally \{\s*\n\s*setChargement\(false\);\s*\n\s*\}/,
    '« chargement » doit être retiré dans un finally'
  );

  // Deux issues pour le code : l'indicateur pendant le chargement, et un
  // réessai quand le chargement est fini sans code. `chargement` doit donc
  // être lu dans le rendu — sans quoi l'échec et le chargement se confondent
  // et l'utilisateur revoit un rond.
  assert.match(
    source,
    /\{code !== null \? \(/,
    'le rendu du code doit distinguer les trois états'
  );
  assert.match(
    source,
    /\) : chargement \? \(/,
    'l’indicateur ne doit s’afficher que pendant le chargement'
  );
  assert.match(
    source,
    /Le code n’a pas pu être affiché\./,
    'l’échec doit être dit, pas tourné en rond'
  );
  assert.match(
    source,
    /accessibilityLabel="Réessayer d’obtenir le code"/,
    'l’échec doit offrir un moyen d’agir'
  );

  // Un rejet doit être rattrapé, ici aussi : `finally` ferme les trois issues
  // ordinaires, mais il ne les NOMME pas. Sans `catch`, un rejet part en rejet
  // non traité et l'écran se referme sans rien dire.
  assert.match(
    source,
    /\n    \} catch \{\n/,
    'un rejet doit être rattrapé sur l’écran des amis'
  );

  // Et la liste a une sortie quand elle n'a pas pu être lue. Sans elle, la
  // section restait vide sous son titre : ni liste, ni phrase, ni rond.
  assert.match(
    source,
    /\{!chargement && amis === null && \(/,
    'la liste doit dire quelque chose quand elle n’a pas pu être lue'
  );
});

test('la couche des amis borne tous ses appels, y compris la lecture de session', () => {
  // Le point le plus facile à manquer : `contexte()` est appelé par les cinq
  // fonctions, et c'est lui qui lit la session. Borner les `rpc` sans borner
  // `contexte` laisserait exactement le défaut signalé.
  const source = lire('src/lib/sync/amis.ts');

  assert.match(
    source,
    /const utilisateur = await borner\(utilisateurCourant\(\)\);/,
    'la lecture de session doit être bornée dans contexte()'
  );

  assert.match(
    source,
    /if \(utilisateur === DELAI_DEPASSE\) return \{ refus: 'delai' \};/,
    'le délai dépassé doit devenir un refus explicite'
  );

  // Chaque lecture de session doit traduire son refus — et le compte se DÉDUIT.
  //
  // La première écriture de ce contrôle attendait « cinq fonctions », en dur. Le
  // jour où la couche des amis en a compté treize — blocage, recherche,
  // annulation — le test est tombé : non parce qu'une traduction manquait, mais
  // parce qu'un nombre écrit à la main avait vieilli. Un garde-fou qui compte
  // doit comparer deux choses qui DOIVENT s'égaler, jamais un nombre et une
  // constante. Ici : autant de traductions que de lectures de session.
  const lectures = source.match(/await contexte\(\)/g) ?? [];
  const refus = source.match(/if \('refus' in ctx\) return refuser\(ctx\.refus\);/g) ?? [];
  assert.ok(lectures.length > 0, 'la couche des amis doit lire la session');
  assert.equal(
    refus.length,
    lectures.length,
    `chaque lecture de session doit traduire son refus : ${refus.length} traduction(s) pour ${lectures.length} lecture(s)`
  );

  // Les appels RPC passent tous par le helper borné. Compté, et non cherché
  // une fois : le falsificateur a montré qu'un `borner` retiré de `appelerRpc`
  // laissait le fichier vert si l'on se contentait de vérifier la présence du
  // helper.
  assert.match(
    source,
    /const reponse = await borner\(client\.rpc\(fonction, parametres\)\);/,
    'le helper RPC doit lui-même être borné'
  );

  // Et aucun appel direct ne doit vivre ailleurs que dans ce helper : on exige
  // qu'il y en ait EXACTEMENT UN — celui du helper — donc zéro appel direct,
  // quel que soit le nombre de fonctions ajoutées ensuite.
  const rpcDirects = source.match(/client\.rpc\(/g) ?? [];
  assert.equal(
    rpcDirects.length,
    1,
    `un seul client.rpc( doit exister — celui du helper borné — ${rpcDirects.length} trouvé(s)`
  );

  // Même raisonnement pour la lecture de session : elle ne doit exister qu'une
  // fois, dans `contexte()`, et c'est là qu'elle est bornée.
  const lecturesSession = source.match(/utilisateurCourant\(\)/g) ?? [];
  assert.equal(
    lecturesSession.length,
    1,
    `une seule lecture de session doit exister — celle de contexte(), bornée — ${lecturesSession.length} trouvée(s)`
  );

  // La suppression est un appel réseau comme un autre : `from().delete()`.
  assert.match(
    source,
    /await borner\(client\.from\('amis'\)\.delete\(\)/,
    'la suppression doit être bornée elle aussi'
  );

  // Et aucune autre requête directe ne doit y échapper. Là encore le compte se
  // déduit : autant de `borner(client.from(` que de `client.from(`, quel qu'en
  // soit le nombre. Écrire « deux » en dur aurait le même défaut que le « cinq »
  // corrigé plus haut.
  const requetes = source.match(/client\.from\(/g) ?? [];
  const requetesBornees = source.match(/borner\(\s*client\.from\(/g) ?? [];
  assert.equal(
    requetesBornees.length,
    requetes.length,
    `tout client.from( doit être borné : ${requetesBornees.length} borné(s) sur ${requetes.length}`
  );

  // Et un délai dépassé ne doit pas être présenté comme un refus métier :
  // « code inconnu » et « la base n’a pas répondu » ne se disent pas pareil.
  assert.match(
    source,
    /if \(appel\.erreur === MESSAGE_DELAI\) return \{ statut: 'erreur', message: appel\.erreur \};/,
    'un délai dépassé n’est pas un refus de la base, c’est une panne'
  );
});

test('aucun écran n’attend la session sans borne', () => {
  // Le contrôle qui attrape l'oubli plutôt que le cas connu : tout appel
  // direct à `utilisateurCourant()` ailleurs qu'à côté d'une borne est un
  // nouvel endroit où un rond peut tourner sans fin. On l'exige donc borné,
  // partout — et si un jour un appel légitime sans borne apparaît, ce test
  // obligera à l'expliquer.
  const fichiers = [
    'src/components/SauvegardeSection.tsx',
    'src/components/AmisSection.tsx',
    'app/amis.tsx',
    'src/lib/sync/amis.ts',
  ];

  for (const chemin of fichiers) {
    const source = lire(chemin);
    const lignes = source.split('\n');
    lignes.forEach((ligne, index) => {
      if (!ligne.includes('utilisateurCourant(')) return;
      // Commentaire, import, ou définition : rien de tout cela n'attend.
      if (/^\s*(\/\/|\*|import )/.test(ligne)) return;
      if (ligne.includes('function utilisateurCourant')) return;

      const contexte = lignes.slice(Math.max(0, index - 2), index + 1).join('\n');
      assert.ok(
        contexte.includes('borner(') ||
          contexte.includes('withTimeout(') ||
          contexte.includes('repondreDans('),
        `${chemin} ligne ${index + 1} : appel non borné — « ${ligne.trim()} »`
      );
    });
  }
});

test('l’écran du lien de courriel ne reste pas dans un état d’attente sans sortie', () => {
  // Signalé depuis un téléphone, et sous une troisième forme : le lien ouvre
  // bien l'application, l'écran s'affiche, et « Ouverture du lien… » reste là
  // — sans bouton, sans erreur, sans fin. Deux causes distinctes, et il faut
  // les deux garde-fous.
  const source = lire('app/lien.tsx');

  // (1) L'échange des jetons peut REJETER, pas seulement rendre `{ ok: false }`.
  // Mesuré : `client.auth.setSession` rejette quand le stockage refuse une clé,
  // parce qu'il écrit la session. Sans rattrapage, l'écran ne dit rien.
  //
  // L'ancre porte le commentaire qui suit le `catch`, et c'est nécessaire :
  // l'écran a DEUX `catch (erreur)`, et chercher le mot seul passerait encore
  // si l'on retirait celui-ci.
  assert.match(
    source,
    /\} catch \(erreur\) \{\n      \/\/ `ouvrirSessionDepuisLien` peut REJETER/,
    'un rejet de l’échange doit être rattrapé'
  );

  // (2) Les deux états d'attente — aucune adresse reçue, et échange en cours —
  // doivent avoir une échéance. Un état qui attend sans échéance est un rond
  // qui tourne, même sans indicateur.
  assert.match(
    source,
    /if \(etat\.nom !== 'attente' && etat\.nom !== 'ouverture'\) return;/,
    'les deux états d’attente doivent être reconnus'
  );
  assert.match(
    source,
    /nom: 'probleme', message: MESSAGE_SANS_SORTIE\[attendu\]/,
    'l’échéance doit mener à un état affichable'
  );

  // (3) Et elle ne rétrograde QUE l'état observé : écraser un état déjà avancé
  // effacerait une réussite — une session ouverte, un lien reconnu.
  assert.match(
    source,
    /precedent\.nom === attendu/,
    'l’échéance ne doit pas écraser un état déjà avancé'
  );

  // (4) L'état observé est figé AVANT la pose de l'échéance : sans cette copie,
  // la comparaison porterait sur l'état courant au moment où la minuterie se
  // déclenche, et ne comparerait plus rien.
  assert.match(
    source,
    /if \(etat\.nom !== 'attente' && etat\.nom !== 'ouverture'\) return;\n    const attendu = etat\.nom;/,
    'l’état observé doit être figé avant la pose de l’échéance'
  );

  // (5) Et l'état d'échec offre une action, sinon l'échec est subi. C'est le
  // seul état de cet écran qui propose un bouton : sans lui, l'échéance
  // remplacerait un rond qui tourne par une impasse.
  assert.match(
    source,
    /etat\.nom === 'probleme'[\s\S]{0,500}Retour au profil/,
    'l’état d’échec doit offrir une action'
  );
});

test('l’adresse qui a ouvert l’application parvient à l’écran, depuis ses deux sources', () => {
  // Le défaut mesuré sur un téléphone, et sous une quatrième forme : le lien
  // ouvre bien l'application, l'écran s'affiche, et « Ouverture du lien… »
  // reste là — sans indicateur, sans bouton, sans fin.
  //
  // La cause n'était PAS l'échange des jetons : il n'était jamais atteint. Elle
  // est dans la RÉCEPTION de l'adresse, et l'adresse ne se lit pas dans une
  // seule source. Mesuré dans le paquet installé, `expo-linking/ios/` :
  //
  //   • `Linking.useURL()` s'appuie sur React Native, dont `getInitialURL()`
  //     ne rend l'adresse que si l'application a été LANCÉE par le lien, et
  //     dont l'événement `url` ne touche que les écouteurs DÉJÀ posés. Or le
  //     routeur monte l'écran `/lien` APRÈS l'arrivée de l'adresse ;
  //   • `Linking.useLinkingURL()` lit `ExpoLinking.getLinkingURL()`, et le
  //     délégué d'application renseigne ce registre à chaque ouverture
  //     (`ExpoLinkingRegistry.shared.initialURL = url`), donc l'adresse y
  //     survit à l'événement.
  //
  // Sur une ouverture à chaud — l'application tournait, ce qui est le cas
  // quand on vient de demander le lien depuis l'écran Profil — la première rend
  // `null`, et l'écran n'avait donc rien à traiter. Sur un lancement à froid,
  // c'est la seconde qui est vide, parce qu'iOS n'appelle pas le délégué
  // `open url` quand l'application démarre. Il faut donc LES DEUX.
  const source = lire('app/lien.tsx');

  assert.match(
    source,
    /const urlNative = Linking\.useURL\(\);/,
    'la source de React Native doit être lue'
  );
  assert.match(
    source,
    /const urlExpo = Linking\.useLinkingURL\(\);/,
    'la source du registre natif doit être lue : sans elle, une ouverture à chaud ne donne rien'
  );

  // Les deux alimentent le MÊME traitement, et non deux chemins séparés :
  // deux chemins oublieraient l'une des deux dans l'un des cas, et c'est
  // exactement le défaut que ce test garde.
  assert.match(
    source,
    /const candidates = \[urlNative, urlExpo\]\.filter\(/,
    'les deux adresses doivent être réunies avant d’être traitées'
  );

  // Et une adresse déjà traitée ne l'est pas deux fois : les deux sources
  // annoncent la même ouverture, et un second `setSession` consommerait deux
  // fois le même jeton de rafraîchissement — l'écran annoncerait alors un échec
  // sur une réussite.
  assert.match(
    source,
    /if \(dejaTraitees\.current\.has\(adresse\)\) continue;/,
    'une adresse déjà traitée ne doit pas être traitée deux fois'
  );

  // Le garde porte sur un ENSEMBLE, pas sur une seule adresse : avec une
  // comparaison à l'adresse précédente, la seconde source — qui annonce la même
  // ouverture — serait traitée une fois de plus.
  assert.match(
    source,
    /const dejaTraitees = useRef<Set<string>>\(new Set\(\)\);/,
    'le garde doit retenir toutes les adresses déjà traitées'
  );
});
