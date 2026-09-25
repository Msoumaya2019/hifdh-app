// Écran Profil — ce qui parle de la personne.
//
// LES SIX SECTIONS, ET POURQUOI CET ORDRE
// ---------------------------------------
// La demande nomme six sections et leur ordre : Mon prénom, Mes récitations,
// Connaissances, Objectif et rythme, Apprentissage, Amis et entraide. Il va du
// plus personnel au plus collectif : d'abord qui l'on est, puis ce que l'on
// sait, puis comment on le travaille, puis avec qui on le partage.
//
// C'est un ordre DEMANDÉ, et il est suivi tel quel. Une section déplacée ne
// casse rien à l'écran — rien ne planterait, rien ne serait vide —, donc aucun
// test de comportement ne le verrait. D'où `tests/profil.test.mjs`, qui lit ce
// fichier et vérifie la suite des six titres.
//
// CE QUI A QUITTÉ CET ÉCRAN, ET POURQUOI. Le profil portait aussi le choix du
// thème, les sources du Coran et la remise à zéro. La maquette les rassemble
// dans un écran de réglages, et le partage est plus juste : ce sont des
// décisions SUR l'application, alors que cet écran montre des choses SUR soi.
// L'engrenage de l'en-tête ouvre les réglages.
//
// RIEN N'A ÉTÉ PERDU AU PASSAGE : les trois blocs ont déménagé, ils n'ont pas
// été retirés. Le thème est dans `app/apparence.tsx`, les sources dans
// `app/sources.tsx`, la remise à zéro dans `app/reglages.tsx`.
//
// LE TITRE DE LA SECTION 1 VIENT DE SON COMPOSANT. `PrenomSection` porte son
// propre titre — il lit le prénom sur le serveur et le dit dans quatre états
// distincts, ce qui n'a pas sa place dans un écran de mise en page. Les cinq
// autres titres sont ici, et reprennent EXACTEMENT le même style que le sien :
// six titres qui se ressemblent font six sections, six titres différents
// feraient six blocs.

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  RefreshControl,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { PrenomSection } from '@/components/PrenomSection';
import { SauvegardeSection } from '@/components/SauvegardeSection';
import { AmisSection } from '@/components/AmisSection';
import { ReglagesCompteSection } from '@/components/ReglagesCompteSection';
// Seulement le TYPE : le profil n'affiche pas de ligne de menu, il emprunte
// juste le nom d'icône typé — `string` + `as any` ne vérifiait rien.
import type { NomIcone } from '@/components/LigneMenu';
import {
  colors,
  fontSizes,
  spacing,
  radii,
  fontWeights,
  useStyles,
  type Palette,
} from '@/theme';
import { getUserConfig, getMemorizedPassages, getReviewItemCount } from '@/lib/database';
import { getDayName } from '@/lib/progress';
import { libelleObjectif, libelleRythme } from '@/lib/libelles';
import { revisionsActives, enregistrerRevisions } from '@/lib/apprentissage';
import { getSurah } from '@/data/quranData';
import type { UserConfig, MemorizedPassage } from '@/types';
import { useRouter, useFocusEffect } from 'expo-router';

/** Combien de passages la section « Mes récitations » montre avant de résumer. */
const RECITATIONS_MONTRES = 4;

