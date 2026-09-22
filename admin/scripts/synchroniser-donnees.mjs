#!/usr/bin/env node
// ============================================================================
// Synchronisation des donnees coraniques vers le tableau de bord.
//
// Le tableau de bord a besoin de deux fichiers de l'application :
//   data/quran/thumn_hafs.json  — les 480 toumoun et leur statut de verification
//   data/quran/surahs.json      — les 114 sourates et leur nombre de versets
//
// Il ne les lit pas depuis le dossier de l'application, pour deux raisons :
//
//   1. un `next build` execute ailleurs — dans un conteneur, sur un autre poste —
//      n'aurait pas ce dossier, et le tableau de bord ne se construirait pas ;
//   2. la duplication serait silencieuse : rien ne dirait qu'une correction
//      appliquee dans l'application n'est pas arrivee jusqu'ici.
//
// La copie est donc explicite, faite a l'octet, et accompagnee d'une empreinte.
// `--verifier` refuse toute divergence entre la source et la copie, et entre
// la copie et l'empreinte enregistree. C'est le meme principe que
// `rapport_divisions_estimees.py --verifier` cote application.
//
// Ce script ne fabrique aucune donnee : il recopie. Un fichier absent est une
// erreur, jamais une liste vide.
// ============================================================================

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const ADMIN = join(ICI, '..');
const RACINE_DEPOT = join(ADMIN, '..');

const DOSSIER_CIBLE = join(ADMIN, 'src', 'donnees');
const FICHIER_EMPREINTE = join(DOSSIER_CIBLE, 'EMPREINTE.json');

// La source est decrite par un chemin relatif a la racine du depot : le fichier
// d'empreinte reste ainsi lisible et comparable d'une machine a l'autre.
const SOURCES = [
  {
    cle: 'thumn_hafs',
    source: join('data', 'quran', 'thumn_hafs.json'),
    copie: 'thumn_hafs.json',
    role: 'Les 480 toumoun et leur statut de verification.',
  },
  {
    cle: 'surahs',
    source: join('data', 'quran', 'surahs.json'),
    copie: 'surahs.json',
    role: 'Les 114 sourates : nom, nombre de versets, premier verset global.',
  },
];

const verifier = process.argv.includes('--verifier');

/** Empreinte SHA-256, calculee sur les octets et non sur le texte. */
function empreinte(chemin) {
  return createHash('sha256').update(readFileSync(chemin)).digest('hex');
}

function octets(chemin) {
  return readFileSync(chemin).length;
}

/** Erreur portant un message deja redige pour la personne qui lira la sortie. */
class Echec extends Error {}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

function verifierCoherence(entrees) {
  const problemes = [];

  for (const entree of entrees) {
    const cheminSource = join(RACINE_DEPOT, entree.source);
    const cheminCopie = join(DOSSIER_CIBLE, entree.copie);

    if (!existsSync(cheminSource)) {
      problemes.push(
        `source absente : ${entree.source}\n` +
          `    Le tableau de bord ne peut pas etre verifie sans elle. ` +
          `Si le fichier a ete deplace, corriger SOURCES dans ce script.`
      );
      continue;
    }
    if (!existsSync(cheminCopie)) {
      problemes.push(
        `copie absente : src/donnees/${entree.copie}\n` +
          `    Lancer « npm run donnees:synchroniser ».`
      );
      continue;
    }

    const hSource = empreinte(cheminSource);
    const hCopie = empreinte(cheminCopie);

    if (hSource !== hCopie) {
      problemes.push(
        `copie divergente : src/donnees/${entree.copie}\n` +
          `    source ${hSource.slice(0, 16)}…  copie ${hCopie.slice(0, 16)}…\n` +
          `    Lancer « npm run donnees:synchroniser ».`
      );
      continue;
    }

    if (entree.empreinteSource && entree.empreinteSource !== hSource) {
      problemes.push(
        `source modifiee depuis la derniere synchronisation : ${entree.source}\n` +
          `    empreinte enregistree ${entree.empreinteSource.slice(0, 16)}…  ` +
          `empreinte actuelle ${hSource.slice(0, 16)}…\n` +
          `    Lancer « npm run donnees:synchroniser », puis relire le tableau de bord.`
      );
    }
  }

  return problemes;
}

