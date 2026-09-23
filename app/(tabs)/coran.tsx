// Écran Coran - Navigation dans les sourates

import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { colors, fontSizes, fonts, spacing, radii, fontWeights, useStyles, type Palette } from '@/theme';
import { getAllSurahs } from '@/data/quranData';
import { getMemorizedPassages } from '@/lib/database';
import type { Surah, MemorizedPassage } from '@/types';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CoranScreen() {
  const styles = useStyles(creerStyles);
  const router = useRouter();
  const [surahs] = useState<Surah[]>(getAllSurahs());
  const [memorized, setMemorized] = useState<MemorizedPassage[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadMemorized = useCallback(async () => {
    const mem = await getMemorizedPassages();
    setMemorized(mem);
  }, []);

  // `useFocusEffect` et non `useEffect` : cet écran doit se relire en revenant.
  // Sans quoi, après une remise à zéro, la liste continuerait d'afficher les
  // sourates déclarées connues.
  useFocusEffect(
    useCallback(() => {
      loadMemorized();
    }, [loadMemorized])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadMemorized();
    setRefreshing(false);
  }, [loadMemorized]);

  const isSurahMemorized = (surahNum: number) => {
    const passages = memorized.filter((m) => m.surah === surahNum);
    if (passages.length === 0) return false;
    const memorizedVerses = passages.reduce(
      (sum, p) => sum + (p.endAyah - p.startAyah + 1),
      0
    );
    const surah = surahs.find((s) => s.number === surahNum);
    return surah ? memorizedVerses >= surah.ayahCount : false;
  };

  const getMemorizedPercentage = (surahNum: number) => {
    const passages = memorized.filter(
      (m) => m.surah === surahNum && m.level !== 'unknown'
    );
    const memorizedVerses = passages.reduce(
      (sum, p) => sum + (p.endAyah - p.startAyah + 1),
      0
    );
    const surah = surahs.find((s) => s.number === surahNum);
    if (!surah) return 0;
    return (memorizedVerses / surah.ayahCount) * 100;
  };

  const renderSurah = ({ item: surah }: { item: Surah }) => {
    const pct = getMemorizedPercentage(surah.number);
    const fullyMemorized = isSurahMemorized(surah.number);

    return (
      <Pressable
        onPress={() =>
          router.push({
            pathname: '/lecteur',
            params: { surah: surah.number, startAyah: 1, endAyah: surah.ayahCount },
          })
        }
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Card padding="md">
          <View style={styles.surahRow}>
            <View style={styles.surahNumber}>
              <Text style={styles.surahNumberText}>{surah.number}</Text>
            </View>
            <View style={styles.surahInfo}>
              <Text style={styles.surahNameFr}>{surah.nameFr}</Text>
              <Text style={styles.surahMeta}>
                {surah.ayahCount} versets · {surah.isMeccan ? 'Mecquoise' : 'Médinoise'}
              </Text>
            </View>
            <View style={styles.surahRight}>
              {fullyMemorized && (
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              )}
              {pct > 0 && !fullyMemorized && (
                <Text style={styles.partialBadge}>{pct.toFixed(0)}%</Text>
              )}
              <Text style={styles.surahNameAr}>{surah.name}</Text>
            </View>
          </View>
        </Card>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Le Coran</Text>
        <Text style={styles.subtitle}>114 sourates · 6236 versets</Text>
      </View>
      <FlatList
        data={surahs}
        keyExtractor={(item) => String(item.number)}
        renderItem={renderSurah}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </SafeAreaView>
  );
}

const creerStyles = (colors: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: fontSizes.xxxl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: fontSizes.sm,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  list: {
    padding: spacing.lg,
    paddingTop: 0,
    gap: spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
  surahRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  surahNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  surahNumberText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
  surahInfo: {
    flex: 1,
  },
  surahNameFr: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  surahMeta: {
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  surahRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  surahNameAr: {
    fontSize: fontSizes.lg,
    color: colors.primary,
    fontFamily: fonts.araby,
  },
  partialBadge: {
    fontSize: fontSizes.xs,
    color: colors.gold,
    fontWeight: fontWeights.semibold,
  },
});
