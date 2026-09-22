// Dates calendaires.
//
// Une date de séance (« 2026-09-22 ») est une date du calendrier **local**, pas
// un instant. La dériver de `toISOString()` la calcule en UTC : pour un
// utilisateur en France (UTC+1 ou UTC+2), toute date obtenue entre 00:00 et
// 02:00 heure locale est celle de la veille. Cela décalait le programme du jour,
// les statistiques du jour, la semaine, le mois et la prochaine révision.
//
// Les horodatages (`createdAt`, `completedAt`, `lastReviewedAt`) restent, eux,
// des instants : `toISOString()` y est correct et n'est pas concerné.
//
// Ce module n'importe rien à l'exécution : c'est ce qui le rend éprouvable par
// un banc de test hors application.

/** Date locale au format « AAAA-MM-JJ ». */
export function versDateLocale(date: Date): string {
  const annee = date.getFullYear();
  const mois = String(date.getMonth() + 1).padStart(2, '0');
  const jour = String(date.getDate()).padStart(2, '0');
  return `${annee}-${mois}-${jour}`;
}

// L'instant de référence est injectable partout : une aide adossée à l'horloge
// réelle ne peut pas être vérifiée de façon déterministe, et un banc qui s'appuie
// sur l'heure courante ne détecte un défaut de date que pendant une partie de la
// journée.

/** La date d'aujourd'hui, dans le calendrier local. */
export function aujourdHui(depuis: Date = new Date()): string {
  return versDateLocale(depuis);
}

/** La date locale dans `nombre` jours (négatif pour le passé). */
export function dansJours(nombre: number, depuis: Date = new Date()): string {
  const date = new Date(depuis);
  date.setDate(date.getDate() + nombre);
  return versDateLocale(date);
}

/** La date locale il y a `nombre` jours. */
export function ilYAjours(nombre: number, depuis: Date = new Date()): string {
  return dansJours(-nombre, depuis);
}

/**
 * Interprète « AAAA-MM-JJ » comme une date locale.
 *
 * `new Date('2026-09-21')` est analysé comme minuit **UTC** : à l'ouest de
 * Greenwich, les accesseurs locaux rendent alors le 20 septembre, et l'interface
 * annonce le mauvais jour. On construit donc la date explicitement.
 */
export function analyserDateLocale(dateStr: string): Date {
  const morceaux = dateStr.split('-').map(Number);
  if (morceaux.length !== 3 || morceaux.some((n) => !Number.isFinite(n))) {
    return new Date(dateStr);
  }
  const [annee, mois, jour] = morceaux;
  return new Date(annee, mois - 1, jour);
}
