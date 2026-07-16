import * as Haptics from 'expo-haptics';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import {
  useCallback,
  useEffect,
  forwardRef,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ComponentType,
} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  findNodeHandle,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  type TextProps,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing as ReanimatedEasing,
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { RoutineStepVisual } from '@/components/routine-step-visual';
import { RoutineColors, RoutineMotion } from '@/constants/theme';
import { productRepository } from '@/data/sqlite-product-repository';
import type { RoutineStepInput } from '@/data/routine-repository';
import { routineRepository } from '@/data/sqlite-routine-repository';
import type { Product } from '@/domain/product';
import {
  ROUTINE_CATEGORIES,
  allWeekdays,
  formatLocalDate,
  nextLocalDate,
  routineCategoryForProduct,
  routineNameForPeriod,
  suggestedRoutineInsertionIndex,
  type RoutineCategory,
  type RoutineDefinition,
  type RoutinePeriod,
  type Weekday,
} from '@/domain/routine';

type RoutineDefinitions = Record<RoutinePeriod, RoutineDefinition | null>;

type DraftStep = RoutineStepInput & {
  draftId: string;
  productImageUrl?: string | null;
};

export type RoutineManagerProps = {
  initialEffectiveFromDate?: string;
  initialPeriod?: RoutinePeriod;
  initialProductTargetStepId?: string | null;
  onboarding?: boolean;
  onBrowseProducts?: () => void;
  onClose?: () => void;
  onSaved: () => void | Promise<void>;
  ProductScanner?: ComponentType<RoutineProductScannerProps>;
};

export type RoutineProductScannerProps = {
  origin: {
    kind: 'routine-editor';
    routineId: string | null;
    routinePeriod: RoutinePeriod;
  };
  onClose: () => void;
  onProductSelected: (product: Product) => void;
};

const PERIODS: RoutinePeriod[] = ['morning', 'evening'];
const WEEKDAYS: { label: string; short: string; value: Weekday }[] = [
  { label: 'Lundi', short: 'L', value: 1 },
  { label: 'Mardi', short: 'M', value: 2 },
  { label: 'Mercredi', short: 'M', value: 3 },
  { label: 'Jeudi', short: 'J', value: 4 },
  { label: 'Vendredi', short: 'V', value: 5 },
  { label: 'Samedi', short: 'S', value: 6 },
  { label: 'Dimanche', short: 'D', value: 0 },
];
const WEEKDAY_DEFAULT: Weekday[] = [1, 2, 3, 4, 5];
const MAX_INSTRUCTION_LENGTH = 120;
const SUBVIEW_ENTERING = FadeIn.duration(RoutineMotion.state)
  .easing(ReanimatedEasing.out(ReanimatedEasing.poly(4)))
  .reduceMotion(ReduceMotion.System);
const DRAG_LIFT_DURATION = RoutineMotion.quick;
const DRAG_MOVE_DURATION = RoutineMotion.state;

const Text = forwardRef<ComponentRef<typeof NativeText>, TextProps>(
  function ScaledText(props, ref) {
    return <NativeText ref={ref} {...props} />;
  },
);

let draftSequence = 0;

function newDraftId() {
  draftSequence += 1;
  return `draft-${draftSequence}`;
}

function definitionSteps(definition: RoutineDefinition | null): DraftStep[] {
  return (definition?.steps ?? []).map((step) => ({
    draftId: step.id,
    productId: step.productId,
    productImageUrl: step.productImageUrl ?? null,
    title: step.title,
    category: step.category,
    instruction: step.instruction,
    position: step.position,
    isActive: step.isActive,
    selectedWeekdays: step.selectedWeekdays,
  }));
}

function scheduleLabel(step: RoutineStepInput): string {
  if (step.isActive === false) return 'Désactivée';
  const days = step.selectedWeekdays ?? allWeekdays();
  if (days.length === 7) return 'Tous les jours';

  return WEEKDAYS.filter((day) => days.includes(day.value))
    .map((day) => day.label.slice(0, 3).toLocaleLowerCase('fr-FR'))
    .join(' · ');
}

function serializeDraft(steps: DraftStep[]) {
  return JSON.stringify(
    steps.map(
      (
        { draftId: _draftId, productImageUrl: _productImageUrl, ...step },
        position,
      ) => ({
        ...step,
        instruction: step.instruction?.trim() || null,
        position,
        selectedWeekdays: [...(step.selectedWeekdays ?? allWeekdays())].sort(),
      }),
    ),
  );
}

function dragDestinationIndex(
  steps: DraftStep[],
  rowHeights: Record<string, number>,
  sourceIndex: number,
  translationY: number,
) {
  const sourceStep = steps[sourceIndex];
  if (!sourceStep || translationY === 0) return sourceIndex;

  const heightAt = (index: number) => rowHeights[steps[index]?.draftId] ?? 88;
  const sourceHeight = heightAt(sourceIndex);
  const distance = Math.abs(translationY);
  const direction = translationY > 0 ? 1 : -1;
  let destination = sourceIndex;
  let crossedDistance = 0;

  for (
    let candidate = sourceIndex + direction;
    candidate >= 0 && candidate < steps.length;
    candidate += direction
  ) {
    const candidateHeight = heightAt(candidate);
    const threshold = crossedDistance + (sourceHeight + candidateHeight) / 2;
    if (distance < threshold) break;
    destination = candidate;
    crossedDistance += candidateHeight;
  }

  return destination;
}

function dragPreviewOffset(
  steps: DraftStep[],
  rowHeights: Record<string, number>,
  sourceIndex: number,
  destinationIndex: number,
) {
  if (sourceIndex === destinationIndex) return 0;
  const heightAt = (index: number) => rowHeights[steps[index]?.draftId] ?? 88;
  if (destinationIndex > sourceIndex) {
    return Array.from({ length: destinationIndex - sourceIndex }, (_, offset) =>
      heightAt(sourceIndex + offset + 1),
    ).reduce((total, height) => total + height, 0);
  }
  return -Array.from({ length: sourceIndex - destinationIndex }, (_, offset) =>
    heightAt(destinationIndex + offset),
  ).reduce((total, height) => total + height, 0);
}

function rowPreviewOffset(
  index: number,
  sourceIndex: number,
  destinationIndex: number,
  sourceHeight: number,
) {
  if (
    destinationIndex > sourceIndex &&
    index > sourceIndex &&
    index <= destinationIndex
  ) {
    return -sourceHeight;
  }
  if (
    destinationIndex < sourceIndex &&
    index >= destinationIndex &&
    index < sourceIndex
  ) {
    return sourceHeight;
  }
  return 0;
}

