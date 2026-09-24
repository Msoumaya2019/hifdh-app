// Ce que Deno fournit et que `tsc` ignore — et rien de plus.
//
// La fonction d'envoi est du code Deno : elle lit `Deno.env` et `Deno.serve`,
// et elle importe `npm:@supabase/supabase-js@2`, un spécificateur que seul Deno
// sait résoudre. Sans ces déclarations, `tsc` refuse le fichier ; l'exclure
// serait pire, car c'est le SEUL contrôle mécanique que ce fichier ait — rien ne
// l'exécute, `ci.yml` n'ayant pas de Deno.
//
// CE QUE CE FICHIER NE FAIT PAS
// -----------------------------
// Il ne reproduit pas l'API Deno, et il ne décrit le client Supabase que par ce
// que la fonction emploie. Les constructeurs de requête rendent `any` à dessein :
// le contrôle de types porte donc sur le code de la FONCTION — ses variables,
// ses tableaux, ses retours — et NON sur la justesse des appels à Supabase.
//
// Un `tsc` vert ici ne dit pas que ces appels sont corrects. Il dit que la
// fonction se tient. La différence compte, et elle est la même que celle qui
// sépare « les invariants sont présents dans la source » de « le code fait ce
// qu'il annonce ».

declare namespace Deno {
  namespace env {
    function get(cle: string): string | undefined;
  }

  function serve(
    gestionnaire: (requete: Request) => Response | Promise<Response>
  ): void;
}

declare module 'npm:@supabase/supabase-js@2' {
  /** Une réponse d'appel, telle que la fonction la déstructure. */
  export interface Reponse<T> {
    data: T;
    error: { message: string } | null;
  }

  /**
   * Le constructeur de requête, réduit à ce qui est enchaîné par la fonction :
   * `select`, `update` ou `delete`, puis `in`.
   */
  export interface Constructeur {
    select(colonnes?: string): Constructeur;
    update(valeurs: Record<string, unknown>): Constructeur;
    delete(): Constructeur;
    in(colonne: string, valeurs: readonly unknown[]): Promise<Reponse<any>>;
  }

  export interface Client {
    rpc(nom: string, parametres?: Record<string, unknown>): Promise<Reponse<any>>;
    from(table: string): Constructeur;
  }

  export function createClient(
    url: string,
    cle: string,
    options?: Record<string, unknown>
  ): Client;
}
