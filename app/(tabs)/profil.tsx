// Écran Profil - Configuration et réglages

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { SauvegardeSection } from '@/components/SauvegardeSection';
import { AmisSection } from '@/components/AmisSection';
import {
  colors,
  fontSizes,
  fonts,
  spacing,
  radii,
  fontWeights,
  useStyles,
  useTheme,
  LIBELLES_PALETTES,
  ORDRE_PALETTES,
  PALETTES,
  PALETTE_PAR_DEFAUT,
  type NomPalette,
  type Palette,
} from '@/theme';
import { getUserConfig, saveUserConfig, getMemorizedPassages, getReviewItemCount } from '@/lib/database';
import { EFFACEURS_APPAREIL } from '@/lib/effaceursAppareil';
import {
  messageDeSucces,
  messageEnCasDEchec,
  reinitialiserTout,
} from '@/lib/reinitialisation';
import { getCompteLimitesEstimees } from '@/data/quranData';
import { formatDate, getDayName } from '@/lib/progress';
import { libelleObjectif, libelleRythme } from '@/lib/libelles';
import type { UserConfig, MemorizedPassage } from '@/types';
import { useRouter, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';

// Le compte des limites estimees se lit dans les donnees, pour la meme raison
// que la version se lit dans `app.json` : ecrit en dur, il finirait par mentir.
// Une limite relue quitte `estimated_offset`, et l'ecran continuerait d'annoncer
// le chiffre d'avant la relecture.
const compteToumoun = getCompteLimitesEstimees();

export default function ProfilScreen() {
  const styles = useStyles(creerStyles);
  const router = useRouter();
  const { nom: nomTheme, changerTheme } = useTheme();
  // La version se lit dans `app.json`, par `expo-constants`. La recopier ici en
  // dur l'a fait mentir dès la première montée de version : l'écran annonçait
  // 1.0.0 alors que le paquet était estampillé 1.0.2.
  const version = Constants.expoConfig?.version ?? 'inconnue';
  const [config, setConfig] = useState<UserConfig | null>(null);
  const [memorized, setMemorized] = useState<MemorizedPassage[]>([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [remiseAZero, setRemiseAZero] = useState(false);

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

  /**
   * La remise à zéro, en deux temps.
   *
   * Deux confirmations, et non une seule : la première annonce ce qui va être
   * perdu, la seconde demande de le confirmer une fois que c'est lu. Un
   * effacement définitif de la progression ne se déclenche pas sur un appui
   * mal placé.
   */
  const handleReinitialiser = () => {
    Alert.alert(
      'Tout réinitialiser ?',
      'Cette action efface définitivement ta progression : passages mémorisés, séances, révisions espacées, pages gardées hors ligne, et ta connexion. Elle est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Continuer', style: 'destructive', onPress: confirmerReinitialisation },
      ]
    );
  };

  const confirmerReinitialisation = () => {
    Alert.alert(
      'Confirmer définitivement',
      'Dernière vérification : tout sera effacé, et l’application repartira comme à l’installation. Confirmer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Tout effacer', style: 'destructive', onPress: executerReinitialisation },
      ]
    );
  };

  const executerReinitialisation = async () => {
    setRemiseAZero(true);
    try {
      const resultat = await reinitialiserTout(EFFACEURS_APPAREIL);

      // Le magasin clé-valeur vient d'être vidé : la préférence de thème est
      // partie avec lui. Le fournisseur, lui, garde la palette en mémoire —
      // il faut donc la lui redire, sans quoi l'écran resterait rose après une
      // remise à zéro, alors que l'ouverture suivante afficherait du vert :
      // deux affichages différents de la même application.
      changerTheme(PALETTE_PAR_DEFAUT);

      if (resultat.echecs.length === 0) {
        Alert.alert('Remise à zéro', messageDeSucces(), [
          { text: 'Recommencer', onPress: () => router.replace('/onboarding') },
        ]);
        return;
      }

      // Une partie seulement a été effacée. On ne renvoie PAS au questionnaire :
      // y aller alors que la progression est restée ferait recalculer le
      // programme sur les anciennes données, et l'utilisateur croirait avoir
      // tout perdu sans que rien n'ait changé.
      Alert.alert('Remise à zéro incomplète', messageEnCasDEchec(resultat));
    } catch (erreur) {
      // `reinitialiserTout` rapporte ses échecs au lieu de les lever ; ce
      // `catch` ne doit donc jamais servir. Il est là pour qu'une panne
      // inattendue soit DITE, plutôt que de laisser l'écran sans réponse.
      Alert.alert(
        'Remise à zéro',
        "La remise à zéro n'a pas pu être menée à son terme. Ferme puis rouvre l'application, et réessaie."
      );
      void erreur;
    } finally {
      setRemiseAZero(false);
    }
  };

  const memorizedCount = memorized.filter((m) => m.level !== 'unknown')
    .reduce((sum, m) => sum + (m.endAyah - m.startAyah + 1), 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Profil</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Carte de progression globale */}
        <Card variant="primary" padding="lg">
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={32} color={colors.primary} />
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>Utilisateur</Text>
              <Text style={styles.profileStat}>
                {memorizedCount} versets mémorisés
              </Text>
            </View>
          </View>
        </Card>

        {/* Configuration actuelle */}
        <Text style={styles.sectionTitle}>Configuration</Text>

        <Card>
          <ConfigRow
            icon="flag"
            label="Objectif"
            value={config ? getObjectiveLabel(config) : 'Non défini'}
          />
          <View style={styles.divider} />
          <ConfigRow
            icon="speedometer"
            label="Rythme"
            value={config ? getScheduleLabel(config) : 'Non défini'}
          />
          <View style={styles.divider} />
          <ConfigRow
            icon="calendar"
            label="Jours d'apprentissage"
            value={config ? config.schedule.days.map(getDayName).join(', ') : 'Non défini'}
          />
        </Card>

        {/* Apparence */}
        <Text style={styles.sectionTitle}>Apparence</Text>

        <Card>
          <Text style={styles.aide}>
            Choisis la couleur de l’application. Le changement est immédiat, et
            conservé à la prochaine ouverture.
          </Text>
          <View style={styles.themeRow}>
            {ORDRE_PALETTES.map((nom) => (
              <ChoixTheme
                key={nom}
                nom={nom}
                actif={nom === nomTheme}
                onChoisir={changerTheme}
              />
            ))}
          </View>
        </Card>

        {/* Connaissances */}
        <Text style={styles.sectionTitle}>Mes connaissances</Text>

        <Card>
          <View style={styles.knowledgeRow}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={styles.knowledgeText}>
              {memorized.filter((m) => m.level === 'perfect').length} passages parfaitement mémorisés
            </Text>
          </View>
          <View style={styles.knowledgeRow}>
            <Ionicons name="time" size={20} color={colors.warning} />
            <Text style={styles.knowledgeText}>
              {memorized.filter((m) => m.level === 'needs_review').length} passages à renforcer
            </Text>
          </View>
          <View style={styles.knowledgeRow}>
            <Ionicons name="repeat" size={20} color={colors.gold} />
            <Text style={styles.knowledgeText}>
              {reviewCount} items en révision espacée
            </Text>
          </View>
        </Card>

        {/* Actions */}
        <Pressable style={styles.actionRow} onPress={handleResetOnboarding}>
          <Ionicons name="settings-outline" size={20} color={colors.primary} />
          <Text style={styles.actionText}>Modifier ma configuration</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </Pressable>

        <Pressable style={styles.actionRow} onPress={() => router.push('/(tabs)/coran')}>
          <Ionicons name="book-outline" size={20} color={colors.primary} />
          <Text style={styles.actionText}>Modifier mes connaissances</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </Pressable>

        {/* Sauvegarde en ligne */}
        <SauvegardeSection onDonneesChangees={loadData} />

        {/* Suivi entre amis */}
        <AmisSection />

        {/* À propos */}
        <Text style={styles.sectionTitle}>À propos</Text>
        <Card>
          <Text style={styles.aboutText}>
            Hifdh - Application de mémorisation du Coran{'\n'}
            Récitation: Hafs an Asim{'\n'}
            Texte: Tanzil (Uthmani){'\n'}
            Métadonnées: quran-meta (MIT){'\n'}
            Divisions: {compteToumoun.total} toumoun, dont {compteToumoun.estimees} bornes estimées{'\n'}
            Version: {version}
          </Text>
        </Card>

        {/* La remise à zéro. En dernier, et sous un titre qui prévient : c'est
            la seule commande de l'écran qui détruise quelque chose. */}
        <Text style={styles.sectionTitle}>Repartir de zéro</Text>

        <Pressable
          style={[styles.actionRow, styles.actionDanger]}
          onPress={handleReinitialiser}
          disabled={remiseAZero}
          accessibilityRole="button"
          accessibilityLabel="Tout réinitialiser"
          accessibilityState={{ disabled: remiseAZero }}
        >
          {remiseAZero ? (
            <ActivityIndicator size="small" color={colors.error} />
          ) : (
            <Ionicons name="trash-outline" size={20} color={colors.error} />
          )}
          <Text style={[styles.actionText, styles.actionTextDanger]}>
            {remiseAZero ? 'Effacement en cours…' : 'Tout réinitialiser'}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </Pressable>

        <Text style={styles.avertissement}>
          Efface la progression, les séances, les révisions, les pages gardées
          hors ligne et la connexion. L’application redevient comme au premier
          lancement.
        </Text>

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Une pastille de thème.
 *
 * L'aperçu montre les DEUX jetons qui font un thème : le fond de l'écran et la
 * couleur principale. Une pastille qui n'en montrerait qu'un — la principale,
 * par exemple — ne dirait rien du thème noir, dont le fond est l'essentiel.
 */
