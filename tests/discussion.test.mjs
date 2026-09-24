// L'espace de discussion : ce qui se décide sans réseau.
//
// Ce fichier n'éprouve pas la base — c'est le rôle de `scripts/banc_supabase.mjs`,
// qui exécute le vrai SQL sous Postgres, avec de vraies politiques RLS. Il
// éprouve la couche qui reçoit les lignes et les rend lisibles : conversion des
// identifiants, des dates, des textes, bornes de longueur, ordre du fil, et les
// phrases montrées à l'utilisateur.
//
// Deux choses valent la peine d'être dites ici, parce qu'elles ne se devinent
// pas à la lecture du module :
//
//   1. `id` revient en CHAÎNE. `BIGSERIAL` est un `BIGINT`, que PostgREST
//      sérialise en texte pour ne pas perdre de précision. Un identifiant lu
//      comme chaîne passerait dans une comparaison `===` sans rien signaler,
//      et deux messages différents pourraient sembler identiques.
//
//   2. Un message RETIRÉ revient avec `corps: null`. C'est la base qui le dit,
//      par `lire_fil` — mais la couche de lecture doit le tenir aussi, sinon une
//      ligne arrivée par un autre chemin ressusciterait un texte retiré.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  LONGUEUR_MESSAGE_MAX,
  apercuTexte,
  badgeNonLus,
  caracteresRestants,
  compterMessages,
  filVide,
  formaterApercuDate,
  formaterEnvoi,
  indexerApercus,
  indexerNonLus,
  jourPrecedent,
  lireApercu,
  lireMessage,
  lireNonLus,
  messageErreurDiscussion,
  preparerEnvoi,
  rangerConversations,
  rangerFil,
  refusEnvoi,
  resumerFil,
  separateurDeJour,
  texteAffiche,
  totalDesNonLus,
} from '@/lib/discussion';

// === Conversion des lignes ==================================================

test('une ligne de la base se lit en message', () => {
  const message = lireMessage({
    id: '12',
    auteur: '11111111-1111-1111-1111-111111111111',
    corps: 'Bismillah',
    created_at: '2026-09-23T14:32:11.000Z',
    retire_le: null,
    masque_par_moderateur: false,
  });

  assert.ok(message !== null, 'un message complet doit se lire');
  assert.equal(message.id, 12, 'l’identifiant doit être converti en nombre');
  assert.equal(typeof message.id, 'number', 'et non rester une chaîne');
  assert.equal(message.auteur, '11111111-1111-1111-1111-111111111111');
  assert.equal(message.corps, 'Bismillah');
  assert.equal(message.envoyeLe, '2026-09-23T14:32:11.000Z');
  assert.equal(message.retire, false);
  assert.equal(message.masqueParModerateur, false);
});

test('un identifiant en chaîne devient bien un nombre', () => {
  // Le cas qui compte : `===` sur `"12"` et `12` échoue en silence, et deux
  // messages pourraient alors sembler identiques.
  const message = lireMessage({ id: '9007199254', auteur: 'a', corps: 'x' });
  assert.ok(message !== null);
  assert.equal(message.id, 9007199254);
  assert.equal(message.id === '9007199254', false, 'ce n’est plus une chaîne');
});

test('une ligne sans identifiant ne se lit pas', () => {
  assert.equal(lireMessage({ auteur: 'a', corps: 'x' }), null);
  assert.equal(lireMessage({ id: null, auteur: 'a', corps: 'x' }), null);
  assert.equal(lireMessage({ id: 0, auteur: 'a', corps: 'x' }), null, 'un identifiant nul n’existe pas');
  assert.equal(lireMessage({ id: 'pas un nombre', auteur: 'a', corps: 'x' }), null);
});

test('une ligne sans auteur ne se lit pas', () => {
  assert.equal(lireMessage({ id: 1, corps: 'x' }), null);
  assert.equal(lireMessage({ id: 1, auteur: '', corps: 'x' }), null);
});

