// Programme d'apprentissage : découpage en séances et affectation aux dates.
//
// La propriété centrale est une propriété de couverture : l'ensemble des versets
// des séances doit être exactement l'objectif moins les passages déjà mémorisés,
// chaque verset apparaissant une fois et une seule. Un verset perdu rend le
// programme incomplet ; un verset en double fait travailler deux fois.

import test from 'node:test';
import assert from 'node:assert/strict';

import { computeObjectiveRanges, subtractMemorized, splitIntoSessions, generateProgram, reporterSeance, prochainJourApprentissage } from '@/lib/programGenerator';
import { getSurah } from '@/data/quranData';

function versetsDe(ranges) {
  const cles = [];
  for (const r of ranges) {
    for (let a = r.startAyah; a <= r.endAyah; a++) cles.push(`${r.surah}:${a}`);
  }
  return cles;
}

function configuration({ objectif, unite, jours, memorises = [] }) {
  return {
    memorizedPassages: memorises,
    objective: objectif,
    schedule: { unit: unite, days: jours },
    onboardingCompleted: true,
  };
}

// === Découpage en séances ===

test('découpage par versets : des paquets contigus, jamais plus grands que demandé', () => {
  const ranges = [{ surah: 2, startAyah: 1, endAyah: 10 }];
  const seances = splitIntoSessions(ranges, { type: 'verses', count: 3 });

  assert.deepEqual(seances, [
    { surah: 2, startAyah: 1, endAyah: 3 },
    { surah: 2, startAyah: 4, endAyah: 6 },
    { surah: 2, startAyah: 7, endAyah: 9 },
    { surah: 2, startAyah: 10, endAyah: 10 },
  ]);
});

test('découpage : aucun verset perdu, aucun verset en double, quelle que soit l\'unité', () => {
  const objectif = { type: 'specific_juz', juzNumber: 30 };
  const ranges = computeObjectiveRanges(objectif);
  const attendus = versetsDe(ranges);

  const unites = [
    { type: 'verses', count: 3 },
    { type: 'verses', count: 5 },
    { type: 'half_page' },
    { type: 'page', count: 1 },
    { type: 'thumn', count: 1 },
    { type: 'rub', count: 1 },
    { type: 'nisf', count: 1 },
    { type: 'hizb', count: 1 },
  ];

  for (const unite of unites) {
    const obtenus = versetsDe(splitIntoSessions(ranges, unite));
    const nom = unite.type === 'verses' ? `verses:${unite.count}` : unite.type;

    assert.equal(obtenus.length, attendus.length, `${nom} : nombre de versets modifié`);
    assert.equal(new Set(obtenus).size, obtenus.length, `${nom} : des versets sont en double`);
    assert.deepEqual(
      [...new Set(obtenus)].sort(),
      [...new Set(attendus)].sort(),
      `${nom} : les versets couverts ne sont pas ceux de l'objectif`,
    );
  }
});

test('découpage par thumn : les séances suivent les bornes des toumoun', () => {
  // Juz 30 commence en 78:1, qui est un début de thumn : le découpage doit
  // s'aligner sur les divisions, pas sur des paquets arbitraires.
  const ranges = computeObjectiveRanges({ type: 'juz_amma' });
  const seances = splitIntoSessions(ranges, { type: 'thumn', count: 1 });

  const fautives = seances.filter((s) => s.startAyah > s.endAyah);
  assert.deepEqual(fautives, [], 'séance vide ou inversée');
  assert.ok(seances.length > 1, 'le découpage n\'a produit qu\'une séance');
});

// === Affectation aux dates ===

test('les séances tombent uniquement sur les jours choisis', () => {
  const config = configuration({
    objectif: { type: 'specific_hizb', hizbNumbers: [60] },
    unite: { type: 'verses', count: 5 },
    jours: [1, 3, 5], // lundi, mercredi, vendredi
  });

  const seances = generateProgram(config, []);
  assert.ok(seances.length > 0);

  const mauvaisJours = seances.filter((s) => {
    const [a, m, j] = s.date.split('-').map(Number);
    return ![1, 3, 5].includes(new Date(a, m - 1, j).getDay());
  });
  assert.deepEqual(mauvaisJours.map((s) => s.date), []);
});

