// La barre du lecteur audio : les commandes, et le compteur de répétitions.
//
// CE QU'ELLE EST, ET CE QU'ELLE N'EST PAS
// ---------------------------------------
// Elle ne possède aucun état de lecture : tout vit dans le moteur audio
// (`ContexteAudio`), monté une fois pour l'application. La barre ne fait que
// lire cet état et émettre des gestes. C'est ce qui lui permet d'être posée
// dans plusieurs écrans — la séance du jour, le lecteur du moushaf, la
// sélection manuelle — sans que deux barres puissent diverger : elles lisent la
// même source.
//
// DEUX HAUTEURS, ET POURQUOI
// --------------------------
// Repliée, elle tient sur une ligne : ce qui joue, où l'on en est, et les quatre
// gestes du transport. C'est l'état ordinaire pendant une récitation — l'écran
// doit rester à la page.
//
// Dépliée, elle donne les réglages : récitateur, vitesse, mode de répétition,
// nombre, pause, et le suivi automatique. Ils changent rarement, et les garder
// affichés prendrait à la page la place qu'elle réclame.
//
// LE COMPTEUR EST CELUI DU PLAN, PAS UN COMPTE À REBOURS
// -----------------------------------------------------
// « Répétition 2 sur 5 » vient de l'étape en cours (`etape.repetition` et
// `etape.totalRepetitions`), donc du même calcul qui décide quel fichier audio
// joue. Un compteur tenu à part aurait pu annoncer « 2 sur 5 » pendant la
// troisième répétition sans que rien ne le signale.

import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { fonts, radii, spacing, useColors, useStyles, type Palette } from '@/theme';
import { getSurah } from '@/data/quranData';
import { useAudio } from '@/lib/audio/ContexteAudio';
import { RECITATEURS } from '@/lib/audio/recitateurs';
import {
  NOMBRES_REPETITION,
  PAUSES_SECONDES,
  libelleCompteur,
  libelleMode,
  libelleNombre,
  libellePause,
  type ModeRepetition,
} from '@/lib/audio/repetitions';
import { VITESSES, libelleVitesse } from '@/lib/audio/etatLecture';

/** Ce qu'affiche la barre comme titre : « Al-Fâtiha · verset 3 ». */
function titreDeLaSeance(surah: number, ayah: number): string {
  const nom = getSurah(surah)?.nameFr ?? `Sourate ${surah}`;
  return `${nom} · verset ${ayah}`;
}

export interface LecteurAudioProps {
  /**
   * L'action proposée quand rien ne joue, ou `null`.
   *
   * La barre ne sait pas quel passage ouvrir : c'est l'écran qui le sait — la
   * séance du jour, la plage du lecteur, la sélection de l'utilisateur. Ce
   * bouton lui est donc passé, plutôt que la barre ne devine.
   */
  onOuvrir?: (() => void) | null;
  /** Le libellé du bouton d'ouverture. */
  libelleOuvrir?: string;
}