test('un message retiré est rendu sans son texte', () => {
  const message = lireMessage({
    id: 3,
    auteur: 'a',
    corps: 'ce texte ne doit plus se lire',
    created_at: '2026-09-23T14:32:11.000Z',
    retire_le: '2026-09-23T15:00:00.000Z',
  });

  assert.ok(message !== null);
  assert.equal(message.retire, true);
  assert.equal(message.corps, null, 'le texte d’un message retiré n’est pas rendu');
  assert.equal(texteAffiche(message), 'Message retiré');
});

test('un texte vide n’est pas un corps', () => {
  const message = lireMessage({ id: 4, auteur: 'a', corps: '   ' });
  assert.ok(message !== null);
  assert.equal(message.corps, null, 'des espaces ne font pas un message');
});

test('un masquage par la modération se lit', () => {
  const message = lireMessage({
    id: 5,
    auteur: 'a',
    corps: 'x',
    masque_par_moderateur: true,
  });
  assert.ok(message !== null);
  assert.equal(message.masqueParModerateur, true);
});

// === Ce qu'on accepte d'envoyer ============================================

test('un message vide est refusé', () => {
  // Les trois formes de « vide » que l'écran peut produire : la chaîne vide, la
  // suite d'espaces, et la suite de sauts de ligne — celle qu'on obtient en
  // appuyant deux fois sur la touche d'entrée.
  assert.equal(refusEnvoi(''), 'Écris d’abord un message.');
  assert.equal(refusEnvoi('   '), 'Écris d’abord un message.');
  assert.equal(refusEnvoi('\n\n'), 'Écris d’abord un message.');
  // Et la phrase est la MÊME dans les deux sens : le refus ne doit pas laisser
  // deviner par quelle porte on est passé — ce qui compte à l'écran, c'est
  // qu'une seule phrase soit écrite là où la règle est écrite.
  assert.equal(refusEnvoi(''), refusEnvoi('\u00A0'), 'une seule phrase pour tous les vides');
});

test('un message fait de caractères invisibles est refusé', () => {
  // C'est le cas que `trim()` ne voit pas : l'espace insécable et la marque de
  // direction ne sont pas des espaces pour lui. Un message qui n'en contient
  // que se lirait comme une bulle vide dans le fil.
  assert.notEqual(refusEnvoi('\u00A0'), null, 'espace insécable');
  assert.notEqual(refusEnvoi('\u200B'), null, 'espace de largeur nulle');
  assert.notEqual(refusEnvoi('\u202E'), null, 'marque de direction');
  assert.notEqual(refusEnvoi('\u00A0\u200B\uFEFF'), null, 'plusieurs, mélangés');
});

test('un message normal est accepté', () => {
  assert.equal(refusEnvoi('Bismillah'), null);
  assert.equal(refusEnvoi('  Courage, tu y es presque !  '), null);
});

test('un message écrit en arabe est accepté tel quel', () => {
  // L'arabe est le contenu normal de cette application : il ne doit pas être
  // traité comme un cas particulier, ni rogné par le nettoyage.
  assert.equal(refusEnvoi('بسم الله'), null);
  assert.equal(preparerEnvoi('  بسم الله  '), 'بسم الله');
});

test('un message trop long est refusé, et l’excès est dit', () => {
  const juste = 'a'.repeat(LONGUEUR_MESSAGE_MAX);
  assert.equal(refusEnvoi(juste), null, 'la limite exacte passe');

  const trop = 'a'.repeat(LONGUEUR_MESSAGE_MAX + 7);
  const refus = refusEnvoi(trop);
  assert.notEqual(refus, null);
  assert.match(refus, /7/, 'le nombre de caractères de trop doit être dit');
});

test('la préparation détoure et retire les caractères de contrôle', () => {
  assert.equal(preparerEnvoi('  bonjour  '), 'bonjour');
  assert.equal(preparerEnvoi('a\u0000b'), 'ab', 'un caractère nul est retiré');
  assert.equal(preparerEnvoi('a\u200Bb'), 'a b', 'un espace de largeur nulle devient un espace');
});

test('un saut de ligne est conservé, un caractère de contrôle non', () => {
  // Le saut de ligne est une mise en forme légitime ; la tabulation verticale
  // n'en est pas une, et casserait l'affichage.
  assert.equal(preparerEnvoi('ligne 1\nligne 2'), 'ligne 1\nligne 2');
  assert.equal(preparerEnvoi('a\u000Bb'), 'ab');
});

