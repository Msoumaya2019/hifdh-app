// Mise en page du moushaf : où chaque mot tombe sur la page.
//
// Les bornes de page disent quels versets une page porte ; elles étaient déjà
// couvertes. Ce fichier couvre ce qui vient d'être ajouté : les **coupures de
// ligne**, prises à la mise en page engendrée par
// `data/quran/generer_layout_moushaf.py`.
//
// Les oracles ne sont pas des impressions. Trois pages ont été relues sur le
// moushaf imprimé — la 401, fournie en photo, la 2 et la 77, prises aux images
// du moushaf de Médine — et ce sont leurs coupures qui sont figées ici. Une
// coupure fausse est invisible à l'œil sur un écran : elle se voit en la
// comparant à la page de papier, ou en vérifiant que les jetons d'un verset se
// suivent sans trou et sans recouvrement.
//
// Les accesseurs de texte dont la mise en page se sert — `getJetonsAyah`,
// `getTexteJetons`, `getAyahText` — sont éprouvés ici aussi : c'est en les
// traversant que la mise en page se trompe, et c'est là que le rang d'un verset
// s'est révélé non vérifié.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAyahText,
  getEnteteEnMarge,
  getJetonsAyah,
  getLignesDuMoushaf,
  getLignesParPageMoushaf,
  getSurah,
  getTexteJetons,
} from '@/data/quranData';

import quranTextData from '@data/quran/quran_text_uthmani.json' with { type: 'json' };
import moushafLayout from '@data/quran/moushaf_layout.json' with { type: 'json' };

const VERSETS = quranTextData;
const LAYOUT = moushafLayout;
const TOTAL_PAGES = 604;
const LIGNES = 15;
const BASMALA_JETONS = 4;

/** Les sourates dont le premier verset n'est pas précédé d'une basmala. */
const SANS_BASMALA = new Set([1, 9]);

const PAGE_DE = new Map(VERSETS.map((v) => [`${v.surah}:${v.ayah}`, v.page]));

function lignesDe(page) {
  const lignes = getLignesDuMoushaf(page);
  assert.notEqual(lignes, null, `la page ${page} devrait être décrite`);
  return lignes;
}

/** Les éléments « verset » d'une ligne, dans l'ordre. */
function versetsDe(ligne) {
  return ligne.filter((e) => e.type === 'verset');
}

test('la mise en page décrit 604 pages de 15 lignes', () => {
  assert.equal(getLignesParPageMoushaf(), LIGNES);
  assert.equal(Object.keys(LAYOUT.pages).length, TOTAL_PAGES);
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    assert.equal(lignesDe(page).length, LIGNES, `page ${page}`);
  }
});

test('une page hors des 604 n’est pas décrite, et n’est pas inventée', () => {
  assert.equal(getLignesDuMoushaf(0), null);
  assert.equal(getLignesDuMoushaf(605), null);
  assert.equal(getLignesDuMoushaf(-1), null);
});

test('chaque verset est placé une fois, et sur sa propre page', () => {
  const placements = new Map();
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    for (const ligne of lignesDe(page)) {
      for (const element of versetsDe(ligne)) {
        const cle = `${element.surah}:${element.ayah}`;
        const vues = placements.get(cle) ?? [];
        vues.push(page);
        placements.set(cle, vues);
      }
    }
  }

  assert.equal(placements.size, VERSETS.length, 'autant de versets placés que dans le texte');
  for (const [cle, pages] of placements) {
    assert.equal(new Set(pages).size, 1, `${cle} est placé sur plusieurs pages`);
    assert.equal(pages[0], PAGE_DE.get(cle), `${cle} est sur la page ${pages[0]}`);
  }
});

