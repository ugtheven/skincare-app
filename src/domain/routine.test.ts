import {
  deriveRoutineDayState,
  isStepScheduledForDate,
  getRoutineProgress,
  preferredRoutinePeriod,
  recognizedRoutineCategory,
  routineCategoryForProduct,
  scheduledDateForRoutine,
  suggestedRoutineInsertionIndex,
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

describe('preferredRoutinePeriod', () => {
  it.each([
    [3, 'evening'],
    [4, 'morning'],
    [17, 'morning'],
    [18, 'evening'],
  ] as const)('selects %s:00 as %s', (hour, period) => {
    expect(preferredRoutinePeriod(new Date(2026, 6, 13, hour))).toBe(period);
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
          category: 'Nettoyant',
          instruction: null,
          position: 0,
          isActive: true,
          selectedWeekdays: [0, 1, 2, 3, 4, 5, 6],
          completed: true,
          status: 'completed',
          createdAt: '2026-07-12T00:00:00.000Z',
          updatedAt: '2026-07-12T00:00:00.000Z',
        },
        {
          id: '2',
          routineId: 'morning',
          productId: null,
          title: 'Hydratant',
          category: 'Hydratant',
          instruction: null,
          position: 1,
          isActive: true,
          selectedWeekdays: [0, 1, 2, 3, 4, 5, 6],
          completed: false,
          status: null,
          createdAt: '2026-07-12T00:00:00.000Z',
          updatedAt: '2026-07-12T00:00:00.000Z',
        },
      ],
    };

    expect(getRoutineProgress(occurrence)).toEqual({
      completed: 1,
      skipped: 0,
      handled: 1,
      remaining: 1,
      total: 2,
      isComplete: false,
      isResolved: false,
    });
  });
});

describe('deriveRoutineDayState', () => {
  function occurrenceWithStatuses(
    statuses: RoutineOccurrence['steps'][number]['status'][],
  ): RoutineOccurrence {
    return {
      routine: morningRoutine,
      scheduledDate: '2026-07-12',
      steps: statuses.map((status, position) => ({
        id: `step-${position}`,
        routineId: morningRoutine.id,
        productId: null,
        title: 'Étape',
        category: 'Autre',
        instruction: null,
        position,
        isActive: true,
        selectedWeekdays: [0, 1, 2, 3, 4, 5, 6],
        completed: status === 'completed',
        status,
        createdAt: '2026-07-12T00:00:00.000Z',
        updatedAt: '2026-07-12T00:00:00.000Z',
      })),
    };
  }

  it.each([
    [['completed', 'completed'], 'completed'],
    [['completed', null], 'partially_completed'],
    [['completed', 'skipped'], 'partially_completed'],
    [['skipped', 'skipped'], 'deliberately_skipped'],
    [['skipped', null], 'not_recorded'],
    [[null, null], 'not_recorded'],
  ] as const)('derives %s as %s', (statuses, expected) => {
    expect(deriveRoutineDayState([occurrenceWithStatuses([...statuses])])).toBe(
      expected,
    );
  });

  it('keeps a day without planned steps neutral', () => {
    expect(deriveRoutineDayState([occurrenceWithStatuses([]), null])).toBe(
      'not_scheduled',
    );
  });
});

describe('routine scheduling', () => {
  const weekdayStep = {
    isActive: true,
    selectedWeekdays: [1, 3, 5] as const,
  };

  it('handles the Sunday to Monday boundary with local calendar dates', () => {
    expect(isStepScheduledForDate(weekdayStep, '2026-07-12')).toBe(false);
    expect(isStepScheduledForDate(weekdayStep, '2026-07-13')).toBe(true);
  });

  it('uses the local weekday through the daylight-saving transition', () => {
    expect(isStepScheduledForDate(weekdayStep, '2026-03-29')).toBe(false);
    expect(isStepScheduledForDate(weekdayStep, '2026-03-30')).toBe(true);
  });

  it('does not schedule a temporarily disabled step', () => {
    expect(
      isStepScheduledForDate({ ...weekdayStep, isActive: false }, '2026-07-13'),
    ).toBe(false);
  });
});

describe('legacy step migration categories', () => {
  it.each([
    ['Nettoyant doux', 'Nettoyant'],
    ['Sérum hydratant', 'Sérum'],
    ['Étape personnalisée', 'Autre'],
  ] as const)('recognizes %s as %s when possible', (title, category) => {
    expect(recognizedRoutineCategory(title)).toBe(category);
  });
});

describe('product linking', () => {
  it('maps only controlled routine categories and falls back to Autre', () => {
    expect(routineCategoryForProduct('Sérum')).toBe('Sérum');
    expect(routineCategoryForProduct('Soin des lèvres')).toBe('Autre');
    expect(routineCategoryForProduct(null)).toBe('Autre');
  });

  it('inserts deterministically after equal categories and before later ones', () => {
    expect(
      suggestedRoutineInsertionIndex(
        [
          { category: 'Nettoyant' },
          { category: 'Sérum' },
          { category: 'Sérum' },
          { category: 'Hydratant' },
        ],
        'Sérum',
      ),
    ).toBe(3);
    expect(
      suggestedRoutineInsertionIndex(
        [{ category: 'Nettoyant' }, { category: 'Hydratant' }],
        'Tonique',
      ),
    ).toBe(1);
  });
});
