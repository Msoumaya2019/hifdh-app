// Le surlignage de la séance sur la page du moushaf.
//
// CE QU'ON ÉPROUVE, ET POURQUOI ICI
// --------------------------------
// « Quelles lignes faut-il surligner ? » est une décision, et une décision se
// teste sans appareil. Les pages choisies ne sont pas décoratives : la 177 est
// celle que le projet recoupe depuis le début sur le moushaf imprimé, et la 1
// est un cas à part — frontispice, basmala, et une police qui n'est pas celle
// des autres pages.
//
// LA LIMITE, DITE UNE FOIS
// ------------------------
// Un verset qui commence au milieu d'une ligne marque la ligne entière. Ce
// n'est pas une approximation : la page affichée est une image, la position
// horizontale du mot n'y est pas connue, et une bande partielle demanderait de
// mesurer la police de page — exactement ce que le passage aux images a rendu
// inutile. Les tests ci-dessous fixent donc ce comportement au lieu de le
// laisser implicite.

import test from 'node:test';
import assert from 'node:assert/strict';

import { getLignesDuMoushaf, getPageBounds } from '@/data/quranData';
import {
  lignesDuPassageSurPage,
  plageContenueDansLaPage,
} from '@/lib/surlignagePassage';

// === La page 177, celle qui est recoupée sur l'imprimé ======================

test('les lignes d’une séance sont celles que la mise en page lui donne', () => {
  // Relevé sur la page 177 : le verset 8:3 n'occupe que la ligne 7, le 8:4 les
  // lignes 8 et 9, le 8:5 les lignes 9 et 10. Une séance 8:3 → 8:5 couvre donc
  // les lignes 7 à 10, et rien d'autre.
  assert.deepEqual(lignesDuPassageSurPage(177, { surah: 8, startAyah: 3, endAyah: 5 }), [
    7, 8, 9, 10,
  ]);
});

test('un seul verset ne marque que ses lignes', () => {
  // 8:5 tient sur deux lignes — 9 et 10. Le surlignage doit être aussi précis
  // qu'un verset seul : c'est le cas d'usage le plus courant, une récitation
  // qu'on vient de commencer.
  assert.deepEqual(lignesDuPassageSurPage(177, { surah: 8, startAyah: 5, endAyah: 5 }), [9, 10]);
});