test('les jetons d’un verset se suivent, sans trou ni recouvrement', () => {
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const plages = new Map();
    for (const ligne of lignesDe(page)) {
      for (const element of versetsDe(ligne)) {
        const cle = `${element.surah}:${element.ayah}`;
        plages.set(cle, [...(plages.get(cle) ?? []), element]);
      }
    }

    for (const [cle, elements] of plages) {
      const [surah, ayah] = cle.split(':').map(Number);
      const jetons = getJetonsAyah(surah, ayah);
      assert.notEqual(jetons, null, cle);

      // Le premier verset d'une sourate commence après les jetons de basmala :
      // les indices portent sur la liste complète des jetons du verset.
      const depart = ayah === 1 && !SANS_BASMALA.has(surah) ? BASMALA_JETONS : 0;
      let attendu = depart;
      for (const element of elements) {
        assert.equal(element.premier, attendu, `${cle} page ${page} : jeton de reprise`);
        assert.ok(
          element.dernier >= element.premier && element.dernier < jetons.length,
          `${cle} page ${page} : plage ${element.premier}-${element.dernier} hors du verset`
        );
        attendu = element.dernier + 1;
      }
      assert.equal(attendu, jetons.length, `${cle} page ${page} : fin de verset`);
    }
  }
});

test('la page 401 reproduit la page imprimée fournie en photo', () => {
  const lignes = lignesDe(401);

  // Première ligne de la photo : « وَقَـٰرُونَ وَفِرْعَوْنَ وَهَـٰمَـٰنَ ۖ وَلَقَدْ
  // جَآءَهُم مُّوسَىٰ » — six mots, **plus le signe de waqf** qui suit
  // « وَهَـٰمَـٰنَ » et que le texte porte comme un jeton à part. Sept jetons,
  // donc, indices 0 à 6. Compter les mots de la photo en oubliant le signe
  // donnerait un décalage d'un jeton sur toute la page.
  assert.deepEqual(versetsDe(lignes[0]), [
    { type: 'verset', surah: 29, ayah: 39, premier: 0, dernier: 6 },
  ]);

  // Deuxième ligne : la suite du même verset, à partir du huitième jeton.
  assert.equal(versetsDe(lignes[1])[0].premier, 7);

  // Les quinze lignes de la photo sont toutes occupées, et la page se termine
  // sur 29:45.
  for (let i = 0; i < LIGNES; i++) {
    assert.ok(lignes[i].length > 0, `ligne ${i + 1} de la page 401 est vide`);
  }
  assert.equal(versetsDe(lignes[LIGNES - 1])[0].ayah, 45);
});

test('la page 77 porte la basmala en ligne 1, son en-tête en marge', () => {
  const lignes = lignesDe(77);

  // Sur la page imprimée, le nom de la sourate est écrit dans la bande de marge,
  // au-dessus des quinze lignes ; la ligne 1 est la basmala, et les mots de 4:1
  // commencent ligne 2.
  assert.deepEqual(lignes[0], [{ type: 'basmala', surah: 4 }]);
  assert.equal(versetsDe(lignes[1])[0].premier, BASMALA_JETONS);
  assert.equal(getEnteteEnMarge(77), 4);
});

test('la page 2 porte l’en-tête en ligne 1 et la basmala en ligne 2', () => {
  const lignes = lignesDe(2);
  assert.deepEqual(lignes[0], [{ type: 'entete', surah: 2 }]);
  assert.deepEqual(lignes[1], [{ type: 'basmala', surah: 2 }]);
  assert.equal(versetsDe(lignes[2])[0].premier, BASMALA_JETONS);
  assert.equal(getEnteteEnMarge(2), null);
});

