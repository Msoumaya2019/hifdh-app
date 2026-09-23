// Objectifs et rythmes : l'ordre, l'exhaustivité, et ce que chaque objectif
// couvre réellement.
//
// Pourquoi ces tests existent
// ---------------------------
// L'ordre des objectifs est une demande, et une demande n'est pas tenue par le
// fait qu'on l'a écrite une fois. Trois choses peuvent la défaire en silence :
//
//   - un objectif ajouté au type mais oublié dans l'ordre — il n'apparaîtrait
//     nulle part, et rien ne le dirait ;
//   - un libellé manquant — l'écran afficherait « undefined » ou un mot vague,
//     comme les deux copies de `getObjectiveLabel` le faisaient avant leur
//     réunion dans `libelles.ts` ;
//   - un ordre modifié par mégarde — la liste se réordonnerait, et l'apprenant
//     trouverait « tout le Coran » avant « les petites sourates ».
//
// Le premier test lit donc les types **depuis leur source**, et non depuis une
// liste recopiée : c'est la seule façon qu'un type ajouté sans libellé se voie.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  LIBELLES_QUESTIONNAIRE,
  ORDRE_OBJECTIFS,
  libelleObjectif,
  libelleRythme,
} from '@/lib/libelles';
import { computeObjectiveRanges } from '@/lib/programGenerator';
import { getObjectiveVerseCount } from '@/lib/progress';
import { getTotalAyahs, getSurah } from '@/data/quranData';

// === Lecture des types depuis leur source ==================================

/**
 * Les membres de `ObjectiveType`, lus dans `src/types/index.ts`.
 *
 * Recopier la liste ici la rendrait complice de l'oubli qu'on veut détecter :
 * un type ajouté au modèle mais pas au test passerait inaperçu.
 */
