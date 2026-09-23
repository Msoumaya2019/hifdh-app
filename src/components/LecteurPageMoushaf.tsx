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
// La composition par police a été retirée du lecteur, et elle n'est plus
// atteignable : le module qui la portait a été supprimé, et les 604 polices de
// page ne sont plus dans le dépôt — aucune version publiée ne les embarquait,
// mesuré dans l'APK. Elles se rétablissent à la demande par
// `scripts/recuperer_polices_pages.py`. Le mode « verset par verset », lui,
// n'a pas changé d'un caractère.
//
// CE QUI EST AFFICHÉ
// ------------------
// L'image seule, centrée, à son rapport réel, dans un cadre sobre. Rien n'est
// superposé **par-dessus** : ni texte, ni SVG, ni médaillon. La page porte déjà
// tout ce qu'un moushaf porte — son cadre, ses médaillons, ses cartouches et son
// numéro.
//
// DEUX SURLIGNAGES, ET ILS NE DISENT PAS LA MÊME CHOSE
// ----------------------------------------------------
// Les deux sont posés **derrière** l'image, donc sous l'encre :
//
//   - la bande de la séance (`bandeSurlignage`) couvre des **lignes entières**,
//     et dit « ta séance passe par ici » ;
//   - la zone du verset récité (`zoneVerset`) couvre les **mots d'un seul
//     verset**, et dit « c'est ici, maintenant ».
//
// Elles ne se déduisent pas l'une de l'autre, et c'est pourquoi les deux
// existent : la bande de ligne est exacte mais grossière — une ligne qui porte
// trois versets courts les marque tous les trois —, tandis que la zone de verset
// est précise au mot. Pour dire où en est la récitation, seule la seconde suffit.
//
// CE QUI REND LE SURLIGNAGE POSSIBLE SANS TOUCHER AUX IMAGES
// ----------------------------------------------------------
// Les pages sont des PNG à palette dont l'unique index transparent est le blanc
// (`tRNS` de longueur 1, valeur 0 — mesuré) : le papier est transparent, l'encre
// est opaque. Tout ce qui est dessiné **avant** l'image passe donc derrière
// l'encre, et les signes de vocalisation — qui débordent au-dessus et au-dessous
// de chaque ligne — restent intacts. C'est cette propriété, et non une marge
// choisie à l'œil, qui garantit que le surlignage ne masque jamais rien.
//
// Les positions viennent de `zones_surlignage.json`, engendré depuis la table
// `glyphs` de la base qui a servi à dessiner ces pages : ce sont les boîtes
// exactes des mots, jamais des coordonnées devinées. Voir
// `data/quran/generer_zones_surlignage.py` pour la provenance et les contrôles.
//
// TROIS ÉTATS, TOUJOURS LISIBLES
// ------------------------------
// Le chargement, l'échec et la page prête occupent la **même place** : le
// rapport de la page est réservé avant l'arrivée de l'image, donc rien ne saute
// quand elle arrive, et les boutons ne se déplacent pas sous le doigt.

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, radii, spacing, useStyles, type Palette } from '@/theme';
import { getRatioPage } from '@/lib/pagesMoushaf';
import { getLignesParPageMoushaf } from '@/data/quranData';
import { gesteDePage } from '@/lib/gestePageMoushaf';
import { lignesDuPassageSurPage, type PlageDeVersets } from '@/lib/surlignagePassage';
import { positionEnPourcent, versetTouche, zoneAvecMarge, zonesDuVerset, type RefVerset, type ZoneVerset } from '@/lib/zonesMoushaf';
import { raisonCacheIndisponible, usePageMoushaf } from '@/lib/cachePagesMoushaf';

/**
 * La marge, en fraction de la page, ajoutée autour d'une zone de verset.
 *
 * La boîte mesurée est celle de l'**encre** : collée au tracé, la bande rogne
 * l'extrémité des lettres et se lit comme un défaut de rendu. Quatre millièmes
 * de la largeur font environ huit pixels sur la page de 1920 — assez pour que
 * la bande respire, trop peu pour qu'elle morde sur le verset voisin.
 *
 * La marge verticale est **nulle**, et c'est délibéré : le haut et le bas d'une
 * zone sont déjà ceux de la ligne entière, donc de son encre la plus haute et
 * la plus basse. Y ajouter une marge ferait toucher les bandes de deux lignes
 * voisines, et la page paraîtrait soulignée d'un bout à l'autre.
 */
