// Les récitateurs, et l'adresse de chaque verset récité.
//
// CE QUI A ÉTÉ MESURÉ, ET NON SUPPOSÉ
// -----------------------------------
// La source est le CDN `cdn.islamic.network`, celui de l'API alquran.cloud : il
// sert **un fichier par verset**, nommé par l'identifiant global du verset
// (1 à 6236), dans un dossier par récitateur :
//
//     https://cdn.islamic.network/quran/audio/<débit>/<édition>/<id>.mp3
//
// Ce que l'API annonce elle-même a été confronté à l'arithmétique de
// l'application — `startAyahId + ayah - 1` de `surahs.json` — sur douze
// versets répartis dans le Coran (1:1, 2:255, 2:286, 9:129, 18:1, 26:227, 29:69,
// 36:1, 55:78, 87:19, 112:1, 114:6) : **les douze tombent sur le même numéro**.
// L'adresse se construit donc sans jamais interroger l'API.
//
// LE DÉBIT CHANGE D'UN RÉCITATEUR À L'AUTRE, ET SE MESURE
// -------------------------------------------------------
// Ce n'est pas un paramètre qu'on choisit : chaque édition n'existe qu'à un ou
// deux débits, et le premier essai l'a montré — écrire `128` partout donne un
// **403** pour Abdul Basit, As-Sudais et Al-Basfar, qui sont en 192, et pour
// Ash-Shuraym, qui n'existe qu'en 64. Le débit de chaque édition a donc été
// relevé un par un, et il est écrit ici comme un fait mesuré.
//
// AL-GHAMDI N'EST PAS PROPOSÉ, ET C'EST UN CONSTAT
// -----------------------------------------------
// Saadi Al-Ghamdi a été demandé, et la source ne le sert **pas** verset par
// verset : l'édition `ar.saadalghamdi` répond, mais son champ `audio` est nul —
// elle n'existe qu'au niveau de la sourate entière. Un récitateur proposé qui ne
// peut pas jouer serait pire qu'un récitateur absent : l'utilisateur croirait à
// une panne de réseau. Il n'est donc pas dans la liste, et l'absence est écrite
// ici plutôt que découverte à l'usage.
//
// CE QUI NE SE MÉLANGE PAS
// ------------------------
// Le récitateur est choisi une fois pour la séance, et ne change pas en cours de
// lecture : mélanger deux récitations dans une même écoute est précisément ce
// que la spécification interdit. Le changement de récitateur en cours de lecture
// **arrête** la séance et en ouvre une neuve — voir `plan.ts`.

import { ayahRefToAyahId, getSurahAyahCount } from '@/data/quranData';

export interface Recitateur {
  /** L'identifiant employé dans les préférences. Stable, et sans accent. */
  id: string;
  /** Le nom affiché, en français. */
  nom: string;
  /** Le nom en arabe, pour l'affichage secondaire. */
  nomArabe: string;
  /** L'édition de la source, telle qu'elle se nomme dans son adresse. */
  edition: string;
  /**
   * Le préfixe mesuré de ses fichiers, débit compris.
   *
   * Écrit en entier plutôt que recomposé à partir de l'édition : le débit est un
   * fait mesuré, et le recomposer demanderait une table de débits séparée, donc
   * un second endroit où se tromper.
   */
  prefixe: string;
}

/**
 * Les récitateurs proposés, dans l'ordre d'affichage.
 *
 * Le premier est le récitateur par défaut : c'est le plus répandu, et c'est
 * celui que la plupart des apprenants reconnaissent.
 */
