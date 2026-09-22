/**
 * Engendrer la table qui rend les 604 polices de page joignables depuis le code.
 *
 * POURQUOI CETTE TABLE EXISTE, ET POURQUOI ELLE EST ENGENDREE
 * -----------------------------------------------------------
 * Metro — l'empaqueteur d'Expo — ne resout un `require` que si le chemin est
 * **ecrit en clair** dans le source. `require(`./p${page}.ttf`)` n'est pas
 * resolu : Metro ne parcourt pas le dossier pour deviner ce que la variable
 * vaudra. Les 604 chemins doivent donc figurer un par un.
 *
 * Une table ecrite a la main deriverait : une page ajoutee, une police
 * renommee, et le rendu tomberait sur `undefined` sans que rien ne le dise —
 * sauf a l'ecran, sur une page blanche. Cette table est donc engendree depuis
 * le manifeste, et `--verifier` refuse qu'elle s'en ecarte.
 *
 * CE QU'ELLE NE FAIT PAS
 * ----------------------
 * Elle ne recopie aucune police et n'ecrit aucun octet de police : elle ecrit
 * des chemins. Les fichiers viennent de `scripts/recuperer_polices_pages.py`,
 * qui les telecharge et les hache.
 *
 * Usage :
 *     node scripts/generer_polices_pages_ts.mjs              # engendre
 *     node scripts/generer_polices_pages_ts.mjs --verifier   # controle
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFESTE = join(RACINE, 'data', 'quran', 'polices_pages.json');
const DOSSIER = join(RACINE, 'assets', 'polices-pages');
const SORTIE = join(RACINE, 'src', 'data', 'policesPages.ts');

const NOMBRE_DE_PAGES = 604;

/** L'empreinte SHA-256 du fichier, telle que le manifeste la porte. */
function empreinte(chemin) {
  return createHash('sha256').update(readFileSync(chemin)).digest('hex');
}

function lireManifeste() {
  if (!existsSync(MANIFESTE)) {
    throw new Error(
      `manifeste absent : ${relative(RACINE, MANIFESTE)}\n` +
        "Lancer d'abord : python scripts/recuperer_polices_pages.py"
    );
  }
  return JSON.parse(readFileSync(MANIFESTE, 'utf8'));
}

/**
 * Le contenu attendu de la table, et les defauts trouves en chemin.
 *
 * Les defauts sont rendus plutot que leves : un manque de polices doit se lire
 * en entier — « il en manque 37 » est une information, « la page 12 est
 * absente » une impasse.
 */
function composer() {
  const manifeste = lireManifeste();
  const pages = manifeste.pages ?? {};
  const defauts = [];

  const lignes = [];
  for (let page = 1; page <= NOMBRE_DE_PAGES; page++) {
    const entree = pages[String(page)];
    if (entree === undefined) {
      defauts.push(`page ${page} : absente du manifeste`);
      continue;
    }
    const chemin = join(DOSSIER, entree.fichier);
    if (!existsSync(chemin)) {
      defauts.push(`page ${page} : fichier manquant ${entree.fichier}`);
      continue;
    }
    lignes.push(`  ${page}: require('../../assets/polices-pages/${entree.fichier}'),`);
  }

  const contenu = [
    '/**',
    ' * Les 604 polices de page du moushaf, par numero de page.',
    ' *',
    ' * ENGENDRE par scripts/generer_polices_pages_ts.mjs — ne pas modifier a la',
    ' * main. Le controle `npm run verifier:polices-ts` refuse une table qui',
    " * s'ecarterait du manifeste `data/quran/polices_pages.json`.",
    ' *',
    ' * Les chemins sont ecrits en clair, un par page, parce que Metro ne resout',
    ' * pas un `require` dont le chemin se calcule. Voir l\'en-tete du generateur.',
    ' *',
    ' * La table porte des identifiants d\'actif, pas des polices chargees : rien',
    ' * n\'est lu au demarrage. Le chargement se fait page par page, dans',
    ' * `chargerPoliceDePage`.',
    ' */',
    'export const POLICES_DES_PAGES: Record<number, number> = {',
    ...lignes,
    '};',
    '',
  ].join('\n');

  return { contenu, defauts, total: lignes.length };
}

function main() {
  const verifier = process.argv.includes('--verifier');
  const { contenu, defauts, total } = composer();

  if (defauts.length > 0) {
    console.error(`Polices de page : ${defauts.length} defaut(s)`);
    for (const defaut of defauts.slice(0, 20)) console.error(`  - ${defaut}`);
    if (defauts.length > 20) console.error(`  ... et ${defauts.length - 20} autre(s)`);
    return 1;
  }

  if (verifier) {
    if (!existsSync(SORTIE)) {
      console.error(`Absent : ${relative(RACINE, SORTIE)} — lancer sans --verifier.`);
      return 1;
    }
    const ecrit = readFileSync(SORTIE, 'utf8');
    if (ecrit !== contenu) {
      console.error(
        `Polices de page : ECHEC — ${relative(RACINE, SORTIE)} ne correspond plus\n` +
          'au manifeste. Le regenerer : node scripts/generer_polices_pages_ts.mjs'
      );
      return 1;
    }
    console.log('Polices de page : OK');
    console.log(`  ${total} pages, chacune avec son chemin ecrit en clair`);
    return 0;
  }

  // `writeFileSync` ecrit les octets tels quels : pas de conversion de fin de
  // ligne, contrairement a un flux ouvert en mode texte.
  writeFileSync(SORTIE, contenu, 'utf8');
  const octets = Buffer.byteLength(contenu, 'utf8');
  console.log(`Ecrit : ${relative(RACINE, SORTIE)} (${octets} octets)`);
  console.log(`  ${total} pages`);
  return 0;
}

process.exit(main());