test('chaque ouverture de sourate occupe une ou deux lignes, jamais trois', () => {
  // La règle relevée sur le moushaf : l'en-tête puis la basmala, soit deux
  // lignes ; ou la seule basmala, quand la sourate ouvre la page et que le
  // moushaf renvoie son nom dans la marge. Al-Fatiha et At-Tawbah, qui n'ont pas
  // de basmala séparée, n'occupent qu'une ligne, leur en-tête.
  const compte = { uneLigne: 0, deuxLignes: 0 };

  for (let sourate = 1; sourate <= 114; sourate++) {
    const jetons = getJetonsAyah(sourate, 1);
    assert.notEqual(jetons, null, `sourate ${sourate}`);

    let ouverture = null;
    for (let page = 1; page <= TOTAL_PAGES && ouverture === null; page++) {
      const lignes = lignesDe(page);
      for (let i = 0; i < LIGNES; i++) {
        const debut = versetsDe(lignes[i]).find((e) => e.surah === sourate && e.ayah === 1);
        if (debut === undefined) continue;

        // Les lignes d'ouverture sont celles qui précèdent immédiatement, et
        // qui ne portent ni mot ni médaillon.
        const avant = [];
        for (let j = i - 1; j >= 0; j--) {
          const occupee = lignes[j].some(
            (e) => e.type === 'verset' || e.type === 'medaillon'
          );
          if (occupee) break;
          avant.unshift(lignes[j]);
        }
        ouverture = { page, avant };
        break;
      }
    }

    assert.notEqual(ouverture, null, `sourate ${sourate} : premier verset introuvable`);

    if (SANS_BASMALA.has(sourate)) {
      assert.equal(ouverture.avant.length, 1, `sourate ${sourate} : en-tête seul attendu`);
      assert.deepEqual(ouverture.avant[0], [{ type: 'entete', surah: sourate }]);
      compte.uneLigne += 1;
      continue;
    }

    if (ouverture.avant.length === 2) {
      assert.deepEqual(ouverture.avant[0], [{ type: 'entete', surah: sourate }]);
      assert.deepEqual(ouverture.avant[1], [{ type: 'basmala', surah: sourate }]);
      // La page peut porter un en-tête en marge : celui de la sourate qui l'a
      // ouverte. Elle ne peut pas porter le nôtre, puisque le nom de cette
      // sourate-ci est écrit sur sa propre ligne. Exiger `null` serait faux : la
      // page 587 porte en marge le nom de la sourate 82, qui l'ouvre, alors que
      // la 83 s'y ouvre plus bas, en deux lignes.
      assert.notEqual(
        getEnteteEnMarge(ouverture.page),
        sourate,
        `sourate ${sourate} : son nom est sur sa ligne, il n'est pas dans la marge`
      );
      compte.deuxLignes += 1;
    } else {
      assert.equal(ouverture.avant.length, 1, `sourate ${sourate}`);
      assert.deepEqual(ouverture.avant[0], [{ type: 'basmala', surah: sourate }]);
      assert.equal(
        getEnteteEnMarge(ouverture.page),
        sourate,
        `sourate ${sourate} : son nom devrait être renvoyé en marge`
      );
      compte.uneLigne += 1;
    }
  }

  // 114 ouvertures : 23 d'une ligne, 91 de deux.
  assert.equal(compte.uneLigne, 23);
  assert.equal(compte.deuxLignes, 91);
});

test('la basmala affichée est celle du texte, jamais une chaîne recopiée', () => {
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    for (const ligne of lignesDe(page)) {
      for (const element of ligne) {
        if (element.type !== 'basmala') continue;
        const jetons = getJetonsAyah(element.surah, 1);
        assert.notEqual(jetons, null);
        assert.equal(
          getTexteJetons(element.surah, 1, 0, BASMALA_JETONS - 1),
          jetons.slice(0, BASMALA_JETONS).join(' ')
        );
      }
    }
  }
});

test('les en-têtes renvoyés en marge sont exactement les 21 pages attendues', () => {
  assert.deepEqual(
    Object.entries(LAYOUT.entetesEnMarge).map(([page, sourate]) => [Number(page), sourate]),
    [
      [77, 4], [208, 10], [332, 22], [342, 23], [350, 24], [367, 26], [377, 27],
      [415, 32], [418, 33], [446, 37], [453, 38], [499, 45], [507, 47], [526, 53],
      [549, 60], [556, 64], [558, 65], [585, 80], [587, 82], [591, 86], [595, 91],
    ]
  );
  for (const page of [1, 2, 3, 77, 128, 401, 604]) {
    if (page === 77) continue;
    assert.equal(getEnteteEnMarge(page), null, `page ${page}`);
  }
});