export function LecteurAudio({ onOuvrir = null, libelleOuvrir = 'Écouter' }: LecteurAudioProps) {
  const styles = useStyles(creerStyles);
  // Les icônes prennent une COULEUR, et non un style. Elle vient donc du crochet
  // de palette, plutôt que d'un objet de styles auquel on aurait ajouté des
  // couleurs — un mélange qui laisse une palette à moitié appliquée.
  const palette = useColors();
  const [reglages, setReglages] = useState(false);

  const {
    etat,
    etape,
    repetition,
    recitateur,
    progression,
    basculer,
    arreter,
    suivante,
    precedente,
    recommencer,
    changerRecitateur,
    changerRepetition,
    changerVitesse,
    basculerSuivi,
  } = useAudio();

  const enSeance = etat.plan !== null && etat.statut !== 'arret';
  const joue = etat.statut === 'lecture' || etat.statut === 'chargement';
  const avance = progression.dureeMillis > 0
    ? Math.min(1, progression.positionMillis / progression.dureeMillis)
    : 0;

  // Rien n'est ouvert : la barre n'est qu'une invitation à écouter.
  if (!enSeance) {
    if (onOuvrir === null) return null;
    return (
      <View style={styles.barreRepliee}>
        <Pressable
          style={styles.boutonOuvrir}
          onPress={onOuvrir}
          accessibilityRole="button"
          accessibilityLabel={libelleOuvrir}
        >
          <Ionicons name="headset-outline" size={20} color={palette.textOnPrimary} />
          <Text style={styles.texteOuvrir}>{libelleOuvrir}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.barre}>
      {/* L'avancement, tout en haut de la barre. Une seule ligne, fine : elle
          renseigne sans réclamer de place. */}
      <View style={styles.railProgression}>
        <View style={[styles.jaugeProgression, { width: `${avance * 100}%` }]} />
      </View>

      <View style={styles.ligne}>
        <View style={styles.identite}>
          <Text style={styles.titre} numberOfLines={1}>
            {etape === null ? 'Récitation' : titreDeLaSeance(etape.surah, etape.ayah)}
          </Text>
          <Text style={styles.sousTitre} numberOfLines={1}>
            {etape === null
              ? recitateur.nom
              : `${libelleCompteur(etape.repetition, etape.totalRepetitions)} · ${recitateur.nom}`}
          </Text>
        </View>

        <Pressable
          style={styles.boutonTransport}
          onPress={precedente}
          accessibilityRole="button"
          accessibilityLabel="Verset précédent"
          hitSlop={6}
        >
          <Ionicons name="play-skip-back" size={20} color={palette.primary} />
        </Pressable>

        <Pressable
          style={styles.boutonLecture}
          onPress={basculer}
          accessibilityRole="button"
          accessibilityLabel={joue ? 'Mettre en pause' : 'Reprendre la récitation'}
          hitSlop={6}
        >
          <Ionicons
            name={joue ? 'pause' : 'play'}
            size={24}
            color={palette.textOnPrimary}
          />
        </Pressable>

        <Pressable
          style={styles.boutonTransport}
          onPress={suivante}
          accessibilityRole="button"
          accessibilityLabel="Verset suivant"
          hitSlop={6}
        >
          <Ionicons name="play-skip-forward" size={20} color={palette.primary} />
        </Pressable>

        <Pressable
          style={styles.boutonTransport}
          onPress={arreter}
          accessibilityRole="button"
          accessibilityLabel="Arrêter la récitation"
          hitSlop={6}
        >
          <Ionicons name="stop" size={20} color={palette.textSecondary} />
        </Pressable>

        <Pressable
          style={styles.boutonReglages}
          onPress={() => setReglages((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={reglages ? 'Masquer les réglages' : 'Afficher les réglages'}
          hitSlop={6}
        >
          <Ionicons
            name={reglages ? 'chevron-down' : 'options-outline'}
            size={20}
            color={palette.textSecondary}
          />
        </Pressable>
      </View>

      {/* Une panne se dit ici, à sa place : sur la barre qui joue, pas dans une
          alerte qui interromprait la lecture. Le bouton « reprendre » reste
          actif — c'est lui qui réessaie le même verset. */}
      {etat.statut === 'erreur' && (
        <Text style={styles.erreur}>
          Ce verset n’a pas pu être joué. Appuie sur lecture pour réessayer.
        </Text>
      )}

      {reglages && (
        <ScrollView
          style={styles.reglages}
          contentContainerStyle={styles.reglagesContenu}
          keyboardShouldPersistTaps="handled"
        >
          <Section titre="Récitateur">
            {RECITATEURS.map((r) => (
              <Puce
                key={r.id}
                libelle={r.nom}
                choisi={r.id === recitateur.id}
                onPress={() => changerRecitateur(r.id)}
              />
            ))}
          </Section>

          <Section titre="Répétitions">
            {NOMBRES_REPETITION.map((nombre) => (
              <Puce
                key={nombre}
                libelle={libelleNombre(nombre)}
                choisi={repetition.nombre === nombre}
                onPress={() => changerRepetition({ ...repetition, nombre })}
              />
            ))}
            <Puce
              libelle={libelleNombre(null)}
              choisi={repetition.nombre === null}
              onPress={() => changerRepetition({ ...repetition, nombre: null })}
            />
          </Section>

          <Section titre="Mode">
            {(['verset', 'passage'] as ModeRepetition[]).map((mode) => (
              <Puce
                key={mode}
                libelle={libelleMode(mode)}
                choisi={repetition.mode === mode}
                onPress={() => changerRepetition({ ...repetition, mode })}
              />
            ))}
          </Section>

          <Section titre="Pause entre les répétitions">
            {PAUSES_SECONDES.map((pauseSecondes) => (
              <Puce
                key={pauseSecondes}
                libelle={libellePause(pauseSecondes)}
                choisi={repetition.pauseSecondes === pauseSecondes}
                onPress={() => changerRepetition({ ...repetition, pauseSecondes })}
              />
            ))}
          </Section>

          <Section titre="Vitesse">
            {VITESSES.map((vitesse) => (
              <Puce
                key={vitesse}
                libelle={libelleVitesse(vitesse)}
                choisi={etat.vitesse === vitesse}
                onPress={() => changerVitesse(vitesse)}
              />
            ))}
          </Section>

          <Section titre="Suivi">
            <Puce
              libelle={etat.suiviAuto ? 'Suivi automatique activé' : 'Suivi automatique coupé'}
              choisi={etat.suiviAuto}
              onPress={basculerSuivi}
            />
            <Puce libelle="Recommencer le verset" choisi={false} onPress={recommencer} />
          </Section>
        </ScrollView>
      )}
    </View>
  );
}

/** Un intitulé de réglage, suivi de ses choix. */
function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  const styles = useStyles(creerStyles);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitre}>{titre}</Text>
      <View style={styles.puces}>{children}</View>
    </View>
  );
}

