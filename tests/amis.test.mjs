// Le suivi entre amis : ce qui se décide sans réseau.
//
// Ce fichier n'éprouve pas la base — c'est le rôle de `scripts/banc_supabase.mjs`,
// qui exécute le vrai SQL sous Postgres. Il éprouve la couche qui reçoit les
// lignes et les rend lisibles : conversion des nombres, des dates, des noms,
// codes d'erreur, et les phrases montrées à l'utilisateur.
//
// Convertir les nombres n'est pas cosmétique : PostgREST rend les `NUMERIC` et
// les `BIGINT` en CHAÎNES. Un `"2"` affiché tel quel passe encore, mais un
// `"2"` comparé à `2` échoue en silence, et une addition de chaînes donne
// « 12 » là où l'on attend 3.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  autrePartie,
  codePlausible,
  couleurAvatar,
  COULEURS_AVATAR,
  formaterCodeAmi,
  formaterDateCourte,
  formaterIdentifiantPublic,
  identifiantPlausible,
  initiales,
  lireBlocage,
  lireDemande,
  lirePointAmi,
  lireProfilTrouve,
  messageErreurAmi,
  messageRefusDemande,
  nettoyerCodeSaisi,
  nettoyerIdentifiantPublic,
  nomCouleurAvatar,
  normaliserNom,
  ouEnEst,
  repartirDemandes,
  resumeActivite,
  situationProfil,
} from '@/lib/amis';

const RACINE = fileURLToPath(new URL('..', import.meta.url));

// === Conversion des lignes ==================================================

test('une ligne de la base se lit en point d’ami', () => {
  const point = lirePointAmi({
    user_id: '22222222-2222-2222-2222-222222222222',
    nom: 'Aïcha',
    versets_cette_semaine: 12,
    pages_cette_semaine: 2.5,
    derniere_seance: '2026-09-21',
    derniere_sourate: 36,
    jours_d_etude_7j: 4,
  });

  assert.notEqual(point, null);
  assert.equal(point.userId, '22222222-2222-2222-2222-222222222222');
  assert.equal(point.nom, 'Aïcha');
  assert.equal(point.versetsCetteSemaine, 12);
  assert.equal(point.pagesCetteSemaine, 2.5);
  assert.equal(point.derniereSeance, '2026-09-21');
  assert.equal(point.derniereSourate, 36);
  assert.equal(point.joursDEtude7j, 4);
});

test('les nombres rendus en chaine par la passerelle sont convertis', () => {
  // PostgREST sérialise `NUMERIC` et `BIGINT` en texte. Sans conversion, une
  // addition donnerait « 1 » + « 2 » = « 12 ».
  const point = lirePointAmi({
    user_id: 'a',
    versets_cette_semaine: '12',
    pages_cette_semaine: '2.5',
    derniere_sourate: '36',
    jours_d_etude_7j: '4',
  });

  assert.equal(typeof point.versetsCetteSemaine, 'number');
  assert.equal(point.versetsCetteSemaine, 12);
  assert.equal(typeof point.pagesCetteSemaine, 'number');
  assert.equal(point.pagesCetteSemaine, 2.5);
  assert.equal(point.derniereSourate, 36);
  assert.equal(typeof point.joursDEtude7j, 'number');

  // Et la somme se comporte comme une somme.
  assert.equal(point.versetsCetteSemaine + 3, 15);
});

test('une ligne sans identifiant ne devient pas un ami', () => {
  // Une ligne qu'on ne peut pas nommer ne doit pas entrer dans la liste : on ne
  // saurait ni l'afficher ni la retirer.
  assert.equal(lirePointAmi({ nom: 'Sans identifiant' }), null);
  assert.equal(lirePointAmi({ user_id: '', nom: 'Vide' }), null);
  assert.equal(lirePointAmi({ user_id: null }), null);
});

