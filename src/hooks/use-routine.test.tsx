import { act, renderHook } from '@testing-library/react-native';

import { routineRepository } from '@/data/sqlite-routine-repository';
import type { RoutineOccurrence } from '@/domain/routine';

import { useRoutine } from './use-routine';

jest.mock('@/data/sqlite-routine-repository', () => ({
  routineRepository: {
    getOccurrenceForDate: jest.fn(),
    setStepStatus: jest.fn(),
  },
}));

const mockedRepository = routineRepository as jest.Mocked<
  typeof routineRepository
>;

function occurrence(period: 'morning' | 'evening'): RoutineOccurrence {
  return {
    routine: {
      id: `${period}-routine`,
      name: period === 'morning' ? 'Routine du matin' : 'Routine du soir',
      period,
      createdAt: '2026-07-15T08:00:00.000Z',
      updatedAt: '2026-07-15T08:00:00.000Z',
    },
    scheduledDate: '2026-07-14',
    steps: [
      {
        id: `${period}-step`,
        routineId: `${period}-routine`,
        productId: null,
        title: 'Hydratant',
        category: 'Hydratant',
        instruction: null,
        position: 0,
        isActive: true,
        selectedWeekdays: [0, 1, 2, 3, 4, 5, 6],
        completed: false,
        status: null,
        createdAt: '2026-07-15T08:00:00.000Z',
        updatedAt: '2026-07-15T08:00:00.000Z',
      },
    ],
  };
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 6, 15, 2, 30));
  jest.clearAllMocks();
  mockedRepository.getOccurrenceForDate.mockImplementation(async ({ period }) =>
    occurrence(period),
  );
  mockedRepository.setStepStatus.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

it('opens the relevant evening routine and preserves the 04:00 carryover', async () => {
  const { result } = await renderHook(() => useRoutine());

  expect(result.current.isLoading).toBe(false);
  expect(result.current.activePeriod).toBe('evening');
  expect(mockedRepository.getOccurrenceForDate).toHaveBeenCalledWith({
    period: 'morning',
    scheduledDate: '2026-07-14',
  });
  expect(mockedRepository.getOccurrenceForDate).toHaveBeenCalledWith({
    period: 'evening',
    scheduledDate: '2026-07-14',
  });
});

it('updates one step optimistically and persists its explicit status', async () => {
  const { result } = await renderHook(() => useRoutine());
  expect(result.current.isLoading).toBe(false);

  await act(async () => {
    await result.current.setStepStatus('evening', 'evening-step', 'skipped');
  });

  expect(result.current.occurrences.evening?.steps[0]).toMatchObject({
    completed: false,
    status: 'skipped',
  });
  expect(mockedRepository.setStepStatus).toHaveBeenCalledWith({
    stepId: 'evening-step',
    scheduledDate: '2026-07-14',
    status: 'skipped',
  });
});

it('restores the previous state when persistence fails', async () => {
  mockedRepository.setStepStatus.mockRejectedValueOnce(new Error('disk full'));
  const { result } = await renderHook(() => useRoutine());
  expect(result.current.isLoading).toBe(false);

  await act(async () => {
    await result.current.setStepStatus('morning', 'morning-step', 'completed');
  });

  expect(result.current.occurrences.morning?.steps[0].status).toBeNull();
  expect(result.current.error).toBe(
    'Cette étape n’a pas pu être enregistrée. Réessaie.',
  );
});
