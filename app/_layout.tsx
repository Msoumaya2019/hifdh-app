// Layout racine de l'application
// Charge les polices arabes, la palette choisie, et configure le SafeArea

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Font from 'expo-font';
import { SplashScreen } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  estPaletteSombre,
  lireThemeEnregistre,
  PALETTE_PAR_DEFAUT,
  ThemeProvider,
  useColors,
  useTheme,
  type NomPalette,
} from '@/theme';
import { FournisseurAudio } from '@/lib/audio/ContexteAudio';

// Empêcher l'écran de démarrage de se cacher avant le chargement des polices
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  // Le thème se lit **avant** le premier rendu, et en parallèle des polices.
  //
  // L'écran de démarrage est déjà retenu par les polices : lire la palette dans
  // le même temps ne coûte donc aucune attente supplémentaire. Le faire après
  // le premier rendu aurait affiché l'application en vert, puis fait basculer
  // l'écran entier vers le thème choisi — un clignotement d'autant plus visible
  // que la palette sombre est éloignée du vert.
  const [themePret, setThemePret] = useState(false);
  const [nomTheme, setNomTheme] = useState<NomPalette>(PALETTE_PAR_DEFAUT);

  useEffect(() => {
    async function loadFonts() {
      try {
        await Font.loadAsync({
          AmiriQuran: require('../assets/fonts/AmiriQuran.ttf'),
          Amiri: require('../assets/fonts/Amiri-Regular.ttf'),
          'Amiri-Bold': require('../assets/fonts/Amiri-Bold.ttf'),
        });
      } catch (e) {
        console.warn('Erreur lors du chargement des polices:', e);
      } finally {
        setFontsLoaded(true);
        SplashScreen.hideAsync();
      }
    }
    loadFonts();
  }, []);

  useEffect(() => {
    let actif = true;
    // `lireThemeEnregistre` ne lève jamais : elle rend la palette par défaut
    // quand le stockage est vide ou illisible. Aucun rejet ne peut donc laisser
    // l'application sur l'écran de démarrage.
    lireThemeEnregistre()
      .then((nom) => {
        if (!actif) return;
        setNomTheme(nom);
        setThemePret(true);
      })
      // Ce `catch` ne doit jamais servir : `lireThemeEnregistre` attrape tout
      // et rend la palette par défaut. Il est là pour que `themePret` soit posé
      // quoi qu'il arrive — un état d'attente sans échéance laisserait
      // l'application sur l'écran de démarrage, sans rien pour en sortir.
      .catch(() => {
        if (!actif) return;
        setThemePret(true);
      });
    return () => {
      actif = false;
    };
  }, []);

  if (!fontsLoaded || !themePret) {
    return null;
  }

  return (
    // `GestureHandlerRootView` est obligatoire pour que
    // `react-native-gesture-handler` reçoive quoi que ce soit. Le paquet était
    // dans les dépendances sans que rien ne le monte : un geste écrit dans un
    // composant aurait alors été ignoré en silence, sans erreur ni message —
    // exactement le genre de panne qu'on cherche longuement ailleurs.
    //
    // `flex: 1` est indispensable : sans lui, le conteneur mesure zéro et
    // l'application s'affiche… vide.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider nomInitial={nomTheme}>
        <BarreEtat />
        {/* Le moteur audio, monté UNE FOIS pour toute l'application.
            Il est ici, et non dans l'écran du lecteur, pour une raison de fond :
            la récitation doit survivre à la navigation. Sortir de l'écran pour
            consulter son programme, revenir, et retrouver la récitation au même
            verset — c'est ce qu'un moteur monté dans l'écran ne peut pas faire,
            puisqu'il meurt avec lui.

            C'est aussi ce qui rend l'état du verset actif **unique** : le
            lecteur audio et la page du moushaf lisent le même fournisseur, donc
            ils ne peuvent pas afficher deux versets différents. */}
        <FournisseurAudio>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="onboarding"
              options={{ presentation: 'fullScreenModal', headerShown: false }}
            />
            <Stack.Screen
              name="lecteur"
              options={{ presentation: 'card', headerShown: false }}
            />
            {/* L'écran de sélection manuelle. Il n'a PAS d'entrée dans la barre
                d'onglets : la spécification interdit d'en ajouter un, et
                écouter est un geste qu'on fait depuis un passage, pas un
                endroit où l'on vit. */}
            <Stack.Screen
              name="ecouter"
              options={{ presentation: 'card', headerShown: false }}
            />
            <Stack.Screen
              name="amis"
              options={{ presentation: 'card', headerShown: false }}
            />
            <Stack.Screen
              name="discussion"
              options={{ presentation: 'card', headerShown: false }}
            />
            {/* Le lien de courriel — confirmation d'adresse ou réinitialisation de
                mot de passe — arrive sur `hifdh://lien`, que cette déclaration
                associe à l'écran. Sans elle, Expo Router chercherait une route
                `/lien` non déclarée et afficherait « écran introuvable » au moment
                précis où l'utilisateur attend que son lien fasse quelque chose. */}
            <Stack.Screen
              name="lien"
              options={{ presentation: 'card', headerShown: false }}
            />
          </Stack>
        </FournisseurAudio>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

/**
 * La barre d'état du téléphone.
 *
 * Séparée de la racine parce qu'elle a besoin de la palette **en vigueur**, et
 * que celle-ci ne vit pas dans la racine : la racine monte le fournisseur, elle
 * n'en est pas dedans. Les icônes de la barre d'état sont claires sur un fond
 * sombre et sombres sur un fond clair — l'inverse rendrait l'heure illisible
 * sur le thème noir.
 */
function BarreEtat() {
  const { nom } = useTheme();
  const palette = useColors();
  return (
    <StatusBar
      style={estPaletteSombre(nom) ? 'light' : 'dark'}
      backgroundColor={palette.background}
    />
  );
}
