import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { routineRepository } from '@/data/sqlite-routine-repository';
import {
  preferredRoutinePeriod,
  scheduledDateForPeriod,
  type DailyStepStatus,
  type RoutineOccurrence,
  type RoutinePeriod,
} from '@/domain/routine';

export type TodayOccurrences = Record<RoutinePeriod, RoutineOccurrence | null>;

export type RoutineRefreshOptions = {
  activePeriod?: RoutinePeriod;
  silent?: boolean;
};

const EMPTY_OCCURRENCES: TodayOccurrences = {
  morning: null,
  evening: null,
};

type StepMutation = {
  persistedStatus: DailyStepStatus | null;
  queue: Promise<void>;
  sequence: number;
};

function nextRoutineBoundary(now: Date): Date {
  const candidates = [4, 18].map((hour) => {
    const boundary = new Date(now);
    boundary.setHours(hour, 0, 0, 0);
    if (boundary.getTime() <= now.getTime()) {
      boundary.setDate(boundary.getDate() + 1);
    }
    return boundary;
  });

  return candidates.reduce((next, candidate) =>
    candidate.getTime() < next.getTime() ? candidate : next,
  );
}

export function useRoutine() {
  const [occurrences, setOccurrences] =
    useState<TodayOccurrences>(EMPTY_OCCURRENCES);
  const [activePeriod, setActivePeriod] = useState<RoutinePeriod>(() =>
    preferredRoutinePeriod(new Date()),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const occurrencesRef = useRef(occurrences);
  const refreshSequenceRef = useRef(0);
  const stepMutationsRef = useRef(new Map<string, StepMutation>());

  const refresh = useCallback(async (options: RoutineRefreshOptions = {}) => {
    const requestSequence = ++refreshSequenceRef.current;
    if (!options.silent) setIsLoading(true);
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
      if (requestSequence !== refreshSequenceRef.current) return;
      occurrencesRef.current = nextOccurrences;
      setOccurrences(nextOccurrences);
      const requestedPeriod = options.activePeriod;
      setActivePeriod(
        requestedPeriod && nextOccurrences[requestedPeriod]
          ? requestedPeriod
          : nextOccurrences[preferredPeriod]
            ? preferredPeriod
            : nextOccurrences[fallbackPeriod]
              ? fallbackPeriod
              : preferredPeriod,
      );
    } catch {
      if (requestSequence === refreshSequenceRef.current) {
        setError('Les routines ne peuvent pas être chargées pour le moment.');
      }
    } finally {
      if (requestSequence === refreshSequenceRef.current) setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh({ silent: true });
    }, [refresh]),
  );

  useEffect(() => {
    let previousState: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const isReturningToForeground =
        previousState !== 'active' && nextState === 'active';
      previousState = nextState;
      if (isReturningToForeground) void refresh({ silent: true });
    });

    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    const scheduleNextRefresh = () => {
      const now = new Date();
      timeout = setTimeout(
        () => {
          void refresh({ silent: true });
          scheduleNextRefresh();
        },
        nextRoutineBoundary(now).getTime() - now.getTime(),
      );
    };

    scheduleNextRefresh();
    return () => clearTimeout(timeout);
  }, [refresh]);

  const setStepStatus = useCallback(
    async (
      period: RoutinePeriod,
      stepId: string,
      status: DailyStepStatus | null,
    ): Promise<boolean> => {
      const occurrence = occurrencesRef.current[period];
      if (!occurrence) return false;

      const currentStep = occurrence.steps.find((step) => step.id === stepId);
      if (!currentStep || currentStep.status === status) return false;

      const mutationKey = `${period}:${occurrence.scheduledDate}:${stepId}`;
      const mutation = stepMutationsRef.current.get(mutationKey) ?? {
        persistedStatus: currentStep.status,
        queue: Promise.resolve(),
        sequence: 0,
      };
      const sequence = ++mutation.sequence;
      stepMutationsRef.current.set(mutationKey, mutation);
      setError(null);
      const updateStatus = (
        currentOccurrences: TodayOccurrences,
        nextStatus: DailyStepStatus | null,
      ): TodayOccurrences => {
        const currentOccurrence = currentOccurrences[period];
        if (!currentOccurrence) return currentOccurrences;
        return {
          ...currentOccurrences,
          [period]: {
            ...currentOccurrence,
            steps: currentOccurrence.steps.map((step) =>
              step.id === stepId
                ? {
                    ...step,
                    completed: nextStatus === 'completed',
                    status: nextStatus,
                  }
                : step,
            ),
          },
        };
      };
      occurrencesRef.current = updateStatus(occurrencesRef.current, status);
      setOccurrences((currentOccurrences) => {
        const nextOccurrences = updateStatus(currentOccurrences, status);
        occurrencesRef.current = nextOccurrences;
        return nextOccurrences;
      });

      const operation = mutation.queue
        .catch(() => undefined)
        .then(async () => {
          await routineRepository.setStepStatus({
            stepId,
            scheduledDate: occurrence.scheduledDate,
            status,
          });
          mutation.persistedStatus = status;
        });
      mutation.queue = operation;

      try {
        await operation;
        const isCurrentIntent = mutation.sequence === sequence;
        if (isCurrentIntent) stepMutationsRef.current.delete(mutationKey);
        return isCurrentIntent;
      } catch {
        const isCurrentIntent = mutation.sequence === sequence;
        if (isCurrentIntent) {
          const currentStatus =
            occurrencesRef.current[period]?.steps.find(
              (step) => step.id === stepId,
            )?.status ?? null;
          if (currentStatus === status) {
            occurrencesRef.current = updateStatus(
              occurrencesRef.current,
              mutation.persistedStatus,
            );
            setOccurrences((currentOccurrences) => {
              const nextOccurrences = updateStatus(
                currentOccurrences,
                mutation.persistedStatus,
              );
              occurrencesRef.current = nextOccurrences;
              return nextOccurrences;
            });
          }
          stepMutationsRef.current.delete(mutationKey);
          setError('Cette étape n’a pas pu être enregistrée. Réessaie.');
        }
        return false;
      }
    },
    [],
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