function typesDObjectifDuModele() {
  const chemin = fileURLToPath(
    new URL('../src/types/index.ts', import.meta.url),
  );
  const source = readFileSync(chemin, 'utf8');

  const debut = source.indexOf('export type ObjectiveType');
  assert.notEqual(debut, -1, 'ObjectiveType introuvable dans src/types/index.ts');

  // Jusqu'au point-virgule qui ferme le type.
  const fin = source.indexOf(';', debut);
  const bloc = source.slice(debut, fin);

  const trouves = [...bloc.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(trouves.length >= 6, `types lus : ${trouves.length}`);
  return trouves;
}

test('tout type d’objectif du modèle a un libellé et une place dans l’ordre', () => {
  const duModele = typesDObjectifDuModele();

  const sansLibelle = duModele.filter((t) => LIBELLES_QUESTIONNAIRE[t] === undefined);
  assert.deepEqual(sansLibelle, [], 'types sans libellé de questionnaire');

  const sansPlace = duModele.filter((t) => !ORDRE_OBJECTIFS.includes(t));
  assert.deepEqual(sansPlace, [], 'types absents de ORDRE_OBJECTIFS');

  const enTrop = ORDRE_OBJECTIFS.filter((t) => !duModele.includes(t));
  assert.deepEqual(enTrop, [], 'ORDRES_OBJECTIFS porte des types inexistants');
});

test('l’ordre des objectifs est exactement celui demandé', () => {
  // Les objectifs nommés, dans l'ordre : les dix plus courtes, Hizb Sabbih,
  // Juzz 'Amma, jusqu'à Yassine, la moitié, tout le Coran — puis les trois
  // objectifs plus fins, puis l'objectif personnalisé.
  //
  // Écrit tel quel : c'est une demande, et la reformuler la ferait dériver.
  assert.deepEqual(ORDRE_OBJECTIFS, [
    'short_surahs',
    'hizb_sabbih',
    'juz_amma',
    'up_to_yassin',
    'half_quran',
    'full_quran',
    'specific_juz',
    'specific_hizb',
    'custom',
  ]);
});

// === Le rythme ==============================================================

test('le questionnaire propose exactement six rythmes', () => {
  const chemin = fileURLToPath(new URL('../app/onboarding.tsx', import.meta.url));
  const source = readFileSync(chemin, 'utf8');

  const debut = source.indexOf('const RYTHMES');
  assert.notEqual(debut, -1, 'RYTHMES introuvable dans app/onboarding.tsx');
  const fin = source.indexOf('];', debut);
  const bloc = source.slice(debut, fin);

  // Les six unités, dans l'ordre du plus léger au plus lourd.
  const unites = [...bloc.matchAll(/type: '([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(unites, ['verses', 'verses', 'half_page', 'page', 'thumn', 'rub']);

  // Et les quantités : 1 verset, 3 versets, puis une unité chacun. Le `count`
  // de la demi-page n'existe pas — sa quantité est la page.
  const comptes = [...bloc.matchAll(/count: (\d+)/g)].map((m) => Number(m[1]));
  assert.deepEqual(comptes, [1, 3, 1, 1, 1]);

  // La liste s'arrête au rub' : ni nisf ni hizb ne sont proposés.
  assert.ok(
    !/type: 'nisf'/.test(bloc) && !/type: 'hizb'/.test(bloc),
    'le questionnaire propose un nisf ou un hizb',
  );
});

test('les six rythmes choisis restent lisibles en français', () => {
  const cas = [
    [{ type: 'verses', count: 1 }, '1 verset/jour'],
    [{ type: 'verses', count: 3 }, '3 versets/jour'],
    [{ type: 'half_page' }, 'Une demi-page/jour'],
    [{ type: 'page', count: 1 }, '1 page/jour'],
    [{ type: 'thumn', count: 1 }, '1 toumoun/jour'],
    [{ type: 'rub', count: 1 }, "1 rub'/jour"],
  ];
  for (const [unite, attendu] of cas) {
    assert.equal(libelleRythme(unite), attendu);
  }
});

test('les unités retirées du questionnaire restent lisibles', () => {
  // Elles ne sont plus proposées, mais une configuration enregistrée avant ce
  // changement en porte encore : l'afficher « undefined » serait une régression
  // pour les comptes existants.
  assert.equal(libelleRythme({ type: 'nisf', count: 1 }), '1 nisf/jour');
  assert.equal(libelleRythme({ type: 'hizb', count: 1 }), '1 hizb/jour');
  assert.equal(libelleRythme({ type: 'verses', count: 5 }), '5 versets/jour');
});

// === Ce que chaque objectif couvre =========================================

test('les objectifs nommés couvrent des versets qui existent', () => {
  for (const type of ['short_surahs', 'juz_amma', 'up_to_yassin', 'half_quran']) {
    const versets = getObjectiveVerseCount({ type });
    assert.ok(versets > 0, `[${type}] couvre 0 verset`);
  }
  assert.equal(getObjectiveVerseCount({ type: 'full_quran' }), getTotalAyahs());
});

// === L'ordre demandé n'est pas croissant, et c'est mesuré ===================
//
// L'ordre a été donné comme « du plus facile au plus difficile », dans cet
// ordre précis : petites sourates, Juzz 'Amma, jusqu'à la sourate Yassine, la
// moitié du Coran, tout le Coran.
//
// Or **« jusqu'à Yassine » couvre PLUS que « la moitié du Coran »**, et pas
// qu'un peu :
//
//   petites sourates      43 versets     3 pages
//   Juzz 'Amma (78-114)  564 versets    23 pages
//   jusqu'à Yassine     3788 versets   445 pages
//   la moitié du Coran  3118 versets   375 pages
//   tout le Coran       6236 versets   604 pages
//
// La raison est structurelle : « jusqu'à Yassine » couvre les sourates 1 à 36,
// qui **contiennent** la moitié du Coran — Yassin commence à 60 % du moushaf.
// Aucune définition de la moitié ne peut passer devant Yassin si Yassin va
// jusqu'à la sourate 36.
//
// J'ai donc demandé à l'utilisateur, mesures en main, ce qu'il fallait faire.
// Sa réponse : **garder l'ordre tel quel**. Cet ordre est donc une décision,
// pas un classement par taille, et le test ci-dessous le fige comme tel — pour
// que personne, plus tard, ne « corrige » l'ordre en croyant réparer une
// inattention.
//
// Ce que ce test protège n'est donc pas la croissance, mais la **stabilité** :
// un ordre changé sans le dire se verrait.

test('l’ordre des objectifs est celui décidé, indépendamment de leur taille', () => {
  // Le préfixe avant l'exception : les quatre premiers objectifs vont bien du
  // plus court au plus long.
  assert.deepEqual(ORDRE_OBJECTIFS.slice(0, 4), [
    'short_surahs',
    'hizb_sabbih',
    'juz_amma',
    'up_to_yassin',
  ]);
});

test('l’ordre est croissant jusqu’à Yassine, la seule exception étant la moitié', () => {
  // Mesuré, et non supposé : les quatre premiers objectifs croissent
  // strictement, puis « jusqu'à Yassine » dépasse « la moitié du Coran ». C'est
  // la seule marche descendante de l'ordre, et elle est décidée.
  const versets = (type) => getObjectiveVerseCount({ type });

  assert.ok(
    versets('short_surahs') < versets('hizb_sabbih'),
    'les dix plus courtes devraient être plus courtes que Hizb Sabbih',
  );
  assert.ok(
    versets('hizb_sabbih') < versets('juz_amma'),
    'Hizb Sabbih devrait être plus court que Juzz ’Amma',
  );
  assert.ok(
    versets('juz_amma') < versets('up_to_yassin'),
    'Juzz ’Amma devrait être plus court que « jusqu’à Yassine »',
  );

  // La marche descendante, figée : si elle s'inverse, la décision d'ordre est
  // à réexaminer, et on veut l'apprendre ici.
  assert.ok(
    versets('up_to_yassin') > versets('half_quran'),
    'Yassine couvre désormais moins que la moitié : la décision d’ordre est à revoir',
  );
  assert.ok(versets('half_quran') < versets('full_quran'));
});

test('Hizb Sabbih est bien le hizb 60, celui de سَبِّحِ, et non le hizb 1', () => {
  // Le piège du nom : « Sabbih » fait penser au premier hizb, alors qu'il
  // désigne le hizb qui **commence** par سَبِّحِ ٱسْمَ رَبِّكَ ٱلْأَعْلَى — c'est
  // le hizb 60, qui va de la sourate 87 à la fin du moushaf.
  const ranges = computeObjectiveRanges({ type: 'hizb_sabbih' });
  assert.ok(ranges.length > 0);

  const premiere = ranges[0];
  assert.equal(premiere.surah, 87, `commence à la sourate ${premiere.surah}, pas 87`);
  assert.equal(premiere.startAyah, 1);

  const derniere = ranges[ranges.length - 1];
  assert.equal(derniere.surah, 114);
  assert.equal(derniere.endAyah, 6);

  assert.equal(getObjectiveVerseCount({ type: 'hizb_sabbih' }), 288);
});

test('la moitié du Coran couvre la moitié exacte, 3 118 versets', () => {
  const total = getTotalAyahs();
  assert.equal(total, 6236);
  assert.equal(getObjectiveVerseCount({ type: 'half_quran' }), total / 2);
});

test('« jusqu’à Yassine » s’arrête à la fin de la sourate 36, borne lue dans les données', () => {
  const yassin = getSurah(36);
  assert.ok(yassin, 'sourate 36 introuvable');

  const attendu = yassin.startAyahId + yassin.ayahCount - 1;

  // Le dernier verset couvert doit être celui-là, et le suivant ne doit pas
  // l'être : une borne d'un verset de trop est invisible à l'œil sur une liste.
  const ranges = computeObjectiveRanges({ type: 'up_to_yassin' });
  const dernier = ranges[ranges.length - 1];
  assert.equal(dernier.surah, 36);
  assert.equal(dernier.endAyah, yassin.ayahCount);

  const couverts = ranges.reduce((n, r) => n + (r.endAyah - r.startAyah + 1), 0);
  assert.equal(couverts, attendu);
});

test('les dix sourates les plus courtes, déduites des données et non écrites en dur', () => {
  const ranges = computeObjectiveRanges({ type: 'short_surahs' });

  // Dix sourates, donc dix plages : elles ne se suivent pas dans le moushaf, et
  // une plage unique les engloberait toutes — 3 400 versets au lieu de 43.
  assert.equal(ranges.length, 10, `${ranges.length} plage(s) au lieu de 10`);

  // Chacune entière, et à l'intérieur de sa sourate.
  for (const r of ranges) {
    const surah = getSurah(r.surah);
    assert.ok(surah, `sourate ${r.surah} inexistante`);
    assert.equal(r.startAyah, 1, `sourate ${r.surah} ne part pas du verset 1`);
    assert.equal(r.endAyah, surah.ayahCount, `sourate ${r.surah} n’est pas prise entière`);
  }

  // Ce sont bien les plus courtes : aucune sourate écartée n'est plus courte que
  // la plus longue des retenues.
  const retenues = new Set(ranges.map((r) => r.surah));
  const plusLongue = Math.max(...ranges.map((r) => r.endAyah));
  const ecarteesPlusCourtes = [...Array(114)]
    .map((_, i) => getSurah(i + 1))
    .filter((s) => s !== undefined && !retenues.has(s.number) && s.ayahCount < plusLongue);
  assert.deepEqual(
    ecarteesPlusCourtes.map((s) => `${s.number}:${s.ayahCount}`),
    [],
    'une sourate plus courte que le lot a été écartée',
  );

  // 43 versets au total : le chiffre est mesuré, et il doit rester celui-là.
  assert.equal(getObjectiveVerseCount({ type: 'short_surahs' }), 43);
});

test('les libellés à la troisième personne ne renvoient jamais un mot vague', () => {
  const objectifs = [
    { type: 'short_surahs' },
    { type: 'juz_amma' },
    { type: 'up_to_yassin' },
    { type: 'half_quran' },
    { type: 'full_quran' },
    { type: 'hizb_sabbih' },
    { type: 'specific_juz', juzNumber: 3 },
    { type: 'specific_hizb', hizbNumbers: [60] },
    { type: 'custom', passages: [] },
  ];

  for (const o of objectifs) {
    const texte = libelleObjectif(o);
    assert.equal(typeof texte, 'string');
    assert.ok(texte.length > 0, `[${o.type}] libellé vide`);
    assert.ok(!/undefined|\[object/.test(texte), `[${o.type}] libellé : ${texte}`);
  }

  // Les cas dégénérés disent ce qui manque au lieu d'afficher « Hizb undefined ».
  assert.equal(libelleObjectif({ type: 'specific_hizb', hizbNumbers: [] }), 'Hizb à choisir');
});

// === Le rangement en trois niveaux =========================================
//
// La demande : « je souhaiterais avoir un niveau débutant avec le choix entre 1
// et 3 versets par jour, un niveau intermédiaire avec une demi-page par jour, ou
// un niveau intensif avec le choix entre 1 page, 1 toumoun ou 1 rub' ».
//
// Ce n'est pas un simple habillage : chaque rythme est désormais RANGÉ dans un
// niveau, et le rendu parcourt les niveaux pour retrouver les rythmes. Un rythme
// dont le niveau ne serait pas dans `ORDRE_NIVEAUX` **n'apparaîtrait nulle
// part** — ni erreur, ni message : le questionnaire proposerait cinq choix au
// lieu de six, et personne ne s'en apercevrait avant qu'un apprenant demande
// pourquoi « 1 rub' » a disparu. C'est ce que ce contrôle empêche.

test('les six rythmes sont rangés en trois niveaux, dans l’ordre demandé', () => {
  const chemin = fileURLToPath(new URL('../app/onboarding.tsx', import.meta.url));
  const source = readFileSync(chemin, 'utf8');

  const debut = source.indexOf('const RYTHMES');
  assert.notEqual(debut, -1, 'RYTHMES introuvable dans app/onboarding.tsx');
  const bloc = source.slice(debut, source.indexOf('];', debut));

  // Chaque rythme, apparié à son niveau. On lit ligne par ligne plutôt que par
  // une expression unique : c'est la correspondance RYTHME → NIVEAU qui compte,
  // et une expression trop large laisserait passer un décalage d'une ligne.
  const lignes = bloc.split('\n').filter((l) => l.includes('unit: {'));
  assert.equal(lignes.length, 6, 'les six rythmes doivent être décrits');

  const paires = lignes.map((ligne) => {
    const type = ligne.match(/type: '([a-z_]+)'/);
    const compte = ligne.match(/count: (\d+)/);
    const niveau = ligne.match(/niveau: '([a-z]+)'/);
    assert.ok(type !== null, `type illisible : ${ligne.trim()}`);
    assert.ok(niveau !== null, `niveau manquant : ${ligne.trim()}`);
    return [`${type[1]}${compte ? `:${compte[1]}` : ''}`, niveau[1]];
  });

  assert.deepEqual(paires, [
    ['verses:1', 'debutant'],
    ['verses:3', 'debutant'],
    ['half_page', 'intermediaire'],
    ['page:1', 'intensif'],
    ['thumn:1', 'intensif'],
    ['rub:1', 'intensif'],
  ]);

  // Les trois niveaux, dans l'ordre où ils sont offerts.
  const ordre = source.match(/const ORDRE_NIVEAUX = \[([^\]]*)\]/);
  assert.ok(ordre !== null, 'ORDRE_NIVEAUX introuvable');
  const niveaux = [...ordre[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(niveaux, ['debutant', 'intermediaire', 'intensif']);

  // Chaque niveau offert porte un nom ET un résumé. Un niveau sans libellé
  // afficherait un titre vide au-dessus de ses choix.
  const blocLibelles = source.slice(
    source.indexOf('const LIBELLES_NIVEAUX'),
    source.indexOf('};', source.indexOf('const LIBELLES_NIVEAUX'))
  );
  for (const niveau of niveaux) {
    assert.match(
      blocLibelles,
      new RegExp(`${niveau}: \\{ nom: '[^']+', resume: '[^']+' \\}`),
      `le niveau « ${niveau} » doit porter un nom et un résumé`
    );
  }
});

test('le rendu parcourt les niveaux, et non la liste à plat', () => {
  // Le rangement peut exister dans les données sans être affiché : c'est le
  // défaut que ce contrôle vise. Ce qui compte n'est pas que `niveau` soit
  // écrit, mais que le rendu s'en serve.
  const chemin = fileURLToPath(new URL('../app/onboarding.tsx', import.meta.url));
  const source = readFileSync(chemin, 'utf8');

  assert.match(
    source,
    /ORDRE_NIVEAUX\.map\(/,
    'les niveaux doivent être parcourus au rendu'
  );
  assert.match(
    source,
    /RYTHMES\.filter\(\(r\) => r\.niveau === niveau\)\.map\(/,
    'chaque niveau doit ne montrer que les rythmes qui lui appartiennent'
  );
  // Et le titre du niveau doit être rendu, pas seulement calculé.
  assert.match(source, /\{LIBELLES_NIVEAUX\[niveau\]\.nom\}/, 'le nom du niveau doit être rendu');
  assert.match(
    source,
    /\{LIBELLES_NIVEAUX\[niveau\]\.resume\}/,
    'le résumé du niveau doit être rendu'
  );
});
