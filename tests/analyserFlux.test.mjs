// Falsification du contrôle statique des flux.
//
// Un contrôle qu'on n'a jamais vu échouer ne prouve rien. Chaque cas écrit un
// flux volontairement fautif dans un dossier temporaire, et exige que le
// contrôle le refuse. Un cas de référence vérifie qu'un flux correct passe :
// sans lui, un contrôle qui refuse tout passerait pour un bon contrôle.
//
// Les trois derniers cas portent sur la LISTE FERMÉE des flux attendus. Ils ne
// peuvent pas être obtenus en mutant les vrais fichiers, puisqu'ils portent sur
// la présence ou l'absence d'un fichier, et non sur son contenu : ils copient le
// dossier réel dans un dossier temporaire. C'est le seul contrôle du dépôt dont
// l'absence d'un sujet produirait un vert, et donc le seul qu'un banc doive
// atteindre ainsi.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ANALYSEUR = fileURLToPath(new URL('../scripts/analyser-flux.mjs', import.meta.url));
const FLUX_REELS = fileURLToPath(new URL('../.github/workflows', import.meta.url));

/** Recopie les vrais flux dans un dossier temporaire, un fichier par un fichier. */
function copierLesVraisFlux(dossier) {
  for (const nom of readdirSync(FLUX_REELS)) {
    cpSync(join(FLUX_REELS, nom), join(dossier, nom));
  }
}

/**
 * Analyse un flux fautif, écrit dans un dossier qui porte par ailleurs les VRAIS
 * flux du dépôt.
 *
 * POURQUOI LES VRAIS FLUX, ET NON UN SEUL FICHIER. La liste des flux attendus
 * est fermée. Un dossier réduit au seul fichier fautif serait donc refusé pour
 * DEUX raisons à la fois : le défaut visé, et l'absence des autres flux. Le
 * contrôle sortirait en 1, le banc serait vert, et il n'aurait rien mesuré —
 * exactement le piège que ce fichier existe pour éviter.
 *
 * Le flux fautif prend le nom d'un flux attendu (`ci.yml`), pour n'être
 * lui-même signalé ni comme absent, ni comme non déclaré.
 */