// ---------------------------------------------------------------------------
// Synchronisation
// ---------------------------------------------------------------------------

function synchroniser() {
  mkdirSync(DOSSIER_CIBLE, { recursive: true });

  const entrees = [];

  for (const { cle, source, copie, role } of SOURCES) {
    const cheminSource = join(RACINE_DEPOT, source);
    if (!existsSync(cheminSource)) {
      throw new Echec(
        `Source introuvable : ${source}\n` +
          `  Cherchee depuis la racine du depot : ${RACINE_DEPOT}\n` +
          `  Le tableau de bord se construit a cote de l'application ; ` +
          `verifier que les deux dossiers sont bien freres.`
      );
    }

    // Copie a l'octet : `readFileSync` rend un Buffer, `writeFileSync` l'ecrit
    // tel quel. Passer par une chaine reencoderait le fichier et changerait
    // silencieusement ses fins de ligne.
    const donnees = readFileSync(cheminSource);
    writeFileSync(join(DOSSIER_CIBLE, copie), donnees);

    entrees.push({
      cle,
      source: source.split('\\').join('/'),
      copie,
      role,
      empreinteSource: createHash('sha256').update(donnees).digest('hex'),
      octets: donnees.length,
    });
  }

  writeFileSync(
    FICHIER_EMPREINTE,
    JSON.stringify(
      {
        avertissement:
          'Fichier engendre par admin/scripts/synchroniser-donnees.mjs. ' +
          'Ne pas le modifier a la main : le script le reecrit, et ' +
          '« npm run donnees:verifier » refuse toute divergence.',
        fichiers: entrees,
      },
      null,
      2
    ) + '\n'
  );

  return entrees;
}

// ---------------------------------------------------------------------------

try {
  if (verifier) {
    if (!existsSync(FICHIER_EMPREINTE)) {
      throw new Echec(
        'Empreinte absente : src/donnees/EMPREINTE.json\n' +
          "  Rien n'a jamais ete synchronise. Lancer « npm run donnees:synchroniser »."
      );
    }
    const enregistre = JSON.parse(readFileSync(FICHIER_EMPREINTE, 'utf8'));
    const parCle = new Map(enregistre.fichiers.map((f) => [f.cle, f]));

    const entrees = SOURCES.map(({ cle, source, copie, role }) => {
      const connu = parCle.get(cle);
      if (!connu) {
        throw new Echec(
          `L'empreinte enregistree ne connait pas « ${cle} ». ` +
            'Lancer « npm run donnees:synchroniser ».'
        );
      }
      return { cle, source: source.split('\\').join('/'), copie, role, empreinteSource: connu.empreinteSource };
    });

    const problemes = verifierCoherence(entrees);

    if (problemes.length > 0) {
      console.error('Synchronisation des donnees : ECHEC\n');
      for (const p of problemes) console.error(`  - ${p}\n`);
      console.error(`${problemes.length} probleme(s).`);
      process.exit(1);
    }

    console.log('Synchronisation des donnees : OK');
    for (const entree of entrees) {
      const cheminCopie = join(DOSSIER_CIBLE, entree.copie);
      console.log(
        `  ${entree.copie.padEnd(20)} ${String(octets(cheminCopie)).padStart(7)} octets  ` +
          `${entree.empreinteSource.slice(0, 16)}…  <- ${entree.source}`
      );
    }
  } else {
    const entrees = synchroniser();
    console.log('Donnees synchronisees depuis l\'application :');
    for (const entree of entrees) {
      console.log(
        `  ${entree.copie.padEnd(20)} ${String(entree.octets).padStart(7)} octets  ` +
          `${entree.empreinteSource.slice(0, 16)}…  <- ${entree.source}`
      );
    }
    console.log(`\nEmpreinte ecrite : ${relative(ADMIN, FICHIER_EMPREINTE).split('\\').join('/')}`);
  }
} catch (erreur) {
  if (erreur instanceof Echec) {
    console.error(`Synchronisation des donnees : ECHEC\n\n${erreur.message}`);
    process.exit(1);
  }
  throw erreur;
}
