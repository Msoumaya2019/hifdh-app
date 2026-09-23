// L'espace de discussion entre deux amis : ce qui se décide, et rien d'autre.
//
// Même partage que `amis.ts` : les DÉCISIONS sont ici et se testent sans
// réseau, l'appel réseau est un détail (`src/lib/sync/discussion.ts`). Ce qui
// se décide, c'est la forme d'un message, ce qu'on accepte d'envoyer, et ce
// qu'on dit quand ça ne passe pas.
//
// Trois choses ne sont PAS ici, et c'est volontaire :
//
//   - l'autorisation. Elle vit dans les politiques RLS de
//     `supabase/discussions.sql`. Un module qui « vérifie » qui a le droit
//     avant d'appeler est un module qui peut se tromper — et qui, en se
//     trompant, laisse croire que la base ne vérifie pas ;
//   - la borne de longueur de la base (2000 caractères). Elle est dans une
//     contrainte `CHECK`. Celle d'ici est plus stricte EXPRÈS : on prévient
//     avant de refuser, plutôt que de laisser la base trancher sous les yeux
//     de quelqu'un qui vient d'écrire un long message ;
//   - la modération. Masquer, retirer : ce sont des gestes, pas des décisions
//     de forme. Ils sont dans la couche réseau, et la règle est en base.
//
// UNE RÈGLE QUI COMPTE : un message est du TEXTE, et rien d'autre. Il n'y a
// aucune notion de pièce jointe ici, parce qu'il n'y en a aucune dans la table.
// La contrainte est de forme, donc impossible à contourner — pas un réglage
// que quelqu'un pourrait changer.

/** La longueur d'un message, bornée plus strictement que la base. */
export const LONGUEUR_MESSAGE_MAX = 500;

/** Le nombre de messages qu'on demande d'un coup pour afficher un fil. */
export const MESSAGES_PAR_PAGE = 100;

/**
 * Un message tel qu'il s'affiche.
 *
 * `corps` peut être `null` : c'est le cas d'un message RETIRÉ, dont la base ne
 * rend plus le texte (voir `lire_fil` dans `supabase/discussions.sql`). La
 * fonction ne décide pas de le cacher — c'est déjà fait, et c'est mieux là —
 * mais elle doit savoir le représenter.
 */
export type MessageDiscussion = {
  id: number;
  /** Qui l'a écrit. Sert à le ranger à droite ou à gauche dans le fil. */
  auteur: string;
  /** Le texte, ou `null` si le message a été retiré. */
  corps: string | null;
  /** Date et heure d'envoi, au format ISO. */
  envoyeLe: string;
  /** Vrai si un modérateur l'a masqué — donc invisible pour les deux amis. */
  masqueParModerateur: boolean;
  /** Vrai si l'auteur (ou un modérateur) l'a retiré du fil. */
  retire: boolean;
};

/** La forme brute rendue par `lire_fil(...)` en base. */
export type LigneMessageBrute = {
  id?: number | string | null;
  auteur?: string | null;
  corps?: string | null;
  created_at?: string | null;
  retire_le?: string | null;
  masque_par_moderateur?: boolean | null;
};

/**
 * Convertit une ligne de la base en `MessageDiscussion`.
 *
 * Rend `null` — et non un message vide — quand la ligne n'a pas d'identifiant
 * ou pas d'auteur : sans ces deux champs, on ne peut ni la reconnaître ni la
 * placer, et un message fantôme dans un fil est pire qu'un message absent.
 *
 * `id` revient parfois en chaîne : `BIGSERIAL` est un `BIGINT`, et PostgREST
 * sérialise les `BIGINT` en texte pour ne pas perdre de précision. On convertit
 * ici, une fois. Un `id` non convertible est un `null`, pas un `NaN` — un `NaN`
 * se propagerait silencieusement dans les comparaisons.
 */