test('le compteur ne passe jamais sous zéro', () => {
  assert.equal(caracteresRestants(''), LONGUEUR_MESSAGE_MAX);
  assert.equal(caracteresRestants('a'.repeat(LONGUEUR_MESSAGE_MAX)), 0);
  assert.equal(
    caracteresRestants('a'.repeat(LONGUEUR_MESSAGE_MAX + 50)),
    0,
    'un compteur négatif inquiète plus qu’il n’informe'
  );
});

// === L'ordre du fil ========================================================

function message(id, envoyeLe, auteur = 'moi') {
  return {
    id,
    auteur,
    corps: `message ${id}`,
    envoyeLe,
    masqueParModerateur: false,
    retire: false,
  };
}

test('le fil se range du plus ancien au plus récent', () => {
  const desordre = [
    message(3, '2026-09-23T10:00:00.000Z'),
    message(1, '2026-09-23T08:00:00.000Z'),
    message(2, '2026-09-23T09:00:00.000Z'),
  ];
  const range = rangerFil(desordre);
  assert.deepEqual(
    range.map((m) => m.id),
    [1, 2, 3]
  );
});

test('à date égale, l’ordre vient de l’identifiant, pas du tri', () => {
  // Le piège est la STABILITÉ du tri, et il faut l'avoir mesuré pour l'écrire.
  //
  // `Array.prototype.sort` est stable : sur une paire à clés ÉGALES, il appelle
  // le comparateur une fois, avec les éléments dans l'ordre du tableau, et
  // conserve cet ordre quand le comparateur conclut à l'égalité. Une
  // comparaison qui se contenterait des dates laisserait donc le fil tel quel.
  //
  // Mais la stabilité masque aussi la moitié du défaut : avec `[7, 2]` à date
  // égale, une comparaison d'identifiants ET un tri stable qui ne trie rien
  // donnent tous deux `[7, 2]`. Seule une liste où les deux réponses DIVERGENT
  // départage — c'est-à-dire une liste déjà triée par identifiant croissant.
  //
  // Les deux assertions ci-dessous couvrent les deux sens, et il faut les deux :
  // la première attrape « on ne trie plus », la seconde attrape « on trie à
  // l'envers ».
  assert.deepEqual(
    rangerFil([
      message(7, '2026-09-23T10:00:00.000Z'),
      message(2, '2026-09-23T10:00:00.000Z'),
    ]).map((m) => m.id),
    [2, 7],
    'l’identifiant tranche, l’ordre d’arrivée ne décide pas'
  );
  assert.deepEqual(
    rangerFil([
      message(2, '2026-09-23T10:00:00.000Z'),
      message(7, '2026-09-23T10:00:00.000Z'),
    ]).map((m) => m.id),
    [2, 7],
    'une liste déjà rangée le reste : le tri ne la retourne pas'
  );

  // À trois éléments, tous à la même seconde, donnés à l'envers.
  assert.deepEqual(
    rangerFil([
      message(9, '2026-09-23T10:00:00.000Z'),
      message(6, '2026-09-23T10:00:00.000Z'),
      message(1, '2026-09-23T10:00:00.000Z'),
    ]).map((m) => m.id),
    [1, 6, 9]
  );

  // LE cas qui départage vraiment, et il a fallu le chercher.
  //
  // Les identifiants doivent être donnés DANS UN ORDRE OPPOSÉ à celui des
  // dates : le plus grand identifiant porte le message le PLUS ANCIEN. Un
  // comparateur qui ne regarderait que l'identifiant — la mutation — rend alors
  // `[1, 2, 3]`, tandis que le vrai comparateur rend `[3, 2, 1]`, rangé par
  // date. C'est la seule forme d'entrée où les deux réponses DIVERGENT.
  //
  // Vérifié en instrumentant un comparateur qui journalise, et non en le
  // supposant : les listes ci-dessus, toutes rangées par date croissante et
  // d'identifiants croissants, donnaient le même résultat dans les deux
  // versions — elles ne prouvaient donc rien, et un falsificateur l'a montré en
  // laissant la mutation non détectée.
  assert.deepEqual(
    rangerFil([
      message(3, '2026-09-23T08:00:00.000Z'), // le plus ancien, le plus grand id
      message(1, '2026-09-23T10:00:00.000Z'), // le plus récent, le plus petit id
      message(2, '2026-09-23T09:00:00.000Z'),
    ]).map((m) => m.id),
    [3, 2, 1],
    'l’ordre du fil est celui des dates, pas celui des identifiants'
  );
});

