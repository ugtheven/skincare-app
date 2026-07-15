import { useCallback, useEffect, useState } from 'react';

import { routineRepository } from '@/data/sqlite-routine-repository';
import {
  preferredRoutinePeriod,
  scheduledDateForPeriod,
  type DailyStepStatus,
  type RoutineOccurrence,
  type RoutinePeriod,
} from '@/domain/routine';

export type TodayOccurrences = Record<RoutinePeriod, RoutineOccurrence | null>;

const EMPTY_OCCURRENCES: TodayOccurrences = {
  morning: null,
  evening: null,
};

export function useRoutine() {
  const [occurrences, setOccurrences] =
    useState<TodayOccurrences>(EMPTY_OCCURRENCES);
  const [activePeriod, setActivePeriod] = useState<RoutinePeriod>(() =>
    preferredRoutinePeriod(new Date()),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const now = new Date();
      const preferredPeriod = preferredRoutinePeriod(now);
      const routineDayDate = scheduledDateForPeriod(preferredPeriod, now);
      const [morning, evening] = await Promise.all([
        routineRepository.getOccurrenceForDate({
          period: 'morning',
          scheduledDate: routineDayDate,
        }),
        routineRepository.getOccurrenceForDate({
          period: 'evening',
          scheduledDate: routineDayDate,
        }),
      ]);
      const nextOccurrences = { morning, evening };
      const fallbackPeriod =
        preferredPeriod === 'morning' ? 'evening' : 'morning';
      setOccurrences(nextOccurrences);
      setActivePeriod(
        nextOccurrences[preferredPeriod]
          ? preferredPeriod
          : nextOccurrences[fallbackPeriod]
            ? fallbackPeriod
            : preferredPeriod,
      );
    } catch {
      setError('Les routines ne peuvent pas être chargées pour le moment.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setStepStatus = useCallback(
    async (
      period: RoutinePeriod,
      stepId: string,
      status: DailyStepStatus | null,
    ) => {
      const occurrence = occurrences[period];
      if (!occurrence) return;

      const currentStep = occurrence.steps.find((step) => step.id === stepId);
      if (!currentStep || currentStep.status === status) return;

      const previousStatus = currentStep.status;
      setError(null);
      setOccurrences({
        ...occurrences,
        [period]: {
          ...occurrence,
          steps: occurrence.steps.map((step) =>
            step.id === stepId
              ? {
                  ...step,
                  completed: status === 'completed',
                  status,
                }
              : step,
          ),
        },
      });

      try {
        await routineRepository.setStepStatus({
          stepId,
          scheduledDate: occurrence.scheduledDate,
          status,
        });
      } catch {
        setOccurrences((currentOccurrences) => {
          const currentOccurrence = currentOccurrences[period];
          if (!currentOccurrence) return currentOccurrences;

          return {
            ...currentOccurrences,
            [period]: {
              ...currentOccurrence,
              steps: currentOccurrence.steps.map((step) =>
                step.id === stepId && step.status === status
                  ? {
                      ...step,
                      completed: previousStatus === 'completed',
                      status: previousStatus,
                    }
                  : step,
              ),
            },
          };
        });
        setError('Cette étape n’a pas pu être enregistrée. Réessaie.');
      }
    },
    [occurrences],
  );

  return {
    activePeriod,
    error,
    isLoading,
    occurrences,
    refresh,
    setActivePeriod,
    setStepStatus,
  };
}