test('aucune séance n\'est placée dans le passé', () => {
  const config = configuration({
    objectif: { type: 'specific_hizb', hizbNumbers: [60] },
    unite: { type: 'verses', count: 5 },
    jours: [0, 1, 2, 3, 4, 5, 6],
  });

  const maintenant = new Date();
  const aujourdHui = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}-${String(maintenant.getDate()).padStart(2, '0')}`;

  const passees = generateProgram(config, []).filter((s) => s.date < aujourdHui);
  assert.deepEqual(
    passees.map((s) => s.date),
    [],
    'des séances sont datées avant aujourd\'hui (date locale mal calculée ?)',
  );
});

test('la première séance est datée d\'aujourd\'hui ou plus tard, pas de la veille', () => {
  const config = configuration({
    objectif: { type: 'custom', passages: [{ surah: 112, startAyah: 1, endAyah: 4 }] },
    unite: { type: 'verses', count: 2 },
    jours: [0, 1, 2, 3, 4, 5, 6],
  });

  const maintenant = new Date();
  const aujourdHui = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}-${String(maintenant.getDate()).padStart(2, '0')}`;

  const seances = generateProgram(config, []);
  assert.equal(seances[0].date, aujourdHui);
});

// === Couverture avec un passage déjà mémorisé au milieu de l'objectif ===

test('un passage mémorisé au milieu de l\'objectif n\'est ni appris ni compté deux fois', () => {
  const objectif = { type: 'custom', passages: [{ surah: 2, startAyah: 1, endAyah: 20 }] };
  const memorise = { surah: 2, startAyah: 8, endAyah: 12, level: 'perfect' };

  const config = configuration({
    objectif,
    unite: { type: 'verses', count: 3 },
    jours: [0, 1, 2, 3, 4, 5, 6],
    memorises: [memorise],
  });

  const seances = generateProgram(config, []);
  const couverts = versetsDe(seances);
  const memorises = versetsDe([memorise]);

  assert.equal(new Set(couverts).size, couverts.length, 'des versets sont en double');

  const dejaMemorises = couverts.filter((c) => memorises.includes(c));
  assert.deepEqual(dejaMemorises, [], 'des versets déjà mémorisés sont au programme');

  const attendus = versetsDe([{ surah: 2, startAyah: 1, endAyah: 20 }]).filter(
    (c) => !memorises.includes(c),
  );
  assert.deepEqual([...new Set(couverts)].sort(), [...new Set(attendus)].sort());
  assert.equal(couverts.length, 15);
});

test('un objectif entièrement mémorisé ne produit aucune séance', () => {
  const config = configuration({
    objectif: { type: 'custom', passages: [{ surah: 2, startAyah: 1, endAyah: 20 }] },
    unite: { type: 'verses', count: 3 },
    jours: [0, 1, 2, 3, 4, 5, 6],
    memorises: [{ surah: 2, startAyah: 1, endAyah: 20, level: 'perfect' }],
  });

  assert.deepEqual(generateProgram(config, []), []);
});

test('chaque séance porte sur des versets qui existent réellement', () => {
  const objectifs = [
    { type: 'specific_juz', juzNumber: 1 },
    { type: 'specific_juz', juzNumber: 30 },
    { type: 'hizb_sabbih' },
    { type: 'specific_hizb', hizbNumbers: [1, 60] },
    { type: 'full_quran' },
  ];

  const fautives = [];
  for (const objectif of objectifs) {
    const config = configuration({
      objectif,
      unite: { type: 'verses', count: 5 },
      jours: [1],
    });
    for (const s of generateProgram(config, [])) {
      const surah = getSurah(s.surah);
      if (surah === undefined || s.startAyah < 1 || s.endAyah > surah.ayahCount || s.startAyah > s.endAyah) {
        fautives.push(`[${objectif.type}] ${s.surah}:${s.startAyah}-${s.endAyah}`);
      }
    }
  }
  assert.deepEqual(fautives.slice(0, 10), []);
});

