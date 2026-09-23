// Le lecteur audio : les décisions, éprouvées sans appareil.
//
// CE QU'ON ÉPROUVE ICI, ET POURQUOI
// ---------------------------------
// Quatre choses, et chacune parce qu'elle est **muette** quand elle est fausse :
//
//   1. **les adresses audio** — une adresse fausse ne lève pas, elle répond 404
//      et l'écran annonce une panne de réseau qui n'existe pas ;
//   2. **l'ordre des répétitions** — deux modes qui donneraient la même suite
//      passeraient inaperçus, et l'exercice de mémorisation deviendrait une
//      écoute suivie sans que personne ne s'en aperçoive ;
//   3. **les zones de surlignage** — un verset surligné sur la mauvaise ligne
//      ressemble à un verset surligné ;
//   4. **le verrou de séance** — sans lui, deux récitations se superposent, et
//      c'est exactement ce que la spécification interdit.
//
// LES VALEURS ATTENDUES NE SONT PAS DÉCORATIVES
// ---------------------------------------------
// Les numéros de versets employés — 1:1, 2:255, 8:3-8:5, 13:37, 13:38 — sont
// ceux dont l'adresse ou la géométrie a été **mesurée** : 2:255 est le 262e
// verset du Coran, et c'est bien `262.mp3` que la source annonce.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RECITATEURS,
  RECITATEUR_PAR_DEFAUT,
  recitateurParId,
  recitateurParDefaut,
  estIdRecitateur,
  urlAudioVerset,
  urlAudioVersetId,
} from '@/lib/audio/recitateurs';
import {
  REPETITION_MAX,
  REPETITION_PAR_DEFAUT,
  libelleCompteur,
  libelleNombre,
  libellePause,
  lireRepetition,
  nombreBorne,
  pauseBornee,
} from '@/lib/audio/repetitions';
import {
  aUnePauseApres,
  construirePlan,
  etapeA,
  indexDuVerset,
  indexPrecedent,
  indexSuivant,
  nombreDEtapes,
  planAncreSur,
} from '@/lib/audio/plan';
import { creerVerrou, estActive, fermerSeance, ouvrirSeance } from '@/lib/audio/verrou';
import {
  VITESSES,
  VITESSE_PAR_DEFAUT,
  estVitesse,
  etapeCourante,
  etatInitialLecture,
  libelleVitesse,
  reducerLecture,
  versetActif,
  vitesseBornee,
} from '@/lib/audio/etatLecture';
import { pageASuivre, pageDuVerset } from '@/lib/audio/suiviRecitation';
import { versetsDeLaPlage } from '@/lib/audio/plan';
import {
  LARGEUR_MESUREE,
  HAUTEUR_MESUREE,
  bandeDeLigne,
  nombreDeZones,
  pageDecrite,
  plageEntre,
  positionEnPourcent,
  versetTouche,
  versetsDeLaPage,
  zoneAvecMarge,
  zonesDuVerset,
} from '@/lib/zonesMoushaf';
import { getLignesDuMoushaf } from '@/data/quranData';

// === 1. Les récitateurs, et l'adresse de chaque verset ======================

