'use client';

// ============================================================================
// La table de relecture.
//
// Deux regles gouvernent cet ecran.
//
// 1. UNE LECTURE MANQUEE SE DIT. Si la base ne rend pas les verifications deja
//    enregistrees, l'ecran affiche une erreur — jamais une table vide. Une
//    table vide dirait « personne n'a encore rien relu », ce qui serait faux,
//    et un relecteur recommencerait un travail deja fait.
//
// 2. UNE ESTIMATION N'EST PAS UNE AUTHENTIFICATION. Tant qu'une borne n'a pas
//    ete relue, elle s'affiche comme estimee, avec la reference dont elle a ete
//    tiree. Une borne corrigee est presentee comme corrrigee *ici* — et l'ecran
//    rappelle que les donnees de l'application ne changeront qu'apres
//    application du fichier exporte. Un tableau de bord qui laisserait croire
//    que le clic a change l'application mentirait.
// ============================================================================

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';

import { useSession } from '@/composants/FournisseurSession';
import { formaterBorne, type BorneEstimee, type LimiteToumoun, type GroupeSourate } from '@/lib/bornes.ts';
import {
  construireFichierCorrections,
  resumerVerifications,
  texteFichierCorrections,
  validerSaisie,
  type LigneVerification,
  type Statut,
} from '@/lib/corrections.ts';
import { clientSupabase } from '@/lib/supabase.ts';
import type { Sourate } from '@/lib/thumn.ts';

/** Une ligne de `public.division_verifications`, telle que la base la rend. */
interface LigneBase {
  thumn_number: number;
  statut: Statut;
  limite_surah: number | null;
  limite_ayah: number | null;
  note: string | null;
  verifie_le: string | null;
}

type EtatLecture =
  | { etat: 'chargement' }
  | { etat: 'pret'; lignes: LigneVerification[] }
  | { etat: 'erreur'; message: string };

type Filtre = 'a_relire' | 'relues' | 'toutes';

interface Props {
  groupes: GroupeSourate[];
  limites: LimiteToumoun[];
  sourates: Sourate[];
  empreinteSource: string;
}

