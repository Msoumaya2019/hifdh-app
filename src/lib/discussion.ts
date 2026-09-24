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

// === Les non-lus ===========================================================
//
// Ce que la base rend est un compte PAR FIL, et un total. La décision qui vit
// ici est petite mais elle compte : ce qu'on fait d'un zéro, et ce qu'on écrit
// au-delà de neuf.

/** Ce qui reste à lire dans un fil, et quand le dernier message est arrivé. */
export type NonLusFil = {
  /** L'identifiant de l'autre participant. */
  autre: string;
  /** Nombre de messages visibles de l'autre, non encore lus. */
  nonLus: number;
  /** Date du dernier de ces messages, ou null. */
  dernierLe: string | null;
};

export type LigneNonLusBrute = {
  autre?: string | null;
  non_lus?: number | string | null;
  dernier_le?: string | null;
};

/**
 * Lit une ligne de non-lus.
 *
 * `non_lus` revient parfois en chaîne — c'est le cas de tout ce que PostgREST
 * sérialise depuis un `BIGINT` ou un `NUMERIC`. Une chaîne comparée à un nombre
 * échoue en silence, et un `"2"` affiché tel quel passe encore : c'est
 * exactement le genre de défaut qui ne se voit pas sur un téléphone.
 */
export function lireNonLus(ligne: LigneNonLusBrute): NonLusFil | null {
  if (typeof ligne.autre !== 'string' || ligne.autre.length === 0) return null;
  const brut = typeof ligne.non_lus === 'number' ? ligne.non_lus : Number(ligne.non_lus ?? 0);
  if (!Number.isFinite(brut)) return null;
  return {
    autre: ligne.autre,
    nonLus: Math.max(0, Math.round(brut)),
    dernierLe: typeof ligne.dernier_le === 'string' && ligne.dernier_le.length >= 10
      ? ligne.dernier_le
      : null,
  };
}

/**
 * Indexe les non-lus par ami.
 *
 * La liste des conversations parcourt les amis, et chacun cherche son compte.
 * Un `find` dans le tableau donnerait le même résultat en O(n²), ce qui ne se
 * voit pas à trois amis et se voit à trois cents.
 */
export function indexerNonLus(lignes: NonLusFil[]): Record<string, NonLusFil> {
  const index: Record<string, NonLusFil> = {};
  for (const ligne of lignes) index[ligne.autre] = ligne;
  return index;
}

export function totalDesNonLus(lignes: NonLusFil[]): number {
  return lignes.reduce((somme, ligne) => somme + ligne.nonLus, 0);
}

/**
 * La pastille : ce qu'on écrit dessus, ou `null` pour « rien ».
 *
 * `null` et non « 0 » : une pastille qui affiche zéro est un signe qui ne dit
 * rien et qui attire l'œil — le contraire de ce qu'on veut d'une notification.
 *
 * Et « 9+ » au-delà de neuf : une pastille de trois chiffres déborde de son
 * icône, se fait couper, et devient illisible. Le chiffre exact n'a d'ailleurs
 * aucune valeur ici — « il y a beaucoup à lire » est toute l'information.
 */
export function badgeNonLus(total: number): string | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  const propre = Math.round(total);
  return propre > 9 ? '9+' : String(propre);
}

/**
 * La date d'aperçu d'une conversation, en trois formes seulement.
 *
 * « 14:32 » aujourd'hui, « Hier », « 22/09 » au-delà. Une date complète dans une
 * liste occupe la moitié de la largeur pour dire ce que trois signes suffisent
 * à dire — et l'année, dans un fil qui vient de s'ouvrir, n'apprend rien.
 *
 * `aujourdhui` est un PARAMÈTRE, comme partout dans ce dépôt : c'est ce qui
 * rend la fonction éprouvable sans dépendre de l'horloge de la machine.
 */
export function formaterApercuDate(iso: string | null, aujourdhui: string): string {
  if (iso === null || iso.length < 10) return '';
  const jour = iso.slice(0, 10);
  if (jour === aujourdhui) return iso.length >= 16 ? iso.slice(11, 16) : '';
  if (jour === jourPrecedent(aujourdhui)) return 'Hier';
  const [, mois, numero] = jour.split('-');
  if (!mois || !numero) return '';
  return `${numero}/${mois}`;
}

// === L'aperçu des fils =====================================================
//
// Ce qu'une liste de conversations doit dire, et rien de plus : qui a écrit en
// dernier, et quoi. Le texte vient de `apercu_fils`, qui applique déjà les
// règles de visibilité du fil — un message masqué n'y est pas, un message
// retiré y est sans son texte.