test('la liste des récitateurs est utilisable telle quelle', () => {
  assert.ok(RECITATEURS.length >= 6, 'au moins les six récitateurs demandés');

  const ids = new Set();
  for (const r of RECITATEURS) {
    assert.ok(r.id.length > 0, 'un identifiant vide ne se relirait pas');
    assert.ok(!ids.has(r.id), `identifiant en double : ${r.id}`);
    ids.add(r.id);

    // Une adresse sans barre oblique finale fabriquerait `...alafasy262.mp3`.
    assert.ok(r.prefixe.startsWith('https://'), `${r.id} : adresse non chiffrée`);
    assert.ok(r.prefixe.endsWith('/'), `${r.id} : le préfixe doit finir par une barre`);
    // Le débit fait partie de l'adresse, et il change d'un récitateur à l'autre :
    // 192 pour Abdul Basit et As-Sudais, 64 pour Ash-Shuraym, 128 pour les autres.
    assert.match(r.prefixe, /\/audio\/(64|128|192)\//, `${r.id} : débit absent`);
    assert.ok(r.nom.length > 0 && r.nomArabe.length > 0, `${r.id} : nom incomplet`);
  }

  assert.ok(estIdRecitateur(RECITATEUR_PAR_DEFAUT), 'le défaut doit être dans la liste');
});

test('le récitateur par défaut est le premier de la liste', () => {
  assert.equal(recitateurParDefaut().id, RECITATEURS[0].id);
  assert.equal(RECITATEUR_PAR_DEFAUT, RECITATEURS[0].id);
});

test('Al-Ghamdi n’est pas proposé, parce que la source ne le sert pas par verset', () => {
  // Mesuré : l'édition `ar.saadalghamdi` existe, mais son champ `audio` est nul —
  // elle n'existe qu'au niveau de la sourate. Un récitateur proposé qui ne peut
  // pas jouer se lirait comme une panne de réseau. Le test fixe l'absence, pour
  // qu'un ajout distrait soit vu.
  assert.equal(
    RECITATEURS.some((r) => /ghamdi/i.test(r.id) || /ghamdi/i.test(r.nom) || /ghamdi/i.test(r.edition)),
    false
  );
});

test('un identifiant inconnu rend un récitateur qui joue, jamais undefined', () => {
  // Ce qui vient du disque n'est pas typé : une valeur d'une version antérieure
  // ne doit pas laisser l'écran sans récitateur.
  for (const valeur of [undefined, null, '', 'inconnu', 42, {}, []]) {
    assert.equal(recitateurParId(valeur).id, RECITATEURS[0].id, `valeur ${String(valeur)}`);
    assert.equal(estIdRecitateur(valeur), false);
  }
});

test('l’adresse d’un verset porte son identifiant global, et rien d’autre', () => {
  // 1:1 est le 1er verset, 2:255 le 262e : la source l'annonce elle-même, et
  // l'arithmétique de l'application (`startAyahId + ayah - 1`) donne le même.
  const alafasy = recitateurParId('alafasy');
  assert.equal(
    urlAudioVerset(alafasy, 1, 1),
    'https://cdn.islamic.network/quran/audio/128/ar.alafasy/1.mp3'
  );
  assert.equal(
    urlAudioVerset(alafasy, 2, 255),
    'https://cdn.islamic.network/quran/audio/128/ar.alafasy/262.mp3'
  );
  // Le débit du récitateur est celui de son préfixe, et pas une constante.
  assert.equal(
    urlAudioVerset(recitateurParId('abdulbasit'), 1, 1),
    'https://cdn.islamic.network/quran/audio/192/ar.abdulbasitmurattal/1.mp3'
  );
});

test('une adresse hors bornes est refusée plutôt que fabriquée', () => {
  const r = recitateurParDefaut();
  // 6237 n'existe pas : une adresse fabriquée répondrait 404, et l'écran
  // annoncerait une panne de réseau.
  assert.equal(urlAudioVersetId(r, 0), null);
  assert.equal(urlAudioVersetId(r, 6237), null);
  assert.equal(urlAudioVersetId(r, 1.5), null);
  assert.equal(urlAudioVersetId(r, NaN), null);
  assert.ok(urlAudioVersetId(r, 1) !== null);
  assert.ok(urlAudioVersetId(r, 6236) !== null);
});

test('un rang de verset hors de sa sourate est refusé', () => {
  // La sourate 29 compte 69 versets. Sans contrôle, le 70e lirait 30:1 — le
  // défaut qui a déjà vécu dans `getAyahText`, et qui ne se signale pas.
  const r = recitateurParDefaut();
  assert.ok(urlAudioVerset(r, 29, 69) !== null);
  assert.equal(urlAudioVerset(r, 29, 70), null);
  assert.equal(urlAudioVerset(r, 114, 7), null);
  assert.ok(urlAudioVerset(r, 114, 6) !== null);
  assert.equal(urlAudioVerset(r, 115, 1), null);
});

// === 2. Le réglage des répétitions ==========================================

test('le réglage relu du disque est toujours utilisable', () => {
  assert.deepEqual(lireRepetition(undefined), REPETITION_PAR_DEFAUT);
  assert.deepEqual(lireRepetition(null), REPETITION_PAR_DEFAUT);
  assert.deepEqual(lireRepetition('n’importe quoi'), REPETITION_PAR_DEFAUT);

  // Un champ cassé ne doit pas emporter les autres : un mode valide se garde.
  const partiel = lireRepetition({ mode: 'passage', nombre: 'trois', pauseSecondes: 7 });
  assert.equal(partiel.mode, 'passage');
  assert.equal(partiel.nombre, REPETITION_PAR_DEFAUT.nombre);
  assert.equal(partiel.pauseSecondes, REPETITION_PAR_DEFAUT.pauseSecondes);
});

test('l’infini est conservé, et n’est pas confondu avec un défaut', () => {
  // `null` veut dire « infini ». Le confondre avec « absent » ramènerait l'infini
  // à trois répétitions — un réglage qui se change tout seul.
  assert.equal(lireRepetition({ nombre: null }).nombre, null);
  assert.equal(nombreBorne(null), null);
  assert.equal(libelleNombre(null), 'Infini');
});

test('un nombre de répétitions est borné, jamais négatif ni démesuré', () => {
  assert.equal(nombreBorne(0), 1);
  assert.equal(nombreBorne(-5), 1);
  assert.equal(nombreBorne(3.4), 3);
  assert.equal(nombreBorne(999999), REPETITION_MAX);
  // Une valeur non finie est ramenée à la borne HAUTE, jamais à l'infini :
  // l'infini est un réglage que l'utilisateur pose, pas un accident.
  assert.equal(nombreBorne(Infinity), REPETITION_MAX);
  assert.equal(nombreBorne(NaN), REPETITION_MAX);
  assert.equal(nombreBorne(null), null, 'et l’infini déclaré se garde');
});

test('un réglage illisible retombe sur le défaut, et NE DEVIENT PAS l’infini', () => {
  // Le défaut que ce test existe pour attraper : `nombreBorne` rend `null` sur
  // tout ce qui n'est pas un nombre, et `null` veut dire « infini ». Une première
  // écriture passait donc la valeur du disque directement à `nombreBorne` : un
  // réglage corrompu devenait une récitation qui ne s'arrête plus.
  for (const corrompu of ['trois', {}, [], true, undefined, NaN, Infinity]) {
    const lu = lireRepetition({ mode: 'verset', nombre: corrompu, pauseSecondes: 2 });
    assert.notEqual(lu.nombre, null, `« ${String(corrompu)} » ne doit pas donner l’infini`);
    assert.equal(lu.nombre, REPETITION_PAR_DEFAUT.nombre);
  }
});

test('une pause inconnue retombe sur le défaut, et zéro est respecté', () => {
  assert.equal(pauseBornee(0), 0, 'zéro veut dire « enchaîner », et se garde');
  assert.equal(pauseBornee(5), 5);
  assert.equal(pauseBornee(7), REPETITION_PAR_DEFAUT.pauseSecondes);
  assert.equal(pauseBornee('2'), REPETITION_PAR_DEFAUT.pauseSecondes);
  assert.equal(libellePause(0), 'Sans pause');
  assert.equal(libellePause(2), '2 s');
});

test('le compteur annonce un total, sauf à l’infini', () => {
  assert.equal(libelleCompteur(2, 5), 'Répétition 2 sur 5');
  // « 3 sur ∞ » serait une phrase que personne ne lit comme un nombre.
  assert.equal(libelleCompteur(3, null), 'Répétition 3');
});

// === 3. L'ordre des répétitions =============================================

/** La suite des étapes, écrite « sourate:verset rN », pour la lire d'un coup. */
function suite(plan, combien) {
  const sortie = [];
  for (let i = 0; i < combien; i += 1) {
    const e = etapeA(plan, i);
    if (e === null) break;
    sortie.push(`${e.surah}:${e.ayah} r${e.repetition}`);
  }
  return sortie;
}

const PASSAGE = [
  { surah: 1, ayah: 1 },
  { surah: 1, ayah: 2 },
  { surah: 1, ayah: 3 },
];

test('en mode « verset », chaque verset est répété avant le suivant', () => {
  // C'est l'exercice de mémorisation : on tient un verset avant de passer.
  const plan = construirePlan(PASSAGE, { mode: 'verset', nombre: 2, pauseSecondes: 2 });
  assert.deepEqual(suite(plan, 6), [
    '1:1 r1',
    '1:1 r2',
    '1:2 r1',
    '1:2 r2',
    '1:3 r1',
    '1:3 r2',
  ]);
  assert.equal(nombreDEtapes(plan), 6);
});

test('en mode « passage », le passage entier est repris', () => {
  // C'est l'écoute suivie : le fil ne se rompt pas entre deux versets.
  const plan = construirePlan(PASSAGE, { mode: 'passage', nombre: 2, pauseSecondes: 2 });
  assert.deepEqual(suite(plan, 6), [
    '1:1 r1',
    '1:2 r1',
    '1:3 r1',
    '1:1 r2',
    '1:2 r2',
    '1:3 r2',
  ]);
  assert.equal(nombreDEtapes(plan), 6);
});

test('les deux modes comptent le même nombre d’étapes, et c’est l’ordre qui change', () => {
  // Si les deux modes divergeaient aussi en quantité, le compteur annoncerait
  // deux totaux différents pour le même réglage.
  for (const nombre of [1, 2, 3, 5, 10]) {
    const a = construirePlan(PASSAGE, { mode: 'verset', nombre, pauseSecondes: 0 });
    const b = construirePlan(PASSAGE, { mode: 'passage', nombre, pauseSecondes: 0 });
    assert.equal(nombreDEtapes(a), 3 * nombre);
    assert.equal(nombreDEtapes(b), 3 * nombre);
    // Mêmes étapes, dans un autre ordre : les ensembles sont égaux.
    assert.deepEqual(suite(a, 3 * nombre).sort(), suite(b, 3 * nombre).sort());
  }
});

test('la fin du plan est une fin, et non une étape vide', () => {
  const plan = construirePlan(PASSAGE, { mode: 'verset', nombre: 2, pauseSecondes: 0 });
  assert.ok(etapeA(plan, 5) !== null, 'la sixième étape existe');
  assert.equal(etapeA(plan, 6), null, 'la septième n’existe pas');
  assert.equal(indexSuivant(plan, 5), null, 'après la dernière, il n’y a rien');
  assert.equal(indexSuivant(plan, 4), 5);
});

test('« précédent » au tout début rejoue la première plutôt que de disparaître', () => {
  const plan = construirePlan(PASSAGE, { mode: 'verset', nombre: 2, pauseSecondes: 0 });
  assert.equal(indexPrecedent(plan, 0), 0);
  assert.equal(indexPrecedent(plan, 1), 0);
  assert.equal(indexPrecedent(plan, 5), 4);
});

test('un plan vide ne rend aucune étape, et ne lève pas', () => {
  // Un passage sans verset ne devrait pas arriver, mais un paramètre d'écran mal
  // lu peut le produire : on refuse de jouer, sans exception.
  for (const versets of [[], [{ surah: 0, ayah: 1 }], [{ surah: 115, ayah: 1 }]]) {
    const plan = construirePlan(versets, REPETITION_PAR_DEFAUT);
    assert.equal(etapeA(plan, 0), null);
    assert.equal(nombreDEtapes(plan), 0);
  }
});

test('à l’infini, il n’y a pas de dernière étape', () => {
  const plan = construirePlan(PASSAGE, { mode: 'passage', nombre: null, pauseSecondes: 0 });
  assert.equal(nombreDEtapes(plan), null);
  // Un index très grand rend encore une étape : c'est ce que « infini » veut dire.
  const loin = etapeA(plan, 100000);
  assert.ok(loin !== null);
  assert.equal(loin.totalRepetitions, null);
  assert.equal(loin.repetition, Math.floor(100000 / 3) + 1);
  assert.equal(loin.ayah, PASSAGE[100000 % 3].ayah);
});

test('à l’infini en mode « verset », le verset ancré se répète sans changer', () => {
  // C'est l'utilisateur qui fait avancer le verset, par « suivant ». Sans ancre,
  // le plan sauterait de verset en verset tout seul.
  const plan = construirePlan(PASSAGE, { mode: 'verset', nombre: null, pauseSecondes: 2 }, 1);
  assert.equal(etapeA(plan, 0).ayah, 2);
  assert.equal(etapeA(plan, 50).ayah, 2);
  assert.equal(etapeA(plan, 50).repetition, 51);
  assert.equal(etapeA(plan, 50).totalRepetitions, null);

  const ailleurs = planAncreSur(plan, 2);
  assert.equal(etapeA(ailleurs, 0).ayah, 3);
  assert.equal(planAncreSur(plan, 3), null, 'il n’y a pas de quatrième verset');
  assert.equal(planAncreSur(plan, -1), null);
});

test('la pause sépare les répétitions, et jamais deux versets d’un même passage', () => {
  // C'est la différence la plus facile à écrire faux : en mode « passage », une
  // pause entre deux versets hacherait le passage, et le fil serait perdu.
  const parVerset = construirePlan(PASSAGE, { mode: 'verset', nombre: 2, pauseSecondes: 2 });
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((i) => aUnePauseApres(parVerset, i)),
    [true, true, true, true, true, false],
    'en mode « verset », chaque étape est une répétition'
  );

  const parPassage = construirePlan(PASSAGE, { mode: 'passage', nombre: 2, pauseSecondes: 2 });
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((i) => aUnePauseApres(parPassage, i)),
    [false, false, true, false, false, false],
    'en mode « passage », la pause ne tombe qu’entre deux tours'
  );
});