export function lireMessage(ligne: LigneMessageBrute): MessageDiscussion | null {
  const id = entierPositif(ligne.id);
  if (id === null) return null;
  if (typeof ligne.auteur !== 'string' || ligne.auteur.length === 0) return null;

  const retire = typeof ligne.retire_le === 'string' && ligne.retire_le.length > 0;

  return {
    id,
    auteur: ligne.auteur,
    // La ceinture et les bretelles : si la base a rendu un texte pour un
    // message retiré, on ne l'affiche pas. La politique et `lire_fil` le
    // cachent déjà, mais une ligne arrivée par un autre chemin ne doit pas
    // pouvoir ressusciter un texte retiré.
    corps: retire ? null : normaliserCorps(ligne.corps),
    envoyeLe: typeof ligne.created_at === 'string' ? ligne.created_at : '',
    masqueParModerateur: ligne.masque_par_moderateur === true,
    retire,
  };
}

/** Ce qu'on dit d'un message dont le texte n'est plus là. */
export function texteAffiche(message: MessageDiscussion): string {
  if (message.retire) return 'Message retiré';
  return message.corps ?? '';
}

/**
 * Le message peut-il être envoyé ?
 *
 * Rend la raison du refus, ou `null` si tout va bien. Une fonction qui rend un
 * booléen obligerait l'écran à deviner POURQUOI, et à réécrire les phrases —
 * donc à les faire diverger de celles-ci. Ici la phrase est écrite une fois,
 * là où la règle est écrite.
 */
export function refusEnvoi(saisie: string): string | null {
  const texte = saisie.trim();

  if (texte.length === 0) {
    return 'Écris d’abord un message.';
  }

  // Un message ne portant QUE des caractères invisibles se voit comme un vide
  // dans le fil, alors que `trim()` l'a laissé passer : l'espace insécable, la
  // marque de direction et l'espace fine insécable ne sont pas des espaces pour
  // `trim()`. On les retire donc avant de compter.
  if (nettoyerInvisibles(texte).length === 0) {
    return 'Écris d’abord un message.';
  }

  if (texte.length > LONGUEUR_MESSAGE_MAX) {
    const exces = texte.length - LONGUEUR_MESSAGE_MAX;
    return `Trop long de ${exces} caractère${exces > 1 ? 's' : ''}. La limite est ${LONGUEUR_MESSAGE_MAX}.`;
  }

  return null;
}

/** Le texte tel qu'il partira : détouré, et sans ses caractères de contrôle. */
export function preparerEnvoi(saisie: string): string {
  return nettoyerInvisibles(saisie.trim());
}

/**
 * Combien de caractères il reste, pour l'affichage du compteur.
 *
 * Jamais négatif : un compteur qui passe sous zéro inquiète plus qu'il
 * n'informe, alors que le refus, lui, dit déjà l'excès en clair.
 */
export function caracteresRestants(saisie: string): number {
  return Math.max(0, LONGUEUR_MESSAGE_MAX - saisie.length);
}

/** Le fil est-il vide de tout ce qui se lit ? */
export function filVide(messages: MessageDiscussion[]): boolean {
  return messages.length === 0;
}

/**
 * Le fil, rangé du plus ancien au plus récent.
 *
 * La base le rend déjà dans cet ordre (`ORDER BY created_at, id`), mais on ne
 * s'y fie pas : l'ordre d'affichage d'une conversation est une décision, et il
 * se décide ici, où il se teste. En cas d'égalité de date — deux messages
 * écrits dans la même seconde, ce qui arrive — c'est l'`id` qui tranche, et
 * c'est le seul ordre stable : lui seul ne peut pas se répéter.
 *
 * On ne modifie PAS le tableau reçu : un tri en place surprendrait l'appelant,
 * qui garde souvent la liste d'origine.
 */
export function rangerFil(messages: MessageDiscussion[]): MessageDiscussion[] {
  return [...messages].sort((a, b) => {
    if (a.envoyeLe !== b.envoyeLe) return a.envoyeLe < b.envoyeLe ? -1 : 1;
    return a.id - b.id;
  });
}