export default function TableauBornes({ groupes, limites, sourates, empreinteSource }: Props) {
  const { etat: session } = useSession();
  const userId = session.etat === 'connecte' ? session.userId : null;

  const [lecture, setLecture] = useState<EtatLecture>({ etat: 'chargement' });
  const [filtre, setFiltre] = useState<Filtre>('a_relire');
  const [correctionOuverte, setCorrectionOuverte] = useState<number | null>(null);
  const [saisieSurah, setSaisieSurah] = useState('');
  const [saisieAyah, setSaisieAyah] = useState('');
  const [saisieNote, setSaisieNote] = useState('');
  const [message, setMessage] = useState<{ type: 'erreur' | 'succes'; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  const bornes = useMemo(() => groupes.flatMap((g) => g.bornes), [groupes]);
  const parNumero = useMemo(() => new Map(bornes.map((b) => [b.thumnNumber, b])), [bornes]);

  // -------------------------------------------------------------------------
  // Lecture
  // -------------------------------------------------------------------------

  const charger = useCallback(async () => {
    setLecture({ etat: 'chargement' });

    const client = clientSupabase();
    if (!client) {
      setLecture({
        etat: 'erreur',
        message: 'Configuration Supabase absente : les relectures ne peuvent pas etre lues.',
      });
      return;
    }

    const { data, error } = await client
      .from('division_verifications')
      .select('thumn_number,statut,limite_surah,limite_ayah,note,verifie_le')
      .order('thumn_number');

    if (error) {
      setLecture({
        etat: 'erreur',
        message:
          `${error.message}` +
          (error.hint ? ` — ${error.hint}` : '') +
          ` (code ${error.code ?? 'inconnu'})`,
      });
      return;
    }

    setLecture({
      etat: 'pret',
      lignes: (data ?? []).map((ligne) => {
        const l = ligne as LigneBase;
        return {
          thumnNumber: l.thumn_number,
          statut: l.statut,
          limiteSurah: l.limite_surah,
          limiteAyah: l.limite_ayah,
          note: l.note,
          verifieLe: l.verifie_le,
        };
      }),
    });
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const lignes = lecture.etat === 'pret' ? lecture.lignes : [];
  const parNumeroVerifie = useMemo(
    () => new Map(lignes.map((l) => [l.thumnNumber, l])),
    [lignes]
  );

  const resume = useMemo(
    () => resumerVerifications(bornes, lignes),
    [bornes, lignes]
  );

  // -------------------------------------------------------------------------
  // Ecriture
  // -------------------------------------------------------------------------

  async function enregistrer(
    thumnNumber: number,
    statut: Statut,
    limiteSurah: number | null,
    limiteAyah: number | null,
    note: string | null
  ) {
    const client = clientSupabase();
    if (!client) {
      setMessage({ type: 'erreur', texte: 'Configuration Supabase absente.' });
      return;
    }

    setEnCours(true);
    setMessage(null);

    const { error } = await client.from('division_verifications').upsert(
      {
        thumn_number: thumnNumber,
        statut,
        limite_surah: limiteSurah,
        limite_ayah: limiteAyah,
        note,
        verifie_par: userId,
        // Un horodatage complet, avec son fuseau : `toISOString` est ici a sa
        // place. Le piege connu vise les dates *calendaires*, qu'il decale d'un
        // jour ; un instant, lui, n'est jamais decale.
        verifie_le: new Date().toISOString(),
      },
      { onConflict: 'thumn_number' }
    );

    setEnCours(false);

    if (error) {
      setMessage({
        type: 'erreur',
        texte:
          `L'enregistrement a echoue : ${error.message}` +
          (error.hint ? ` — ${error.hint}` : '') +
          ` (code ${error.code ?? 'inconnu'})`,
      });
      return;
    }

    await charger();
    setCorrectionOuverte(null);
    setMessage({
      type: 'succes',
      texte: `Toumoun ${thumnNumber} : ${statut === 'confirmee' ? 'confirme' : 'corrige'}.`,
    });
  }

  async function retirer(thumnNumber: number) {
    const client = clientSupabase();
    if (!client) return;

    setEnCours(true);
    setMessage(null);

    const { error } = await client
      .from('division_verifications')
      .delete()
      .eq('thumn_number', thumnNumber);

    setEnCours(false);

    if (error) {
      setMessage({ type: 'erreur', texte: `Le retrait a echoue : ${error.message}` });
      return;
    }

    await charger();
    setMessage({ type: 'succes', texte: `Toumoun ${thumnNumber} : relecture retiree.` });
  }

  function ouvrirCorrection(borne: BorneEstimee, ligne: LigneVerification | undefined) {
    setMessage(null);
    setCorrectionOuverte(borne.thumnNumber);
    const depart =
      ligne?.statut === 'corrigee' && ligne.limiteSurah !== null && ligne.limiteAyah !== null
        ? { surah: ligne.limiteSurah, ayah: ligne.limiteAyah }
        : borne.limiteEstimee;
    setSaisieSurah(String(depart.surah));
    setSaisieAyah(String(depart.ayah));
    setSaisieNote(ligne?.note ?? '');
  }

  function validerCorrection(borne: BorneEstimee) {
    const resultat = validerSaisie(limites, sourates, borne.thumnNumber, saisieSurah, saisieAyah);
    if (!resultat.ok) {
      setMessage({ type: 'erreur', texte: resultat.message });
      return;
    }
    void enregistrer(
      borne.thumnNumber,
      'corrigee',
      resultat.surah,
      resultat.ayah,
      saisieNote.trim() === '' ? null : saisieNote.trim()
    );
  }

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

  function exporter() {
    try {
      const fichier = construireFichierCorrections(lignes, {
        genereLe: new Date().toISOString(),
        sourceEmpreinte: empreinteSource,
      });
      const texte = texteFichierCorrections(fichier);

      const url = URL.createObjectURL(new Blob([texte], { type: 'application/json' }));
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = 'corrections_toumoun.json';
      document.body.appendChild(lien);
      lien.click();
      document.body.removeChild(lien);
      URL.revokeObjectURL(url);

      setMessage({
        type: 'succes',
        texte:
          `Fichier exporte : ${fichier.total} relecture(s). Le deposer dans le depot de ` +
          'l\'application, puis lancer « python data/quran/appliquer_corrections.py ' +
          'corrections_toumoun.json ».',
      });
    } catch (erreur) {
      setMessage({
        type: 'erreur',
        texte: `L'export a refuse d'ecrire : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------

  if (lecture.etat === 'chargement') {
    return <p className="chargement">Lecture des relectures deja enregistrees…</p>;
  }

  if (lecture.etat === 'erreur') {
    return (
      <>
        <div className="alerte alerte--erreur">
          <p className="alerte__titre">
            Les relectures deja enregistrees n&apos;ont pas pu etre lues
          </p>
          <p>
            Ce n&apos;est <strong>pas</strong> la meme chose que « aucune relecture ». Tant
            que cette lecture echoue, cet ecran ne peut pas dire ce qui a deja ete relu — et
            relire une borne deja relue ferait perdre le travail.
          </p>
          <p className="mono retour-ligne">{lecture.message}</p>
          <p>
            La table <code>division_verifications</code> existe-t-elle ? Le fichier{' '}
            <code>supabase/administration.sql</code> a-t-il ete execute dans l&apos;editeur
            SQL Supabase ?
          </p>
          <p>
            <button type="button" className="bouton bouton--principal" onClick={() => void charger()}>
              Reessayer
            </button>
          </p>
        </div>

        <p className="texte-petit">
          En attendant, la liste des bornes reste consultable ci-dessous — mais aucune
          relecture ne peut y etre enregistree.
        </p>
        <ListeSeule groupes={groupes} />
      </>
    );
  }

  const restantes = bornes.filter((b) => !parNumeroVerifie.has(b.thumnNumber)).length;

  return (
    <>
      <div className="grille-chiffres">
        <div className="chiffre">
          <div className="chiffre__valeur">{resume.total}</div>
          <div className="chiffre__libelle">bornes estimees</div>
        </div>
        <div className="chiffre">
          <div className="chiffre__valeur">{resume.confirmees}</div>
          <div className="chiffre__libelle">confirmees</div>
        </div>
        <div className="chiffre">
          <div className="chiffre__valeur">{resume.corrigees}</div>
          <div className="chiffre__libelle">corrigees</div>
        </div>
        <div className="chiffre chiffre--accent">
          <div className="chiffre__valeur">{resume.restantes}</div>
          <div className="chiffre__libelle">restantes</div>
        </div>
      </div>

      <div className="barre-outils">
        <label className="champ-libelle" style={{ marginBottom: 0 }} htmlFor="filtre">
          Afficher
        </label>
        <select
          id="filtre"
          className="champ"
          value={filtre}
          onChange={(evenement) => setFiltre(evenement.target.value as Filtre)}
        >
          <option value="a_relire">A relire ({restantes})</option>
          <option value="relues">Relues ({resume.confirmees + resume.corrigees})</option>
          <option value="toutes">Toutes ({resume.total})</option>
        </select>

        <div className="barre-outils__espace" />

        <button
          type="button"
          className="bouton bouton--principal"
          onClick={exporter}
          disabled={lignes.length === 0}
          title={
            lignes.length === 0
              ? 'Aucune relecture a exporter pour l\'instant.'
              : undefined
          }
        >
          Exporter les {lignes.length} relecture{lignes.length > 1 ? 's' : ''}
        </button>
      </div>

      {message && (
        <div className={`alerte alerte--${message.type === 'erreur' ? 'erreur' : 'succes'}`}>
          <p className="retour-ligne">{message.texte}</p>
        </div>
      )}

      {lignes.length > 0 && (
        <div className="alerte alerte--info">
          <p>
            Les relectures sont enregistrees dans la base. Elles ne modifient{' '}
            <strong>pas</strong> les donnees de l&apos;application tant que le fichier
            exporte n&apos;a pas ete applique par{' '}
            <code>data/quran/appliquer_corrections.py</code> — et ce script recalcule les
            bornes voisines avant d&apos;ecrire. Les corrections restent donc inertes jusqu&apos;a
            la prochaine version de l&apos;application : c&apos;est voulu.
          </p>
        </div>
      )}

      <div className="tableau-enveloppe">
        <table className="tableau">
          <thead>
            <tr>
              <th className="colonne-etroite">Toumoun</th>
              <th className="colonne-etroite">Hizb</th>
              <th className="colonne-etroite">Rub&apos;</th>
              <th>Limite estimee</th>
              <th>Reference Qaloun</th>
              <th>Etat</th>
              <th className="colonne-etroite">Action</th>
            </tr>
          </thead>

          {groupes.map((groupe) => {
            const visibles = groupe.bornes.filter((borne) => {
              const relue = parNumeroVerifie.has(borne.thumnNumber);
              if (filtre === 'a_relire') return !relue;
              if (filtre === 'relues') return relue;
              return true;
            });

            if (visibles.length === 0) return null;

            return (
              <tbody key={groupe.surah}>
                <tr>
                  <td colSpan={7} style={{ background: 'var(--beige-light)', fontWeight: 600 }}>
                    Sourate {groupe.surah} — {groupe.nomFr ?? 'nom non disponible'}{' '}
                    <span className="texte-tres-petit">
                      ({visibles.length} borne{visibles.length > 1 ? 's' : ''})
                    </span>
                  </td>
                </tr>

                {visibles.map((borne) => {
                  const ligne = parNumeroVerifie.get(borne.thumnNumber);
                  const ouverte = correctionOuverte === borne.thumnNumber;

                  return (
                    <Fragment key={borne.thumnNumber}>
                      <tr className={ligne ? 'ligne--relue' : undefined}>
                        <td className="colonne-nombre">{borne.thumnNumber}</td>
                        <td className="colonne-nombre">{borne.hizbNumber}</td>
                        <td className="colonne-nombre">{borne.rubNumber}</td>
                        <td className="mono">
                          {ligne?.statut === 'corrigee' && ligne.limiteSurah !== null
                            ? `${ligne.limiteSurah}:${ligne.limiteAyah}`
                            : formaterBorne(borne.limiteEstimee)}
                          {ligne?.statut === 'corrigee' && (
                            <span className="texte-tres-petit">
                              {' '}
                              (etait {formaterBorne(borne.limiteEstimee)})
                            </span>
                          )}
                        </td>
                        <td className="mono">
                          {formaterBorne(borne.limiteQaloun)}
                          {borne.ecart && (
                            <>
                              {' '}
                              <span className="badge badge--ecart">ecart</span>
                            </>
                          )}
                        </td>
                        <td>
                          {!ligne && <span className="badge badge--estimee">Estimee</span>}
                          {ligne?.statut === 'confirmee' && (
                            <span className="badge badge--confirmee">Confirmee</span>
                          )}
                          {ligne?.statut === 'corrigee' && (
                            <span className="badge badge--corrigee">Corrigee</span>
                          )}
                        </td>
                        <td className="colonne-etroite">
                          <button
                            type="button"
                            className="bouton bouton--principal"
                            disabled={enCours}
                            onClick={() =>
                              void enregistrer(borne.thumnNumber, 'confirmee', null, null, null)
                            }
                          >
                            Confirmer
                          </button>{' '}
                          <button
                            type="button"
                            className="bouton"
                            disabled={enCours}
                            onClick={() =>
                              ouverte
                                ? setCorrectionOuverte(null)
                                : ouvrirCorrection(borne, ligne)
                            }
                          >
                            {ouverte ? 'Annuler' : 'Corriger'}
                          </button>
                          {ligne && (
                            <>
                              {' '}
                              <button
                                type="button"
                                className="bouton bouton--discret"
                                disabled={enCours}
                                onClick={() => void retirer(borne.thumnNumber)}
                                title="Retirer cette relecture"
                              >
                                Retirer
                              </button>
                            </>
                          )}
                        </td>
                      </tr>

                      {ouverte && (
                        <tr>
                          <td colSpan={7} style={{ background: 'var(--surface-variant)' }}>
                            <div className="groupe-champs">
                              <div>
                                <label className="champ-libelle" htmlFor={`surah-${borne.thumnNumber}`}>
                                  Sourate de fin
                                </label>
                                <input
                                  id={`surah-${borne.thumnNumber}`}
                                  className="champ champ--nombre"
                                  inputMode="numeric"
                                  value={saisieSurah}
                                  onChange={(e) => setSaisieSurah(e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="champ-libelle" htmlFor={`ayah-${borne.thumnNumber}`}>
                                  Verset de fin
                                </label>
                                <input
                                  id={`ayah-${borne.thumnNumber}`}
                                  className="champ champ--nombre"
                                  inputMode="numeric"
                                  value={saisieAyah}
                                  onChange={(e) => setSaisieAyah(e.target.value)}
                                />
                              </div>
                              <div style={{ flex: 1, minWidth: 220 }}>
                                <label className="champ-libelle" htmlFor={`note-${borne.thumnNumber}`}>
                                  Note (facultatif) — ce qui a ete vu sur le moushaf
                                </label>
                                <input
                                  id={`note-${borne.thumnNumber}`}
                                  className="champ champ--large"
                                  value={saisieNote}
                                  onChange={(e) => setSaisieNote(e.target.value)}
                                  placeholder="Ex. : verifie sur l'edition Madina, page 12"
                                />
                              </div>
                              <button
                                type="button"
                                className="bouton bouton--principal"
                                disabled={enCours}
                                onClick={() => validerCorrection(borne)}
                              >
                                Enregistrer la correction
                              </button>
                            </div>
                            <p className="texte-tres-petit" style={{ marginBottom: 0 }}>
                              La borne doit tenir entre la fin du toumoun {borne.thumnNumber - 1} et
                              celle du toumoun {borne.thumnNumber + 1}. Si la borne estimee est
                              juste, utiliser « Confirmer » — une correction identique a
                              l&apos;estimation est refusee, parce qu&apos;elle ne dirait rien de
                              plus.
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>

      <p className="texte-tres-petit" style={{ marginTop: 12 }}>
        Empreinte des donnees : <span className="mono">{empreinteSource.slice(0, 16)}…</span> —
        c&apos;est cette empreinte qui sera jointe au fichier exporte, pour que le script qui
        l&apos;applique refuse de poser des corrections tirees d&apos;une autre version des
        donnees.
      </p>
    </>
  );
}

/**
 * La liste, en lecture seule.
 *
 * Sert quand les relectures n'ont pas pu etre lues : on peut encore consulter
 * les bornes a relire — c'est le meme fichier de donnees, il ne depend pas de
 * la base — mais aucune ligne ne peut etre enregistree, et rien n'est presente
 * comme deja relu.
 */
function ListeSeule({ groupes }: { groupes: GroupeSourate[] }) {
  return (
    <div className="tableau-enveloppe">
      <table className="tableau">
        <thead>
          <tr>
            <th className="colonne-etroite">Toumoun</th>
            <th className="colonne-etroite">Hizb</th>
            <th className="colonne-etroite">Rub&apos;</th>
            <th>Limite estimee</th>
            <th>Reference Qaloun</th>
          </tr>
        </thead>
        {groupes.map((groupe) => (
          <tbody key={groupe.surah}>
            <tr>
              <td colSpan={5} style={{ background: 'var(--beige-light)', fontWeight: 600 }}>
                Sourate {groupe.surah} — {groupe.nomFr ?? 'nom non disponible'}
              </td>
            </tr>
            {groupe.bornes.map((borne) => (
              <tr key={borne.thumnNumber}>
                <td className="colonne-nombre">{borne.thumnNumber}</td>
                <td className="colonne-nombre">{borne.hizbNumber}</td>
                <td className="colonne-nombre">{borne.rubNumber}</td>
                <td className="mono">{formaterBorne(borne.limiteEstimee)}</td>
                <td className="mono">
                  {formaterBorne(borne.limiteQaloun)}
                  {borne.ecart && (
                    <>
                      {' '}
                      <span className="badge badge--ecart">ecart</span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