test('sans pause réglée, il n’y a pas de pause', () => {
  for (const mode of ['verset', 'passage']) {
    const plan = construirePlan(PASSAGE, { mode, nombre: 3, pauseSecondes: 0 });
    for (let i = 0; i < 9; i += 1) {
      assert.equal(aUnePauseApres(plan, i), false, `${mode} étape ${i}`);
    }
  }
});

test('la pause qui suivrait la dernière étape n’existe pas', () => {
  // Une attente avant un arrêt se lit comme un blocage.
  const plan = construirePlan(PASSAGE, { mode: 'verset', nombre: 2, pauseSecondes: 5 });
  assert.equal(aUnePauseApres(plan, 5), false, 'la dernière étape n’est suivie de rien');
  assert.equal(aUnePauseApres(plan, 99), false, 'une étape qui n’existe pas non plus');
});

test('à l’infini, la pause continue de séparer les reprises', () => {
  const parVerset = construirePlan(PASSAGE, { mode: 'verset', nombre: null, pauseSecondes: 2 }, 0);
  assert.equal(aUnePauseApres(parVerset, 0), true);
  assert.equal(aUnePauseApres(parVerset, 1000), true);

  const parPassage = construirePlan(PASSAGE, { mode: 'passage', nombre: null, pauseSecondes: 2 });
  assert.equal(aUnePauseApres(parPassage, 2), true, 'fin du premier tour');
  assert.equal(aUnePauseApres(parPassage, 5), true, 'fin du deuxième');
  assert.equal(aUnePauseApres(parPassage, 1), false, 'au milieu d’un tour');
});

test('rejoindre un verset donne le rang de sa première répétition', () => {
  const parVerset = construirePlan(PASSAGE, { mode: 'verset', nombre: 3, pauseSecondes: 0 });
  assert.equal(indexDuVerset(parVerset, 1, 1), 0);
  assert.equal(indexDuVerset(parVerset, 1, 2), 3);
  assert.equal(indexDuVerset(parVerset, 1, 3), 6);
  assert.equal(indexDuVerset(parVerset, 2, 1), null, 'un verset hors du passage');

  const parPassage = construirePlan(PASSAGE, { mode: 'passage', nombre: 3, pauseSecondes: 0 });
  assert.equal(indexDuVerset(parPassage, 1, 3), 2);
});

test('le compteur suit le mode, et non un total unique', () => {
  // En mode « verset », le total est celui des répétitions du verset ; en mode
  // « passage », celui des tours. L'étape porte les deux, et le libellé les
  // distingue sans que l'utilisateur ait à le savoir.
  const parVerset = construirePlan(PASSAGE, { mode: 'verset', nombre: 3, pauseSecondes: 0 });
  assert.equal(libelleCompteur(etapeA(parVerset, 4).repetition, etapeA(parVerset, 4).totalRepetitions), 'Répétition 2 sur 3');

  const parPassage = construirePlan(PASSAGE, { mode: 'passage', nombre: 3, pauseSecondes: 0 });
  assert.equal(libelleCompteur(etapeA(parPassage, 4).repetition, etapeA(parPassage, 4).totalRepetitions), 'Répétition 2 sur 3');
});

// === 4. Le verrou de séance =================================================

test('ouvrir une séance invalide la précédente, immédiatement', () => {
  // Sans cela, une réponse en retard de l'ancienne séance ferait jouer un verset
  // par-dessus la nouvelle — deux voix en même temps.
  const verrou = creerVerrou();
  const a = ouvrirSeance(verrou);
  assert.equal(estActive(verrou, a), true);

  const b = ouvrirSeance(verrou);
  assert.notEqual(a, b, 'chaque séance a son jeton');
  assert.equal(estActive(verrou, a), false, 'la première est caduque');
  assert.equal(estActive(verrou, b), true);
});

test('fermer une séance rend toutes les réponses caduques', () => {
  const verrou = creerVerrou();
  const a = ouvrirSeance(verrou);
  fermerSeance(verrou);
  assert.equal(estActive(verrou, a), false);
  assert.equal(estActive(verrou, 0), false);
});

test('un jeton ne vaut jamais zéro, donc aucune séance n’est confondue avec aucune', () => {
  const verrou = creerVerrou();
  for (let i = 0; i < 5; i += 1) {
    assert.notEqual(ouvrirSeance(verrou), 0);
  }
  // Un verrou neuf n'accepte aucun jeton : c'est l'état « aucune séance ».
  assert.equal(estActive(creerVerrou(), 1), false);
  assert.equal(estActive(creerVerrou(), 0), false);
});

test('les jetons croissent toujours, et ne reviennent jamais en arrière', () => {
  // Un jeton réemployé rendrait active une réponse d'une séance passée.
  const verrou = creerVerrou();
  let precedent = 0;
  for (let i = 0; i < 20; i += 1) {
    const jeton = ouvrirSeance(verrou);
    assert.ok(jeton > precedent, `jeton ${jeton} après ${precedent}`);
    precedent = jeton;
  }
});

// === 5. Les zones de surlignage =============================================

test('le fichier de zones décrit les 604 pages et 6 236 versets', () => {
  assert.equal(LARGEUR_MESUREE, 1920);
  assert.equal(HAUTEUR_MESUREE, 3106);
  // 13 201 zones mesurées. Le compte est fixé ici pour qu'une régénération qui
  // en perdrait une se voie, plutôt que de laisser un verset sans surlignage.
  assert.equal(nombreDeZones(), 13201);
  assert.equal(pageDecrite(1), true);
  assert.equal(pageDecrite(604), true);
  assert.equal(pageDecrite(0), false);
  assert.equal(pageDecrite(605), false);
});

test('la zone d’un verset tombe sur la ligne que la mise en page lui donne', () => {
  // Relevé mesuré : sur la page 1, 1:1 est sur la ligne 2, et la bande de cette
  // ligne va de y=335 à y=453, sur une page haute de 3106.
  const zones = zonesDuVerset(1, 1, 1);
  assert.equal(zones.length, 1);
  assert.equal(zones[0].ligne, 2);
  assert.equal(zones[0].gauche, 765 / 1920);
  assert.equal(zones[0].droite, 1295 / 1920);
  assert.equal(zones[0].haut, 335 / 3106);
  assert.equal(zones[0].bas, 453 / 3106);
});

test('un verset qui s’étend sur plusieurs lignes rend une zone par ligne', () => {
  // 2:255, le verset du Trône, couvre six lignes de la page 42 — lignes 8 à 13.
  const zones = zonesDuVerset(42, 2, 255);
  assert.equal(zones.length, 6);
  assert.deepEqual(
    zones.map((z) => z.ligne),
    [8, 9, 10, 11, 12, 13]
  );
  // Les lignes sont croissantes : une bande posée deux fois doublerait l'opacité.
  for (let i = 1; i < zones.length; i += 1) {
    assert.ok(zones[i].ligne > zones[i - 1].ligne);
  }
});

