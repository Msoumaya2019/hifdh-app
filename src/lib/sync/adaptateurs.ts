// Adaptateurs : les deux interfaces de la sauvegarde, reliées au concret.
//
// Ce fichier est la seule couture entre la logique de synchronisation — pure et
// éprouvée — et le monde extérieur : SQLite d'un côté, Supabase de l'autre. Il
// est volontairement mince : toute la décision vit dans `synchronisation.ts`.

import type { UserConfig } from '@/types';
import * as db from '@/lib/database';
import type { ClientSupabase } from '@/lib/supabase';

import { depuisLignes, versLignes } from './mapping';
import type { DepotDistant, DepotLocal } from './synchronisation';

/** L'appareil, via SQLite. */
export function creerDepotLocal(): DepotLocal {
  return {
    estVide: () => db.estBaseVide(),
    lire: () => db.lireTout(),
    ecrire: (snapshot) =>
      db.remplacerTout({
        config: snapshot.config,
        memorized: snapshot.memorized,
        sessions: snapshot.sessions,
        reviews: snapshot.reviews,
      }),
  };
}

/** Le cloud, via Supabase. */
export function creerDepotDistant(client: ClientSupabase, utilisateurId: string): DepotDistant {
  async function lireTable(table: string): Promise<Record<string, unknown>[]> {
    const { data, error } = await client.from(table).select('*').eq('user_id', utilisateurId);
    if (error !== null) {
      throw new Error(`Lecture de « ${table} » refusée : ${error.message}`);
    }
    return data ?? [];
  }

  return {
    async lire(): Promise<unknown | null> {
      const [config, memorized, sessions, reviews] = await Promise.all([
        lireTable('user_config'),
        lireTable('memorized_passages'),
        lireTable('learning_sessions'),
        lireTable('review_items'),
      ]);

      // Aucune ligne nulle part : le compte n'a jamais été sauvegardé. On rend
      // `null` — « pas de sauvegarde » — et non un instantané vide, que la
      // restauration refuserait de toute façon.
      const total = config.length + memorized.length + sessions.length + reviews.length;
      if (total === 0) return null;

      return depuisLignes({
        config: (config[0]?.config_json as UserConfig | undefined) ?? null,
        memorized,
        sessions,
        reviews,
      });
    },

    async ecrire(snapshot): Promise<void> {
      const lignes = versLignes(snapshot);

      // Un seul appel : la fonction distante remplace tout dans une
      // transaction. Faire les suppressions puis les insertions depuis ici
      // laisserait, en cas d'interruption, un compte vidé de sa progression.
      const { error } = await client.rpc('remplacer_donnees', {
        p_user_id: utilisateurId,
        p_config: lignes.config,
        p_memorized: lignes.memorized,
        p_sessions: lignes.sessions,
        p_reviews: lignes.reviews,
      });

      if (error !== null) {
        throw new Error(`Sauvegarde refusée : ${error.message}`);
      }
    },
  };
}
