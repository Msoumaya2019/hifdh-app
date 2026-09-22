// Sauvegarde et restauration.
//
// Ce qui compte ici n'est pas le chemin heureux, mais les refus. Une
// restauration est destructrice : chaque garde-fou doit être prouvé, et chaque
// refus doit laisser l'appareil intact.

import test from 'node:test';
import assert from 'node:assert/strict';

import { sauvegarder, restaurer } from '@/lib/sync/synchronisation';
import { estVide, validerSnapshot, VERSION_INSTANTANE } from '@/lib/sync/snapshot';

const MAINTENANT = new Date(2026, 8, 22, 10, 0); // mardi 22 septembre 2026

// === Dépôts en mémoire ===

const VIDE = { config: null, memorized: [], sessions: [], reviews: [] };

function depotLocal(initial = VIDE) {
  let etat = structuredClone(initial);
  let ecritures = 0;

  return {
    async estVide() {
      return (
        etat.config === null &&
        etat.memorized.length === 0 &&
        etat.sessions.length === 0 &&
        etat.reviews.length === 0
      );
    },
    async lire() {
      return structuredClone(etat);
    },
    async ecrire(snapshot) {
      ecritures += 1;
      etat = {
        config: snapshot.config,
        memorized: snapshot.memorized,
        sessions: snapshot.sessions,
        reviews: snapshot.reviews,
      };
    },
    contenu: () => structuredClone(etat),
    ecritures: () => ecritures,
  };
}

function depotDistant(initial = null) {
  let etat = initial === null ? null : structuredClone(initial);
  let ecritures = 0;

  return {
    async lire() {
      return etat === null ? null : structuredClone(etat);
    },
    async ecrire(snapshot) {
      ecritures += 1;
      etat = structuredClone(snapshot);
    },
    contenu: () => (etat === null ? null : structuredClone(etat)),
    ecritures: () => ecritures,
  };
}

// === Instantané de référence ===

const CONFIG = {
  memorizedPassages: [],
  objective: { type: 'full_quran' },
  schedule: { unit: { type: 'verses', count: 5 }, days: [1, 2, 3, 4, 5] },
  onboardingCompleted: true,
};

function instantaneValide(surcharge = {}) {
  return {
    version: VERSION_INSTANTANE,
    updatedAt: '2026-09-22T08:00:00.000Z',
    config: structuredClone(CONFIG),
    memorized: [{ surah: 2, startAyah: 1, endAyah: 10, level: 'perfect' }],
    sessions: [
      {
        id: 's1',
        date: '2026-09-22',
        surah: 2,
        startAyah: 1,
        endAyah: 5,
        unit: { type: 'verses', count: 5 },
        status: 'todo',
        createdAt: '2026-09-22T08:00:00.000Z',
      },
    ],
    reviews: [],
    ...surcharge,
  };
}

const ETAT_REMPLI = {
  config: structuredClone(CONFIG),
  memorized: [{ surah: 2, startAyah: 1, endAyah: 10, level: 'perfect' }],
  sessions: [
    {
      id: 'local1',
      date: '2026-09-22',
      surah: 2,
      startAyah: 1,
      endAyah: 5,
      unit: { type: 'verses', count: 5 },
      status: 'todo',
      createdAt: '2026-09-22T08:00:00.000Z',
    },
  ],
  reviews: [],
};

// === Sauvegarde ===

test('sauvegarder refuse sans compte connecté', async () => {
  const local = depotLocal(ETAT_REMPLI);
  const distant = depotDistant();

  const resultat = await sauvegarder({ local, distant, utilisateurId: null, maintenant: MAINTENANT });

  assert.equal(resultat.statut, 'refuse');
  assert.equal(resultat.raison, 'non_authentifie');
  assert.equal(distant.ecritures(), 0, 'rien ne doit partir vers le cloud');
});

test('sauvegarder refuse un appareil vide, même connecté', async () => {
  // Accepter ce geste effacerait la sauvegarde existante du compte.
  const local = depotLocal(VIDE);
  const distant = depotDistant(instantaneValide());

  const resultat = await sauvegarder({
    local,
    distant,
    utilisateurId: 'utilisateur-1',
    maintenant: MAINTENANT,
  });

  assert.equal(resultat.statut, 'refuse');
  assert.equal(resultat.raison, 'local_vide');
  assert.equal(distant.ecritures(), 0, 'la sauvegarde distante doit rester intacte');
  assert.notEqual(distant.contenu(), null);
});

test('sauvegarder envoie l’état local et rapporte ce qui a été envoyé', async () => {
  const local = depotLocal(ETAT_REMPLI);
  const distant = depotDistant();

  const resultat = await sauvegarder({
    local,
    distant,
    utilisateurId: 'utilisateur-1',
    maintenant: MAINTENANT,
  });

  assert.equal(resultat.statut, 'reussi');
  assert.equal(resultat.comptes.passages, 1);
  assert.equal(resultat.comptes.seances, 1);
  assert.equal(resultat.updatedAt, MAINTENANT.toISOString());
  assert.equal(distant.ecritures(), 1, 'un seul envoi, pas deux');

  const envoye = distant.contenu();
  assert.equal(envoye.version, VERSION_INSTANTANE);
  assert.equal(envoye.sessions[0].id, 'local1');
});

