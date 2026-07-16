import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Colors, NavigationMotion } from '@/constants/theme';

const selectionTiming = {
  duration: NavigationMotion.selection,
  easing: Easing.out(Easing.poly(4)),
  reduceMotion: ReduceMotion.System,
} as const;

const pressTiming = {
  duration: NavigationMotion.press,
  easing: Easing.out(Easing.poly(4)),
  reduceMotion: ReduceMotion.System,
} as const;

export function AppTabBarButton({
  children,
  onPress,
  onPressIn,
  onPressOut,
  style,
  ...props
}: BottomTabBarButtonProps) {
  const selected = props['aria-selected'] === true;
  const reduceMotion = useReducedMotion();
  const selectionProgress = useSharedValue(selected ? 1 : 0);
  const pressProgress = useSharedValue(0);

  useEffect(() => {
    selectionProgress.value = withTiming(selected ? 1 : 0, selectionTiming);
  }, [selected, selectionProgress]);

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: selectionProgress.value,
    transform: [
      {
        scaleX: reduceMotion ? 1 : 0.82 + selectionProgress.value * 0.18,
      },
    ],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: 1 - pressProgress.value * 0.08,
    transform: [
      {
        translateY: reduceMotion ? 0 : -selectionProgress.value,
      },
      {
        scale: reduceMotion ? 1 : 1 - pressProgress.value * 0.035,
      },
    ],
  }));

  const handlePress: NonNullable<BottomTabBarButtonProps['onPress']> = (
    event,
  ) => {
    if (!selected) {
      void Haptics.selectionAsync().catch(() => undefined);
    }
    onPress?.(event);
  };

  const handlePressIn: NonNullable<BottomTabBarButtonProps['onPressIn']> = (
    event,
  ) => {
    pressProgress.value = withTiming(1, pressTiming);
    onPressIn?.(event);
  };

  const handlePressOut: NonNullable<BottomTabBarButtonProps['onPressOut']> = (
    event,
  ) => {
    pressProgress.value = withTiming(0, pressTiming);
    onPressOut?.(event);
  };

  return (
    <PlatformPressable
      {...props}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      pressOpacity={1}
      style={style}
    >
      <Animated.View style={[styles.buttonContent, contentStyle]}>
        <Animated.View
          pointerEvents="none"
          style={[styles.selectionIndicator, indicatorStyle]}
        />
        {children}
      </Animated.View>
    </PlatformPressable>
  );
}

export function AppTabBarBackground() {
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    void AccessibilityInfo.isReduceTransparencyEnabled().then(
      setReduceTransparency,
    );
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      setReduceTransparency,
    );

    return () => subscription.remove();
  }, []);

  const canUseGlass =
    Platform.OS === 'ios' &&
    isLiquidGlassAvailable() &&
    isGlassEffectAPIAvailable() &&
    !reduceTransparency;

  if (!canUseGlass) {
    return <View style={styles.opaqueBackground} />;
  }

  return (
    <GlassView
      colorScheme="light"
      glassEffectStyle="regular"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      tintColor={Colors.tabBarGlassTint}
    />
  );
}

const styles = StyleSheet.create({
  buttonContent: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    width: '100%',
  },
  selectionIndicator: {
    alignSelf: 'center',
    backgroundColor: Colors.backgroundSelected,
    borderCurve: 'continuous',
    borderRadius: 14,
    bottom: 0,
    maxWidth: 88,
    position: 'absolute',
    top: 0,
    width: '86%',
  },
  opaqueBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.tabBar,
  },
});
