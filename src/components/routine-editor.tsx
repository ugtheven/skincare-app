import { SymbolView, type SFSymbol } from 'expo-symbols';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
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

import { Colors } from '@/constants/theme';
import { productRepository } from '@/data/sqlite-product-repository';
import type { RoutineStepInput } from '@/data/routine-repository';
import { routineRepository } from '@/data/sqlite-routine-repository';
import type { Product } from '@/domain/product';
import {
  ROUTINE_CATEGORIES,
  allWeekdays,
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

type DraftStep = RoutineStepInput & { draftId: string };

type Props = {
  onboarding?: boolean;
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

let draftSequence = 0;

function newDraftId() {
  draftSequence += 1;
  return `draft-${draftSequence}`;
}

function definitionSteps(definition: RoutineDefinition | null): DraftStep[] {
  return (definition?.steps ?? []).map((step) => ({
    draftId: step.id,
    productId: step.productId,
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
    steps.map(({ draftId: _draftId, ...step }, position) => ({
      ...step,
      instruction: step.instruction?.trim() || null,
      position,
      selectedWeekdays: [...(step.selectedWeekdays ?? allWeekdays())].sort(),
    })),
  );
}

export function RoutineManager({
  onboarding,
  onClose,
  onSaved,
  ProductScanner,
}: Props) {
  const colors = Colors;
  const insets = useSafeAreaInsets();
  const [definitions, setDefinitions] = useState<RoutineDefinitions>({
    morning: null,
    evening: null,
  });
  const [editingPeriod, setEditingPeriod] = useState<RoutinePeriod | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const [morning, evening] = await Promise.all(
        PERIODS.map((period) => routineRepository.getRoutineForEditing(period)),
      );
      setDefinitions({ morning, evening });
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (editingPeriod) {
    return (
      <RoutineEditor
        definition={definitions[editingPeriod]}
        period={editingPeriod}
        ProductScanner={ProductScanner}
        onBack={() => setEditingPeriod(null)}
        onSaved={async () => {
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
            <Text style={[styles.largeTitle, { color: colors.text }]}>
              {onboarding ? 'Créer ta routine' : 'Mes routines'}
            </Text>
            <Text style={[styles.intro, { color: colors.textSecondary }]}>
              Ajoute des catégories ou relie les produits que tu utilises.
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
          <Text style={[styles.stateText, { color: colors.textSecondary }]}>
            Chargement des routines…
          </Text>
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
                    <Text style={[styles.periodTitle, { color: colors.text }]}>
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
                  <Text style={[styles.rowAction, { color: colors.tint }]}>
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
  definition,
  period,
  onBack,
  onSaved,
  ProductScanner,
}: {
  definition: RoutineDefinition | null;
  period: RoutinePeriod;
  onBack: () => void;
  onSaved: () => void | Promise<void>;
  ProductScanner?: ComponentType<RoutineProductScannerProps>;
}) {
  const colors = Colors;
  const insets = useSafeAreaInsets();
  const initialSteps = useMemo(() => definitionSteps(definition), [definition]);
  const [steps, setSteps] = useState<DraftStep[]>(initialSteps);
  const [subview, setSubview] = useState<
    'list' | 'category' | 'step' | 'product' | 'scanner'
  >('list');
  const [configuredStepId, setConfiguredStepId] = useState<string | null>(null);
  const [productTargetStepId, setProductTargetStepId] = useState<string | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const name = routineNameForPeriod(period);
  const isDirty = serializeDraft(steps) !== serializeDraft(initialSteps);

  const back = () => {
    if (subview !== 'list') {
      setSubview('list');
      setConfiguredStepId(null);
      setProductTargetStepId(null);
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
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= steps.length) return;
    setSteps((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  };

  const removeStep = (step: DraftStep) => {
    Alert.alert(
      `Supprimer « ${step.category} » ?`,
      'Cette étape sera retirée de la prochaine version de la routine.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () =>
            setSteps((current) =>
              current.filter((item) => item.draftId !== step.draftId),
            ),
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
    let configuredId: string;
    let replacedPlaceholder = false;
    const targetIndex = steps.findIndex(
      (step) =>
        step.draftId === productTargetStepId &&
        !step.productId &&
        step.category === category,
    );
    const compatibleIndex = steps.findIndex(
      (step) => !step.productId && step.category === category,
    );
    const replacementIndex = targetIndex >= 0 ? targetIndex : compatibleIndex;
    const next = [...steps];

    if (replacementIndex >= 0) {
      const placeholder = next[replacementIndex];
      configuredId = placeholder.draftId;
      replacedPlaceholder = true;
      next[replacementIndex] = {
        ...placeholder,
        productId: product.id,
        title: product.name,
      };
    } else {
      configuredId = newDraftId();
      const insertionIndex = suggestedRoutineInsertionIndex(next, category);
      next.splice(insertionIndex, 0, {
        draftId: configuredId,
        productId: product.id,
        title: product.name,
        category,
        instruction: null,
        position: insertionIndex,
        isActive: true,
        selectedWeekdays: allWeekdays(),
      });
    }

    setSteps(next.map((step, position) => ({ ...step, position })));
    setProductTargetStepId(null);
    setConfiguredStepId(configuredId);
    setSubview('step');
    void AccessibilityInfo.announceForAccessibility(
      replacedPlaceholder
        ? `${product.name} remplace le placeholder ${category}. Planning conservé.`
        : `${product.name} ajouté. Choisis son planning.`,
    );
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
      ({ draftId: _draftId, ...step }, position) => ({ ...step, position }),
    );
    setIsSaving(true);
    try {
      if (definition) {
        await routineRepository.replaceRoutineForFuture({
          routineId: definition.routine.id,
          effectiveFrom: nextLocalDate(new Date()),
          steps: inputSteps,
        });
      } else {
        await routineRepository.createRoutine({
          name,
          period,
          steps: inputSteps,
        });
      }
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
      <ScrollView
        contentContainerStyle={[
          styles.editorContent,
          {
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 32,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.editorHeader}>
          <IconButton
            accessibilityLabel={
              subview === 'list'
                ? 'Revenir à mes routines'
                : 'Revenir aux étapes'
            }
            icon="chevron.left"
            onPress={back}
          />
          <Text style={[styles.navigationTitle, { color: colors.text }]}>
            {subview === 'category'
              ? 'Ajouter une étape'
              : subview === 'product'
                ? 'Choisir un produit'
                : subview === 'step'
                  ? configuredStep?.category
                  : name}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {subview === 'category' ? (
          <CategoryPicker onSelect={addCategory} />
        ) : subview === 'product' ? (
          <OwnedProductPicker
            category={
              steps.find((step) => step.draftId === productTargetStepId)
                ?.category ?? null
            }
            onScan={ProductScanner ? () => setSubview('scanner') : undefined}
            onSelect={linkProduct}
          />
        ) : subview === 'step' && configuredStep ? (
          <StepScheduleEditor
            step={configuredStep}
            onChange={(update) => updateStep(configuredStep.draftId, update)}
            onDone={() => {
              setSubview('list');
              setConfiguredStepId(null);
            }}
          />
        ) : (
          <>
            <View style={styles.editorIntro}>
              <Text style={[styles.editorTitle, { color: colors.text }]}>
                {name}
              </Text>
              <Text style={[styles.intro, { color: colors.textSecondary }]}>
                Ajoute tes produits ou garde une catégorie comme placeholder.
              </Text>
              {definition ? (
                <Text
                  style={[styles.futureNotice, { color: colors.textSecondary }]}
                >
                  Les changements s’appliqueront dès demain. Le passé reste
                  inchangé.
                </Text>
              ) : null}
            </View>

            <View style={[styles.stepList, { borderColor: colors.separator }]}>
              {steps.length === 0 ? (
                <Text
                  style={[styles.emptyText, { color: colors.textSecondary }]}
                >
                  Aucune étape. Ajoute une catégorie pour commencer.
                </Text>
              ) : (
                steps.map((step, index) => (
                  <View
                    key={step.draftId}
                    style={[
                      styles.stepRow,
                      index > 0 && {
                        borderTopColor: colors.separator,
                        borderTopWidth: StyleSheet.hairlineWidth,
                      },
                    ]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Configurer ${step.category}, ${scheduleLabel(step)}`}
                      accessibilityHint="Modifie le planning et l’instruction"
                      onPress={() => {
                        setConfiguredStepId(step.draftId);
                        setSubview('step');
                      }}
                      style={({ pressed }) => [
                        styles.stepMain,
                        { opacity: pressed ? 0.7 : 1 },
                      ]}
                    >
                      <Text style={[styles.stepTitle, { color: colors.text }]}>
                        {step.productId ? step.title : step.category}
                      </Text>
                      <Text
                        style={[
                          styles.stepMeta,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {step.productId ? `${step.category} · ` : ''}
                        {scheduleLabel(step)}
                        {step.instruction?.trim()
                          ? ` · ${step.instruction.trim()}`
                          : ''}
                      </Text>
                    </Pressable>
                    <View style={styles.stepActions}>
                      {!step.productId ? (
                        <IconButton
                          accessibilityLabel={`Lier un produit à ${step.category}`}
                          icon="link"
                          onPress={() => openProductPicker(step.draftId)}
                        />
                      ) : null}
                      <IconButton
                        accessibilityLabel={`Monter ${step.category}`}
                        disabled={index === 0}
                        icon="arrow.up"
                        onPress={() => moveStep(index, -1)}
                      />
                      <IconButton
                        accessibilityLabel={`Descendre ${step.category}`}
                        disabled={index === steps.length - 1}
                        icon="arrow.down"
                        onPress={() => moveStep(index, 1)}
                      />
                      <IconButton
                        accessibilityLabel={`Supprimer ${step.category}`}
                        destructive
                        icon="trash"
                        onPress={() => removeStep(step)}
                      />
                    </View>
                  </View>
                ))
              )}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ajouter un produit à ${name}`}
              onPress={() => openProductPicker()}
              style={({ pressed }) => [
                styles.addProductButton,
                {
                  backgroundColor: colors.backgroundSelected,
                  opacity: pressed ? 0.78 : 1,
                },
              ]}
            >
              <AppSymbol name="shippingbox" color={colors.tint} size={20} />
              <Text style={[styles.addProductText, { color: colors.tint }]}>
                Ajouter un produit
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => setSubview('category')}
              style={({ pressed }) => [
                styles.addStepButton,
                {
                  backgroundColor: colors.backgroundSelected,
                  opacity: pressed ? 0.78 : 1,
                },
              ]}
            >
              <AppSymbol name="plus" color={colors.tint} size={20} />
              <Text style={[styles.addStepText, { color: colors.tint }]}>
                Ajouter un placeholder
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Enregistrer ${name}`}
              disabled={isSaving}
              onPress={() => void save()}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: colors.tint,
                  opacity: pressed || isSaving ? 0.68 : 1,
                },
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {isSaving ? 'Enregistrement…' : 'Enregistrer la routine'}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function CategoryPicker({
  onSelect,
}: {
  onSelect: (category: RoutineCategory) => void;
}) {
  const colors = Colors;
  return (
    <View style={styles.subviewContent}>
      <Text style={[styles.editorTitle, { color: colors.text }]}>
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
  onSelect,
  onScan,
}: {
  category: RoutineCategory | null;
  onSelect: (product: Product) => void;
  onScan?: () => void;
}) {
  const colors = Colors;
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

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

  const visibleProducts = category
    ? products.filter(
        (product) => routineCategoryForProduct(product.category) === category,
      )
    : products;

  return (
    <View style={styles.subviewContent}>
      <Text
        accessibilityRole="header"
        style={[styles.editorTitle, { color: colors.text }]}
      >
        Mes produits
      </Text>
      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        {category
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
        </View>
      )}

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
          <Text style={[styles.addStepText, { color: colors.tint }]}>
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
  onDone,
}: {
  step: DraftStep;
  onChange: (update: Partial<DraftStep>) => void;
  onDone: () => void;
}) {
  const colors = Colors;
  const selectedWeekdays = step.selectedWeekdays ?? allWeekdays();
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
      onChange({
        isActive: true,
        selectedWeekdays:
          selectedWeekdays.length === 7 || selectedWeekdays.length === 0
            ? WEEKDAY_DEFAULT
            : selectedWeekdays,
      });
    }
  };

  return (
    <View style={styles.subviewContent}>
      <View style={styles.fieldGroup}>
        <Text style={[styles.fieldLabel, { color: colors.text }]}>
          Planning
        </Text>
        <View style={styles.scheduleOptions} accessibilityRole="radiogroup">
          <ScheduleOption
            label="Tous les jours"
            selected={mode === 'daily'}
            onPress={() => selectMode('daily')}
          />
          <ScheduleOption
            label="Certains jours"
            selected={mode === 'selected'}
            onPress={() => selectMode('selected')}
          />
          <ScheduleOption
            label="Désactivée"
            selected={mode === 'disabled'}
            onPress={() => selectMode('disabled')}
          />
        </View>
      </View>

      {mode === 'selected' ? (
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Jours</Text>
          <View style={styles.weekdays}>
            {WEEKDAYS.map((day) => {
              const selected = selectedWeekdays.includes(day.value);
              return (
                <Pressable
                  key={day.label}
                  accessibilityRole="checkbox"
                  accessibilityLabel={day.label}
                  accessibilityState={{ checked: selected }}
                  onPress={() =>
                    onChange({
                      selectedWeekdays: selected
                        ? selectedWeekdays.filter(
                            (value) => value !== day.value,
                          )
                        : [...selectedWeekdays, day.value],
                    })
                  }
                  style={({ pressed }) => [
                    styles.weekday,
                    {
                      backgroundColor: selected
                        ? colors.tint
                        : colors.backgroundElement,
                      borderColor: selected ? colors.tint : colors.separator,
                      opacity: pressed ? 0.76 : 1,
                    },
                  ]}
                >
                  <Text
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
              borderColor: colors.separator,
              color: colors.text,
            },
          ]}
          textAlignVertical="top"
          value={step.instruction ?? ''}
        />
        <Text style={[styles.characterCount, { color: colors.textSecondary }]}>
          {(step.instruction ?? '').length}/{MAX_INSTRUCTION_LENGTH}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onDone}
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: colors.tint, opacity: pressed ? 0.76 : 1 },
        ]}
      >
        <Text style={styles.primaryButtonText}>Terminer</Text>
      </Pressable>
    </View>
  );
}

function ScheduleOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = Colors;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.scheduleOption,
        {
          backgroundColor: selected
            ? colors.backgroundSelected
            : colors.backgroundElement,
          borderColor: selected ? colors.tint : colors.separator,
          opacity: pressed ? 0.76 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.radio,
          { borderColor: selected ? colors.tint : colors.textSecondary },
        ]}
      >
        {selected ? (
          <View style={[styles.radioDot, { backgroundColor: colors.tint }]} />
        ) : null}
      </View>
      <Text style={[styles.scheduleText, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function IconButton({
  accessibilityLabel,
  destructive,
  disabled,
  icon,
  onPress,
}: {
  accessibilityLabel: string;
  destructive?: boolean;
  disabled?: boolean;
  icon: SFSymbol;
  onPress: () => void;
}) {
  const colors = Colors;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={2}
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
  loadError: { alignItems: 'flex-start', gap: 16 },
  secondaryButton: {
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  secondaryButtonText: { fontSize: 17, fontWeight: '700' },
  editorContent: { gap: 24, paddingHorizontal: 20 },
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
  futureNotice: { fontSize: 15, marginTop: 4 },
  stepList: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  emptyText: { fontSize: 16, paddingVertical: 24 },
  stepRow: { alignItems: 'stretch', minHeight: 88, paddingVertical: 6 },
  stepMain: { flex: 1, gap: 4, justifyContent: 'center', paddingVertical: 12 },
  stepTitle: { fontSize: 17, fontWeight: '600' },
  stepMeta: { fontSize: 14, lineHeight: 20 },
  stepActions: { alignSelf: 'flex-end', flexDirection: 'row' },
  addProductButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  addProductText: { fontSize: 17, fontWeight: '700' },
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
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  subviewContent: { gap: 24 },
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
  fieldGroup: { gap: 10 },
  fieldLabel: { fontSize: 17, fontWeight: '700' },
  scheduleOptions: { gap: 8 },
  scheduleOption: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  radio: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  radioDot: { borderRadius: 5, height: 10, width: 10 },
  scheduleText: { flex: 1, fontSize: 17 },
  weekdays: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
