// Composant Card réutilisable - carte aux coins arrondis

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, radii, spacing } from '@/theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'surface' | 'primary';
  padding?: keyof typeof spacing;
}

export function Card({ children, style, variant = 'default', padding = 'lg' }: CardProps) {
  const backgroundColor =
    variant === 'primary' ? colors.primarySurface
    : variant === 'surface' ? colors.surfaceVariant
    : colors.surface;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor, padding: spacing[padding] },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
});
