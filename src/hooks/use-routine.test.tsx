import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { routineRepository } from '@/data/sqlite-routine-repository';
import type { RoutineOccurrence } from '@/domain/routine';

import { useRoutine } from './use-routine';

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    jest
      .requireActual<typeof import('react')>('react')
      .useEffect(effect, [effect]);
  },
}));

jest.mock('@/data/sqlite-routine-repository', () => ({
  routineRepository: {
    getOccurrenceForDate: jest.fn(),
    setStepStatus: jest.fn(),
  },
}));

const mockedRepository = routineRepository as jest.Mocked<
  typeof routineRepository
>;

let appStateListener: ((state: AppStateStatus) => void) | undefined;
const removeAppStateListener = jest.fn();

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

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
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type, listener) => {
      appStateListener = listener;
      return { remove: removeAppStateListener } as never;
    });
});

afterEach(() => {
  jest.restoreAllMocks();
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

  let persisted = false;
  await act(async () => {
    persisted = await result.current.setStepStatus(
      'evening',
      'evening-step',
      'skipped',
    );
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
  expect(persisted).toBe(true);
});

it('restores the previous state when persistence fails', async () => {
  mockedRepository.setStepStatus.mockRejectedValueOnce(new Error('disk full'));
  const { result } = await renderHook(() => useRoutine());
  expect(result.current.isLoading).toBe(false);

  let persisted = true;
  await act(async () => {
    persisted = await result.current.setStepStatus(
      'morning',
      'morning-step',
      'completed',
    );
  });

  expect(result.current.occurrences.morning?.steps[0].status).toBeNull();
  expect(result.current.error).toBe(
    'Cette étape n’a pas pu être enregistrée. Réessaie.',
  );
  expect(persisted).toBe(false);
});

it('serializes rapid taps and only confirms the latest persisted intention', async () => {
  const firstWrite = deferred<void>();
  const secondWrite = deferred<void>();
  mockedRepository.setStepStatus
    .mockReturnValueOnce(firstWrite.promise)
    .mockReturnValueOnce(secondWrite.promise);
  const { result } = await renderHook(() => useRoutine());

  let firstResult: boolean | undefined;
  let secondResult: boolean | undefined;
  let first!: Promise<void>;
  let second!: Promise<void>;
  await act(async () => {
    first = result.current
      .setStepStatus('evening', 'evening-step', 'completed')
      .then((value) => {
        firstResult = value;
      });
    second = result.current
      .setStepStatus('evening', 'evening-step', 'skipped')
      .then((value) => {
        secondResult = value;
      });
    await Promise.resolve();
  });

  expect(result.current.occurrences.evening?.steps[0].status).toBe('skipped');
  await act(async () => undefined);
  expect(mockedRepository.setStepStatus).toHaveBeenCalledTimes(1);

  await act(async () => {
    firstWrite.resolve();
    await first;
  });
  expect(mockedRepository.setStepStatus).toHaveBeenCalledTimes(2);
  await act(async () => {
    secondWrite.resolve();
    await second;
  });

  expect(firstResult).toBe(false);
  expect(secondResult).toBe(true);
  expect(result.current.occurrences.evening?.steps[0].status).toBe('skipped');
});

it('rolls the latest failed intention back to the last persisted status', async () => {
  const firstWrite = deferred<void>();
  const secondWrite = deferred<void>();
  mockedRepository.setStepStatus
    .mockReturnValueOnce(firstWrite.promise)
    .mockReturnValueOnce(secondWrite.promise);
  const { result } = await renderHook(() => useRoutine());

  let first!: Promise<boolean>;
  let second!: Promise<boolean>;
  await act(async () => {
    first = result.current.setStepStatus(
      'morning',
      'morning-step',
      'completed',
    );
    second = result.current.setStepStatus('morning', 'morning-step', 'skipped');
    await Promise.resolve();
  });
  await act(async () => undefined);
  await act(async () => {
    firstWrite.resolve();
    await first;
  });
  await act(async () => {
    secondWrite.reject(new Error('disk full'));
    await expect(second).resolves.toBe(false);
  });

  expect(result.current.occurrences.morning?.steps[0].status).toBe('completed');
  expect(result.current.error).toBe(
    'Cette étape n’a pas pu être enregistrée. Réessaie.',
  );
});

it('refreshes silently when the app returns to the foreground', async () => {
  const { result } = await renderHook(() => useRoutine());
  mockedRepository.getOccurrenceForDate.mockClear();

  await act(async () => {
    appStateListener?.('background');
    appStateListener?.('active');
  });

  expect(mockedRepository.getOccurrenceForDate).toHaveBeenCalledTimes(2);
  expect(result.current.isLoading).toBe(false);
  expect(result.current.occurrences.evening).not.toBeNull();
});

it('keeps existing content visible during a silent refresh', async () => {
  const { result } = await renderHook(() => useRoutine());
  const morningRefresh = deferred<RoutineOccurrence | null>();
  const eveningRefresh = deferred<RoutineOccurrence | null>();
  mockedRepository.getOccurrenceForDate
    .mockReturnValueOnce(morningRefresh.promise)
    .mockReturnValueOnce(eveningRefresh.promise);

  let refresh!: Promise<void>;
  await act(async () => {
    refresh = result.current.refresh({ silent: true });
    await Promise.resolve();
  });

  expect(result.current.isLoading).toBe(false);
  expect(result.current.occurrences.evening?.routine.id).toBe(
    'evening-routine',
  );

  await act(async () => {
    morningRefresh.resolve(occurrence('morning'));
    eveningRefresh.resolve(occurrence('evening'));
    await refresh;
  });
});

it('preserves an explicitly selected period after a contextual edit', async () => {
  jest.setSystemTime(new Date(2026, 6, 15, 10, 0));
  const { result } = await renderHook(() => useRoutine());
  expect(result.current.activePeriod).toBe('morning');

  await act(async () => {
    await result.current.refresh({ activePeriod: 'evening', silent: true });
  });

  expect(result.current.activePeriod).toBe('evening');
});

it('refreshes at 04:00 and switches to the morning routine day', async () => {
  const { result } = await renderHook(() => useRoutine());
  mockedRepository.getOccurrenceForDate.mockClear();

  await act(async () => {
    await jest.advanceTimersByTimeAsync(90 * 60 * 1000);
  });

  expect(mockedRepository.getOccurrenceForDate).toHaveBeenCalledWith({
    period: 'morning',
    scheduledDate: '2026-07-15',
  });
  expect(result.current.activePeriod).toBe('morning');
  expect(result.current.isLoading).toBe(false);
});

it('refreshes at 18:00 and switches to the evening routine', async () => {
  jest.setSystemTime(new Date(2026, 6, 15, 17, 30));
  const { result } = await renderHook(() => useRoutine());
  expect(result.current.activePeriod).toBe('morning');
  mockedRepository.getOccurrenceForDate.mockClear();

  await act(async () => {
    await jest.advanceTimersByTimeAsync(30 * 60 * 1000);
  });

  expect(mockedRepository.getOccurrenceForDate).toHaveBeenCalledWith({
    period: 'evening',
    scheduledDate: '2026-07-15',
  });
  expect(result.current.activePeriod).toBe('evening');
});