test('les trente-cinq lignes laissées vides le sont aux endroits connus', () => {
  // Deux régimes, et il faut les distinguer.
  //
  // Pages 1 et 2 : les pages d'ouverture enluminées. Le texte s'arrête après
  // huit lignes — en-tête, basmala, puis le texte — et le bas de la page est
  // enluminure. Vérifié sur l'image imprimée de la page 2 : la sourate 2 y
  // occupe l'en-tête, la basmala, puis 2:1 à 2:5 sur six lignes, et rien en
  // dessous.
  //
  // Vingt-et-une autres pages : seule la dernière ligne reste vide, parce que la
  // page suivante ouvre une sourate — le moushaf n'entame pas une sourate sur la
  // dernière ligne d'une page.
  const vides = [];
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    lignesDe(page).forEach((ligne, i) => {
      if (ligne.length === 0) vides.push([page, i + 1]);
    });
  }

  assert.equal(vides.length, 35);

  const pagesIlluminees = [1, 2];
  const attenduesIlluminees = [9, 10, 11, 12, 13, 14, 15].flatMap((ligne) =>
    pagesIlluminees.map((page) => [page, ligne])
  );
  assert.deepEqual(
    vides.filter(([page]) => pagesIlluminees.includes(page)),
    attenduesIlluminees.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  );

  const pagesEnCours = [...new Set(vides.map(([page]) => page))]
    .filter((page) => !pagesIlluminees.includes(page))
    .sort((a, b) => a - b);
  assert.deepEqual(pagesEnCours, [
    76, 207, 331, 341, 349, 366, 376, 414, 417, 445, 452, 498, 506, 525,
    548, 555, 557, 584, 586, 590, 594,
  ]);

  for (const page of pagesEnCours) {
    // C'est la dernière ligne, et elle seule, qui est vide.
    assert.deepEqual(vides.filter(([p]) => p === page), [[page, LIGNES]], `page ${page}`);
    // Et chacune précède une page qui ouvre une sourate.
    assert.notEqual(getEnteteEnMarge(page + 1), null, `la page ${page + 1}`);
  }
});

test('une plage de jetons hors du verset n’est pas rendue', () => {
  const jetons = getJetonsAyah(29, 39);
  assert.notEqual(jetons, null);

  assert.equal(getTexteJetons(29, 39, 0, 6), jetons.slice(0, 7).join(' '));
  assert.equal(getTexteJetons(29, 39, -1, 5), null);
  assert.equal(getTexteJetons(29, 39, 3, 2), null);
  assert.equal(getTexteJetons(29, 39, 0, jetons.length), null);
  assert.equal(getTexteJetons(29, 999, 0, 0), null);
});

test('un rang de verset hors de la sourate n’est pas lu', () => {
  // Le cache du texte est un tableau plat indexé par l'identifiant global du
  // verset, et le rang n'était pas vérifié avant la lecture : `getAyahText(29,
  // 70)` ne échouait pas, il lisait le verset suivant dans l'ordre du moushaf —
  // 30:1, basmala comprise. Le 0e rendait 28:88, et le 999e rendait 2:46. Un
  // verset faux ne se signale pas : il s'affiche.
  const dernier = VERSETS.find((v) => v.surah === 29 && v.ayah === 69);
  assert.notEqual(dernier, undefined);
  assert.equal(getAyahText(29, 69), dernier.text);

  assert.equal(getAyahText(29, 70), null);
  assert.equal(getAyahText(29, 999), null);
  assert.equal(getAyahText(29, 0), null);
  assert.equal(getAyahText(29, -1), null);
  assert.equal(getAyahText(29, 1.5), null);

  // Les bornes du corpus : la dernière sourate compte six versets.
  const fin = VERSETS.find((v) => v.surah === 114 && v.ayah === 6);
  assert.notEqual(fin, undefined);
  assert.equal(getAyahText(114, 6), fin.text);
  assert.equal(getAyahText(114, 7), null);

  // Une sourate qui n'existe pas.
  assert.equal(getAyahText(115, 1), null);
  assert.equal(getAyahText(0, 1), null);
});

