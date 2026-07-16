import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, Text } from 'react-native';

import type { RoutineOccurrence } from '@/domain/routine';
import type { TodayOccurrences } from '@/hooks/use-routine';

import HomeScreen, { TodaySupportSections } from './app/index';

const mockUseRoutine = jest.fn();
const setActivePeriod = jest.fn();
const setStepStatus = jest.fn().mockResolvedValue(true);
const refresh = jest.fn().mockResolvedValue(undefined);
const mockPush = jest.fn();
const mockRoutineManager = jest.fn((_props: unknown) => null);

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => callback(),
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/app/products', () => ({ RoutineProductScanner: () => null }));
jest.mock('@/components/first-routine-onboarding', () => ({
  FirstRoutineOnboarding: () => null,
}));
jest.mock('@/components/routine-editor', () => ({
  RoutineManager: (props: unknown) => mockRoutineManager(props),
}));
jest.mock('@/hooks/use-routine', () => ({
  useRoutine: () => mockUseRoutine(),
}));

function occurrence(
  period: 'morning' | 'evening',
  statuses: RoutineOccurrence['steps'][number]['status'][] = [null, null],
): RoutineOccurrence {
  return {
    routine: {
      id: `${period}-routine`,
      name: period === 'morning' ? 'Routine du matin' : 'Routine du soir',
      period,
      createdAt: '2026-07-15T08:00:00.000Z',
      updatedAt: '2026-07-15T08:00:00.000Z',
    },
    scheduledDate: '2026-07-15',
    steps: [
      {
        id: `${period}-placeholder`,
        routineId: `${period}-routine`,
        productId: null,
        productImageUrl: null,
        title: 'Hydratant',
        category: 'Hydratant',
        instruction: 'Masser doucement',
        position: 0,
        isActive: true,
        selectedWeekdays: [0, 1, 2, 3, 4, 5, 6],
        completed: statuses[0] === 'completed',
        status: statuses[0] ?? null,
        createdAt: '2026-07-15T08:00:00.000Z',
        updatedAt: '2026-07-15T08:00:00.000Z',
      },
      {
        id: `${period}-product`,
        routineId: `${period}-routine`,
        productId: 'product-1',
        productImageUrl: 'https://example.com/serum.webp',
        title: 'Sérum apaisant',
        category: 'Sérum',
        instruction: null,
        position: 1,
        isActive: true,
        selectedWeekdays: [0, 1, 2, 3, 4, 5, 6],
        completed: statuses[1] === 'completed',
        status: statuses[1] ?? null,
        createdAt: '2026-07-15T08:00:00.000Z',
        updatedAt: '2026-07-15T08:00:00.000Z',
      },
    ],
  };
}

