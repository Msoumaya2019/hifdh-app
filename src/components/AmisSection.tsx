// Le suivi entre amis, tel qu'il apparaît dans l'onglet Profil.
//
// Un aperçu, pas la fonctionnalité entière : on montre son code d'invitation et
// les premiers amis, et l'on renvoie vers l'écran dédié pour le reste. C'est la
// même logique que la sauvegarde en ligne juste au-dessus — le Profil est un
// sommaire, pas un atelier.
//
// Trois états, comme partout dans ce projet, et ils sont distincts :
//   - non configuré : l'application ne connaît pas de serveur, on le dit ;
//   - non connecté : on explique quoi faire, sans le faire à la place ;
//   - connecté : la section vit.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Card } from '@/components/Card';
import { colors, fontSizes, spacing, radii } from '@/theme';
import { isSupabaseConfigured } from '@/lib/supabase';
import { utilisateurCourant } from '@/lib/auth';
import { formaterCodeAmi, normaliserNom, resumeActivite } from '@/lib/amis';
import { mesAmis, monCodeAmi } from '@/lib/sync/amis';
import type { PointAmi } from '@/lib/amis';

export function AmisSection() {
  const configure = isSupabaseConfigured();
  const [connecte, setConnecte] = useState<boolean | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [amis, setAmis] = useState<PointAmi[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!configure) {
      setConnecte(false);
      return;
    }
    const oui = (await utilisateurCourant()) !== null;
    setConnecte(oui);
    if (!oui) return;

    const resultatCode = await monCodeAmi();
    if (resultatCode.statut === 'ok') {
      setCode(resultatCode.code);
      setErreur(null);
    } else if (resultatCode.statut === 'erreur') {
      setErreur(resultatCode.message);
    }

    const resultat = await mesAmis();
    if (resultat.statut === 'ok') {
      setAmis(resultat.amis);
      setErreur(null);
    } else if (resultat.statut === 'erreur') {
      setErreur(resultat.message);
    }
  }, [configure]);

  // `useFocusEffect` et non `useEffect` : revenir de l'écran des amis après
  // avoir ajouté quelqu'un doit rafraîchir cet aperçu. Un `useEffect` ne
  // rejouerait pas, et l'aperçu resterait en arrière d'un ajout.
  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (!configure) {
    return (
      <>
        <Text style={styles.sectionTitle}>Mes amis</Text>
        <Card>
          <Text style={styles.texte}>
            Le suivi entre amis nécessite la sauvegarde en ligne, qui n’est pas configurée sur
            cette version de l’application.
          </Text>
        </Card>
      </>
    );
  }

  if (connecte === null) {
    return (
      <>
        <Text style={styles.sectionTitle}>Mes amis</Text>
        <Card>
          <ActivityIndicator color={colors.primary} />
        </Card>
      </>
    );
  }

  if (!connecte) {
    return (
      <>
        <Text style={styles.sectionTitle}>Mes amis</Text>
        <Card>
          <Text style={styles.texte}>
            Connectez-vous, plus haut dans cette page, pour suivre la progression de vos amis.
          </Text>
        </Card>
      </>
    );
  }

  return (
    <>
      <Text style={styles.sectionTitle}>Mes amis</Text>
      <Card>
        {code !== null && (
          <View style={styles.blocCode}>
            <Text style={styles.libelleCode}>Votre code d’invitation</Text>
            <Text style={styles.code} selectable accessibilityLabel={`Code d'invitation ${code}`}>
              {formaterCodeAmi(code)}
            </Text>
            <Text style={styles.aideCode}>
              Donnez-le à la personne que vous souhaitez suivre. Vous serez alors visibles l’un
              pour l’autre.
            </Text>
          </View>
        )}

        {erreur !== null && <Text style={styles.erreur}>{erreur}</Text>}

        {amis !== null && amis.length > 0 && (
          <View style={styles.liste}>
            {amis.slice(0, 3).map((ami) => (
              <View key={ami.userId} style={styles.ligneAmi}>
                <View style={styles.pastille}>
                  <Ionicons name="person" size={16} color={colors.primary} />
                </View>
                <View style={styles.texteAmi}>
                  <Text style={styles.nomAmi} numberOfLines={1}>
                    {normaliserNom(ami.nom)}
                  </Text>
                  <Text style={styles.detailAmi} numberOfLines={1}>
                    {resumeActivite(ami)}
                  </Text>
                </View>
              </View>
            ))}
            {amis.length > 3 && (
              <Text style={styles.aideCode}>
                et {amis.length - 3} autre{amis.length - 3 > 1 ? 's' : ''}
              </Text>
            )}
          </View>
        )}

        {amis !== null && amis.length === 0 && (
          <Text style={styles.aideCode}>
            Personne pour l’instant. Partagez votre code, ou saisissez celui d’un ami.
          </Text>
        )}

        <Pressable
          style={styles.bouton}
          // `navigate` plutôt que `push`, et l'objet plutôt que la chaîne : les
          // types de routes sont un artefact de compilation (`.expo/types/`),
          // régénéré au prochain `expo start`. Écrits ici à la main, ils
          // feraient échouer le contrôle de types jusqu'à ce qu'on démarre le
          // serveur — un faux échec, qui apprendrait à ignorer `tsc`.
          onPress={() => router.navigate('/amis' as never)}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir la page des amis"
        >
          <Ionicons name="people-outline" size={20} color={colors.textOnPrimary} />
          <Text style={styles.texteBouton}>Gérer mes amis</Text>
        </Pressable>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
    marginTop: spacing.xl,
    marginHorizontal: spacing.xs,
  },
  texte: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  blocCode: {
    backgroundColor: colors.primarySurface,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  libelleCode: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  code: {
    fontSize: fontSizes.xxl,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },
  aideCode: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    lineHeight: 17,
    marginTop: spacing.sm,
  },
  liste: {
    marginBottom: spacing.lg,
  },
  ligneAmi: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  pastille: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  texteAmi: {
    flex: 1,
  },
  nomAmi: {
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  detailAmi: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  erreur: {
    fontSize: fontSizes.sm,
    color: colors.error,
    marginBottom: spacing.md,
    lineHeight: 19,
  },
  bouton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  texteBouton: {
    color: colors.textOnPrimary,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
});
