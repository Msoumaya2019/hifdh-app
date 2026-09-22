// Le lecteur de page du moushaf : une image, et rien d'autre.
//
// CE QUI A CHANGÉ, ET POURQUOI
// ---------------------------
// Ce mode composait la page avec la police du complexe KFGQPC — un point de code
// par mot imprimé. C'était fidèle au tracé, mais exigeait de recalculer la
// moindre mesure : une largeur de ligne mal estimée déplaçait un mot, une page
// dont une ligne dépassait débordait sur la voisine, et le résultat restait une
// **reconstruction**. Le lecteur affiche maintenant l'image de la page imprimée.
// Elle ne peut pas se tromper : c'est la page elle-même.
//
// La composition par police n'a pas été supprimée — elle reste atteignable, et
// le mode « verset par verset » n'a pas changé d'un caractère.
//
// CE QUI EST AFFICHÉ
// ------------------
// L'image seule, centrée, à son rapport réel, dans un cadre sobre. Rien n'est
// superposé : ni texte, ni SVG, ni médaillon. La page porte déjà tout ce qu'un
// moushaf porte — son cadre, ses médaillons, ses cartouches et son numéro.
//
// TROIS ÉTATS, TOUJOURS LISIBLES
// ------------------------------
// Le chargement, l'échec et la page prête occupent la **même place** : le
// rapport de la page est réservé avant l'arrivée de l'image, donc rien ne saute
// quand elle arrive, et les boutons ne se déplacent pas sous le doigt.

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, radii, spacing } from '@/theme';
import { getRatioPage } from '@/lib/pagesMoushaf';
import { raisonCacheIndisponible, usePageMoushaf } from '@/lib/cachePagesMoushaf';

export interface LecteurPageMoushafProps {
  /** La page à montrer, de 1 à 604. */
  page: number;
  /** Le nombre total de pages, pour l'affichage « n / total ». */
  total: number;
  /** Vrai si cette page porte une partie de la séance du jour. */
  dansLePassage: boolean;
  /** La plage de versets de la page, en clair, ou `null` si inconnue. */
  plageDeVersets: string | null;
  /** Aller à la page précédente. */
  onPrecedente: () => void;
  /** Aller à la page suivante. */
  onSuivante: () => void;
  /** Aller à une page donnée. */
  onAllerA: (page: number) => void;
}