test('toutes les zones tiennent dans la page', () => {
  // Une fraction hors de [0,1] poserait une bande hors du cadre, ou à l'envers.
  for (const page of [1, 2, 42, 177, 254, 454, 604]) {
    for (const verset of versetsDeLaPage(page)) {
      for (const z of zonesDuVerset(page, verset.surah, verset.ayah)) {
        assert.ok(z.gauche >= 0 && z.gauche < 1, `page ${page} gauche ${z.gauche}`);
        assert.ok(z.droite > 0 && z.droite <= 1, `page ${page} droite ${z.droite}`);
        assert.ok(z.gauche < z.droite, `page ${page} : zone vide ou à l’envers`);
        assert.ok(z.haut >= 0 && z.haut < z.bas && z.bas <= 1, `page ${page} bande ${z.haut}..${z.bas}`);
      }
    }
  }
});

test('la hauteur d’une zone est celle de sa ligne, et non celle du mot', () => {
  // Deux versets d'une même ligne doivent avoir la MÊME bande verticale : sinon
  // les bandes clignoteraient d'un verset à l'autre, et la géométrie bougerait
  // au lieu de rester un repère.
  const zones = versetsDeLaPage(177);
  const parLigne = new Map();
  for (const v of zones) {
    for (const z of zonesDuVerset(177, v.surah, v.ayah)) {
      const connu = parLigne.get(z.ligne);
      if (connu === undefined) parLigne.set(z.ligne, z);
      else {
        assert.equal(z.haut, connu.haut, `ligne ${z.ligne} : haut différent`);
        assert.equal(z.bas, connu.bas, `ligne ${z.ligne} : bas différent`);
      }
    }
  }
  assert.ok(parLigne.size > 0);
});

test('les zones s’accordent avec la mise en page déjà vérifiée, verset par verset', () => {
  // LE contrôle qui compte : les zones viennent de la table `glyphs`, la mise en
  // page de l'API quran.com. Deux sources indépendantes. Elles s'accordent sur
  // 6 235 versets sur 6 236 — et l'écart unique, 38:24 page 454, est celui que
  // `docs/mise-en-page-moushaf.md` nommait déjà.
  const ecarts = [];
  let compares = 0;

  for (let page = 1; page <= 604; page += 1) {
    const lignes = getLignesDuMoushaf(page);
    if (lignes === null) continue;

    const attendues = new Map();
    lignes.forEach((ligne, i) => {
      for (const element of ligne) {
        if (element.type !== 'verset') continue;
        const cle = `${element.surah}:${element.ayah}`;
        if (!attendues.has(cle)) attendues.set(cle, new Set());
        attendues.get(cle).add(i + 1);
      }
    });

    for (const [cle, lignesAttendues] of attendues) {
      const [surah, ayah] = cle.split(':').map(Number);
      const vues = zonesDuVerset(page, surah, ayah).map((z) => z.ligne);
      if (vues.length === 0) continue;
      compares += 1;
      if (cle === '38:24') continue;
      assert.deepEqual(
        vues,
        [...lignesAttendues].sort((a, b) => a - b),
        `page ${page}, ${cle}`
      );
      ecarts.push(cle);
    }
  }

  assert.ok(compares > 6000, `trop peu de versets comparés : ${compares}`);
  assert.equal(ecarts.includes('38:24'), false, 'l’écart connu est écarté du contrôle');
});

test('un verset absent de la page ne rend aucune zone, sans lever', () => {
  assert.deepEqual(zonesDuVerset(1, 8, 3), []);
  assert.deepEqual(zonesDuVerset(0, 1, 1), []);
  assert.deepEqual(zonesDuVerset(605, 1, 1), []);
  assert.deepEqual(zonesDuVerset(1, 1, 99), []);
});

test('les versets d’une page sont rendus dans l’ordre de lecture', () => {
  // Page 1 : les sept versets d'Al-Fatiha, dans l'ordre.
  assert.deepEqual(
    versetsDeLaPage(1).map((v) => `${v.surah}:${v.ayah}`),
    ['1:1', '1:2', '1:3', '1:4', '1:5', '1:6', '1:7']
  );

  // Page 254 : elle porte la fin de 13:37 puis 13:38 — l'ordre du moushaf, qui
  // n'est pas l'ordre des abscisses.
  const page254 = versetsDeLaPage(254).map((v) => `${v.surah}:${v.ayah}`);
  assert.ok(page254.indexOf('13:37') < page254.indexOf('13:38'), '13:37 avant 13:38');

  // Et sur toute page, aucun verset compté deux fois.
  for (const page of [2, 42, 177, 254, 454, 604]) {
    const cles = versetsDeLaPage(page).map((v) => `${v.surah}:${v.ayah}`);
    assert.equal(new Set(cles).size, cles.length, `page ${page} : verset en double`);
  }
});

test('une marge élargit la zone sans la faire sortir de la page', () => {
  const zone = { ligne: 3, gauche: 0.4, droite: 0.6, haut: 0.2, bas: 0.3 };
  const large = zoneAvecMarge(zone, 0.01, 0.005);
  assert.equal(large.gauche, 0.39);
  assert.equal(large.droite, 0.61);
  assert.equal(large.haut, 0.195);
  assert.equal(large.bas, 0.305);
  assert.equal(large.ligne, 3, 'la ligne ne change pas');

  // Aux bords, la marge est rognée : une bande ne déborde pas de son cadre.
  const bord = zoneAvecMarge({ ligne: 1, gauche: 0.005, droite: 0.995, haut: 0.002, bas: 0.998 }, 0.05, 0.05);
  assert.equal(bord.gauche, 0);
  assert.equal(bord.droite, 1);
  assert.equal(bord.haut, 0);
  assert.equal(bord.bas, 1);
});

test('la bande d’une ligne se lit seule, et vaut null pour une ligne vide', () => {
  // La ligne 1 de la page 1 ne porte aucun verset : c'est le bandeau d'ouverture.
  assert.equal(bandeDeLigne(1, 1), null);
  assert.deepEqual(bandeDeLigne(1, 2), { haut: 335 / 3106, bas: 453 / 3106 });
  assert.equal(bandeDeLigne(1, 16), null);
  assert.equal(bandeDeLigne(0, 1), null);
});

test('les zones et la mise en page comptent les mêmes versets', () => {
  // Un verset décrit par la mise en page mais sans zone serait un verset qu'on
  // ne pourrait jamais surligner pendant la récitation — et rien ne le dirait.
  let manquants = 0;
  for (let page = 1; page <= 604; page += 1) {
    const lignes = getLignesDuMoushaf(page);
    if (lignes === null) continue;
    const vus = new Set();
    for (const ligne of lignes) {
      for (const element of ligne) {
        if (element.type !== 'verset') continue;
        const cle = `${element.surah}:${element.ayah}`;
        if (vus.has(cle)) continue;
        vus.add(cle);
        if (zonesDuVerset(page, element.surah, element.ayah).length === 0) manquants += 1;
      }
    }
  }
  assert.equal(manquants, 0, `${manquants} versets sans zone`);
});

// === 6. Les gestes de l'utilisateur =========================================

/** L'état de départ, avec un récitateur connu. */
function etatNeuf() {
  return etatInitialLecture(RECITATEUR_PAR_DEFAUT);
}

/** Une séance ouverte sur le passage de trois versets. */
function seanceOuverte(repetition = { mode: 'verset', nombre: 2, pauseSecondes: 2 }) {
  return reducerLecture(etatNeuf(), { type: 'ouvrir', versets: PASSAGE, repetition });
}

/** L'état au repos après avoir joué la première étape. */
function enLecture(repetition) {
  return reducerLecture(seanceOuverte(repetition), { type: 'pretAJouer' });
}

test('ouvrir prépare la première étape, et ne joue rien encore', () => {
  const etat = seanceOuverte();
  assert.equal(etat.statut, 'chargement', 'le fichier doit d’abord arriver');
  assert.equal(etat.index, 0);
  assert.equal(etapeCourante(etat).ayah, 1);
  assert.equal(etat.erreur, null);
});

test('ouvrir un passage vide s’arrête, sans lever', () => {
  // Un paramètre d'écran mal lu peut produire une plage vide. On refuse de
  // jouer, et on le dit par l'état — pas par une exception.
  const etat = reducerLecture(etatNeuf(), {
    type: 'ouvrir',
    versets: [],
    repetition: REPETITION_PAR_DEFAUT,
  });
  assert.equal(etat.statut, 'arret');
  assert.equal(etat.plan, null);
  assert.equal(etapeCourante(etat), null);
});

