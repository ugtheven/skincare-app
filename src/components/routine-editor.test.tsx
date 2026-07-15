import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Pressable, Text } from 'react-native';

import { productRepository } from '@/data/sqlite-product-repository';
import { routineRepository } from '@/data/sqlite-routine-repository';
import type { Product } from '@/domain/product';
import {
  allWeekdays,
  nextLocalDate,
  type RoutineDefinition,
  type RoutinePeriod,
  type RoutineStep,
} from '@/domain/routine';

import {
  RoutineManager,
  type RoutineProductScannerProps,
} from './routine-editor';

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@/data/sqlite-routine-repository', () => ({
  routineRepository: {
    createRoutine: jest.fn(),
    getRoutineForEditing: jest.fn(),
    replaceRoutineForFuture: jest.fn(),
  },
}));

jest.mock('@/data/sqlite-product-repository', () => ({
  productRepository: {
    listOwnedProducts: jest.fn(),
  },
}));

const mockedRepository = routineRepository as jest.Mocked<
  typeof routineRepository
>;
const mockedProductRepository = productRepository as jest.Mocked<
  typeof productRepository
>;

const serumProduct: Product = {
  id: 'serum-product',
  name: 'Sérum apaisant',
  brand: 'Exemple',
  category: 'Sérum',
  barcode: null,
  imageUrl: null,
  imageSource: null,
  imageSourceUrl: null,
  imageLicense: null,
  imageLicenseUrl: null,
  ingredientsText: null,
  ingredientsSource: null,
  ingredientsSourceUrl: null,
  usageText: null,
  usageSource: null,
  usageSourceUrl: null,
  precautionsText: null,
  precautionsSource: null,
  precautionsSourceUrl: null,
  informationConfidence: null,
  confidenceSource: null,
  confidenceSourceUrl: null,
  confidenceNote: null,
  source: 'manual',
  createdAt: '2026-07-14T08:00:00.000Z',
  updatedAt: '2026-07-14T08:00:00.000Z',
};

function routineStep(
  id: string,
  category: RoutineStep['category'],
  position: number,
): RoutineStep {
  return {
    id,
    routineId: 'morning-routine',
    productId: null,
    title: category,
    category,
    instruction: null,
    position,
    isActive: true,
    selectedWeekdays: allWeekdays(),
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
  };
}

function definition(
  period: RoutinePeriod,
  steps: RoutineStep[],
): RoutineDefinition {
  return {
    routine: {
      id: `${period}-routine`,
      name: period === 'morning' ? 'Routine du matin' : 'Routine du soir',
      period,
      createdAt: '2026-07-14T08:00:00.000Z',
      updatedAt: '2026-07-14T08:00:00.000Z',
    },
    steps,
  };
}

function showDefinitions(morning: RoutineDefinition | null) {
  mockedRepository.getRoutineForEditing.mockImplementation(async (period) =>
    period === 'morning' ? morning : null,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  showDefinitions(null);
  mockedRepository.createRoutine.mockResolvedValue({
    routine: definition('morning', []).routine,
    steps: [],
    scheduledDate: '2026-07-14',
  });
  mockedRepository.replaceRoutineForFuture.mockResolvedValue(undefined);
  mockedProductRepository.listOwnedProducts.mockResolvedValue([serumProduct]);
});

it('creates a fixed-name routine from a controlled category placeholder', async () => {
  const onSaved = jest.fn();
  const view = await render(<RoutineManager onboarding onSaved={onSaved} />);

  await fireEvent.press(await view.findByLabelText('Créer Routine du matin'));
  await fireEvent.press(view.getByText('Ajouter un placeholder'));
  await fireEvent.press(view.getByText('Nettoyant'));
  await fireEvent.press(view.getByLabelText('Enregistrer Routine du matin'));

  await waitFor(() =>
    expect(mockedRepository.createRoutine).toHaveBeenCalledWith({
      name: 'Routine du matin',
      period: 'morning',
      steps: [
        expect.objectContaining({
          productId: null,
          title: 'Nettoyant',
          category: 'Nettoyant',
          position: 0,
          isActive: true,
          selectedWeekdays: [0, 1, 2, 3, 4, 5, 6],
        }),
      ],
    }),
  );
  expect(onSaved).toHaveBeenCalledTimes(1);
});

