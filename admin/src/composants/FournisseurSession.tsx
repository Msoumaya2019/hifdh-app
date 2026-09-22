'use client';

// ============================================================================
// La session, chargee une seule fois et partagee.
//
// Sans ce partage, l'en-tete et le garde de chaque page appelleraient chacun
// `chargerSession()` : deux requetes reseau au lieu d'une, et deux etats qui
// pourraient diverger — l'en-tete annoncant une session que le garde refuse.
// ============================================================================

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { chargerSession, type EtatSession } from '@/lib/session.ts';
import { clientSupabase } from '@/lib/supabase.ts';

interface ValeurSession {
  etat: EtatSession;
  /** Relire l'etat depuis la base. Appele apres une connexion ou une deconnexion. */
  recharger: () => void;
}

const Contexte = createContext<ValeurSession | null>(null);

export function FournisseurSession({ children }: { children: React.ReactNode }) {
  const [etat, setEtat] = useState<EtatSession>({ etat: 'chargement' });

  const relire = useCallback(async () => {
    const suivant = await chargerSession();
    setEtat(suivant);
  }, []);

  const recharger = useCallback(() => {
    setEtat({ etat: 'chargement' });
    void relire();
  }, [relire]);

  useEffect(() => {
    let vivant = true;

    void (async () => {
      const suivant = await chargerSession();
      if (vivant) setEtat(suivant);
    })();

    // Une session qui expire pendant que l'onglet est ouvert ne se verrait pas
    // autrement : l'ecran continuerait d'afficher des donnees qu'il n'a plus
    // le droit de lire, et le prochain clic echouerait sans explication.
    //
    // Seuls SIGNED_IN et SIGNED_OUT declenchent une relecture. L'evenement
    // INITIAL_SESSION, emis a l'abonnement, provoquerait une seconde lecture
    // immediate — inutile, celle du dessus vient de partir.
    const client = clientSupabase();
    const abonnement = client?.auth.onAuthStateChange((evenement) => {
      if (evenement === 'SIGNED_IN' || evenement === 'SIGNED_OUT') {
        void relire();
      }
    });

    return () => {
      vivant = false;
      abonnement?.data.subscription.unsubscribe();
    };
  }, [relire]);

  return <Contexte.Provider value={{ etat, recharger }}>{children}</Contexte.Provider>;
}

export function useSession(): ValeurSession {
  const valeur = useContext(Contexte);
  if (!valeur) {
    throw new Error(
      'useSession doit etre utilise sous FournisseurSession : ' +
        'voir src/app/layout.tsx.'
    );
  }
  return valeur;
}