test('les valeurs absentes ou aberrantes deviennent zero, jamais NaN', () => {
  // Un « NaN » affiché dans une phrase (« NaN versets cette semaine ») ferait
  // douter de toute la ligne. Zéro dit la même chose sans mentir.
  const point = lirePointAmi({
    user_id: 'a',
    versets_cette_semaine: null,
    pages_cette_semaine: 'pas un nombre',
    derniere_sourate: null,
    jours_d_etude_7j: undefined,
  });

  assert.equal(point.versetsCetteSemaine, 0);
  assert.equal(point.pagesCetteSemaine, 0);
  assert.equal(point.derniereSourate, null);
  assert.equal(point.joursDEtude7j, 0);
  assert.ok(Number.isFinite(point.pagesCetteSemaine));
});

test('l’infini est ramene a zero comme le reste', () => {
  // `Number.isNaN` ne suffirait pas : `Infinity` n'est pas NaN, et
  // `Math.round(Infinity)` rend `Infinity`. La phrase afficherait alors
  // « Infinity versets cette semaine » — un nombre que personne n'a saisi.
  // `Number.isFinite` est donc la seule garde qui tienne pour les deux.
  const point = lirePointAmi({
    user_id: 'a',
    versets_cette_semaine: Infinity,
    pages_cette_semaine: '-Infinity',
    derniere_sourate: 'Infinity',
    jours_d_etude_7j: Infinity,
  });

  assert.ok(Number.isFinite(point.versetsCetteSemaine));
  assert.ok(Number.isFinite(point.pagesCetteSemaine));
  assert.ok(Number.isFinite(point.joursDEtude7j));
  assert.ok(Number.isFinite(point.derniereSourate));
  assert.ok(
    !resumeActivite(point).includes('Infinity'),
    'aucune phrase ne doit contenir « Infinity »'
  );
});

test('un compteur negatif est ramene a zero', () => {
  // Une valeur négative n'a pas de sens pour un compteur de versets ; l'afficher
  // ferait douter du reste de la ligne.
  const point = lirePointAmi({ user_id: 'a', versets_cette_semaine: -5, jours_d_etude_7j: -1 });
  assert.equal(point.versetsCetteSemaine, 0);
  assert.equal(point.joursDEtude7j, 0);
});

test('une date horodatee est ramenee au jour', () => {
  // `TIMESTAMPTZ` arrive avec l'heure et le fuseau ; seule la date nous sert.
  const point = lirePointAmi({ user_id: 'a', derniere_seance: '2026-09-21T18:04:00+02:00' });
  assert.equal(point.derniereSeance, '2026-09-21');
  assert.equal(formaterDateCourte(point.derniereSeance), '21/09');
});

// === Le nom affiché =========================================================

test('un nom absent ou blanc ne laisse pas de trou a l’ecran', () => {
  assert.equal(normaliserNom(null), 'Un apprenant');
  assert.equal(normaliserNom(undefined), 'Un apprenant');
  assert.equal(normaliserNom(''), 'Un apprenant');
  assert.equal(normaliserNom('   '), 'Un apprenant');
  assert.equal(normaliserNom('  Aïcha  '), 'Aïcha');
});

test('la synthese ne dit jamais « en retard »', () => {
  // La fonctionnalité met en relation des personnes, elle ne les classe pas.
  // La comparaison entre pairs est exactement ce qu'elle ne doit pas devenir.
  const phrases = [
    resumeActivite(lirePointAmi({ user_id: 'a', versets_cette_semaine: 0 })),
    resumeActivite(lirePointAmi({ user_id: 'a', versets_cette_semaine: 12 })),
    ouEnEst(lirePointAmi({ user_id: 'a', derniere_sourate: 36, derniere_seance: '2026-09-21' })),
    ouEnEst(lirePointAmi({ user_id: 'a' })),
  ];

  for (const phrase of phrases) {
    const bas = phrase.toLowerCase();
    for (const mot of ['retard', 'en avance', 'derrière', 'moins que', 'mieux que']) {
      assert.ok(!bas.includes(mot), `« ${mot} » ne doit pas apparaître : « ${phrase} »`);
    }
  }
});