function showToday(
  activePeriod: 'morning' | 'evening',
  occurrences: TodayOccurrences,
) {
  mockUseRoutine.mockReturnValue({
    activePeriod,
    error: null,
    isLoading: false,
    occurrences,
    refresh,
    setActivePeriod,
    setStepStatus,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  showToday('morning', {
    morning: occurrence('morning'),
    evening: occurrence('evening'),
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('keeps both routines reachable and distinguishes placeholders from products', async () => {
  const view = await render(<HomeScreen />);

  expect(
    view.getByRole('tab', { name: 'Routine du matin' }).props
      .accessibilityState,
  ).toEqual({ selected: true });
  expect(view.getByRole('tab', { name: 'Routine du soir' })).toBeTruthy();
  expect(view.getByText('Étape sans produit')).toBeTruthy();
  expect(view.getByText('Choisir un produit')).toBeTruthy();
  expect(view.getByText('Sérum')).toBeTruthy();
  expect(view.getByText('Masser doucement')).toBeTruthy();

  await fireEvent.press(view.getByRole('tab', { name: 'Routine du soir' }));
  expect(setActivePeriod).toHaveBeenCalledWith('evening');
});

it('shows product photos and falls back to the step category when unavailable', async () => {
  const view = await render(<HomeScreen />);

  expect(view.getAllByTestId('routine-step-image')).toHaveLength(1);
  expect(view.getAllByTestId('routine-step-category-placeholder')).toHaveLength(
    1,
  );

  await act(async () => {
    view.getByTestId('routine-step-image').props.onError({ nativeEvent: {} });
  });

  expect(view.queryByTestId('routine-step-image')).toBeNull();
  expect(view.getAllByTestId('routine-step-category-placeholder')).toHaveLength(
    2,
  );
});

it('offers complete and skip as explicit one-tap actions', async () => {
  const view = await render(<HomeScreen />);

  await fireEvent.press(view.getByLabelText('Hydratant, À faire'));
  expect(setStepStatus).toHaveBeenCalledWith(
    'morning',
    'morning-placeholder',
    'completed',
  );
  expect(
    (jest.requireMock('expo-haptics') as { impactAsync: jest.Mock })
      .impactAsync,
  ).toHaveBeenCalledTimes(1);

  await fireEvent.press(view.getByLabelText('Ignorer Hydratant aujourd’hui'));
  expect(setStepStatus).toHaveBeenCalledWith(
    'morning',
    'morning-placeholder',
    'skipped',
  );
  expect(
    (jest.requireMock('expo-haptics') as { selectionAsync: jest.Mock })
      .selectionAsync,
  ).toHaveBeenCalledTimes(1);
});

it.each([
  ['completed', 'Hydratant, Effectuée'],
  ['skipped', 'Annuler Hydratant'],
] as const)('offers one-tap undo for a %s step', async (status, label) => {
  showToday('morning', {
    morning: occurrence('morning', [status, null]),
    evening: occurrence('evening'),
  });
  const view = await render(<HomeScreen />);

  await fireEvent.press(view.getByLabelText(label));
  expect(setStepStatus).toHaveBeenCalledWith(
    'morning',
    'morning-placeholder',
    null,
  );
});

it('counts completed and deliberately skipped steps as handled', async () => {
  showToday('morning', {
    morning: occurrence('morning', ['completed', 'skipped']),
    evening: null,
  });
  const view = await render(<HomeScreen />);

  expect(view.getByText('Toutes les étapes sont renseignées')).toBeTruthy();
  expect(
    view.getByLabelText('Progression de Routine du matin').props
      .accessibilityValue,
  ).toMatchObject({ min: 0, max: 2, now: 2 });
  expect(view.getByText('2 sur 2')).toBeTruthy();
});

it('opens the selected routine directly to the placeholder product choice', async () => {
  const view = await render(<HomeScreen />);

  await fireEvent.press(
    view.getByLabelText('Choisir un produit pour Hydratant'),
  );

  expect(mockRoutineManager).toHaveBeenCalledWith(
    expect.objectContaining({
      initialEffectiveFromDate: '2026-07-15',
      initialPeriod: 'morning',
      initialProductTargetStepId: 'morning-placeholder',
    }),
  );
  expect(mockRoutineManager.mock.calls.at(-1)?.[0]).not.toHaveProperty(
    'onBrowseProducts',
  );
});

it('refreshes Today after saving its routine editor', async () => {
  const view = await render(<HomeScreen />);

  await fireEvent.press(view.getByText('Modifier cette routine'));
  const editorProps = mockRoutineManager.mock.calls.at(-1)?.[0] as {
    onSaved: () => Promise<void>;
  };
  await act(async () => editorProps.onSaved());

  expect(refresh).toHaveBeenCalledWith({
    activePeriod: 'morning',
    silent: true,
  });
});

it('shows the shared routine day and passes it when creating a missing period', async () => {
  showToday('evening', {
    morning: occurrence('morning'),
    evening: null,
  });
  const view = await render(<HomeScreen />);

  expect(view.getByText('Mercredi 15 juillet')).toBeTruthy();
  expect(view.getAllByText('Créer la routine du soir')).toHaveLength(1);
  expect(view.queryByText('Créer cette routine')).toBeNull();

  await fireEvent.press(view.getByText('Créer la routine du soir'));
  expect(mockRoutineManager).toHaveBeenCalledWith(
    expect.objectContaining({
      initialEffectiveFromDate: '2026-07-15',
      initialPeriod: 'evening',
    }),
  );
});

it('uses a fade for the routine sheet when Reduce Motion is enabled', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(true);
  const view = await render(<HomeScreen />);

  await fireEvent.press(view.getByText('Modifier cette routine'));

  expect(view.getByTestId('routine-sheet').props.animationType).toBe('fade');
});

it('keeps future Today content composable without showing empty controls', async () => {
  const empty = await render(<TodaySupportSections />);
  expect(empty.toJSON()).toBeNull();

  const populated = await render(
    <TodaySupportSections
      sunProtectionStatus={<Text>Statut solaire</Text>}
      nextUsefulAction={<Text>Prochaine action</Text>}
    />,
  );
  expect(populated.getByText('Statut solaire')).toBeTruthy();
  expect(populated.getByText('Prochaine action')).toBeTruthy();
});
