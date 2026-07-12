import * as SQLite from 'expo-sqlite';

import type { Routine, RoutineOccurrence, RoutineStep } from '@/domain/routine';
import { scheduledDateForRoutine } from '@/domain/routine';

import type {
  CreateRoutineInput,
  RoutineRepository,
} from './routine-repository';

const DATABASE_NAME = 'skincare.db';
export const SCHEMA_VERSION = 1;

type RoutineRow = {
  id: string;
  name: string;
  period: Routine['period'];
  created_at: string;
  updated_at: string;
};

type StepRow = {
  id: string;
  routine_id: string;
  title: string;
  position: number;
  created_at: string;
  updated_at: string;
  completed: number;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function toRoutine(row: RoutineRow): Routine {
  return {
    id: row.id,
    name: row.name,
    period: row.period,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toStep(row: StepRow): RoutineStep & { completed: boolean } {
  return {
    id: row.id,
    routineId: row.routine_id,
    title: row.title,
    position: row.position,
    completed: Boolean(row.completed),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(
      async (db) => {
        await migrateDatabase(db);
        return db;
      },
    );
  }

  return databasePromise;
}

export async function migrateDatabase(
  db: Pick<SQLite.SQLiteDatabase, 'getFirstAsync' | 'execAsync'>,
) {
  const version = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  );

  if ((version?.user_version ?? 0) >= SCHEMA_VERSION) return;

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS routines (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      period TEXT NOT NULL CHECK (period IN ('morning', 'evening')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS routine_steps (
      id TEXT PRIMARY KEY NOT NULL,
      routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS step_completions (
      routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
      step_id TEXT NOT NULL REFERENCES routine_steps(id) ON DELETE CASCADE,
      scheduled_date TEXT NOT NULL,
      completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
      updated_at TEXT NOT NULL,
      PRIMARY KEY (step_id, scheduled_date)
    );

    CREATE INDEX IF NOT EXISTS idx_routine_steps_routine_position
      ON routine_steps(routine_id, position);
    CREATE INDEX IF NOT EXISTS idx_step_completions_routine_date
      ON step_completions(routine_id, scheduled_date);

    PRAGMA user_version = ${SCHEMA_VERSION};
  `);
}

export class SQLiteRoutineRepository implements RoutineRepository {
  async getCurrentOccurrence(now: Date): Promise<RoutineOccurrence | null> {
    const db = await getDatabase();
    const routines = await db.getAllAsync<RoutineRow>(
      'SELECT * FROM routines ORDER BY created_at ASC LIMIT 1',
    );
    const row = routines[0];

    if (!row) return null;

    const routine = toRoutine(row);
    const scheduledDate = scheduledDateForRoutine(routine, now);
    const steps = await db.getAllAsync<StepRow>(
      `SELECT routine_steps.*, COALESCE(step_completions.completed, 0) AS completed
       FROM routine_steps
       LEFT JOIN step_completions
         ON step_completions.step_id = routine_steps.id
         AND step_completions.scheduled_date = ?
       WHERE routine_steps.routine_id = ?
       ORDER BY routine_steps.position ASC`,
      scheduledDate,
      routine.id,
    );

    return { routine, scheduledDate, steps: steps.map(toStep) };
  }

  async createRoutine(input: CreateRoutineInput): Promise<RoutineOccurrence> {
    const db = await getDatabase();
    const createdAt = nowIso();
    const routine: Routine = {
      id: createId(),
      name: input.name.trim(),
      period: input.period,
      createdAt,
      updatedAt: createdAt,
    };
    const steps = input.stepTitles
      .map((title) => title.trim())
      .filter(Boolean)
      .map((title, position) => ({
        id: createId(),
        routineId: routine.id,
        title,
        position,
        createdAt,
        updatedAt: createdAt,
        completed: false,
      }));

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        'INSERT INTO routines (id, name, period, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        routine.id,
        routine.name,
        routine.period,
        routine.createdAt,
        routine.updatedAt,
      );

      for (const step of steps) {
        await db.runAsync(
          `INSERT INTO routine_steps
           (id, routine_id, title, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          step.id,
          step.routineId,
          step.title,
          step.position,
          step.createdAt,
          step.updatedAt,
        );
      }
    });

    return {
      routine,
      scheduledDate: scheduledDateForRoutine(routine, new Date()),
      steps,
    };
  }

  async toggleStep({
    routineId,
    stepId,
    scheduledDate,
    completed,
  }: {
    routineId: string;
    stepId: string;
    scheduledDate: string;
    completed: boolean;
  }) {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO step_completions
       (routine_id, step_id, scheduled_date, completed, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(step_id, scheduled_date) DO UPDATE SET
         completed = excluded.completed,
         updated_at = excluded.updated_at`,
      routineId,
      stepId,
      scheduledDate,
      Number(completed),
      nowIso(),
    );
  }
}

export const routineRepository = new SQLiteRoutineRepository();
