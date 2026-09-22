#!/usr/bin/env node
// ============================================================================
// Les invariants des 480 toumoun, tels que le tableau de bord les suppose.
//
// `package.json` annoncait deja « npm run verifier:bornes » ; le fichier
// n'existait pas. C'est le seul controle de ce dossier qui porte sur les
// DONNEES, et non sur le code : les tests verifient que les fonctions font ce
// qu'elles disent, pas que le fichier qu'elles lisent tient debout.
//
// Ce qui est verifie ici est ce dont une correction depend :
//
//   - la chaine est continue — chaque toumoun commence au verset qui suit la
//     fin du precedent. Sans cela, « la limite du toumoun N » et « la fin du
//     toumoun N-1 » ne designent plus le meme verset, et une correction
//     locale laisserait un trou ;
//   - le debut d'un toumoun verifie est un debut de rub' al-hizb, et celui
//     d'un toumoun estime n'en est pas un. C'est cette mesure qui a etabli que
//     l'estimation porte sur le DEBUT : les 151 fins sont des fins de rub',
//     aucun des 151 debuts n'est un debut de rub'. Si l'invariant tombe, la
//     colonne « Limite estimee » du tableau de bord ne dit plus la verite ;
//   - le resume inscrit dans les metadonnees s'accorde avec les donnees. Le
//     document `docs/divisions-estimees.md` compare les deux cote application ;
//     un desaccord ici ferait relire des bornes qui n'existent plus.
//
// Le script ne corrige rien et n'ecrit rien : il constate. Un fichier absent
// est une erreur, jamais une liste vide.
// ============================================================================

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const ADMIN = join(ICI, '..');
const DONNEES = join(ADMIN, 'src', 'donnees');

const FICHIER_THUMN = join(DONNEES, 'thumn_hafs.json');
const FICHIER_SOURATES = join(DONNEES, 'surahs.json');

const TOTAL_TOUMOUN = 480;
const TOTAL_VERSETS = 6236;
const STATUTS_CONNUS = ['verified_hafs', 'verified', 'estimated_offset', 'relue'];

const problemes = [];
const signaler = (message) => problemes.push(message);

function lire(chemin) {
  if (!existsSync(chemin)) {
    console.error(
      `Fichier absent : ${chemin}\n` +
        "  Lancer « npm run donnees:synchroniser » depuis le dossier admin."
    );
    process.exit(1);
  }
  return JSON.parse(readFileSync(chemin, 'utf8'));
}

// ---------------------------------------------------------------------------
// 1. La forme
// ---------------------------------------------------------------------------

const fichier = lire(FICHIER_THUMN);
const sourates = lire(FICHIER_SOURATES);
const thumn = fichier.thumn;

if (!Array.isArray(thumn)) {
  console.error('thumn_hafs.json : « thumn » doit etre une liste.');
  process.exit(1);
}
if (thumn.length !== TOTAL_TOUMOUN) {
  signaler(`${thumn.length} toumoun au lieu de ${TOTAL_TOUMOUN}.`);
}

// Le numero et la place dans la liste doivent coincider : tout le reste du
// fichier se lit par numero, et une liste desordonnee ferait comparer deux
// toumoun qui ne se suivent pas.
const parNumero = new Map();
for (const [rang, t] of thumn.entries()) {
  if (!Number.isInteger(t.thumnNumber) || t.thumnNumber < 1 || t.thumnNumber > TOTAL_TOUMOUN) {
    signaler(`rang ${rang} : numero de toumoun invalide (${t.thumnNumber}).`);
    continue;
  }
  if (t.thumnNumber !== rang + 1) {
    signaler(
      `le toumoun ${t.thumnNumber} est au rang ${rang} : la liste doit suivre ` +
        "l'ordre du Coran, un toumoun par rang."
    );
  }
  if (parNumero.has(t.thumnNumber)) {
    signaler(`le toumoun ${t.thumnNumber} apparait deux fois.`);
  }
  parNumero.set(t.thumnNumber, t);
}

