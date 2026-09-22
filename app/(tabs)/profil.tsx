// Écran Profil - Configuration et réglages

import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { SauvegardeSection } from '@/components/SauvegardeSection';
import { AmisSection } from '@/components/AmisSection';
import { colors, fontSizes, fonts, spacing, radii, fontWeights } from '@/theme';
import { getUserConfig, saveUserConfig, getMemorizedPassages, getReviewItemCount } from '@/lib/database';
import { getCompteLimitesEstimees } from '@/data/quranData';
import { formatDate, getDayName } from '@/lib/progress';
import { libelleObjectif, libelleRythme } from '@/lib/libelles';
import type { UserConfig, MemorizedPassage } from '@/types';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';

// Le compte des limites estimees se lit dans les donnees, pour la meme raison
// que la version se lit dans `app.json` : ecrit en dur, il finirait par mentir.
// Une limite relue quitte `estimated_offset`, et l'ecran continuerait d'annoncer
// le chiffre d'avant la relecture.
const compteToumoun = getCompteLimitesEstimees();

export default function ProfilScreen() {
  const router = useRouter();
  // La version se lit dans `app.json`, par `expo-constants`. La recopier ici en
  // dur l'a fait mentir dès la première montée de version : l'écran annonçait
  // 1.0.0 alors que le paquet était estampillé 1.0.2.
  const version = Constants.expoConfig?.version ?? 'inconnue';
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

  useEffect(() => {
    loadData();
  }, [loadData]);

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

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ConfigRow({ icon, label, value }: { icon: string; label: string; value: string }) {
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

const styles = StyleSheet.create({
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
  aboutText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 22,
  },
});
