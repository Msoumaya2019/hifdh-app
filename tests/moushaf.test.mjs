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
import {
  getMushafPageImage,
  getRatioPage,
  nomDeFichierPage,
  pageValide,
  pageBornee,
  RATIO_PAGE_PAR_DEFAUT,
  SOURCE_PAGES,
} from '@/lib/pagesMoushaf';

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

// === Les ornements de la page ==============================================
//
// Un ornement ne se mesure pas comme un mot : il n'a pas de largeur d'encre à
// confronter à l'imprimé. Ce qu'un test peut tenir, et qui compte, c'est que la
// page reste **cohérente** : les teintes des ornements sont celles relevées sur
// l'imprimé, et non celles de la charte ; le médaillon reçoit bien le caractère
// du numéro au lieu de le redessiner ; et les cartouches sont bien dimensionnés
// d'après le pas des lignes, si bien qu'ils suivent la page à toutes les tailles.
//
// Ce qui n'est PAS éprouvé ici : que le dessin ressemble à l'imprimé. Cela se
// voit, et la planche de contrôle est dans le journal de mesures.

const ORNEMENTS = readFileSync(join(RACINE, 'src/components/ornementsMoushaf.tsx'), 'utf8');

test('les ornements portent les teintes relevées sur la page imprimée', () => {
  // Ces six valeurs ont été échantillonnées sur la page 177 : le brun de
  // l'encadrement, le crème des cartouches, le violet des fleurons, l'encre.
  // Elles ne viennent pas de `src/theme`, et c'est délibéré — une page du
  // moushaf rimée aux couleurs de l'application ne serait plus le moushaf.
  for (const teinte of ['#B07B4F', '#7A4A28', '#ECDDD4', '#F2E6DC', '#6B4A9E', '#1C1C1C']) {
    assert.ok(
      ORNEMENTS.includes(teinte),
      `la teinte ${teinte} relevée sur l'imprimé a disparu des ornements`
    );
  }
});