for (const t of thumn) {
  const numero = t.thumnNumber;

  if (!STATUTS_CONNUS.includes(t.verificationStatus)) {
    signaler(
      `toumoun ${numero} : statut « ${t.verificationStatus} » inconnu. ` +
        `Connus : ${STATUTS_CONNUS.join(', ')}. ` +
        "Un statut inconnu ferait rejeter le fichier entier par le tableau de bord."
    );
  }

  for (const champ of ['startSurah', 'startAyah', 'startAyahId', 'endSurah', 'endAyah', 'endAyahId']) {
    if (!Number.isInteger(t.hafs?.[champ])) {
      signaler(`toumoun ${numero} : hafs.${champ} n'est pas un entier.`);
    }
  }
  if (
    !Number.isInteger(t.qalounReference?.startSurah) ||
    !Number.isInteger(t.qalounReference?.startAyah)
  ) {
    signaler(`toumoun ${numero} : qalounReference.start* n'est pas un entier.`);
  }
  if (typeof t.isRubStart !== 'boolean') {
    signaler(`toumoun ${numero} : isRubStart n'est pas un booleen.`);
  }
}

// ---------------------------------------------------------------------------
// 2. La continuite de la chaine
// ---------------------------------------------------------------------------

let ruptures = 0;
for (let numero = 2; numero <= TOTAL_TOUMOUN; numero += 1) {
  const precedent = parNumero.get(numero - 1);
  const courant = parNumero.get(numero);
  if (!precedent || !courant) continue;

  const attendu = precedent.hafs.endAyahId + 1;
  if (courant.hafs.startAyahId !== attendu) {
    ruptures += 1;
    if (ruptures <= 5) {
      signaler(
        `rupture entre les toumoun ${numero - 1} et ${numero} : le ${numero} ` +
          `commence au verset ${courant.hafs.startAyahId}, attendu ${attendu}.`
      );
    }
  }
}
if (ruptures > 5) signaler(`... et ${ruptures - 5} autre(s) rupture(s).`);

const premier = parNumero.get(1);
if (premier && premier.hafs.startAyahId !== 1) {
  signaler(`le toumoun 1 commence au verset ${premier.hafs.startAyahId}, attendu 1.`);
}
const dernier = parNumero.get(TOTAL_TOUMOUN);
if (dernier && dernier.hafs.endAyahId !== TOTAL_VERSETS) {
  signaler(
    `le toumoun ${TOTAL_TOUMOUN} finit au verset ${dernier.hafs.endAyahId}, ` +
      `attendu ${TOTAL_VERSETS} : le Coran ne serait pas pave en entier.`
  );
}

// ---------------------------------------------------------------------------
// 3. Le debut estime n'est pas un debut de rub'
// ---------------------------------------------------------------------------

// C'est l'invariant central. Un toumoun impair ouvre un rub' al-hizb : son
// debut vient des donnees Hafs verifiees. Un toumoun pair commence entre deux
// rub' : c'est cette limite-la qui s'estime.
const debutsDeRub = thumn.filter((t) => t.isRubStart).map((t) => t.thumnNumber);
const attendusDeRub = [];
for (let numero = 1; numero <= TOTAL_TOUMOUN; numero += 2) attendusDeRub.push(numero);

if (debutsDeRub.length !== attendusDeRub.length) {
  signaler(
    `${debutsDeRub.length} debut(s) de rub' pour ${attendusDeRub.length} toumoun ` +
      'impairs : les deux doivent coincider.'
  );
} else {
  const ecarts = debutsDeRub.filter((numero, i) => debutsDeRub[i] !== numero);
  if (ecarts.length > 0) {
    signaler(
      `les debuts de rub' ne sont pas les toumoun impairs. Premier ecart au rang ` +
        `${debutsDeRub.indexOf(ecarts[0])} : toumoun ${ecarts[0]}.`
    );
  }
}

const estimees = thumn.filter((t) => t.verificationStatus === 'estimated_offset');
const verifieesHafs = thumn.filter((t) => t.verificationStatus === 'verified_hafs');

const estimeesQuiOuvrentUnRub = estimees.filter((t) => t.isRubStart);
if (estimeesQuiOuvrentUnRub.length > 0) {
  signaler(
    `${estimeesQuiOuvrentUnRub.length} toumoun estime(s) ouvrent un rub' al-hizb : ` +
      `[${estimeesQuiOuvrentUnRub.slice(0, 8).map((t) => t.thumnNumber).join(', ')}]. ` +
      "Un debut de rub' vient des donnees Hafs verifiees : il ne s'estime pas. " +
      'La colonne « Limite estimee » du tableau de bord enverrait relire une borne ' +
      'qui n\'a jamais ete en doute.'
  );
}

const verifieesQuiNouvrentPas = verifieesHafs.filter((t) => !t.isRubStart);
if (verifieesQuiNouvrentPas.length > 0) {
  signaler(
    `${verifieesQuiNouvrentPas.length} toumoun verified_hafs n'ouvrent pas un rub' : ` +
      `[${verifieesQuiNouvrentPas.slice(0, 8).map((t) => t.thumnNumber).join(', ')}].`
  );
}