export function RoutineManager({
  initialEffectiveFromDate,
  initialPeriod,
  initialProductTargetStepId = null,
  onboarding,
  onBrowseProducts,
  onClose,
  onSaved,
  ProductScanner,
}: RoutineManagerProps) {
  const colors = RoutineColors;
  const insets = useSafeAreaInsets();
  const [definitions, setDefinitions] = useState<RoutineDefinitions>({
    morning: null,
    evening: null,
  });
  const [editingPeriod, setEditingPeriod] = useState<RoutinePeriod | null>(
    initialPeriod ?? null,
  );
  const [pendingProductTargetStepId, setPendingProductTargetStepId] = useState(
    initialProductTargetStepId,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const [morning, evening] = await Promise.all(
        PERIODS.map((period) =>
          routineRepository.getRoutineForEditing(
            period,
            period === initialPeriod ? initialEffectiveFromDate : undefined,
          ),
        ),
      );
      setDefinitions({ morning, evening });
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [initialEffectiveFromDate, initialPeriod]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (
      !isLoading &&
      !loadError &&
      editingPeriod &&
      pendingProductTargetStepId
    ) {
      setPendingProductTargetStepId(null);
    }
  }, [editingPeriod, isLoading, loadError, pendingProductTargetStepId]);

  if (editingPeriod && !isLoading && !loadError) {
    return (
      <RoutineEditor
        contextual={Boolean(initialPeriod && onClose)}
        definition={definitions[editingPeriod]}
        effectiveFromDate={initialEffectiveFromDate}
        initialProductTargetStepId={pendingProductTargetStepId}
        onBrowseProducts={onBrowseProducts}
        period={editingPeriod}
        ProductScanner={ProductScanner}
        onBack={() => {
          if (initialPeriod && onClose) {
            onClose();
            return;
          }
          setEditingPeriod(null);
        }}
        onSaved={async () => {
          if (initialPeriod && onClose) {
            await onSaved();
            onClose();
            return;
          }
          setEditingPeriod(null);
          await load();
          await onSaved();
        }}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.managerContent,
          {
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + 32,
          },
        ]}
      >
        <View style={styles.managerHeader}>
          <View style={styles.headerCopy}>
            <Text
              maxFontSizeMultiplier={1.5}
              style={[styles.largeTitle, { color: colors.text }]}
            >
              {onboarding
                ? 'Créer ta routine'
                : initialPeriod
                  ? routineNameForPeriod(initialPeriod)
                  : 'Mes routines'}
            </Text>
            <Text style={[styles.intro, { color: colors.textSecondary }]}>
              {initialPeriod
                ? 'Préparation de la routine…'
                : 'Ajoute des catégories ou relie les produits que tu utilises.'}
            </Text>
          </View>
          {onClose ? (
            <IconButton
              accessibilityLabel="Fermer l’éditeur de routines"
              icon="xmark"
              onPress={onClose}
            />
          ) : null}
        </View>

        {isLoading ? (
          <View accessibilityLiveRegion="polite" style={styles.loadingState}>
            <ActivityIndicator color={colors.tint} />
            <Text style={[styles.stateText, { color: colors.textSecondary }]}>
              Chargement des routines…
            </Text>
          </View>
        ) : loadError ? (
          <View style={styles.loadError}>
            <Text style={[styles.stateText, { color: colors.text }]}>
              Les routines ne peuvent pas être chargées.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void load()}
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  backgroundColor: colors.backgroundSelected,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text
                style={[styles.secondaryButtonText, { color: colors.tint }]}
              >
                Réessayer
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.periodList, { borderColor: colors.separator }]}>
            {PERIODS.map((period, index) => {
              const definition = definitions[period];
              const name = routineNameForPeriod(period);
              return (
                <Pressable
                  key={period}
                  accessibilityRole="button"
                  accessibilityLabel={`${definition ? 'Modifier' : 'Créer'} ${name}`}
                  accessibilityHint="Ouvre l’éditeur de cette routine"
                  onPress={() => setEditingPeriod(period)}
                  style={({ pressed }) => [
                    styles.periodRow,
                    index > 0 && {
                      borderTopColor: colors.separator,
                      borderTopWidth: StyleSheet.hairlineWidth,
                    },
                    { opacity: pressed ? 0.72 : 1 },
                  ]}
                >
                  <View
                    style={[
                      styles.periodIcon,
                      { backgroundColor: colors.backgroundSelected },
                    ]}
                  >
                    <AppSymbol
                      name={period === 'morning' ? 'sun.max' : 'moon.stars'}
                      color={colors.tint}
                      size={23}
                    />
                  </View>
                  <View style={styles.periodCopy}>
                    <Text
                      maxFontSizeMultiplier={1.8}
                      style={[styles.periodTitle, { color: colors.text }]}
                    >
                      {name}
                    </Text>
                    <Text
                      style={[
                        styles.periodMeta,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {definition
                        ? `${definition.steps.length} étape${definition.steps.length > 1 ? 's' : ''}`
                        : 'Pas encore créée'}
                    </Text>
                  </View>
                  <Text
                    maxFontSizeMultiplier={1.6}
                    style={[styles.rowAction, { color: colors.tint }]}
                  >
                    {definition ? 'Modifier' : 'Créer'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function RoutineEditor({
  contextual,
  definition,
  effectiveFromDate,
  initialProductTargetStepId,
  onBrowseProducts,
  period,
  onBack,
  onSaved,
  ProductScanner,
}: {
  contextual: boolean;
  definition: RoutineDefinition | null;
  effectiveFromDate?: string;
  initialProductTargetStepId?: string | null;
  onBrowseProducts?: () => void;
  period: RoutinePeriod;
  onBack: () => void;
  onSaved: () => void | Promise<void>;
  ProductScanner?: ComponentType<RoutineProductScannerProps>;
}) {
  const colors = RoutineColors;
  const insets = useSafeAreaInsets();
  const initialSteps = useMemo(() => definitionSteps(definition), [definition]);
  const [steps, setSteps] = useState<DraftStep[]>(initialSteps);
  const [subview, setSubview] = useState<
    'list' | 'add' | 'category' | 'step' | 'product' | 'scanner'
  >(initialProductTargetStepId ? 'product' : 'list');
  const [configuredStepId, setConfiguredStepId] = useState<string | null>(null);
  const [productTargetStepId, setProductTargetStepId] = useState<string | null>(
    initialProductTargetStepId ?? null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPreview, setDragPreview] = useState<{
    destinationIndex: number;
    sourceIndex: number;
  } | null>(null);
  const dragPreviewRef = useRef(dragPreview);
  const editorScrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const navigationTitleRef = useRef<ComponentRef<typeof NativeText>>(null);
  const rowHeightsRef = useRef<Record<string, number>>({});
  const name = routineNameForPeriod(period);
  const isDirty = serializeDraft(steps) !== serializeDraft(initialSteps);
  const isClean = Boolean(definition && !isDirty);
  const saveDisabled = isSaving || isClean;

  const navigationTitle =
    subview === 'add'
      ? 'Ajouter une étape'
      : subview === 'category'
        ? 'Étape sans produit'
        : subview === 'product'
          ? 'Choisir un produit'
          : subview === 'step'
            ? steps.find((step) => step.draftId === configuredStepId)?.category
            : contextual
              ? name
              : 'Modifier';

  useEffect(() => {
    editorScrollRef.current?.scrollTo({ animated: false, y: 0 });
    const node = findNodeHandle(navigationTitleRef.current);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, [subview]);

  const back = () => {
    if (subview !== 'list') {
      const nextSubview =
        subview === 'category'
          ? 'add'
          : subview === 'product'
            ? configuredStepId === productTargetStepId
              ? 'step'
              : productTargetStepId
                ? 'list'
                : 'add'
            : 'list';
      setSubview(nextSubview);
      if (nextSubview === 'list') {
        setConfiguredStepId(null);
        setProductTargetStepId(null);
      }
      return;
    }
    if (!isDirty) {
      onBack();
      return;
    }
    Alert.alert(
      'Abandonner les modifications ?',
      'Les changements non enregistrés seront perdus.',
      [
        { text: 'Continuer l’édition', style: 'cancel' },
        { text: 'Abandonner', style: 'destructive', onPress: onBack },
      ],
    );
  };

  const updateStep = (draftId: string, update: Partial<DraftStep>) => {
    setSteps((current) =>
      current.map((step) =>
        step.draftId === draftId ? { ...step, ...update } : step,
      ),
    );
  };

  const addCategory = (category: RoutineCategory) => {
    setSteps((current) => [
      ...current,
      {
        draftId: newDraftId(),
        productId: null,
        title: category,
        category,
        instruction: null,
        position: current.length,
        isActive: true,
        selectedWeekdays: allWeekdays(),
      },
    ]);
    setSubview('list');
    void Haptics.selectionAsync().catch(() => undefined);
    void AccessibilityInfo.announceForAccessibility(`${category} ajoutée.`);
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= steps.length) return;
    const movedStep = steps[index];
    setSteps((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next.map((step, position) => ({ ...step, position }));
    });
    void AccessibilityInfo.announceForAccessibility(
      `${movedStep.category} déplacée en position ${destination + 1}.`,
    );
    void Haptics.selectionAsync().catch(() => undefined);
  };

  const reorderStep = (sourceIndex: number, translationY: number) => {
    setIsDragging(false);
    dragPreviewRef.current = null;
    setDragPreview(null);
    const sourceStep = steps[sourceIndex];
    if (!sourceStep) return;
    const destination = dragDestinationIndex(
      steps,
      rowHeightsRef.current,
      sourceIndex,
      translationY,
    );

    if (destination === sourceIndex) return;
    setSteps((current) => {
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(destination, 0, moved);
      return next.map((step, position) => ({ ...step, position }));
    });
    void AccessibilityInfo.announceForAccessibility(
      `${sourceStep.category} déplacée en position ${destination + 1}.`,
    );
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
      () => undefined,
    );
  };

  const previewStepDestination = (
    sourceIndex: number,
    translationY: number,
  ) => {
    const destinationIndex = dragDestinationIndex(
      steps,
      rowHeightsRef.current,
      sourceIndex,
      translationY,
    );
    const current = dragPreviewRef.current;
    if (
      current?.sourceIndex === sourceIndex &&
      current.destinationIndex === destinationIndex
    ) {
      return;
    }
    const nextPreview = { sourceIndex, destinationIndex };
    dragPreviewRef.current = nextPreview;
    setDragPreview(nextPreview);
    void Haptics.selectionAsync().catch(() => undefined);
  };

  const cancelStepDrag = () => {
    setIsDragging(false);
    dragPreviewRef.current = null;
    setDragPreview(null);
  };

  const startStepDrag = (index: number) => {
    const preview = { destinationIndex: index, sourceIndex: index };
    setIsDragging(true);
    dragPreviewRef.current = preview;
    setDragPreview(preview);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
      () => undefined,
    );
  };

  const removeStep = (step: DraftStep) => {
    Alert.alert(
      `Supprimer « ${step.category} » ?`,
      contextual
        ? 'Cette étape sera retirée de la routine à partir d’aujourd’hui.'
        : 'Cette étape sera retirée de la prochaine version de la routine.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            setSteps((current) =>
              current.filter((item) => item.draftId !== step.draftId),
            );
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
              () => undefined,
            );
          },
        },
      ],
    );
  };

  const openProductPicker = (targetStepId: string | null = null) => {
    setProductTargetStepId(targetStepId);
    setSubview('product');
  };

  const linkProduct = (product: Product) => {
    const category = routineCategoryForProduct(product.category);
    const targetIndex = steps.findIndex(
      (step) => step.draftId === productTargetStepId,
    );
    const compatibleIndex = steps.findIndex(
      (step) => !step.productId && step.category === category,
    );
    const replacementIndex =
      targetIndex >= 0
        ? targetIndex
        : productTargetStepId
          ? -1
          : compatibleIndex;
    const next = [...steps];

    if (replacementIndex >= 0) {
      const stepWithoutProduct = next[replacementIndex];
      next[replacementIndex] = {
        ...stepWithoutProduct,
        category,
        productId: product.id,
        productImageUrl: product.imageUrl,
        title: product.name,
      };
      setSteps(next.map((step, position) => ({ ...step, position })));
      setProductTargetStepId(null);
      setSubview(
        configuredStepId === stepWithoutProduct.draftId ? 'step' : 'list',
      );
      void Haptics.selectionAsync().catch(() => undefined);
      void AccessibilityInfo.announceForAccessibility(
        `${product.name} associé à l’étape ${category}. Planning conservé.`,
      );
      return;
    } else {
      const configuredId = newDraftId();
      const insertionIndex = suggestedRoutineInsertionIndex(next, category);
      next.splice(insertionIndex, 0, {
        draftId: configuredId,
        productId: product.id,
        productImageUrl: product.imageUrl,
        title: product.name,
        category,
        instruction: null,
        position: insertionIndex,
        isActive: true,
        selectedWeekdays: allWeekdays(),
      });
      setSteps(next.map((step, position) => ({ ...step, position })));
      setProductTargetStepId(null);
      setConfiguredStepId(configuredId);
      setSubview('step');
      void Haptics.selectionAsync().catch(() => undefined);
      void AccessibilityInfo.announceForAccessibility(
        `${product.name} ajouté. Choisis son planning.`,
      );
    }
  };

  const unlinkProduct = (draftId: string) => {
    const step = steps.find((item) => item.draftId === draftId);
    if (!step?.productId) return;
    updateStep(draftId, {
      productId: null,
      productImageUrl: null,
      title: step.category,
    });
    void Haptics.selectionAsync().catch(() => undefined);
    void AccessibilityInfo.announceForAccessibility(
      `Produit retiré de l’étape ${step.category}.`,
    );
  };

  const runMoveAction = (action: 'move-up' | 'move-down', index: number) => {
    if (action === 'move-up') moveStep(index, -1);
    if (action === 'move-down') moveStep(index, 1);
  };

  const save = async () => {
    if (steps.length === 0) {
      Alert.alert(
        'Ajoute au moins une étape',
        'Une routine vide ne peut pas être enregistrée.',
      );
      return;
    }
    const unscheduledStep = steps.find(
      (step) =>
        step.isActive !== false && (step.selectedWeekdays?.length ?? 0) === 0,
    );
    if (unscheduledStep) {
      Alert.alert(
        'Choisis au moins un jour',
        `« ${unscheduledStep.category} » est active mais aucun jour n’est sélectionné.`,
      );
      return;
    }

    const inputSteps = steps.map(
      (
        { draftId: _draftId, productImageUrl: _productImageUrl, ...step },
        position,
      ) => ({ ...step, position }),
    );
    setIsSaving(true);
    try {
      if (definition) {
        if (contextual) {
          await routineRepository.replaceRoutineFromDate({
            routineId: definition.routine.id,
            effectiveFrom: effectiveFromDate ?? formatLocalDate(new Date()),
            sourceStepIds: steps.map((step) =>
              step.draftId.startsWith('draft-') ? null : step.draftId,
            ),
            steps: inputSteps,
          });
        } else {
          await routineRepository.replaceRoutineForFuture({
            routineId: definition.routine.id,
            effectiveFrom: nextLocalDate(new Date()),
            steps: inputSteps,
          });
        }
      } else {
        await routineRepository.createRoutine({
          ...(effectiveFromDate ? { effectiveFrom: effectiveFromDate } : {}),
          name,
          period,
          steps: inputSteps,
        });
      }
      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
      void AccessibilityInfo.announceForAccessibility('Routine enregistrée.');
      await onSaved();
    } catch {
      Alert.alert(
        'Impossible d’enregistrer la routine',
        'Réessaie dans un instant. Tes modifications restent affichées.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const configuredStep = steps.find(
    (step) => step.draftId === configuredStepId,
  );
  const editorHeader = (
    <View style={styles.editorHeader}>
      <IconButton
        accessibilityLabel={
          subview === 'list'
            ? contextual
              ? 'Fermer la routine'
              : 'Revenir à mes routines'
            : 'Revenir aux étapes'
        }
        icon={subview === 'list' && contextual ? 'xmark' : 'chevron.left'}
        onPress={back}
      />
      <Text
        ref={navigationTitleRef}
        accessibilityRole="header"
        maxFontSizeMultiplier={1.6}
        style={[styles.navigationTitle, { color: colors.text }]}
      >
        {navigationTitle}
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );
  const editorPadding = {
    paddingBottom: insets.bottom + 32,
  };

  if (subview === 'scanner' && ProductScanner) {
    return (
      <ProductScanner
        origin={{
          kind: 'routine-editor',
          routineId: definition?.routine.id ?? null,
          routinePeriod: period,
        }}
        onClose={() => setSubview('product')}
        onProductSelected={linkProduct}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', default: undefined })}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <View
        style={[
          styles.editorHeaderFrame,
          {
            backgroundColor: colors.background,
            borderBottomColor: colors.separator,
            paddingTop: insets.top + 12,
          },
        ]}
      >
        {editorHeader}
      </View>
      <ScrollView
        ref={editorScrollRef}
        contentContainerStyle={[styles.editorContent, editorPadding]}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!isDragging}
      >
        <Animated.View
          key={subview}
          entering={SUBVIEW_ENTERING}
          style={styles.editorSubview}
        >
          {subview === 'add' ? (
            <AddStepChoice
              onAddProduct={() => openProductPicker()}
              onAddWithoutProduct={() => setSubview('category')}
            />
          ) : subview === 'category' ? (
            <CategoryPicker onSelect={addCategory} />
          ) : subview === 'product' ? (
            <OwnedProductPicker
              category={
                steps.find((step) => step.draftId === productTargetStepId)
                  ?.category ?? null
              }
              onBrowseProducts={onBrowseProducts}
              onScan={ProductScanner ? () => setSubview('scanner') : undefined}
              onSelect={linkProduct}
            />
          ) : subview === 'step' && configuredStep ? (
            <StepScheduleEditor
              step={configuredStep}
              onChange={(update) => updateStep(configuredStep.draftId, update)}
              onChooseProduct={() => openProductPicker(configuredStep.draftId)}
              onDone={() => {
                setSubview('list');
                setConfiguredStepId(null);
              }}
              onUnlinkProduct={() => unlinkProduct(configuredStep.draftId)}
            />
          ) : (
            <>
              <View style={styles.editorIntro}>
                <Text
                  maxFontSizeMultiplier={1.5}
                  style={[styles.editorTitle, { color: colors.text }]}
                >
                  {contextual ? 'Tes étapes' : name}
                </Text>
                <Text style={[styles.intro, { color: colors.textSecondary }]}>
                  Ajoute tes produits ou prépare une étape sans produit.
                </Text>
                {definition || (contextual && effectiveFromDate) ? (
                  <View
                    style={[
                      styles.futureNotice,
                      { backgroundColor: colors.backgroundSelected },
                    ]}
                  >
                    <AppSymbol name="calendar" color={colors.tint} size={17} />
                    <Text
                      style={[
                        styles.futureNoticeText,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {contextual
                        ? 'Actives aujourd’hui, sans modifier le passé.'
                        : 'Actives dès demain, sans modifier le passé.'}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View
                style={[styles.stepList, { borderColor: colors.separator }]}
              >
                {steps.length === 0 ? (
                  <Text
                    style={[styles.emptyText, { color: colors.textSecondary }]}
                  >
                    Aucune étape. Ajoute une catégorie pour commencer.
                  </Text>
                ) : (
                  steps.map((step, index) => (
                    <RoutineStepRow
                      key={step.draftId}
                      count={steps.length}
                      destinationOffset={
                        dragPreview?.sourceIndex === index
                          ? dragPreviewOffset(
                              steps,
                              rowHeightsRef.current,
                              dragPreview.sourceIndex,
                              dragPreview.destinationIndex,
                            )
                          : 0
                      }
                      index={index}
                      onChooseProduct={() => openProductPicker(step.draftId)}
                      onConfigure={() => {
                        setConfiguredStepId(step.draftId);
                        setSubview('step');
                      }}
                      onDragEnd={(translationY) =>
                        reorderStep(index, translationY)
                      }
                      onDragCancel={cancelStepDrag}
                      onDragStart={() => startStepDrag(index)}
                      onDragUpdate={(translationY) =>
                        previewStepDestination(index, translationY)
                      }
                      onLayout={(height) => {
                        rowHeightsRef.current[step.draftId] = height;
                      }}
                      onMoveAction={(action) => runMoveAction(action, index)}
                      onRemove={() => removeStep(step)}
                      previewOffset={
                        dragPreview
                          ? rowPreviewOffset(
                              index,
                              dragPreview.sourceIndex,
                              dragPreview.destinationIndex,
                              rowHeightsRef.current[
                                steps[dragPreview.sourceIndex]?.draftId
                              ] ?? 88,
                            )
                          : 0
                      }
                      step={step}
                    />
                  ))
                )}
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => setSubview('add')}
                style={({ pressed }) => [
                  styles.addStepButton,
                  {
                    backgroundColor: colors.backgroundSelected,
                    opacity: pressed ? 0.78 : 1,
                  },
                ]}
              >
                <AppSymbol name="plus" color={colors.tint} size={20} />
                <Text
                  maxFontSizeMultiplier={1.6}
                  style={[styles.addStepText, { color: colors.tint }]}
                >
                  Ajouter une étape
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isClean ? `${name} à jour` : `Enregistrer ${name}`
                }
                accessibilityState={{
                  busy: isSaving,
                  disabled: saveDisabled,
                }}
                disabled={saveDisabled}
                onPress={() => void save()}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: pressed
                      ? colors.tintPressed
                      : isClean
                        ? colors.backgroundSelected
                        : colors.tint,
                    opacity: isSaving ? 0.68 : 1,
                  },
                ]}
              >
                {isSaving ? (
                  <ActivityIndicator color={colors.onTint} size="small" />
                ) : null}
                {isClean ? (
                  <AppSymbol
                    name="checkmark"
                    color={colors.textSecondary}
                    size={17}
                  />
                ) : null}
                <Text
                  maxFontSizeMultiplier={1.6}
                  style={[
                    styles.primaryButtonText,
                    isClean && { color: colors.textSecondary },
                  ]}
                >
                  {isSaving
                    ? 'Enregistrement…'
                    : isClean
                      ? 'Routine à jour'
                      : 'Enregistrer la routine'}
                </Text>
              </Pressable>
            </>
          )}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function RoutineStepRow({
  count,
  destinationOffset,
  index,
  onChooseProduct,
  onConfigure,
  onDragCancel,
  onDragEnd,
  onDragStart,
  onDragUpdate,
  onLayout,
  onMoveAction,
  onRemove,
  previewOffset,
  step,
}: {
  count: number;
  destinationOffset: number;
  index: number;
  onChooseProduct: () => void;
  onConfigure: () => void;
  onDragCancel: () => void;
  onDragEnd: (translationY: number) => void;
  onDragStart: () => void;
  onDragUpdate: (translationY: number) => void;
  onLayout: (height: number) => void;
  onMoveAction: (action: 'move-up' | 'move-down') => void;
  onRemove: () => void;
  previewOffset: number;
  step: DraftStep;
}) {
  const colors = RoutineColors;
  const [isActive, setIsActive] = useState(false);
  const callbacksRef = useRef({
    onDragCancel,
    onDragEnd,
    onDragStart,
    onDragUpdate,
  });
  const translationY = useSharedValue(0);
  const previewTranslationY = useSharedValue(previewOffset);
  const destinationTranslationY = useSharedValue(destinationOffset);
  const liftProgress = useSharedValue(0);
  callbacksRef.current = {
    onDragCancel,
    onDragEnd,
    onDragStart,
    onDragUpdate,
  };

  const handleDragStart = useCallback(() => {
    setIsActive(true);
    callbacksRef.current.onDragStart();
  }, []);

  const handleDragUpdate = useCallback((value: number) => {
    callbacksRef.current.onDragUpdate(value);
  }, []);

  const handleDragFinalize = useCallback((value: number, success: boolean) => {
    setIsActive(false);
    if (success) {
      callbacksRef.current.onDragEnd(value);
    } else {
      callbacksRef.current.onDragCancel();
    }
  }, []);

  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(RoutineMotion.dragActivation)
        .minDistance(4)
        .shouldCancelWhenOutside(false)
        .onStart(() => {
          liftProgress.value = withTiming(1, {
            duration: DRAG_LIFT_DURATION,
            reduceMotion: ReduceMotion.System,
          });
          scheduleOnRN(handleDragStart);
        })
        .onUpdate((event) => {
          translationY.value = event.translationY;
          scheduleOnRN(handleDragUpdate, event.translationY);
        })
        .onFinalize((event, success) => {
          translationY.value = 0;
          liftProgress.value = withTiming(0, {
            duration: DRAG_LIFT_DURATION,
            reduceMotion: ReduceMotion.System,
          });
          scheduleOnRN(handleDragFinalize, event.translationY, success);
        }),
    [
      handleDragFinalize,
      handleDragStart,
      handleDragUpdate,
      liftProgress,
      translationY,
    ],
  );

  const dragStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translationY.value + previewTranslationY.value },
      { scale: 1 + liftProgress.value * 0.012 },
    ],
  }));
  const destinationStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: destinationTranslationY.value }],
  }));

  useEffect(() => {
    if (!isActive) translationY.value = 0;
  }, [isActive, translationY]);

  useEffect(() => {
    previewTranslationY.value = withTiming(previewOffset, {
      duration: DRAG_MOVE_DURATION,
      reduceMotion: ReduceMotion.System,
    });
  }, [previewOffset, previewTranslationY]);

  useEffect(() => {
    destinationTranslationY.value = withTiming(destinationOffset, {
      duration: DRAG_MOVE_DURATION,
      reduceMotion: ReduceMotion.System,
    });
  }, [destinationOffset, destinationTranslationY]);

  return (
    <View
      onLayout={(event) => onLayout(event.nativeEvent.layout.height)}
      style={[styles.stepRowSlot, isActive && styles.stepRowSlotActive]}
    >
      {isActive && destinationOffset !== 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.dropPreview,
            {
              backgroundColor: colors.backgroundSelected,
              borderColor: colors.tint,
            },
            destinationStyle,
          ]}
        />
      ) : null}

      <Animated.View
        style={[
          styles.stepRowSurface,
          index > 0 && {
            borderTopColor: colors.separator,
            borderTopWidth: StyleSheet.hairlineWidth,
          },
          isActive && [
            styles.stepRowSurfaceActive,
            { backgroundColor: colors.backgroundElement },
          ],
          dragStyle,
        ]}
      >
        <View style={styles.stepRowLayout}>
          <GestureDetector gesture={dragGesture}>
            <View
              accessible
              accessibilityActions={[
                ...(index > 0 ? [{ name: 'move-up', label: 'Monter' }] : []),
                ...(index < count - 1
                  ? [{ name: 'move-down', label: 'Descendre' }]
                  : []),
              ]}
              accessibilityHint="Maintiens puis fais glisser pour changer l’ordre"
              accessibilityLabel={`Réordonner ${step.category}`}
              accessibilityRole="button"
              onAccessibilityAction={(event) =>
                onMoveAction(
                  event.nativeEvent.actionName as 'move-up' | 'move-down',
                )
              }
              style={[styles.dragHandle, { opacity: isActive ? 0.55 : 1 }]}
            >
              <AppSymbol
                name="line.3.horizontal"
                color={colors.textSecondary}
                size={20}
              />
            </View>
          </GestureDetector>

          <View style={styles.stepContent}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Configurer ${step.category}, ${scheduleLabel(step)}`}
              accessibilityHint="Modifie le planning et l’instruction"
              onPress={onConfigure}
              style={({ pressed }) => [
                styles.stepMain,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <RoutineStepVisual
                category={step.category}
                imageUrl={step.productImageUrl}
                size={44}
              />
              <View style={styles.stepMainCopy}>
                <Text style={[styles.stepTitle, { color: colors.text }]}>
                  {step.productId ? step.title : step.category}
                </Text>
                <Text
                  ellipsizeMode="tail"
                  numberOfLines={1}
                  style={[styles.stepMeta, { color: colors.textSecondary }]}
                >
                  {step.productId ? `${step.category} · ` : ''}
                  {scheduleLabel(step)}
                  {step.instruction?.trim()
                    ? ` · ${step.instruction.trim()}`
                    : ''}
                </Text>
              </View>
            </Pressable>

            {!step.productId ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Choisir un produit pour ${step.category}`}
                onPress={onChooseProduct}
                style={({ pressed }) => [
                  styles.chooseProductButton,
                  {
                    backgroundColor: pressed
                      ? colors.backgroundSelected
                      : 'transparent',
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                <Text
                  maxFontSizeMultiplier={1.4}
                  numberOfLines={1}
                  style={[styles.chooseProductText, { color: colors.tint }]}
                >
                  Choisir
                </Text>
                <AppSymbol name="chevron.right" color={colors.tint} size={14} />
              </Pressable>
            ) : null}
          </View>

          <IconButton
            accessibilityLabel={`Supprimer ${step.category}`}
            destructive
            icon="trash"
            onPress={onRemove}
          />
        </View>
      </Animated.View>
    </View>
  );
}

