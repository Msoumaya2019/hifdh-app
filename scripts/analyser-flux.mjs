// Contrôle statique des flux GitHub Actions.
//
// Les défauts que ce contrôle vise ne se voient qu'au moment de lancer, et le
// flux iOS ne se lance que sur un exécuteur macOS, pour une quinzaine de
// minutes. Un `working-directory` de trop, une variable d'environnement au
// mauvais niveau, une version d'action au moteur déprécié : chacun coûte un
// aller-retour complet, et aucun n'est visible à la relecture.
//
// Ce qui est vérifié, et pourquoi :
//
//   - le YAML s'analyse — un extrait multiligne à la colonne 0 dans un `run: |`
//     termine le bloc, et le message d'erreur nomme une ligne du YAML, pas la
//     cause ;
//   - chaque script `run:` est syntaxiquement valide (`bash -n`) ;
//   - les variables EXPO_PUBLIC_* sont déclarées au niveau du JOB : Metro les
//     remplace pendant le bundling, à l'intérieur de xcodebuild, donc une
//     déclaration sur l'étape `prebuild` ne servirait à rien ;
//   - l'étape de compilation Xcode n'a pas de `working-directory`, qui
//     doublerait le préfixe des chemins trouvés à l'étape précédente ;
//   - l'action qui publie un artefact n'est pas épinglée à une version dont le
//     moteur est abandonné ;
//   - un flux qui publie une version (`gh release create`) déclare le droit
//     d'écriture correspondant : sans lui, tout réussit jusqu'à la dernière
//     étape, qui échoue alors en « HTTP 403 ».
//   - la liste des flux attendus est FERMÉE dans les deux sens : un flux absent
//     du dossier est signalé, et un flux présent mais non déclaré l'est aussi.
//     C'est le seul contrôle de ce fichier dont l'absence d'un sujet
//     produirait un vert — d'où la fermeture.
//
// PORTÉE, ET CE QU'ELLE EXCLUT
// ----------------------------
// `bash -n` analyse SANS évaluer les expansions. Ce contrôle attrape donc un
// `then` manquant, un `fi` orphelin, une quote non fermée — pas une expansion
// fautive : `echo ${a b}` est accepté à l'analyse et échoue à l'exécution. Une
// faute de frappe dans `${CHEMIN}` ne sera signalée ni ici, ni par `tsc`, ni par
// ESLint. Il ne voit pas non plus ce qui relève de l'exécution, par exemple un
// `run:` multiligne dont la première commande en échec supprime les suivantes.

import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let yaml;
try {
  yaml = require('js-yaml');
} catch {
  console.error('js-yaml est introuvable : npm ci doit être exécuté avant ce contrôle.');
  process.exit(2);
}

const RACINE = fileURLToPath(new URL('..', import.meta.url));

// Le dossier est paramétrable : sans cela, éprouver ce contrôle obligerait à
// écrire de faux flux dans le vrai dossier, c'est-à-dire à casser le dépôt pour
// vérifier qu'on sait détecter une casse.
const DOSSIER = process.argv[2] ?? join(RACINE, '.github', 'workflows');

// Versions dont le moteur Node est abandonné. `v5` ne fait que *supporter*
// Node 24 tout en tournant encore sous Node 20.
const VERSIONS_ARTEFACT_ABANDONNEES = ['v4', 'v5'];

// LA LISTE DES FLUX EST FERMÉE, ET DANS LES DEUX SENS
// ---------------------------------------------------
// Ce contrôle est le SEUL lecteur du dossier `.github/workflows` : rien d'autre
// dans la chaîne ne verrait la disparition d'un flux. Or un contrôle qui
// découvre ses sujets par `readdir` mesure ce qui RESTE, jamais ce qui MANQUE —
// c'est la définition d'un vert trompeur. Mesuré ailleurs : un flux écarté d'un
// dossier de trois, et le contrôle annonçait « tout est valide », code 0.
//
// Le second sens compte autant que le premier : un flux PRÉSENT mais non
// déclaré doit échouer lui aussi. Sans cela, une garde qui refuserait tout
// passerait pour concluante.
//
// Le prix est une friction assumée : chaque flux nouveau se déclare ici. C'est
// le seul endroit du dépôt où ce prix achète quelque chose, parce qu'il n'y a
// pas de second lecteur pour retenir une disparition.
const FLUX_ATTENDUS = ['android-apk.yml', 'ci.yml', 'ios-unsigned.yml', 'notifications.yml'];

const problemes = [];
const signaler = (fichier, message) => problemes.push(`${fichier} : ${message}`);

// Le compte des vérifications RÉELLEMENT effectuées. Il est affiché même quand
// tout va bien : un rapport qui annonce seulement « OK » ne dit pas s'il a
// regardé quelque chose. Il se recoupe d'un coup d'œil avec le nombre de `run:`
// du dépôt, qui est un plancher.
let verifications = 0;

/** Remplace les expressions `${{ … }}` par un jeton, pour éprouver le bash seul. */
function sansExpressions(script) {
  return script.replace(/\$\{\{[^}]*\}\}/g, 'EXPRESSION');
}

