// Le profil : les six sections, leur ORDRE, et l'accord de leurs titres.
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// La demande nomme six sections et leur ordre, et ajoute : « Ne change pas cet
// ordre. » C'est une décision de FORME. Déplacer une section ne casse rien :
// l'écran s'affiche, les données sont là, aucun test de comportement ne bronche.
// Il ne manque qu'une chose — l'ordre demandé — et c'est exactement ce qu'aucun
// autre contrôle ne voit.
//
// CE QU'IL GARDE, ET POURQUOI CHAQUE GARDE COMPTE
// ----------------------------------------------
//   1. Les six marqueurs, dans l'ordre : `<PrenomSection />` puis les cinq
//      titres. La liste est comparée ENTIÈREMENT, pas « contient » : une
//      section ajoutée, retirée ou déplacée fait échouer la comparaison, et un
//      titre resté sous son ancien nom aussi ;
//   2. Les cinq titres que ce fichier écrit portent le MÊME style, et ce style
//      est celui de `PrenomSection` — qui porte le premier titre. Six sections,
//      six titres qui se ressemblent : c'est ce qui en fait six sections plutôt
//      que six blocs. Rien ne relie les deux fichiers, donc rien ne le
//      signalerait ;
//   3. L'interrupteur des révisions est un VRAI interrupteur, et il écrit. La
//      demande dit « des cases à cocher ou des interrupteurs clairement
//      identifiables » et interdit les boutons radio pour un choix multiple.
//      Un `Switch` décoratif, qui ne fait que changer d'apparence, satisferait
//      l'œil et ne réglerait rien.
//
// CE QUE CE FICHIER NE PROUVE PAS
// -------------------------------
// Il lit une source ; il ne rend rien. Il n'établit ni que les six sections
// tiennent sur un écran de téléphone, ni qu'elles sont agréables à parcourir.
// Ces deux choses se regardent sur un appareil.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const lire = (chemin) => readFileSync(join(RACINE, chemin), 'utf8');

/**
 * Le source sans ses commentaires.
 *
 * Sans ce retrait, une phrase écrite dans un commentaire satisferait le contrôle
 * qui la cherche — et ce fichier en contient, des commentaires, dont un qui
 * cite `sectionTitle`. C'est la première façon dont un test de forme se met à
 * ne plus rien mesurer : il lit ce qu'on a écrit SUR le code au lieu du code.
 */
const sansCommentaires = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

const PROFIL = 'app/profil.tsx';
const PRENOM = 'src/components/PrenomSection.tsx';

/**
 * Les six sections, dans l'ordre demandé.
 *
 * La première est un MARQUEUR et non un titre : son titre appartient à
 * `PrenomSection`, qui le rend dans quatre états distincts. Ce que ce fichier
 * doit garantir, c'est que la section 1 est bien la première.
 */
const SECTIONS = [
  'PrenomSection',
  'Mes récitations',
  'Connaissances',
  'Objectif et rythme',
  'Apprentissage',
  'Amis et entraide',
];

/** Les titres de section, tels que `app/profil.tsx` les écrit, dans l'ordre. */
function marqueursDuProfil() {
  const source = sansCommentaires(lire(PROFIL));
  return [
    ...source.matchAll(
      /<PrenomSection\s*\/>|<Text\s+style=\{styles\.sectionTitle\}>\s*([^<]+?)\s*<\/Text>/g
    ),
  ].map((m) => m[1] ?? 'PrenomSection');
}

/**
 * Le corps du style `sectionTitle`, ramené à une forme comparable.
 *
 * `PrenomSection` nomme sa palette `palette`, le profil la nomme `colors` :
 * c'est la seule différence entre les deux blocs, et elle n'en est pas une. Les
 * espaces sont réduits pour que l'indentation ne décide pas de l'accord.
 */
function styleSectionTitle(source) {
  const sans = sansCommentaires(source);
  const bloc = sans.match(/sectionTitle:\s*\{([\s\S]*?)\}/);
  assert.ok(bloc, 'le fichier doit déclarer un style « sectionTitle »');
  return bloc[1].replace(/\bpalette\./g, 'colors.').replace(/\s+/g, ' ').trim();
}

test('les six sections sont là, dans l’ordre demandé', () => {
  assert.deepEqual(
    marqueursDuProfil(),
    SECTIONS,
    'les six sections du profil doivent se suivre dans cet ordre précis — '
      + '« Ne change pas cet ordre. »'
  );
});

test('les six titres se ressemblent : même style de part et d’autre', () => {
  // Le premier titre vit dans `PrenomSection`, les cinq autres dans le profil.
  // Rien ne relie les deux fichiers, donc un changement d'un seul côté
  // donnerait cinq titres d'une forme et un sixième d'une autre.
  assert.equal(
    styleSectionTitle(lire(PROFIL)),
    styleSectionTitle(lire(PRENOM)),
    'le style des titres du profil doit rester celui de `PrenomSection` : '
      + 'six sections font six titres qui se ressemblent'
  );
});

test('l’interrupteur des révisions est réel, et il écrit', () => {
  const source = sansCommentaires(lire(PROFIL));

  // Un vrai `Switch`, avec sa liaison : la demande l'exige explicitement pour
  // un réglage indépendant.
  assert.match(
    source,
    /<Switch[\s\S]{0,400}?onValueChange=/,
    'le réglage des révisions doit être un vrai interrupteur, avec sa liaison'
  );

  // Et il doit ÉCRIRE. Un interrupteur qui ne change que son apparence laisse
  // croire à un réglage enregistré, sans que rien ne le soit.
  assert.match(
    source,
    /enregistrerRevisions\(/,
    'basculer l’interrupteur doit enregistrer le réglage, pas seulement changer d’aspect'
  );

  // La valeur affichée vient de la règle « absent vaut actif », qui vit dans
  // `@/lib/apprentissage` et nulle part ailleurs.
  assert.match(
    source,
    /revisionsActives\(/,
    'la position de l’interrupteur doit venir de `revisionsActives`'
  );
});
