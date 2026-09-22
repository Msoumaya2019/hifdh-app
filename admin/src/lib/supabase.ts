// ============================================================================
// Le client Supabase du tableau de bord.
//
// Construit paresseusement, et jamais avec des valeurs vides : `createClient`
// avec une URL vide ne rend pas un client inerte, il refuse de se construire.
// Le tableau de bord doit pouvoir s'ouvrir, dire ce qui manque et rester
// lisible meme sans configuration — plutot que de tomber sur une page blanche.
//
// Les deux valeurs sont PUBLIQUES. Elles sont deja dans l'application mobile
// livree. Ce qui decide de ce qu'un compte peut lire est la politique RLS de la
// base, pas la possession de cette cle.
// ============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface ConfigurationSupabase {
  url: string;
  cleAnon: string;
}

/**
 * `null` quand la configuration est absente ou incomplete.
 *
 * Le test porte sur la valeur *apres* repli : une variable definie mais vide
 * (`NEXT_PUBLIC_SUPABASE_URL=""`) doit etre traitee comme absente. C'est
 * exactement le piege qui avait masque la variable d'environnement dans
 * `app.json` cote application — `??` ne saute pas la chaine vide.
 */
export function lireConfiguration(): ConfigurationSupabase | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const cleAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (url.trim() === '' || cleAnon.trim() === '') return null;
  return { url: url.trim(), cleAnon: cleAnon.trim() };
}

let client: SupabaseClient | null = null;

/** Le client, ou `null` si la configuration manque. */
export function clientSupabase(): SupabaseClient | null {
  if (client) return client;
  const configuration = lireConfiguration();
  if (!configuration) return null;
  client = createClient(configuration.url, configuration.cleAnon);
  return client;
}

/** Le client, ou une exception si la configuration manque. */
export function clientSupabaseRequis(): SupabaseClient {
  const existant = clientSupabase();
  if (!existant) {
    throw new Error(
      'Configuration Supabase absente : NEXT_PUBLIC_SUPABASE_URL et ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY doivent etre definies. ' +
        'Voir admin/.env.example.'
    );
  }
  return existant;
}
