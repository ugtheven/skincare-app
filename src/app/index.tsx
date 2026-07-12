import { Image } from 'expo-image';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';

type RoutineStep = {
  id: string;
  title: string;
  icon: SFSymbol;
  completed: boolean;
  sunRelated?: boolean;
};

const INITIAL_STEPS: RoutineStep[] = [
  { id: 'cleanser', title: 'Nettoyant', icon: 'drop', completed: true },
  {
    id: 'serum',
    title: 'Sérum antioxydant',
    icon: 'sparkles',
    completed: true,
  },
  { id: 'moisturizer', title: 'Hydratant', icon: 'cube', completed: true },
  {
    id: 'eye-care',
    title: 'Contour des yeux',
    icon: 'eye',
    completed: false,
  },
  {
    id: 'sunscreen',
    title: 'Protection solaire',
    icon: 'sun.max',
    completed: false,
    sunRelated: true,
  },
  {
    id: 'lip-balm',
    title: 'Baume à lèvres',
    icon: 'capsule.fill',
    completed: false,
  },
];

export default function HomeScreen() {
  const colors = Colors;
  const insets = useSafeAreaInsets();
  const [steps, setSteps] = useState(INITIAL_STEPS);
  const [reduceMotion, setReduceMotion] = useState(false);
  const ambienceOpacity = useRef(new Animated.Value(0.7)).current;

  const completedCount = useMemo(
    () => steps.filter((step) => step.completed).length,
    [steps],
  );
  const nextStepId = steps.find((step) => !step.completed)?.id;
  const progress = completedCount / steps.length;

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      ambienceOpacity.setValue(0.7);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(ambienceOpacity, {
          toValue: 0.92,
          duration: 4500,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(ambienceOpacity, {
          toValue: 0.7,
          duration: 4500,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [ambienceOpacity, reduceMotion]);

  const toggleStep = (id: string) => {
    setSteps((currentSteps) =>
      currentSteps.map((step) =>
        step.id === id ? { ...step, completed: !step.completed } : step,
      ),
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { paddingTop: insets.top + 56 }]}>
          <Animated.View
            style={[styles.headerImage, { opacity: ambienceOpacity }]}
          >
            <Image
              source={require('@/assets/images/today-header.png')}
              contentFit="cover"
              contentPosition="right center"
              style={StyleSheet.absoluteFill}
              accessible={false}
            />
          </Animated.View>
          <View
            style={[
              styles.headerOverlay,
              { backgroundColor: colors.imageOverlay },
            ]}
          />

          <View style={styles.headerContent}>
            <Text style={[styles.title, { color: colors.text }]}>
              Aujourd&apos;hui
            </Text>
            <View style={styles.weatherRow}>
              <AppSymbol name="sun.max" color={colors.sun} />
              <Text style={[styles.weatherText, { color: colors.text }]}>
                18° aujourd&apos;hui
              </Text>
              <Text
                style={[styles.weatherDivider, { color: colors.textSecondary }]}
              >
                ·
              </Text>
              <Text style={[styles.uvText, { color: colors.sun }]}>
                UV 5 modéré
              </Text>
            </View>

            <View style={styles.routineSummary}>
              <Text style={[styles.routineTitle, { color: colors.text }]}>
                Routine du matin
              </Text>
              <Text style={[styles.routineTime, { color: colors.text }]}>
                7 h 30
              </Text>
              <Text
                style={[styles.routineStatus, { color: colors.textSecondary }]}
              >
                {completedCount} terminées · {steps.length - completedCount} à
                faire
              </Text>
              <View
                style={[
                  styles.progressTrack,
                  { backgroundColor: colors.separator },
                ]}
              >
                <View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: colors.tint,
                      width: `${progress * 100}%`,
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.routineList}>
          {steps.map((step) => (
            <RoutineRow
              key={step.id}
              step={step}
              isNext={step.id === nextStepId}
              onPress={() => toggleStep(step.id)}
              colors={colors}
              reduceMotion={reduceMotion}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function RoutineRow({
  step,
  isNext,
  onPress,
  colors,
  reduceMotion,
}: {
  step: RoutineStep;
  isNext: boolean;
  onPress: () => void;
  colors: typeof Colors;
  reduceMotion: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (value: number) => {
    if (reduceMotion) {
      scale.setValue(value);
      return;
    }

    Animated.spring(scale, {
      toValue: value,
      speed: 28,
      bounciness: 0,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  const iconColor = step.sunRelated ? colors.sun : colors.tint;
  const statusColor = step.completed ? colors.success : colors.tint;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`${step.title}, ${step.completed ? 'terminée' : 'à faire'}`}
        accessibilityHint="Touchez pour modifier l’état de cette étape"
        accessibilityState={{ checked: step.completed }}
        onPress={onPress}
        onPressIn={() => animateTo(0.985)}
        onPressOut={() => animateTo(1)}
        style={[
          styles.routineRow,
          {
            backgroundColor: isNext
              ? colors.backgroundSelected
              : colors.backgroundElement,
            borderColor: isNext ? colors.tint : colors.separator,
          },
          isNext && styles.nextRoutineRow,
        ]}
      >
        <View
          style={[
            styles.stepIcon,
            { backgroundColor: colors.backgroundSelected },
          ]}
        >
          <AppSymbol name={step.icon} color={iconColor} size={25} />
        </View>
        <View style={styles.stepCopy}>
          <Text style={[styles.stepTitle, { color: colors.text }]}>
            {step.title}
          </Text>
          <View style={styles.statusRow}>
            {step.completed ? (
              <AppSymbol
                name="checkmark.circle.fill"
                color={statusColor}
                size={20}
              />
            ) : null}
            <Text style={[styles.stepStatus, { color: statusColor }]}>
              {step.completed ? 'Terminée' : 'À faire'}
            </Text>
          </View>
        </View>
        <AppSymbol
          name="chevron.right"
          color={colors.textSecondary}
          size={18}
        />
      </Pressable>
    </Animated.View>
  );
}

function AppSymbol({
  name,
  color,
  size = 22,
}: {
  name: SFSymbol;
  color: string;
  size?: number;
}) {
  return (
    <SymbolView
      name={name}
      tintColor={color}
      size={size}
      weight="medium"
      fallback={
        <Text style={{ color, fontSize: size * 0.8 }}>
          {fallbackIcon(name)}
        </Text>
      }
    />
  );
}

function fallbackIcon(name: SFSymbol) {
  if (name.includes('sun')) return '☀';
  if (name.includes('checkmark')) return '✓';
  if (name === 'circle') return '○';
  if (name.includes('chevron')) return '›';
  if (name.includes('eye')) return '◉';
  if (name.includes('sparkles')) return '✦';
  return '●';
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    gap: 12,
  },
  header: {
    minHeight: 370,
    overflow: 'hidden',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  headerImage: {
    ...StyleSheet.absoluteFillObject,
  },
  headerOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  headerContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 42,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginTop: 14,
    flexWrap: 'wrap',
  },
  weatherText: {
    fontSize: 17,
    fontWeight: '500',
  },
  weatherDivider: {
    fontSize: 17,
  },
  uvText: {
    fontSize: 17,
    fontWeight: '600',
  },
  routineSummary: {
    gap: 6,
    marginTop: 'auto',
  },
  routineTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  routineTime: {
    fontSize: 19,
    fontWeight: '500',
  },
  routineStatus: {
    fontSize: 17,
    marginTop: 2,
  },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  routineList: {
    gap: 4,
    paddingHorizontal: 24,
  },
  routineRow: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 16,
    minHeight: 76,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  nextRoutineRow: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  stepIcon: {
    alignItems: 'center',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  stepCopy: {
    flex: 1,
    gap: 5,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  stepStatus: {
    fontSize: 17,
    fontWeight: '500',
  },
});
