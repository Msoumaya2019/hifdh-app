// Layout racine de l'application
// Charge les polices arabes, la palette choisie, et configure le SafeArea

import { useCallback, useEffect, useState } from 'react';
import { router, Stack } from 'expo-router';
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
import { cibleDuLancement, configurerAffichage, ecouterLesAppuis } from '@/lib/push';
import type { CibleNotification } from '@/lib/notifications';

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

  /**
   * Où mène un appui sur une notification.
   *
   * La cible est décidée ailleurs — `cibleNotification`, dans
   * `src/lib/notifications.ts` — parce qu'elle se teste sans téléphone, et
   * qu'elle traite des données venues d'un service extérieur. Ici on ne fait
   * que naviguer.
   *
   * `accueil` ne navigue pas : l'application s'ouvre déjà sur l'accueil, et un
   * `push` vers la racine empilerait un second exemplaire de la même page — le
   * retour ramènerait alors à un écran identique, ce qui donne l'impression que
   * le bouton ne marche pas.
   */
  const ouvrirLaCible = useCallback((cible: CibleNotification) => {
    if (cible.type === 'discussion') {
      router.push({ pathname: '/discussion', params: { amiId: cible.amiId } });
      return;
    }
    if (cible.type === 'amis') {
      router.push('/amis');
    }
  }, []);

  // Les notifications s'écoutent ICI, une fois pour toute l'application : un
  // écouteur posé dans un écran mourrait avec lui, et l'appui reçu pendant
  // qu'on lit le Coran ne mènerait nulle part.
  //
  // L'effet attend que la pile soit montée (`fontsLoaded` et `themePret`) :
  // naviguer avant le premier rendu réel demanderait une route qui n'existe
  // pas encore, et la navigation serait perdue sans message.
  useEffect(() => {
    if (!fontsLoaded || !themePret) return;

    configurerAffichage();

    // L'appui qui a LANCÉ l'application : au moment de l'appui, aucun écouteur
    // n'existait encore, donc l'événement n'est pas dans le flux. On le demande
    // explicitement, et après un court délai — la pile vient d'être montée, et
    // une navigation immédiate peut précéder l'enregistrement des routes.
    const minuterie = setTimeout(() => {
      void cibleDuLancement().then((cible) => {
        if (cible !== null) ouvrirLaCible(cible);
      });
    }, 400);

    const retirer = ecouterLesAppuis(ouvrirLaCible);
    return () => {
      clearTimeout(minuterie);
      retirer();
    };
  }, [fontsLoaded, themePret, ouvrirLaCible]);

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
            {/* « amis » N'EST PLUS ICI. Il est devenu un ONGLET, et il vit dans
                `app/(tabs)/amis.tsx` : un écran déclaré deux fois — une fois
                comme onglet, une fois comme écran empilé — se résoudrait vers
                l'un des deux sans que rien ne le dise. */}
            {/* Le profil, lui, a fait le trajet inverse : il a quitté la barre
                d'onglets pour redevenir un écran empilé, atteint par l'avatar
                de `BarreOngletsHaut`. Il garde donc son retour, comme la
                maquette le montre. */}
            <Stack.Screen
              name="profil"
              options={{ presentation: 'card', headerShown: false }}
            />
            {/* Les réglages, et les deux écrans qu'ils ouvrent. Ils sont
                déclarés ici pour la même raison que les autres : une route non
                déclarée afficherait « écran introuvable » au moment précis où
                l'utilisateur attend que son appui fasse quelque chose. */}
            <Stack.Screen
              name="reglages"
              options={{ presentation: 'card', headerShown: false }}
            />
            <Stack.Screen
              name="apparence"
              options={{ presentation: 'card', headerShown: false }}
            />
            <Stack.Screen
              name="sources"
              options={{ presentation: 'card', headerShown: false }}
            />
            <Stack.Screen
              name="discussion"
              options={{ presentation: 'card', headerShown: false }}
            />
            {/* La liste des conversations. Elle est atteinte depuis la pastille
                de l'accueil et depuis l'écran des amis, jamais depuis la barre
                d'onglets : la spécification interdit d'y ajouter une sixième
                entrée. */}
            <Stack.Screen
              name="messages"
              options={{ presentation: 'card', headerShown: false }}
            />
            {/* Les deux réglages qui dépendent d'un serveur : le profil public
                et les notifications. Ils sont déclarés ici parce qu'un appui
                sur une notification peut mener à l'un comme à l'autre, et
                qu'une route non déclarée afficherait « écran introuvable » au
                moment précis où l'utilisateur attend que son appui fasse
                quelque chose. */}
            <Stack.Screen
              name="profil-public"
              options={{ presentation: 'card', headerShown: false }}
            />
            <Stack.Screen
              name="notifications"
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