/** Un choix. `choisi` le met en évidence — c'est le seul état qu'il porte. */
function Puce({
  libelle,
  choisi,
  onPress,
}: {
  libelle: string;
  choisi: boolean;
  onPress: () => void;
}) {
  const styles = useStyles(creerStyles);
  return (
    <Pressable
      style={[styles.puce, choisi && styles.puceChoisie]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: choisi }}
      accessibilityLabel={libelle}
    >
      <Text style={[styles.puceTexte, choisi && styles.puceTexteChoisi]}>{libelle}</Text>
    </Pressable>
  );
}

const creerStyles = (colors: Palette) =>
  StyleSheet.create({
      barre: {
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
      },
      barreRepliee: {
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
        padding: spacing.md,
      },
      boutonOuvrir: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.md,
        borderRadius: radii.pill,
        backgroundColor: colors.primary,
      },
      texteOuvrir: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: colors.textOnPrimary,
      },
      railProgression: {
        height: 3,
        backgroundColor: colors.surfaceVariant,
      },
      jaugeProgression: {
        height: 3,
        backgroundColor: colors.primary,
      },
      ligne: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      },
      identite: {
        flex: 1,
        minWidth: 0,
      },
      titre: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: colors.textPrimary,
      },
      sousTitre: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 1,
      },
      boutonTransport: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
      },
      boutonLecture: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
      },
      boutonReglages: {
        width: 32,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
      },
      erreur: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: colors.warning,
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.sm,
      },
      reglages: {
        maxHeight: 240,
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
      },
      reglagesContenu: {
        padding: spacing.md,
        gap: spacing.md,
      },
      section: {
        gap: spacing.xs,
      },
      sectionTitre: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: colors.textTertiary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      },
      puces: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.xs,
      },
      puce: {
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.md,
        borderRadius: radii.pill,
        backgroundColor: colors.surfaceVariant,
      },
      puceChoisie: {
        backgroundColor: colors.primarySurface,
        borderWidth: 1,
        borderColor: colors.primary,
      },
      puceTexte: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: colors.textSecondary,
      },
      puceTexteChoisi: {
        fontFamily: fonts.medium,
        color: colors.primary,
      },
    });
