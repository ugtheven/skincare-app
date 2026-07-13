import type { RoutineOccurrence, RoutinePeriod } from '@/domain/routine';

export type CreateRoutineInput = {
  name: string;
  period: RoutinePeriod;
  stepTitles: string[];
};

export interface RoutineRepository {
  getCurrentOccurrence(now: Date): Promise<RoutineOccurrence | null>;
  createRoutine(input: CreateRoutineInput): Promise<RoutineOccurrence>;
  toggleStep(input: {
    routineId: string;
    stepId: string;
    scheduledDate: string;
    completed: boolean;
  }): Promise<void>;
  addProductStep(input: {
    routineId: string;
    productId: string;
    title: string;
  }): Promise<void>;
}
