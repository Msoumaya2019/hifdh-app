// Client Supabase — authentification et synchronisation.
//
// Configuration : les clés sont lues depuis `app.json` (extra) ou depuis
// `.env` en développement. Seule la clé **anon** est utilisée ici : elle est
// destinée à être publique, et les données sont protégées par les politiques
// RLS du schéma. La clé `service_role` ne doit jamais approcher l'application.
//
// Le client est créé À LA DEMANDE, et non à l'import. `createClient('', '')`
// lève « supabaseUrl is required » : un client construit au chargement du
// module ferait planter l'écran entier tant que Supabase n'est pas configuré —
// c'est-à-dire par défaut, avant que le projet distant n'existe. L'import
// n'échoue donc jamais ; c'est l'appel qui rend `null` et l'interface qui
// explique quoi faire.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { creerStockageMorceaux, type DepotCles } from './stockageSecurise';

const supabaseUrl: string =
  Constants.expoConfig?.extra?.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

const supabaseAnonKey: string =
  Constants.expoConfig?.extra?.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Vrai si les deux clés sont renseignées. */
export function isSupabaseConfigured(): boolean {
  return supabaseUrl.trim() !== '' && supabaseAnonKey.trim() !== '';
}

/**
 * Le dépôt de clés du système.
 *
 * Sur iOS et Android, `expo-secure-store` (trousseau, ou stockage chiffré sur
 * Android). Sur le web, il n'existe pas : on retombe sur le stockage local, qui
 * n'est pas chiffré — c'est une limite de la plateforme, pas un choix. Le web
 * n'est pas une cible de l'application ; ce repli évite surtout un plantage.
 */
function depotDuSysteme(): DepotCles {
  if (Platform.OS === 'web') {
    return {
      getItem: (cle) => AsyncStorage.getItem(cle),
      setItem: (cle, valeur) => AsyncStorage.setItem(cle, valeur),
      removeItem: (cle) => AsyncStorage.removeItem(cle),
    };
  }
  return {
    getItem: (cle) => SecureStore.getItemAsync(cle),
    setItem: (cle, valeur) => SecureStore.setItemAsync(cle, valeur),
    removeItem: (cle) => SecureStore.deleteItemAsync(cle),
  };
}

let client: SupabaseClient | null = null;

/**
 * Le client Supabase, ou `null` s'il n'est pas configuré.
 *
 * Rendre `null` plutôt que lever : l'application reste utilisable hors ligne,
 * ce qui est son mode normal. La sauvegarde est un supplément, pas une
 * condition d'usage.
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;

  if (client === null) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // Les jetons sont découpés : une session dépasse le plafond de 2048
        // octets de `expo-secure-store`, et le dépassement est silencieux.
        storage: creerStockageMorceaux(depotDuSysteme()),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }

  return client;
}

// === Le client, vu par la couche de données ===

export interface ReponseLignes {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
}

/**
 * Les deux appels dont la sauvegarde a besoin, et rien de plus.
 *
 * Cette vue étroite sert aussi de contournement assumé : les génériques du
 * client Supabase sont si profonds que TypeScript abandonne la vérification
 * (« Type instantiation is excessively deep and possibly infinite »). On pose
 * donc la conversion à un seul endroit, ici, plutôt que de la laisser se
 * répandre dans les appelants.
 */
export interface ClientSupabase {
  from(table: string): {
    select(colonnes: string): {
      eq(colonne: string, valeur: string): PromiseLike<ReponseLignes>;
    };
  };
  rpc(
    fonction: string,
    parametres: Record<string, unknown>
  ): PromiseLike<{ error: { message: string } | null }>;
}

/** Le client, réduit à ce que la couche de données utilise. */
export function getClientDonnees(): ClientSupabase | null {
  const instance = getSupabase();
  if (instance === null) return null;
  return instance as unknown as ClientSupabase;
}
