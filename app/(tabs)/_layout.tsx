// Navigation par onglets - 5 onglets en bas

import { Tabs } from 'expo-router';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, spacing, radii } from '@/theme';

const TAB_CONFIG = [
  { name: 'index', title: 'Accueil', icon: 'home' as const, iconOutline: 'home-outline' as const },
  { name: 'coran', title: 'Coran', icon: 'book' as const, iconOutline: 'book-outline' as const },
  { name: 'programme', title: 'Programme', icon: 'calendar' as const, iconOutline: 'calendar-outline' as const },
  { name: 'progres', title: 'Progrès', icon: 'bar-chart' as const, iconOutline: 'bar-chart-outline' as const },
  { name: 'profil', title: 'Profil', icon: 'person' as const, iconOutline: 'person-outline' as const },
];

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: fontSizes.xs,
          fontWeight: '500',
        },
      }}
    >
      {TAB_CONFIG.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? tab.icon : tab.iconOutline}
                size={24}
                color={color}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
