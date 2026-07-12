import { Image } from 'expo-image';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FirstRoutineOnboarding } from '@/components/first-routine-onboarding';
import { Colors } from '@/constants/theme';
import { getRoutineProgress } from '@/domain/routine';
import { useRoutine } from '@/hooks/use-routine';

export default function HomeScreen() {
  const colors = Colors;
  const insets = useSafeAreaInsets();
  const { occurrence, isLoading, error, refresh, setOccurrence, toggleStep } =
    useRoutine();

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Préparation de ta routine…
        </Text>
      </View>
    );
  }

  if (!occurrence) {
    if (error)
      return <LoadError error={error} onRetry={() => void refresh()} />;
    return <FirstRoutineOnboarding onCreated={setOccurrence} />;
  }

  const progress = getRoutineProgress(occurrence);
  const scheduledLabel = new Date(
    `${occurrence.scheduledDate}T12:00:00`,
  ).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { paddingTop: insets.top + 28 }]}>
          <Image
            source={require('@/assets/images/today-header.png')}
            contentFit="cover"
            contentPosition="right center"
            style={StyleSheet.absoluteFill}
            accessible={false}
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
          <View style={styles.routineSummary}>
            <Text style={[styles.routineTitle, { color: colors.text }]}>
              {occurrence.routine.name}
            </Text>
            <Text style={[styles.routineDate, { color: colors.textSecondary }]}>
              Prévue {scheduledLabel}
            </Text>
            <Text
              style={[styles.routineStatus, { color: colors.textSecondary }]}
            >
              {progress.isComplete
                ? 'Routine terminée'
                : `${progress.completed} terminée${progress.completed > 1 ? 's' : ''} · ${progress.total - progress.completed} à faire`}
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
                    width: `${(progress.completed / progress.total) * 100}%`,
                  },
                ]}
              />
            </View>
          </View>
        </View>

        {error ? (
          <View
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
              onPress={() => void refresh()}
            >
              <Text style={[styles.retryText, { color: colors.tint }]}>
                Réessayer
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.routineList}>
          {occurrence.steps.map((step) => (
            <RoutineRow
              key={step.id}
              title={step.title}
              completed={step.completed}
              onPress={() => void toggleStep(step.id)}
            />
          ))}
        </View>
      </ScrollView>
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

function RoutineRow({
  title,
  completed,
  onPress,
}: {
  title: string;
  completed: boolean;
  onPress: () => void;
}) {
  const colors = Colors;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={`${title}, ${completed ? 'terminée' : 'à faire'}`}
      accessibilityHint="Touchez pour modifier l’état de cette étape"
      accessibilityState={{ checked: completed }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.routineRow,
        {
          backgroundColor: completed
            ? colors.backgroundSelected
            : colors.backgroundElement,
          borderColor: completed ? colors.tint : colors.separator,
          opacity: pressed ? 0.84 : 1,
        },
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
          <AppSymbol name="checkmark" color="#FFFFFF" size={16} />
        ) : null}
      </View>
      <View style={styles.stepCopy}>
        <Text style={[styles.stepTitle, { color: colors.text }]}>{title}</Text>
        <Text
          style={[
            styles.stepStatus,
            { color: completed ? colors.success : colors.textSecondary },
          ]}
        >
          {completed ? 'Terminée' : 'À faire'}
        </Text>
      </View>
    </Pressable>
  );
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
  routineSummary: { gap: 6, marginTop: 'auto' },
  routineTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  routineDate: { fontSize: 16, textTransform: 'capitalize' },
  routineStatus: { fontSize: 17, marginTop: 4 },
  progressTrack: {
    borderRadius: 4,
    height: 7,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: { borderRadius: 4, height: '100%' },
  routineList: { gap: 8, paddingHorizontal: 24 },
  routineRow: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 14,
    minHeight: 72,
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
  stepCopy: { flex: 1, gap: 4 },
  stepTitle: { fontSize: 18, fontWeight: '600', letterSpacing: -0.15 },
  stepStatus: { fontSize: 16, fontWeight: '500' },
  inlineError: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginHorizontal: 24,
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
    minHeight: 48,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  retryButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});