const MARGE_ZONE_X = 0.004;
const MARGE_ZONE_Y = 0;

export interface LecteurPageMoushafProps {
  /** La page à montrer, de 1 à 604. */
  page: number;
  /** Le nombre total de pages, pour l'affichage « n / total ». */
  total: number;
  /** Vrai si cette page porte une partie de la séance du jour. */
  dansLePassage: boolean;
  /** La plage de versets de la page, en clair, ou `null` si inconnue. */
  plageDeVersets: string | null;
  /**
   * La plage à surligner, ou `null`.
   *
   * Passée en paramètre plutôt que déduite de `page` : la page affichée n'est
   * pas forcément celle de la séance — on feuillette — et le surlignage doit
   * suivre la séance, pas la page.
   */
  passage?: PlageDeVersets | null;
  /**
   * Le verset en cours de récitation, ou `null` quand rien ne joue.
   *
   * C'est lui qui est surligné **au mot près**, à partir des zones mesurées de
   * `zones_surlignage.json`. `null` n'affiche aucune zone : c'est le cas d'un
   * lecteur à l'arrêt, et aussi celui d'une page qui ne porte pas le verset
   * récité — l'utilisateur a feuilleté, et le suivi est coupé.
   */
  actif?: RefVerset | null;
  /**
   * Les versets désignés à la main sur cette page.
   *
   * Mis en évidence d'une teinte distincte de celle du verset récité : ce que
   * l'utilisateur a choisi et ce que le lecteur joue sont deux choses
   * différentes, et les confondre l'empêcherait de voir sa sélection.
   */
  selection?: RefVerset[] | null;
  /**
   * Appelé quand l'utilisateur touche un verset de la page.
   *
   * **Sa présence active la désignation.** Sans lui, la page ne réagit pas au
   * toucher : c'est l'état ordinaire de la lecture, où un appui ne doit rien
   * faire. Un booléen séparé aurait permis d'activer le mode sans savoir quoi
   * faire du verset touché.
   */
  onToucherVerset?: (surah: number, ayah: number) => void;
  /** Aller à la page précédente. */
  onPrecedente: () => void;
  /** Aller à la page suivante. */
  onSuivante: () => void;
  /** Aller à une page donnée. */
  onAllerA: (page: number) => void;
  /** Vrai lorsque la page occupe tout l'écran. */
  pleinEcran?: boolean;
  /** Bascule le plein écran. */
  onBasculerPleinEcran?: () => void;
}

