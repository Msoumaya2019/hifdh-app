'use client';

// ============================================================================
// Le tableau du suivi.
//
// Une regle, la meme que pour les bornes : UNE LECTURE MANQUEE SE DIT. Si la
// fonction de synthese ne repond pas, l'ecran affiche l'erreur — jamais une
// liste vide. Une liste vide se lirait « aucun apprenant », ce qui serait faux,
// et l'enseignant croirait que personne ne s'est inscrit.
//
// Trois etats sont donc distincts, et l'ecran les distingue :
//   - la lecture a echoue       -> l'erreur, avec sa cause ;
//   - la lecture a reussi, vide -> « aucun compte », ce qui est une information ;
//   - la lecture a reussi       -> le tableau.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';

import {
  afficherNombre,
  direDerniereSeance,
  objectifLisible,
  synthetiser,
  type ResumeApprenant,
} from '@/lib/apprenants.ts';
import { dateDuJour, formaterDate, formaterHorodatage } from '@/lib/dates.ts';
import { clientSupabase } from '@/lib/supabase.ts';

type EtatLecture =
  | { etat: 'chargement' }
  | { etat: 'pret'; apprenants: ResumeApprenant[]; aujourdHui: string }
  | { etat: 'erreur'; message: string; aujourdHui: string };

