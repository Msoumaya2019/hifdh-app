// Barre de progression

import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { colors, fontSizes, radii, spacing, useStyles, type Palette } from '@/theme';

interface ProgressBarProps {
  value: number; // 0-100
  label?: string;
  showValue?: boolean;
  color?: string;
  height?: number;
}

export function ProgressBar({
  value,
  label,
  showValue = true,
  color = colors.primary,
  height = 8,
}: ProgressBarProps) {
  const styles = useStyles(creerStyles);
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <View style={styles.container}>
      {(label || showValue) && (
        <View style={styles.header}>
          {label && <Text style={styles.label}>{label}</Text>}
          {showValue && (
            <Text style={[styles.value, { color }]}>
              {clampedValue.toFixed(1)}%
            </Text>
          )}
        </View>
      )}
      <View style={[styles.track, { height }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${clampedValue}%`,
              backgroundColor: color,
              height,
            },
          ]}
        />
      </View>
    </View>
  );
}

const creerStyles = (colors: Palette) => StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  value: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },
  track: {
    backgroundColor: colors.beigeLight,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: radii.pill,
  },
});
