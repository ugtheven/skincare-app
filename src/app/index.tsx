import * as Haptics from 'expo-haptics';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  type TextProps,
  useWindowDimensions,
  View,
} from 'react-native';
import Reanimated, {
  Easing as ReanimatedEasing,
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoutineProductScanner } from '@/app/products';
import { FirstRoutineOnboarding } from '@/components/first-routine-onboarding';
import { RoutineManager } from '@/components/routine-editor';
import { RoutineStepVisual } from '@/components/routine-step-visual';
import { RoutineColors, RoutineMotion } from '@/constants/theme';
import {
  getRoutineProgress,
  type DailyStepStatus,
  type RoutineCategory,
  type RoutineOccurrence,
  type RoutinePeriod,
} from '@/domain/routine';
import { useRoutine } from '@/hooks/use-routine';

const PERIODS: { label: string; period: RoutinePeriod; symbol: SFSymbol }[] = [
  { label: 'Matin', period: 'morning', symbol: 'sun.max.fill' },
  { label: 'Soir', period: 'evening', symbol: 'moon.fill' },
];

const CONTENT_ENTERING = FadeIn.duration(RoutineMotion.state)
  .easing(ReanimatedEasing.out(ReanimatedEasing.poly(4)))
  .reduceMotion(ReduceMotion.System);

function Text(props: TextProps) {
  return <NativeText {...props} />;
}

type RoutineSheetTarget = {
  period: RoutinePeriod;
  productTargetStepId?: string;
};