test('le tri ne modifie pas le tableau reçu', () => {
  const original = [message(2, '2026-09-23T10:00:00.000Z'), message(1, '2026-09-23T09:00:00.000Z')];
  const copie = [...original];
  rangerFil(original);
  assert.deepEqual(original, copie, 'un tri en place surprendrait l’appelant');
});

test('un fil vide se dit vide', () => {
  assert.equal(filVide([]), true);
  assert.equal(filVide([message(1, '2026-09-23T10:00:00.000Z')]), false);
});

test('les messages retirés ne comptent pas', () => {
  const fil = [
    message(1, '2026-09-23T08:00:00.000Z'),
    { ...message(2, '2026-09-23T09:00:00.000Z'), retire: true, corps: null },
    message(3, '2026-09-23T10:00:00.000Z'),
  ];
  assert.equal(compterMessages(fil), 2, 'un fil nettoyé ne doit pas paraître actif');
  assert.equal(resumerFil(fil), '2 messages');
  assert.equal(resumerFil([]), 'Aucun message');
  assert.equal(resumerFil([message(1, '2026-09-23T10:00:00.000Z')]), '1 message');
});

// === Les dates =============================================================

test('l’heure d’envoi se lit sans conversion de fuseau', () => {
  // Le projet a payé un décalage d'un jour dû à un passage en UTC : on lit les
  // champs de la chaîne, on ne construit pas de `Date`.
  assert.equal(formaterEnvoi('2026-09-23T14:32:11.000Z'), '23/09 à 14:32');
  assert.equal(formaterEnvoi('2026-01-05T09:05:00.000Z'), '05/01 à 09:05');
  assert.equal(formaterEnvoi(''), '', 'une chaîne vide ne donne pas de date');
  assert.equal(formaterEnvoi('2026-09-23'), '', 'une date seule ne donne pas d’heure');
});

test('le jour précédent suit le calendrier', () => {
  assert.equal(jourPrecedent('2026-09-23'), '2026-09-22');
  assert.equal(jourPrecedent('2026-09-01'), '2026-08-31', 'le mois précédent');
  assert.equal(jourPrecedent('2026-01-01'), '2025-12-31', 'l’année précédente');
  assert.equal(jourPrecedent('2026-03-01'), '2026-02-28', 'février d’une année ordinaire');
  assert.equal(jourPrecedent('2024-03-01'), '2024-02-29', 'février d’une année bissextile');
  assert.equal(jourPrecedent('2000-03-01'), '2000-02-29', '2000 est bissextile (÷400)');
  assert.equal(jourPrecedent('1900-03-01'), '1900-02-28', '1900 ne l’est pas (÷100)');
});

test('le séparateur de jour n’apparaît que quand le jour change', () => {
  const aujourd = '2026-09-23';
  const m1 = message(1, '2026-09-23T08:00:00.000Z');
  const m2 = message(2, '2026-09-23T09:00:00.000Z');
  const hier = message(3, '2026-09-22T09:00:00.000Z');
  const vieux = message(4, '2026-09-19T09:00:00.000Z');

  assert.equal(separateurDeJour(m1, null, aujourd), "Aujourd'hui");
  assert.equal(separateurDeJour(m2, m1, aujourd), null, 'même jour, pas de séparateur');
  assert.equal(separateurDeJour(hier, m1, aujourd), 'Hier');
  assert.equal(separateurDeJour(vieux, hier, aujourd), '19/09');
});

test('le séparateur se pose entre deux jours, jamais devant rien', () => {
  // Le premier message d'une journée porte l'étiquette ; le suivant non. C'est
  // ce qui fait qu'on lit une date sans la relire vingt fois.
  const aujourd = '2026-09-23';
  const premier = message(1, '2026-09-22T08:00:00.000Z');
  const second = message(2, '2026-09-22T20:00:00.000Z');
  assert.equal(separateurDeJour(premier, null, aujourd), 'Hier');
  assert.equal(separateurDeJour(second, premier, aujourd), null);
});