/**
 * Le nombre de messages non retirés.
 *
 * C'est ce qu'on annonce sur la fiche d'un ami : « 12 messages ». Compter les
 * messages retirés gonflerait le nombre d'échanges qui n'ont plus de texte, et
 * donnerait à un fil nettoyé l'apparence d'un fil actif.
 */
export function compterMessages(messages: MessageDiscussion[]): number {
  return messages.filter((m) => !m.retire).length;
}

/** « 1 message » / « 3 messages ». */
export function resumerFil(messages: MessageDiscussion[]): string {
  const n = compterMessages(messages);
  if (n === 0) return 'Aucun message';
  return `${n} message${n > 1 ? 's' : ''}`;
}

/** `2026-09-23T14:32:11Z` → `23/09 à 14:32`. Une heure lisible, pas un ISO. */
export function formaterEnvoi(iso: string): string {
  if (typeof iso !== 'string' || iso.length < 16) return '';

  // On lit les champs de la chaîne plutôt que de construire un `Date` : le
  // projet a déjà payé une fois un décalage d'un jour dû à un passage en UTC
  // (voir `src/lib/dates.ts`). Ici le fuseau du serveur est celui qu'on veut,
  // et le lire tel quel évite toute conversion.
  const mois = iso.slice(5, 7);
  const jour = iso.slice(8, 10);
  const heure = iso.slice(11, 13);
  const minute = iso.slice(14, 16);
  if (!/^\d{2}$/.test(mois) || !/^\d{2}$/.test(jour)) return '';
  return `${jour}/${mois} à ${heure}:${minute}`;
}

/**
 * Séparateur de jour à insérer avant ce message, ou `null`.
 *
 * Dans un fil qui s'étale, on veut un repère « Aujourd'hui », « Hier » ou la
 * date — sans répéter la même date sur chaque message. La fonction rend donc le
 * libellé à poser AVANT le message, et seulement quand le jour change.
 *
 * `aujourdhui` est passé en paramètre plutôt que lu de `new Date()` : c'est ce
 * qui rend la fonction éprouvable, et le projet applique déjà cette règle
 * partout ailleurs.
 */
export function separateurDeJour(
  message: MessageDiscussion,
  precedent: MessageDiscussion | null,
  aujourdhui: string
): string | null {
  const jour = message.envoyeLe.slice(0, 10);
  if (jour.length !== 10) return null;

  if (precedent !== null && precedent.envoyeLe.slice(0, 10) === jour) return null;

  const hier = jourPrecedent(aujourdhui);
  if (jour === aujourdhui) return "Aujourd'hui";
  if (jour === hier) return 'Hier';

  const mois = jour.slice(5, 7);
  const numero = jour.slice(8, 10);
  if (!/^\d{2}$/.test(mois) || !/^\d{2}$/.test(numero)) return null;
  return `${numero}/${mois}`;
}

/**
 * Le jour d'avant, au format `AAAA-MM-JJ`.
 *
 * Écrit à la main plutôt que par `Date` : le projet a mesuré qu'un
 * `toISOString()` sur un `Date` local fait basculer la date d'un jour en
 * soirée, ce qui afficherait « Hier » pour aujourd'hui. Le calcul porte sur des
 * entiers de calendrier, et se teste donc exactement.
 */
export function jourPrecedent(jour: string): string {
  const [annee, mois, numero] = jour.split('-').map(Number);
  if (!Number.isInteger(annee) || !Number.isInteger(mois) || !Number.isInteger(numero)) {
    return jour;
  }

  const dansLeMois = joursDuMois(annee, mois);
  if (numero > 1) return formaterJour(annee, mois, numero - 1);
  if (mois > 1) return formaterJour(annee, mois - 1, joursDuMois(annee, mois - 1));
  return formaterJour(annee - 1, 12, 31);
}

function joursDuMois(annee: number, mois: number): number {
  if (mois === 2) return bissextile(annee) ? 29 : 28;
  if ([4, 6, 9, 11].includes(mois)) return 30;
  return 31;
}

function bissextile(annee: number): boolean {
  return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
}

