'use client';

// ============================================================================
// La porte des pages d'administration.
//
// Six etats, et une distinction qui decide de tout :
//
//   « sans_droit »              — la base a repondu, et ce compte n'est pas
//                                 administrateur ;
//   « verification_impossible » — la base n'a pas repondu.
//
// Les confondre serait la faute la plus couteuse de cet ecran : un
// administrateur dont la connexion hoquette lirait « vous n'avez pas les
// droits » et chercherait un probleme de compte la ou il y a un probleme de
// reseau. Le doute doit porter sur l'outil, pas sur la personne.
//
// Cette porte n'est pas la securite. La securite est dans la politique RLS de
// la base : un visiteur qui forcerait ce composant a afficher son contenu
// obtiendrait des requetes vides, parce que la base ne lui rend rien. Le
// garde sert a expliquer, pas a proteger.
// ============================================================================

import Link from 'next/link';

import { useSession } from './FournisseurSession';

export default function GardeAdministrateur({ children }: { children: React.ReactNode }) {
  const { etat, recharger } = useSession();

  if (etat.etat === 'chargement') {
    return <p className="chargement">Verification de la session…</p>;
  }

  if (etat.etat === 'sans_configuration') {
    return (
      <div className="alerte alerte--erreur">
        <p className="alerte__titre">Le tableau de bord n&apos;est pas configure</p>
        <p>
          Les variables <code>NEXT_PUBLIC_SUPABASE_URL</code> et{' '}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> ne sont pas definies.
        </p>
        <p>
          Copiez <code>admin/.env.example</code> en <code>admin/.env.local</code>, remplissez
          les deux valeurs depuis Supabase (Project Settings &gt; API), puis relancez
          l&apos;application. Ces deux valeurs sont publiques : aucune cle privee n&apos;a sa
          place ici.
        </p>
      </div>
    );
  }

  if (etat.etat === 'anonyme') {
    return (
      <div className="alerte alerte--info">
        <p className="alerte__titre">Vous n&apos;etes pas connecte</p>
        <p>
          Le tableau de bord s&apos;adresse aux administrateurs de la FCPE. Connectez-vous
          avec un compte Hifdh.
        </p>
        <p>
          <Link href="/connexion">Aller a la connexion</Link>
        </p>
      </div>
    );
  }

  if (etat.etat === 'sans_droit') {
    return (
      <div className="alerte alerte--avertissement">
        <p className="alerte__titre">
          Ce compte est un compte apprenant, pas un compte administrateur
        </p>
        <p>
          La base a repondu : elle connait <strong>{etat.email ?? 'ce compte'}</strong>, et
          son role est <strong>apprenant</strong>. Il n&apos;a donc rien a voir ici — ni les
          donnees des autres apprenants, ni la relecture des bornes de toumoun.
        </p>
        <p>
          Pour donner ce role a un compte, la commande se fait une fois, dans l&apos;editeur
          SQL Supabase — elle est ecrite a la fin de <code>supabase/administration.sql</code>.
          Elle ne peut pas se faire depuis cette page : la politique d&apos;acces interdit a un
          apprenant de s&apos;elever lui-meme, et c&apos;est voulu.
        </p>
      </div>
    );
  }

  if (etat.etat === 'verification_impossible') {
    return (
      <div className="alerte alerte--erreur">
        <p className="alerte__titre">
          Impossible de verifier votre acces — ce n&apos;est pas un refus
        </p>
        <p>
          La base n&apos;a pas repondu, ou pas lisiblement. <strong>Votre compte n&apos;est
          pas en cause</strong>, et rien ne dit que vous n&apos;avez pas les droits : on ne
          sait simplement pas.
        </p>
        <p className="mono retour-ligne">{etat.message}</p>
        <p>
          <button type="button" className="bouton bouton--principal" onClick={recharger}>
            Reessayer
          </button>
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