test('le texte ne porte que des espaces ordinaires, et aucun blanc de bord', () => {
  // C'est l'invariant qui rend le découpage des jetons indifférent, et il faut
  // le dire plutôt que de croire qu'on éprouve le découpage.
  //
  // Les indices de la mise en page sont comptés par `str.split()` de Python. Un
  // `split(' ')` en JavaScript laisserait un jeton vide sur deux espaces
  // consécutifs, et tous les indices suivants glisseraient d'un cran — les mots
  // tomberaient sur la ligne du voisin. Mais le texte actuel ne contient que des
  // espaces simples : mesuré sur les 6 236 versets, les deux découpages donnent
  // exactement le même résultat, et un `split(' ')` fautif resterait donc vert.
  //
  // Ce qui est éprouvé ici est donc le **texte**, pas la fonction. Le jour où un
  // verset porterait une espace double, une espace de bord, une espace
  // insécable ou un U+FEFF — que JavaScript compte comme blanc et Python non —
  // ce test tombe, et il faut reprendre les indices au lieu de les laisser
  // glisser en silence.
  const blancs = new Map();
  const bords = [];

  for (const verset of VERSETS) {
    if (verset.text !== verset.text.trim()) bords.push(`${verset.surah}:${verset.ayah}`);
    for (const caractere of verset.text) {
      if (caractere === ' ') continue;
      // `\s` en JavaScript, et tout caractère de contrôle, que Python ne range
      // pas forcément parmi les blancs.
      if (/\s/.test(caractere) || caractere.codePointAt(0) < 0x20) {
        const cle = `U+${caractere.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
        blancs.set(cle, (blancs.get(cle) ?? 0) + 1);
      }
    }
  }

  assert.deepEqual([...blancs.entries()], [], 'blancs autres que U+0020');
  assert.deepEqual(bords, [], 'versets dont le texte porte une espace de bord');
});

test('les jetons d’un verset se recomposent au mot près', () => {
  for (const verset of VERSETS) {
    const jetons = getJetonsAyah(verset.surah, verset.ayah);
    assert.notEqual(jetons, null);
    assert.ok(jetons.every((jeton) => jeton.length > 0), `${verset.surah}:${verset.ayah}`);
    assert.equal(jetons.join(' '), verset.text, `${verset.surah}:${verset.ayah}`);
  }
});

test('la pagination retenue est celle du dépôt, et les écarts sont consignés', () => {
  // quran.com annonce une autre page pour 56 versets. Son `page_number` change
  // selon les champs demandés ; celui du dépôt est confirmé par alquran.cloud et
  // par le `page_number` par défaut de quran.com, sur les 6 236 versets. Les
  // écarts sont écrits dans le fichier, pas corrigés.
  const pagination = LAYOUT.metadata.pagination;
  assert.equal(pagination.ecartsAvecQuranCom, 56);
  assert.equal(pagination.ecarts.length, 56);

  // Chacun nomme un verset et deux pages, et la page retenue est celle du texte.
  for (const [cle, annoncee, retenue] of pagination.ecarts) {
    assert.equal(retenue, PAGE_DE.get(cle), `${cle} : la page retenue est celle du texte`);
    assert.notEqual(annoncee, retenue, `${cle} : un écart doit être un écart`);
  }

  // 5:77 est l'un d'eux : quran.com dit 120, le texte dit 121.
  assert.deepEqual(
    pagination.ecarts.find(([cle]) => cle === '5:77'),
    ['5:77', 120, 121]
  );
});

test('l’écart orthographique déclaré est unique, et il est documenté', () => {
  const declares = LAYOUT.metadata.recoupementTexte.ecartsDeclares;
  assert.deepEqual(Object.keys(declares), ['11:13']);
  assert.match(declares['11:13'], /imāla/);
  assert.equal(LAYOUT.metadata.recoupementTexte.versets, VERSETS.length);
  assert.equal(LAYOUT.metadata.recoupementTexte.identiques, VERSETS.length - 1);
});

test('les éléments de la mise en page ne portent aucune lettre coranique', () => {
  // C'est la règle du projet : le texte affiché vient de Tanzil, une seule fois.
  // Un élément qui porterait du texte serait une seconde copie, et deux copies
  // d'un même verset finissent par diverger sans que rien ne le signale.
  // Les codes compacts du fichier — `v`, `m`, `b`, `e` — sont traduits par
  // `lireElementMoushaf` ; ce que l'on reçoit ici porte le nom entier. Comparer
  // aux codes serait donc toujours faux.
  const typesConnus = new Set(['verset', 'medaillon', 'basmala', 'entete']);
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    for (const ligne of lignesDe(page)) {
      for (const element of ligne) {
        assert.ok(typesConnus.has(element.type), `élément inconnu : ${element.type}`);
        for (const [cle, valeur] of Object.entries(element)) {
          if (cle === 'type') continue;
          assert.equal(typeof valeur, 'number', `valeur non numérique dans ${element.type}`);
        }
      }
    }
  }
});