test('« prêt à jouer » n’a d’effet que pendant un chargement', () => {
  // C'est la garde qui empêche une réponse de chargement, arrivée après un
  // arrêt, de relancer la lecture : le verrou de séance, côté état.
  const arrete = reducerLecture(seanceOuverte(), { type: 'arreter' });
  assert.equal(reducerLecture(arrete, { type: 'pretAJouer' }).statut, 'arret');

  const enPause = reducerLecture(enLecture(), { type: 'pause' });
  assert.equal(reducerLecture(enPause, { type: 'pretAJouer' }).statut, 'pause');
});

test('la pause suspend, et la reprise relance', () => {
  const etat = enLecture();
  assert.equal(etat.statut, 'lecture');

  const enPause = reducerLecture(etat, { type: 'pause' });
  assert.equal(enPause.statut, 'pause');
  assert.equal(enPause.index, 0, 'la position est gardée');

  assert.equal(reducerLecture(enPause, { type: 'reprendre' }).statut, 'chargement');
});

test('la pause n’a pas d’effet sur une séance arrêtée', () => {
  // Sans cette garde, appuyer sur pause après un arrêt ferait passer à « pause »
  // un lecteur qui ne joue rien, et le bouton de reprise deviendrait le seul
  // moyen d'en sortir.
  assert.equal(reducerLecture(etatNeuf(), { type: 'pause' }).statut, 'arret');
});

test('arrêter vide la séance, et rend la place', () => {
  const etat = reducerLecture(enLecture(), { type: 'arreter' });
  assert.equal(etat.statut, 'arret');
  assert.equal(etat.plan, null);
  assert.equal(etat.index, 0);
  assert.equal(etat.erreur, null);
});

test('« suivant » à la dernière étape est l’auto-stop', () => {
  const repetition = { mode: 'verset', nombre: 2, pauseSecondes: 0 };
  let etat = seanceOuverte(repetition);
  // Six étapes : on avance cinq fois, et la sixième fois est la fin.
  for (let i = 0; i < 5; i += 1) etat = reducerLecture(etat, { type: 'suivante' });
  assert.equal(etat.statut, 'chargement');
  assert.equal(etat.index, 5);
  assert.equal(etapeCourante(etat).ayah, 3);

  const fini = reducerLecture(etat, { type: 'suivante' });
  assert.equal(fini.statut, 'arret', 'il n’y a plus rien à jouer');
  assert.equal(fini.index, 0);
});

test('« précédent » au tout début rejoue la première plutôt que de sortir', () => {
  const etat = reducerLecture(enLecture(), { type: 'precedente' });
  assert.equal(etat.index, 0);
  assert.equal(etat.statut, 'chargement', 'elle est rejouée depuis son début');
});

test('« recommencer » garde l’étape et la rejoue', () => {
  const etat = reducerLecture(enLecture(), { type: 'suivante' });
  assert.equal(etat.index, 1);
  const rejoue = reducerLecture(etat, { type: 'recommencer' });
  assert.equal(rejoue.index, 1, 'la place est gardée');
  assert.equal(rejoue.statut, 'chargement');
});

test('la fin d’une piste enchaîne, attend, ou s’arrête — selon le réglage', () => {
  // Sans pause : on enchaîne directement sur l'étape suivante.
  const sansPause = reducerLecture(enLecture({ mode: 'verset', nombre: 2, pauseSecondes: 0 }), {
    type: 'finDePiste',
  });
  assert.equal(sansPause.statut, 'chargement');
  assert.equal(sansPause.index, 1);

  // Avec pause en mode « verset » : chaque étape est une répétition, donc une
  // attente suit chacune.
  const avecPause = reducerLecture(enLecture({ mode: 'verset', nombre: 2, pauseSecondes: 5 }), {
    type: 'finDePiste',
  });
  assert.equal(avecPause.statut, 'attente');

  // Avec pause en mode « passage » : au milieu d'un tour, on enchaîne.
  const milieuDeTour = reducerLecture(
    enLecture({ mode: 'passage', nombre: 2, pauseSecondes: 5 }),
    { type: 'finDePiste' }
  );
  assert.equal(milieuDeTour.statut, 'chargement', 'deux versets d’un tour ne se séparent pas');
  assert.equal(milieuDeTour.index, 1);
});

test('la fin de la DERNIÈRE piste arrête, même avec une pause réglée', () => {
  // Une attente avant un arrêt se lit comme un blocage.
  const repetition = { mode: 'verset', nombre: 2, pauseSecondes: 5 };
  let etat = seanceOuverte(repetition);
  for (let i = 0; i < 5; i += 1) {
    etat = reducerLecture(etat, { type: 'finDePiste' });
    if (etat.statut === 'attente') etat = reducerLecture(etat, { type: 'finDAttente' });
  }
  assert.equal(etat.index, 5);
  assert.equal(reducerLecture(etat, { type: 'finDePiste' }).statut, 'arret');
});

test('l’attente se termine par l’étape suivante, ou par l’arrêt', () => {
  const etat = reducerLecture(enLecture({ mode: 'verset', nombre: 2, pauseSecondes: 5 }), {
    type: 'finDePiste',
  });
  assert.equal(etat.statut, 'attente');

  const apres = reducerLecture(etat, { type: 'finDAttente' });
  assert.equal(apres.statut, 'chargement');
  assert.equal(apres.index, 1);

  // Une attente terminée alors qu'on n'attendait pas ne fait rien.
  assert.equal(reducerLecture(enLecture(), { type: 'finDAttente' }).index, 0);
});

test('reprendre pendant l’attente n’attend pas la fin de la pause', () => {
  // L'utilisateur a appuyé sur lecture : subir la fin de la pause serait une
  // attente qu'il n'a pas demandée.
  const etat = reducerLecture(enLecture({ mode: 'verset', nombre: 2, pauseSecondes: 10 }), {
    type: 'finDePiste',
  });
  assert.equal(etat.statut, 'attente');
  assert.equal(reducerLecture(etat, { type: 'reprendre' }).statut, 'chargement');
});

test('changer de récitateur arrête le fichier en cours et rejoue l’étape', () => {
  // La spécification interdit de mélanger deux récitations dans une même
  // écoute : le fichier en cours est arrêté, et l'étape rejouée avec le nouveau.
  const etat = reducerLecture(enLecture(), { type: 'changerRecitateur', id: 'husary' });
  assert.equal(etat.recitateurId, 'husary');
  assert.equal(etat.statut, 'chargement', 'l’étape est rechargée');
  assert.equal(etat.index, 0, 'et la place est gardée');
});

test('changer de récitateur hors séance n’ouvre rien', () => {
  const etat = reducerLecture(etatNeuf(), { type: 'changerRecitateur', id: 'husary' });
  assert.equal(etat.recitateurId, 'husary');
  assert.equal(etat.statut, 'arret', 'le choix est enregistré, et rien de plus');
  assert.equal(etat.plan, null);
});

test('changer de mode garde le VERSET, et non le rang de l’étape', () => {
  // Changer de mode réordonne la séquence : garder l'index ferait écouter un
  // autre verset sans que rien ne le dise. On garde donc le verset.
  const repetition = { mode: 'verset', nombre: 3, pauseSecondes: 0 };
  let etat = seanceOuverte(repetition);
  etat = reducerLecture(etat, { type: 'suivante' }); // étape 1 : 1:1 r2
  etat = reducerLecture(etat, { type: 'suivante' }); // étape 2 : 1:1 r3
  etat = reducerLecture(etat, { type: 'suivante' }); // étape 3 : 1:2 r1
  assert.equal(etapeCourante(etat).ayah, 2);

  const bascule = reducerLecture(etat, {
    type: 'changerRepetition',
    repetition: { mode: 'passage', nombre: 3, pauseSecondes: 0 },
  });
  assert.equal(etapeCourante(bascule).ayah, 2, 'le même verset est conservé');
  assert.equal(bascule.statut, 'chargement');
});

test('changer de mode sans séance ouverte n’invente pas de plan', () => {
  const etat = reducerLecture(etatNeuf(), {
    type: 'changerRepetition',
    repetition: { mode: 'passage', nombre: 2, pauseSecondes: 0 },
  });
  assert.equal(etat.plan, null);
  assert.equal(etat.statut, 'arret');
});