test('« Aujourd’hui » passe avant « Hier », et il faut le dire', () => {
  // L'ordre des deux comparaisons mérite d'être fixé, même s'il est aujourd'hui
  // SANS EFFET — et c'est précisément ce qui rend le test utile.
  //
  // Les deux conditions ne peuvent pas être vraies ensemble : `hier` est
  // `jourPrecedent(aujourdhui)`, donc postérieur d'un jour exactement. Aucune
  // date ne peut valoir à la fois `aujourdhui` et la veille. Permuter les deux
  // lignes ne change donc RIEN au comportement, et c'est ce qu'un falsificateur
  // a montré : la mutation « l'ordre des tests change » n'est pas détectable,
  // parce qu'elle est équivalente.
  //
  // Le test ci-dessous ne prétend donc pas détecter une permutation — aucun
  // test ne le peut. Il fixe ce que l'utilisateur lit, sur les trois cas qui
  // existent réellement.
  const jour = '2026-09-23';
  assert.equal(
    separateurDeJour(message(1, '2026-09-23T08:00:00.000Z'), null, jour),
    "Aujourd'hui",
    'le jour même se dit « Aujourd’hui », jamais « Hier »'
  );
  assert.equal(
    separateurDeJour(message(2, '2026-09-22T08:00:00.000Z'), null, jour),
    'Hier',
    'la veille se dit « Hier », pas « 22/09 »'
  );
  assert.equal(separateurDeJour(message(3, '2026-09-20T08:00:00.000Z'), null, jour), '20/09');

  // Et les trois formes ne se confondent pas : c'est cela qui compte à
  // l'écran, bien plus que l'ordre des deux lignes.
  assert.notEqual(
    separateurDeJour(message(1, '2026-09-23T08:00:00.000Z'), null, jour),
    separateurDeJour(message(2, '2026-09-22T08:00:00.000Z'), null, jour),
    'aujourd’hui et hier ne peuvent pas porter la même étiquette'
  );
});

// === Les messages d'erreur =================================================

test('un refus de modération est dit comme tel', () => {
  const message = messageErreurDiscussion('42501', 'Réservé à la modération.');
  assert.match(message, /modération/i, 'la phrase doit parler de la modération');
});

test('une réécriture refusée se distingue d’un refus de portée', () => {
  // Deux sens possibles pour le même code : c'est le seul cas où l'on regarde
  // le texte, et il faut donc qu'il distingue.
  const reecriture = messageErreurDiscussion('42501', 'Un message envoyé ne peut pas être réécrit.');
  assert.match(reecriture, /réécrit/i);

  const portee = messageErreurDiscussion('42501', 'new row violates row-level security policy');
  assert.match(portee, /amitié/i, 'un refus de politique parle de la relation');
});

test('une contrainte de longueur est traduite en clair', () => {
  const message = messageErreurDiscussion('23514', 'new row for relation "discussion_messages" violates check constraint');
  assert.match(message, /vide ou trop long/i);
});

test('un message inconnu n’est pas perdu', () => {
  assert.equal(messageErreurDiscussion(null, 'Panne réseau'), 'Panne réseau');
  assert.match(messageErreurDiscussion(null, '   '), /Réessayez/i, 'un vide garde une phrase utile');
});

// === La forme du module ====================================================

test('l’espace de discussion n’offre aucune prise pour un fichier', () => {
  // La garantie est de FORME : la table n'a aucune colonne pour un fichier, et
  // ce module ne doit pas en inventer une. On lit le source plutôt que de s'en
  // remettre à l'intention — un champ `fichier` ajouté plus tard casserait la
  // promesse sans qu'aucun test de comportement ne le voie.
  const source = readFileSync(
    fileURLToPath(new URL('../src/lib/sync/discussion.ts', import.meta.url)),
    'utf8'
  );
  const interdits = ['fichier', 'attachment', 'piece_jointe', 'imageUrl', 'videoUrl', 'base64'];
  for (const mot of interdits) {
    assert.equal(
      source.toLowerCase().includes(mot.toLowerCase()),
      false,
      `le module ne doit pas connaître « ${mot} » : l’espace est fait de mots`
    );
  }
});

