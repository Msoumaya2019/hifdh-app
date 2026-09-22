'use client';

// ============================================================================
// L'en-tete, la navigation, et le pied de page.
//
// La navigation n'affiche que deux entrees — les deux pages que la
// specification demande. Elles sont visibles meme sans session : les masquer
// obligerait a deviner ce que contient le tableau de bord, et l'ecran de refus
// qui suit dit precisement ce qui manque.
// ============================================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { seDeconnecter } from '@/lib/session.ts';

import { useSession } from './FournisseurSession';

const ENTREES = [
  { chemin: '/divisions', libelle: 'Bornes de toumoun' },
  { chemin: '/apprenants', libelle: 'Apprenants' },
];

export default function Coquille({ children }: { children: React.ReactNode }) {
  const chemin = usePathname();
  const { etat, recharger } = useSession();

  const connecte = etat.etat === 'connecte' || etat.etat === 'sans_droit';

  return (
    <>
      <header className="entete">
        <div className="entete__interieur">
          <Link href="/" className="entete__marque">
            Hifdh <span>· administration</span>
          </Link>

          <nav className="entete__nav">
            {ENTREES.map((entree) => (
              <Link
                key={entree.chemin}
                href={entree.chemin}
                className={
                  chemin === entree.chemin || chemin.startsWith(`${entree.chemin}/`)
                    ? 'entete__lien entete__lien--actif'
                    : 'entete__lien'
                }
              >
                {entree.libelle}
              </Link>
            ))}
          </nav>

          <div className="entete__session">
            {connecte ? (
              <>
                <span title={etat.email ?? undefined}>
                  {etat.email ?? 'compte sans adresse'}
                  {etat.etat === 'sans_droit' && ' · apprenant'}
                </span>
                <button
                  type="button"
                  className="bouton bouton--discret"
                  style={{ color: 'rgba(255,255,255,0.85)' }}
                  onClick={() => {
                    void seDeconnecter().then(recharger);
                  }}
                >
                  Se deconnecter
                </button>
              </>
            ) : (
              <Link href="/connexion" className="entete__lien">
                Se connecter
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="contenu">{children}</main>
    </>
  );
}
