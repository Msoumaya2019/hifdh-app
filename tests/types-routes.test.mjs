// Le générateur de types des routes doit travailler sur un CLONE NEUF.
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// `scripts/regenerer_types_routes.mjs` appelle le générateur d'`expo-router`
// pour régénérer `.expo/types/router.d.ts` — le cache que `tsc` lit, et que le
// serveur de développement écrit d'ordinaire. Ce cache est ignoré par Git :
// **sur un clone, `.expo/` n'existe pas.**
//
// Or `regenerateDeclarations` écrit par `writeFileSync` SANS créer le dossier
// parent. Le script a donc fonctionné pendant tout son développement sur une
// machine où `.expo/types/` existait déjà depuis un `expo start`, et il a levé
// `ENOENT: no such file or directory` dès sa première exécution en intégration
// continue — rendant deux poussées rouges. Le défaut n'était pas dans le
// générateur : il était dans l'écart entre la machine de développement et un
// clone.
//
// C'est cet écart que ce test supprime. Il lance le script vers un dossier
// NEUF, dans le dossier temporaire du système, et exige qu'il aboutisse. Rien
// du dépôt n'est touché : le script accepte son dossier de sortie en argument,
// précisément pour être éprouvable sans casser l'arbre.
//
// CE QU'IL NE PROUVE PAS
// ----------------------
// Il ne dit pas que les types engendrés sont les BONS — c'est le rôle de
// `tests/routes.test.mjs`, qui compare les routes réclamées aux fichiers
// existants sans dépendre d'un fichier engendré. Il dit que la génération
// ABOUTIT là où elle échouait.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = 'scripts/regenerer_types_routes.mjs';

/** Les routes écrites dans un fichier de types engendré. */
const routesEcrites = (contenu) =>
  [...contenu.matchAll(/pathname: `([^`]+)`/g)].map((m) => m[1]);

test('le generateur aboutit quand son dossier de sortie n’existe pas encore', () => {
  // `mkdtempSync` rend un dossier NEUF et vide ; le sous-dossier `types` n'y
  // existe donc pas — c'est exactement l'état d'un clone.
  const parent = mkdtempSync(join(tmpdir(), 'hifdh-types-'));
  const sortie = join(parent, 'types');

  try {
    assert.equal(
      existsSync(sortie),
      false,
      'le dossier de sortie ne doit pas exister avant : sinon ce test ne '
        + 'reproduirait plus l’état d’un clone, et ne prouverait plus rien'
    );

    execFileSync(process.execPath, [SCRIPT, sortie], {
      cwd: RACINE,
      encoding: 'utf8',
      timeout: 60000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const fichier = join(sortie, 'router.d.ts');
    assert.ok(
      existsSync(fichier),
      "le generateur doit avoir ecrit router.d.ts : sur un clone, `.expo/` est "
        + 'absent, et un generateur qui suppose le dossier existant leve ENOENT'
    );

    const routes = routesEcrites(readFileSync(fichier, 'utf8'));

    // Un fichier de types SANS route serait le pire des résultats : il existe,
    // `tsc` l'accepte, et il ne garde plus rien. C'est ce que produit le
    // generateur quand `EXPO_ROUTER_APP_ROOT` n'est pas posé.
    assert.ok(
      routes.length > 0,
      'le fichier engendré ne porte aucune route : le cache aurait l’air '
        + 'régénéré sans l’être, et `tsc` ne vérifierait plus aucune route'
    );

    // Et il porte bien les routes du dépôt : un dossier vide ou un fichier
    // tronqué passerait le contrôle précédent sans rien prouver.
    for (const attendue of ['/profil', '/reglages', '/sources']) {
      assert.ok(
        routes.includes(attendue),
        `la route « ${attendue} » manque aux types engendrés : ${routes.join(', ')}`
      );
    }
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