test('le schéma ne porte aucune colonne pour une pièce jointe', () => {
  const schema = readFileSync(
    fileURLToPath(new URL('../supabase/discussions.sql', import.meta.url)),
    'utf8'
  );
  // On cherche les colonnes DÉCLARÉES dans la table, pas les mots du commentaire
  // qui explique justement cette absence.
  const table = schema.split('CREATE TABLE IF NOT EXISTS public.discussion_messages')[1] ?? '';
  const declaration = table.split(');')[0];
  for (const colonne of ['fichier', 'piece_jointe', 'image', 'video', 'url', 'octets', 'mime']) {
    assert.equal(
      new RegExp(`^\\s*${colonne}\\b`, 'm').test(declaration),
      false,
      `la colonne « ${colonne} » ne doit pas exister`
    );
  }
});

test('le champ de saisie ne laisse pas joindre un fichier', () => {
  const ecran = readFileSync(
    fileURLToPath(new URL('../app/discussion.tsx', import.meta.url)),
    'utf8'
  );
  for (const composant of [
    'ImagePicker',
    'DocumentPicker',
    'expo-image-picker',
    'expo-document-picker',
    'launchCamera',
    'launchImageLibrary',
  ]) {
    assert.equal(
      ecran.includes(composant),
      false,
      `l’écran ne doit pas importer « ${composant} »`
    );
  }
});

// === Les non-lus ============================================================
//
// Ce que ces épreuves gardent, et qui ne se voit pas à la lecture :
//
//   1. `non_lus` revient parfois en CHAÎNE. Un `COUNT(*)` traverse PostgREST en
//      texte, comme `id`. Une chaîne comparée à un nombre ne lève rien : elle
//      est simplement fausse. Et un `"2"` affiché tel quel passe encore — c'est
//      le genre de défaut qui ne se voit que sur un téléphone, chez quelqu'un
//      qui a trois messages non lus et qui en voit zéro.
//
//   2. La pastille rend `null` et non « 0 ». Un zéro affiché est un signe qui
//      ne dit rien et qui attire l'œil. `null` veut dire « rien à montrer »,
//      et c'est ce que l'écran teste.
//
//   3. Un fil jamais ouvert n'a AUCUNE ligne de lecture. Le compte vient donc
//      d'un `COALESCE(l.lu_le, '-infinity')` côté base — et si cette ligne
//      manquait, le fil entier serait compté comme lu, exactement l'inverse.

test('lireNonLus lit un compte rendu en nombre', () => {
  const lu = lireNonLus({ autre: 'ami-1', non_lus: 3, dernier_le: '2026-09-23T14:32:11Z' });
  assert.notEqual(lu, null);
  assert.equal(lu.autre, 'ami-1');
  assert.equal(lu.nonLus, 3);
  assert.equal(lu.dernierLe, '2026-09-23T14:32:11Z');
});

test('lireNonLus lit un compte rendu en CHAINE — le cas de PostgREST', () => {
  const lu = lireNonLus({ autre: 'ami-1', non_lus: '7' });
  assert.notEqual(lu, null);
  assert.equal(lu.nonLus, 7);
  assert.equal(typeof lu.nonLus, 'number');
});

test('lireNonLus refuse une ligne sans autre participant', () => {
  assert.equal(lireNonLus({ non_lus: 4 }), null);
  assert.equal(lireNonLus({ autre: '', non_lus: 4 }), null);
  assert.equal(lireNonLus({ autre: null, non_lus: 4 }), null);
});

test('lireNonLus refuse un compte qui n’est pas un nombre', () => {
  assert.equal(lireNonLus({ autre: 'ami-1', non_lus: 'beaucoup' }), null);
  assert.equal(lireNonLus({ autre: 'ami-1', non_lus: Number.NaN }), null);
});

test('lireNonLus ne rend jamais un compte negatif', () => {
  const lu = lireNonLus({ autre: 'ami-1', non_lus: -4 });
  assert.notEqual(lu, null);
  assert.equal(lu.nonLus, 0);
});

