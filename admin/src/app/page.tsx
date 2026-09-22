import Link from 'next/link';

import { bornesEstimees, verifierContinuite } from '@/lib/bornes.ts';
import { lireDonneesThumn, LIBELLE_STATUT } from '@/lib/thumn.ts';

import donneesBrutes from '@/donnees/thumn_hafs.json';

// Page entierement statique : les chiffres viennent du fichier de donnees, pas
// d'une requete. Ils s'affichent donc avant que le moindre JavaScript ne soit
// charge, et ils ne dependent pas de la session — ce sont les memes pour tout
// le monde. Ce qui depend de la session est dans l'en-tete.
export default function Accueil() {
  const lecture = lireDonneesThumn(donneesBrutes);

  if (!lecture.ok) {
    return (
      <div className="alerte alerte--erreur">
        <p className="alerte__titre">Les donnees de toumoun sont illisibles</p>
        <p className="mono retour-ligne">{lecture.message}</p>
        <p>
          Lancer <code>npm run donnees:synchroniser</code> dans <code>admin/</code>, puis
          recharger cette page.
        </p>
      </div>
    );
  }

  const thumn = lecture.valeur.thumn;
  const bornes = bornesEstimees(thumn);
  const ruptures = verifierContinuite(thumn);

  const parStatut = {
    verified_hafs: thumn.filter((t) => t.verificationStatus === 'verified_hafs').length,
    verified: thumn.filter((t) => t.verificationStatus === 'verified').length,
    estimated_offset: bornes.length,
  };

  return (
    <>
      <h1 className="titre-page">Tableau de bord Hifdh</h1>
      <p className="sous-titre-page">
        Deux travaux, et deux seulement. Le premier est de relire les bornes de toumoun que
        les donnees ne garantissent pas. Le second est de suivre la progression des
        apprenants. Ni l&apos;un ni l&apos;autre ne modifie les donnees de quelqu&apos;un :
        ce tableau de bord observe, et enregistre ce qu&apos;un relecteur humain declare.
      </p>

      <div className="grille-chiffres">
        <div className="chiffre chiffre--accent">
          <div className="chiffre__valeur">{parStatut.estimated_offset}</div>
          <div className="chiffre__libelle">bornes estimees a relire</div>
        </div>
        <div className="chiffre">
          <div className="chiffre__valeur">{parStatut.verified_hafs}</div>
          <div className="chiffre__libelle">bornes verifiees (Hafs, KFGQPC)</div>
        </div>
        <div className="chiffre">
          <div className="chiffre__valeur">{parStatut.verified}</div>
          <div className="chiffre__libelle">bornes verifiees (mappage direct)</div>
        </div>
        <div className="chiffre">
          <div className="chiffre__valeur">{thumn.length}</div>
          <div className="chiffre__libelle">toumoun au total</div>
        </div>
      </div>

      {ruptures.length > 0 && (
        <div className="alerte alerte--erreur">
          <p className="alerte__titre">
            La chaine des toumoun est rompue en {ruptures.length} endroit
            {ruptures.length > 1 ? 's' : ''}
          </p>
          <p>
            Chaque toumoun doit commencer au verset qui suit la fin du precedent. Une rupture
            rend toute correction locale douteuse : la borne corrigee serait coherente avec
            des voisines fausses. Les donnees de l&apos;application doivent etre revalidees
            avant de relire quoi que ce soit.
          </p>
          <ul className="liste-simple">
            {ruptures.slice(0, 10).map((rupture) => (
              <li key={rupture} className="mono">
                {rupture}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="carte">
        <h2 className="carte__titre">Relecture des bornes de toumoun</h2>
        <p className="texte-petit">
          L&apos;unite relue est une <strong>borne</strong>, pas un intervalle : la fin d&apos;un
          toumoun, c&apos;est-a-dire le point ou le toumoun suivant commence. Pour chaque
          borne, ouvrir un moushaf Hafs imprime (edition Madina, KFGQPC) a la sourate
          indiquee, et regarder si le verset marque comme fin est bien celui-la.
        </p>
        <p className="texte-petit">
          Une borne est <strong>confirmee</strong> ou <strong>corrigee</strong>. Rien
          n&apos;est presente comme authentifie tant qu&apos;un relecteur ne l&apos;a pas
          declare : les {parStatut.estimated_offset} bornes estimees sont issues d&apos;un
          report depuis les donnees Qaloun, et le report peut etre faux de plus ou moins un
          verset.
        </p>
        <p>
          <Link className="bouton bouton--principal" href="/divisions">
            Relire les {parStatut.estimated_offset} bornes estimees
          </Link>
        </p>
      </div>

      <div className="carte">
        <h2 className="carte__titre">Suivi des apprenants</h2>
        <p className="texte-petit">
          Versets memorises, seances faites et en retard, revisions dues, derniere seance,
          objectif choisi. Un administrateur <em>voit</em> ces donnees ; il ne les modifie
          pas. La progression d&apos;un apprenant se corrige dans l&apos;application, par
          l&apos;apprenant.
        </p>
        <p>
          <Link className="bouton" href="/apprenants">
            Ouvrir le suivi
          </Link>
        </p>
      </div>

      <div className="carte">
        <h2 className="carte__titre">Ce que ce tableau de bord n&apos;est pas</h2>
        <ul className="liste-simple texte-petit">
          <li>
            Il ne modifie <strong>aucun</strong> verset, et n&apos;en fabrique aucun. Le texte
            coranique vient de Tanzil, et n&apos;est jamais reecrit ici.
          </li>
          <li>
            Il ne corrige pas la progression d&apos;un apprenant. Les politiques d&apos;acces
            de la base ne l&apos;autorisent pas, et c&apos;est volontaire.
          </li>
          <li>
            Il ne detient <strong>aucun secret</strong>. Ni cle <code>service_role</code>, ni
            mot de passe de base, ni jeton d&apos;API. Ce qui decide de ce qu&apos;un compte
            peut lire est la politique RLS de la base, pas la possession d&apos;une cle.
          </li>
        </ul>
        <hr className="separateur" />
        <p className="texte-tres-petit">
          Statuts des {thumn.length} toumoun : {LIBELLE_STATUT.verified_hafs} ({parStatut.verified_hafs}),{' '}
          {LIBELLE_STATUT.verified} ({parStatut.verified}), {LIBELLE_STATUT.estimated_offset} (
          {parStatut.estimated_offset}).
        </p>
      </div>
    </>
  );
}
