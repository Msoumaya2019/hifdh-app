// Dates calendaires et fuseaux horaires.
//
// Une date de séance est une date du calendrier local. La dériver de
// `toISOString()` la calcule en UTC : en France (UTC+1 ou UTC+2), toute date
// obtenue entre 00:00 et 02:00 heure locale est celle de la veille.
//
// Trois précautions rendent ces vérifications fiables :
//
//  1. le fuseau est fixé dans un processus fils, car `node:test` ne peut pas
//     changer `TZ` dans le processus courant (la variable est lue au démarrage
//     de Node) ;
//  2. l'écriture de `TZ` n'a pas le même sens selon la plateforme : mesuré,
//     `TZ=GMT+14` donne UTC+14 sous Windows et UTC−14 sous Linux. On sonde donc
//     les écritures possibles et l'on retient celle qui produit réellement le
//     décalage voulu, au lieu de supposer ;
//  3. l'instant de référence est **injecté** dans les fonctions plutôt que lu de
//     l'horloge. Adossée à l'heure courante, une vérification ne détecte le
//     défaut que pendant une partie de la journée : mesuré, une mutation de la
//     date passait inaperçue avant 10 h UTC.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('..', import.meta.url));

function executer(tz, programme) {
  const sortie = execFileSync(
    process.execPath,
    [
      '--import', './scripts/register-alias.mjs',
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      '--input-type=module',
      '-e', programme,
    ],
    { cwd: RACINE, env: { ...process.env, TZ: tz }, encoding: 'utf8' },
  );

  const lignes = sortie.trim().split('\n');
  return JSON.parse(lignes.at(-1));
}

// Écritures candidates. Le signe de `GMT±N` et de `Etc/GMT±N` s'interprètent
// différemment selon la plateforme, d'où le balayage des deux signes pour une
// même magnitude : c'est la sonde qui décide, pas une convention supposée.
const CANDIDATS = (decalage) => {
  const magnitude = Math.abs(decalage);
  return [
    `GMT+${magnitude}`, `GMT-${magnitude}`,
    `Etc/GMT+${magnitude}`, `Etc/GMT-${magnitude}`,
    `UTC+${magnitude}`, `UTC-${magnitude}`,
  ];
};

const fuseauxResolus = new Map();

/** Une écriture de `TZ` qui produit réellement ce décalage, sur cette machine. */
function fuseauPour(decalageVoulu) {
  if (fuseauxResolus.has(decalageVoulu)) return fuseauxResolus.get(decalageVoulu);

  for (const candidat of CANDIDATS(decalageVoulu)) {
    try {
      const mesure = executer(
        candidat,
        'console.log(JSON.stringify({ d: -new Date().getTimezoneOffset() / 60 }))',
      );
      if (mesure.d === decalageVoulu) {
        fuseauxResolus.set(decalageVoulu, candidat);
        return candidat;
      }
    } catch {
      // Écriture refusée par la plateforme : on essaie la suivante.
    }
  }

  // On échoue plutôt que de laisser passer un test qui ne prouverait rien.
  throw new Error(
    `Aucune écriture de TZ ne donne le décalage ${decalageVoulu} sur cette plateforme : ` +
      'les vérifications de fuseau ne peuvent pas être concluantes ici.',
  );
}

function dansFuseau(decalage, programme) {
  return executer(fuseauPour(decalage), programme);
}

// 22 septembre 2026 à 00 h 30, heure locale : la fenêtre où la date UTC est
// encore celle de la veille, dans un fuseau en avance sur UTC.
const INSTANT_PIEGE = 'new Date(2026, 8, 22, 0, 30)';

test('le dispositif sait réellement fixer un fuseau', () => {
  // Sans cette vérification, les tests suivants pourraient passer à vide sur une
  // plateforme où `TZ` serait ignoré.
  for (const decalage of [14, -5]) {
    const mesure = dansFuseau(decalage, 'console.log(JSON.stringify({ d: -new Date().getTimezoneOffset() / 60 }))');
    assert.equal(mesure.d, decalage, `le décalage ${decalage} n'a pas pu être appliqué`);
  }
});

test('en fuseau positif, une date locale ne doit pas basculer la veille', () => {
  const mesure = dansFuseau(
    14,
    `
      import { versDateLocale } from '@/lib/dates';
      const d = ${INSTANT_PIEGE};
      console.log(JSON.stringify({
        decalage: -d.getTimezoneOffset() / 60,
        locale: versDateLocale(d),
        utc: d.toISOString().split('T')[0],
      }));
    `,
  );

  assert.equal(mesure.decalage, 14, 'le fuseau demandé n\'a pas été appliqué au processus fils');
  assert.equal(mesure.locale, '2026-09-22', 'la date locale est fausse');

  // L'entrée discrimine : l'ancienne méthode rend bien un autre jour. Sans cette
  // assertion, on saurait seulement que le code rend la bonne réponse, pas que
  // le cas choisi pouvait en rendre une fausse.
  assert.equal(
    mesure.utc,
    '2026-09-21',
    'la date UTC est identique à la date locale : ce cas ne prouve rien',
  );
});

