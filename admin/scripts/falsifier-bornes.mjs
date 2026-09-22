#!/usr/bin/env node
// ============================================================================
// Falsification des controles de bornes de toumoun.
//
// Pour chaque mutation, on reintroduit volontairement le defaut que le test
// pretend couvrir, on verifie que le test echoue, puis on restaure le fichier
// d'origine et on prouve la restauration par empreinte SHA-256.
//
// Une mutation non detectee signifie que le test ne prouve rien.
//
// Ce que ces mutations representent, en clair — chacune est un defaut qu'un
// relecteur ne verrait pas a l'oeil sur l'ecran :
//
//   - une borne verifiee presentee comme estimee, ou l'inverse : le tableau de
//     bord demanderait de relire 480 bornes au lieu de 151, ou n'en demanderait
//     aucune alors que 151 restent ;
//   - une borne estimee qui a l'air de tomber juste alors que le decalage a
//     joue : c'est exactement ce que la specification interdit de presenter ;
//   - une liste dans le desordre, ou un verset situe une sourate trop loin ;
//   - un controle de coherence trop laxiste, qui laisserait enregistrer une
//     borne impossible et l'exporterait vers l'application.
//
// Les mutations s'appliquent au niveau OCTET, sur des ancres d'une seule ligne
// et en ASCII pur. Une ancre qui traverserait un retour a la ligne ne
// correspondrait pas — sans erreur — et la mutation serait comptee comme
// « non detectee » pour une raison qui n'a rien a voir avec le test.
// ============================================================================

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ICI = dirname(fileURLToPath(import.meta.url));
const ADMIN = join(ICI, '..');
const FICHIER = join(ADMIN, 'src', 'lib', 'bornes.ts');
const FICHIER_TEST = 'tests/bornes.test.mjs';

const MUTATIONS = [
  {
    nom: 'toutes les bornes sortent, estimees ou non',
    avant: `.filter((t) => t.verificationStatus === 'estimated_offset')`,
    apres: `.filter(() => true)`,
    test: 'rend exactement les 151 bornes estimees',
  },
  {
    nom: 'seules les bornes verifiees sortent',
    avant: `.filter((t) => t.verificationStatus === 'estimated_offset')`,
    apres: `.filter((t) => t.verificationStatus === 'verified_hafs')`,
    test: 'ne retient aucune borne verifiee',
  },
  {
    nom: "l'ecart avec la reference Qaloun s'inverse",
    // L'ancre porte sur la comparaison des sourates seule, sur une ligne : la
    // condition est ecrite sur trois lignes dans `bornes.ts`, et une ancre qui
    // traverserait un retour a la ligne ne correspondrait pas — sans erreur.
    avant: '          limiteEstimee.surah !== limiteQaloun.surah ||',
    apres: '          limiteEstimee.surah === limiteQaloun.surah ||',
    test: "marque l'ecart quand la valeur Qaloun differe",
  },
  {
    nom: "l'ordre du Coran s'inverse",
    avant: '  return a.thumnNumber - b.thumnNumber;',
    apres: '  return b.thumnNumber - a.thumnNumber;',
    test: "rend les bornes dans l'ordre du Coran",
  },
  {
    nom: 'le regroupement suit la reference Qaloun au lieu de la limite estimee',
    avant: 'const cle = borne.limiteEstimee.surah;',
    apres: 'const cle = borne.limiteQaloun.surah;',
    test: 'range une borne sous la sourate de sa limite, non de sa reference Qaloun',
  },
  {
    nom: 'un verset est situe un rang trop loin',
    avant: 'return sourate.startAyahId + borne.ayah - 1;',
    apres: 'return sourate.startAyahId + borne.ayah;',
    test: 'situe le premier verset du Coran',
  },
  {
    nom: 'un verset au-dela de la sourate est accepte',
    avant:
      'if (!Number.isInteger(borne.ayah) || borne.ayah < 1 || borne.ayah > sourate.ayahCount) {',
    apres: 'if (!Number.isInteger(borne.ayah) || borne.ayah < 1) {',
    test: 'refuse un verset au-dela de la sourate',
  },
  {
    nom: 'une limite anterieure au toumoun precedent est acceptee',
    avant: 'if (precedent && cible <= precedent.index) {',
    apres: 'if (precedent && cible < precedent.index) {',
    test: 'refuse une limite qui precederait le debut du toumoun precedent',
  },
  {
    nom: 'une limite qui recouvrirait le toumoun suivant est acceptee',
    avant: 'if (suivant && cible >= suivant.index) {',
    apres: 'if (suivant && cible > suivant.index) {',
    test: 'refuse une limite qui atteindrait le debut du toumoun suivant',
  },
  {
    nom: "la position d'un toumoun est prise a sa fin au lieu de son debut",
    // Le test vise affirme la VALEUR de l'index, et il le faut : un test qui se
    // contenterait de verifier qu'une limite trop basse est refusee passerait
    // quand meme, parce que l'index de la fin reste plus grand que celui du
    // debut du toumoun precedent. Seule la valeur distingue les deux.
    avant: '      index: t.hafs.startAyahId,',
    apres: '      index: t.hafs.endAyahId,',
    test: 'porte le premier verset du toumoun et sa position globale',
  },
  {
    nom: 'une rupture de continuite passe inapercue',
    avant: 'if (courant.hafs.startAyahId !== attendu) {',
    apres: 'if (courant.hafs.startAyahId === attendu) {',
    test: 'signale un trou entre deux toumoun',
  },
];