test('la vitesse ne prend que les valeurs offertes', () => {
  assert.deepEqual([...VITESSES], [0.75, 1, 1.25]);
  assert.equal(vitesseBornee(0.75), 0.75);
  assert.equal(vitesseBornee(1.25), 1.25);
  for (const mauvaise of [0, 2, 1.0001, '1', null, undefined, NaN]) {
    assert.equal(vitesseBornee(mauvaise), VITESSE_PAR_DEFAUT, `valeur ${String(mauvaise)}`);
    // Le prédicat et le repli ne disent PAS la même chose, et c'est voulu :
    // `vitesseBornee` accepte de retomber sur 1× pour lire un réglage, tandis
    // qu'un geste refusé ne doit rien changer.
    assert.equal(estVitesse(mauvaise), false, `valeur ${String(mauvaise)}`);
  }
  assert.equal(estVitesse(0.75), true);
  assert.equal(estVitesse(1), true);
  assert.equal(libelleVitesse(0.75), '0.75×');
  assert.equal(libelleVitesse(1), '1×');

  const etat = reducerLecture(enLecture(), { type: 'changerVitesse', vitesse: 0.75 });
  assert.equal(etat.vitesse, 0.75);
  // Une vitesse refusée ne doit pas écraser celle qui joue : sans cette garde,
  // demander une vitesse non offerte RAMÈNERAIT la lecture à 1×, donc
  // l'accélérerait — l'inverse de ce que l'utilisateur a demandé.
  assert.equal(reducerLecture(etat, { type: 'changerVitesse', vitesse: 3 }).vitesse, 0.75);
  assert.equal(reducerLecture(etat, { type: 'changerVitesse', vitesse: '0.75' }).vitesse, 0.75);
});

test('le suivi automatique se bascule, et rien d’autre ne le change', () => {
  const etat = enLecture();
  assert.equal(etat.suiviAuto, true, 'le suivi est actif par défaut');
  const coupe = reducerLecture(etat, { type: 'basculerSuivi' });
  assert.equal(coupe.suiviAuto, false);
  assert.equal(reducerLecture(coupe, { type: 'suivante' }).suiviAuto, false, 'il survit à l’avance');
  assert.equal(reducerLecture(coupe, { type: 'basculerSuivi' }).suiviAuto, true);
});

test('rejoindre un verset du passage y place la lecture', () => {
  const etat = reducerLecture(seanceOuverte({ mode: 'verset', nombre: 3, pauseSecondes: 0 }), {
    type: 'rejoindre',
    surah: 1,
    ayah: 2,
  });
  assert.equal(etat.statut, 'chargement');
  assert.equal(etapeCourante(etat).ayah, 2);
  assert.equal(etat.index, 3, 'la première répétition de ce verset');

  // Un verset qui n'est pas au passage ne déplace rien.
  const dehors = reducerLecture(etat, { type: 'rejoindre', surah: 2, ayah: 1 });
  assert.equal(dehors.index, etat.index);
});

test('une panne garde la place, pour qu’on puisse réessayer', () => {
  // Sans cela, une coupure de réseau ferait perdre sa place à l'utilisateur, et
  // il n'aurait plus aucun moyen de reprendre où il en était.
  const etat = reducerLecture(enLecture(), { type: 'echec', message: 'réseau indisponible' });
  assert.equal(etat.statut, 'erreur');
  assert.equal(etat.erreur, 'réseau indisponible');
  assert.equal(etat.index, 0, 'la place est gardée');

  // Réessayer relance la même étape.
  assert.equal(reducerLecture(etat, { type: 'recommencer' }).statut, 'chargement');
});

test('à l’infini en mode « verset », « suivant » déplace le VERSET, pas l’étape', () => {
  // Sans ce cas, « suivant » ne ferait rien : à l'infini, il n'y a pas d'étape
  // suivante — c'est l'ancre qu'il faut déplacer.
  const etat = seanceOuverte({ mode: 'verset', nombre: null, pauseSecondes: 2 });
  assert.equal(etapeCourante(etat).ayah, 1);
  assert.equal(etapeCourante(etat).totalRepetitions, null);

  const suivant = reducerLecture(etat, { type: 'suivante' });
  assert.equal(etapeCourante(suivant).ayah, 2, 'le verset a changé');
  assert.equal(suivant.index, 0, 'et la répétition repart à un');

  const avant = reducerLecture(suivant, { type: 'precedente' });
  assert.equal(etapeCourante(avant).ayah, 1);

  // Après le dernier verset du passage, la séance s'arrête.
  const dernier = reducerLecture(suivant, { type: 'suivante' });
  assert.equal(etapeCourante(dernier).ayah, 3);
  assert.equal(reducerLecture(dernier, { type: 'suivante' }).statut, 'arret');
});

test('à l’infini, la fin d’une piste ne termine jamais la séance', () => {
  // En mode « verset », le verset ancré se répète : la piste qui se termine est
  // une répétition de plus, pas la fin de quoi que ce soit.
  const avecPause = reducerLecture(
    enLecture({ mode: 'verset', nombre: null, pauseSecondes: 2 }),
    { type: 'finDePiste' }
  );
  assert.equal(avecPause.statut, 'attente');
  assert.equal(reducerLecture(avecPause, { type: 'finDAttente' }).statut, 'chargement');

  const sansPause = reducerLecture(
    enLecture({ mode: 'verset', nombre: null, pauseSecondes: 0 }),
    { type: 'finDePiste' }
  );
  assert.equal(sansPause.statut, 'chargement', 'on reprend la répétition');

  // En mode « passage », chaque tour complet se sépare du suivant.
  const parPassage = reducerLecture(
    enLecture({ mode: 'passage', nombre: null, pauseSecondes: 2 }),
    { type: 'finDePiste' }
  );
  assert.equal(parPassage.statut, 'chargement', 'au milieu d’un tour, on enchaîne');
});

test('aucune action ne lève sur un état vide', () => {
  // L'écran peut émettre n'importe quel geste avant qu'une séance soit ouverte.
  const actions = [
    { type: 'pause' },
    { type: 'reprendre' },
    { type: 'suivante' },
    { type: 'precedente' },
    { type: 'recommencer' },
    { type: 'finDePiste' },
    { type: 'finDAttente' },
    { type: 'pretAJouer' },
    { type: 'basculerSuivi' },
    { type: 'arreter' },
    { type: 'rejoindre', surah: 1, ayah: 1 },
  ];
  let etat = etatNeuf();
  for (const action of actions) {
    etat = reducerLecture(etat, action);
    assert.equal(etat.statut, 'arret', `action ${action.type}`);
    assert.equal(etat.plan, null, `action ${action.type}`);
  }
});

// === 7. Le suivi de la récitation ==========================================

test('le verset actif suit l’étape, et disparaît à l’arrêt', () => {
  // C'est la source unique du surlignage : s'il ne suivait pas l'étape, la
  // bande resterait sur le premier verset pendant toute la récitation.
  assert.equal(versetActif(etatNeuf()), null, 'rien ne joue, rien n’est surligné');

  // En mode « passage », une étape fait avancer d'un verset : le surlignage
  // doit donc avancer à chaque étape.
  const parPassage = seanceOuverte({ mode: 'passage', nombre: 2, pauseSecondes: 0 });
  assert.deepEqual(versetActif(parPassage), { surah: 1, ayah: 1 }, 'dès le chargement');

  const jouee = reducerLecture(parPassage, { type: 'pretAJouer' });
  assert.deepEqual(versetActif(jouee), { surah: 1, ayah: 1 });
  assert.deepEqual(
    versetActif(reducerLecture(jouee, { type: 'suivante' })),
    { surah: 1, ayah: 2 },
    'il avance'
  );
  assert.equal(versetActif(reducerLecture(jouee, { type: 'arreter' })), null);
});