// === Report d'une séance ===
//
// Le report changeait le statut sans déplacer la séance : elle restait datée
// dans le passé, hors de la plage affichée, et disparaissait sans avoir été
// faite. Ces tests tiennent la propriété qui manquait.

const MARDI_22_SEPTEMBRE = new Date(2026, 8, 22, 10, 0);

function seance(date) {
  return {
    id: `s_${date}`,
    date,
    surah: 2,
    startAyah: 1,
    endAyah: 5,
    unit: { type: 'verses', count: 5 },
    status: 'todo',
    createdAt: '',
  };
}

test('le report place la séance sur un jour d\'apprentissage à venir', () => {
  const jours = [1]; // lundi uniquement
  const nouvelle = reporterSeance(seance('2026-09-22'), jours, MARDI_22_SEPTEMBRE);

  // Mardi 22 septembre 2026 -> lundi suivant, 28 septembre.
  assert.equal(nouvelle, '2026-09-28');

  const [a, m, j] = nouvelle.split('-').map(Number);
  assert.ok(jours.includes(new Date(a, m - 1, j).getDay()), 'la nouvelle date n\'est pas un lundi');
});

test('le report ne renvoie jamais une séance dans le passé', () => {
  const jours = [0, 1, 2, 3, 4, 5, 6];
  // Séance en retard de douze jours.
  const nouvelle = reporterSeance(seance('2026-09-10'), jours, MARDI_22_SEPTEMBRE);

  assert.equal(nouvelle, '2026-09-23', 'une séance en retard doit rejoindre le prochain jour');
  assert.ok(nouvelle > '2026-09-22', 'la nouvelle date doit être postérieure à aujourd\'hui');
});

test('le report déplace toujours d\'au moins un jour', () => {
  const jours = [0, 1, 2, 3, 4, 5, 6];
  for (const date of ['2026-09-22', '2026-09-23', '2026-10-01']) {
    const nouvelle = reporterSeance(seance(date), jours, MARDI_22_SEPTEMBRE);
    assert.ok(nouvelle > date, `${date} -> ${nouvelle} : la séance n'a pas bougé`);
  }
});

test('le prochain jour d\'apprentissage est strictement postérieur', () => {
  const prochain = prochainJourApprentissage(new Date(2026, 8, 22, 0, 0), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(prochain.getDate(), 23);
  assert.equal(prochain.getMonth(), 8);
});

test('sans jour d\'apprentissage choisi, la planification échoue au lieu de boucler', () => {
  assert.throws(
    () => prochainJourApprentissage(new Date(2026, 8, 22, 0, 0), []),
    /jour/i,
    'une configuration sans jour doit lever, pas figer l\'application',
  );
});


// === Modification d'objectif ===

test('changer d\'objectif recalcule les séances à venir sans reprendre les versets mémorisés', () => {
  const memorises = [{ surah: 2, startAyah: 1, endAyah: 10, level: 'perfect' }];

  const premier = generateProgram(
    configuration({ objectif: { type: 'specific_juz', juzNumber: 1 }, unite: { type: 'verses', count: 5 }, jours: [1], memorises }),
    [],
  );
  const second = generateProgram(
    configuration({ objectif: { type: 'specific_hizb', hizbNumbers: [1] }, unite: { type: 'verses', count: 5 }, jours: [1], memorises }),
    [],
  );

  assert.ok(premier.length > 0 && second.length > 0);

  const memorisesCles = versetsDe(memorises);
  for (const [nom, seances] of [['juz', premier], ['hizb', second]]) {
    const intrus = versetsDe(seances).filter((c) => memorisesCles.includes(c));
    assert.deepEqual(intrus, [], `[${nom}] des versets mémorisés réapparaissent après changement d'objectif`);
  }

  // Les deux objectifs couvrent des étendues différentes : le programme doit suivre.
  assert.notEqual(premier.length, second.length);
});