it('replaces a compatible placeholder without losing its planning or instruction', async () => {
  showDefinitions(
    definition('morning', [
      {
        ...routineStep('serum-placeholder', 'Sérum', 0),
        instruction: 'Deux gouttes',
        selectedWeekdays: [1, 3, 5],
      },
    ]),
  );
  const view = await render(<RoutineManager onSaved={jest.fn()} />);

  await fireEvent.press(
    await view.findByLabelText('Modifier Routine du matin'),
  );
  await fireEvent.press(view.getByLabelText('Lier un produit à Sérum'));
  await fireEvent.press(
    await view.findByLabelText('Ajouter Exemple Sérum apaisant à la routine'),
  );
  await fireEvent.press(view.getByText('Terminer'));
  await fireEvent.press(view.getByLabelText('Enregistrer Routine du matin'));

  await waitFor(() =>
    expect(mockedRepository.replaceRoutineForFuture).toHaveBeenCalledWith({
      routineId: 'morning-routine',
      effectiveFrom: nextLocalDate(new Date()),
      steps: [
        expect.objectContaining({
          productId: 'serum-product',
          title: 'Sérum apaisant',
          category: 'Sérum',
          instruction: 'Deux gouttes',
          selectedWeekdays: [1, 3, 5],
        }),
      ],
    }),
  );
});

it('keeps the routine draft while a scanned product returns to the editor', async () => {
  showDefinitions(
    definition('morning', [routineStep('cleanser', 'Nettoyant', 0)]),
  );
  let scannerOrigin: RoutineProductScannerProps['origin'] | null = null;
  function ProductScanner(props: RoutineProductScannerProps) {
    scannerOrigin = props.origin;
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => props.onProductSelected(serumProduct)}
      >
        <Text>Choisir le produit scanné</Text>
      </Pressable>
    );
  }
  const view = await render(
    <RoutineManager onSaved={jest.fn()} ProductScanner={ProductScanner} />,
  );

  await fireEvent.press(
    await view.findByLabelText('Modifier Routine du matin'),
  );
  await fireEvent.press(
    view.getByLabelText('Ajouter un produit à Routine du matin'),
  );
  await fireEvent.press(await view.findByText('Scanner un nouveau produit'));
  await fireEvent.press(view.getByText('Choisir le produit scanné'));
  await fireEvent.press(view.getByText('Terminer'));
  await fireEvent.press(view.getByLabelText('Enregistrer Routine du matin'));

  expect(scannerOrigin).toEqual({
    kind: 'routine-editor',
    routineId: 'morning-routine',
    routinePeriod: 'morning',
  });
  await waitFor(() => {
    const input = mockedRepository.replaceRoutineForFuture.mock.calls[0][0];
    expect(input.steps).toEqual([
      expect.objectContaining({ category: 'Nettoyant', productId: null }),
      expect.objectContaining({
        category: 'Sérum',
        productId: 'serum-product',
      }),
    ]);
  });
});

it('allows the same product in more than one routine step', async () => {
  showDefinitions(
    definition('morning', [
      {
        ...routineStep('existing-serum', 'Sérum', 0),
        productId: serumProduct.id,
        title: serumProduct.name,
      },
    ]),
  );
  const view = await render(<RoutineManager onSaved={jest.fn()} />);

  await fireEvent.press(
    await view.findByLabelText('Modifier Routine du matin'),
  );
  await fireEvent.press(
    view.getByLabelText('Ajouter un produit à Routine du matin'),
  );
  await fireEvent.press(
    await view.findByLabelText('Ajouter Exemple Sérum apaisant à la routine'),
  );
  await fireEvent.press(view.getByText('Terminer'));
  await fireEvent.press(view.getByLabelText('Enregistrer Routine du matin'));

  await waitFor(() => {
    const input = mockedRepository.replaceRoutineForFuture.mock.calls[0][0];
    expect(
      input.steps.filter((step) => step.productId === serumProduct.id),
    ).toHaveLength(2);
  });
});