test('la synthese d’un ami sans activite est neutre, pas un reproche', () => {
  assert.equal(
    resumeActivite(lirePointAmi({ user_id: 'a', versets_cette_semaine: 0, derniere_seance: null })),
    "N'a pas encore commencé"
  );
  assert.equal(
    resumeActivite(lirePointAmi({ user_id: 'a', versets_cette_semaine: 0, derniere_seance: '2026-09-10' })),
    "Rien cette semaine pour l'instant"
  );
});

test('la synthese s’accorde au singulier et au pluriel', () => {
  assert.equal(
    resumeActivite(lirePointAmi({ user_id: 'a', versets_cette_semaine: 1 })),
    '1 verset cette semaine'
  );
  assert.equal(
    resumeActivite(lirePointAmi({ user_id: 'a', versets_cette_semaine: 2 })),
    '2 versets cette semaine'
  );
});

// === Le code d'invitation ===================================================

test('le code se dicte et se lit par groupes de cinq', () => {
  // Dix caractères d'affilée se recopient mal, et un code se dicte au
  // téléphone. C'est un affichage : la valeur en base reste d'un seul tenant.
  assert.equal(formaterCodeAmi('ABCDEFGHJK'), 'ABCDE FGHJK');
  assert.equal(nettoyerCodeSaisi('ABCDE FGHJK'), 'ABCDEFGHJK');

  // La valeur en base n'est jamais mise en forme.
  const source = readFileSync(join(RACINE, 'src/lib/sync/amis.ts'), 'utf8');
  assert.match(
    source,
    /obtenir_code_ami/,
    'le service doit appeler la fonction SQL, pas fabriquer un code'
  );
  assert.doesNotMatch(
    source,
    /formaterCodeAmi\(\s*data\s*\)/,
    'le code envoyé ou lu ne doit pas être mis en forme : seul l’affichage l’est'
  );
});

test('la saisie tolere espaces, tirets et minuscules', () => {
  // On recopie un code dicté : les espaces et la casse ne sont pas des fautes.
  assert.equal(nettoyerCodeSaisi(' abcde-fghjk '), 'ABCDEFGHJK');
  assert.equal(nettoyerCodeSaisi('abcde fghjk'), 'ABCDEFGHJK');
  assert.ok(codePlausible('abcde fghjk'));
  assert.ok(codePlausible('ABCDE-FGHJK'));
});

test('les signes ambigus sont refuses a la saisie', () => {
  // I, L, O et 0 ne sont dans aucun code : les accepter laisserait croire à
  // une faute de frappe alors que le code ne peut pas les contenir.
  for (const ambigu of ['ABCDEFGHIJ', 'ABCDEFGHIL', 'ABCDEFGHIO', 'ABCDEFGHI0']) {
    assert.ok(!codePlausible(ambigu), `${ambigu} ne doit pas passer`);
  }
  // Et un code trop court ou trop long non plus.
  assert.ok(!codePlausible('ABCDEFGHJ'));
  assert.ok(!codePlausible('ABCDEFGHJKL'));
});

test('le refus distingue « code inconnu » de « saisie invalide »', () => {
  // Les deux méritent des phrases différentes : l'un se corrige en demandant
  // le bon code, l'autre en relisant ce qu'on a tapé.
  const inconnu = messageErreurAmi('P0002', 'Aucun compte ne porte ce code');
  const invalide = messageErreurAmi('22023', 'Code vide');

  assert.notEqual(inconnu, invalide);
  assert.match(inconnu, /Aucun compte/);
  assert.match(invalide, /valide/);
});

test('un code d’erreur inconnu ne laisse pas l’utilisateur sans phrase', () => {
  assert.ok(messageErreurAmi('XX000', null).length > 0);
  assert.ok(messageErreurAmi(null, null).length > 0);
  // Et une panne réseau n'est pas présentée comme une faute de l'utilisateur.
  assert.ok(messageErreurAmi(null, 'Failed to fetch').length > 0);
});