function verifierSyntaxeBash(fichier, nomEtape, script) {
  const dossier = mkdtempSync(join(tmpdir(), 'flux-'));
  const chemin = join(dossier, 'etape.sh');
  try {
    writeFileSync(chemin, sansExpressions(script), 'utf8');
    const resultat = spawnSync('bash', ['-n', chemin], { encoding: 'utf8' });
    if (resultat.status !== 0) {
      const detail = (resultat.stderr || '').trim().split('\n')[0] ?? 'erreur inconnue';
      signaler(fichier, `script invalide à l'étape « ${nomEtape} » : ${detail}`);
    }
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

// `readdirSync` ne garantit aucun ordre : trier rend les messages comparables
// d'une exécution à l'autre.
const fichiers = readdirSync(DOSSIER)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .sort();

// Les deux sens de la liste fermée. Un dossier vide ne produit donc plus un
// message unique mais un refus par flux attendu, ce qui est plus utile : il
// nomme ce qui manque.
verifications += FLUX_ATTENDUS.length;
for (const manquant of FLUX_ATTENDUS.filter((nom) => !fichiers.includes(nom))) {
  signaler(manquant, '[flux-absent] flux attendu absent du dossier.');
}
for (const nonDeclare of fichiers.filter((nom) => !FLUX_ATTENDUS.includes(nom))) {
  signaler(
    nonDeclare,
    '[flux-non-declare] flux présent dans le dossier mais absent de FLUX_ATTENDUS : ' +
      'le déclarer, ou le retirer du dossier.'
  );
}

for (const nomFichier of fichiers) {
  const contenu = readFileSync(join(DOSSIER, nomFichier), 'utf8');

  let flux;
  try {
    flux = yaml.load(contenu);
  } catch (erreur) {
    verifications += 1;
    signaler(nomFichier, `le YAML ne s'analyse pas : ${erreur.message.split('\n')[0]}`);
    continue;
  }

  verifications += 1;
  if (flux === null || typeof flux !== 'object' || !flux.jobs) {
    signaler(nomFichier, 'aucune section « jobs »');
    continue;
  }

  for (const [nomJob, job] of Object.entries(flux.jobs)) {
    if (!job || typeof job !== 'object') {
      signaler(nomFichier, `job « ${nomJob} » illisible`);
      continue;
    }
    verifications += 1;
    if (typeof job['runs-on'] !== 'string' || job['runs-on'] === '') {
      signaler(nomFichier, `job « ${nomJob} » : « runs-on » manquant`);
    }

    const variablesJob = job.env ?? {};
    const etapes = Array.isArray(job.steps) ? job.steps : [];

    for (const [index, etape] of etapes.entries()) {
      verifications += 1;
      if (!etape || typeof etape !== 'object') {
        signaler(nomFichier, `job « ${nomJob} », étape ${index + 1} illisible`);
        continue;
      }
      const nomEtape = etape.name ?? etape.uses ?? `étape ${index + 1}`;

      if (typeof etape.run === 'string') {
        verifications += 1;
        verifierSyntaxeBash(nomFichier, nomEtape, etape.run);

        // Les variables EXPO_PUBLIC_* lues dans un script doivent venir du job.
        const lues = [...etape.run.matchAll(/\$\{?!?(EXPO_PUBLIC_[A-Z0-9_]+)\}?/g)].map(
          (m) => m[1]
        );
        for (const variable of new Set(lues)) {
          verifications += 1;
          if (!(variable in variablesJob)) {
            signaler(
              nomFichier,
              `« ${variable} » est lue à l'étape « ${nomEtape} » mais n'est pas déclarée ` +
                "au niveau du job. Metro l'inline au bundling, à l'intérieur de xcodebuild."
            );
          }
        }

        if (etape.run.includes('xcodebuild')) {
          verifications += 1;
          if (etape['working-directory'] !== undefined) {
            signaler(
              nomFichier,
              `l'étape de compilation « ${nomEtape} » déclare un « working-directory », qui ` +
                'doublerait le préfixe des chemins produits par le repérage.'
            );
          }
        }

        // Publier une version écrit dans le dépôt. Le jeton par défaut n'a que
        // la lecture, et le refus n'arrive qu'à la toute fin : après la
        // compilation, après l'artefact, quand tout le reste a réussi.
        // `permissions` au niveau du job REMPLACE celui de la racine — c'est la
        // sémantique de GitHub, et la seule lecture correcte ici.
        if (/\bgh\s+release\s+create\b/.test(etape.run)) {
          verifications += 1;
          const effectives = job.permissions ?? flux.permissions;
          const droitEcriture =
            effectives === 'write-all' ||
            (typeof effectives === 'object' &&
              effectives !== null &&
              effectives.contents === 'write');
          if (!droitEcriture) {
            signaler(
              nomFichier,
              `l'étape « ${nomEtape} » publie une version (« gh release create ») sans ` +
                "l'autorisation « contents: write ». Le jeton par défaut n'a que la lecture : " +
                'la publication échouerait en « HTTP 403: Resource not accessible by integration ».'
            );
          }
        }
      }

      if (typeof etape.uses === 'string') {
        const correspondance = /^actions\/upload-artifact@(.+)$/.exec(etape.uses);
        if (correspondance !== null) {
          verifications += 1;
          const version = correspondance[1];
          if (VERSIONS_ARTEFACT_ABANDONNEES.includes(version)) {
            signaler(
              nomFichier,
              `« upload-artifact@${version} » tourne sous un moteur Node abandonné. ` +
                'Épingler une version dont le moteur est maintenu.'
            );
          }
        }
      }
    }
  }
}

if (problemes.length > 0) {
  console.error(
    `${problemes.length} problème(s) dans les flux ` +
      `(${verifications} vérification(s) effectuée(s)) :\n`
  );
  for (const probleme of problemes) console.error(`  - ${probleme}`);
  process.exit(1);
}

console.log(`${fichiers.length} flux analysés : ${fichiers.join(', ')}.`);
console.log(`${verifications} vérification(s) effectuée(s).`);
console.log('Aucun problème.');