export default function SuiviApprenants() {
  const [lecture, setLecture] = useState<EtatLecture>({ etat: 'chargement' });

  const charger = useCallback(async () => {
    // La date est calculee en heure locale et passee a la base : le calcul de
    // retard doit etre le meme ici et dans le banc d'essai, et une fonction qui
    // lirait l'horloge du serveur ne s'eprouverait pas.
    const aujourdHui = dateDuJour();
    setLecture({ etat: 'chargement' });

    const client = clientSupabase();
    if (!client) {
      setLecture({
        etat: 'erreur',
        message: 'Configuration Supabase absente : le suivi ne peut pas etre lu.',
        aujourdHui,
      });
      return;
    }

    const { data, error } = await client.rpc('resume_apprenants', {
      p_aujourdhui: aujourdHui,
    });

    if (error) {
      setLecture({
        etat: 'erreur',
        message:
          `${error.message}` +
          (error.hint ? ` — ${error.hint}` : '') +
          ` (code ${error.code ?? 'inconnu'})`,
        aujourdHui,
      });
      return;
    }

    setLecture({
      etat: 'pret',
      apprenants: (data ?? []) as ResumeApprenant[],
      aujourdHui,
    });
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  if (lecture.etat === 'chargement') {
    return <p className="chargement">Lecture du suivi…</p>;
  }

  if (lecture.etat === 'erreur') {
    return (
      <div className="alerte alerte--erreur">
        <p className="alerte__titre">Le suivi n&apos;a pas pu etre lu</p>
        <p>
          Ce n&apos;est <strong>pas</strong> la meme chose que « aucun apprenant ». Tant que
          cette lecture echoue, cet ecran ne sait rien — et une liste vide affichee ici
          laisserait croire que personne ne s&apos;est inscrit.
        </p>
        <p className="mono retour-ligne">{lecture.message}</p>
        <p>
          La fonction <code>public.resume_apprenants</code> existe-t-elle, et le droit
          d&apos;execution lui a-t-il ete donne ? Les deux se trouvent dans{' '}
          <code>supabase/administration.sql</code>, a executer dans l&apos;editeur SQL
          Supabase. Le droit d&apos;execution est le premier endroit a regarder devant un
          refus : sans lui, la requete echoue avant meme d&apos;atteindre une politique.
        </p>
        <p>
          <button type="button" className="bouton bouton--principal" onClick={() => void charger()}>
            Reessayer
          </button>
        </p>
      </div>
    );
  }

  // Calcule apres les sorties anticipees : ici, `lecture` est forcement
  // « pret », et le compilateur le sait. Un `useMemo` place plus haut aurait dû
  // traiter le cas `null`, pour un calcul qui est un simple parcours de liste.
  const synthese = synthetiser(lecture.apprenants);

  if (lecture.apprenants.length === 0) {
    return (
      <>
        <div className="etat-vide">
          <div className="etat-vide__titre">Aucun compte</div>
          <p>
            La base a repondu : elle ne contient aucun profil. Cela arrive tant que personne
            ne s&apos;est inscrit depuis l&apos;application.
          </p>
        </div>
        <p className="texte-tres-petit" style={{ marginTop: 12 }}>
          <button type="button" className="bouton" onClick={() => void charger()}>
            Recharger
          </button>
        </p>
      </>
    );
  }

  return (
    <>
      <div className="grille-chiffres">
        <div className="chiffre">
          <div className="chiffre__valeur">{synthese.comptes}</div>
          <div className="chiffre__libelle">comptes</div>
        </div>
        <div className="chiffre">
          <div className="chiffre__valeur">{synthese.administrateurs}</div>
          <div className="chiffre__libelle">administrateurs</div>
        </div>
        <div className="chiffre chiffre--accent">
          <div className="chiffre__valeur">{synthese.avecRetard}</div>
          <div className="chiffre__libelle">avec des seances en retard</div>
        </div>
        <div className="chiffre">
          <div className="chiffre__valeur">{synthese.avecRevisionsDues}</div>
          <div className="chiffre__libelle">avec des revisions dues</div>
        </div>
        <div className="chiffre">
          <div className="chiffre__valeur">{synthese.sansSeance}</div>
          <div className="chiffre__libelle">sans seance terminee</div>
        </div>
      </div>

      <div className="barre-outils">
        <span className="texte-petit">
          Situation au {formaterDate(lecture.aujourdHui)}. Les compteurs sont calcules par la
          base, pas par cet ecran.
        </span>
        <div className="barre-outils__espace" />
        <button type="button" className="bouton" onClick={() => void charger()}>
          Recharger
        </button>
      </div>

      <div className="tableau-enveloppe">
        <table className="tableau">
          <thead>
            <tr>
              <th>Apprenant</th>
              <th>Role</th>
              <th>Objectif</th>
              <th className="colonne-etroite">Versets</th>
              <th className="colonne-etroite">Passages</th>
              <th className="colonne-etroite">Seances faites</th>
              <th className="colonne-etroite">En retard</th>
              <th className="colonne-etroite">Revisions dues</th>
              <th>Derniere seance</th>
              <th>Inscrit le</th>
            </tr>
          </thead>
          <tbody>
            {lecture.apprenants.map((apprenant) => {
              const objectif = objectifLisible(apprenant.objectif);
              const derniere = direDerniereSeance(
                apprenant.derniere_seance,
                lecture.aujourdHui
              );
              const retard = Number(afficherNombre(apprenant.seances_retard));

              return (
                <tr key={apprenant.user_id}>
                  <td>
                    {apprenant.nom ?? <span className="texte-tres-petit">sans nom</span>}
                    <div className="texte-tres-petit mono">{apprenant.user_id.slice(0, 8)}…</div>
                  </td>
                  <td>
                    {apprenant.role === 'administrateur' ? (
                      <span className="badge badge--or">administrateur</span>
                    ) : (
                      <span className="badge badge--neutre">apprenant</span>
                    )}
                  </td>
                  <td>
                    {objectif ? (
                      objectif.traduit ? (
                        objectif.texte
                      ) : (
                        <span title="Code non reconnu par le tableau de bord">
                          <span className="badge badge--ecart">?</span>{' '}
                          <span className="mono">{objectif.texte}</span>
                        </span>
                      )
                    ) : (
                      <span className="texte-tres-petit">non renseigne</span>
                    )}
                  </td>
                  <td className="colonne-nombre">{afficherNombre(apprenant.versets_memorises)}</td>
                  <td className="colonne-nombre">
                    {afficherNombre(apprenant.passages_memorises)}
                  </td>
                  <td className="colonne-nombre">
                    {afficherNombre(apprenant.seances_terminees)} /{' '}
                    {afficherNombre(apprenant.seances_total)}
                  </td>
                  <td className="colonne-nombre">
                    {retard > 0 ? (
                      <span className="badge badge--estimee">
                        {afficherNombre(apprenant.seances_retard)}
                      </span>
                    ) : (
                      afficherNombre(apprenant.seances_retard)
                    )}
                  </td>
                  <td className="colonne-nombre">
                    {afficherNombre(apprenant.revisions_dues)}
                  </td>
                  <td>
                    {derniere ?? (
                      <span className="texte-tres-petit">aucune seance terminee</span>
                    )}
                  </td>
                  <td className="texte-petit">
                    {formaterHorodatage(apprenant.inscrit_le) ?? (
                      <span className="texte-tres-petit">date inconnue</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="texte-tres-petit" style={{ marginTop: 12 }}>
        Un tiret (—) signale une valeur que la base n&apos;a pas rendue : ce n&apos;est pas
        zero. Un apprenant sans seance terminee n&apos;est pas « en retard de 0 jour », il
        n&apos;a pas encore commence — les deux se lisent differemment ici.
      </p>
    </>
  );
}
