import { useCallback, useEffect, useState } from 'react';

import { routineRepository } from '@/data/sqlite-routine-repository';
import type { RoutineOccurrence } from '@/domain/routine';

export function useRoutine() {
  const [occurrence, setOccurrence] = useState<RoutineOccurrence | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setOccurrence(await routineRepository.getCurrentOccurrence(new Date()));
    } catch {
      setError('La routine ne peut pas être chargée pour le moment.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleStep = useCallback(
    async (stepId: string) => {
      if (!occurrence) return;

      const currentStep = occurrence.steps.find((step) => step.id === stepId);
      if (!currentStep) return;

      const completed = !currentStep.completed;
      const previous = occurrence;
      setOccurrence({
        ...occurrence,
        steps: occurrence.steps.map((step) =>
          step.id === stepId ? { ...step, completed } : step,
        ),
      });

      try {
        await routineRepository.toggleStep({
          routineId: occurrence.routine.id,
          stepId,
          scheduledDate: occurrence.scheduledDate,
          completed,
        });
      } catch {
        setOccurrence(previous);
        setError('Cette étape n’a pas pu être enregistrée. Réessaie.');
      }
    },
    [occurrence],
  );

  return { occurrence, isLoading, error, refresh, toggleStep, setOccurrence };
}
