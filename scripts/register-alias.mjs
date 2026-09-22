// Enregistre le chargeur d'alias avant la découverte des tests.
// `--import` exécute ce fichier en premier : le chargeur est donc en place
// quand `node --test` résout les fichiers de test.

import { register } from 'node:module';

register('./alias-loader.mjs', import.meta.url);