function formaterJour(annee: number, mois: number, numero: number): string {
  return `${annee}-${String(mois).padStart(2, '0')}-${String(numero).padStart(2, '0')}`;
}

/**
 * Le message d'erreur à montrer, à partir du code SQL et du message brut.
 *
 * Même méthode que `messageErreurAmi` : on lit le CODE plutôt que le texte, qui
 * peut être reformulé côté base sans prévenir. Les codes viennent de
 * `supabase/discussions.sql`, où ils sont posés explicitement.
 */
export function messageErreurDiscussion(code: string | null, message: string | null): string {
  if (code === '42501') {
    // Deux sens possibles pour ce code : la politique a écarté l'écriture
    // (l'amitié est rompue, ou l'auteur n'est pas celui qu'on croit), ou bien
    // le déclencheur a refusé une réécriture. Le message brut les distingue,
    // et c'est le seul cas où l'on regarde le texte.
    const brut = (message ?? '').toLowerCase();
    if (brut.includes('réécrit') || brut.includes('reecrit')) {
      return 'Un message envoyé ne peut pas être réécrit.';
    }
    if (brut.includes('modération') || brut.includes('moderation')) {
      return 'Cette action est réservée à la modération.';
    }
    if (brut.includes('auteur') || brut.includes('destinataire')) {
      return 'Un message ne peut pas changer d’auteur.';
    }
    return 'Vous ne pouvez pas écrire dans cette discussion. L’amitié a peut-être été rompue.';
  }

  if (code === '23514') {
    // Une contrainte `CHECK` : corps vide, ou trop long. Le texte de la base
    // est long et parle de contraintes ; on préfère une phrase utile.
    return 'Ce message ne peut pas être envoyé : il est vide ou trop long.';
  }

  const propre = (message ?? '').trim();
  return propre.length > 0 ? propre : "Le message n'a pas pu être envoyé. Réessayez.";
}

// === Les détails ===========================================================

/**
 * Retire les caractères de contrôle et les espaces « invisibles ».
 *
 * Un message se transporte en ligne, et un texte collé depuis ailleurs peut
 * porter des caractères de contrôle — une tabulation verticale, un séparateur
 * Unicode — qui casseraient l'affichage ou se compteraient comme du contenu
 * alors qu'on ne les voit pas.
 *
 * Sont conservés : les sauts de ligne, qui sont une mise en forme légitime, et
 * les espaces ordinaires. Sont retirés : les caractères de contrôle, et les
 * espaces qui n'en sont pas tout à fait (insécables, fines, marques de
 * direction) — ramenés à un espace ordinaire, ou retirés s'ils sont en bord.
 */
function nettoyerInvisibles(texte: string): string {
  return texte
    // Le point de code 0x7F est « supprimer », 0x00-0x08 et 0x0B-0x1F sont des
    // contrôles, sauf 0x09 (tabulation) et 0x0A (retour à la ligne), qu'on
    // garde.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    // Les espaces Unicode qui ne sont pas l'espace ordinaire U+0020 : ils
    // rendent un message invisible à l'œil tout en le remplissant.
    //
    // La plage des commandes bidirectionnelles va jusqu'à U+202E incluse, et ce
    // n'est pas du zèle : l'application écrit de l'ARABE, donc un texte
    // bidirectionnel est la norme. Une commande de direction laissée dans un
    // message peut réordonner l'affichage de tout ce qui la suit — le message
    // de quelqu'un d'autre, l'heure, le nom de l'ami. Le test l'a montré : ma
    // première plage s'arrêtait à U+200F et laissait passer U+202E.
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\u200B-\u200F\u2028-\u202E\u2066-\u2069\uFEFF]/g, ' ')
    .trim();
}

function normaliserCorps(valeur: string | null | undefined): string | null {
  if (typeof valeur !== 'string') return null;
  const propre = nettoyerInvisibles(valeur);
  return propre.length === 0 ? null : propre;
}

function entierPositif(valeur: number | string | null | undefined): number | null {
  if (valeur === null || valeur === undefined) return null;
  const n = typeof valeur === 'number' ? valeur : Number(valeur);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}
