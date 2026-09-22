'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useSession } from '@/composants/FournisseurSession';
import { seConnecter } from '@/lib/session.ts';

export default function PageConnexion() {
  const router = useRouter();
  const { etat, recharger } = useSession();

  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    setEnCours(true);
    setMessage(null);

    const erreur = await seConnecter(email, motDePasse);

    if (erreur) {
      setMessage(erreur);
      setEnCours(false);
      return;
    }

    recharger();
    setEnCours(false);
    router.push('/divisions');
  }

  return (
    <div className="page-connexion">
      <h1 className="titre-page">Connexion</h1>
      <p className="texte-petit">
        Le tableau de bord est reserve aux comptes administrateurs. La connexion se fait avec
        le meme compte que dans l&apos;application Hifdh.
      </p>

      {etat.etat === 'sans_configuration' && (
        <div className="alerte alerte--erreur">
          <p className="alerte__titre">Le tableau de bord n&apos;est pas configure</p>
          <p>
            Definir <code>NEXT_PUBLIC_SUPABASE_URL</code> et{' '}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> dans <code>admin/.env.local</code>.
            Voir <code>admin/.env.example</code>.
          </p>
        </div>
      )}

      <div className="carte">
        <form onSubmit={soumettre}>
          <label className="champ-libelle" htmlFor="email">
            Adresse de courriel
          </label>
          <input
            id="email"
            className="champ"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(evenement) => setEmail(evenement.target.value)}
          />

          <label className="champ-libelle" htmlFor="motdepasse">
            Mot de passe
          </label>
          <input
            id="motdepasse"
            className="champ"
            type="password"
            autoComplete="current-password"
            required
            value={motDePasse}
            onChange={(evenement) => setMotDePasse(evenement.target.value)}
          />

          <button type="submit" className="bouton bouton--principal" disabled={enCours}>
            {enCours ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        {message && (
          <div className="alerte alerte--erreur champ-message">
            <p>{message}</p>
          </div>
        )}
      </div>

      <p className="texte-tres-petit" style={{ marginTop: 20 }}>
        Un compte qui n&apos;est pas administrateur peut se connecter ici : il sera recu par un
        message qui le dit, et qui indique la commande a passer pour lui donner le role. Le
        mot de passe n&apos;est jamais conserve par cette page.
      </p>
    </div>
  );
}
