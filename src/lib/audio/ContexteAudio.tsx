// Le moteur audio partagé : un seul son, un seul verset actif.
//
// POURQUOI UN CONTEXTE, ET NON UN COMPOSANT
// -----------------------------------------
// Deux morceaux de l'écran ont besoin de la même information, et ne peuvent pas
// se la transmettre par descendance : le **lecteur** (commandes, compteur,
// récitateur) et la **page du moushaf** (surlignage du verset récité, défilement
// automatique). La spécification l'exige explicitement — l'état du verset actif
// doit être centralisé.
//
// Le contexte est donc la seule autorité sur deux choses :
//
//   1. **le son qui joue**. Il n'en existe qu'un, dans une `ref` unique. Deux
//      objets `Sound` vivants pourraient jouer ensemble, et c'est précisément ce
//      que la spécification interdit. Les commandes ci-dessous libèrent le son
//      courant avant d'en créer un autre, toujours ;
//   2. **le verset actif**. C'est l'étape courante du plan, et elle est rendue
//      telle quelle aux deux consommateurs.
//
// LE VERROU DE SÉANCE, ET POURQUOI IL EST INDISPENSABLE ICI
// --------------------------------------------------------
// Chaque chargement est une attente, et une attente peut se terminer après que
// l'utilisateur a changé de passage ou appuyé sur « arrêter ». Le corps de
// l'effet prend donc un jeton de séance, et **vérifie qu'il est encore le
// courant** après chaque `await`. Sans cela, un verset de l'ancienne séance se
// mettrait à jouer par-dessus la nouvelle.
//
// LE PRÉCHARGEMENT EST UN, ET SEULEMENT UN
// ----------------------------------------
// Le verset suivant est téléchargé et préparé pendant que le courant joue, pour
// que l'enchaînement n'attende pas. Un seul est préparé à la fois : en préparer
// davantage ferait télécharger des versets que l'utilisateur n'écoutera peut-être
// jamais, et le préchargé **n'est jamais joué tant que le courant existe** — la
// règle du son unique est tenue par la même fonction qui libère.
//
// LA VITESSE SE CORRIGE EN HAUTEUR
// --------------------------------
// `setRateAsync(vitesse, true)` : sans la correction de hauteur, ralentir à
// 0,75× ferait descendre la voix d'un ton, et une récitation baissée n'est plus
// la récitation. C'est un réglage de confort, pas de fidélité au texte — mais la
// voix, elle, doit rester la même.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';

import {
  recitateurParId,
  urlAudioVerset,
  type Recitateur,
} from './recitateurs';
import type { Repetition } from './repetitions';
import { REPETITION_PAR_DEFAUT } from './repetitions';
import { etapeA, type Etape, type RefVerset } from './plan';
import {
  etatInitialLecture,
  etapeCourante,
  reducerLecture,
  versetActif,
  vitesseBornee,
  type EtatLecture,
} from './etatLecture';
import { creerVerrou, estActive, fermerSeance, ouvrirSeance } from './verrou';
import {
  enregistrerReglagesAudio,
  lireReglagesAudio,
  type ReglagesLus,
} from './preferences';

export interface Progression {
  positionMillis: number;
  dureeMillis: number;
}

export interface ValeurAudio {
  etat: EtatLecture;
  /** L'étape en cours — c'est le verset actif, partagé avec la page du moushaf. */
  etape: Etape | null;
  /**
   * Le verset en cours de récitation, ou `null` quand rien ne joue.
   *
   * C'est **l'état centralisé** que la spécification demande : le lecteur audio
   * et l'affichage du moushaf lisent la même valeur, donc ils ne peuvent pas
   * diverger. Le surlignage ne compte pas les secondes et ne devine rien — il
   * suit ce champ, qui vient de l'étape dont le fichier joue.
   */
  actif: RefVerset | null;
  /**
   * Le nombre de répétitions choisi, même quand rien ne joue.
   *
   * Distinct de `etat.plan.repetition`, qui n'existe qu'une séance ouverte :
   * l'écran doit pouvoir montrer le réglage avant qu'on lance quoi que ce soit.
   */
  repetition: Repetition;
  recitateur: Recitateur;
  progression: Progression;
  /** Vrai pendant l'ouverture d'une séance, avant que le récitateur soit lu. */
  chargementDesReglages: boolean;

