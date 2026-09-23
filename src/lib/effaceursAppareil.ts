// Les effaceurs réels : ce que « tout remettre à zéro » efface sur l'appareil.
//
// Ce module est le SEUL endroit qui sache à quoi correspondent les quatre
// étapes. Il est volontairement court et sans logique : chaque étape est une
// fonction nommée, et le tableau ci-dessous les associe. Une étape associée au
// mauvais effaceur — `base: viderCachePages`, par exemple — effacerait le cache
// d'images en annonçant avoir effacé la progression ; c'est précisément ce que
// `tests/reinitialisation.test.mjs` vérifie, en substituant les quatre modules
// et en comptant les appels.
//
// L'ordre, lui, n'est pas ici : il vit dans `reinitialisation.ts`, où il est
// éprouvé.

import { effacerBase } from './database';
import { viderCachePages } from './cachePagesMoushaf';
import { viderMagasin } from './magasin';
import { effacerSession } from './sessionAppareil';
import type { Effaceurs } from './reinitialisation';

export const EFFACEURS_APPAREIL: Effaceurs = {
  // La déconnexion d'abord : elle a besoin du jeton encore présent.
  session: effacerSession,
  // Le magasin clé-valeur — dont la préférence de thème, qui repart donc au
  // vert. Le fournisseur de thème doit être remis d'aplomb par l'écran, qui
  // seul peut le faire : voir `profil.tsx`.
  magasin: viderMagasin,
  // La base SQLite : configuration, passages, séances, révisions.
  base: effacerBase,
  // Les images de page gardées hors ligne. `viderCachePages` rend le nombre de
  // fichiers retirés, qui n'intéresse pas ici : on l'attend et on l'oublie,
  // plutôt que de faire dépendre le type de l'étape de ce que rend l'effaceur.
  cache: async () => {
    await viderCachePages();
  },
};
