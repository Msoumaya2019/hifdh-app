// Navigation par onglets — cinq onglets, rendus EN HAUT de l'écran.
//
// Ce fichier ne décrit plus que la LISTE des onglets et leurs libellés : la
// forme de la barre vit dans `src/components/BarreOngletsHaut.tsx`, où elle se
// lit d'un seul endroit. La raison du déplacement en haut, et celle du compte
// qui reste à cinq alors qu'« Amis » remplace « Profil », sont écrites là-bas.
//
// `tabBarPosition` est ici, dans `screenOptions`, et non sur `<Tabs>` : la
// position se lit dans les OPTIONS de l'écran qui a le focus. Le détail et la
// ligne du paquet qui le prouve sont dans l'en-tête de `BarreOngletsHaut`.

import { Tabs } from 'expo-router';
import { BarreOngletsHaut } from '@/components/BarreOngletsHaut';

const TAB_CONFIG = [
  { name: 'index', title: 'Accueil' },
  { name: 'coran', title: 'Coran' },
  { name: 'programme', title: 'Programme' },
  { name: 'progres', title: 'Progrès' },
  // « Amis » a pris la place de « Profil ». Le profil s'ouvre par l'avatar,
  // à droite de la barre — il est déclaré comme écran empilé dans la pile
  // racine (`app/_layout.tsx`), et vit dans `app/profil.tsx`.
  { name: 'amis', title: 'Amis' },
];

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <BarreOngletsHaut {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarPosition: 'top',
      }}
    >
      {TAB_CONFIG.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
      ))}
    </Tabs>
  );
}