  ouvrir: (versets: RefVerset[], repetition?: Repetition) => void;
  basculer: () => void;
  arreter: () => void;
  suivante: () => void;
  precedente: () => void;
  recommencer: () => void;
  rejoindre: (surah: number, ayah: number) => void;
  changerRecitateur: (id: string) => void;
  changerRepetition: (repetition: Repetition) => void;
  changerVitesse: (vitesse: number) => void;
  basculerSuivi: () => void;
}

const Contexte = createContext<ValeurAudio | null>(null);

/** Le nombre de mises à jour de position par seconde. Assez pour une barre fluide. */
const INTERVALLE_PROGRESSION_MS = 250;

export function FournisseurAudio({ children }: { children: React.ReactNode }) {
  const [etat, repartir] = useReducer(
    reducerLecture,
    recitateurParId(undefined).id,
    etatInitialLecture
  );
  const [progression, setProgression] = useState<Progression>({
    positionMillis: 0,
    dureeMillis: 0,
  });
  const [chargementDesReglages, setChargement] = useState(true);
  // Les réglages conservés, TENUS À PART de l'état de lecture.
  //
  // La répétition ne vit sinon que dans `etat.plan.repetition`, donc seulement
  // quand une séance est ouverte : l'écran ne pourrait pas montrer à
  // l'utilisateur le nombre de répétitions qu'il a choisi avant qu'il lance
  // quoi que ce soit. Ce champ est la valeur lue dans les préférences, mise à
  // jour à chaque changement — c'est ce que l'interface affiche.
  const [repetitionChoisie, setRepetitionChoisie] = useState<Repetition>(
    REPETITION_PAR_DEFAUT
  );

  // Le son qui joue. UN SEUL. Voir l'en-tête.
  const son = useRef<Audio.Sound | null>(null);
  // L'adresse chargée dans `son`. Sert à savoir si l'étape a changé, et rend
  // l'effet idempotent : passer de « chargement » à « lecture » ne recharge pas.
  const adresseChargee = useRef<string | null>(null);
  // Le verset suivant, préparé mais jamais joué. Voir l'en-tête.
  const precharge = useRef<{ adresse: string; son: Audio.Sound } | null>(null);
  const verrou = useRef(creerVerrou());

  const recitateur = useMemo(() => recitateurParId(etat.recitateurId), [etat.recitateurId]);
  const etape = useMemo(() => etapeCourante(etat), [etat]);
  const actif = useMemo(() => versetActif(etat), [etat]);

  // === Les réglages conservés ==============================================

  useEffect(() => {
    let actif = true;
    (async () => {
      const lus: ReglagesLus = await lireReglagesAudio();
      if (!actif) return;
      repartir({ type: 'changerRecitateur', id: lus.recitateur.id });
      repartir({ type: 'changerVitesse', vitesse: lus.vitesse });
      repartir({ type: 'changerRepetition', repetition: lus.repetition });
      setRepetitionChoisie(lus.repetition);
      setChargement(false);
    })();
    return () => {
      actif = false;
    };
  }, []);

  // === Le mode audio du système ============================================

  useEffect(() => {
    // `staysActiveInBackground` n'a d'effet que dans une application installée :
    // elle exige `UIBackgroundModes: audio` dans `app.json`, qui y est. Le
    // résultat est ignoré à dessein — un appareil qui refuse le mode dégradé
    // doit continuer de jouer au premier plan, et non refuser de jouer du tout.
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      shouldDuckAndroid: true,
    }).catch(() => undefined);
  }, []);

  /** Libère un son : l'arrête, le décharge, et avale l'erreur. */
  const liberer = useCallback(async (cible: Audio.Sound | null) => {
    if (cible === null) return;
    try {
      await cible.stopAsync();
    } catch {
      // Un son déjà arrêté lève sur certaines plateformes. Ce n'est pas une panne.
    }
    try {
      await cible.unloadAsync();
    } catch {
      // Idem : le déchargement d'un son jamais chargé lève, et sans conséquence.
    }
  }, []);

  // === Le chargement et la lecture =========================================

  const adresse = useMemo(() => {
    if (etat.plan === null) return null;
    const courante = etapeCourante(etat);
    if (courante === null) return null;
    return urlAudioVerset(recitateur, courante.surah, courante.ayah);
  }, [etat, recitateur]);

  useEffect(() => {
    const jeton = ouvrirSeance(verrou.current);
    let demonte = false;
    const encoreActive = () => !demonte && estActive(verrou.current, jeton);

    // 1. Rien ne doit jouer : on libère tout, préchargé compris.
    if (adresse === null || etat.statut === 'arret' || etat.statut === 'erreur') {
      if (etat.statut === 'arret') {
        void liberer(son.current);
        son.current = null;
        adresseChargee.current = null;
        void liberer(precharge.current?.son ?? null);
        precharge.current = null;
        setProgression({ positionMillis: 0, dureeMillis: 0 });
      }
      return () => {
        demonte = true;
      };
    }

    // 2. L'attente entre deux répétitions : rien à charger, elle se déroule seule.
    if (etat.statut === 'attente') {
      return () => {
        demonte = true;
      };
    }

    // 3. La pause : on suspend le son, sans le libérer — la position est gardée.
    if (etat.statut === 'pause') {
      const courant = son.current;
      if (courant !== null && adresseChargee.current === adresse) {
        courant.pauseAsync().catch(() => undefined);
      }
      return () => {
        demonte = true;
      };
    }

    // 4. Chargement ou lecture : le son doit exister et jouer.
    (async () => {
      try {
        // Le préchargé correspond : on le promeut, après avoir libéré le courant.
        // C'est ici, et seulement ici, que le son unique est garanti.
        if (adresseChargee.current !== adresse) {
          const courant = son.current;
          await liberer(courant);
          if (!encoreActive()) return;
          son.current = null;
          adresseChargee.current = null;

          if (precharge.current !== null && precharge.current.adresse === adresse) {
            son.current = precharge.current.son;
            precharge.current = null;
          } else {
            const cree = await Audio.Sound.createAsync(
              { uri: adresse },
              {
                shouldPlay: false,
                rate: etat.vitesse,
                shouldCorrectPitch: true,
                progressUpdateIntervalMillis: INTERVALLE_PROGRESSION_MS,
              },
              (statut) => {
                if (!encoreActive()) return;
                if (!statut.isLoaded) return;
                setProgression({
                  positionMillis: statut.positionMillis,
                  dureeMillis: statut.durationMillis ?? 0,
                });
                if (statut.didJustFinish) repartir({ type: 'finDePiste' });
              },
              true
            );
            if (!encoreActive()) {
              void liberer(cree.sound);
              return;
            }
            son.current = cree.sound;
          }
          adresseChargee.current = adresse;
        }

        const courant = son.current;
        if (courant === null) return;

        // La vitesse est reprise à chaque chargement : `createAsync` l'accepte,
        // mais un son promu depuis le préchargement a été créé avant un éventuel
        // changement de vitesse.
        await courant.setRateAsync(etat.vitesse, true).catch(() => undefined);
        if (!encoreActive()) return;

        const statut = await courant.getStatusAsync();
        if (!encoreActive()) return;
        if (statut.isLoaded && !statut.isPlaying) await courant.playAsync();
        if (!encoreActive()) return;
        repartir({ type: 'pretAJouer' });
      } catch (erreur) {
        if (!encoreActive()) return;
        const message = erreur instanceof Error ? erreur.message : String(erreur);
        repartir({ type: 'echec', message });
      }
    })();

    return () => {
      demonte = true;
    };
  }, [adresse, etat.statut, etat.vitesse, etat.plan, etat.index, liberer]);

  // === L'attente entre deux répétitions ====================================

  useEffect(() => {
    if (etat.statut !== 'attente' || etat.plan === null) return;
    const duree = Math.max(0, etat.plan.repetition.pauseSecondes) * 1000;
    const minuteur = setTimeout(() => repartir({ type: 'finDAttente' }), duree);
    return () => clearTimeout(minuteur);
  }, [etat.statut, etat.plan]);

  // === Le préchargement du verset suivant ==================================

  useEffect(() => {
    if (etat.plan === null || etat.statut !== 'lecture') return;
    const suivante = etapeA(etat.plan, etat.index + 1);
    if (suivante === null) return;

    const suivanteAdresse = urlAudioVerset(recitateur, suivante.surah, suivante.ayah);
    if (suivanteAdresse === null) return;
    if (suivanteAdresse === adresse) return;
    if (precharge.current?.adresse === suivanteAdresse) return;

    let annule = false;
    (async () => {
      // Le préchargé précédent ne servira plus : on le libère avant d'en créer
      // un autre, pour ne jamais avoir trois sons vivants.
      if (precharge.current !== null) {
        await liberer(precharge.current.son);
        precharge.current = null;
      }
      try {
        const prepare = await Audio.Sound.createAsync(
          { uri: suivanteAdresse },
          { shouldPlay: false, rate: etat.vitesse, shouldCorrectPitch: true },
          null,
          true
        );
        if (annule) {
          void liberer(prepare.sound);
          return;
        }
        precharge.current = { adresse: suivanteAdresse, son: prepare.sound };
      } catch {
        // Un préchargement qui échoue n'est pas une panne : le verset sera
        // chargé au moment de le jouer, et l'erreur sera dite à ce moment-là.
      }
    })();

    return () => {
      annule = true;
    };
  }, [etat.plan, etat.statut, etat.index, recitateur, adresse, etat.vitesse, liberer]);

  // === La libération à la fermeture de l'écran =============================

  useEffect(() => {
    const verrouCourant = verrou.current;
    return () => {
      fermerSeance(verrouCourant);
      void liberer(son.current);
      son.current = null;
      void liberer(precharge.current?.son ?? null);
      precharge.current = null;
    };
  }, [liberer]);

  // === Les commandes =======================================================

  const ouvrir = useCallback(
    (versets: RefVerset[], repetition?: Repetition) => {
      const reglage = repetition ?? etat.plan?.repetition;
      repartir({
        type: 'ouvrir',
        versets,
        repetition:
          reglage ??
          ({ mode: 'verset', nombre: 3, pauseSecondes: 2 } as Repetition),
      });
    },
    [etat.plan]
  );

  const basculer = useCallback(() => {
    if (etat.statut === 'lecture' || etat.statut === 'chargement') {
      repartir({ type: 'pause' });
      return;
    }
    // Depuis l'attente, l'utilisateur reprend tout de suite : il a appuyé sur
    // lecture, et subir la fin de la pause serait une attente qu'il n'a pas
    // demandée.
    if (etat.statut === 'pause' || etat.statut === 'attente') {
      repartir({ type: 'reprendre' });
      return;
    }
    if (etat.plan !== null) repartir({ type: 'reprendre' });
  }, [etat.statut, etat.plan]);

  const changerRecitateur = useCallback(
    (id: string) => {
      repartir({ type: 'changerRecitateur', id });
      void enregistrerReglagesAudio({ recitateurId: id });
    },
    []
  );

  const changerRepetition = useCallback((repetition: Repetition) => {
    repartir({ type: 'changerRepetition', repetition });
    setRepetitionChoisie(repetition);
    void enregistrerReglagesAudio({ repetition });
  }, []);

  const changerVitesse = useCallback((vitesse: number) => {
    repartir({ type: 'changerVitesse', vitesse });
    void enregistrerReglagesAudio({ vitesse: vitesseBornee(vitesse) });
  }, []);

  const valeur = useMemo<ValeurAudio>(
    () => ({
      etat,
      etape,
      actif,
      repetition: repetitionChoisie,
      recitateur,
      progression,
      chargementDesReglages,
      ouvrir,
      basculer,
      arreter: () => repartir({ type: 'arreter' }),
      suivante: () => repartir({ type: 'suivante' }),
      precedente: () => repartir({ type: 'precedente' }),
      recommencer: () => repartir({ type: 'recommencer' }),
      rejoindre: (surah: number, ayah: number) => repartir({ type: 'rejoindre', surah, ayah }),
      changerRecitateur,
      changerRepetition,
      changerVitesse,
      basculerSuivi: () => repartir({ type: 'basculerSuivi' }),
    }),
    [
      etat,
      etape,
      actif,
      repetitionChoisie,
      recitateur,
      progression,
      chargementDesReglages,
      ouvrir,
      basculer,
      changerRecitateur,
      changerRepetition,
      changerVitesse,
    ]
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

/**
 * Le moteur audio, ou `null` hors du fournisseur.
 *
 * Rend `null` plutôt que de lever : un écran qui n'a pas besoin du son — le
 * tableau de bord, un test de rendu — ne doit pas exiger le fournisseur pour
 * s'afficher. Les appelants qui en ont besoin emploient `useAudio`, qui lève.
 */
export function useAudioOuNull(): ValeurAudio | null {
  return useContext(Contexte);
}

/** Le moteur audio. Lève s'il est employé hors du fournisseur. */
export function useAudio(): ValeurAudio {
  const valeur = useContext(Contexte);
  if (valeur === null) {
    throw new Error('useAudio doit être employé dans un FournisseurAudio');
  }
  return valeur;
}