export default function ProfilScreen() {
  const styles = useStyles(creerStyles);
  const router = useRouter();
  const [config, setConfig] = useState<UserConfig | null>(null);
  const [memorized, setMemorized] = useState<MemorizedPassage[]>([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // L'INTERRUPTEUR DES RÉVISIONS A DEUX ÉTATS À LUI, ET ILS SONT TEMPORAIRES.
  //
  // `revisionsOptimiste` porte la valeur demandée le temps de l'écriture, pour
  // que l'interrupteur réponde tout de suite. Il repasse à `null` ensuite, et
  // c'est alors la configuration enregistrée qui parle : si l'écriture a
  // échoué, la valeur d'avant revient d'elle-même, sans code de restauration.
  //
  // `echecReglage` dit ce qui s'est passé. Un interrupteur qui revient tout seul
  // sans un mot est le pire des deux mondes : on croit avoir réglé, et rien
  // n'est réglé.
  const [revisionsOptimiste, setRevisionsOptimiste] = useState<boolean | null>(null);
  const [echecReglage, setEchecReglage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const cfg = await getUserConfig();
    setConfig(cfg);
    const mem = await getMemorizedPassages();
    setMemorized(mem);
    const rc = await getReviewItemCount();
    setReviewCount(rc);
  }, []);

  // `useFocusEffect` et non `useEffect` : cet écran doit se relire en revenant.
  //
  // Un écran d'onglet reste monté. Au retour du questionnaire — et donc après
  // une remise à zéro, qui y renvoie — un `useEffect` ne se rejouerait pas, et
  // l'écran continuerait d'annoncer les versets mémorisés d'avant. C'est
  // exactement le symptôme qui a fait demander un bouton de remise à zéro : il
  // ne suffit pas que les données partent, il faut aussi que l'écran cesse de
  // les montrer.
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleResetOnboarding = () => {
    Alert.alert(
      'Recommencer la configuration',
      'Veux-tu recommencer le questionnaire initial ? Tes données ne seront pas effacées.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Recommencer',
          onPress: () => router.push('/onboarding'),
        },
      ]
    );
  };

  // La remise à zéro a QUITTÉ cet écran, avec ses deux confirmations. Elle vit
  // maintenant dans `app/reglages.tsx`, sous « Tout remettre à 0 » : c'est une
  // commande sur l'application, pas une information sur la personne.

  const revisions = revisionsOptimiste ?? revisionsActives(config);

  const basculerRevisions = useCallback(
    async (valeur: boolean) => {
      setEchecReglage(null);
      setRevisionsOptimiste(valeur);
      try {
        // `enregistrerRevisions` relit la configuration avant d'écrire : la
        // ligne est remplacée ENTIÈRE, donc écrire un objet partiel effacerait
        // l'objectif, l'agenda et les passages mémorisés.
        const ecrit = await enregistrerRevisions(valeur);
        if (!ecrit) {
          // Aucune configuration enregistrée : il n'y a rien à régler. Le dire
          // vaut mieux que de laisser l'interrupteur se remettre en place seul.
          setEchecReglage(
            "Ce réglage n'a pas pu être enregistré : aucune configuration n'est encore enregistrée sur cet appareil."
          );
          return;
        }
        await loadData();
      } catch {
        setEchecReglage("Ce réglage n'a pas pu être enregistré. Réessayez dans un instant.");
      } finally {
        // Dans tous les cas : la configuration enregistrée reprend la parole.
        setRevisionsOptimiste(null);
      }
    },
    [loadData]
  );

  // Les passages comptés sont ceux qui sont connus : `unknown` n'est pas un
  // niveau, c'est l'absence de niveau, et le compter gonflerait le total.
  const passages = memorized.filter((m) => m.level !== 'unknown');
  const versetsMemorises = passages.reduce((sum, m) => sum + (m.endAyah - m.startAyah + 1), 0);
  const passagesParfaits = passages.filter((m) => m.level === 'perfect').length;
  const passagesARenforcer = passages.filter((m) => m.level === 'needs_review').length;
  const montres = passages.slice(0, RECITATIONS_MONTRES);
  const autres = passages.length - montres.length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Profil</Text>
        {/* L'engrenage, et pas une ligne de plus dans la page : les réglages ne
            sont pas une information SUR soi. Ils étaient pourtant ici, mêlés au
            thème et à la remise à zéro ; ils vivent maintenant dans leur propre
            écran, et c'est ce bouton qui les ouvre. */}
        <Pressable
          onPress={() => router.push('/reglages')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir les réglages"
        >
          <Ionicons name="settings-outline" size={24} color={colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* === 1. Mon prénom ================================================
            Le composant porte son propre titre, et c'est lui qui l'affiche. */}
        <PrenomSection />

        {/* === 2. Mes récitations ===========================================
            Ce que la personne sait, nommé. Les compteurs seuls ne disent pas
            QUOI a été mémorisé, et c'est la première chose qu'on cherche ici. */}
        <Text style={styles.sectionTitle}>Mes récitations</Text>

        <Card>
          {passages.length === 0 ? (
            <Text style={styles.vide}>
              Aucun passage mémorisé pour l’instant. Choisissez vos premiers versets dans l’onglet
              Coran.
            </Text>
          ) : (
            <>
              <Text style={styles.resume}>
                {passages.length} passage{passages.length > 1 ? 's' : ''} · {versetsMemorises}{' '}
                verset{versetsMemorises > 1 ? 's' : ''}
              </Text>

              {montres.map((passage) => (
                <LigneRecitation
                  key={`${passage.surah}-${passage.startAyah}-${passage.endAyah}`}
                  passage={passage}
                />
              ))}

              {autres > 0 && (
                <Text style={styles.autres}>
                  + {autres} autre{autres > 1 ? 's' : ''} passage{autres > 1 ? 's' : ''}
                </Text>
              )}
            </>
          )}
        </Card>

        {/* === 3. Connaissances =============================================
            L'état de ce qui est su : parfaitement mémorisé, à renforcer, en
            révision espacée. Et l'action qui les modifie, sous les chiffres
            qu'elle fait bouger. */}
        <Text style={styles.sectionTitle}>Connaissances</Text>

        <Card>
          <View style={styles.knowledgeRow}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={styles.knowledgeText}>
              {passagesParfaits} passage{passagesParfaits > 1 ? 's' : ''} parfaitement mémorisé
              {passagesParfaits > 1 ? 's' : ''}
            </Text>
          </View>
          <View style={styles.knowledgeRow}>
            <Ionicons name="time" size={20} color={colors.warning} />
            <Text style={styles.knowledgeText}>
              {passagesARenforcer} passage{passagesARenforcer > 1 ? 's' : ''} à renforcer
            </Text>
          </View>
          <View style={styles.knowledgeRow}>
            <Ionicons name="repeat" size={20} color={colors.gold} />
            <Text style={styles.knowledgeText}>
              {reviewCount} item{reviewCount > 1 ? 's' : ''} en révision espacée
            </Text>
          </View>
        </Card>

        <Pressable style={styles.actionRow} onPress={() => router.push('/(tabs)/coran')}>
          <Ionicons name="book-outline" size={20} color={colors.primary} />
          <Text style={styles.actionText}>Modifier mes connaissances</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </Pressable>

        {/* === 4. Objectif et rythme ========================================
            Ce qui a été choisi au questionnaire, tel qu'on le relit. */}
        <Text style={styles.sectionTitle}>Objectif et rythme</Text>

        <Card>
          <ConfigRow
            icon="flag"
            label="Objectif"
            value={config ? libelleObjectif(config.objective) : 'Non défini'}
          />
          <View style={styles.divider} />
          <ConfigRow
            icon="speedometer"
            label="Rythme"
            value={config ? libelleRythme(config.schedule.unit) : 'Non défini'}
          />
          <View style={styles.divider} />
          <ConfigRow
            icon="calendar"
            label="Jours d'apprentissage"
            value={config ? config.schedule.days.map(getDayName).join(', ') : 'Non défini'}
          />
        </Card>

        <Pressable style={styles.actionRow} onPress={handleResetOnboarding}>
          <Ionicons name="settings-outline" size={20} color={colors.primary} />
          <Text style={styles.actionText}>Modifier ma configuration</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </Pressable>

        {/* === 5. Apprentissage =============================================
            Un interrupteur RÉEL, et pas une ligne qui y ressemble : sa position
            est écrite en base et relue au chargement, et l'onglet Programme la
            suit — le nombre disparaît de l'entrée « Révision », et un bandeau y
            dit l'état avec le moyen de le changer. Éteindre ne supprime AUCUN
            passage : c'est un réglage d'affichage, pas un effacement, et la
            liste reste consultable. Le texte d'aide dit exactement cela, et rien
            de plus — un libellé qui promet davantage ferait douter du réglage. */}
        <Text style={styles.sectionTitle}>Apprentissage</Text>

        <Card>
          <View style={styles.reglageRow}>
            <View style={styles.reglageTexte}>
              <Text style={styles.reglageTitre}>Révisions</Text>
              <Text style={styles.reglageAide}>
                Afficher le nombre de passages à renforcer dans l’onglet Programme. Les désactiver
                ne supprime aucun passage : la liste reste consultable.
              </Text>
            </View>
            <Switch
              value={revisions}
              onValueChange={basculerRevisions}
              trackColor={{ false: colors.border, true: colors.primarySurface }}
              thumbColor={revisions ? colors.primary : colors.surface}
              accessibilityLabel="Révisions"
            />
          </View>

          {echecReglage !== null && <Text style={styles.souci}>{echecReglage}</Text>}
        </Card>

        {/* === 6. Amis et entraide ==========================================
            Un titre de section, puis trois blocs qui portent chacun le leur.
            Le titre est ici parce que la demande nomme six sections ; les trois
            composants gardent leurs propres sous-titres, dans le style discret
            qui était déjà celui de « Sauvegarde en ligne » — sinon la section
            empilerait trois gros titres, dont deux qui veulent dire la même
            chose que le sien. */}
        <Text style={styles.sectionTitle}>Amis et entraide</Text>

        <SauvegardeSection onDonneesChangees={loadData} />

        <AmisSection />

        <ReglagesCompteSection />

        {/* Ce qui n'est PLUS ici, et pourquoi : les sources du Coran et la
            remise à zéro. Les deux sont devenues des entrées des réglages,
            ouvertes par l'engrenage en haut de cet écran. Le profil ne garde
            que ce qui parle de la personne : son prénom, ses récitations, ses
            connaissances, son objectif, son apprentissage, ses amis. */}
        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// `ChoixTheme` a suivi l'apparence : la pastille de thème vit maintenant dans
// `app/apparence.tsx`, avec l'écran qui la montre.

/**
 * Une récitation telle qu'elle se lit : la sourate, puis l'étendue des versets.
 *
 * Le niveau ne s'écrit pas en toutes lettres — il se voit à l'icône et à sa
 * couleur, et la section 3 en donne déjà le compte. Deux fois le même mot, à
 * dix lignes d'écart, ne dit rien de plus.
 */
function LigneRecitation({ passage }: { passage: MemorizedPassage }) {
  const styles = useStyles(creerStyles);
  const nom = getSurah(passage.surah)?.nameFr ?? `Sourate ${passage.surah}`;
  const etendue =
    passage.endAyah > passage.startAyah
      ? `versets ${passage.startAyah} à ${passage.endAyah}`
      : `verset ${passage.startAyah}`;
  const parfait = passage.level === 'perfect';

  return (
    <View style={styles.recitationRow}>
      <Ionicons
        name={parfait ? 'checkmark-circle' : 'time'}
        size={18}
        color={parfait ? colors.success : colors.warning}
      />
      <View style={styles.recitationInfo}>
        <Text style={styles.recitationNom}>{nom}</Text>
        <Text style={styles.recitationDetail}>{etendue}</Text>
      </View>
    </View>
  );
}

function ConfigRow({ icon, label, value }: { icon: NomIcone; label: string; value: string }) {
  const styles = useStyles(creerStyles);
  return (
    <View style={styles.configRow}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <View style={styles.configInfo}>
        <Text style={styles.configLabel}>{label}</Text>
        <Text style={styles.configValue}>{value}</Text>
      </View>
    </View>
  );
}

const creerStyles = (colors: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    // Une rangée, et non un bloc : le titre à gauche, l'engrenage à droite.
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: fontSizes.xxxl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxxl * 2,
  },
  // Le MÊME style que le titre de `PrenomSection` : six sections, six titres
  // qui se ressemblent. Le changer ici seul ferait cinq titres d'une forme et
  // un sixième d'une autre.
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    marginHorizontal: spacing.xs,
  },
  // --- Section 2 : mes récitations ----------------------------------------
  resume: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  vide: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  recitationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  recitationInfo: {
    flex: 1,
  },
  recitationNom: {
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    fontWeight: fontWeights.medium,
  },
  recitationDetail: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  autres: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  // --- Section 3 : connaissances ------------------------------------------
  knowledgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  knowledgeText: {
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    flex: 1,
  },
  // --- Section 4 : objectif et rythme -------------------------------------
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  configInfo: {
    flex: 1,
  },
  configLabel: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
  },
  configValue: {
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    fontWeight: fontWeights.medium,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  // --- Section 5 : apprentissage ------------------------------------------
  reglageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  reglageTexte: {
    flex: 1,
  },
  reglageTitre: {
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    fontWeight: fontWeights.medium,
  },
  reglageAide: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    lineHeight: 17,
    marginTop: 2,
  },
  souci: {
    fontSize: fontSizes.sm,
    color: colors.error,
    lineHeight: 19,
    marginTop: spacing.md,
  },
  // --- Les actions ---------------------------------------------------------
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionText: {
    flex: 1,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
});