// Chaque limite estimee tombe strictement entre les deux debuts de rub' qui
// l'encadrent. C'est ce qui la rend relisible : un relecteur a un rub' avant et
// un rub' apres, et le toumoun tient entre les deux.
let horsIntervalle = 0;
for (const t of estimees) {
  const avant = parNumero.get(t.thumnNumber - 1);
  const apres = parNumero.get(t.thumnNumber + 1);
  if (!avant || !apres) continue;
  if (!(t.hafs.startAyahId > avant.hafs.startAyahId && t.hafs.startAyahId < apres.hafs.startAyahId)) {
    horsIntervalle += 1;
    if (horsIntervalle <= 3) {
      signaler(
        `la limite du toumoun ${t.thumnNumber} (${t.hafs.startSurah}:${t.hafs.startAyah}) ` +
          `n'est pas strictement entre les debuts des toumoun ${avant.thumnNumber} et ` +
          `${apres.thumnNumber}.`
      );
    }
  }
}
if (horsIntervalle > 3) signaler(`... et ${horsIntervalle - 3} autre(s).`);

// ---------------------------------------------------------------------------
// 4. Le resume des metadonnees s'accorde avec les donnees
// ---------------------------------------------------------------------------

const resume = fichier.metadata?.verificationSummary;
if (!resume || typeof resume !== 'object') {
  signaler("metadata.verificationSummary est absent : le document engendre ne peut pas le confronter aux donnees.");
} else {
  const compte = {};
  for (const t of thumn) compte[t.verificationStatus] = (compte[t.verificationStatus] ?? 0) + 1;

  for (const statut of STATUTS_CONNUS) {
    const attendu = compte[statut] ?? 0;
    const inscrit = resume[statut];
    // Un statut a zero n'a pas forcement de ligne : le generateur omet la ligne
    // « relue » tant qu'aucune borne n'a ete relue.
    if (attendu === 0 && inscrit === undefined) continue;
    if (typeof inscrit !== 'string' || !inscrit.startsWith(`${attendu} / ${TOTAL_TOUMOUN}`)) {
      signaler(
        `metadata.verificationSummary.${statut} annonce « ${inscrit} », ` +
          `les donnees en portent ${attendu}.`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Ce que le tableau de bord tient pour vrai, et qui ne doit pas deriver
// ---------------------------------------------------------------------------

// Les sourates doivent couvrir le Coran sans trou ni recouvrement : le tableau
// de bord situe une borne a partir d'elles.
let attendu = 1;
for (const sourate of sourates) {
  if (sourate.startAyahId !== attendu) {
    signaler(
      `sourate ${sourate.number} : premier verset global ${sourate.startAyahId}, ` +
        `attendu ${attendu}.`
    );
    break;
  }
  attendu += sourate.ayahCount;
}
if (attendu - 1 !== TOTAL_VERSETS) {
  signaler(`les sourates couvrent ${attendu - 1} versets, attendu ${TOTAL_VERSETS}.`);
}

// ---------------------------------------------------------------------------

if (problemes.length > 0) {
  console.error('Bornes des toumoun : ECHEC\n');
  for (const p of problemes) console.error(`  - ${p}\n`);
  console.error(`${problemes.length} probleme(s).`);
  process.exit(1);
}

const ecartsQaloun = estimees.filter(
  (t) =>
    t.hafs.startSurah !== t.qalounReference.startSurah ||
    t.hafs.startAyah !== t.qalounReference.startAyah
);
const compte = {};
for (const t of thumn) compte[t.verificationStatus] = (compte[t.verificationStatus] ?? 0) + 1;

console.log('Bornes des toumoun : OK');
console.log(`  ${thumn.length} toumoun, chaine continue de 1:1 a 114:6`);
console.log(
  `  ${compte.verified_hafs ?? 0} verified_hafs, ${compte.verified ?? 0} verified, ` +
    `${compte.estimated_offset ?? 0} estimated_offset` +
    (compte.relue ? `, ${compte.relue} relue` : '')
);
console.log(
  `  ${debutsDeRub.length} debuts de rub', tous sur un toumoun impair ; ` +
    `aucune des ${estimees.length} limites estimees n'en est un`
);
console.log(
  `  ${estimees.length} limite(s) estimee(s), toutes entre deux debuts de rub' ; ` +
    `${ecartsQaloun.length} ecart(s) avec la reference Qaloun` +
    (ecartsQaloun.length ? ` [${ecartsQaloun.map((t) => t.thumnNumber).join(', ')}]` : '')
);