export function LecteurPageMoushaf({
  page,
  total,
  dansLePassage,
  plageDeVersets,
  passage = null,
  actif = null,
  selection = null,
  onToucherVerset,
  onPrecedente,
  onSuivante,
  onAllerA,
  pleinEcran = false,
  onBasculerPleinEcran,
}: LecteurPageMoushafProps) {
  const styles = useStyles(creerStyles);
  // `tentative` relance le chargement quand l'utilisateur appuie sur
  // « Réessayer » : sans elle, l'effet ne se rejouerait pas sur la même page.
  const [tentative, setTentative] = useState(0);
  const etat = usePageMoushaf(page, tentative);

  const [mesure, setMesure] = useState({ largeur: 0, hauteur: 0 });
  const [saisie, setSaisie] = useState<string | null>(null);

  // Les lignes à surligner, et leur hauteur.
  //
  // Une ligne fait le quinzième de la page : c'est la mise en page qui le dit,
  // et non une estimation. On peut donc placer les bandes en fraction, ce qui
  // les fait suivre exactement la page quelle que soit sa taille à l'écran.
  const lignesSurlignees = useMemo(
    () => lignesDuPassageSurPage(page, passage),
    [page, passage]
  );

  // Les zones du verset récité, en fractions de la page.
  //
  // Elles viennent de la table `glyphs` de la base qui a servi à dessiner ces
  // images : ce sont donc les boîtes **exactes** des mots du verset, et non des
  // positions estimées. Un verset coupé par un retour à la ligne en occupe
  // plusieurs — une par ligne — et chacune ne couvre que ses propres mots.
  //
  // Rend un tableau vide quand le verset n'est pas sur la page affichée, ce qui
  // est le cas normal d'un feuilletage : il n'y a alors rien à surligner, et
  // c'est exact.
  const zonesActives = useMemo(() => {
    if (actif === null) return [];
    return zonesDuVerset(page, actif.surah, actif.ayah).map((zone) =>
      zoneAvecMarge(zone, MARGE_ZONE_X, MARGE_ZONE_Y)
    );
  }, [page, actif]);

  // Les zones des versets désignés à la main. Même géométrie que celles du
  // verset récité — ce sont les mêmes boîtes mesurées —, mais une autre teinte :
  // ce que l'utilisateur a choisi n'est pas ce que le lecteur joue.
  const zonesSelectionnees = useMemo(() => {
    if (selection === null || selection.length === 0) return [];
    const zones: ZoneVerset[] = [];
    for (const verset of selection) {
      for (const zone of zonesDuVerset(page, verset.surah, verset.ayah)) {
        zones.push(zoneAvecMarge(zone, MARGE_ZONE_X, MARGE_ZONE_Y));
      }
    }
    return zones;
  }, [page, selection]);

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

  // Le geste de changement de page.
  //
  // `runOnJS` est nécessaire : la décision est prise sur le fil d'animation, et
  // `onSuivante`/`onPrecedente` écrivent dans l'état React, qui vit sur le fil
  // principal. Les appeler directement depuis le geste ne ferait rien.
  //
  // `activeOffsetX` et `failOffsetY` laissent le geste vertical au conteneur :
  // sans eux, un doigt qui descend verrouillerait le geste horizontal et le
  // défilement ne fonctionnerait plus. Les deux seuils sont exprimés ici en
  // points, et la décision de fond — seuil, axe dominant, sens — vit dans
  // `gestePageMoushaf.ts`, où elle est éprouvée.
  const gererGeste = useCallback(
    (dx: number, dy: number) => {
      const decide = gesteDePage(dx, dy);
      if (decide === 'suivante' && !derniere) onSuivante();
      else if (decide === 'precedente' && !premiere) onPrecedente();
    },
    [derniere, premiere, onPrecedente, onSuivante]
  );

  const geste = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-20, 20])
    .onEnd((evenement) => {
      runOnJS(gererGeste)(evenement.translationX, evenement.translationY);
    });

  // Le geste de désignation.
  //
  // Il est posé sur la FEUILLE, et non sur la zone de page : la feuille a
  // exactement les dimensions de la page imprimée, donc `x` et `y` se ramènent
  // aux fractions de la page par une simple division. Le poser sur la zone de
  // page obligerait à retrouver l'origine de la feuille — un calcul qui se
  // trompe en silence dès que la page n'est plus centrée.
  //
  // Il est **désactivé** tant que `onToucherVerset` n'est pas fourni : en
  // lecture ordinaire, un appui sur la page ne doit rien désigner.
  const gererTouche = useCallback(
    (x: number, y: number) => {
      if (onToucherVerset === undefined) return;
      if (largeurAffichee <= 0) return;
      const verset = versetTouche(page, x / largeurAffichee, y / (largeurAffichee * ratio));
      if (verset !== null) onToucherVerset(verset.surah, verset.ayah);
    },
    [onToucherVerset, page, largeurAffichee, ratio]
  );

  const gesteTouche = Gesture.Tap()
    .enabled(onToucherVerset !== undefined)
    .onEnd((evenement) => {
      runOnJS(gererTouche)(evenement.x, evenement.y);
    });

  return (
    <View style={styles.racine}>
      {/* La page, seule. `flex: 1` lui donne la place disponible ; le rapport
          est appliqué par la largeur calculée, pas par une hauteur fixe, pour
          que l'image ne soit jamais étirée. */}
      <GestureDetector gesture={geste}>
        <View
          style={styles.zonePage}
          onLayout={(evenement) =>
            setMesure({
              largeur: evenement.nativeEvent.layout.width,
              hauteur: evenement.nativeEvent.layout.height,
            })
          }
        >
        <GestureDetector gesture={gesteTouche}>
        <View
          style={[
            styles.feuille,
            largeurAffichee > 0 && {
              width: largeurAffichee,
              height: largeurAffichee * ratio,
            },
          ]}
        >
          {/* Les versets désignés à la main, DERRIÈRE la page, et posés en
              premier : la séance et le verset récité doivent rester visibles
              par-dessus, sans quoi on ne saurait plus où en est la récitation
              pendant qu'on prépare une sélection. */}
          {largeurAffichee > 0 &&
            zonesSelectionnees.map((zone, index) => (
              <View
                key={`sel-${zone.ligne}-${index}`}
                pointerEvents="none"
                style={[styles.zoneSelectionnee, positionEnPourcent(zone)]}
              />
            ))}
          {/* Le surlignage de la séance, DERRIÈRE la page.
              Il est posé avant l'image, donc dessiné en dessous : l'encre de
              l'imprimé reste au-dessus de la bande, et les mots ne sont jamais
              voilés. Une ligne fait le quinzième de la hauteur de la page —
              c'est la mise en page qui le dit, pas une estimation — donc la
              bande se place en fraction et suit la page à toute taille. */}
          {largeurAffichee > 0 &&
            lignesSurlignees.map((numero) => (
              <View
                key={numero}
                pointerEvents="none"
                style={[
                  styles.bandeSurlignage,
                  { top: `${((numero - 1) / LIGNES_PAR_PAGE) * 100}%` },
                ]}
              />
            ))}

          {/* Le verset récité, DERRIÈRE la page lui aussi, et posé après la
              bande de la séance — donc par-dessus elle.

              C'est le cœur de la synchronisation : la zone n'est pas un
              minuteur, c'est la boîte du verset dont le fichier audio joue.
              Elle ne peut pas se tromper de verset, parce qu'elle ne le devine
              pas — elle le lit.

              Pourquoi elle peut être teintée sans rien masquer : les pages sont
              des PNG dont l'unique index transparent est le blanc, et l'encre
              est opaque. Tout ce qui est dessiné avant l'image passe donc
              derrière l'encre, et les signes de vocalisation — qui débordent
              au-dessus et au-dessous de la ligne — restent intacts. C'est la
              propriété qui rend le surlignage possible sans toucher aux images.

              La teinte est celle du thème (`primary`) : vert dans « Vert »,
              rose dans « Rose », bleu dans « Bleu ». */}
          {largeurAffichee > 0 &&
            zonesActives.map((zone, index) => (
              <View
                key={`${zone.ligne}-${index}`}
                pointerEvents="none"
                style={[styles.zoneVerset, positionEnPourcent(zone)]}
              />
            ))}

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
        </GestureDetector>
        </View>
      </GestureDetector>

      {/* Le plein écran, en haut à gauche de la zone de page.
          Il reste discret : c'est un confort, pas une commande de lecture. La
          sortie, elle, est portée par l'écran — voir `lecteur.tsx`. */}
      {onBasculerPleinEcran !== undefined && !pleinEcran && (
        <Pressable
          style={styles.boutonPleinEcran}
          onPress={onBasculerPleinEcran}
          accessibilityLabel="Passer en plein écran"
          accessibilityRole="button"
          hitSlop={8}
        >
          <Ionicons name="expand-outline" size={20} color={colors.primary} />
        </Pressable>
      )}

      {/* Le repère du geste, la phrase « page hors de ta séance », la plage de
          versets en clair, et la barre du plein écran : tous retirés.

          Ce qui a été retiré l'a été pour une seule raison : sur un écran de
          téléphone, ces phrases occupaient la place que la page réclame. La
          page, elle, dit déjà l'essentiel — le surlignage montre où est la
          séance, et la barre de navigation, désormais toujours visible, porte
          le numéro de page.

          La barre du plein écran faisait donc double emploi avec elle. La
          SORTIE du plein écran, en revanche, n'est pas ici : elle est portée
          par l'écran, qui seul survit à une page qui ne charge pas. */}

      {/* La navigation. Trois commandes, assez grandes pour le pouce.

          Elle reste visible EN PLEIN ÉCRAN, et c'est un changement voulu. Elle
          y était masquée au motif que le geste de balayage la remplaçait —
          c'était supposer que le geste se découvre tout seul. Un lecteur qui ne
          le connaît pas se retrouvait devant une page dont il ne pouvait plus
          reculer d'une seule, et « plein écran » voulait dire « écran bloqué ».
          Les flèches restent donc, sous une forme plus compacte pour rendre à
          la page la place qu'elles lui prennent. */}
      <View style={[styles.navigation, pleinEcran && styles.navigationCompacte]}>
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
  const styles = useStyles(creerStyles);
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

/** Le nombre de lignes d'une page, lu dans la mise en page. */
const LIGNES_PAR_PAGE = getLignesParPageMoushaf();

const creerStyles = (colors: Palette) => StyleSheet.create({
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
  // Le bouton de plein écran : posé sur la zone de page, sans occuper de place
  // dans la mise en page — la page doit rester centrée, pas décalée.
  boutonPleinEcran: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySurface,
    zIndex: 2,
  },
  boutonPleinEcranActif: {
    backgroundColor: colors.primary,
  },
  // La bande de surlignage : une ligne du moushaf, derrière l'encre.
  //
  // La teinte est celle de l'or de la charte, très diluée (`#C4A35A` à 16 %).
  // Elle a été abaissée de 22 % à 16 % le jour où le verset récité a reçu sa
  // propre bande : les deux se superposent — le verset est toujours sur une
  // ligne de la séance — et à teintes égales la bande de la séance noyait celle
  // du verset. Celle-ci dit « la séance passe par ici », l'autre dit « c'est
  // ici, maintenant » : la seconde doit se distinguer de la première.
  bandeSurlignage: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: `${(1 / LIGNES_PAR_PAGE) * 100}%`,
    backgroundColor: colors.gold,
    opacity: 0.16,
  },
  // Le verset en cours de récitation : la boîte mesurée de ses mots, et rien
  // de plus. Sa largeur ne couvre que lui — c'est ce qui le distingue de la
  // bande de la séance, qui couvre des lignes entières.
  //
  // La teinte suit le thème, comme le demande la spécification. L'opacité reste
  // modérée par principe : la bande passe de toute façon sous l'encre, donc
  // elle ne peut pas cacher une diacritique — mais une teinte trop appuyée
  // rendrait la lecture désagréable sur une page qu'on récite.
  zoneVerset: {
    position: 'absolute',
    backgroundColor: colors.primary,
    opacity: 0.3,
    borderRadius: 4,
  },
  // Les versets désignés à la main. Teinte distincte de celle du verset récité,
  // et plus soutenue : c'est un choix de l'utilisateur, pas un état de lecture,
  // et il doit pouvoir vérifier d'un coup d'œil ce qu'il a sélectionné avant de
  // lancer la récitation. Un contour marque les bords, parce qu'une teinte seule
  // se confond avec le verset récité quand les deux se superposent.
  zoneSelectionnee: {
    position: 'absolute',
    backgroundColor: colors.gold,
    opacity: 0.45,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.goldDark,
  },
  // La barre du plein écran a été retirée : elle faisait double emploi avec la
  // barre de navigation, qui reste visible en plein écran et porte le même
  // compteur. La sortie du plein écran, elle, est portée par l'écran.
  // La feuille : le PAPIER, et non le fond du thème.
  //
  // C'est `colors.papier` et non `colors.surface`, et la différence n'est pas
  // cosmétique. Les pages sont des PNG à palette dont l'unique index transparent
  // est le blanc : le papier de l'image est **transparent**, et c'est le fond
  // posé dessous qui lui donne sa couleur. Sur le fond du thème noir
  // (`#191A1E`), l'encre `#000000` des pages serait devenue invisible — une
  // page noire sur fond noir. Le papier vaut donc blanc dans les quatre
  // palettes : une page de moushaf est blanche.
  feuille: {
    backgroundColor: colors.papier,
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
  // La navigation. Le plein écran la garde, mais resserrée : elle ne doit pas
  // reprendre à la page plus de place qu'il n'en faut pour des flèches.
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
  navigationCompacte: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
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
