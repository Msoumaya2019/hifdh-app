import GardeAdministrateur from '@/composants/GardeAdministrateur';
import {
  bornesEstimees,
  limitesDesToumoun,
  grouperParSourate,
  verifierContinuite,
} from '@/lib/bornes.ts';
import { lireDonneesThumn, lireSourates } from '@/lib/thumn.ts';

import donneesBrutes from '@/donnees/thumn_hafs.json';
import empreinteBrute from '@/donnees/EMPREINTE.json';
import souratesBrutes from '@/donnees/surahs.json';

import TableauBornes from './TableauBornes';

/**
 * La relecture des limites estimees.
 *
 * Le travail de lecture se fait ici, sur le serveur, et seules les lignes a
 * relire traversent vers le navigateur — avec les 480 limites, qui sont ce dont le
 * controle de coherence a besoin. Envoyer les 480 enregistrements complets
 * serait trois fois plus lourd pour rien.
 *
 * Leur nombre n'est pas ecrit ici : il baisse a chaque relecture appliquee, et
 * il se lit dans les donnees.
 */
export default function PageDivisions() {
  const lectureThumn = lireDonneesThumn(donneesBrutes);
  const lectureSourates = lireSourates(souratesBrutes);

  if (!lectureThumn.ok || !lectureSourates.ok) {
    const message = !lectureThumn.ok ? lectureThumn.message : (lectureSourates as { message: string }).message;
    return (
      <>
        <h1 className="titre-page">Bornes de toumoun</h1>
        <div className="alerte alerte--erreur">
          <p className="alerte__titre">Les donnees de l&apos;application sont illisibles</p>
          <p className="mono retour-ligne">{message}</p>
          <p>
            Lancer <code>npm run donnees:synchroniser</code> dans <code>admin/</code>, puis
            recharger cette page.
          </p>
        </div>
      </>
    );
  }

  const thumn = lectureThumn.valeur.thumn;
  const sourates = lectureSourates.valeur;

  const bornes = bornesEstimees(thumn);
  const groupes = grouperParSourate(bornes, sourates);
  const limites = limitesDesToumoun(thumn);
  const ruptures = verifierContinuite(thumn);

  const empreinte = (empreinteBrute as { fichiers?: { cle: string; empreinteSource: string }[] })
    .fichiers?.find((f) => f.cle === 'thumn_hafs')?.empreinteSource;

  return (
    <>
      <h1 className="titre-page">Bornes de toumoun a relire</h1>
      <p className="sous-titre-page">
        {bornes.length} bornes ne sont pas garanties par les donnees Hafs. Elles viennent
        d&apos;un report depuis les donnees Qaloun, par decalage cumulatif, et le resultat
        peut etre faux de plus ou moins un verset. Chaque ligne donne la borne de{' '}
        <strong>fin</strong> d&apos;un toumoun — le point ou le toumoun suivant commence.
      </p>

      {ruptures.length > 0 && (
        <div className="alerte alerte--erreur">
          <p className="alerte__titre">
            La chaine des toumoun est rompue en {ruptures.length} endroit
            {ruptures.length > 1 ? 's' : ''}
          </p>
          <p>
            Une borne corrigee serait coherente avec des voisines fausses. Revalider les
            donnees de l&apos;application avant de poursuivre.
          </p>
          <ul className="liste-simple">
            {ruptures.map((rupture) => (
              <li key={rupture} className="mono">
                {rupture}
              </li>
            ))}
          </ul>
        </div>
      )}

      <GardeAdministrateur>
        <TableauBornes
          groupes={groupes}
          limites={limites}
          sourates={sourates}
          empreinteSource={empreinte ?? 'inconnue'}
        />
      </GardeAdministrateur>
    </>
  );
}
