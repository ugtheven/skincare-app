import type {
  DailyStepStatus,
  RoutineCategory,
  RoutineDefinition,
  RoutineOccurrence,
  RoutinePeriod,
  Weekday,
} from '@/domain/routine';

export type RoutineStepInput = {
  productId?: string | null;
  title: string;
  category: RoutineCategory;
  instruction?: string | null;
  position: number;
  isActive?: boolean;
  selectedWeekdays?: Weekday[];
};

export type CreateRoutineInput = {
  name: string;
  period: RoutinePeriod;
  /** Compatibility input for the pre-planning onboarding. */
  stepTitles?: string[];
  steps?: RoutineStepInput[];
};

export interface RoutineRepository {
  getRoutineForEditing(
    period: RoutinePeriod,
  ): Promise<RoutineDefinition | null>;
  getCurrentOccurrence(now: Date): Promise<RoutineOccurrence | null>;
  getOccurrenceForDate(input: {
    period: RoutinePeriod;
    scheduledDate: string;
  }): Promise<RoutineOccurrence | null>;
  createRoutine(input: CreateRoutineInput): Promise<RoutineOccurrence>;
  replaceRoutineForFuture(input: {
    routineId: string;
    effectiveFrom: string;
    steps: RoutineStepInput[];
  }): Promise<void>;
  setStepStatus(input: {
    stepId: string;
    scheduledDate: string;
    status: DailyStepStatus | null;
  }): Promise<void>;
  toggleStep(input: {
    routineId: string;
    stepId: string;
    scheduledDate: string;
    completed: boolean;
  }): Promise<void>;
  addProductStep(input: {
    period: RoutinePeriod;
    productId: string;
    title: string;
    category: RoutineCategory;
    selectedWeekdays: Weekday[];
  }): Promise<void>;
}