export function LecteurPageMoushaf({
  page,
  total,
  dansLePassage,
  plageDeVersets,
  onPrecedente,
  onSuivante,
  onAllerA,
}: LecteurPageMoushafProps) {
  // `tentative` relance le chargement quand l'utilisateur appuie sur
  // « Réessayer » : sans elle, l'effet ne se rejouerait pas sur la même page.
  const [tentative, setTentative] = useState(0);
  const etat = usePageMoushaf(page, tentative);

  const [mesure, setMesure] = useState({ largeur: 0, hauteur: 0 });
  const [saisie, setSaisie] = useState<string | null>(null);

  // La place réservée à la page, avant même que l'image ne soit là. On prend la
  // plus contraignante des deux dimensions : la page ne déborde jamais, ni en
  // largeur ni en hauteur, et son rapport est respecté.
  const ratio = getRatioPage(page);
  const largeurAffichee =
    mesure.largeur > 0 && mesure.hauteur > 0
      ? Math.min(mesure.largeur, mesure.hauteur / ratio)
      : 0;

  const premiere = page <= 1;
  const derniere = page >= total;

  return (
    <View style={styles.racine}>
      {/* La page, seule. `flex: 1` lui donne la place disponible ; le rapport
          est appliqué par la largeur calculée, pas par une hauteur fixe, pour
          que l'image ne soit jamais étirée. */}
      <View
        style={styles.zonePage}
        onLayout={(evenement) =>
          setMesure({
            largeur: evenement.nativeEvent.layout.width,
            hauteur: evenement.nativeEvent.layout.height,
          })
        }
      >
        <View
          style={[
            styles.feuille,
            largeurAffichee > 0 && {
              width: largeurAffichee,
              height: largeurAffichee * ratio,
            },
          ]}
        >
          {largeurAffichee > 0 && etat.chemin !== null && (
            <Image
              source={{ uri: etat.chemin }}
              style={styles.image}
              resizeMode="contain"
              accessibilityLabel={`Page ${page} du moushaf`}
            />
          )}

          {etat.chargement && (
            <View style={styles.superpose}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.messageDiscret}>Chargement de la page {page}…</Text>
            </View>
          )}

          {etat.echec && !etat.chargement && (
            <View style={styles.superpose}>
              <Ionicons name="cloud-offline-outline" size={40} color={colors.textTertiary} />
              <Text style={styles.messageEchec}>
                Cette page n’a pas pu être chargée.
              </Text>
              <Text style={styles.messageDiscret}>
                Vérifie ta connexion, puis réessaie : la page se garde ensuite sans réseau.
              </Text>
              {/* La raison exacte, quand on la connaît. Sans elle, toutes les
                  pannes se ressemblent et l'utilisateur cherche un problème de
                  réseau qui n'existe pas — c'est ce qui s'est produit sur
                  appareil, où un chemin de fichier invalide s'affichait comme
                  une panne de connexion. */}
              {raisonCacheIndisponible !== null && (
                <Text style={styles.messageCause}>
                  Cause : {raisonCacheIndisponible}.
                </Text>
              )}
              <Pressable
                style={styles.boutonReessayer}
                onPress={() => setTentative((n) => n + 1)}
                accessibilityLabel="Réessayer de charger la page"
              >
                <Ionicons name="refresh" size={18} color={colors.textOnPrimary} />
                <Text style={styles.boutonReessayerTexte}>Réessayer</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {/* La note de séance : dit si la page fait partie du programme du jour. */}
      <Text style={styles.noteSeance}>
        {dansLePassage
          ? 'Cette page porte une partie de ta séance du jour.'
          : 'Page hors de ta séance du jour.'}
      </Text>

      {plageDeVersets !== null && (
        <Text style={styles.plageVersets}>{plageDeVersets}</Text>
      )}

      {/* La navigation. Trois commandes, assez grandes pour le pouce. */}
      <View style={styles.navigation}>
        <Pressable
          style={[styles.bouton, premiere && styles.boutonInactif]}
          disabled={premiere}
          onPress={onPrecedente}
          accessibilityLabel="Page précédente"
          accessibilityRole="button"
        >
          <Ionicons
            name="chevron-back"
            size={20}
            color={premiere ? colors.textTertiary : colors.primary}
          />
          <Text style={[styles.boutonTexte, premiere && styles.boutonTexteInactif]}>
            Précédente
          </Text>
        </Pressable>

        {/* Le compteur sert aussi de saisie : on appuie dessus pour aller à une
            page précise, sans ajouter un champ qui encombrerait l'écran. */}
        {saisie === null ? (
          <Pressable
            style={styles.compteur}
            onPress={() => setSaisie(String(page))}
            accessibilityLabel={`Page ${page} sur ${total}. Appuyer pour aller à une page précise`}
            accessibilityRole="button"
          >
            <Text style={styles.compteurTexte}>
              {page} / {total}
            </Text>
            <Text style={styles.compteurAide}>Aller à…</Text>
          </Pressable>
        ) : (
          <View style={styles.compteurSaisie}>
            <ChampNumeroPage
              valeurInitiale={saisie}
              onValider={(numero) => {
                setSaisie(null);
                if (numero === null) return;
                onAllerA(Math.min(total, Math.max(1, numero)));
              }}
              onAnnuler={() => setSaisie(null)}
            />
          </View>
        )}

        <Pressable
          style={[styles.bouton, derniere && styles.boutonInactif]}
          disabled={derniere}
          onPress={onSuivante}
          accessibilityLabel="Page suivante"
          accessibilityRole="button"
        >
          <Text style={[styles.boutonTexte, derniere && styles.boutonTexteInactif]}>
            Suivante
          </Text>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={derniere ? colors.textTertiary : colors.primary}
          />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Le champ de saisie du numéro de page.
 *
 * Séparé pour que la frappe ne re-rende pas toute la page : le texte saisi vit
 * ici, et n'est remonté qu'à la validation. Rend `null` si la saisie n'est pas un
 * nombre — l'appelant la traite comme une annulation.
 */
function ChampNumeroPage({
  valeurInitiale,
  onValider,
  onAnnuler,
}: {
  valeurInitiale: string;
  onValider: (numero: number | null) => void;
  onAnnuler: () => void;
}) {
  const [texte, setTexte] = useState(valeurInitiale);

  const valider = () => {
    const chiffres = texte.replace(/[^0-9]/g, '');
    onValider(chiffres === '' ? null : Number(chiffres));
  };

  return (
    <>
      <TextInput
        style={styles.champ}
        value={texte}
        onChangeText={setTexte}
        keyboardType="number-pad"
        returnKeyType="go"
        autoFocus
        maxLength={3}
        onSubmitEditing={valider}
        placeholder="Page"
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel="Numéro de page"
      />
      <Pressable onPress={valider} hitSlop={8} accessibilityLabel="Valider la page">
        <Ionicons name="checkmark-circle" size={26} color={colors.primary} />
      </Pressable>
      <Pressable onPress={onAnnuler} hitSlop={8} accessibilityLabel="Annuler">
        <Ionicons name="close-circle" size={22} color={colors.textTertiary} />
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  racine: {
    flex: 1,
    alignItems: 'center',
  },
  zonePage: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // La feuille : fond sobre, coins arrondis, ombre légère. C'est le seul
  // habillage — la page n'est pas décorée, elle est posée.
  feuille: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  superpose: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  messageDiscret: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  messageEchec: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  messageCause: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  boutonReessayer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  boutonReessayerTexte: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.textOnPrimary,
  },
  noteSeance: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  plageVersets: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  navigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  bouton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.primarySurface,
    minWidth: 116,
    justifyContent: 'center',
  },
  boutonInactif: {
    backgroundColor: colors.surfaceVariant,
    opacity: 0.6,
  },
  boutonTexte: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.primary,
  },
  boutonTexteInactif: {
    color: colors.textTertiary,
  },
  compteur: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  compteurTexte: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.textPrimary,
  },
  compteurAide: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.gold,
    marginTop: 2,
  },
  compteurSaisie: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  champ: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.textPrimary,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    minWidth: 72,
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
});