test('lireNonLus met a null une date trop courte pour etre lue', () => {
  assert.equal(lireNonLus({ autre: 'ami-1', non_lus: 1, dernier_le: '2026-09' }).dernierLe, null);
  assert.equal(lireNonLus({ autre: 'ami-1', non_lus: 1 }).dernierLe, null);
  assert.equal(lireNonLus({ autre: 'ami-1', non_lus: 1, dernier_le: null }).dernierLe, null);
});

test('indexerNonLus range chaque fil sous son participant', () => {
  const index = indexerNonLus([
    { autre: 'a', nonLus: 2, dernierLe: null },
    { autre: 'b', nonLus: 0, dernierLe: null },
  ]);
  assert.equal(Object.keys(index).length, 2);
  assert.equal(index.a.nonLus, 2);
  assert.equal(index.b.nonLus, 0);
});

test('totalDesNonLus additionne les fils', () => {
  assert.equal(
    totalDesNonLus([
      { autre: 'a', nonLus: 2, dernierLe: null },
      { autre: 'b', nonLus: 3, dernierLe: null },
    ]),
    5
  );
  assert.equal(totalDesNonLus([]), 0);
});

test('badgeNonLus ne montre rien plutot qu’un zero', () => {
  assert.equal(badgeNonLus(0), null);
  assert.equal(badgeNonLus(-2), null);
});

test('badgeNonLus compte jusqu’a neuf, puis abrege', () => {
  assert.equal(badgeNonLus(1), '1');
  assert.equal(badgeNonLus(9), '9');
  assert.equal(badgeNonLus(10), '9+');
  assert.equal(badgeNonLus(42), '9+');
});

test('formaterApercuDate dit l’heure pour aujourd’hui', () => {
  assert.equal(formaterApercuDate('2026-09-23T14:32:11Z', '2026-09-23'), '14:32');
});

test('formaterApercuDate dit Hier, et la date au-dela', () => {
  assert.equal(formaterApercuDate('2026-09-22T09:05:00Z', '2026-09-23'), 'Hier');
  assert.equal(formaterApercuDate('2026-09-05T09:05:00Z', '2026-09-23'), '05/09');
});

test('formaterApercuDate ne rend rien sans date', () => {
  assert.equal(formaterApercuDate(null, '2026-09-23'), '');
  assert.equal(formaterApercuDate('2026-09', '2026-09-23'), '');
});

test('formaterApercuDate passe correctement le 1er du mois', () => {
  // Le cas qui casse un « jour - 1 » naïf : le 1er septembre, hier est le
  // 31 août, et un calcul par soustraction rendrait le 0 septembre.
  assert.equal(formaterApercuDate('2026-08-31T20:00:00Z', '2026-09-01'), 'Hier');
});

// === L'aperçu des fils ======================================================

test('lireApercu lit une ligne de la base', () => {
  const apercu = lireApercu({
    autre: 'ami-1',
    dernier_le: '2026-09-23T14:32:11Z',
    apercu: 'Assalamu alaykum',
    de_moi: false,
  });
  assert.notEqual(apercu, null);
  assert.equal(apercu.autre, 'ami-1');
  assert.equal(apercu.apercu, 'Assalamu alaykum');
  assert.equal(apercu.deMoi, false);
});

test('lireApercu distingue un message retire d’un message vide', () => {
  // C'est toute l'information qu'une pierre tombale porte, et la seule chose
  // qui la distingue d'une ligne sans texte. La confondre avec une chaîne vide
  // ferait disparaître la mention « Message retiré » de la liste.
  const retire = lireApercu({ autre: 'ami-1', dernier_le: '2026-09-23T14:32:11Z', apercu: null });
  assert.notEqual(retire, null);
  assert.equal(retire.apercu, null);

  const vide = lireApercu({ autre: 'ami-1', dernier_le: '2026-09-23T14:32:11Z', apercu: '' });
  assert.notEqual(vide, null);
  assert.equal(vide.apercu, '');
});

test('lireApercu refuse une ligne sans autre participant', () => {
  assert.equal(lireApercu({ apercu: 'coucou' }), null);
  assert.equal(lireApercu({ autre: '', apercu: 'coucou' }), null);
});

