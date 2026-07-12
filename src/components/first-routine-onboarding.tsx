import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { routineRepository } from '@/data/sqlite-routine-repository';
import type { RoutineOccurrence, RoutinePeriod } from '@/domain/routine';
import { Colors } from '@/constants/theme';

type Props = {
  onCreated: (occurrence: RoutineOccurrence) => void;
};

const DEFAULT_STEPS = ['Nettoyant', 'Hydratant'];

export function FirstRoutineOnboarding({ onCreated }: Props) {
  const colors = Colors;
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState<'welcome' | 'form'>('welcome');
  const [period, setPeriod] = useState<RoutinePeriod>('morning');
  const [steps, setSteps] = useState(DEFAULT_STEPS);
  const [newStep, setNewStep] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const routineName = useMemo(
    () => (period === 'morning' ? 'Routine du matin' : 'Routine du soir'),
    [period],
  );

  const addStep = () => {
    const title = newStep.trim();
    if (!title || steps.includes(title)) return;
    setSteps((current) => [...current, title]);
    setNewStep('');
  };

  const save = async () => {
    if (steps.length === 0) {
      Alert.alert(
        'Ajoute au moins une étape',
        'Ta routine peut rester très simple.',
      );
      return;
    }

    setIsSaving(true);
    try {
      onCreated(
        await routineRepository.createRoutine({
          name: routineName,
          period,
          stepTitles: steps,
        }),
      );
    } catch {
      Alert.alert(
        'Impossible d’enregistrer la routine',
        'Réessaie dans un instant. Tes étapes sont conservées ici.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (stage === 'welcome') {
    return (
      <View
        style={[
          styles.welcome,
          { backgroundColor: colors.background, paddingTop: insets.top + 32 },
        ]}
      >
        <View
          style={[
            styles.welcomeIcon,
            { backgroundColor: colors.backgroundSelected },
          ]}
        >
          <AppSymbol name="checklist" color={colors.tint} size={34} />
        </View>
        <View style={styles.welcomeCopy}>
          <Text style={[styles.welcomeTitle, { color: colors.text }]}>
            Ta routine, simplement.
          </Text>
          <Text style={[styles.welcomeBody, { color: colors.textSecondary }]}>
            Crée une première routine. Tu pourras l’ajuster et relier tes
            produits plus tard.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Créer ma première routine"
          onPress={() => setStage('form')}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.tint, opacity: pressed ? 0.88 : 1 },
          ]}
        >
          <Text style={styles.primaryButtonText}>Créer ma routine</Text>
          <AppSymbol name="arrow.right" color="#FFFFFF" size={20} />
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', default: undefined })}
      style={[styles.formScreen, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.formContent,
          { paddingTop: insets.top + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.formTitle, { color: colors.text }]}>
          Première routine
        </Text>
        <Text style={[styles.formBody, { color: colors.textSecondary }]}>
          Commence avec le moment qui compte le plus pour toi.
        </Text>

        <View style={styles.periodGroup} accessibilityRole="radiogroup">
          <PeriodButton
            label="Matin"
            icon="sun.max"
            selected={period === 'morning'}
            onPress={() => setPeriod('morning')}
          />
          <PeriodButton
            label="Soir"
            icon="moon.stars"
            selected={period === 'evening'}
            onPress={() => setPeriod('evening')}
          />
        </View>

        <View style={styles.stepsSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Les étapes
          </Text>
          <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
            Garde uniquement ce que tu veux suivre au quotidien.
          </Text>
          <View style={[styles.stepsList, { borderColor: colors.separator }]}>
            {steps.map((step, index) => (
              <View key={step} style={styles.stepRow}>
                <Text
                  style={[styles.stepNumber, { color: colors.textSecondary }]}
                >
                  {index + 1}
                </Text>
                <Text style={[styles.stepTitle, { color: colors.text }]}>
                  {step}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Retirer ${step}`}
                  hitSlop={8}
                  onPress={() =>
                    setSteps((current) =>
                      current.filter((item) => item !== step),
                    )
                  }
                >
                  <AppSymbol
                    name="minus.circle"
                    color={colors.textSecondary}
                    size={22}
                  />
                </Pressable>
              </View>
            ))}
          </View>

          <View style={styles.addStepRow}>
            <TextInput
              accessibilityLabel="Nouvelle étape"
              placeholder="Ajouter une étape"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="done"
              value={newStep}
              onChangeText={setNewStep}
              onSubmitEditing={addStep}
              style={[
                styles.textInput,
                { borderColor: colors.separator, color: colors.text },
              ]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ajouter l’étape"
              disabled={!newStep.trim()}
              onPress={addStep}
              style={({ pressed }) => [
                styles.addButton,
                {
                  backgroundColor: colors.backgroundSelected,
                  opacity: pressed || !newStep.trim() ? 0.5 : 1,
                },
              ]}
            >
              <AppSymbol name="plus" color={colors.tint} size={23} />
            </Pressable>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Enregistrer ${routineName}`}
          disabled={isSaving}
          onPress={save}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: colors.tint,
              opacity: pressed || isSaving ? 0.7 : 1,
            },
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {isSaving ? 'Enregistrement…' : 'Enregistrer la routine'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PeriodButton({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon: SFSymbol;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = Colors;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`Routine du ${label.toLowerCase()}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.periodButton,
        {
          backgroundColor: selected
            ? colors.backgroundSelected
            : colors.backgroundElement,
          borderColor: selected ? colors.tint : colors.separator,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <AppSymbol
        name={icon}
        color={selected ? colors.tint : colors.textSecondary}
        size={24}
      />
      <Text style={[styles.periodButtonText, { color: colors.text }]}>
        {label}
      </Text>
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
      weight="medium"
      fallback={null}
    />
  );
}

const styles = StyleSheet.create({
  welcome: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 24,
    paddingBottom: 32,
  },
  welcomeIcon: {
    alignItems: 'center',
    borderRadius: 16,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  welcomeCopy: { gap: 12, marginTop: 'auto', marginBottom: 40 },
  welcomeTitle: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.7,
    lineHeight: 40,
  },
  welcomeBody: { fontSize: 18, lineHeight: 26 },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  formScreen: { flex: 1 },
  formContent: { gap: 14, padding: 24, paddingBottom: 40 },
  formTitle: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.7,
    lineHeight: 40,
  },
  formBody: { fontSize: 17, lineHeight: 24, marginBottom: 16 },
  periodGroup: { flexDirection: 'row', gap: 12 },
  periodButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 64,
  },
  periodButtonText: { fontSize: 17, fontWeight: '600' },
  stepsSection: { gap: 8, marginTop: 24 },
  sectionTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.25 },
  sectionBody: { fontSize: 16, lineHeight: 22, marginBottom: 8 },
  stepsList: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stepRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 52,
  },
  stepNumber: { fontSize: 15, fontVariant: ['tabular-nums'], width: 18 },
  stepTitle: { flex: 1, fontSize: 17, fontWeight: '500' },
  addStepRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  textInput: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    fontSize: 17,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  addButton: {
    alignItems: 'center',
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
});
