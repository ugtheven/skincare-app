export type RoutinePeriod = 'morning' | 'evening';

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
  title: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type RoutineOccurrence = {
  routine: Routine;
  steps: (RoutineStep & { completed: boolean })[];
  scheduledDate: string;
};

export const EVENING_CARRYOVER_HOUR = 4;

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function scheduledDateForRoutine(routine: Routine, now: Date): string {
  const scheduledOn = new Date(now);

  if (routine.period === 'evening' && now.getHours() < EVENING_CARRYOVER_HOUR) {
    scheduledOn.setDate(scheduledOn.getDate() - 1);
  }

  return formatLocalDate(scheduledOn);
}

export function getRoutineProgress(occurrence: RoutineOccurrence) {
  const completed = occurrence.steps.filter((step) => step.completed).length;

  return {
    completed,
    total: occurrence.steps.length,
    isComplete:
      occurrence.steps.length > 0 && completed === occurrence.steps.length,
  };
}