test('le mode page affiche une image, jamais une composition', () => {
  // Le mode « page » composait la page avec la police du complexe KFGQPC — un
  // point de code par mot imprimé. Le calcul de la moindre mesure décidait donc
  // de la place des mots, et une erreur d'estimation déplaçait un mot ou faisait
  // déborder une ligne. Il affiche désormais l'image de la page imprimée.
  //
  // Ce contrôle tient la règle inverse de celle qu'il tenait avant : le lecteur
  // ne doit plus **composer** la page. Si un `MedaillonVerset`, un
  // `CartoucheNumero`, un `CadreDePage` ou un `BandeauSourate` réapparaissait
  // dans le lecteur, c'est que la composition serait revenue — et avec elle les
  // superpositions qu'on a justement retirées.
  const lecteur = readFileSync(join(RACINE, 'app/lecteur.tsx'), 'utf8');

  assert.match(
    lecteur,
    /<LecteurPageMoushaf\b/,
    'le lecteur doit monter le composant d’image de page'
  );

  for (const ornement of ['MedaillonVerset', 'CartoucheNumero', 'CadreDePage', 'BandeauSourate']) {
    assert.ok(
      !new RegExp(`<${ornement}\\b`).test(lecteur),
      `le lecteur rend encore <${ornement}> : la composition de page est revenue`
    );
  }

  // Et l'image affichée vient bien de la source centralisée, jamais d'une URL
  // écrite dans le composant.
  const composant = readFileSync(
    join(RACINE, 'src/components/LecteurPageMoushaf.tsx'),
    'utf8'
  );
  assert.match(composant, /usePageMoushaf\(/);
  assert.match(composant, /\bresizeMode="contain"/);
  assert.ok(
    !/https?:\/\//.test(composant),
    'une URL d’image est écrite dans le composant : elle doit venir de pagesMoushaf'
  );
});

test('la source des pages est centralisée et bornée', () => {
  // `getMushafPageImage` est le seul point de contact avec la source : changer
  // de fournisseur doit se faire en un endroit. Et une page hors bornes doit
  // rendre `null` plutôt que fabriquer une adresse qui répondrait 404.
  const source = readFileSync(join(RACINE, 'src/lib/pagesMoushaf.ts'), 'utf8');

  assert.match(source, /export function getMushafPageImage\(/);
  assert.match(source, /nombreDePages: 604/);
  // Le nom du fichier vient d'une fonction du numéro de page : aucune page n'est
  // écrite en dur, sinon les 604 devraient y être.
  assert.match(source, /export function nomDeFichierPage\(page: number\)/);

  assert.equal(getMushafPageImage(0), null, 'la page 0 doit être refusée');
  assert.equal(getMushafPageImage(605), null, 'la page 605 doit être refusée');
  assert.equal(getMushafPageImage(1.5), null, 'une page non entière doit être refusée');
  assert.ok(getMushafPageImage(1), 'la page 1 doit rendre une adresse');
  assert.ok(getMushafPageImage(604), 'la page 604 doit rendre une adresse');
  assert.match(getMushafPageImage(177), /page177\.png$/);
  assert.match(getMushafPageImage(1), /page001\.png$/, 'le numéro est complété à trois chiffres');
  assert.match(getMushafPageImage(177), /^https:\/\//, 'l’adresse doit être absolue');

  // Les deux prédicats qui vont avec : `pageValide` dit si une page existe,
  // `pageBornee` ramène un numéro dans les bornes. Ils servent au champ « Aller
  // à… », où l'utilisateur peut saisir n'importe quoi.
  assert.equal(pageValide(1), true);
  assert.equal(pageValide(604), true);
  assert.equal(pageValide(0), false);
  assert.equal(pageValide(605), false);
  assert.equal(pageBornee(0), 1, 'un numéro trop bas est ramené à 1');
  assert.equal(pageBornee(605), 604, 'un numéro trop haut est ramené à 604');
  assert.equal(pageBornee(177), 177, 'un numéro valide est laissé tel quel');
  assert.equal(pageBornee(Number.NaN), 1, 'une saisie vide retombe sur la page 1');
});

test('le nom servi est celui des pages rangées dans le dépôt', () => {
  // Le nom est fabriqué par le code et l'adresse est construite à partir de lui.
  // S'il divergeait des fichiers, les 604 pages répondraient 404 — et rien, à
  // l'écran, ne dirait pourquoi. Le contrôle complet est en Python
  // (`npm run verifier:pages-moushaf`, qui lit les 604 en-têtes) ; ici on tient
  // la convention elle-même, et l'existence de quelques pages témoins.
  const dossier = join(RACINE, SOURCE_PAGES.dossier);

  assert.equal(nomDeFichierPage(1), 'page001.png');
  assert.equal(nomDeFichierPage(7), 'page007.png', 'le remplissage à trois chiffres');
  assert.equal(nomDeFichierPage(99), 'page099.png');
  assert.equal(nomDeFichierPage(100), 'page100.png');
  assert.equal(nomDeFichierPage(604), 'page604.png');

  for (const page of [1, 2, 7, 177, 300, 454, 604]) {
    const chemin = join(dossier, nomDeFichierPage(page));
    assert.ok(existsSync(chemin), `la page ${page} devrait être rangée dans le dépôt`);
    assert.ok(statSync(chemin).size > 1000, `la page ${page} ne devrait pas être vide`);
  }

  // Et l'adresse se termine bien par ce nom-là.
  for (const page of [1, 177, 604]) {
    assert.ok(
      getMushafPageImage(page).endsWith(`/${SOURCE_PAGES.dossier}/${nomDeFichierPage(page)}`),
      `l’adresse de la page ${page} devrait finir par le nom du fichier rangé`
    );
  }
});

test('la place réservée avant chargement est le format réel des pages', () => {
  // Une place réservée fausse ne se voit pas sur une image : elle se voit au
  // moment où l'image arrive, quand la page saute et que les boutons se
  // déplacent sous le doigt. Les 604 pages ont le même format — mesuré —, donc
  // le rapport est une constante, et c'est le format qui la fixe.
  assert.equal(RATIO_PAGE_PAR_DEFAUT, 3106 / 1920);
  assert.equal(RATIO_PAGE_PAR_DEFAUT.toFixed(5), '1.61771');
  assert.equal(getRatioPage(1), RATIO_PAGE_PAR_DEFAUT);
  assert.equal(getRatioPage(604), RATIO_PAGE_PAR_DEFAUT);
});

test('les cartouches se dimensionnent sur le pas des lignes', () => {
  // Garde conservée pour le module d'ornements, qui reste la référence des
  // teintes relevées sur l'imprimé. Les cartouches ne sont plus montés par le
  // lecteur, mais un cartouche à taille fixe en pixels resterait un défaut : il
  // déborderait sur un petit écran. On vérifie donc que le composant prend
  // toujours ses dimensions en paramètre, au lieu de les fixer.
  const ornements = readFileSync(join(RACINE, 'src/components/ornementsMoushaf.tsx'), 'utf8');

  for (const composant of ['CartoucheNumero', 'BandeauSourate', 'CadreDePage', 'MedaillonVerset']) {
    const corps = ornements.match(
      new RegExp(`export function ${composant}\\(\\{[\\s\\S]*?\\n\\}\\n`)
    );
    assert.ok(corps, `le composant ${composant} est introuvable`);
  }

  // Les dimensions arrivent bien par les propriétés, jamais écrites en dur.
  assert.match(ornements, /largeur[,:]/, 'CartoucheNumero doit recevoir sa largeur');
  assert.match(ornements, /hauteur[,:]/, 'CartoucheNumero doit recevoir sa hauteur');

  // Le médaillon est un SUPPORT : son ovale se pose derrière le numéro que la
  // police de page dessine déjà. Il doit donc accepter ce numéro, sinon la
  // pastille serait dessinée vide — le défaut le plus discret de tous, puisque
  // la page resterait « correcte » à l'œil d'un test qui ne regarde que la
  // forme de la signature.
  //
  // Ce contrôle manquait : une mutation retirant `children?: ReactNode;`
  // laissait le fichier vert, la signature `({...})` restant valide sans cette
  // propriété. On exige donc la déclaration ET son emploi.
  const medaillon = ornements.match(
    /export function MedaillonVerset\(\{[\s\S]*?\n\}\n/
  );
  assert.ok(medaillon, 'MedaillonVerset est introuvable');
  assert.match(
    medaillon[0],
    /children\??:\s*ReactNode/,
    'MedaillonVerset doit accepter un caractère à dessiner (children)'
  );
  assert.match(
    medaillon[0],
    /\{children\}/,
    'MedaillonVerset accepte children mais ne le dessine pas : la pastille resterait vide'
  );
});

test("aucun ornement ne dessine de texte coranique", () => {
  // Règle du projet, tenue par un test : le module d'ornements ne doit contenir
  // aucun caractère arabe **dans son code**. Les ornements sont de la forme ; le
  // texte vient de Tanzil et des polices de page, jamais d'un littéral écrit ici.
  //
  // Les commentaires sont retirés avant de chercher : ils ont le droit de citer
  // `سُورَةُ` ou un numéro de page en chiffres arabes pour expliquer ce qui se
  // passe à l'écran, et un caractère dans un commentaire ne se dessine pas.
  const sansCommentaires = ORNEMENTS
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  const arabes = sansCommentaires.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFC79]/g) ?? [];
  assert.deepEqual(
    arabes,
    [],
    `des caractères arabes ont été écrits dans les ornements : ${arabes.join('')}`
  );
});

test('l’encadrement et le bandeau restent en fond, sans occuper de place', () => {
  // Le cadre et le bandeau de sourate ont été retirés du lecteur en même temps
  // que la composition : l'image de la page les porte déjà, et les superposer
  // donnerait deux encadrements décalés — exactement le défaut qu'on corrige.
  //
  // Mais le module d'ornements reste, et la propriété qui les rendait inoffensifs
  // doit y survivre : un `Svg` de fond posé en flux pousserait le texte vers le
  // bas. On garde donc le contrôle sur le module.
  assert.match(ORNEMENTS, /position: 'absolute'/);

  const lecteur = readFileSync(join(RACINE, 'app/lecteur.tsx'), 'utf8');
  assert.ok(
    !/styles\.bandeauDerriereLigne/.test(lecteur),
    'le lecteur pose encore un bandeau de fond : l’image le porte déjà'
  );
  assert.ok(
    !/<CadreDePage\b/.test(lecteur),
    'le lecteur redessine un cadre : l’image le porte déjà'
  );
});
