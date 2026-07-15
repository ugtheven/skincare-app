import { Image } from 'expo-image';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { type ReactNode, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoutineProductScanner } from '@/app/products';
import { FirstRoutineOnboarding } from '@/components/first-routine-onboarding';
import { RoutineManager } from '@/components/routine-editor';
import { Colors } from '@/constants/theme';
import {
  deriveRoutineDayState,
  getRoutineProgress,
  type DailyStepStatus,
  type RoutineOccurrence,
  type RoutinePeriod,
} from '@/domain/routine';
import { useRoutine } from '@/hooks/use-routine';

const PERIODS: { label: string; period: RoutinePeriod; symbol: SFSymbol }[] = [
  { label: 'Matin', period: 'morning', symbol: 'sun.max.fill' },
  { label: 'Soir', period: 'evening', symbol: 'moon.fill' },
];

export default function HomeScreen() {
  const colors = Colors;
  const insets = useSafeAreaInsets();
  const [isManagingRoutines, setIsManagingRoutines] = useState(false);
  const {
    activePeriod,
    error,
    isLoading,
    occurrences,
    refresh,
    setActivePeriod,
    setStepStatus,
  } = useRoutine();

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
    if (error)
      return <LoadError error={error} onRetry={() => void refresh()} />;
    return (
      <FirstRoutineOnboarding
        onSaved={refresh}
        ProductScanner={RoutineProductScanner}
      />
    );
  }

  if (isManagingRoutines) {
    return (
      <RoutineManager
        onClose={() => setIsManagingRoutines(false)}
        onSaved={refresh}
        ProductScanner={RoutineProductScanner}
      />
    );
  }

  const occurrence = occurrences[activePeriod];
  const dayState = deriveRoutineDayState([
    occurrences.morning,
    occurrences.evening,
  ]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { paddingTop: insets.top + 24 }]}>
          <Image
            source={require('../../assets/images/today-header.png')}
            contentFit="cover"
            contentPosition="right center"
            style={StyleSheet.absoluteFill}
            accessible={false}
            accessibilityIgnoresInvertColors
          />
          <View
            style={[
              styles.headerOverlay,
              { backgroundColor: colors.imageOverlay },
            ]}
          />
          <Text style={[styles.title, { color: colors.text }]}>
            Aujourd’hui
          </Text>
          <Text style={[styles.dayStatus, { color: colors.textSecondary }]}>
            {dayStateLabel(dayState)}
          </Text>
          {occurrence ? <RoutineSummary occurrence={occurrence} /> : null}
        </View>

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
                onPress={() => setActivePeriod(period)}
                style={({ pressed }) => [
                  styles.periodButton,
                  {
                    backgroundColor: selected
                      ? colors.background
                      : 'transparent',
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                <AppSymbol
                  name={symbol}
                  color={selected ? colors.tint : colors.textSecondary}
                  size={18}
                />
                <Text
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
            >
              <Text style={[styles.retryText, { color: colors.tint }]}>
                Réessayer
              </Text>
            </Pressable>
          </View>
        ) : null}

        {occurrence ? (
          <View
            accessibilityLabel={occurrence.routine.name}
            style={styles.routineList}
          >
            {occurrence.steps.length > 0 ? (
              occurrence.steps.map((step) => (
                <RoutineRow
                  key={step.id}
                  category={step.category}
                  instruction={step.instruction}
                  isPlaceholder={!step.productId}
                  status={step.status}
                  title={step.title}
                  onStatusChange={(status) =>
                    void setStepStatus(activePeriod, step.id, status)
                  }
                />
              ))
            ) : (
              <EmptyRoutineDay period={activePeriod} />
            )}
          </View>
        ) : (
          <MissingRoutine period={activePeriod} />
        )}

        <TodaySupportSections />

        <Pressable
          accessibilityRole="button"
          accessibilityHint="Permet de créer, modifier ou réordonner les étapes"
          onPress={() => setIsManagingRoutines(true)}
          style={({ pressed }) => [
            styles.manageButton,
            {
              backgroundColor: colors.backgroundSelected,
              opacity: pressed ? 0.78 : 1,
            },
          ]}
        >
          <AppSymbol name="slider.horizontal.3" color={colors.tint} size={20} />
          <Text style={[styles.manageButtonText, { color: colors.tint }]}>
            Modifier mes routines
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function RoutineSummary({ occurrence }: { occurrence: RoutineOccurrence }) {
  const colors = Colors;
  const progress = getRoutineProgress(occurrence);
  const scheduledLabel = new Date(
    `${occurrence.scheduledDate}T12:00:00`,
  ).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <View style={styles.routineSummary}>
      <Text style={[styles.routineTitle, { color: colors.text }]}>
        {occurrence.routine.name}
      </Text>
      <Text style={[styles.routineDate, { color: colors.textSecondary }]}>
        Prévue {scheduledLabel}
      </Text>
      <Text
        accessibilityLiveRegion="polite"
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
            text: `${progress.handled} étape${progress.handled > 1 ? 's' : ''} renseignée${progress.handled > 1 ? 's' : ''} sur ${progress.total}`,
          }}
          style={[styles.progressTrack, { backgroundColor: colors.separator }]}
        >
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.tint,
                width: `${(progress.handled / progress.total) * 100}%`,
              },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

