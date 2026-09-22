// Falsification du contrôle statique des flux.
//
// Un contrôle qu'on n'a jamais vu échouer ne prouve rien. Chaque cas écrit un
// flux volontairement fautif dans un dossier temporaire, et exige que le
// contrôle le refuse. Un cas de référence vérifie qu'un flux correct passe :
// sans lui, un contrôle qui refuse tout passerait pour un bon contrôle.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ANALYSEUR = fileURLToPath(new URL('../scripts/analyser-flux.mjs', import.meta.url));

function analyser(contenu) {
  const dossier = mkdtempSync(join(tmpdir(), 'flux-'));
  try {
    writeFileSync(join(dossier, 'flux.yml'), contenu, 'utf8');
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