export const RECITATEURS: Recitateur[] = [
  {
    id: 'alafasy',
    nom: 'Mishary Alafasy',
    nomArabe: 'مشاري العفاسي',
    edition: 'ar.alafasy',
    prefixe: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/',
  },
  {
    id: 'husary',
    nom: 'Mahmoud Khalil Al-Hussary',
    nomArabe: 'محمود خليل الحصري',
    edition: 'ar.husary',
    prefixe: 'https://cdn.islamic.network/quran/audio/128/ar.husary/',
  },
  {
    id: 'minshawi',
    nom: 'Mohamed Siddiq Al-Minshawi',
    nomArabe: 'محمد صديق المنشاوي',
    edition: 'ar.minshawi',
    prefixe: 'https://cdn.islamic.network/quran/audio/128/ar.minshawi/',
  },
  {
    id: 'abdulbasit',
    nom: 'Abdul Basit Abdus-Samad',
    nomArabe: 'عبد الباسط عبد الصمد',
    edition: 'ar.abdulbasitmurattal',
    prefixe: 'https://cdn.islamic.network/quran/audio/192/ar.abdulbasitmurattal/',
  },
  {
    id: 'muaiqly',
    nom: 'Maher Al-Muaiqly',
    nomArabe: 'ماهر المعيقلي',
    edition: 'ar.mahermuaiqly',
    prefixe: 'https://cdn.islamic.network/quran/audio/128/ar.mahermuaiqly/',
  },
  {
    id: 'sudais',
    nom: 'Abdurrahman As-Sudais',
    nomArabe: 'عبدالرحمن السديس',
    edition: 'ar.abdurrahmaansudais',
    prefixe: 'https://cdn.islamic.network/quran/audio/192/ar.abdurrahmaansudais/',
  },
  {
    id: 'shaatree',
    nom: 'Abu Bakr Ash-Shaatree',
    nomArabe: 'أبو بكر الشاطري',
    edition: 'ar.shaatree',
    prefixe: 'https://cdn.islamic.network/quran/audio/128/ar.shaatree/',
  },
  {
    id: 'hudhaify',
    nom: 'Ali Al-Hudhaify',
    nomArabe: 'علي بن عبدالرحمن الحذيفي',
    edition: 'ar.hudhaify',
    prefixe: 'https://cdn.islamic.network/quran/audio/128/ar.hudhaify/',
  },
  {
    id: 'shuraym',
    nom: 'Saoud Ash-Shuraym',
    nomArabe: 'سعود الشريم',
    edition: 'ar.saoodshuraym',
    // Seul récitateur de la liste qui n'existe qu'en 64 : le débit est donc plus
    // faible, et c'est un fait de la source, pas un choix.
    prefixe: 'https://cdn.islamic.network/quran/audio/64/ar.saoodshuraym/',
  },
  {
    id: 'ayyoub',
    nom: 'Muhammad Ayyub',
    nomArabe: 'محمد أيوب',
    edition: 'ar.muhammadayyoub',
    prefixe: 'https://cdn.islamic.network/quran/audio/128/ar.muhammadayyoub/',
  },
];

/** Le récitateur proposé par défaut. */
export const RECITATEUR_PAR_DEFAUT = 'alafasy';

/** Le premier récitateur de la liste — celui qu'on emploie si rien n'est réglé. */
export function recitateurParDefaut(): Recitateur {
  return RECITATEURS[0];
}

/**
 * Le récitateur d'un identifiant, ou le premier de la liste.
 *
 * Ne rend jamais `undefined` : ce qui vient du disque n'est pas typé, et une
 * valeur inconnue doit mener à un récitateur qui joue, pas à un écran vide.
 */
export function recitateurParId(id: unknown): Recitateur {
  if (typeof id === 'string') {
    const trouve = RECITATEURS.find((r) => r.id === id);
    if (trouve !== undefined) return trouve;
  }
  return recitateurParDefaut();
}

/** Vrai si la valeur lue désigne un récitateur connu. */
export function estIdRecitateur(valeur: unknown): valeur is string {
  return (
    typeof valeur === 'string' && RECITATEURS.some((r) => r.id === valeur)
  );
}

/**
 * L'adresse du fichier d'un verset, par son identifiant global (1 à 6236).
 *
 * Rend `null` hors bornes plutôt qu'une adresse qui répondrait 404 : c'est la
 * même règle que pour les pages du moushaf, et pour la même raison — une adresse
 * fausse se présente comme une panne de réseau.
 */
export function urlAudioVersetId(recitateur: Recitateur, ayahId: number): string | null {
  if (!Number.isInteger(ayahId) || ayahId < 1 || ayahId > TOTAL_VERSETS) return null;
  return `${recitateur.prefixe}${ayahId}.mp3`;
}

/**
 * L'adresse du fichier d'un verset nommé par sa sourate et son rang.
 *
 * Rend `null` si le couple ne désigne pas un verset du Coran.
 *
 * LE RANG EST VÉRIFIÉ ICI, ET IL DOIT L'ÊTRE. `ayahRefToAyahId` ne contrôle que
 * la SOURATE : il rend `startAyahId + ayah - 1`, sans jamais comparer `ayah` au
 * nombre de versets de la sourate. Demander 29:70 — la sourate 29 en compte 69 —
 * rendait donc l'identifiant du premier verset de la sourate 30, et l'adresse
 * d'un verset qui n'a rien à voir. C'est le même défaut que celui déjà corrigé
 * dans `getAyahText`, et il ne se signale pas : il joue le mauvais verset.
 */
export function urlAudioVerset(
  recitateur: Recitateur,
  surah: number,
  ayah: number
): string | null {
  if (!Number.isInteger(ayah) || ayah < 1) return null;
  if (ayah > getSurahAyahCount(surah)) return null;
  try {
    return urlAudioVersetId(recitateur, ayahRefToAyahId({ surah, ayah }));
  } catch {
    return null;
  }
}

/** Le nombre de versets du Coran, borne du dernier identifiant. */
export const TOTAL_VERSETS = 6236;