// === La forme du service ====================================================

test('la semaine envoyee a la base est la date LOCALE, pas UTC', () => {
  const source = readFileSync(join(RACINE, 'src/lib/sync/amis.ts'), 'utf8');
  // `toISOString()` bascule la date d'un jour en soirée : le projet l'a déjà
  // payé. La date du jour doit être construite à la main.
  const fonction = source.slice(source.indexOf('function aujourdhuiLocal'));
  const corps = fonction.slice(0, fonction.indexOf('\n}'));
  assert.doesNotMatch(corps, /toISOString/, 'la date locale ne doit pas passer par toISOString');
  assert.match(corps, /getFullYear\(\)/, 'la date locale se lit sur les accesseurs locaux');
});

test('l’autorisation n’est pas verifiee dans le service : elle reste en base', () => {
  const source = readFileSync(join(RACINE, 'src/lib/sync/amis.ts'), 'utf8');
  // Le projet pose l'autorisation dans les politiques RLS, pas dans le corps
  // des fonctions ni dans le client. Un service qui « vérifie » avant d'appeler
  // donnerait une fausse assurance : c'est la base qui tranche.
  assert.doesNotMatch(
    source,
    /if\s*\(\s*amiId\s*===\s*ctx\.userId\s*\)/,
    'le refus d’une action sur soi-même vient de la base, pas du client'
  );
  assert.match(source, /demander_ami_par_code/, 'l’ajout passe par la fonction SQL dédiée');
  // Et l'ancien nom ne doit plus subsister : `ajouter_ami_par_code` créait la
  // relation sans acceptation. Le garder ici, même appelé, aurait laissé
  // croire à l'écran qu'une amitié est faite là où une demande part.
  assert.doesNotMatch(
    source,
    /'ajouter_ami_par_code'/,
    'la fonction qui liait sans demander n’est plus appelée'
  );
});