function RoutineRow({
  category,
  instruction,
  isPlaceholder,
  onStatusChange,
  status,
  title,
}: {
  category: string;
  instruction: string | null;
  isPlaceholder: boolean;
  onStatusChange: (status: DailyStepStatus | null) => void;
  status: DailyStepStatus | null;
  title: string;
}) {
  const colors = Colors;
  const completed = status === 'completed';
  const skipped = status === 'skipped';
  const mainAction = completed ? null : 'completed';
  const secondaryAction = skipped ? null : 'skipped';

  return (
    <View
      style={[
        styles.routineRow,
        {
          backgroundColor: completed
            ? colors.backgroundSelected
            : colors.backgroundElement,
          borderColor: completed ? colors.tint : colors.separator,
        },
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
          styles.routineMainAction,
          { opacity: pressed ? 0.72 : 1 },
        ]}
      >
        <View
          style={[
            styles.checkControl,
            {
              borderColor: completed ? colors.success : colors.textSecondary,
              backgroundColor: completed ? colors.success : 'transparent',
            },
          ]}
        >
          {completed ? (
            <AppSymbol name="checkmark" color={colors.onTint} size={16} />
          ) : skipped ? (
            <AppSymbol
              name="forward.fill"
              color={colors.textSecondary}
              size={13}
            />
          ) : null}
        </View>
        <View style={styles.stepCopy}>
          <Text style={[styles.stepTitle, { color: colors.text }]}>
            {title}
          </Text>
          <Text style={[styles.stepMeta, { color: colors.textSecondary }]}>
            {isPlaceholder ? `${category} · sans produit` : category}
          </Text>
          {instruction ? (
            <Text style={[styles.instruction, { color: colors.textSecondary }]}>
              {instruction}
            </Text>
          ) : null}
          <Text
            style={[
              styles.stepStatus,
              {
                color: completed
                  ? colors.success
                  : skipped
                    ? colors.textSecondary
                    : colors.tint,
              },
            ]}
          >
            {stepStatusLabel(status)}
          </Text>
        </View>
      </Pressable>
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
            backgroundColor: skipped
              ? colors.backgroundSelected
              : colors.background,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <AppSymbol
          name={skipped ? 'arrow.uturn.backward' : 'forward.fill'}
          color={colors.textSecondary}
          size={15}
        />
        <Text style={[styles.skipLabel, { color: colors.textSecondary }]}>
          {skipped ? 'Annuler' : 'Ignorer'}
        </Text>
      </Pressable>
    </View>
  );
}

