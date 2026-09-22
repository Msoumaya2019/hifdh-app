// La page du moushaf telle qu'elle se dessine : codes de police et géométrie.
//
// Deux fichiers se répondent ici, et c'est leur accord qui fait la page :
//
//   - `moushaf_layout.json` porte, pour chaque mot, le **point de code** que la
//     police de sa page dessine — un mot, un glyphe ;
//   - `largeurs_pages.json` porte la largeur naturelle de chaque ligne, lue dans
//     la table `hmtx` de cette même police, et la largeur de référence de la
//     page.
//
// Le rendu n'a plus qu'à diviser : `corps = largeur × unitesParEm / référence`.
// Si l'un des deux fichiers dérivait, la page serait mal mise à l'échelle — ou
// pire, un mot s'imprimerait en pavé — sans que rien ne le signale à l'écran.
// Ce fichier tient donc les invariants qui rendent ce calcul possible.
//
// Ce qui n'est **pas** éprouvé ici : que chaque code soit réellement dessiné par
// la police de sa page. Cela demande d'ouvrir les 604 polices, ce que fait
// `npm run verifier:polices` (et son falsificateur), pas un test JavaScript.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  getCodesDuMoushaf,
  getGeometrieMoushaf,
  getLargeursPage,
  getLignesDuMoushaf,
  getLignesParPageMoushaf,
  getMotsDeLigne,
  PAGE_DE_LA_BASMALA,
} from '@/data/quranData';

import largeursPages from '@data/quran/largeurs_pages.json' with { type: 'json' };

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const LARGEURS = largeursPages;
const TOTAL_PAGES = 604;
const LIGNES = 15;

/** Les formes de présentation arabes A et B : là où vivent les codes. */
const CODE_MIN = 0xfb50;
const CODE_MAX = 0xfc79;

function codesDe(page) {
  const codes = getCodesDuMoushaf(page);
  assert.notEqual(codes, null, `la page ${page} devrait porter ses codes`);
  return codes;
}

test('la géométrie de la page vient du fichier, et rien n’y est inventé', () => {
  const geometrie = getGeometrieMoushaf();
  assert.notEqual(geometrie, null);
  assert.equal(geometrie.unitesParEm, 2048, 'la résolution des 604 polices');
  assert.equal(geometrie.unitesDeLaBasmala, 9261, 'la basmala dans la police de la page 1');
  assert.equal(geometrie.partDeLaBasmala, 0.572);
  assert.equal(geometrie.hauteurDuBloc, 1.664);
  assert.equal(geometrie.hauteurDeLaBasmala, 0.0737);
});

test('la géométrie s’accorde avec le fichier qu’elle résume', () => {
  const geometrie = getGeometrieMoushaf();
  for (const cle of [
    'unitesParEm',
    'unitesDeLaBasmala',
    'partDeLaBasmala',
    'hauteurDuBloc',
    'hauteurDeLaBasmala',
  ]) {
    assert.equal(geometrie[cle], LARGEURS[cle], cle);
  }
});

test('les largeurs décrivent 604 pages de 15 lignes', () => {
  assert.equal(Object.keys(LARGEURS.pages).length, TOTAL_PAGES);
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const mesure = getLargeursPage(page);
    assert.notEqual(mesure, null, `page ${page}`);
    assert.equal(mesure.lignes.length, LIGNES, `page ${page}`);
    assert.equal(typeof mesure.justifiee, 'boolean', `page ${page}`);
    assert.ok(mesure.reference > 0, `page ${page} : référence`);
  }
});

test('les codes décrivent 604 pages de 15 lignes', () => {
  assert.equal(getLignesParPageMoushaf(), LIGNES);
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    assert.equal(codesDe(page).length, LIGNES, `page ${page}`);
  }
});

test('une page hors des 604 n’est ni décrite, ni inventée', () => {
  for (const page of [0, -1, 605, 1000]) {
    assert.equal(getLargeursPage(page), null, `largeurs ${page}`);
    assert.equal(getCodesDuMoushaf(page), null, `codes ${page}`);
  }
});

