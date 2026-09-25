// Sources du Coran — d'où vient ce que l'application affiche.
//
// CET ÉCRAN A DÉMÉNAGÉ, IL N'A PAS ÉTÉ CRÉÉ. Ce contenu était la carte
// « À propos » du profil, en six lignes serrées. La maquette en fait une entrée
// des réglages, et le déménagement est l'occasion de le rendre lisible : une
// ligne par source, avec sa licence.
//
// RIEN N'EST ÉCRIT ICI QUI NE SOIT DANS `NOTICE.md`. Les licences citées y sont
// vérifiées une par une ; celles qui n'y sont pas — la récitation audio, par
// exemple — sont citées par leur SOURCE, sans leur prêter une licence que
// personne n'a établie. Une licence inventée sur un écran est pire qu'une
// licence absente : elle engage.
//
// La version se lit dans `app.json`, par `expo-constants`, et le compte des
// bornes estimées dans les données. Recopiés en dur, les deux mentiraient à la
// première livraison.

import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '@/components/Card';
import { getCompteLimitesEstimees } from '@/data/quranData';
import { colors, fontSizes, fontWeights, spacing, useStyles, type Palette } from '@/theme';

// Le compte des limites estimées se lit dans les données, pour la même raison
// que la version se lit dans `app.json` : écrit en dur, il finirait par mentir.
// Une limite relue quitte `estimated_offset`, et l'écran continuerait d'annoncer
// le chiffre d'avant la relecture.
const compteToumoun = getCompteLimitesEstimees();

export default function SourcesScreen() {
  const styles = useStyles(creerStyles);
  const version = Constants.expoConfig?.version ?? 'inconnue';

  return (
    <SafeAreaView style={styles.ecran} edges={['top']}>
      <View style={styles.entete}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Revenir en arrière"
        >
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.titre}>Sources du Coran</Text>
        <View style={styles.equilibre} />
      </View>

      <ScrollView contentContainerStyle={styles.contenu}>
        <Card>
          <Ligne
            titre="Texte coranique"
            detail="Tanzil Quran Text (Uthmani, version 1.1), graphie uthmani. Récitation Hafs an Asim."
            licence="Creative Commons Attribution 3.0"
          />
          <View style={styles.separateur} />
          <Ligne
            titre="Métadonnées de division"
            detail="quran-meta — sourates, versets, juz', hizb, et les subdivisions."
            licence="MIT"
          />
          <View style={styles.separateur} />
          <Ligne
            titre="Pagination du moushaf"
            detail="604 pages, bornes exactes. Le texte reste celui de Tanzil ; la pagination ne dépend pas de sa source."
            licence="—"
          />
          <View style={styles.separateur} />
          <Ligne
            titre="Polices"
            detail="Amiri pour le texte d'interface. Polices de page QCF v1 pour la page du moushaf."
            licence="SIL Open Font License 1.1 · Complexe Roi Fahd"
          />
          <View style={styles.separateur} />
          <Ligne
            titre="Récitation audio"
            detail="CDN d'Al Quran Cloud, un fichier par verset. Le débit dépend de l'édition, et il est mesuré édition par édition."
            licence="—"
          />
        </Card>

        <Card>
          <Text style={styles.sectionLabel}>Divisions</Text>
          <Text style={styles.valeur}>
            {compteToumoun.total} toumoun, dont {compteToumoun.estimees} bornes estimées
          </Text>
          <Text style={styles.note}>
            Une borne estimée est le DÉBUT d'un toumoun pair, jamais sa fin.
          </Text>
        </Card>

        <Text style={styles.version}>Hifdh — version {version}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Ligne({
  titre,
  detail,
  licence,
}: {
  titre: string;
  detail: string;
  licence: string;
}) {
  const styles = useStyles(creerStyles);
  return (
    <View style={styles.ligne}>
      <Text style={styles.titreSource}>{titre}</Text>
      <Text style={styles.detail}>{detail}</Text>
      <Text style={styles.licence}>{licence === '—' ? 'Licence non énoncée' : licence}</Text>
    </View>
  );
}

const creerStyles = (palette: Palette) =>
  StyleSheet.create({
    ecran: {
      flex: 1,
      backgroundColor: palette.background,
    },
    entete: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    titre: {
      fontSize: fontSizes.xl,
      fontWeight: fontWeights.bold,
      color: palette.textPrimary,
    },
    equilibre: {
      width: 26,
    },
    contenu: {
      padding: spacing.lg,
      gap: spacing.md,
      paddingBottom: spacing.xxxl * 2,
    },
    ligne: {
      gap: 2,
    },
    separateur: {
      height: 1,
      backgroundColor: palette.borderLight,
      marginVertical: spacing.md,
    },
    titreSource: {
      fontSize: fontSizes.md,
      fontWeight: fontWeights.semibold,
      color: palette.textPrimary,
    },
    detail: {
      fontSize: fontSizes.sm,
      color: palette.textSecondary,
      lineHeight: 19,
    },
    licence: {
      fontSize: fontSizes.xs,
      color: palette.textTertiary,
      marginTop: 2,
    },
    sectionLabel: {
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.semibold,
      color: palette.textSecondary,
      marginBottom: spacing.xs,
    },
    valeur: {
      fontSize: fontSizes.md,
      color: palette.textPrimary,
    },
    note: {
      fontSize: fontSizes.xs,
      color: palette.textTertiary,
      marginTop: spacing.xs,
    },
    version: {
      fontSize: fontSizes.sm,
      color: palette.textTertiary,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
  });
