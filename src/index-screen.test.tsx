import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { RoutineOccurrence } from '@/domain/routine';
import type { TodayOccurrences } from '@/hooks/use-routine';

import HomeScreen, { TodaySupportSections } from './app/index';

const mockUseRoutine = jest.fn();
const setActivePeriod = jest.fn();
const setStepStatus = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/app/products', () => ({ RoutineProductScanner: () => null }));
jest.mock('@/components/first-routine-onboarding', () => ({
  FirstRoutineOnboarding: () => null,
}));
jest.mock('@/components/routine-editor', () => ({
  RoutineManager: () => null,
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
    refresh: jest.fn(),
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

it('keeps both routines reachable and distinguishes placeholders from products', async () => {
  const view = await render(<HomeScreen />);

  expect(
    view.getByRole('tab', { name: 'Routine du matin' }).props
      .accessibilityState,
  ).toEqual({ selected: true });
  expect(view.getByRole('tab', { name: 'Routine du soir' })).toBeTruthy();
  expect(view.getByText('Hydratant · sans produit')).toBeTruthy();
  expect(view.getByText('Sérum')).toBeTruthy();
  expect(view.getByText('Masser doucement')).toBeTruthy();

  await fireEvent.press(view.getByRole('tab', { name: 'Routine du soir' }));
  expect(setActivePeriod).toHaveBeenCalledWith('evening');
});

it('offers complete and skip as explicit one-tap actions', async () => {
  const view = await render(<HomeScreen />);

  await fireEvent.press(view.getByLabelText('Hydratant, À faire'));
  expect(setStepStatus).toHaveBeenCalledWith(
    'morning',
    'morning-placeholder',
    'completed',
  );

  await fireEvent.press(view.getByLabelText('Ignorer Hydratant aujourd’hui'));
  expect(setStepStatus).toHaveBeenCalledWith(
    'morning',
    'morning-placeholder',
    'skipped',
  );
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
  expect(view.getByText('Routine commencée aujourd’hui')).toBeTruthy();
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