function analyser(contenu) {
  const dossier = mkdtempSync(join(tmpdir(), 'flux-'));
  try {
    copierLesVraisFlux(dossier);
    writeFileSync(join(dossier, 'ci.yml'), contenu, 'utf8');
    const resultat = spawnSync(process.execPath, [ANALYSEUR, dossier], { encoding: 'utf8' });
    return { code: resultat.status, sortie: `${resultat.stdout}${resultat.stderr}` };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

/**
 * Analyse une copie des vrais flux, après l'avoir modifiée.
 *
 * Sert à la fermeture de la liste : c'est le seul contrôle du dépôt dont
 * l'absence d'un sujet produirait un vert, et aucune mutation des vrais fichiers
 * ne peut l'atteindre — d'où ce dossier temporaire.
 */
function analyserCopie(modifier) {
  const dossier = mkdtempSync(join(tmpdir(), 'flux-'));
  try {
    copierLesVraisFlux(dossier);
    modifier(dossier);
    const resultat = spawnSync(process.execPath, [ANALYSEUR, dossier], { encoding: 'utf8' });
    return { code: resultat.status, sortie: `${resultat.stdout}${resultat.stderr}` };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

/** Un flux minimal correct, qui sert de témoin. */
const FLUX_CORRECT = `
name: Correct
on: workflow_dispatch
jobs:
  construire:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - name: Salutation
        run: echo "bonjour"
`;

test('un flux correct passe : le contrôle ne refuse pas tout', () => {
  const resultat = analyser(FLUX_CORRECT);
  assert.equal(resultat.code, 0, resultat.sortie);
});

test('un extrait multiligne à la colonne 0 est refusé', () => {
  // Ce défaut termine le bloc scalaire du `run: |` et casse le YAML.
  const flux = `
name: Colonne zero
on: workflow_dispatch
jobs:
  construire:
    runs-on: ubuntu-latest
    steps:
      - name: Extraire
        run: |
          echo "debut"
python3 -c "print('colonne zero')"
`;
  const resultat = analyser(flux);
  assert.equal(resultat.code, 1);
  assert.match(resultat.sortie, /YAML ne s'analyse pas/);
});

test('un script bash invalide est refusé', () => {
  // Une boucle sans « done » : l'erreur est d'analyse, donc vue par `bash -n`.
  //
  // À ne pas confondre avec un crochet mal fermé — « if [ -z "$X" ; then » est
  // syntaxiquement valide, puisque `[` n'est qu'un nom de commande et que bash
  // ne vérifie pas ses arguments à l'analyse. Ce cas-là ne serait détecté qu'à
  // l'exécution, et c'est voulu.
  const flux = `
name: Bash casse
on: workflow_dispatch
jobs:
  construire:
    runs-on: ubuntu-latest
    steps:
      - name: Etape cassee
        run: |
          for fichier in un deux trois; do
            echo "$fichier"
`;
  const resultat = analyser(flux);
  assert.equal(resultat.code, 1, resultat.sortie);
  assert.match(resultat.sortie, /script invalide/);
});

test('une variable EXPO_PUBLIC lue sans déclaration au niveau du job est refusée', () => {
  const flux = `
name: Variable au mauvais niveau
on: workflow_dispatch
jobs:
  construire:
    runs-on: ubuntu-latest
    steps:
      - name: Lire la variable
        run: |
          echo "$EXPO_PUBLIC_SUPABASE_URL"
`;
  const resultat = analyser(flux);
  assert.equal(resultat.code, 1);
  assert.match(resultat.sortie, /EXPO_PUBLIC_SUPABASE_URL/);
  assert.match(resultat.sortie, /niveau du job/);
});

test('la même variable déclarée au niveau du job est acceptée', () => {
  const flux = `
name: Variable au bon niveau
on: workflow_dispatch
jobs:
  construire:
    runs-on: ubuntu-latest
    env:
      EXPO_PUBLIC_SUPABASE_URL: \${{ vars.EXPO_PUBLIC_SUPABASE_URL }}
    steps:
      - name: Lire la variable
        run: |
          echo "$EXPO_PUBLIC_SUPABASE_URL"
`;
  const resultat = analyser(flux);
  assert.equal(resultat.code, 0, resultat.sortie);
});

test('un working-directory sur l’étape de compilation est refusé', () => {
  const flux = `
name: Prefixe double
on: workflow_dispatch
jobs:
  construire:
    runs-on: macos-15
    steps:
      - name: Compiler
        working-directory: ios
        run: |
          xcodebuild -project ios/MonApp.xcodeproj -scheme MonApp build
`;
  const resultat = analyser(flux);
  assert.equal(resultat.code, 1);
  assert.match(resultat.sortie, /working-directory/);
});

test('un upload-artifact au moteur abandonné est refusé', () => {
  for (const version of ['v4', 'v5']) {
    const flux = `
name: Artefact abandonne
on: workflow_dispatch
jobs:
  construire:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/upload-artifact@${version}
        with:
          name: paquet
          path: fichier.ipa
`;
    const resultat = analyser(flux);
    assert.equal(resultat.code, 1, `upload-artifact@${version} aurait dû être refusé`);
    assert.match(resultat.sortie, /moteur Node abandonné/);
  }
});

test('un upload-artifact maintenu est accepté', () => {
  const flux = `
name: Artefact maintenu
on: workflow_dispatch
jobs:
  construire:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/upload-artifact@v7
        with:
          name: paquet
          path: fichier.ipa
`;
  const resultat = analyser(flux);
  assert.equal(resultat.code, 0, resultat.sortie);
});

test('un job sans runs-on est refusé', () => {
  const flux = `
name: Sans machine
on: workflow_dispatch
jobs:
  construire:
    steps:
      - run: echo "bonjour"
`;
  const resultat = analyser(flux);
  assert.equal(resultat.code, 1);
  assert.match(resultat.sortie, /runs-on/);
});

test('un flux sans section jobs est refusé', () => {
  const resultat = analyser('name: Vide\non: workflow_dispatch\n');
  assert.equal(resultat.code, 1);
  assert.match(resultat.sortie, /jobs/);
});

test('les vrais flux du dépôt passent le contrôle', () => {
  const resultat = spawnSync(process.execPath, [ANALYSEUR], { encoding: 'utf8' });
  assert.equal(resultat.status, 0, `${resultat.stdout}${resultat.stderr}`);
  assert.match(resultat.stdout, /Aucun problème/);
});

// ---------------------------------------------------------------------------
// La fermeture de la liste des flux attendus.
//
// Ces trois cas ne peuvent PAS être obtenus en mutant les vrais fichiers : ils
// portent sur l'absence ou sur l'ajout d'un fichier, pas sur son contenu. Un
// dossier temporaire est donc le seul moyen de les éprouver.
//
// Le premier des trois est le témoin : sans lui, un contrôle qui refuserait
// toute copie passerait pour concluant, et le refus des deux autres ne prouverait
// rien.
// ---------------------------------------------------------------------------

test('la copie intacte des vrais flux passe : le refus vient du retrait, pas de la copie', () => {
  const resultat = analyserCopie(() => {});
  assert.equal(resultat.code, 0, resultat.sortie);
});

test('un flux attendu absent du dossier est refusé, et nommé', () => {
  const resultat = analyserCopie((dossier) => rmSync(join(dossier, 'ci.yml')));
  assert.equal(resultat.code, 1, resultat.sortie);
  assert.match(resultat.sortie, /\[flux-absent\]/);
  assert.match(resultat.sortie, /ci\.yml/);
});

test('un flux présent mais non déclaré est refusé, et nommé', () => {
  // Le flux ajouté est VALIDE : sans cela, le refus viendrait de l'analyse du
  // YAML ou de la syntaxe, et le banc mesurerait autre chose que la liste.
  const resultat = analyserCopie((dossier) =>
    writeFileSync(join(dossier, 'extra.yml'), FLUX_CORRECT, 'utf8')
  );
  assert.equal(resultat.code, 1, resultat.sortie);
  assert.match(resultat.sortie, /\[flux-non-declare\]/);
  assert.match(resultat.sortie, /extra\.yml/);
});
