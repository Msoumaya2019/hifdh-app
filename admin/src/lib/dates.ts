// ============================================================================
// Dates calendaires.
//
// Jamais `toISOString()`. Cette methode convertit d'abord en UTC : a Paris,
// entre minuit et deux heures du matin, elle rend la date de la veille. Un
// tableau de bord qui compterait les seances « en retard » avec cette date
// signalerait un retard d'un jour a un apprenant qui vient de travailler.
//
// L'instant de reference est un parametre, pas une lecture d'horloge : c'est
// ce qui rend la fonction eprouvable.
// ============================================================================

/** La date du jour, au format `AAAA-MM-JJ`, dans le fuseau de la machine. */
export function dateDuJour(maintenant: Date = new Date()): string {
  const annee = maintenant.getFullYear();
  const mois = String(maintenant.getMonth() + 1).padStart(2, '0');
  const jour = String(maintenant.getDate()).padStart(2, '0');
  return `${annee}-${mois}-${jour}`;
}

/**
 * Un horodatage rendu lisible, dans le fuseau de la machine.
 *
 * `null` reste `null` : une date absente ne devient pas « 1er janvier 1970 ».
 * C'est la meme regle que partout ailleurs dans ce tableau de bord — une
 * absence se dit, elle ne se remplit pas.
 */
export function formaterHorodatage(valeur: string | null | undefined): string | null {
  if (!valeur) return null;
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

/** Une date `AAAA-MM-JJ` rendue lisible, sans passer par UTC. */
export function formaterDate(valeur: string | null | undefined): string | null {
  if (!valeur) return null;
  const correspondance = /^(\d{4})-(\d{2})-(\d{2})/.exec(valeur);
  if (!correspondance) return null;
  const [, annee, mois, jour] = correspondance;
  // Construction en heure locale : les trois nombres sont deja ceux du
  // calendrier, les reconvertir par UTC les decalerait.
  const date = new Date(Number(annee), Number(mois) - 1, Number(jour));
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(date);
}