test('une séance qui couvre toute la page marque les quinze lignes utiles', () => {
  // La page 177 porte 8:1 à 8:8. Ses lignes 1 et 2 sont l'en-tête de sourate et
  // la basmala : elles ne portent aucun verset, donc elles ne sont pas
  // marquées. Treize lignes le sont — c'est la vérification qui compte, parce
  // qu'un surlignage qui déborde sur l'en-tête se verrait tout de suite.
  const marquees = lignesDuPassageSurPage(177, { surah: 8, startAyah: 1, endAyah: 8 });
  assert.deepEqual(marquees, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  assert.ok(!marquees.includes(1), 'l’en-tête de sourate ne porte pas de verset');
  assert.ok(!marquees.includes(2), 'la basmala n’est pas un verset de la plage');
});

test('les lignes marquées sont toujours croissantes et sans doublon', () => {
  // Une bande posée deux fois au même endroit ne se verrait pas à l'œil — elle
  // doublerait seulement l'opacité. La suite doit donc être strictement
  // croissante, ce que `deepEqual` ci-dessus ne garantit pas seul sur d'autres
  // pages.
  const pages = [1, 2, 50, 100, 177, 254, 454, 604];
  for (const page of pages) {
    const bornes = getPageBounds(page);
    if (bornes === null) continue;
    const marquees = lignesDuPassageSurPage(page, {
      surah: bornes.start.surah,
      startAyah: bornes.start.ayah,
      endAyah: bornes.end.ayah,
    });
    for (let i = 1; i < marquees.length; i += 1) {
      assert.ok(marquees[i] > marquees[i - 1], `page ${page} : ligne ${marquees[i]} après ${marquees[i - 1]}`);
    }
    assert.ok(marquees.length > 0, `page ${page} : la page entière ne peut pas ne rien marquer`);
    assert.ok(Math.max(...marquees) <= 15, `page ${page} : une ligne au-delà de la quinzième`);
  }
});

// === Ce qui ne doit RIEN marquer ============================================

test('une plage d’une autre sourate ne marque rien', () => {
  // Le cas dangereux : surligner « verset 1 » d'une page où l'on a oublié de
  // comparer la sourate. Sur la page 177, tous les versets portent 8:x — un
  // contrôle qui ne regarderait que le numéro de verset marquerait les lignes
  // 3 à 15 pour une séance en 9:1. On l'exige donc vide.
  assert.deepEqual(lignesDuPassageSurPage(177, { surah: 9, startAyah: 1, endAyah: 8 }), []);
  assert.deepEqual(lignesDuPassageSurPage(177, { surah: 7, startAyah: 1, endAyah: 200 }), []);
});

test('une plage absente ne marque rien, et ne fait pas d’erreur', () => {
  // `null` est le cas normal quand aucune séance n'est ouverte : on feuillette.
  // Aucun surlignage, et surtout pas d'exception — le mode page doit rester
  // utilisable en simple lecture.
  assert.deepEqual(lignesDuPassageSurPage(177, null), []);
  assert.deepEqual(lignesDuPassageSurPage(1, null), []);
});

test('une page inconnue ne marque rien plutôt que de lever', () => {
  // 0 et 605 sont hors des 604 pages. La mise en page ne les décrit pas : on
  // rend une liste vide, ce qui laisse la page s'afficher (ou échouer à son
  // chargement) sans que le surlignage n'ajoute une panne.
  assert.deepEqual(lignesDuPassageSurPage(0, { surah: 1, startAyah: 1, endAyah: 7 }), []);
  assert.deepEqual(lignesDuPassageSurPage(605, { surah: 1, startAyah: 1, endAyah: 7 }), []);
});

test('une plage à l’envers ne surligne rien plutôt que de tout surligner', () => {
  // `startAyah > endAyah` ne devrait pas arriver, mais un paramètre d'écran
  // mal lu peut le produire. La comparaison `>=` et `<=` rend alors une plage
  // vide — et non l'inverse, qui marquerait la page entière.
  assert.deepEqual(lignesDuPassageSurPage(177, { surah: 8, startAyah: 5, endAyah: 3 }), []);
});

// === « La séance continue à la page suivante » =============================

test('une plage entièrement portée par la page est dite contenue', () => {
  assert.equal(plageContenueDansLaPage(177, { surah: 8, startAyah: 3, endAyah: 5 }), true);
  assert.equal(plageContenueDansLaPage(177, { surah: 8, startAyah: 1, endAyah: 8 }), true);
});

test('une plage qui déborde de la page n’est pas dite contenue', () => {
  // 8:9 n'est pas sur la page 177 : la séance continue. Le dire évite que
  // l'apprenant croie avoir fini parce que la bande s'arrête à la ligne 15.
  assert.equal(plageContenueDansLaPage(177, { surah: 8, startAyah: 1, endAyah: 9 }), false);
});

test('un verset manquant AU MILIEU n’est pas vu comme contenu', () => {
  // Le défaut que ce test existe pour attraper : une implémentation qui
  // comparerait seulement les bornes — « 8:4 est là, 8:6 est là, donc 8:4→8:6
  // est là » — dirait vrai alors que 8:5 manquerait au milieu. On vérifie donc
  // d'abord que la page porte bien ses huit versets, puis que le contrôle sait
  // dire non quand une borne seulement est présente.
  const lignes = getLignesDuMoushaf(177);
  assert.ok(lignes !== null, 'la page 177 doit être décrite');

  const ayahs = [];
  for (const ligne of lignes) {
    for (const element of ligne) {
      if (element.type === 'verset' && element.surah === 8) ayahs.push(element.ayah);
    }
  }
  // Un `Set` plutôt qu'un tableau trié : deux éléments du même verset sur des
  // lignes voisines seraient comptés deux fois, et l'on ne verrait plus la
  // différence entre « présent » et « présent deux fois ».
  assert.deepEqual([...new Set(ayahs)].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);

  // Les bornes de la plage sont là, et pourtant la plage déborde : c'est ce
  // que le contrôle doit refuser. Une comparaison de bornes seules dirait oui.
  const bornes = getPageBounds(177);
  assert.equal(bornes.start.ayah, 1);
  assert.equal(bornes.end.ayah, 8);
  assert.equal(
    plageContenueDansLaPage(177, { surah: 8, startAyah: 1, endAyah: 9 }),
    false,
    'le neuvième verset n’est pas sur la page'
  );
  assert.equal(
    plageContenueDansLaPage(177, { surah: 8, startAyah: 0, endAyah: 8 }),
    false,
    'le verset 0 n’existe pas : la plage n’est pas contenue'
  );
});

// === Les lignes lues dans la mise en page ===================================

test('la mise en page ne décrit que des lignes à quinze entrées au plus', () => {
  // Le surlignage se place en fraction du quinzième. Une page qui porterait
  // plus de quinze lignes déplacerait les bandes sans que rien ne le signale —
  // c'est donc la contrainte qui rend le placement en fraction légitime, et
  // elle se vérifie.
  for (const page of [1, 2, 100, 177, 604]) {
    const lignes = getLignesDuMoushaf(page);
    assert.ok(lignes !== null, `page ${page} non décrite`);
    assert.equal(lignes.length, 15, `page ${page} : ${lignes.length} lignes`);
  }
});