const empreinte = (chemin) =>
  createHash('sha256').update(readFileSync(chemin)).digest('hex');

/**
 * Lance le test vise et rend ce qu'il faut pour juger : passe-t-il, et
 * a-t-il seulement ete execute ?
 *
 * Le second point n'est pas un detail. `node --test --test-name-pattern` sort
 * en 0 quand le motif ne correspond a AUCUN test : un nom mal orthographie
 * passerait donc pour un test vert, et la mutation serait comptee « non
 * detectee » — un faux negatif qui accuserait le code au lieu du harnais. Le
 * compte de tests lus dans la sortie TAP est ce qui l'empeche.
 */
function lancerTest(nomTest) {
  const resultat = spawnSync(
    process.execPath,
    [
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      '--test',
      '--test-name-pattern',
      nomTest,
      FICHIER_TEST,
    ],
    { cwd: ADMIN, encoding: 'utf8' }
  );
  const sortie = `${resultat.stdout ?? ''}${resultat.stderr ?? ''}`;
  const compte = /^# tests (\d+)$/m.exec(sortie);
  return {
    passe: resultat.status === 0,
    executes: compte ? Number(compte[1]) : 0,
  };
}

/**
 * Remplace `avant` par `apres` au niveau octet.
 *
 * Refuse d'ecrire si l'ancre n'est pas unique : une ancre ambigue ferait
 * muter un autre endroit que celui vise, et le resultat ne dirait plus rien
 * du test.
 */
function appliquer(avant, apres) {
  const contenu = readFileSync(FICHIER);
  const motif = Buffer.from(avant, 'utf8');

  // Compter sur les octets, jamais sur le texte : un motif accentue lu comme
  // une chaine se comparerait mal, et l'on conclurait a une ancre absente
  // alors qu'elle est la.
  const premier = contenu.indexOf(motif);
  const dernier = contenu.lastIndexOf(motif);
  const occurrences = premier === -1 ? 0 : premier === dernier ? 1 : 2;

  if (occurrences !== 1) {
    throw new Error(
      `ancre ${occurrences === 0 ? 'absente' : 'non unique'} dans bornes.ts : ` +
        `${occurrences} occurrence(s) pour ${JSON.stringify(avant)} — refus d'ecrire`
    );
  }

  const resultat = Buffer.concat([
    contenu.subarray(0, premier),
    Buffer.from(apres, 'utf8'),
    contenu.subarray(premier + motif.length),
  ]);
  writeFileSync(FICHIER, resultat);
}