it('modifies the planning and optional instruction in a future revision', async () => {
  showDefinitions(
    definition('morning', [routineStep('cleanser', 'Nettoyant', 0)]),
  );
  const view = await render(<RoutineManager onSaved={jest.fn()} />);

  await fireEvent.press(
    await view.findByLabelText('Modifier Routine du matin'),
  );
  await fireEvent.press(
    view.getByLabelText('Configurer Nettoyant, Tous les jours'),
  );
  await fireEvent.press(view.getByText('Certains jours'));
  await fireEvent.changeText(
    view.getByLabelText('Instruction pour Nettoyant'),
    'Masser doucement',
  );
  await fireEvent.press(view.getByText('Terminer'));
  await fireEvent.press(view.getByLabelText('Enregistrer Routine du matin'));

  await waitFor(() =>
    expect(mockedRepository.replaceRoutineForFuture).toHaveBeenCalledWith({
      routineId: 'morning-routine',
      effectiveFrom: nextLocalDate(new Date()),
      steps: [
        expect.objectContaining({
          category: 'Nettoyant',
          instruction: 'Masser doucement',
          isActive: true,
          selectedWeekdays: [1, 2, 3, 4, 5],
        }),
      ],
    }),
  );
});

it('stores the visible order after reordering steps', async () => {
  showDefinitions(
    definition('morning', [
      routineStep('cleanser', 'Nettoyant', 0),
      routineStep('moisturizer', 'Hydratant', 1),
    ]),
  );
  const view = await render(<RoutineManager onSaved={jest.fn()} />);

  await fireEvent.press(
    await view.findByLabelText('Modifier Routine du matin'),
  );
  await fireEvent.press(view.getByLabelText('Descendre Nettoyant'));
  await fireEvent.press(view.getByLabelText('Enregistrer Routine du matin'));

  await waitFor(() => {
    const input = mockedRepository.replaceRoutineForFuture.mock.calls[0][0];
    expect(input.steps.map((step) => [step.category, step.position])).toEqual([
      ['Hydratant', 0],
      ['Nettoyant', 1],
    ]);
  });
});

it('confirms deletion and saves the remaining steps', async () => {
  showDefinitions(
    definition('morning', [
      routineStep('cleanser', 'Nettoyant', 0),
      routineStep('moisturizer', 'Hydratant', 1),
    ]),
  );
  jest.spyOn(Alert, 'alert').mockImplementation((title, _message, buttons) => {
    if (String(title).startsWith('Supprimer')) {
      buttons?.find((button) => button.text === 'Supprimer')?.onPress?.();
    }
  });
  const view = await render(<RoutineManager onSaved={jest.fn()} />);

  await fireEvent.press(
    await view.findByLabelText('Modifier Routine du matin'),
  );
  await fireEvent.press(view.getByLabelText('Supprimer Nettoyant'));
  await fireEvent.press(view.getByLabelText('Enregistrer Routine du matin'));

  await waitFor(() => {
    const input = mockedRepository.replaceRoutineForFuture.mock.calls[0][0];
    expect(input.steps).toHaveLength(1);
    expect(input.steps[0]).toEqual(
      expect.objectContaining({ category: 'Hydratant', position: 0 }),
    );
  });
});

it('warns clearly instead of saving an empty routine', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const view = await render(<RoutineManager onboarding onSaved={jest.fn()} />);

  await fireEvent.press(await view.findByLabelText('Créer Routine du soir'));
  await fireEvent.press(view.getByLabelText('Enregistrer Routine du soir'));

  expect(alert).toHaveBeenCalledWith(
    'Ajoute au moins une étape',
    'Une routine vide ne peut pas être enregistrée.',
  );
  expect(mockedRepository.createRoutine).not.toHaveBeenCalled();
});