test('une ligne d’en-tête n’a pas de largeur, et c’est la seule', () => {
  // Le bandeau qui porte le nom de la sourate est composé en police de texte :
  // il n'est pas dessiné par la police de page, et n'a donc pas de largeur
  // d'avance. C'est exactement ce que `null` veut dire, et rien d'autre — une
  // ligne vide vaut 0, pas `null`.
  let sansMesure = 0;
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const texte = getLignesDuMoushaf(page);
    const mesure = getLargeursPage(page);
    for (let i = 0; i < LIGNES; i++) {
      const entete = texte[i].some((e) => e.type === 'entete');
      if (entete) sansMesure += 1;
      assert.equal(
        mesure.lignes[i] === null,
        entete,
        `page ${page} ligne ${i + 1} : une ligne d'en-tête seule n'a pas de largeur`
      );
    }
  }
  assert.equal(sansMesure, LARGEURS.lignesSansMesure);
});

test('la référence d’une page suit la règle annoncée, sur les 604 pages', () => {
  // Page alignée des deux bords : la médiane des huit lignes les plus larges —
  // et non la plus large, qui serait justement la ligne fausse qu'on cherche à
  // reconnaître. Page qui ne l'est pas : sa plus large ligne, car il n'y a
  // alors aucune largeur commune à retrouver.
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const { lignes, reference, justifiee } = getLargeursPage(page);
    const valeurs = lignes.filter((l) => l !== null && l > 0);
    assert.ok(valeurs.length > 0, `page ${page}`);

    const attendue = justifiee
      ? medianeHuitPlusLarges(valeurs)
      : Math.max(...valeurs);
    assert.equal(reference, attendue, `page ${page} (${justifiee ? 'alignée' : 'non alignée'})`);
  }
});

/** La médiane des huit plus larges, tronquée — comme `int(median(...))`. */
function medianeHuitPlusLarges(valeurs) {
  const huit = [...valeurs].sort((a, b) => b - a).slice(0, 8);
  const milieu = huit.length / 2;
  if (Number.isInteger(milieu)) {
    return Math.trunc((huit[milieu - 1] + huit[milieu]) / 2);
  }
  return huit[Math.floor(milieu)];
}

test('599 pages sont alignées des deux bords, et ce sont celles du fichier', () => {
  let alignees = 0;
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    if (getLargeursPage(page).justifiee) alignees += 1;
  }
  assert.equal(alignees, LARGEURS.pagesJustifiees);
  assert.equal(alignees, 599);

  // Les cinq pages enluminées de l'ouverture et de la fermeture : chacune porte
  // un verset par ligne, en grand corps, et n'a pas de largeur commune.
  for (const page of [1, 2, 602, 603, 604]) {
    assert.equal(getLargeursPage(page).justifiee, false, `page ${page}`);
  }
});

test('aucune ligne mesurée ne dépasse sa page de plus de 5 %', () => {
  // Une page du moushaf est alignée des deux bords : ses quinze lignes ont la
  // même largeur. Une ligne plus large que la référence de plus de 5 % n'a donc
  // pas pu être imprimée — c'est le signe qu'une coupure publiée y met un mot
  // de trop. Le générateur corrige ces coupures ; ce test refuse qu'une
  // nouvelle apparaisse sans que personne ne la voie.
  const debordements = [];
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const { lignes, reference, justifiee } = getLargeursPage(page);
    if (!justifiee) continue;
    lignes.forEach((largeur, i) => {
      if (largeur !== null && largeur > 1.05 * reference) {
        debordements.push([page, i + 1, largeur, reference]);
      }
    });
  }
  assert.deepEqual(debordements, []);
});

test('les codes ne portent que des formes de présentation arabes', () => {
  // C'est l'invariant qui rend la page dessinable : hors de cette plage, la
  // police de page dessine du latin — elle en porte — et le mot s'imprimerait
  // autre chose que lui-même. Un code déplacé ne se voit pas sur un écran ; il
  // se voit sur le moushaf, à côté.
  //
  // Une exception, et une seule : l'espace U+0020. 198 mots du moushaf sont
  // écrits en **deux glyphes** joints par une espace — c'est le dessin du
  // calligraphe, pas une séparation entre deux mots. L'avance de cette espace
  // (81 unités) entre donc dans la largeur de la ligne, et le rendu doit la
  // dessiner : c'est ce qui se passe, puisque les codes sont collés tels quels.
  let espaces = 0;
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    codesDe(page).forEach((ligne, i) => {
      for (const element of ligne) {
        const mots =
          element.type === 'verset' || element.type === 'basmala'
            ? element.mots
            : element.type === 'medaillon'
              ? [element.mot]
              : [];
        for (const mot of mots) {
          assert.ok(mot.length > 0, `page ${page} ligne ${i + 1} : un code vide`);
          for (const caractere of mot) {
            const point = caractere.codePointAt(0);
            if (point === 0x20) {
              espaces += 1;
              continue;
            }
            assert.ok(
              point >= CODE_MIN && point <= CODE_MAX,
              `page ${page} ligne ${i + 1} : U+${point.toString(16).toUpperCase()} hors des formes de présentation`
            );
          }
        }
      }
    });
  }
  assert.equal(espaces, 198);
});

