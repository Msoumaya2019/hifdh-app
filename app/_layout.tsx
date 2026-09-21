// Layout racine de l'application
// Charge les polices arabes et configure le SafeArea

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Font from 'expo-font';
import { SplashScreen } from 'expo-router';
import { colors } from '@/theme';

// Empêcher l'écran de démarrage de se cacher avant le chargement des polices
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false);

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

  if (!fontsLoaded) {
    return null;
  }

  return (
    <>
      <StatusBar style="dark" backgroundColor={colors.background} />
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
      </Stack>
    </>
  );
}