test('lireApercu ne s’attribue pas le message d’un autre', () => {
  // `de_moi` absent vaut FAUX. Supposer le contraire ferait précéder d'un
  // « Vous : » le message reçu — une petite phrase fausse, mais fausse.
  const apercu = lireApercu({ autre: 'ami-1', apercu: 'coucou' });
  assert.equal(apercu.deMoi, false);
  assert.equal(apercuTexte(apercu), 'coucou');
});

test('apercuTexte dit ce qu’il y a à dire, et rien de plus', () => {
  assert.equal(apercuTexte(null), 'Aucun message');
  assert.equal(
    apercuTexte({ autre: 'a', dernierLe: null, apercu: null, deMoi: false }),
    'Message retiré'
  );
  assert.equal(
    apercuTexte({ autre: 'a', dernierLe: null, apercu: 'salam', deMoi: true }),
    'Vous : salam'
  );
});

test('apercuTexte ramene un message multiligne a une seule ligne', () => {
  // Un message écrit en trois paragraphes occuperait sinon trois lignes dans
  // une liste qui n'en prévoit qu'une, et la troncature se ferait au hasard.
  const texte = apercuTexte({
    autre: 'a',
    dernierLe: null,
    apercu: 'Bismillah\n\n  comment   avance\n ta mémorisation ?',
    deMoi: false,
  });
  assert.equal(texte, 'Bismillah comment avance ta mémorisation ?');
  assert.doesNotMatch(texte, /\n/);
});

test('indexerApercus range chaque apercu sous son fil', () => {
  const index = indexerApercus([
    { autre: 'a', dernierLe: null, apercu: 'un', deMoi: false },
    { autre: 'b', dernierLe: null, apercu: 'deux', deMoi: false },
  ]);
  assert.equal(Object.keys(index).length, 2);
  assert.equal(index.a.apercu, 'un');
  assert.equal(index.b.apercu, 'deux');
});

test('rangerConversations met les fils recents en tete', () => {
  const amis = [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }];
  const rangees = rangerConversations(
    amis,
    {
      a: { autre: 'a', dernierLe: '2026-09-20T10:00:00Z', apercu: 'un', deMoi: false },
      c: { autre: 'c', dernierLe: '2026-09-23T10:00:00Z', apercu: 'trois', deMoi: false },
    },
    {}
  );
  assert.deepEqual(rangees.map((r) => r.userId), ['c', 'a', 'b']);
});

test('rangerConversations laisse les amis sans fil a la fin, dans leur ordre', () => {
  // Un ami avec qui l'on n'a jamais parlé n'est pas une conversation : le
  // mettre en tête parce qu'il n'a pas de date serait le contraire de ce qu'on
  // cherche en ouvrant cet écran. Et l'ordre reçu est conservé — c'est la
  // stabilité du tri, et c'est `mes_amis` qui décide de cet ordre.
  const amis = [{ userId: 'z' }, { userId: 'y' }, { userId: 'x' }];
  const rangees = rangerConversations(amis, {}, {});
  assert.deepEqual(rangees.map((r) => r.userId), ['z', 'y', 'x']);
});

test('rangerConversations ne modifie pas la liste recue', () => {
  const amis = [{ userId: 'a' }, { userId: 'b' }];
  const rangees = rangerConversations(
    amis,
    { b: { autre: 'b', dernierLe: '2026-09-23T10:00:00Z', apercu: 'deux', deMoi: false } },
    {}
  );
  assert.deepEqual(amis.map((a) => a.userId), ['a', 'b']);
  assert.deepEqual(rangees.map((r) => r.userId), ['b', 'a']);
});

test('rangerConversations remonte un fil dont les non-lus n’ont pas d’apercu', () => {
  // Ce cas ne devrait pas exister — on ne peut pas avoir de message non lu
  // sans message. On le date tout de même : une pastille allumée sur une ligne
  // rangée en bas se chercherait.
  const rangees = rangerConversations(
    [{ userId: 'a' }, { userId: 'b' }],
    { b: { autre: 'b', dernierLe: '2026-09-23T10:00:00Z', apercu: 'deux', deMoi: false } },
    { a: { autre: 'a', nonLus: 3, dernierLe: '2026-09-24T09:00:00Z' } }
  );
  assert.deepEqual(rangees.map((r) => r.userId), ['a', 'b']);
});