export default function HomeScreen() {
  const colors = RoutineColors;
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotionPreference();
  const [routineSheet, setRoutineSheet] = useState<RoutineSheetTarget | null>(
    null,
  );
  const {
    activePeriod,
    error,
    isLoading,
    occurrences,
    refresh,
    setActivePeriod,
    setStepStatus,
  } = useRoutine();

  const openRoutineSheet = useCallback(
    (period: RoutinePeriod, productTargetStepId?: string) => {
      setRoutineSheet({ period, productTargetStepId });
    },
    [],
  );

  const saveAndCloseRoutineSheet = useCallback(async () => {
    await refresh({
      activePeriod: routineSheet?.period,
      silent: true,
    });
    setRoutineSheet(null);
  }, [refresh, routineSheet?.period]);

  const changeStepStatus = useCallback(
    async (
      period: RoutinePeriod,
      stepId: string,
      status: DailyStepStatus | null,
    ) => {
      const occurrence = occurrences[period];
      const completesRoutine =
        status === 'completed' &&
        Boolean(occurrence?.steps.length) &&
        occurrence?.steps.every(
          (step) => step.id === stepId || step.status === 'completed',
        );
      const persisted = await setStepStatus(period, stepId, status);
      if (!persisted) return;

      if (completesRoutine) {
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => undefined);
      } else if (status === 'completed') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
          () => undefined,
        );
      } else {
        void Haptics.selectionAsync().catch(() => undefined);
      }
      void AccessibilityInfo.announceForAccessibility(
        completesRoutine
          ? 'Routine terminée.'
          : status === 'completed'
            ? 'Étape effectuée.'
            : status === 'skipped'
              ? 'Étape ignorée aujourd’hui.'
              : 'Étape remise à faire.',
      );
    },
    [occurrences, setStepStatus],
  );

  const selectPeriod = useCallback(
    (period: RoutinePeriod) => {
      if (period === activePeriod) return;
      setActivePeriod(period);
      void Haptics.selectionAsync().catch(() => undefined);
    },
    [activePeriod, setActivePeriod],
  );

  useEffect(() => {
    if (error) void AccessibilityInfo.announceForAccessibility(error);
  }, [error]);

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Préparation de tes routines…
        </Text>
      </View>
    );
  }

  if (!occurrences.morning && !occurrences.evening) {
    if (error) {
      return <LoadError error={error} onRetry={() => void refresh()} />;
    }
    return (
      <FirstRoutineOnboarding
        onSaved={refresh}
        ProductScanner={RoutineProductScanner}
      />
    );
  }

  const occurrence = occurrences[activePeriod];
  const routineDayDate =
    occurrence?.scheduledDate ??
    occurrences.morning?.scheduledDate ??
    occurrences.evening?.scheduledDate;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <TodayHeader
          insetTop={insets.top}
          activePeriod={activePeriod}
          scheduledDate={routineDayDate}
        />

        <View
          accessibilityRole="tablist"
          style={[
            styles.periodPicker,
            { backgroundColor: colors.backgroundSelected },
          ]}
        >
          {PERIODS.map(({ label, period, symbol }) => {
            const selected = period === activePeriod;
            return (
              <Pressable
                key={period}
                accessibilityRole="tab"
                accessibilityLabel={`Routine du ${period === 'morning' ? 'matin' : 'soir'}`}
                accessibilityState={{ selected }}
                onPress={() => selectPeriod(period)}
                style={({ pressed }) => [
                  styles.periodButton,
                  {
                    backgroundColor: selected
                      ? colors.backgroundElement
                      : 'transparent',
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                <AppSymbol
                  name={symbol}
                  color={selected ? colors.tint : colors.textSecondary}
                  size={17}
                />
                <Text
                  maxFontSizeMultiplier={1.6}
                  style={[
                    styles.periodLabel,
                    { color: selected ? colors.text : colors.textSecondary },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {error ? (
          <View
            accessibilityLiveRegion="polite"
            style={[
              styles.inlineError,
              { backgroundColor: colors.backgroundSelected },
            ]}
          >
            <Text style={[styles.inlineErrorText, { color: colors.text }]}>
              {error}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Réessayer de charger les routines"
              hitSlop={8}
              onPress={() => void refresh()}
              style={styles.inlineRetry}
            >
              <Text style={[styles.retryText, { color: colors.tint }]}>
                Réessayer
              </Text>
            </Pressable>
          </View>
        ) : null}

        <Reanimated.View
          key={activePeriod}
          entering={CONTENT_ENTERING}
          style={styles.periodContent}
        >
          {occurrence ? (
            <>
              <RoutineSummary occurrence={occurrence} />
              <View
                accessibilityLabel={occurrence.routine.name}
                style={[styles.routineList, { borderColor: colors.separator }]}
              >
                {occurrence.steps.length > 0 ? (
                  occurrence.steps.map((step, index) => (
                    <RoutineRow
                      key={step.id}
                      category={step.category}
                      instruction={step.instruction}
                      isFirst={index === 0}
                      isPlaceholder={!step.productId}
                      productImageUrl={step.productImageUrl}
                      status={step.status}
                      title={step.title}
                      onLinkProduct={() =>
                        openRoutineSheet(activePeriod, step.id)
                      }
                      onStatusChange={(status) =>
                        void changeStepStatus(activePeriod, step.id, status)
                      }
                    />
                  ))
                ) : (
                  <EmptyRoutineDay />
                )}
              </View>
            </>
          ) : (
            <MissingRoutine
              period={activePeriod}
              onCreate={() => openRoutineSheet(activePeriod)}
            />
          )}
        </Reanimated.View>

        <TodaySupportSections />

        {occurrence ? (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Ouvre directement la routine affichée"
            onPress={() => openRoutineSheet(activePeriod)}
            style={({ pressed }) => [
              styles.manageButton,
              {
                backgroundColor: pressed
                  ? colors.backgroundSelected
                  : 'transparent',
              },
            ]}
          >
            <AppSymbol
              name="slider.horizontal.3"
              color={colors.tint}
              size={18}
            />
            <Text
              maxFontSizeMultiplier={1.6}
              style={[styles.manageButtonText, { color: colors.tint }]}
            >
              Modifier cette routine
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <Modal
        animationType={reduceMotion ? 'fade' : 'slide'}
        onRequestClose={() => setRoutineSheet(null)}
        presentationStyle="pageSheet"
        testID="routine-sheet"
        visible={routineSheet !== null}
      >
        {routineSheet ? (
          <RoutineManager
            initialEffectiveFromDate={
              occurrences[routineSheet.period]?.scheduledDate ?? routineDayDate
            }
            initialPeriod={routineSheet.period}
            initialProductTargetStepId={
              routineSheet.productTargetStepId ?? null
            }
            onClose={() => setRoutineSheet(null)}
            onSaved={saveAndCloseRoutineSheet}
            ProductScanner={RoutineProductScanner}
          />
        ) : null}
      </Modal>
    </View>
  );
}

function TodayHeader({
  activePeriod,
  insetTop,
  scheduledDate,
}: {
  activePeriod: RoutinePeriod;
  insetTop: number;
  scheduledDate?: string;
}) {
  const colors = RoutineColors;
  const { fontScale } = useWindowDimensions();
  const showAmbientDetails = fontScale < 1.4;
  const displayedDate = scheduledDate
    ? new Date(`${scheduledDate}T12:00:00`)
    : new Date();
  const dateLabel = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(displayedDate);

  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: colors.backgroundSelected,
          paddingTop: insetTop + 18,
        },
      ]}
    >
      {showAmbientDetails ? (
        <>
          <View
            accessible={false}
            style={[styles.headerArc, { borderColor: colors.separator }]}
          />
          <View
            accessible={false}
            style={[
              styles.headerHorizon,
              { backgroundColor: colors.separator },
            ]}
          />
          <View
            accessible={false}
            style={[styles.headerOrb, { backgroundColor: colors.sun }]}
          />
        </>
      ) : null}
      <View style={styles.headerCopy}>
        <Text
          maxFontSizeMultiplier={1.5}
          style={[styles.title, { color: colors.text }]}
        >
          Aujourd’hui
        </Text>
        <Text
          maxFontSizeMultiplier={1.8}
          style={[styles.headerDate, { color: colors.textSecondary }]}
        >
          {dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
        </Text>
      </View>
      {showAmbientDetails ? (
        <View style={styles.headerPeriodMark}>
          <AppSymbol
            name={activePeriod === 'morning' ? 'sun.max.fill' : 'moon.fill'}
            color={colors.tint}
            size={20}
          />
        </View>
      ) : null}
    </View>
  );
}

function RoutineSummary({ occurrence }: { occurrence: RoutineOccurrence }) {
  const colors = RoutineColors;
  const progress = getRoutineProgress(occurrence);

  return (
    <View style={styles.routineSummary}>
      <View style={styles.routineSummaryTopline}>
        <Text
          maxFontSizeMultiplier={1.6}
          style={[styles.routineTitle, { color: colors.text }]}
        >
          {occurrence.routine.name}
        </Text>
        <Text
          accessibilityLiveRegion="polite"
          maxFontSizeMultiplier={1.6}
          style={[styles.progressCount, { color: colors.textSecondary }]}
        >
          {progress.handled} sur {progress.total}
        </Text>
      </View>
      <Text
        maxFontSizeMultiplier={1.8}
        style={[styles.routineStatus, { color: colors.textSecondary }]}
      >
        {routineProgressLabel(progress)}
      </Text>
      {progress.total > 0 ? (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={`Progression de ${occurrence.routine.name}`}
          accessibilityValue={{
            min: 0,
            max: progress.total,
            now: progress.handled,
            text: `${progress.handled} sur ${progress.total} étapes`,
          }}
          style={[styles.progressTrack, { backgroundColor: colors.separator }]}
        >
          <AnimatedProgress
            color={progress.isComplete ? colors.success : colors.tint}
            value={progress.handled / progress.total}
          />
        </View>
      ) : null}
    </View>
  );
}

function AnimatedProgress({ color, value }: { color: string; value: number }) {
  const progress = useSharedValue(value);

  useEffect(() => {
    progress.value = withTiming(value, {
      duration: RoutineMotion.content,
      easing: ReanimatedEasing.out(ReanimatedEasing.poly(4)),
      reduceMotion: ReduceMotion.System,
    });
  }, [progress, value]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, progress.value)) * 100}%`,
  }));

  return (
    <Reanimated.View
      style={[styles.progressFill, { backgroundColor: color }, animatedStyle]}
    />
  );
}

function RoutineRow({
  category,
  instruction,
  isFirst,
  isPlaceholder,
  onLinkProduct,
  onStatusChange,
  productImageUrl,
  status,
  title,
}: {
  category: RoutineCategory;
  instruction: string | null;
  isFirst: boolean;
  isPlaceholder: boolean;
  onLinkProduct: () => void;
  onStatusChange: (status: DailyStepStatus | null) => void;
  productImageUrl?: string | null;
  status: DailyStepStatus | null;
  title: string;
}) {
  const colors = RoutineColors;
  const checkScale = useRef(new Animated.Value(1)).current;
  const previousStatus = useRef(status);
  const completed = status === 'completed';
  const skipped = status === 'skipped';
  const mainAction = completed ? null : 'completed';
  const secondaryAction = skipped ? null : 'skipped';

  useEffect(() => {
    const justCompleted =
      previousStatus.current !== 'completed' && status === 'completed';
    previousStatus.current = status;
    if (!justCompleted) return;

    let isMounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!isMounted || reduceMotion) return;
      checkScale.setValue(0.86);
      Animated.timing(checkScale, {
        duration: RoutineMotion.state,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }).start();
    });
    return () => {
      isMounted = false;
    };
  }, [checkScale, status]);

  return (
    <View
      style={[
        styles.routineRow,
        !isFirst && { borderTopColor: colors.separator, borderTopWidth: 1 },
      ]}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`${title}, ${stepStatusLabel(status)}`}
        accessibilityHint={
          completed
            ? 'Touchez pour annuler'
            : 'Touchez pour effectuer cette étape'
        }
        accessibilityState={{ checked: completed }}
        accessibilityValue={{ text: stepStatusLabel(status) }}
        onPress={() => onStatusChange(mainAction)}
        style={({ pressed }) => [
          styles.completeAction,
          { opacity: pressed ? 0.62 : 1 },
        ]}
      >
        <RoutineStepVisual
          category={category}
          imageUrl={productImageUrl}
          size={50}
        />
        <Animated.View
          style={[
            styles.checkControl,
            {
              backgroundColor: completed
                ? colors.success
                : colors.backgroundElement,
              borderColor: completed ? colors.success : colors.textSecondary,
              transform: [{ scale: checkScale }],
            },
          ]}
        >
          {completed ? (
            <AppSymbol name="checkmark" color={colors.onTint} size={15} />
          ) : skipped ? (
            <AppSymbol
              name="forward.fill"
              color={colors.textSecondary}
              size={12}
            />
          ) : null}
        </Animated.View>
      </Pressable>

      <View style={styles.stepCopy}>
        <Pressable
          accessible={false}
          onPress={() => onStatusChange(mainAction)}
          style={({ pressed }) => ({ opacity: pressed ? 0.62 : 1 })}
        >
          <Text
            maxFontSizeMultiplier={1.8}
            style={[
              styles.stepTitle,
              {
                color: completed ? colors.textSecondary : colors.text,
                textDecorationLine: completed ? 'line-through' : 'none',
              },
            ]}
          >
            {title}
          </Text>
          <Text style={[styles.stepMeta, { color: colors.textSecondary }]}>
            {isPlaceholder ? 'Étape sans produit' : category}
            {skipped ? ' · Ignorée aujourd’hui' : ''}
          </Text>
          {instruction ? (
            <Text style={[styles.instruction, { color: colors.textSecondary }]}>
              {instruction}
            </Text>
          ) : null}
        </Pressable>
        <View style={styles.stepActions}>
          {isPlaceholder ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Choisir un produit pour ${title}`}
              onPress={onLinkProduct}
              style={({ pressed }) => [
                styles.linkProductButton,
                {
                  backgroundColor: pressed
                    ? colors.backgroundSelected
                    : 'transparent',
                },
              ]}
            >
              <Text
                maxFontSizeMultiplier={1.6}
                style={[styles.linkProductText, { color: colors.tint }]}
              >
                Choisir un produit
              </Text>
              <AppSymbol name="chevron.right" color={colors.tint} size={12} />
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              skipped ? `Annuler ${title}` : `Ignorer ${title} aujourd’hui`
            }
            accessibilityHint={
              skipped
                ? 'Remet cette étape à faire'
                : 'Marque cette étape comme ignorée uniquement pour aujourd’hui'
            }
            onPress={() => onStatusChange(secondaryAction)}
            style={({ pressed }) => [
              styles.skipButton,
              {
                backgroundColor: pressed
                  ? colors.backgroundSelected
                  : 'transparent',
              },
            ]}
          >
            <Text
              maxFontSizeMultiplier={1.6}
              style={[styles.skipLabel, { color: colors.textSecondary }]}
            >
              {skipped ? 'Annuler' : 'Ignorer'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function EmptyRoutineDay() {
  const colors = RoutineColors;
  return (
    <View accessibilityLabel="Aucune étape prévue" style={styles.emptyState}>
      <AppSymbol name="checkmark.circle" color={colors.tint} size={24} />
      <View style={styles.emptyCopy}>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          Rien de prévu
        </Text>
        <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
          Cette routine n’a aucune étape active aujourd’hui.
        </Text>
      </View>
    </View>
  );
}

function MissingRoutine({
  onCreate,
  period,
}: {
  onCreate: () => void;
  period: RoutinePeriod;
}) {
  const colors = RoutineColors;
  const label = period === 'morning' ? 'matin' : 'soir';
  return (
    <View
      accessibilityLabel={`Routine du ${label} non créée`}
      style={[styles.missingRoutine, { borderColor: colors.separator }]}
    >
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        Une routine pour ce {label} ?
      </Text>
      <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
        Commence avec une étape, tu pourras l’ajuster ensuite.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onCreate}
        style={({ pressed }) => [
          styles.primaryButton,
          {
            backgroundColor: pressed ? colors.tintPressed : colors.tint,
          },
        ]}
      >
        <Text style={styles.primaryButtonText}>
          Créer la routine du {label}
        </Text>
      </Pressable>
    </View>
  );
}

export function TodaySupportSections({
  nextUsefulAction,
  sunProtectionStatus,
}: {
  nextUsefulAction?: ReactNode;
  sunProtectionStatus?: ReactNode;
} = {}) {
  if (!sunProtectionStatus && !nextUsefulAction) return null;

  return (
    <View style={styles.supportSections}>
      {sunProtectionStatus}
      {nextUsefulAction}
    </View>
  );
}

function LoadError({ error, onRetry }: { error: string; onRetry: () => void }) {
  const colors = RoutineColors;
  return (
    <View
      style={[
        styles.centered,
        { backgroundColor: colors.background, padding: 24 },
      ]}
    >
      <Text style={[styles.errorTitle, { color: colors.text }]}>
        Un instant.
      </Text>
      <Text style={[styles.errorBody, { color: colors.textSecondary }]}>
        {error}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [
          styles.retryButton,
          { backgroundColor: pressed ? colors.tintPressed : colors.tint },
        ]}
      >
        <Text style={styles.retryButtonText}>Réessayer</Text>
      </Pressable>
    </View>
  );
}

function stepStatusLabel(status: DailyStepStatus | null) {
  if (status === 'completed') return 'Effectuée';
  if (status === 'skipped') return 'Ignorée aujourd’hui';
  return 'À faire';
}

function routineProgressLabel(progress: ReturnType<typeof getRoutineProgress>) {
  if (progress.total === 0) return 'Aucune étape prévue aujourd’hui';
  if (progress.isComplete) return 'Routine terminée';
  if (progress.isResolved && progress.completed === 0) {
    return 'Routine ignorée aujourd’hui';
  }
  if (progress.isResolved) return 'Toutes les étapes sont renseignées';
  if (progress.handled === 0) {
    return `${progress.total} étape${progress.total > 1 ? 's' : ''} à faire`;
  }
  return `${progress.remaining} étape${progress.remaining > 1 ? 's' : ''} restante${
    progress.remaining > 1 ? 's' : ''
  }`;
}

function useReduceMotionPreference() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let isMounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (isMounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

function AppSymbol({
  name,
  color,
  size,
}: {
  name: SFSymbol;
  color: string;
  size: number;
}) {
  return (
    <SymbolView
      name={name}
      tintColor={color}
      size={size}
      weight="semibold"
      fallback={null}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 20, paddingBottom: 36 },
  periodContent: { gap: 20 },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  loadingText: { fontSize: 17 },
  header: {
    minHeight: 178,
    overflow: 'hidden',
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  headerArc: {
    borderRadius: 150,
    borderWidth: 1,
    bottom: -118,
    height: 260,
    position: 'absolute',
    right: -40,
    width: 260,
  },
  headerHorizon: {
    bottom: 45,
    height: StyleSheet.hairlineWidth,
    left: '52%',
    opacity: 0.82,
    position: 'absolute',
    right: 24,
  },
  headerOrb: {
    borderRadius: 5,
    bottom: 40,
    height: 10,
    opacity: 0.9,
    position: 'absolute',
    right: 67,
    width: 10,
  },
  headerCopy: { gap: 4 },
  title: {
    fontSize: 35,
    fontWeight: '700',
    letterSpacing: -0.9,
    lineHeight: 41,
  },
  headerDate: { fontSize: 16, lineHeight: 22 },
  headerPeriodMark: { bottom: 22, position: 'absolute', right: 24 },
  periodPicker: {
    borderRadius: 13,
    flexDirection: 'row',
    gap: 4,
    marginHorizontal: 24,
    padding: 4,
  },
  periodButton: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  periodLabel: { fontSize: 16, fontWeight: '700' },
  routineSummary: { gap: 7, paddingHorizontal: 24 },
  routineSummaryTopline: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  routineTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.45,
    lineHeight: 30,
  },
  progressCount: { fontSize: 15, fontWeight: '600', lineHeight: 22 },
  routineStatus: { fontSize: 15, lineHeight: 21 },
  progressTrack: {
    borderRadius: 2,
    height: 4,
    marginTop: 3,
    overflow: 'hidden',
  },
  progressFill: { borderRadius: 2, height: '100%' },
  routineList: {
    borderBottomWidth: 1,
    borderTopWidth: 1,
    marginHorizontal: 24,
  },
  routineRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    minHeight: 84,
    paddingVertical: 12,
  },
  completeAction: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    height: 62,
    justifyContent: 'flex-start',
    minWidth: 64,
    position: 'relative',
  },
  checkControl: {
    alignItems: 'center',
    bottom: 0,
    borderRadius: 12,
    borderWidth: 2,
    height: 26,
    justifyContent: 'center',
    position: 'absolute',
    right: 6,
    width: 26,
  },
  stepCopy: { flex: 1, gap: 2, paddingVertical: 2 },
  stepTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.12,
    lineHeight: 22,
  },
  stepMeta: { fontSize: 14, lineHeight: 19, marginTop: 1 },
  instruction: { fontSize: 14, lineHeight: 20, marginTop: 3 },
  linkProductButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 5,
    minHeight: 44,
    paddingHorizontal: 4,
  },
  linkProductText: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  stepActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    minHeight: 44,
  },
  skipButton: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    marginLeft: 'auto',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  skipLabel: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  emptyState: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 84,
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  emptyCopy: { flex: 1, gap: 3 },
  emptyTitle: { fontSize: 18, fontWeight: '700', lineHeight: 24 },
  emptyBody: { fontSize: 16, lineHeight: 22 },
  missingRoutine: {
    borderBottomWidth: 1,
    borderTopWidth: 1,
    gap: 6,
    marginHorizontal: 24,
    paddingVertical: 20,
  },
  primaryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 11,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 46,
    paddingHorizontal: 16,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  supportSections: { gap: 12, paddingHorizontal: 24 },
  manageButton: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 16,
  },
  manageButtonText: { fontSize: 16, fontWeight: '600' },
  inlineError: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 24,
    padding: 12,
  },
  inlineErrorText: { flex: 1, fontSize: 14, lineHeight: 20 },
  inlineRetry: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 4,
  },
  retryText: { fontSize: 15, fontWeight: '700' },
  errorTitle: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  errorBody: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
  retryButton: {
    borderRadius: 11,
    marginTop: 20,
    minHeight: 46,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  retryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