// === Restauration : les refus ===

test('restaurer refuse sans compte connecté', async () => {
  const local = depotLocal(VIDE);
  const distant = depotDistant(instantaneValide());

  const resultat = await restaurer({ local, distant, utilisateurId: null, maintenant: MAINTENANT });

  assert.equal(resultat.statut, 'refuse');
  assert.equal(resultat.raison, 'non_authentifie');
  assert.equal(local.ecritures(), 0);
});

test('restaurer refuse quand le compte n’a aucune sauvegarde', async () => {
  const local = depotLocal(VIDE);
  const distant = depotDistant(null);

  const resultat = await restaurer({
    local,
    distant,
    utilisateurId: 'utilisateur-1',
    maintenant: MAINTENANT,
  });

  assert.equal(resultat.statut, 'refuse');
  assert.equal(resultat.raison, 'distant_vide');
  assert.equal(local.ecritures(), 0);
});

test('restaurer refuse une sauvegarde vide au lieu d’effacer l’appareil', async () => {
  const local = depotLocal(VIDE);
  const distant = depotDistant(
    instantaneValide({ config: null, memorized: [], sessions: [], reviews: [] })
  );

  const resultat = await restaurer({
    local,
    distant,
    utilisateurId: 'utilisateur-1',
    maintenant: MAINTENANT,
  });

  assert.equal(resultat.statut, 'refuse');
  assert.equal(resultat.raison, 'distant_vide');
  assert.equal(local.ecritures(), 0);
});

test('restaurer refuse d’écraser une progression locale sans confirmation', async () => {
  const local = depotLocal(ETAT_REMPLI);
  const distant = depotDistant(instantaneValide());

  const resultat = await restaurer({
    local,
    distant,
    utilisateurId: 'utilisateur-1',
    maintenant: MAINTENANT,
  });

  assert.equal(resultat.statut, 'refuse');
  assert.equal(resultat.raison, 'ecrasement_non_confirme');
  assert.equal(local.ecritures(), 0, 'la progression locale doit être intacte');
  assert.equal(local.contenu().sessions[0].id, 'local1');
});

test('restaurer refuse un instantané illisible et laisse l’appareil intact', async () => {
  const local = depotLocal(ETAT_REMPLI);
  const distant = depotDistant(instantaneValide({ version: 99 }));

  const resultat = await restaurer({
    local,
    distant,
    utilisateurId: 'utilisateur-1',
    confirmerEcrasement: true,
    maintenant: MAINTENANT,
  });

  assert.equal(resultat.statut, 'refuse');
  assert.equal(resultat.raison, 'instantane_invalide');
  assert.ok(resultat.problemes.length > 0, 'le motif doit être exploitable');
  assert.equal(local.ecritures(), 0);
});

// === Restauration : le chemin qui aboutit ===

test('restaurer s’applique sans confirmation sur un appareil vierge', async () => {
  // C'est le cas du changement de téléphone : rien à perdre.
  const local = depotLocal(VIDE);
  const distant = depotDistant(instantaneValide());

  const resultat = await restaurer({
    local,
    distant,
    utilisateurId: 'utilisateur-1',
    maintenant: MAINTENANT,
  });

  assert.equal(resultat.statut, 'reussi');
  assert.equal(resultat.comptes.seances, 1);
  assert.equal(local.ecritures(), 1);
  assert.equal(local.contenu().sessions[0].id, 's1');
  assert.equal(local.contenu().config.onboardingCompleted, true);
});

test('restaurer avec confirmation remplace intégralement le local', async () => {
  // Un remplacement partiel laisserait coexister deux progressions : les
  // anciennes séances de l'appareil ne doivent pas survivre.
  const local = depotLocal(ETAT_REMPLI);
  const distant = depotDistant(instantaneValide());

  const resultat = await restaurer({
    local,
    distant,
    utilisateurId: 'utilisateur-1',
    confirmerEcrasement: true,
    maintenant: MAINTENANT,
  });

  assert.equal(resultat.statut, 'reussi');
  const apres = local.contenu();
  assert.equal(apres.sessions.length, 1);
  assert.equal(apres.sessions[0].id, 's1');
  assert.ok(
    !apres.sessions.some((s) => s.id === 'local1'),
    'aucune séance locale ne doit subsister'
  );
});

