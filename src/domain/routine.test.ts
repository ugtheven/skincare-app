import {
  getRoutineProgress,
  scheduledDateForRoutine,
  type Routine,
  type RoutineOccurrence,
} from './routine';

const morningRoutine: Routine = {
  id: 'morning',
  name: 'Routine du matin',
  period: 'morning',
  createdAt: '2026-07-12T00:00:00.000Z',
  updatedAt: '2026-07-12T00:00:00.000Z',
};

const eveningRoutine: Routine = {
  ...morningRoutine,
  id: 'evening',
  name: 'Routine du soir',
  period: 'evening',
};

describe('scheduledDateForRoutine', () => {
  it('keeps an evening routine on its planned day after midnight', () => {
    expect(
      scheduledDateForRoutine(eveningRoutine, new Date(2026, 6, 13, 1, 30)),
    ).toBe('2026-07-12');
  });

  it('starts a new evening occurrence from 4am', () => {
    expect(
      scheduledDateForRoutine(eveningRoutine, new Date(2026, 6, 13, 4, 0)),
    ).toBe('2026-07-13');
  });

  it('keeps a morning routine on the current day', () => {
    expect(
      scheduledDateForRoutine(morningRoutine, new Date(2026, 6, 13, 1, 30)),
    ).toBe('2026-07-13');
  });
});

describe('getRoutineProgress', () => {
  it('derives the completion state from the steps', () => {
    const occurrence: RoutineOccurrence = {
      routine: morningRoutine,
      scheduledDate: '2026-07-12',
      steps: [
        {
          id: '1',
          routineId: 'morning',
          productId: null,
          title: 'Nettoyant',
          position: 0,
          completed: true,
          createdAt: '2026-07-12T00:00:00.000Z',
          updatedAt: '2026-07-12T00:00:00.000Z',
        },
        {
          id: '2',
          routineId: 'morning',
          productId: null,
          title: 'Hydratant',
          position: 1,
          completed: false,
          createdAt: '2026-07-12T00:00:00.000Z',
          updatedAt: '2026-07-12T00:00:00.000Z',
        },
      ],
    };

    expect(getRoutineProgress(occurrence)).toEqual({
      completed: 1,
      total: 2,
      isComplete: false,
    });
  });
});