/** Le dernier message visible d'un fil, tel qu'il s'aperçoit dans la liste. */
export type ApercuFil = {
  /** L'identifiant de l'autre participant. */
  autre: string;
  /** Date du dernier message visible, ou null. */
  dernierLe: string | null;
  /**
   * Son texte, ou `null` s'il a été retiré.
   *
   * `null` et non une chaîne vide : la base distingue « retiré » de « vide »,
   * et cette distinction est la seule information qu'une pierre tombale porte.
   */
  apercu: string | null;
  /** Le message est-il de moi ? */
  deMoi: boolean;
};

export type LigneApercuBrute = {
  autre?: string | null;
  dernier_le?: string | null;
  apercu?: string | null;
  de_moi?: boolean | null;
};

export function lireApercu(ligne: LigneApercuBrute): ApercuFil | null {
  if (typeof ligne.autre !== 'string' || ligne.autre.length === 0) return null;
  return {
    autre: ligne.autre,
    dernierLe:
      typeof ligne.dernier_le === 'string' && ligne.dernier_le.length >= 10
        ? ligne.dernier_le
        : null,
    apercu: typeof ligne.apercu === 'string' ? ligne.apercu : null,
    // Un `de_moi` absent vaut FAUX : la ligne ne peut venir que de la base, et
    // supposer « de moi » ferait précéder d'un « Vous : » le message d'un autre
    // — une petite phrase fausse, mais fausse.
    deMoi: ligne.de_moi === true,
  };
}

export function indexerApercus(lignes: ApercuFil[]): Record<string, ApercuFil> {
  const index: Record<string, ApercuFil> = {};
  for (const ligne of lignes) index[ligne.autre] = ligne;
  return index;
}

/**
 * La phrase d'aperçu, telle qu'elle s'affiche.
 *
 * Elle reprend mot pour mot ce que dit le fil : « Message retiré » y est la
 * même phrase, et c'est voulu — deux formulations pour une même chose feraient
 * douter qu'il s'agit de la même.
 *
 * Les blancs sont RAMENÉS À UN SEUL, et les retours à la ligne disparaissent :
 * un message écrit en trois paragraphes occuperait sinon trois lignes dans une
 * liste qui n'en prévoit qu'une, et la troncature se ferait au hasard.
 */
export function apercuTexte(apercu: ApercuFil | null): string {
  if (apercu === null) return 'Aucun message';
  if (apercu.apercu === null) return 'Message retiré';
  const propre = apercu.apercu.replace(/\s+/g, ' ').trim();
  return apercu.deMoi ? `Vous : ${propre}` : propre;
}

/**
 * Les conversations, du plus récent au plus ancien.
 *
 * Les amis sans fil viennent APRÈS, et dans l'ordre où la base les a rendus :
 * un ami avec qui l'on n'a jamais parlé n'est pas une conversation, et le
 * mettre en tête parce qu'il n'a pas de date serait le contraire de ce qu'on
 * cherche en ouvrant cet écran.
 *
 * Le tri est STABLE — garanti par la spécification ECMAScript — donc les amis
 * sans date gardent leur ordre. C'est ce qui permet de ne pas avoir à les
 * trier une seconde fois, et de ne pas écrire ici une règle qui appartient à
 * `mes_amis`.
 *
 * La fonction est générique sur la seule chose qu'elle utilise : l'identifiant.
 * Elle ne connaît donc pas `PointAmi`, et reste éprouvable sans rien importer.
 */
export function rangerConversations<T extends { userId: string }>(
  amis: T[],
  apercus: Record<string, ApercuFil>,
  nonLus: Record<string, NonLusFil>
): T[] {
  const date = (ami: T): string | null => {
    const apercu = apercus[ami.userId];
    if (apercu !== undefined && apercu.dernierLe !== null) return apercu.dernierLe;
    // Un fil sans aperçu mais avec des non-lus ne devrait pas exister — on ne
    // peut pas avoir de message non lu sans message. On le date tout de même,
    // par prudence : une pastille allumée sur une ligne rangée en bas se
    // chercherait.
    const compte = nonLus[ami.userId];
    return compte !== undefined && compte.nonLus > 0 ? compte.dernierLe : null;
  };

  return [...amis].sort((a, b) => {
    const da = date(a);
    const db = date(b);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    if (da === db) return 0;
    return da < db ? 1 : -1;
  });
}