test('sauvegarder puis restaurer rend exactement ce qui a été sauvegardé', async () => {
  const source = depotLocal(ETAT_REMPLI);
  const distant = depotDistant();

  await sauvegarder({ local: source, distant, utilisateurId: 'utilisateur-1', maintenant: MAINTENANT });

  const cible = depotLocal(VIDE);
  const resultat = await restaurer({
    local: cible,
    distant,
    utilisateurId: 'utilisateur-1',
    maintenant: MAINTENANT,
  });

  assert.equal(resultat.statut, 'reussi');
  assert.deepEqual(cible.contenu(), source.contenu());
});

// === Validation de la charge distante ===

test('un instantané conforme est accepté', () => {
  assert.equal(validerSnapshot(instantaneValide()).ok, true);
});

test('une version inconnue est refusée en bloc', () => {
  const resultat = validerSnapshot(instantaneValide({ version: 2 }));
  assert.equal(resultat.ok, false);
  assert.ok(resultat.problemes.some((p) => p.includes('version')));
});

test('une charge qui n’est pas un objet est refusée', () => {
  for (const valeur of [null, undefined, 42, 'texte', []]) {
    assert.equal(validerSnapshot(valeur).ok, false, `refus attendu pour ${String(valeur)}`);
  }
});

test('une date qui n’existe pas au calendrier est refusée', () => {
  // « 2026-02-31 » a la bonne forme : seule la vérification par le calendrier
  // la rejette.
  const resultat = validerSnapshot(
    instantaneValide({
      sessions: [{ ...instantaneValide().sessions[0], date: '2026-02-31' }],
    })
  );

  assert.equal(resultat.ok, false);
  assert.ok(resultat.problemes.some((p) => p.includes('date invalide')));
});

test('une sourate hors du Coran est refusée', () => {
  const resultat = validerSnapshot(
    instantaneValide({
      memorized: [{ surah: 115, startAyah: 1, endAyah: 2, level: 'perfect' }],
    })
  );

  assert.equal(resultat.ok, false);
  assert.ok(resultat.problemes.some((p) => p.includes('sourate')));
});

test('un verset au-delà de la fin de la sourate est refusé', () => {
  // Al-Fatiha compte 7 versets : le 8 n'existe pas.
  const resultat = validerSnapshot(
    instantaneValide({
      memorized: [{ surah: 1, startAyah: 1, endAyah: 8, level: 'perfect' }],
    })
  );

  assert.equal(resultat.ok, false);
  assert.ok(resultat.problemes.some((p) => p.includes('verset de fin')));
});

test('une fin avant le début est refusée', () => {
  const resultat = validerSnapshot(
    instantaneValide({
      memorized: [{ surah: 2, startAyah: 10, endAyah: 4, level: 'perfect' }],
    })
  );

  assert.equal(resultat.ok, false);
  assert.ok(resultat.problemes.some((p) => p.includes('avant le début')));
});

test('deux séances portant le même identifiant sont refusées', () => {
  // Deux identifiants identiques se recouvriraient silencieusement à
  // l'écriture : on perdrait une séance sans que rien ne le signale.
  const seance = instantaneValide().sessions[0];
  const resultat = validerSnapshot(
    instantaneValide({ sessions: [seance, { ...seance, date: '2026-09-23' }] })
  );

  assert.equal(resultat.ok, false);
  assert.ok(resultat.problemes.some((p) => p.includes('deux fois')));
});

test('un tableau manquant est refusé plutôt que traité comme vide', () => {
  const resultat = validerSnapshot(instantaneValide({ sessions: undefined }));
  assert.equal(resultat.ok, false);
  assert.ok(resultat.problemes.some((p) => p.includes('sessions')));
});

test('un statut de séance inconnu est refusé', () => {
  const resultat = validerSnapshot(
    instantaneValide({ sessions: [{ ...instantaneValide().sessions[0], status: 'en_cours' }] })
  );

  assert.equal(resultat.ok, false);
  assert.ok(resultat.problemes.some((p) => p.includes('statut inconnu')));
});

test('tous les problèmes sont accumulés, pas seulement le premier', () => {
  const resultat = validerSnapshot(
    instantaneValide({
      memorized: [{ surah: 200, startAyah: 1, endAyah: 2, level: 'parfait' }],
      sessions: [{ ...instantaneValide().sessions[0], status: 'inconnu' }],
    })
  );

  assert.equal(resultat.ok, false);
  assert.ok(resultat.problemes.length >= 3, `attendu au moins 3 problèmes, reçu ${resultat.problemes.length}`);
});

test('estVide distingue un instantané sans données d’un instantané rempli', () => {
  assert.equal(
    estVide(instantaneValide({ config: null, memorized: [], sessions: [], reviews: [] })),
    true
  );
  assert.equal(estVide(instantaneValide()), false);
  // Une configuration seule suffit à rendre l'instantané non vide : c'est le
  // questionnaire qui atteste d'un usage réel.
  assert.equal(
    estVide(instantaneValide({ memorized: [], sessions: [], reviews: [] })),
    false
  );
});
