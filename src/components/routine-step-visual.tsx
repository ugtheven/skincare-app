import { Image } from 'expo-image';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RoutineColors } from '@/constants/theme';
import type { RoutineCategory } from '@/domain/routine';

const CATEGORY_SYMBOLS: Record<RoutineCategory, SFSymbol> = {
  Démaquillant: 'sparkles',
  Nettoyant: 'drop.fill',
  Exfoliant: 'circle.dotted',
  Tonique: 'water.waves',
  Sérum: 'testtube.2',
  'Soin ciblé': 'scope',
  'Soin contour des yeux': 'eye.fill',
  Hydratant: 'humidity.fill',
  'Protection solaire': 'sun.max.fill',
  Masque: 'facemask.fill',
  Autre: 'square.grid.2x2.fill',
};

export function RoutineStepVisual({
  category,
  imageUrl,
  size = 48,
}: {
  category: RoutineCategory;
  imageUrl?: string | null;
  size?: number;
}) {
  const colors = RoutineColors;
  const normalizedImageUrl = imageUrl?.trim() || null;
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const showImage =
    normalizedImageUrl !== null && normalizedImageUrl !== failedImageUrl;
  const frameStyle = {
    borderRadius: Math.round(size * 0.24),
    height: size,
    width: size,
  };

  if (showImage) {
    return (
      <Image
        accessible={false}
        contentFit="contain"
        onError={() => setFailedImageUrl(normalizedImageUrl)}
        source={normalizedImageUrl}
        style={[
          styles.frame,
          frameStyle,
          { backgroundColor: colors.backgroundElement },
        ]}
        testID="routine-step-image"
      />
    );
  }

  return (
    <View
      accessible={false}
      style={[
        styles.frame,
        styles.placeholder,
        frameStyle,
        { backgroundColor: colors.backgroundSelected },
      ]}
      testID="routine-step-category-placeholder"
    >
      <SymbolView
        fallback={null}
        name={CATEGORY_SYMBOLS[category]}
        size={Math.round(size * 0.45)}
        tintColor={colors.tint}
        type="hierarchical"
        weight="medium"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
});
