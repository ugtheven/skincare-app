export type RoutinePeriod = 'morning' | 'evening';

export const ROUTINE_CATEGORIES = [
  'Démaquillant',
  'Nettoyant',
  'Exfoliant',
  'Tonique',
  'Sérum',
  'Soin ciblé',
  'Soin contour des yeux',
  'Hydratant',
  'Protection solaire',
  'Masque',
  'Autre',
] as const;

export type RoutineCategory = (typeof ROUTINE_CATEGORIES)[number];
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type DailyStepStatus = 'completed' | 'skipped';
export type RoutineDayState =
  | 'completed'
  | 'partially_completed'
  | 'deliberately_skipped'
  | 'not_recorded'
  | 'not_scheduled';

export type Routine = {
  id: string;
  name: string;
  period: RoutinePeriod;
  createdAt: string;
  updatedAt: string;
};

export type RoutineStep = {
  id: string;
  routineId: string;
  productId: string | null;
  productImageUrl?: string | null;
  title: string;
  category: RoutineCategory;
  instruction: string | null;
  position: number;
  isActive: boolean;
  selectedWeekdays: Weekday[];
  createdAt: string;
  updatedAt: string;
};

export type RoutineOccurrence = {
  routine: Routine;
  steps: (RoutineStep & {
    completed: boolean;
    status: DailyStepStatus | null;
  })[];
  scheduledDate: string;
};

export type RoutineDefinition = {
  routine: Routine;
  steps: RoutineStep[];
};

export const EVENING_CARRYOVER_HOUR = 4;
export const EVENING_START_HOUR = 18;
const EVERY_DAY: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function nextLocalDate(date: Date): string {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return formatLocalDate(next);
}

export function scheduledDateForRoutine(routine: Routine, now: Date): string {
  return scheduledDateForPeriod(routine.period, now);
}

export function scheduledDateForPeriod(
  period: RoutinePeriod,
  now: Date,
): string {
  const scheduledOn = new Date(now);

  if (period === 'evening' && now.getHours() < EVENING_CARRYOVER_HOUR) {
    scheduledOn.setDate(scheduledOn.getDate() - 1);
  }

  return formatLocalDate(scheduledOn);
}

export function preferredRoutinePeriod(now: Date): RoutinePeriod {
  const hour = now.getHours();
  return hour < EVENING_CARRYOVER_HOUR || hour >= EVENING_START_HOUR
    ? 'evening'
    : 'morning';
}

export function weekdayForLocalDate(localDate: string): Weekday {
  return new Date(`${localDate}T12:00:00`).getDay() as Weekday;
}

export function isStepScheduledForDate(
  step: Pick<RoutineStep, 'isActive'> & {
    selectedWeekdays: readonly Weekday[];
  },
  localDate: string,
): boolean {
  return (
    step.isActive &&
    step.selectedWeekdays.includes(weekdayForLocalDate(localDate))
  );
}

export function recognizedRoutineCategory(title: string): RoutineCategory {
  const normalized = title.trim().toLocaleLowerCase('fr-FR');
  const categories: [RoutineCategory, RegExp][] = [
    ['Démaquillant', /démaquill|micellaire|makeup remover/],
    ['Nettoyant', /nettoy|cleanser|cleaning|face wash/],
    ['Exfoliant', /exfol|peeling|gommage|scrub/],
    ['Tonique', /tonique|toner|essence/],
    ['Sérum', /sérum|serum/],
    ['Soin ciblé', /traitement|spot|cibl/],
    ['Soin contour des yeux', /contour des yeux|eye cream|eye serum/],
    ['Hydratant', /hydrat|moisturi|crème|creme|lotion/],
    ['Protection solaire', /solaire|sunscreen|sun screen|spf/],
    ['Masque', /masque|mask/],
  ];

  return (
    categories.find(([, pattern]) => pattern.test(normalized))?.[0] ?? 'Autre'
  );
}

export function allWeekdays(): Weekday[] {
  return [...EVERY_DAY];
}

export function routineNameForPeriod(period: RoutinePeriod): string {
  return period === 'morning' ? 'Routine du matin' : 'Routine du soir';
}

export function routineCategoryForProduct(
  category: string | null,
): RoutineCategory {
  return (
    ROUTINE_CATEGORIES.find((candidate) => candidate === category) ?? 'Autre'
  );
}

export function suggestedRoutineInsertionIndex(
  steps: readonly Pick<RoutineStep, 'category'>[],
  category: RoutineCategory,
): number {
  const targetRank = ROUTINE_CATEGORIES.indexOf(category);
  const nextCategoryIndex = steps.findIndex(
    (step) => ROUTINE_CATEGORIES.indexOf(step.category) > targetRank,
  );

  return nextCategoryIndex === -1 ? steps.length : nextCategoryIndex;
}

export function getRoutineProgress(occurrence: RoutineOccurrence) {
  const completed = occurrence.steps.filter(
    (step) => step.status === 'completed',
  ).length;
  const skipped = occurrence.steps.filter(
    (step) => step.status === 'skipped',
  ).length;
  const handled = completed + skipped;

  return {
    completed,
    skipped,
    handled,
    remaining: occurrence.steps.length - handled,
    total: occurrence.steps.length,
    isComplete:
      occurrence.steps.length > 0 && completed === occurrence.steps.length,
    isResolved:
      occurrence.steps.length > 0 && handled === occurrence.steps.length,
  };
}

export function deriveRoutineDayState(
  occurrences: readonly (RoutineOccurrence | null)[],
): RoutineDayState {
  const steps = occurrences.flatMap((occurrence) => occurrence?.steps ?? []);

  if (steps.length === 0) return 'not_scheduled';
  if (steps.every((step) => step.status === 'completed')) return 'completed';
  if (steps.some((step) => step.status === 'completed')) {
    return 'partially_completed';
  }
  if (steps.every((step) => step.status === 'skipped')) {
    return 'deliberately_skipped';
  }
  return 'not_recorded';
}