function ChoixTheme({
  nom,
  actif,
  onChoisir,
}: {
  nom: NomPalette;
  actif: boolean;
  onChoisir: (nom: NomPalette) => void;
}) {
  const styles = useStyles(creerStyles);
  const palette = PALETTES[nom];

  return (
    <Pressable
      style={styles.themeChoix}
      onPress={() => onChoisir(nom)}
      accessibilityRole="radio"
      accessibilityState={{ selected: actif }}
      accessibilityLabel={`Thème ${LIBELLES_PALETTES[nom]}`}
    >
      <View
        style={[
          styles.themeApercu,
          { backgroundColor: palette.background },
          actif && { borderColor: colors.primary, borderWidth: 2 },
        ]}
      >
        <View style={[styles.themePastille, { backgroundColor: palette.primary }]}>
          {actif && (
            <Ionicons name="checkmark" size={14} color={palette.textOnPrimary} />
          )}
        </View>
      </View>
      <Text style={[styles.themeNom, actif && styles.themeNomActif]}>
        {LIBELLES_PALETTES[nom]}
      </Text>
    </Pressable>
  );
}

function ConfigRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  const styles = useStyles(creerStyles);
  return (
    <View style={styles.configRow}>
      <Ionicons name={icon as any} size={20} color={colors.primary} />
      <View style={styles.configInfo}>
        <Text style={styles.configLabel}>{label}</Text>
        <Text style={styles.configValue}>{value}</Text>
      </View>
    </View>
  );
}

function getObjectiveLabel(config: UserConfig): string {
  return libelleObjectif(config.objective);
}

function getScheduleLabel(config: UserConfig): string {
  return libelleRythme(config.schedule.unit);
}

const creerStyles = (colors: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
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
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
  profileStat: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: fontSizes.sm,
    color: colors.textTertiary,
    fontWeight: fontWeights.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  aide: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  themeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  themeChoix: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  themeApercu: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themePastille: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeNom: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
  },
  themeNomActif: {
    color: colors.textPrimary,
    fontWeight: fontWeights.semibold,
  },
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
  actionDanger: {
    borderColor: colors.error,
  },
  actionTextDanger: {
    color: colors.error,
  },
  avertissement: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    lineHeight: 18,
    paddingHorizontal: spacing.xs,
  },
  aboutText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 22,
  },
});
