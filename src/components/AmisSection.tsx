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
import { colors, fontSizes, spacing, radii, useStyles, type Palette } from '@/theme';
import { isSupabaseConfigured } from '@/lib/supabase';
import { utilisateurCourant } from '@/lib/auth';
import { formaterCodeAmi, normaliserNom, resumeActivite } from '@/lib/amis';
import { mesAmis, monCodeAmi } from '@/lib/sync/amis';
import type { PointAmi } from '@/lib/amis';

/** Délai au-delà duquel on cesse d'attendre la session. */
const DELAI_SESSION_MS = 8000;

/** Marqueur d'un délai dépassé. Jamais `null`, qui veut dire « personne ». */
const DELAI_DEPASSE = Symbol('delai-depasse');

/**
 * Borne une promesse, et distingue trois issues : la valeur, `null` — qui a un
 * sens métier ici — et le délai dépassé, qui n'en a pas.
 */
function repondreDans<T>(
  promesse: Promise<T>,
  ms: number
): Promise<T | typeof DELAI_DEPASSE> {
  return Promise.race([
    promesse,
    new Promise<typeof DELAI_DEPASSE>((resoudre) =>
      setTimeout(() => resoudre(DELAI_DEPASSE), ms)
    ),
  ]);
}

export function AmisSection() {
  const styles = useStyles(creerStyles);
  const configure = isSupabaseConfigured();
  const [connecte, setConnecte] = useState<boolean | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [amis, setAmis] = useState<PointAmi[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  // Une PANNE de lecture, distincte de `erreur` : celle-ci vient d'une réponse
  // de la base, celle-là d'un appel qui a échoué avant d'en obtenir une.
  const [panne, setPanne] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!configure) {
      setConnecte(false);
      return;
    }
    setPanne(null);
    try {
      // `utilisateurCourant()` peut ne jamais rendre : la lecture de session se
      // sérialise derrière un verrou de stockage, et un verrou jamais relâché
      // laisse la promesse en attente indéfiniment. Ici, ce n'est pas un détail :
      // `connecte` reste `null` — et `null` affiche un rond qui tourne. On borne
      // donc l'attente, et un délai dépassé vaut « pas connecté », qui est un
      // état que l'écran sait déjà montrer.
      const oui = await repondreDans(utilisateurCourant(), DELAI_SESSION_MS);
      if (oui === DELAI_DEPASSE) {
        setConnecte(false);
        return;
      }
      const connecte = oui !== null;
      setConnecte(connecte);
      if (!connecte) return;

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
    } catch {
      // LA BORNE NE COUVRE PAS LE REJET, et c'est ce qui a coûté un rond sans
      // fin. `Promise.race` rend la première promesse qui s'achève — or un rejet
      // est un achèvement : il remonte donc tel quel, sans être confondu avec un
      // délai. Mesuré : `getSession()` rejette quand le stockage refuse une clé.
      // Sans ce rattrapage, `setConnecte` n'était jamais atteint, `connecte`
      // restait `null`, et `null` affiche un indicateur — indéfiniment.
      //
      // On ne rétrograde que l'état INCONNU : si la session avait déjà été lue,
      // la dire « pas connecté » serait un mensonge. C'est `panne` qui parle.
      setConnecte((etat) => (etat === null ? false : etat));
      setPanne(
        "La progression des amis n'a pas pu être lue. Vérifiez votre connexion, puis réessayez."
      );
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

  if (panne !== null) {
    // Rendue AVANT l'état inconnu : sinon `connecte === null` gagnerait, et
    // l'indicateur reviendrait là même où la panne vient d'être constatée.
    return (
      <>
        <Text style={styles.sectionTitle}>Mes amis</Text>
        <Card>
          <Text style={styles.texte}>{panne}</Text>
          <Pressable
            style={[styles.bouton, styles.boutonApres]}
            onPress={charger}
            accessibilityRole="button"
            accessibilityLabel="Réessayer de lire la progression des amis"
          >
            <Ionicons name="refresh-outline" size={20} color={colors.textOnPrimary} />
            <Text style={styles.texteBouton}>Réessayer</Text>
          </Pressable>
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

const creerStyles = (colors: Palette) => StyleSheet.create({
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
  boutonApres: {
    marginTop: spacing.lg,
  },
  texteBouton: {
    color: colors.textOnPrimary,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
});
