import * as SQLite from 'expo-sqlite';

import type { Routine, RoutineOccurrence, RoutineStep } from '@/domain/routine';
import { scheduledDateForRoutine } from '@/domain/routine';

import type {
  CreateRoutineInput,
  RoutineRepository,
} from './routine-repository';

const DATABASE_NAME = 'skincare.db';
export const SCHEMA_VERSION = 6;

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
  product_id: string | null;
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
    productId: row.product_id,
    title: row.title,
    position: row.position,
    completed: Boolean(row.completed),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function openSkincareDatabase() {
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
  const currentVersion = version?.user_version ?? 0;

  if (currentVersion >= SCHEMA_VERSION) return;

  if (currentVersion === 0) {
    await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS routines (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      period TEXT NOT NULL CHECK (period IN ('morning', 'evening')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      brand TEXT,
      category TEXT,
      barcode TEXT UNIQUE,
      image_url TEXT,
      image_source TEXT,
      image_source_url TEXT,
      image_license TEXT,
      image_license_url TEXT,
      ingredients_text TEXT,
      ingredients_source TEXT,
      ingredients_source_url TEXT,
      source TEXT NOT NULL CHECK (source IN ('manual', 'barcode')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS routine_steps (
      id TEXT PRIMARY KEY NOT NULL,
      routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
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

    CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);

    CREATE TABLE IF NOT EXISTS product_identifiers (
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('barcode', 'qr')),
      raw_value TEXT NOT NULL,
      normalized_value TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (product_id, normalized_value)
    );

    CREATE INDEX IF NOT EXISTS idx_product_identifiers_product
      ON product_identifiers(product_id);

    CREATE TABLE IF NOT EXISTS ingredients (
      normalized_name TEXT PRIMARY KEY NOT NULL,
      canonical_name TEXT NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (review_status IN ('pending', 'verified'))
    );

    CREATE TABLE IF NOT EXISTS product_ingredients (
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      normalized_name TEXT NOT NULL REFERENCES ingredients(normalized_name),
      position INTEGER NOT NULL,
      raw_name TEXT NOT NULL,
      PRIMARY KEY (product_id, position)
    );

    CREATE INDEX IF NOT EXISTS idx_product_ingredients_name
      ON product_ingredients(normalized_name);

    PRAGMA user_version = ${SCHEMA_VERSION};
  `);
    return;
  }

  if (currentVersion === 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      brand TEXT,
      category TEXT,
      barcode TEXT UNIQUE,
      image_url TEXT,
      source TEXT NOT NULL CHECK (source IN ('manual', 'barcode')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

      ALTER TABLE routine_steps ADD COLUMN product_id TEXT REFERENCES products(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);

      PRAGMA user_version = 2;
    `);
  }

  if (currentVersion <= 2) {
    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS product_identifiers (
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('barcode', 'qr')),
      raw_value TEXT NOT NULL,
      normalized_value TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (product_id, normalized_value)
    );

    INSERT OR IGNORE INTO product_identifiers
      (product_id, kind, raw_value, normalized_value, created_at)
    SELECT id, 'barcode', barcode, barcode, created_at
    FROM products
    WHERE barcode IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_product_identifiers_product
      ON product_identifiers(product_id);

    PRAGMA user_version = 3;
  `);
  }

  if (currentVersion <= 3) {
    await db.execAsync(`
      ALTER TABLE products ADD COLUMN ingredients_text TEXT;
      ALTER TABLE products ADD COLUMN ingredients_source TEXT;
      ALTER TABLE products ADD COLUMN ingredients_source_url TEXT;
      PRAGMA user_version = 4;
    `);
  }

  if (currentVersion <= 4) {
    await db.execAsync(`
      ALTER TABLE products ADD COLUMN image_source TEXT;
      ALTER TABLE products ADD COLUMN image_source_url TEXT;
      ALTER TABLE products ADD COLUMN image_license TEXT;
      ALTER TABLE products ADD COLUMN image_license_url TEXT;
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
  }

  if (currentVersion <= 5) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS ingredients (
        normalized_name TEXT PRIMARY KEY NOT NULL,
        canonical_name TEXT NOT NULL,
        review_status TEXT NOT NULL DEFAULT 'pending'
          CHECK (review_status IN ('pending', 'verified'))
      );

      CREATE TABLE IF NOT EXISTS product_ingredients (
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        normalized_name TEXT NOT NULL REFERENCES ingredients(normalized_name),
        position INTEGER NOT NULL,
        raw_name TEXT NOT NULL,
        PRIMARY KEY (product_id, position)
      );

      CREATE INDEX IF NOT EXISTS idx_product_ingredients_name
        ON product_ingredients(normalized_name);
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
  }
}

export class SQLiteRoutineRepository implements RoutineRepository {
  async getCurrentOccurrence(now: Date): Promise<RoutineOccurrence | null> {
    const db = await openSkincareDatabase();
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
    const db = await openSkincareDatabase();
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
        productId: null,
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
    const db = await openSkincareDatabase();
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

  async addProductStep({
    routineId,
    productId,
    title,
  }: {
    routineId: string;
    productId: string;
    title: string;
  }) {
    const db = await openSkincareDatabase();
    const createdAt = nowIso();
    const position = await db.getFirstAsync<{ next_position: number }>(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM routine_steps WHERE routine_id = ?',
      routineId,
    );

    await db.runAsync(
      `INSERT INTO routine_steps
       (id, routine_id, product_id, title, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      createId(),
      routineId,
      productId,
      title.trim(),
      position?.next_position ?? 0,
      createdAt,
      createdAt,
    );
  }
}

export const routineRepository = new SQLiteRoutineRepository();