test('en mode « verset », la bande ne quitte pas le verset qu’on répète', () => {
  // §6D. C'est le cas qu'un minuteur approximatif raterait : en mode
  // « verset », chaque étape est une RÉPÉTITION du même verset, donc la bande
  // doit rester dessus. Si elle avançait à chaque étape, elle désignerait le
  // verset suivant pendant qu'on écoute encore le précédent — et l'apprenant
  // mémoriserait en regardant le mauvais.
  const parVerset = seanceOuverte({ mode: 'verset', nombre: 3, pauseSecondes: 0 });
  const attendu = { surah: 1, ayah: 1 };

  let etat = reducerLecture(parVerset, { type: 'pretAJouer' });
  assert.deepEqual(versetActif(etat), attendu);

  for (let repetition = 2; repetition <= 3; repetition += 1) {
    etat = reducerLecture(etat, { type: 'suivante' });
    assert.deepEqual(versetActif(etat), attendu, `répétition ${repetition}`);
  }

  // La quatrième étape est le verset suivant : là, la bande doit bouger.
  assert.deepEqual(
    versetActif(reducerLecture(etat, { type: 'suivante' })),
    { surah: 1, ayah: 2 }
  );
});

test('le verset actif ne bouge ni à la pause, ni pendant l’attente', () => {
  // Un surlignage qui changerait pendant une pause ferait croire à une
  // récitation qui continue alors que le son est arrêté.
  const jouee = enLecture({ mode: 'verset', nombre: 2, pauseSecondes: 5 });
  const attendu = versetActif(jouee);

  assert.deepEqual(versetActif(reducerLecture(jouee, { type: 'pause' })), attendu);
  assert.deepEqual(
    versetActif(reducerLecture(jouee, { type: 'finDePiste' })),
    attendu,
    'l’attente porte encore le verset qu’on vient d’entendre'
  );
});

test('le verset actif survit à une panne, pour qu’on puisse réessayer', () => {
  // Le lecteur garde la place pour permettre de réessayer ; le surlignage doit
  // la garder aussi, sans quoi l'écran dirait qu'on a perdu sa place alors que
  // le bouton la rejoue.
  const jouee = enLecture();
  const enPanne = reducerLecture(jouee, { type: 'echec', message: 'réseau' });
  assert.deepEqual(versetActif(enPanne), versetActif(jouee));
});

test('après l’auto-stop, la bande disparaît — alors que le plan, lui, reste', () => {
  // LE PIÈGE QUE CE TEST GARDE, ET QU'UN FALSIFICATEUR A TROUVÉ
  // ----------------------------------------------------------
  // Tous les chemins d'arrêt ne vident pas le plan. `arreter` le met à `null`,
  // mais l'auto-stop — la fin de la dernière étape — le CONSERVE et ramène
  // l'index à zéro. Dans cet état, `etapeCourante` rend donc le PREMIER verset
  // du passage.
  //
  // Sans la garde sur le statut, `versetActif` rendrait ce premier verset : la
  // bande de surlignage sauterait du dernier verset au premier au moment précis
  // où la séance se termine, et l'apprenant croirait qu'elle recommence. Le plan
  // reste en place pour une bonne raison — changer de répétition après coup
  // n'exige pas de le reconstruire —, donc la garde sur le statut n'est pas
  // redondante : elle est le seul rempart.
  let etat = reducerLecture(etatNeuf(), {
    type: 'ouvrir',
    versets: PASSAGE,
    repetition: { mode: 'verset', nombre: 1, pauseSecondes: 0 },
  });
  etat = reducerLecture(etat, { type: 'pretAJouer' });
  assert.equal(versetActif(etat).ayah, 1);

  // Trois versets, une répétition chacun : trois fins de piste.
  for (let i = 0; i < 3; i += 1) etat = reducerLecture(etat, { type: 'finDePiste' });

  assert.equal(etat.statut, 'arret', 'la séance est terminée');
  assert.notEqual(etat.plan, null, 'et le plan est resté — c’est ce qui rend le piège réel');
  assert.equal(etapeCourante(etat).ayah, 1, 'l’étape courante désigne bien le premier verset');
  assert.equal(versetActif(etat), null, 'mais rien ne doit être surligné');
});

test('la page d’un verset est celle où il est imprimé', () => {
  // Ces pages sont celles du moushaf madani, et elles sont vérifiables de
  // l'extérieur : 2:255 est page 42, Ya-Sin commence page 440, la sourate 112
  // est page 604. Si la table des pages se décalait, le suivi emmènerait
  // l'utilisateur sur une page qui ne porte pas le verset récité.
  assert.equal(pageDuVerset(1, 1), 1);
  assert.equal(pageDuVerset(2, 255), 42);
  assert.equal(pageDuVerset(18, 1), 293);
  assert.equal(pageDuVerset(36, 1), 440);
  assert.equal(pageDuVerset(112, 1), 604);
});

test('le suivi ne tourne la page que s’il y a lieu', () => {
  // Trois cas sur quatre rendent `null`, et c'est le cœur de la décision :
  // appeler la navigation avec la page courante à chaque verset ramènerait de
  // force un utilisateur qui vient de feuilleter.
  assert.equal(
    pageASuivre({ suiviAuto: true, pageAffichee: 42, actif: { surah: 2, ayah: 255 } }),
    null,
    'le verset est déjà sur la page affichée'
  );
  assert.equal(
    pageASuivre({ suiviAuto: true, pageAffichee: 1, actif: { surah: 2, ayah: 255 } }),
    42,
    'il faut aller le chercher'
  );
  assert.equal(
    pageASuivre({ suiviAuto: true, pageAffichee: 1, actif: null }),
    null,
    'rien ne joue'
  );
});

test('le suivi coupé ne déplace jamais la page', () => {
  // C'est le bouton « Suivi automatique » : coupé, il doit être coupé pour de
  // bon, même quand le verset récité est sur une autre page.
  for (const actif of [null, { surah: 1, ayah: 1 }, { surah: 2, ayah: 255 }]) {
    assert.equal(pageASuivre({ suiviAuto: false, pageAffichee: 1, actif }), null);
  }
});

test('la zone d’un verset se place sans se refléter', () => {
  // Le piège : `gauche` et `droite` désignent les bords de l'ENCRE, et l'arabe
  // se lit de droite à gauche. Les intervertir donne une bande de la bonne
  // taille, de la bonne couleur, et posée sur le mauvais verset — une erreur
  // qu'on ne voit pas sur une page qu'on ne connaît pas encore.
  const position = positionEnPourcent({
    ligne: 3,
    droite: 0.9,
    gauche: 0.5,
    haut: 0.2,
    bas: 0.25,
  });
  assert.equal(position.left, '50%', 'le bord gauche de l’encre donne le `left`');
  assert.equal(position.width, '40%');
  assert.equal(position.top, '20%');
  // Comparaison numérique : `0.25 - 0.2` vaut 0.049999999999999996 en flottant,
  // et la chaîne qui en découle porte cette imprécision. Elle est sans effet sur
  // la mise en page — un dix-millionième de pour cent ne se voit pas — mais
  // l'écrire « 5 % » dans le test serait affirmer une exactitude qui n'existe
  // pas.
  assert.ok(Math.abs(Number.parseFloat(position.height) - 5) < 1e-9);

  // Sur une page réelle : la zone de 1:1 est dans la moitié droite de la page
  // (le verset commence à droite), et sa bande doit donc commencer après la
  // moitié — une bande reflétée commencerait à 32 %.
  const [zone] = zonesDuVerset(1, 1, 1);
  assert.ok(zone.gauche > 0.3 && zone.droite > 0.6, 'les bornes mesurées de 1:1');
  const place = positionEnPourcent(zone);
  assert.equal(place.left, `${zone.gauche * 100}%`);
  assert.equal(place.width, `${(zone.droite - zone.gauche) * 100}%`);
});

test('chaque zone reconstruit exactement les bornes de son verset', () => {
  // Un contrôle qui parcourt TOUT : les 604 pages, tous les versets, toutes les
  // zones. Une conversion qui perdrait un bord sur un cas particulier — une
  // zone au bord de la page, un verset d'un seul mot — ne se verrait sur aucun
  // exemple choisi à la main.
  let zones = 0;
  let pages = 0;

  for (let page = 1; page <= 604; page += 1) {
    if (!pageDecrite(page)) continue;
    pages += 1;

    for (const verset of versetsDeLaPage(page)) {
      for (const zone of zonesDuVerset(page, verset.surah, verset.ayah)) {
        zones += 1;

        assert.ok(zone.gauche < zone.droite, `page ${page}, ${verset.surah}:${verset.ayah}`);
        assert.ok(zone.haut < zone.bas, `page ${page}, ${verset.surah}:${verset.ayah}`);
        assert.ok(zone.gauche >= 0 && zone.droite <= 1, `page ${page} : hors de la page`);
        assert.ok(zone.haut >= 0 && zone.bas <= 1, `page ${page} : hors de la page`);

        // La bande verticale doit être EXACTEMENT celle de la ligne : c'est ce
        // qui fait que deux zones d'une même ligne ne clignotent pas.
        const bande = bandeDeLigne(page, zone.ligne);
        assert.deepEqual(
          { haut: zone.haut, bas: zone.bas },
          bande,
          `page ${page}, ligne ${zone.ligne} : la bande doit être celle de la ligne`
        );

        const place = positionEnPourcent(zone);
        const gauche = Number.parseFloat(place.left);
        const largeur = Number.parseFloat(place.width);
        assert.ok(
          Math.abs(gauche + largeur - zone.droite * 100) < 1e-9,
          `page ${page} : le bord droit doit être retrouvé exactement`
        );
      }
    }
  }

  assert.equal(pages, 604, 'toutes les pages doivent être décrites');
  assert.ok(zones > 13000, `${zones} zones parcourues`);
});