function EmptyRoutineDay({ period }: { period: RoutinePeriod }) {
  const colors = Colors;
  return (
    <View
      accessibilityLabel={`Aucune étape prévue pour la routine du ${period === 'morning' ? 'matin' : 'soir'}`}
      style={[styles.emptyState, { backgroundColor: colors.backgroundElement }]}
    >
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

function MissingRoutine({ period }: { period: RoutinePeriod }) {
  const colors = Colors;
  return (
    <View
      accessibilityLabel={`Routine du ${period === 'morning' ? 'matin' : 'soir'} non créée`}
      style={[
        styles.missingRoutine,
        { backgroundColor: colors.backgroundElement },
      ]}
    >
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        Routine non créée
      </Text>
      <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
        Tu peux l’ajouter depuis « Modifier mes routines ».
      </Text>
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
  const colors = Colors;
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
          { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
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
  if (progress.isComplete) return 'Toutes les étapes sont effectuées';
  if (progress.isResolved && progress.completed === 0) {
    return 'Routine ignorée aujourd’hui';
  }
  if (progress.isResolved) return 'Toutes les étapes sont renseignées';

  const details = [
    progress.completed > 0
      ? `${progress.completed} effectuée${progress.completed > 1 ? 's' : ''}`
      : null,
    progress.skipped > 0
      ? `${progress.skipped} ignorée${progress.skipped > 1 ? 's' : ''}`
      : null,
    `${progress.remaining} à faire`,
  ].filter(Boolean);
  return details.join(' · ');
}

function dayStateLabel(
  state: ReturnType<typeof deriveRoutineDayState>,
): string {
  switch (state) {
    case 'completed':
      return 'Toutes les étapes prévues sont effectuées';
    case 'partially_completed':
      return 'Routine commencée aujourd’hui';
    case 'deliberately_skipped':
      return 'Étapes prévues ignorées aujourd’hui';
    case 'not_scheduled':
      return 'Aucune étape prévue aujourd’hui';
    default:
      return 'Prête quand tu l’es';
  }
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
  content: { gap: 16, paddingBottom: 32 },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  loadingText: { fontSize: 17 },
  header: {
    minHeight: 300,
    overflow: 'hidden',
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  headerOverlay: { ...StyleSheet.absoluteFillObject },
  title: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.7,
    lineHeight: 40,
  },
  dayStatus: { fontSize: 15, lineHeight: 21, marginTop: 4 },
  routineSummary: { gap: 5, marginTop: 'auto', paddingTop: 40 },
  routineTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  routineDate: { fontSize: 16, textTransform: 'capitalize' },
  routineStatus: { fontSize: 17, lineHeight: 23, marginTop: 3 },
  progressTrack: {
    borderRadius: 4,
    height: 7,
    marginTop: 9,
    overflow: 'hidden',
  },
  progressFill: { borderRadius: 4, height: '100%' },
  periodPicker: {
    borderRadius: 12,
    flexDirection: 'row',
    gap: 4,
    marginHorizontal: 24,
    padding: 4,
  },
  periodButton: {
    alignItems: 'center',
    borderRadius: 9,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  periodLabel: { fontSize: 16, fontWeight: '700' },
  routineList: { gap: 8, paddingHorizontal: 24 },
  routineRow: {
    alignItems: 'stretch',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 80,
    overflow: 'hidden',
  },
  routineMainAction: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 80,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  checkControl: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 2,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  stepCopy: { flex: 1, gap: 2 },
  stepTitle: { fontSize: 18, fontWeight: '600', letterSpacing: -0.15 },
  stepMeta: { fontSize: 14, lineHeight: 19 },
  instruction: { fontSize: 15, lineHeight: 21, marginTop: 3 },
  stepStatus: { fontSize: 15, fontWeight: '600', lineHeight: 20, marginTop: 3 },
  skipButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'column',
    gap: 3,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 76,
    paddingHorizontal: 8,
  },
  skipLabel: { fontSize: 13, fontWeight: '600', lineHeight: 17 },
  emptyState: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 12,
    minHeight: 72,
    padding: 16,
  },
  emptyCopy: { flex: 1, gap: 3 },
  emptyTitle: { fontSize: 17, fontWeight: '700', lineHeight: 23 },
  emptyBody: { fontSize: 16, lineHeight: 22 },
  missingRoutine: {
    borderRadius: 12,
    gap: 4,
    marginHorizontal: 24,
    minHeight: 88,
    padding: 16,
  },
  supportSections: { gap: 12, paddingHorizontal: 24 },
  manageButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginHorizontal: 24,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  manageButtonText: { fontSize: 17, fontWeight: '700' },
  inlineError: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginHorizontal: 24,
    minHeight: 52,
    padding: 14,
  },
  inlineErrorText: { flex: 1, fontSize: 15, lineHeight: 20 },
  retryText: { fontSize: 15, fontWeight: '700' },
  errorTitle: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
  errorBody: {
    fontSize: 17,
    lineHeight: 24,
    marginBottom: 24,
    textAlign: 'center',
  },
  retryButton: {
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 20,
  },
  retryButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});
