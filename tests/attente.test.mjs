// L'attente bornée, et les trois écrans qui ne doivent plus tourner sans fin.
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// Un rond qui tourne sans s'arrêter a été signalé deux fois depuis un
// téléphone : après la création d'un compte, et à la place du code d'invitation.
// Les deux ont la même cause de forme, et elle n'est pas dans la logique
// métier : c'est un `await` dont la promesse peut ne jamais se résoudre, sur un
// écran qui n'affiche « en cours » que tant qu'il attend.
//
// La cause est réelle et connue : le client Supabase sérialise la lecture de
// session derrière un verrou de stockage, et un verrou jamais relâché laisse la
// promesse en attente indéfiniment. Mais la correction ne dépend pas de cette
// cause : elle consiste à ne jamais attendre sans borne, ce qui rend le défaut
// impossible **quelle que soit** la raison pour laquelle une promesse ne rend
// pas — réseau, verrou, récursion, bibliothèque.
//
// CE QUI SE VÉRIFIE ICI
// ---------------------
// Deux choses, et il faut les deux :
//
//   - le **comportement** de l'attente bornée, qui se calcule donc se teste ;
//   - la **forme** des trois écrans : l'indicateur qui peut tourner doit avoir
//     une sortie dans tous les cas, et l'état « en cours » doit être retiré
//     dans un `finally` et non après le dernier `await`.
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

  // Les cinq entrées passent par `refuser`, qui sait traduire les trois refus.
  const refus = source.match(/if \('refus' in ctx\) return refuser\(ctx\.refus\);/g) ?? [];
  assert.equal(refus.length, 5, `les cinq fonctions doivent traduire le refus, ${refus.length} trouvée(s)`);

  // Les appels RPC passent tous par le helper borné. Compté, et non cherché
  // une fois : le falsificateur a montré qu'un `borner` retiré de `appelerRpc`
  // — le chemin de quatre appels sur cinq — laissait le fichier vert si l'on
  // se contentait de vérifier la présence du helper.
  assert.match(
    source,
    /const reponse = await borner\(client\.rpc\(fonction, parametres\)\);/,
    'le helper RPC doit lui-même être borné'
  );

  const rpc = source.match(/await appelerRpc\(/g) ?? [];
  assert.equal(rpc.length, 4, `les quatre RPC doivent passer par le helper, ${rpc.length} trouvé(s)`);

  // La suppression est un appel réseau comme un autre : `from().delete()`.
  assert.match(
    source,
    /await borner\(client\.from\('amis'\)\.delete\(\)/,
    'la suppression doit être bornée elle aussi'
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