// === 8. La désignation de versets, et les plages ============================

test('une plage se construit dans l’ordre, même écrite à l’envers', () => {
  const attendu = [
    { surah: 1, ayah: 1 },
    { surah: 1, ayah: 2 },
    { surah: 1, ayah: 3 },
  ];
  assert.deepEqual(versetsDeLaPlage(1, 1, 3), attendu);
  assert.deepEqual(versetsDeLaPlage(1, 3, 1), attendu, 'une plage inversée est remise dans l’ordre');

  // Les bornes hors de la sourate sont ramenées : une adresse d'écran peut
  // porter « jusqu'à 999 » sur une sourate qui en compte 7.
  assert.deepEqual(versetsDeLaPlage(1, 1, 999).length, 7);
  assert.deepEqual(versetsDeLaPlage(1, 0, 3).length, 3);
  assert.deepEqual(versetsDeLaPlage(1, 5, 5), [{ surah: 1, ayah: 5 }]);

  // Une sourate qui n'existe pas rend une plage vide, et ne lève pas : la
  // sélection manuelle lit ses numéros dans des champs de saisie.
  assert.deepEqual(versetsDeLaPlage(0, 1, 3), []);
  assert.deepEqual(versetsDeLaPlage(115, 1, 3), []);
  assert.deepEqual(versetsDeLaPlage(1.5, 1, 3), []);
});

test('une plage couvre TOUS les versets intermédiaires, sans en sauter', () => {
  // Un `filter` sur les bornes rendrait deux versets au lieu de sept, et
  // l'utilisateur croirait avoir écouté la sourate entière.
  const alFatiha = versetsDeLaPlage(1, 1, 7);
  assert.equal(alFatiha.length, 7);
  assert.deepEqual(alFatiha.map((v) => v.ayah), [1, 2, 3, 4, 5, 6, 7]);

  const baqara = versetsDeLaPlage(2, 255, 257);
  assert.deepEqual(baqara.map((v) => v.ayah), [255, 256, 257]);
  assert.ok(baqara.every((v) => v.surah === 2));
});

test('la plage entre deux appuis est celle du moushaf, pas celle des appuis', () => {
  // Sur la page 1, les versets 3 et 4 partagent la ligne 4, et 4 vient APRÈS 3.
  // Quelqu'un qui appuie sur le verset du bas avant celui du haut doit obtenir
  // la même plage : c'est l'ordre dans lequel la récitation doit avancer.
  const sens = plageEntre(1, { surah: 1, ayah: 2 }, { surah: 1, ayah: 5 });
  const inverse = plageEntre(1, { surah: 1, ayah: 5 }, { surah: 1, ayah: 2 });

  assert.deepEqual(sens.map((v) => v.ayah), [2, 3, 4, 5]);
  assert.deepEqual(inverse, sens, 'le sens des appuis ne change pas la plage');

  // Un appui sur le même verset deux fois : la plage se réduit à lui.
  assert.deepEqual(plageEntre(1, { surah: 1, ayah: 4 }, { surah: 1, ayah: 4 }), [
    { surah: 1, ayah: 4 },
  ]);

  // Une borne qui n'est pas sur la page ne désigne rien : mieux vaut ne rien
  // sélectionner que de sélectionner un verset que l'utilisateur n'a pas visé.
  assert.deepEqual(plageEntre(1, { surah: 1, ayah: 2 }, { surah: 2, ayah: 255 }), []);
});

test('un appui désigne le verset qu’il touche', () => {
  // La zone de 1:1 est mesurée : ligne 2, de 39,8 % à 67,4 % de la largeur.
  const [zone] = zonesDuVerset(1, 1, 1);
  const milieuX = (zone.gauche + zone.droite) / 2;
  const milieuY = (zone.haut + zone.bas) / 2;
  assert.deepEqual(versetTouche(1, milieuX, milieuY), { surah: 1, ayah: 1 });

  // Les bords de la boîte comptent comme touchés.
  assert.deepEqual(versetTouche(1, zone.gauche, milieuY), { surah: 1, ayah: 1 });
  assert.deepEqual(versetTouche(1, zone.droite, milieuY), { surah: 1, ayah: 1 });
});

test('un appui dans le blanc désigne le verset le plus proche de la ligne', () => {
  // Sur la page 1, la ligne 4 porte deux versets : 1:3 de 58,4 % à 79,9 %, et
  // 1:4 de 26,9 % à 51,5 %. Entre les deux il y a un vrai blanc, sur la page
  // imprimée. Exiger que le doigt tombe dans l'encre ferait qu'un appui sur ce
  // blanc ne sélectionnerait RIEN — or l'utilisateur a désigné un endroit de la
  // ligne, et il attend le verset qui est là.
  const [trois] = zonesDuVerset(1, 1, 3);
  const y = (trois.haut + trois.bas) / 2;

  // À 58 %, on est à 0,4 point de 1:3 et à 6,5 points de 1:4 : c'est 1:3.
  assert.deepEqual(versetTouche(1, 0.58, y), { surah: 1, ayah: 3 });
  // À 52 %, on est à 3,5 points de 1:4 et à 6,4 points de 1:3 : c'est 1:4.
  assert.deepEqual(versetTouche(1, 0.52, y), { surah: 1, ayah: 4 });

  // Dans la marge, à gauche de tout : c'est encore le verset de la ligne le
  // plus proche, et non rien.
  assert.deepEqual(versetTouche(1, 0.02, y), { surah: 1, ayah: 4 });
});

test('un appui hors de toute ligne ne désigne rien', () => {
  // Le haut de la page est occupé par le cadre, pas par une ligne de texte.
  assert.equal(versetTouche(1, 0.5, 0.01), null);
  assert.equal(versetTouche(1, 0.5, 0.99), null);

  // Une position qui n'est pas une fraction de page est refusée plutôt que
  // ramenée : un `x` négatif signale un défaut de calcul, et le corriger en
  // silence désignerait un verset au hasard.
  for (const mauvaise of [-0.1, 1.1, NaN, Infinity]) {
    assert.equal(versetTouche(1, mauvaise, 0.3), null, `x = ${String(mauvaise)}`);
    assert.equal(versetTouche(1, 0.5, mauvaise), null, `y = ${String(mauvaise)}`);
  }
});

test('un appui désigne un verset sur TOUTES les pages, jamais rien', () => {
  // Le contrôle qui parcourt tout : pour chaque page, un appui au milieu de
  // chaque zone doit désigner le verset de cette zone. Une page dont la
  // géométrie serait décalée d'un verset — un décalage qui ne se verrait sur
  // aucun exemple choisi à la main — tomberait ici.
  let appuis = 0;
  let pages = 0;

  for (let page = 1; page <= 604; page += 1) {
    if (!pageDecrite(page)) continue;
    pages += 1;

    for (const verset of versetsDeLaPage(page)) {
      for (const zone of zonesDuVerset(page, verset.surah, verset.ayah)) {
        appuis += 1;
        const x = (zone.gauche + zone.droite) / 2;
        const y = (zone.haut + zone.bas) / 2;
        assert.deepEqual(
          versetTouche(page, x, y),
          verset,
          `page ${page}, zone de ${verset.surah}:${verset.ayah} ligne ${zone.ligne}`
        );
      }
    }
  }

  assert.equal(pages, 604);
  assert.ok(appuis > 13000, `${appuis} appuis éprouvés`);
});