test('le code SQL d’un refus remonte jusqu’a l’ecran', () => {
  const source = readFileSync(join(RACINE, 'src/lib/sync/amis.ts'), 'utf8');
  // Sans le code, l'écran ne lit que le texte — que la base peut reformuler
  // sans prévenir. « Ce code n'existe pas » se mettrait alors à ressembler à
  // « la base est en panne », et l'utilisateur chercherait au mauvais endroit.
  assert.match(source, /code:\s*codeErreur\(/, 'le code est conservé à côté du message');
  assert.match(source, /function codeErreur/, 'le code se lit sous ses deux noms');
  assert.match(source, /details\?\.match/, 'le code peut venir de « details » selon la passerelle');
});

// === Le profil public =======================================================

test('une ligne sans « partage » est traitee comme partagee', () => {
  // Le defaut de la colonne est VRAI, et le defaut de lecture doit dire la
  // meme chose. Un champ absent — une passerelle plus ancienne, une colonne
  // oubliee dans un `select` — ne doit pas eteindre l'affichage par accident.
  const point = lirePointAmi({ user_id: 'a' });
  assert.equal(point.partage, true);
});

test('une ligne qui ne partage pas est lue comme telle', () => {
  const point = lirePointAmi({ user_id: 'a', partage: false, versets_cette_semaine: 0 });
  assert.equal(point.partage, false);
});

test('un ami qui ne partage pas est dit tel quel, jamais « n’a pas commence »', () => {
  // C'est la phrase qui ne doit pas sortir : elle est fausse (il a peut-etre
  // beaucoup avance) et elle decourage, ce qui est le contraire du but.
  const point = lirePointAmi({ user_id: 'a', partage: false });
  assert.equal(resumeActivite(point), 'Ne partage pas sa progression');
  assert.equal(ouEnEst(point), 'Progression non partagée');
});

test('les initiales tiennent en deux signes, et jamais en vide', () => {
  assert.equal(initiales('Aicha Benali'), 'AB');
  assert.equal(initiales('Mohamed'), 'M');
  assert.equal(initiales('   '), '?');
  assert.equal(initiales(null), '?');
  // Un signe hors du plan de base occupe DEUX unites UTF-16 : `mot[0]` en
  // rendrait la moitie, c'est-a-dire un caractere de remplacement.
  assert.equal(initiales('\u{1F600} Karim'), '\u{1F600}K');
});

test('une teinte inconnue retombe sur la premiere, jamais sur rien', () => {
  assert.equal(couleurAvatar('rose'), 'rose');
  assert.equal(couleurAvatar('turquoise'), COULEURS_AVATAR[0]);
  assert.equal(couleurAvatar(null), COULEURS_AVATAR[0]);
  assert.equal(couleurAvatar(undefined), COULEURS_AVATAR[0]);
  assert.equal(nomCouleurAvatar('or'), 'Or');
});

test('l’identifiant public se nettoie comme on le recopie', () => {
  assert.equal(nettoyerIdentifiantPublic('@Mohamed_Ali'), 'mohamed_ali');
  assert.equal(nettoyerIdentifiantPublic('  Aicha  '), 'aicha');
  assert.equal(nettoyerIdentifiantPublic('Mohamed Ali'), 'mohamed_ali');
});

test('un identifiant public n’est plausible que sous sa forme reelle', () => {
  assert.equal(identifiantPlausible('aicha'), true);
  assert.equal(identifiantPlausible('@Aicha_2019'), true);
  // Trois signes au minimum : en dessous, un identifiant n'est plus distinctif.
  assert.equal(identifiantPlausible('ab'), false);
  // Une lettre d'abord : sinon un identifiant se confond avec un nombre.
  assert.equal(identifiantPlausible('1aicha'), false);
  assert.equal(identifiantPlausible('aicha!'), false);
  assert.equal(identifiantPlausible('a'.repeat(31)), false);
});

test('l’identifiant public s’affiche avec son arobase', () => {
  assert.equal(formaterIdentifiantPublic('aicha'), '@aicha');
  assert.equal(formaterIdentifiantPublic(null), '');
  assert.equal(formaterIdentifiantPublic(''), '');
});

// === Les demandes et les blocages ===========================================

const DEMANDE_RECUE = {
  demandeur: '11111111-1111-1111-1111-111111111111',
  destinataire: '22222222-2222-2222-2222-222222222222',
  nom: 'Aicha',
  avatar_couleur: 'rose',
  created_at: '2026-09-22T10:00:00Z',
  recue: true,
};

test('une demande se lit, et son identifiant horodate perd son heure', () => {
  const demande = lireDemande(DEMANDE_RECUE);
  assert.notEqual(demande, null);
  assert.equal(demande.nom, 'Aicha');
  assert.equal(demande.avatarCouleur, 'rose');
  assert.equal(demande.createdAt, '2026-09-22');
  assert.equal(demande.recue, true);
});

test('l’autre partie d’une demande depend du cote ou l’on est', () => {
  const recue = lireDemande(DEMANDE_RECUE);
  const envoyee = lireDemande({ ...DEMANDE_RECUE, recue: false });
  // Se tromper de cote ne leverait rien : un identifiant est un identifiant,
  // et l'ecran afficherait simplement la mauvaise personne.
  assert.equal(autrePartie(recue), DEMANDE_RECUE.demandeur);
  assert.equal(autrePartie(envoyee), DEMANDE_RECUE.destinataire);
});

test('les demandes se repartissent en deux sections', () => {
  const a = lireDemande(DEMANDE_RECUE);
  const b = lireDemande({ ...DEMANDE_RECUE, recue: false });
  const { recues, envoyees } = repartirDemandes([a, b]);
  assert.equal(recues.length, 1);
  assert.equal(envoyees.length, 1);
  assert.equal(recues[0].recue, true);
});

test('une demande sans les deux identifiants ne devient pas une ligne', () => {
  assert.equal(lireDemande({ demandeur: 'a' }), null);
  assert.equal(lireDemande({ destinataire: 'b' }), null);
  assert.equal(lireDemande({}), null);
});

test('un blocage se lit avec le nom de celui qu’on a bloque', () => {
  const blocage = lireBlocage({ bloque: 'b', nom: 'Karim', avatar_couleur: 'bleu' });
  assert.notEqual(blocage, null);
  assert.equal(blocage.bloque, 'b');
  assert.equal(blocage.nom, 'Karim');
  assert.equal(lireBlocage({}), null);
});

test('un profil trouve se range dans une seule situation, dans le bon ordre', () => {
  const base = { user_id: 'a', nom: 'Aicha' };
  assert.equal(situationProfil(lireProfilTrouve(base)), 'libre');
  assert.equal(
    situationProfil(lireProfilTrouve({ ...base, demande_envoyee: true })),
    'demande_envoyee'
  );
  assert.equal(situationProfil(lireProfilTrouve({ ...base, demande_recue: true })), 'demande_recue');
  // « deja ami » passe avant tout le reste : si les deux etaient vrais par
  // accident, c'est l'amitie qu'il faut montrer, parce qu'elle rend le bouton
  // inutile.
  assert.equal(
    situationProfil(lireProfilTrouve({ ...base, deja_ami: true, demande_envoyee: true })),
    'deja_ami'
  );
});

test('un refus de demande ne dit jamais que l’on est bloque', () => {
  // 42501 couvre deux choses : « vous mentez sur votre identite » et « ce
  // compte ne peut pas recevoir votre demande ». Dire la seconde sans jamais
  // laisser deviner un blocage est exactement ce qu'il faut.
  const phrase = messageRefusDemande('42501', 'raw');
  assert.ok(phrase.length > 0);
  assert.doesNotMatch(phrase, /bloqu/i);
  assert.equal(messageRefusDemande('23505', 'raw'), 'Vous êtes déjà amis.');
  // Un code inconnu retombe sur le message general, jamais sur du vide.
  assert.ok(messageRefusDemande(null, 'Failed to fetch').length > 0);
});

// === La garde qui tient le modele, dans le SQL ==============================

test('accepter une demande exige qu’une demande existe', () => {
  const source = readFileSync(join(RACINE, 'supabase/amis.sql'), 'utf8');
  const corps = source.slice(source.indexOf('FUNCTION public.repondre_demande_ami'));
  const bloc = corps.slice(0, corps.indexOf('$$;'));
  // Sans cette garde, la politique d'insertion de `amis` acceptait d'elle-meme
  // la paire (moi, cible) : on se liait a un inconnu sans que rien n'ait ete
  // demande. La politique ne peut pas le voir — elle ne connait que la ligne
  // ecrite, pas l'histoire qui l'a precedee.
  assert.match(bloc, /IF NOT EXISTS \(\s*SELECT 1 FROM public\.demandes_amis/, 'la demande doit exister');
  assert.match(bloc, /RETURN FALSE/, 'une demande absente rend un refus, pas une amitie');
});

test('bloquer rompt l’amitie, et le blocage est une fleche', () => {
  const source = readFileSync(join(RACINE, 'supabase/amis.sql'), 'utf8');
  const corps = source.slice(source.indexOf('FUNCTION public.bloquer_utilisateur'));
  const bloc = corps.slice(0, corps.indexOf('$$;'));
  assert.match(bloc, /DELETE FROM public\.amis/, 'bloquer rompt l’amitie');
  assert.match(bloc, /DELETE FROM public\.demandes_amis/, 'bloquer efface les demandes en attente');
  // L'ordre compte : le blocage d'abord. Si l'identite est fausse, on echoue
  // avant d'avoir rompu quoi que ce soit.
  assert.ok(
    bloc.indexOf('INSERT INTO public.blocages') < bloc.indexOf('DELETE FROM public.amis'),
    'le blocage s’ecrit avant la rupture'
  );
});