function AddStepChoice({
  onAddProduct,
  onAddWithoutProduct,
}: {
  onAddProduct: () => void;
  onAddWithoutProduct: () => void;
}) {
  const colors = RoutineColors;
  return (
    <View style={styles.subviewContent}>
      <View style={styles.addChoiceIntro}>
        <Text
          maxFontSizeMultiplier={1.5}
          style={[styles.editorTitle, { color: colors.text }]}
        >
          Que souhaites-tu ajouter ?
        </Text>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          Pars d’un produit, ou prépare une étape à compléter plus tard.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onAddProduct}
        style={({ pressed }) => [
          styles.primaryChoiceButton,
          {
            backgroundColor: colors.tint,
            opacity: pressed ? 0.72 : 1,
          },
        ]}
      >
        <AppSymbol name="shippingbox" color={colors.onTint} size={21} />
        <Text
          maxFontSizeMultiplier={1.6}
          style={[styles.primaryChoiceText, { color: colors.onTint }]}
        >
          Choisir un produit
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onAddWithoutProduct}
        style={({ pressed }) => [
          styles.secondaryChoiceButton,
          {
            backgroundColor: colors.backgroundSelected,
            opacity: pressed ? 0.72 : 1,
          },
        ]}
      >
        <AppSymbol name="square.dashed" color={colors.tint} size={21} />
        <View style={styles.secondaryChoiceCopy}>
          <Text style={[styles.secondaryChoiceTitle, { color: colors.text }]}>
            Ajouter sans produit
          </Text>
          <Text
            style={[
              styles.secondaryChoiceDescription,
              { color: colors.textSecondary },
            ]}
          >
            Choisis simplement une catégorie.
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