test('la première séance suit l\'instant injecté, pas la date UTC', () => {
  const mesure = dansFuseau(
    14,
    `
      import { generateProgram } from '@/lib/programGenerator';
      const maintenant = ${INSTANT_PIEGE};
      const seances = generateProgram({
        memorizedPassages: [],
        objective: { type: 'custom', passages: [{ surah: 112, startAyah: 1, endAyah: 4 }] },
        schedule: { unit: { type: 'verses', count: 2 }, days: [0, 1, 2, 3, 4, 5, 6] },
        onboardingCompleted: true,
      }, [], maintenant);
      console.log(JSON.stringify({
        decalage: -maintenant.getTimezoneOffset() / 60,
        utc: maintenant.toISOString().split('T')[0],
        premiere: seances[0].date,
      }));
    `,
  );

  assert.equal(mesure.decalage, 14, 'le fuseau demandé n\'a pas été appliqué');
  assert.equal(mesure.utc, '2026-09-21', 'l\'entrée ne discrimine pas');
  assert.equal(
    mesure.premiere,
    '2026-09-22',
    'la première séance est datée de la veille : date UTC au lieu de la date locale',
  );
});

test('la date de fin estimée suit l\'instant injecté', () => {
  const mesure = dansFuseau(
    14,
    `
      import { estimateCompletionDate } from '@/lib/programGenerator';
      import { versDateLocale } from '@/lib/dates';
      const depuis = ${INSTANT_PIEGE};
      const config = { schedule: { unit: { type: 'verses', count: 5 }, days: [0, 1, 2, 3, 4, 5, 6] } };
      const attendu = new Date(depuis);
      attendu.setDate(attendu.getDate() + 7);
      console.log(JSON.stringify({
        decalage: -depuis.getTimezoneOffset() / 60,
        obtenu: estimateCompletionDate(config, 0, 10, depuis),
        attendu: versDateLocale(attendu),
        utc: depuis.toISOString().split('T')[0],
      }));
    `,
  );

  assert.equal(mesure.decalage, 14, 'le fuseau demandé n\'a pas été appliqué');
  assert.equal(mesure.utc, '2026-09-21', 'l\'entrée ne discrimine pas');
  assert.equal(mesure.obtenu, mesure.attendu);
  assert.equal(mesure.obtenu, '2026-09-29');
});

test('dansJours et ilYAjours suivent l\'instant injecté', () => {
  const mesure = dansFuseau(
    14,
    `
      import { dansJours, ilYAjours } from '@/lib/dates';
      const depuis = ${INSTANT_PIEGE};
      console.log(JSON.stringify({
        decalage: -depuis.getTimezoneOffset() / 60,
        demain: dansJours(1, depuis),
        avant: dansJours(-1, depuis),
        semaine: ilYAjours(7, depuis),
      }));
    `,
  );

  assert.equal(mesure.decalage, 14, 'le fuseau demandé n\'a pas été appliqué');
  assert.equal(mesure.demain, '2026-09-23');
  assert.equal(mesure.avant, '2026-09-21');
  assert.equal(mesure.semaine, '2026-09-15');
});

test('la date de prochaine révision suit l\'instant injecté', () => {
  const mesure = dansFuseau(
    14,
    `
      import { getNextReviewDate } from '@/lib/spacedRepetition';
      const depuis = ${INSTANT_PIEGE};
      console.log(JSON.stringify({
        decalage: -depuis.getTimezoneOffset() / 60,
        un: getNextReviewDate(1, depuis),
        trente: getNextReviewDate(30, depuis),
      }));
    `,
  );

  assert.equal(mesure.decalage, 14, 'le fuseau demandé n\'a pas été appliqué');
  assert.equal(mesure.un, '2026-09-23', 'la révision de demain est datée du mauvais jour');
  assert.equal(mesure.trente, '2026-10-22');
});

test('une date nue « AAAA-MM-JJ » est lue comme une date locale', () => {
  // À l'ouest de Greenwich, `new Date('2026-09-21')` (minuit UTC) tombe le
  // 20 septembre en heure locale : l'interface annonçait le mauvais jour.
  const mesure = dansFuseau(
    -5,
    `
      import { analyserDateLocale } from '@/lib/dates';
      console.log(JSON.stringify({
        decalage: -new Date().getTimezoneOffset() / 60,
        natif: new Date('2026-09-21').getDate(),
        locale: analyserDateLocale('2026-09-21').getDate(),
      }));
    `,
  );

  assert.equal(mesure.decalage, -5, 'le fuseau demandé n\'a pas été appliqué');
  assert.equal(mesure.natif, 20, 'l\'entrée ne discrimine pas : le piège a disparu');
  assert.equal(mesure.locale, 21, 'la date locale n\'est pas respectée');
});

test('l\'affichage d\'une date nue nomme le bon jour, même à l\'ouest de Greenwich', () => {
  const mesure = dansFuseau(
    -5,
    `
      import { formatDate } from '@/lib/progress';
      console.log(JSON.stringify({
        decalage: -new Date().getTimezoneOffset() / 60,
        rendu: formatDate('2026-09-21'),
      }));
    `,
  );

  assert.equal(mesure.decalage, -5, 'le fuseau demandé n\'a pas été appliqué');
  assert.equal(mesure.rendu, 'lundi 21 septembre');
});

test('la génération ne modifie pas la configuration reçue', async () => {
  // `generateProgram` triait `config.schedule.days` en place : l'appelant
  // retrouvait sa configuration réordonnée.
  const jours = [5, 1, 3];
  const config = {
    memorizedPassages: [],
    objective: { type: 'custom', passages: [{ surah: 112, startAyah: 1, endAyah: 4 }] },
    schedule: { unit: { type: 'verses', count: 2 }, days: jours },
    onboardingCompleted: true,
  };

  const { generateProgram } = await import('@/lib/programGenerator');
  generateProgram(config, [], new Date(2026, 8, 22, 12, 0));
  assert.deepEqual(jours, [5, 1, 3], 'la configuration de l\'appelant a été réordonnée');
});