function main() {
  const original = readFileSync(FICHIER);
  const attendue = empreinte(FICHIER);

  // Un test doit d'abord passer avant qu'on mute quoi que ce soit : sinon un
  // echec du a un fichier deja casse, ou a un nom de test qui ne correspond a
  // rien, serait compte comme une detection.
  //
  // Le controle porte sur DEUX choses : le test passe, et il a bien ete
  // execute. Un motif qui ne correspond a aucun test fait sortir `node --test`
  // en 0 — vert, et vide. Sans le compte, la mutation serait declaree « non
  // detectee » et l'on chercherait le defaut dans le code au lieu du harnais.
  console.log('=== temoin ===');
  for (const mutation of MUTATIONS) {
    const { passe, executes } = lancerTest(mutation.test);
    if (executes === 0) {
      console.log(
        `ECHEC : aucun test ne repond a « ${mutation.test} ».\n` +
          `  Le motif ne correspond a rien dans ${FICHIER_TEST} : verifier le nom ` +
          `exact. La mutation serait comptee « non detectee » pour cette raison, ` +
          `qui n'a rien a voir avec le code.`
      );
      return 1;
    }
    if (!passe) {
      console.log(
        `ECHEC : le test « ${mutation.test} » ne passe pas sur le fichier intact.\n` +
          `  Le fichier est deja casse, ou le test est faux : dans les deux cas, ` +
          `une mutation « detectee » ne prouverait rien.`
      );
      return 1;
    }
  }
  console.log(
    `les ${MUTATIONS.length} mutations visent un test qui existe et qui passe ` +
      `sur le fichier intact`
  );

  const resultats = [];
  try {
    for (const mutation of MUTATIONS) {
      // Restaurer avant chaque mutation : sans cela les mutations s'empilent,
      // et l'une est « detectee » par l'effet d'une autre.
      writeFileSync(FICHIER, original);
      appliquer(mutation.avant, mutation.apres);
      const { passe } = lancerTest(mutation.test);
      const detecte = !passe;
      resultats.push({ nom: mutation.nom, test: mutation.test, detecte });
      console.log(`${detecte ? 'DETECTE    ' : 'NON DETECTE'}  ${mutation.nom}`);
    }
  } finally {
    writeFileSync(FICHIER, original);
  }

  console.log('\n=== restauration ===');
  const obtenue = empreinte(FICHIER);
  let restaurationOk = obtenue === attendue;
  console.log(
    `bornes.ts: ${restaurationOk ? 'identique' : 'DIFFERENTE'} (${obtenue.slice(0, 16)}…)`
  );

  // Les controles doivent repasser au vert sur le fichier restaure : une
  // restauration qui laisserait le fichier dans un etat intermediaire se
  // verrait ici, et non dans la seule empreinte.
  console.log('\n=== les controles repassent au vert ===');
  for (const mutation of MUTATIONS) {
    const { passe, executes } = lancerTest(mutation.test);
    if (executes === 0 || !passe) {
      console.log(`ECHEC : « ${mutation.test} » ne repasse pas apres restauration`);
      restaurationOk = false;
    }
  }
  if (restaurationOk) console.log('OK     tous les controles vises repassent');

  const nonDetectees = resultats.filter((r) => !r.detecte).map((r) => r.nom);
  console.log(
    `\n${resultats.length - nonDetectees.length}/${resultats.length} mutations detectees`
  );
  if (nonDetectees.length > 0) {
    console.log('Non detectees : ' + nonDetectees.join(', '));
  }
  return nonDetectees.length > 0 || !restaurationOk ? 1 : 0;
}

process.exit(main());