function CategoryPicker({
  onSelect,
}: {
  onSelect: (category: RoutineCategory) => void;
}) {
  const colors = RoutineColors;
  return (
    <View style={styles.subviewContent}>
      <Text
        maxFontSizeMultiplier={1.5}
        style={[styles.editorTitle, { color: colors.text }]}
      >
        Quelle catégorie ?
      </Text>
      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        Choisis « Autre » si aucune catégorie ne convient.
      </Text>
      <View style={[styles.categoryList, { borderColor: colors.separator }]}>
        {ROUTINE_CATEGORIES.map((category, index) => (
          <Pressable
            key={category}
            accessibilityRole="button"
            onPress={() => onSelect(category)}
            style={({ pressed }) => [
              styles.categoryRow,
              index > 0 && {
                borderTopColor: colors.separator,
                borderTopWidth: StyleSheet.hairlineWidth,
              },
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.categoryText, { color: colors.text }]}>
              {category}
            </Text>
            <AppSymbol name="plus.circle" color={colors.tint} size={21} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function OwnedProductPicker({
  category,
  onBrowseProducts,
  onSelect,
  onScan,
}: {
  category: RoutineCategory | null;
  onBrowseProducts?: () => void;
  onSelect: (product: Product) => void;
  onScan?: () => void;
}) {
  const colors = RoutineColors;
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showAllProducts, setShowAllProducts] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      setProducts(await productRepository.listOwnedProducts());
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const compatibleProducts = category
    ? products.filter(
        (product) => routineCategoryForProduct(product.category) === category,
      )
    : products;
  const visibleProducts =
    category && showAllProducts ? products : compatibleProducts;
  const hasOtherProducts =
    Boolean(category) && compatibleProducts.length === 0 && products.length > 0;

  return (
    <View style={styles.subviewContent}>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={1.5}
        style={[styles.editorTitle, { color: colors.text }]}
      >
        Mes produits
      </Text>
      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        {category && !showAllProducts
          ? `Choisis un produit de la catégorie ${category.toLocaleLowerCase('fr-FR')}.`
          : 'Choisis un produit déjà enregistré ou scanne-en un nouveau.'}
      </Text>

      {isLoading ? (
        <View
          accessibilityLiveRegion="polite"
          style={styles.productPickerState}
        >
          <ActivityIndicator color={colors.tint} />
          <Text style={[styles.stateText, { color: colors.textSecondary }]}>
            Chargement de Mes produits…
          </Text>
        </View>
      ) : hasError ? (
        <View style={styles.productPickerState}>
          <Text style={[styles.stateText, { color: colors.text }]}>
            Mes produits ne peuvent pas être chargés.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void load()}
            style={styles.inlinePickerAction}
          >
            <Text
              style={[styles.inlinePickerActionText, { color: colors.tint }]}
            >
              Réessayer
            </Text>
          </Pressable>
        </View>
      ) : visibleProducts.length ? (
        <View
          style={[styles.productPickerList, { borderColor: colors.separator }]}
        >
          {visibleProducts.map((product, index) => (
            <Pressable
              key={product.id}
              accessibilityRole="button"
              accessibilityLabel={`Ajouter ${[product.brand, product.name].filter(Boolean).join(' ')} à la routine`}
              onPress={() => onSelect(product)}
              style={({ pressed }) => [
                styles.productPickerRow,
                index > 0 && {
                  borderTopColor: colors.separator,
                  borderTopWidth: StyleSheet.hairlineWidth,
                },
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={styles.productPickerCopy}>
                <Text
                  style={[styles.productPickerName, { color: colors.text }]}
                >
                  {product.name}
                </Text>
                <Text
                  style={[
                    styles.productPickerMeta,
                    { color: colors.textSecondary },
                  ]}
                >
                  {[product.brand, product.category]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <AppSymbol
                name="plus.circle.fill"
                color={colors.tint}
                size={23}
              />
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.productPickerState}>
          <Text style={[styles.stateText, { color: colors.textSecondary }]}>
            {category
              ? `Aucun produit ${category.toLocaleLowerCase('fr-FR')} dans Mes produits.`
              : 'Mes produits est vide.'}
          </Text>
          {hasOtherProducts ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowAllProducts(true)}
              style={styles.inlinePickerAction}
            >
              <Text
                style={[styles.inlinePickerActionText, { color: colors.tint }]}
              >
                Voir tous mes produits
              </Text>
            </Pressable>
          ) : null}
          {onBrowseProducts ? (
            <Pressable
              accessibilityRole="button"
              onPress={onBrowseProducts}
              style={styles.inlinePickerAction}
            >
              <Text
                style={[styles.inlinePickerActionText, { color: colors.tint }]}
              >
                Rechercher dans Produits
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {!isLoading && !hasError && visibleProducts.length ? (
        <View style={styles.pickerEscapeActions}>
          {category &&
          !showAllProducts &&
          products.length > visibleProducts.length ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowAllProducts(true)}
              style={styles.inlinePickerAction}
            >
              <Text
                style={[styles.inlinePickerActionText, { color: colors.tint }]}
              >
                Voir tous mes produits
              </Text>
            </Pressable>
          ) : null}
          {onBrowseProducts ? (
            <Pressable
              accessibilityRole="button"
              onPress={onBrowseProducts}
              style={styles.inlinePickerAction}
            >
              <Text
                style={[styles.inlinePickerActionText, { color: colors.tint }]}
              >
                Rechercher dans Produits
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {onScan ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scanner un nouveau produit pour la routine"
          onPress={onScan}
          style={({ pressed }) => [
            styles.addStepButton,
            {
              backgroundColor: colors.backgroundSelected,
              opacity: pressed ? 0.78 : 1,
            },
          ]}
        >
          <AppSymbol name="barcode.viewfinder" color={colors.tint} size={20} />
          <Text
            maxFontSizeMultiplier={1.6}
            style={[styles.addStepText, { color: colors.tint }]}
          >
            Scanner un nouveau produit
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function StepScheduleEditor({
  step,
  onChange,
  onChooseProduct,
  onDone,
  onUnlinkProduct,
}: {
  step: DraftStep;
  onChange: (update: Partial<DraftStep>) => void;
  onChooseProduct: () => void;
  onDone: () => void;
  onUnlinkProduct: () => void;
}) {
  const colors = RoutineColors;
  const { width: viewportWidth } = useWindowDimensions();
  const selectedWeekdays = step.selectedWeekdays ?? allWeekdays();
  const weekdayRows =
    viewportWidth < 360
      ? [WEEKDAYS.slice(0, 4), WEEKDAYS.slice(4)]
      : [WEEKDAYS];
  const mode =
    step.isActive === false
      ? 'disabled'
      : selectedWeekdays.length === 7
        ? 'daily'
        : 'selected';

  const selectMode = (nextMode: 'daily' | 'selected' | 'disabled') => {
    if (nextMode === 'disabled') {
      onChange({ isActive: false });
    } else if (nextMode === 'daily') {
      onChange({ isActive: true, selectedWeekdays: allWeekdays() });
    } else {
      const nextWeekdays =
        selectedWeekdays.length === 7 || selectedWeekdays.length === 0
          ? WEEKDAY_DEFAULT
          : selectedWeekdays;
      onChange({
        isActive: true,
        selectedWeekdays: nextWeekdays,
      });
      if (nextWeekdays === WEEKDAY_DEFAULT) {
        void AccessibilityInfo.announceForAccessibility(
          'Du lundi au vendredi sélectionnés.',
        );
      }
    }
  };

  const toggleWeekday = (day: Weekday) => {
    const selected = selectedWeekdays.includes(day);
    if (selected && selectedWeekdays.length === 1) {
      void AccessibilityInfo.announceForAccessibility(
        'Garde au moins un jour sélectionné.',
      );
      return;
    }
    onChange({
      selectedWeekdays: selected
        ? selectedWeekdays.filter((value) => value !== day)
        : [...selectedWeekdays, day],
    });
    void Haptics.selectionAsync().catch(() => undefined);
  };

  return (
    <View style={styles.subviewContent}>
      {step.productId ? (
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>
            Produit
          </Text>
          <View
            style={[
              styles.linkedProduct,
              { backgroundColor: colors.backgroundSelected },
            ]}
          >
            <RoutineStepVisual
              category={step.category}
              imageUrl={step.productImageUrl}
              size={44}
            />
            <View style={styles.linkedProductCopy}>
              <Text style={[styles.linkedProductName, { color: colors.text }]}>
                {step.title}
              </Text>
              <Text
                style={[
                  styles.linkedProductMeta,
                  { color: colors.textSecondary },
                ]}
              >
                {step.category}
              </Text>
            </View>
            <AppSymbol
              name="checkmark.circle.fill"
              color={colors.tint}
              size={21}
            />
          </View>
          <View style={styles.linkedProductActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Changer le produit de ${step.category}`}
              onPress={onChooseProduct}
              style={({ pressed }) => [
                styles.inlineProductAction,
                {
                  backgroundColor: pressed
                    ? colors.backgroundSelected
                    : 'transparent',
                },
              ]}
            >
              <Text
                maxFontSizeMultiplier={1.6}
                style={[styles.inlineProductActionText, { color: colors.tint }]}
              >
                Changer
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Retirer le produit de ${step.category}`}
              onPress={onUnlinkProduct}
              style={({ pressed }) => [
                styles.inlineProductAction,
                {
                  backgroundColor: pressed
                    ? colors.backgroundSelected
                    : 'transparent',
                },
              ]}
            >
              <Text
                maxFontSizeMultiplier={1.6}
                style={[
                  styles.inlineProductActionText,
                  { color: colors.error },
                ]}
              >
                Retirer
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.fieldGroup}>
        <Text style={[styles.fieldLabel, { color: colors.text }]}>
          Planning
        </Text>
        <View
          accessibilityRole="radiogroup"
          style={[
            styles.scheduleOptions,
            { backgroundColor: colors.backgroundSelected },
          ]}
        >
          <ScheduleOption
            label="Tous les jours"
            selected={mode === 'daily'}
            onPress={() => selectMode('daily')}
          />
          <ScheduleOption
            label="Certains jours"
            selected={mode === 'selected'}
            onPress={() => selectMode('selected')}
            showSeparator
          />
          <ScheduleOption
            label="Désactivée"
            selected={mode === 'disabled'}
            onPress={() => selectMode('disabled')}
            showSeparator
          />
        </View>
      </View>

      {mode === 'selected' ? (
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Jours</Text>
          <View style={styles.weekdayRows}>
            {weekdayRows.map((days, rowIndex) => (
              <View key={rowIndex} style={styles.weekdays}>
                {days.map((day) => {
                  const selected = selectedWeekdays.includes(day.value);
                  return (
                    <Pressable
                      key={day.label}
                      accessibilityRole="checkbox"
                      accessibilityLabel={day.label}
                      accessibilityState={{ checked: selected }}
                      onPress={() => toggleWeekday(day.value)}
                      style={({ pressed }) => [
                        styles.weekday,
                        {
                          backgroundColor: selected
                            ? colors.tint
                            : colors.backgroundElement,
                          borderColor: selected
                            ? colors.tint
                            : colors.controlBorder,
                          opacity: pressed ? 0.82 : 1,
                        },
                      ]}
                    >
                      <Text
                        maxFontSizeMultiplier={1.25}
                        style={[
                          styles.weekdayText,
                          { color: selected ? colors.onTint : colors.text },
                        ]}
                      >
                        {day.short}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.fieldGroup}>
        <Text style={[styles.fieldLabel, { color: colors.text }]}>
          Instruction courte (facultative)
        </Text>
        <TextInput
          accessibilityLabel={`Instruction pour ${step.category}`}
          maxLength={MAX_INSTRUCTION_LENGTH}
          multiline
          onChangeText={(instruction) => onChange({ instruction })}
          placeholder="Ex. appliquer sur peau humide"
          placeholderTextColor={colors.textSecondary}
          style={[
            styles.instructionInput,
            {
              borderColor: colors.controlBorder,
              color: colors.text,
            },
          ]}
          textAlignVertical="top"
          value={step.instruction ?? ''}
        />
        {step.instruction?.length ? (
          <Text
            style={[styles.characterCount, { color: colors.textSecondary }]}
          >
            {step.instruction.length}/{MAX_INSTRUCTION_LENGTH}
          </Text>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onDone}
        style={({ pressed }) => [
          styles.primaryButton,
          {
            backgroundColor: pressed ? colors.tintPressed : colors.tint,
          },
        ]}
      >
        <Text maxFontSizeMultiplier={1.6} style={styles.primaryButtonText}>
          Terminer
        </Text>
      </Pressable>
    </View>
  );
}

function ScheduleOption({
  label,
  selected,
  onPress,
  showSeparator,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  showSeparator?: boolean;
}) {
  const colors = RoutineColors;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={() => {
        if (!selected) void Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      style={({ pressed }) => [
        styles.scheduleOption,
        showSeparator && {
          borderTopColor: colors.separator,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        {
          backgroundColor:
            selected || pressed ? colors.backgroundElement : 'transparent',
        },
      ]}
    >
      <Text
        maxFontSizeMultiplier={1.8}
        style={[styles.scheduleText, { color: colors.text }]}
      >
        {label}
      </Text>
      {selected ? (
        <AppSymbol name="checkmark" color={colors.tint} size={18} />
      ) : (
        <View style={styles.scheduleCheckPlaceholder} />
      )}
    </Pressable>
  );
}

function IconButton({
  accessibilityActions,
  accessibilityLabel,
  destructive,
  disabled,
  icon,
  onAccessibilityAction,
  onPress,
}: {
  accessibilityActions?: { label: string; name: string }[];
  accessibilityLabel: string;
  destructive?: boolean;
  disabled?: boolean;
  icon: SFSymbol;
  onAccessibilityAction?: (actionName: string) => void;
  onPress: () => void;
}) {
  const colors = RoutineColors;
  return (
    <Pressable
      accessibilityActions={accessibilityActions}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={2}
      onAccessibilityAction={(event) =>
        onAccessibilityAction?.(event.nativeEvent.actionName)
      }
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { opacity: disabled ? 0.3 : pressed ? 0.55 : 1 },
      ]}
    >
      <AppSymbol
        name={icon}
        color={destructive ? colors.error : colors.textSecondary}
        size={20}
      />
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
      fallback={null}
      name={name}
      size={size}
      tintColor={color}
      weight="medium"
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  managerContent: { gap: 32, paddingHorizontal: 24 },
  managerHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  headerCopy: { flex: 1, gap: 10 },
  largeTitle: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.7,
  },
  intro: { fontSize: 17 },
  periodList: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  periodRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 82,
    paddingVertical: 10,
  },
  periodIcon: {
    alignItems: 'center',
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  periodCopy: { flex: 1, gap: 3 },
  periodTitle: { fontSize: 18, fontWeight: '600' },
  periodMeta: { fontSize: 15 },
  rowAction: { fontSize: 16, fontWeight: '600' },
  stateText: { fontSize: 17 },
  loadingState: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  loadError: { alignItems: 'flex-start', gap: 16 },
  secondaryButton: {
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  secondaryButtonText: { fontSize: 17, fontWeight: '700' },
  editorContent: { paddingHorizontal: 20, paddingTop: 20 },
  editorHeaderFrame: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 8,
    paddingHorizontal: 20,
  },
  editorSubview: { gap: 24 },
  editorHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 44,
  },
  navigationTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSpacer: { width: 44 },
  iconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  editorIntro: { gap: 8 },
  editorTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.35,
  },
  futureNotice: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  futureNoticeText: { flex: 1, fontSize: 15, lineHeight: 20 },
  stepList: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  emptyText: { fontSize: 16, paddingVertical: 24 },
  stepRowSlot: { minHeight: 88, position: 'relative', zIndex: 0 },
  stepRowSlotActive: { zIndex: 3 },
  stepRowSurface: { minHeight: 88 },
  stepRowSurfaceActive: {
    borderRadius: 12,
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
  },
  dropPreview: {
    borderRadius: 12,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    bottom: 4,
    left: 4,
    opacity: 0.8,
    position: 'absolute',
    right: 4,
    top: 4,
  },
  stepRowLayout: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 88,
    paddingVertical: 8,
  },
  dragHandle: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  stepContent: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 2,
    minWidth: 0,
  },
  stepMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 52,
    minWidth: 0,
  },
  stepMainCopy: { flex: 1, gap: 4, minWidth: 0 },
  stepTitle: { fontSize: 17, fontWeight: '600' },
  stepMeta: { fontSize: 14, lineHeight: 20 },
  chooseProductButton: {
    alignItems: 'center',
    borderRadius: 10,
    flexShrink: 0,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  chooseProductText: { fontSize: 14, fontWeight: '600' },
  addStepButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  addStepText: { fontSize: 17, fontWeight: '700' },
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
  subviewContent: { gap: 24 },
  addChoiceIntro: { gap: 8 },
  primaryChoiceButton: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
  },
  primaryChoiceText: { fontSize: 17, fontWeight: '700' },
  secondaryChoiceButton: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryChoiceCopy: { flex: 1, gap: 2 },
  secondaryChoiceTitle: { fontSize: 17, fontWeight: '600' },
  secondaryChoiceDescription: { fontSize: 14, lineHeight: 19 },
  categoryList: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  categoryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingVertical: 8,
  },
  categoryText: { flex: 1, fontSize: 17 },
  productPickerState: {
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
  },
  inlinePickerAction: { justifyContent: 'center', minHeight: 44 },
  inlinePickerActionText: { fontSize: 16, fontWeight: '600' },
  productPickerList: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  productPickerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 68,
    paddingVertical: 10,
  },
  productPickerCopy: { flex: 1, gap: 3 },
  productPickerName: { fontSize: 17, fontWeight: '600', lineHeight: 23 },
  productPickerMeta: { fontSize: 14, lineHeight: 20 },
  pickerEscapeActions: { gap: 2 },
  fieldGroup: { gap: 10 },
  fieldLabel: { fontSize: 17, fontWeight: '700' },
  linkedProduct: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  linkedProductCopy: { flex: 1, gap: 3 },
  linkedProductName: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  linkedProductMeta: { fontSize: 14, lineHeight: 19 },
  linkedProductActions: { flexDirection: 'row', gap: 4 },
  inlineProductAction: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 10,
  },
  inlineProductActionText: { fontSize: 16, fontWeight: '600' },
  scheduleOptions: { borderRadius: 12, overflow: 'hidden' },
  scheduleOption: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  scheduleText: { flex: 1, fontSize: 17 },
  scheduleCheckPlaceholder: { height: 18, width: 18 },
  weekdayRows: { gap: 8 },
  weekdays: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekday: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  weekdayText: { fontSize: 16, fontWeight: '700' },
  instructionInput: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 17,
    minHeight: 96,
    padding: 14,
  },
  characterCount: { alignSelf: 'flex-end', fontSize: 13 },
});