test('les codes et le texte décrivent la même page, élément par élément', () => {
  // Le texte dit quels versets la page porte ; les codes disent quels mots.
  // Les deux viennent de sources différentes — Tanzil pour l'un, l'API
  // quran.com pour l'autre — et doivent tomber d'accord sur la structure.
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const texte = getLignesDuMoushaf(page);
    const codes = codesDe(page);
    for (let i = 0; i < LIGNES; i++) {
      assert.deepEqual(
        codes[i].map((e) => [e.type, e.surah, e.ayah ?? null]),
        texte[i].map((e) => [e.type, e.surah, e.ayah ?? null]),
        `page ${page} ligne ${i + 1}`
      );
    }
  }
});

test('la basmala est celle de la page 1, et elle y mesure 9261 unités', () => {
  // L'API ne donne la basmala comme mots que pour Al-Fatiha, où elle EST le
  // premier verset : c'est donc la police de la page 1, et elle seule, qui la
  // dessine. Une basmala d'une autre main que le reste de la page se verrait.
  const premier = getCodesDuMoushaf(PAGE_DE_LA_BASMALA)[1];
  const codesDeLaBasmala = premier
    .filter((e) => e.type === 'verset' && e.ayah === 1)
    .flatMap((e) => e.mots);
  assert.equal(codesDeLaBasmala.length, 4);

  let basmalas = 0;
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    codesDe(page).forEach((ligne, i) => {
      const basmala = ligne.find((e) => e.type === 'basmala');
      if (basmala === undefined) return;
      basmalas += 1;
      assert.deepEqual(basmala.mots, codesDeLaBasmala, `page ${page} ligne ${i + 1}`);
      assert.equal(
        getLargeursPage(page).lignes[i],
        LARGEURS.unitesDeLaBasmala,
        `page ${page} ligne ${i + 1} : la largeur de la basmala`
      );
    });
  }
  assert.equal(basmalas, 112);
});

test('getMotsDeLigne rend les codes dans l’ordre de lecture', () => {
  const ligne = codesDe(177)[2];
  const mots = getMotsDeLigne(ligne);
  const attendus = ligne.flatMap((e) =>
    e.type === 'verset' || e.type === 'basmala'
      ? e.mots
      : e.type === 'medaillon'
        ? [e.mot]
        : []
  );
  assert.deepEqual(mots, attendus);
  assert.equal(mots.length, 9);

  // Une ligne d'en-tête ne porte aucun mot, et n'en invente pas.
  assert.deepEqual(getMotsDeLigne(codesDe(177)[0]), []);
});

test('la table des polices écrit les 604 chemins en clair, et ils existent', () => {
  // Metro ne suit pas un `require` calculé : un chemin construit dans une boucle
  // ne serait pas résolu, et la page s'afficherait sans sa police — c'est-à-dire
  // pas du tout. La table est donc engendrée, chemin par chemin, et ce test
  // refuse qu'un chemin manque, qu'il soit écrit autrement, ou que le fichier
  // qu'il désigne ait disparu.
  const source = readFileSync(join(RACINE, 'src/data/policesPages.ts'), 'utf8');
  const trouves = [...source.matchAll(/^\s*(\d+):\s*require\('([^']+)'\),\s*$/gm)];
  assert.equal(trouves.length, TOTAL_PAGES);

  const pages = trouves.map(([, page]) => Number(page));
  assert.deepEqual(pages, Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1));

  for (const [, page, chemin] of trouves) {
    assert.match(chemin, /^\.\.\/\.\.\/assets\/polices-pages\/p\d{3}\.ttf$/);
    const fichier = join(RACINE, 'src/data', chemin);
    assert.ok(existsSync(fichier), `page ${page} : ${chemin} est absent`);
    assert.ok(statSync(fichier).size > 10_000, `page ${page} : ${chemin} est trop petit`);
  }
});
