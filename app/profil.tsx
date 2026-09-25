// Écran Profil — ce qui parle de la personne.
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

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
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
import { formatDate, getDayName } from '@/lib/progress';
import { libelleObjectif, libelleRythme } from '@/lib/libelles';
import type { UserConfig, MemorizedPassage } from '@/types';
import { useRouter, useFocusEffect } from 'expo-router';

export default function ProfilScreen() {
  const styles = useStyles(creerStyles);
  const router = useRouter();
  const [config, setConfig] = useState<UserConfig | null>(null);
  const [memorized, setMemorized] = useState<MemorizedPassage[]>([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

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

  const memorizedCount = memorized.filter((m) => m.level !== 'unknown')
    .reduce((sum, m) => sum + (m.endAyah - m.startAyah + 1), 0);

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

        {/* L'apparence a quitté cet écran : elle est devenue une entrée des
            réglages. Changer de couleur n'est pas une information sur soi,
            c'est un réglage de l'application. */}

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

        <ReglagesCompteSection />

        {/* Ce qui n'est PLUS ici, et pourquoi : les sources du Coran et la
            remise à zéro. Les deux sont devenues des entrées des réglages,
            ouvertes par l'engrenage en haut de cet écran. Le profil ne garde
            que ce qui parle de la personne : sa configuration, ses
            connaissances, sa sauvegarde, ses amis, son compte. */}
        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// `ChoixTheme` a suivi l'apparence : la pastille de thème vit maintenant dans
// `app/apparence.tsx`, avec l'écran qui la montre.

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
});
