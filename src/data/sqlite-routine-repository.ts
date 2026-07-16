import * as SQLite from 'expo-sqlite';

import {
  allWeekdays,
  formatLocalDate,
  nextLocalDate,
  preferredRoutinePeriod,
  recognizedRoutineCategory,
  routineNameForPeriod,
  scheduledDateForPeriod,
  suggestedRoutineInsertionIndex,
  type DailyStepStatus,
  type Routine,
  type RoutineDefinition,
  type RoutineOccurrence,
  type RoutineStep,
  type Weekday,
} from '@/domain/routine';

import type {
  CreateRoutineInput,
  ReplaceRoutineFromDateInput,
  RoutineRepository,
  RoutineStepInput,
} from './routine-repository';

const DATABASE_NAME = 'skincare.db';
export const SCHEMA_VERSION = 10;
const LEGACY_EFFECTIVE_FROM = '0001-01-01';

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
  product_image_url?: string | null;
  title: string;
  category: RoutineStep['category'];
  instruction: string | null;
  position: number;
  is_active: number;
  selected_weekdays: string;
  created_at: string;
  updated_at: string;
  status: DailyStepStatus | null;
};

type RevisionRow = { id: string; effective_from: string };

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

function toWeekdays(value: string): Weekday[] {
  return value
    .split(',')
    .map(Number)
    .filter(
      (day): day is Weekday => Number.isInteger(day) && day >= 0 && day <= 6,
    );
}

function serializeWeekdays(weekdays: Weekday[]) {
  return [...new Set(weekdays)].sort().join(',');
}

function toStep(
  row: StepRow,
  routineId: string,
): RoutineStep & {
  completed: boolean;
  status: DailyStepStatus | null;
} {
  return {
    id: row.id,
    routineId,
    productId: row.product_id,
    productImageUrl: row.product_image_url ?? null,
    title: row.title,
    category: row.category,
    instruction: row.instruction,
    position: row.position,
    isActive: Boolean(row.is_active),
    selectedWeekdays: toWeekdays(row.selected_weekdays),
    completed: row.status === 'completed',
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizedSteps(input: CreateRoutineInput): RoutineStepInput[] {
  if (input.steps) return input.steps;

  return (input.stepTitles ?? [])
    .map((title) => title.trim())
    .filter(Boolean)
    .map((title, position) => ({
      title,
      category: recognizedRoutineCategory(title),
      position,
    }));
}

function validatedSteps(steps: RoutineStepInput[]): RoutineStepInput[] {
  if (steps.length === 0) {
    throw new Error('Une routine doit contenir au moins une étape');
  }

  return steps.map((step, position) => {
    if (!step.title.trim()) {
      throw new Error('Une étape doit avoir un libellé');
    }
    if (step.isActive !== false && (step.selectedWeekdays?.length ?? 7) === 0) {
      throw new Error('Une étape active doit avoir au moins un jour prévu');
    }
    if ((step.instruction?.trim().length ?? 0) > 120) {
      throw new Error('Une instruction ne peut pas dépasser 120 caractères');
    }

    return {
      ...step,
      title: step.title.trim(),
      instruction: step.instruction?.trim() || null,
      position,
    };
  });
}

function inputFromStepRow(step: StepRow): RoutineStepInput {
  return {
    productId: step.product_id,
    title: step.title,
    category: step.category,
    instruction: step.instruction,
    position: step.position,
    isActive: Boolean(step.is_active),
    selectedWeekdays: toWeekdays(step.selected_weekdays),
  };
}

function matchesRoutineStep(row: StepRow, step: RoutineStepInput) {
  return (
    row.product_id === (step.productId ?? null) &&
    row.category === step.category &&
    row.title === step.title.trim()
  );
}

async function markStepProductsAsOwned(
  db: SQLite.SQLiteDatabase,
  steps: RoutineStepInput[],
  addedAt: string,
) {
  for (const productId of new Set(
    steps
      .map((step) => step.productId)
      .filter((id): id is string => Boolean(id)),
  )) {
    await db.runAsync(
      `INSERT OR IGNORE INTO product_collection (product_id, added_at)
       SELECT id, ? FROM products WHERE id = ?`,
      addedAt,
      productId,
    );
  }
}

export async function openSkincareDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(
      async (db) => {
        await db.execAsync('PRAGMA foreign_keys = ON;');
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
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_active_routine_per_period
        ON routines(period) WHERE is_active = 1;

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, brand TEXT, category TEXT,
        barcode TEXT UNIQUE, image_url TEXT, image_source TEXT, image_source_url TEXT,
        image_license TEXT, image_license_url TEXT, ingredients_text TEXT,
        ingredients_source TEXT, ingredients_source_url TEXT,
        usage_text TEXT, usage_source TEXT, usage_source_url TEXT,
        precautions_text TEXT, precautions_source TEXT, precautions_source_url TEXT,
        information_confidence TEXT CHECK (information_confidence IN ('limited', 'moderate', 'high')),
        confidence_source TEXT, confidence_source_url TEXT, confidence_note TEXT,
        source TEXT NOT NULL CHECK (source IN ('manual', 'barcode')),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS product_collection (
        product_id TEXT PRIMARY KEY NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        added_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_product_collection_added_at ON product_collection(added_at DESC);

      /* Retained for migrations from the original routine model. */
      CREATE TABLE IF NOT EXISTS routine_steps (
        id TEXT PRIMARY KEY NOT NULL, routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
        product_id TEXT REFERENCES products(id) ON DELETE SET NULL, title TEXT NOT NULL,
        position INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS step_completions (
        routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
        step_id TEXT NOT NULL REFERENCES routine_steps(id) ON DELETE CASCADE,
        scheduled_date TEXT NOT NULL, completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
        updated_at TEXT NOT NULL, PRIMARY KEY (step_id, scheduled_date)
      );

      CREATE TABLE IF NOT EXISTS routine_revisions (
        id TEXT PRIMARY KEY NOT NULL, routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
        effective_from TEXT NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(routine_id, effective_from)
      );
      CREATE INDEX IF NOT EXISTS idx_routine_revisions_lookup
        ON routine_revisions(routine_id, effective_from DESC);
      CREATE TABLE IF NOT EXISTS routine_revision_steps (
        id TEXT PRIMARY KEY NOT NULL, revision_id TEXT NOT NULL REFERENCES routine_revisions(id) ON DELETE CASCADE,
        product_id TEXT REFERENCES products(id) ON DELETE SET NULL, title TEXT NOT NULL,
        category TEXT NOT NULL, instruction TEXT, position INTEGER NOT NULL,
        is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)), selected_weekdays TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_routine_revision_steps_position
        ON routine_revision_steps(revision_id, position);
      CREATE TABLE IF NOT EXISTS daily_step_statuses (
        revision_step_id TEXT NOT NULL REFERENCES routine_revision_steps(id) ON DELETE CASCADE,
        scheduled_date TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('completed', 'skipped')),
        updated_at TEXT NOT NULL, PRIMARY KEY (revision_step_id, scheduled_date)
      );
      CREATE INDEX IF NOT EXISTS idx_daily_step_statuses_date ON daily_step_statuses(scheduled_date);

      CREATE TABLE IF NOT EXISTS product_identifiers (
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('barcode', 'qr')), raw_value TEXT NOT NULL,
        normalized_value TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
        PRIMARY KEY (product_id, normalized_value)
      );
      CREATE TABLE IF NOT EXISTS product_source_references (
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        provider TEXT NOT NULL, external_id TEXT NOT NULL, created_at TEXT NOT NULL,
        PRIMARY KEY (provider, external_id)
      );
      CREATE INDEX IF NOT EXISTS idx_product_source_references_product
        ON product_source_references(product_id);
      CREATE TABLE IF NOT EXISTS ingredients (
        normalized_name TEXT PRIMARY KEY NOT NULL, canonical_name TEXT NOT NULL,
        review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'verified'))
      );
      CREATE TABLE IF NOT EXISTS product_ingredients (
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        normalized_name TEXT NOT NULL REFERENCES ingredients(normalized_name), position INTEGER NOT NULL,
        raw_name TEXT NOT NULL, PRIMARY KEY (product_id, position)
      );
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
    return;
  }

  if (currentVersion === 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, brand TEXT, category TEXT, barcode TEXT UNIQUE, image_url TEXT, source TEXT NOT NULL CHECK (source IN ('manual', 'barcode')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      ALTER TABLE routine_steps ADD COLUMN product_id TEXT REFERENCES products(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);
      PRAGMA user_version = 2;
    `);
  }
  if (currentVersion <= 2) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS product_identifiers (product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK (kind IN ('barcode', 'qr')), raw_value TEXT NOT NULL, normalized_value TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, PRIMARY KEY (product_id, normalized_value));
      INSERT OR IGNORE INTO product_identifiers (product_id, kind, raw_value, normalized_value, created_at) SELECT id, 'barcode', barcode, barcode, created_at FROM products WHERE barcode IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_product_identifiers_product ON product_identifiers(product_id);
      PRAGMA user_version = 3;
    `);
  }
  if (currentVersion <= 3) {
    await db.execAsync(
      `ALTER TABLE products ADD COLUMN ingredients_text TEXT; ALTER TABLE products ADD COLUMN ingredients_source TEXT; ALTER TABLE products ADD COLUMN ingredients_source_url TEXT; PRAGMA user_version = 4;`,
    );
  }
  if (currentVersion <= 4) {
    await db.execAsync(
      `ALTER TABLE products ADD COLUMN image_source TEXT; ALTER TABLE products ADD COLUMN image_source_url TEXT; ALTER TABLE products ADD COLUMN image_license TEXT; ALTER TABLE products ADD COLUMN image_license_url TEXT; PRAGMA user_version = 5;`,
    );
  }
  if (currentVersion <= 5) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS ingredients (normalized_name TEXT PRIMARY KEY NOT NULL, canonical_name TEXT NOT NULL, review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'verified')));
      CREATE TABLE IF NOT EXISTS product_ingredients (product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE, normalized_name TEXT NOT NULL REFERENCES ingredients(normalized_name), position INTEGER NOT NULL, raw_name TEXT NOT NULL, PRIMARY KEY (product_id, position));
      CREATE INDEX IF NOT EXISTS idx_product_ingredients_name ON product_ingredients(normalized_name);
      PRAGMA user_version = 6;
    `);
  }
  if (currentVersion <= 6) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS product_collection (product_id TEXT PRIMARY KEY NOT NULL REFERENCES products(id) ON DELETE CASCADE, added_at TEXT NOT NULL);
      INSERT OR IGNORE INTO product_collection (product_id, added_at) SELECT id, created_at FROM products;
      CREATE INDEX IF NOT EXISTS idx_product_collection_added_at ON product_collection(added_at DESC);
      PRAGMA user_version = 7;
    `);
  }
  if (currentVersion <= 7) {
    await db.execAsync(`
      ALTER TABLE routines ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
      UPDATE routines AS older SET is_active = 0
      WHERE EXISTS (SELECT 1 FROM routines AS newer WHERE newer.period = older.period AND (newer.updated_at > older.updated_at OR (newer.updated_at = older.updated_at AND newer.id > older.id)));
      CREATE UNIQUE INDEX IF NOT EXISTS idx_active_routine_per_period ON routines(period) WHERE is_active = 1;
      CREATE TABLE IF NOT EXISTS routine_revisions (id TEXT PRIMARY KEY NOT NULL, routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE, effective_from TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(routine_id, effective_from));
      CREATE INDEX IF NOT EXISTS idx_routine_revisions_lookup ON routine_revisions(routine_id, effective_from DESC);
      CREATE TABLE IF NOT EXISTS routine_revision_steps (id TEXT PRIMARY KEY NOT NULL, revision_id TEXT NOT NULL REFERENCES routine_revisions(id) ON DELETE CASCADE, product_id TEXT REFERENCES products(id) ON DELETE SET NULL, title TEXT NOT NULL, category TEXT NOT NULL, instruction TEXT, position INTEGER NOT NULL, is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)), selected_weekdays TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_routine_revision_steps_position ON routine_revision_steps(revision_id, position);
      CREATE TABLE IF NOT EXISTS daily_step_statuses (revision_step_id TEXT NOT NULL REFERENCES routine_revision_steps(id) ON DELETE CASCADE, scheduled_date TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('completed', 'skipped')), updated_at TEXT NOT NULL, PRIMARY KEY (revision_step_id, scheduled_date));
      CREATE INDEX IF NOT EXISTS idx_daily_step_statuses_date ON daily_step_statuses(scheduled_date);
      INSERT OR IGNORE INTO routine_revisions (id, routine_id, effective_from, created_at) SELECT 'legacy-' || id, id, '${LEGACY_EFFECTIVE_FROM}', created_at FROM routines;
      INSERT OR IGNORE INTO routine_revision_steps (id, revision_id, product_id, title, category, instruction, position, is_active, selected_weekdays, created_at, updated_at)
      SELECT 'legacy-' || id, 'legacy-' || routine_id, product_id, title,
        CASE WHEN lower(title) LIKE '%démaquill%' OR lower(title) LIKE '%micellaire%' THEN 'Démaquillant'
             WHEN lower(title) LIKE '%nettoy%' OR lower(title) LIKE '%cleanser%' THEN 'Nettoyant'
             WHEN lower(title) LIKE '%exfol%' OR lower(title) LIKE '%peeling%' THEN 'Exfoliant'
             WHEN lower(title) LIKE '%tonique%' OR lower(title) LIKE '%toner%' THEN 'Tonique'
             WHEN lower(title) LIKE '%sérum%' OR lower(title) LIKE '%serum%' THEN 'Sérum'
             WHEN lower(title) LIKE '%contour des yeux%' OR lower(title) LIKE '%eye cream%' OR lower(title) LIKE '%eye serum%' THEN 'Soin contour des yeux'
             WHEN lower(title) LIKE '%traitement%' OR lower(title) LIKE '%cibl%' THEN 'Soin ciblé'
             WHEN lower(title) LIKE '%hydrat%' OR lower(title) LIKE '%crème%' OR lower(title) LIKE '%creme%' OR lower(title) LIKE '%lotion%' THEN 'Hydratant'
             WHEN lower(title) LIKE '%solaire%' OR lower(title) LIKE '%spf%' THEN 'Protection solaire'
             WHEN lower(title) LIKE '%masque%' THEN 'Masque' ELSE 'Autre' END,
        NULL, position, 1, '0,1,2,3,4,5,6', created_at, updated_at FROM routine_steps;
      INSERT OR IGNORE INTO daily_step_statuses (revision_step_id, scheduled_date, status, updated_at)
      SELECT 'legacy-' || step_id, scheduled_date, 'completed', updated_at FROM step_completions WHERE completed = 1;
      PRAGMA user_version = 8;
    `);
  }
  if (currentVersion <= 8) {
    await db.execAsync(`
      ALTER TABLE products ADD COLUMN usage_text TEXT;
      ALTER TABLE products ADD COLUMN usage_source TEXT;
      ALTER TABLE products ADD COLUMN usage_source_url TEXT;
      ALTER TABLE products ADD COLUMN precautions_text TEXT;
      ALTER TABLE products ADD COLUMN precautions_source TEXT;
      ALTER TABLE products ADD COLUMN precautions_source_url TEXT;
      ALTER TABLE products ADD COLUMN information_confidence TEXT CHECK (information_confidence IN ('limited', 'moderate', 'high'));
      ALTER TABLE products ADD COLUMN confidence_source TEXT;
      ALTER TABLE products ADD COLUMN confidence_source_url TEXT;
      ALTER TABLE products ADD COLUMN confidence_note TEXT;
      PRAGMA user_version = 9;
    `);
  }
  if (currentVersion <= 9) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS product_source_references (
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        provider TEXT NOT NULL, external_id TEXT NOT NULL, created_at TEXT NOT NULL,
        PRIMARY KEY (provider, external_id)
      );
      CREATE INDEX IF NOT EXISTS idx_product_source_references_product
        ON product_source_references(product_id);
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
  }
}

export class SQLiteRoutineRepository implements RoutineRepository {
  constructor(
    private readonly openDatabase: typeof openSkincareDatabase = openSkincareDatabase,
  ) {}

  async getRoutineForEditing(
    period: Routine['period'],
    effectiveOn?: string,
  ): Promise<RoutineDefinition | null> {
    const db = await this.openDatabase();
    const row = await db.getFirstAsync<RoutineRow>(
      'SELECT * FROM routines WHERE period = ? AND is_active = 1 LIMIT 1',
      period,
    );
    if (!row) return null;

    const revision = effectiveOn
      ? await db.getFirstAsync<{ id: string }>(
          'SELECT id FROM routine_revisions WHERE routine_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1',
          row.id,
          effectiveOn,
        )
      : await db.getFirstAsync<{ id: string }>(
          'SELECT id FROM routine_revisions WHERE routine_id = ? ORDER BY effective_from DESC LIMIT 1',
          row.id,
        );
    const steps = revision
      ? await db.getAllAsync<StepRow>(
          `SELECT routine_revision_steps.*, products.image_url AS product_image_url, NULL AS status
           FROM routine_revision_steps LEFT JOIN products
             ON products.id = routine_revision_steps.product_id
           WHERE routine_revision_steps.revision_id = ?
           ORDER BY routine_revision_steps.position ASC`,
          revision.id,
        )
      : [];

    return {
      routine: toRoutine(row),
      steps: steps.map((step) => toStep(step, row.id)),
    };
  }

  async getCurrentOccurrence(now: Date): Promise<RoutineOccurrence | null> {
    const preferredPeriod = preferredRoutinePeriod(now);
    const routineDayDate = scheduledDateForPeriod(preferredPeriod, now);
    const preferred = await this.getOccurrenceForDate({
      period: preferredPeriod,
      scheduledDate: routineDayDate,
    });
    if (preferred) return preferred;

    const fallbackPeriod =
      preferredPeriod === 'morning' ? 'evening' : 'morning';
    return this.getOccurrenceForDate({
      period: fallbackPeriod,
      scheduledDate: routineDayDate,
    });
  }

  async getOccurrenceForDate({
    period,
    scheduledDate,
  }: {
    period: Routine['period'];
    scheduledDate: string;
  }): Promise<RoutineOccurrence | null> {
    const db = await this.openDatabase();
    const row = await db.getFirstAsync<RoutineRow>(
      'SELECT * FROM routines WHERE period = ? AND is_active = 1 LIMIT 1',
      period,
    );
    if (!row) return null;
    const revision = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM routine_revisions WHERE routine_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1',
      row.id,
      scheduledDate,
    );
    if (!revision) return null;
    const weekday = new Date(`${scheduledDate}T12:00:00`).getDay();
    const steps = await db.getAllAsync<StepRow>(
      `SELECT routine_revision_steps.*, products.image_url AS product_image_url, daily_step_statuses.status
       FROM routine_revision_steps LEFT JOIN products
         ON products.id = routine_revision_steps.product_id
       LEFT JOIN daily_step_statuses
         ON daily_step_statuses.revision_step_id = routine_revision_steps.id AND daily_step_statuses.scheduled_date = ?
       WHERE routine_revision_steps.revision_id = ? AND routine_revision_steps.is_active = 1
         AND instr(',' || routine_revision_steps.selected_weekdays || ',', ',' || ? || ',') > 0
       ORDER BY routine_revision_steps.position ASC`,
      scheduledDate,
      revision.id,
      weekday,
    );
    return {
      routine: toRoutine(row),
      scheduledDate,
      steps: steps.map((step) => toStep(step, row.id)),
    };
  }

  async createRoutine(input: CreateRoutineInput): Promise<RoutineOccurrence> {
    const db = await this.openDatabase();
    const createdOn = new Date();
    const createdAt = createdOn.toISOString();
    const effectiveFrom = input.effectiveFrom ?? formatLocalDate(createdOn);
    const routine: Routine = {
      id: createId(),
      name: routineNameForPeriod(input.period),
      period: input.period,
      createdAt,
      updatedAt: createdAt,
    };
    const revisionId = createId();
    const steps = validatedSteps(normalizedSteps(input));
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        'INSERT INTO routines (id, name, period, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)',
        routine.id,
        routine.name,
        routine.period,
        createdAt,
        createdAt,
      );
      await db.runAsync(
        'INSERT INTO routine_revisions (id, routine_id, effective_from, created_at) VALUES (?, ?, ?, ?)',
        revisionId,
        routine.id,
        effectiveFrom,
        createdAt,
      );
      await markStepProductsAsOwned(db, steps, createdAt);
      for (const step of steps)
        await this.insertRevisionStep(db, revisionId, step, createdAt);
    });
    const scheduledDate = effectiveFrom;
    const occurrence = await this.getOccurrenceForDate({
      period: routine.period,
      scheduledDate,
    });
    if (!occurrence) throw new Error('Routine créée mais introuvable');
    return occurrence;
  }

  async replaceRoutineForFuture({
    routineId,
    effectiveFrom,
    steps,
  }: {
    routineId: string;
    effectiveFrom: string;
    steps: RoutineStepInput[];
  }): Promise<void> {
    if (effectiveFrom <= formatLocalDate(new Date())) {
      throw new Error('Une révision doit prendre effet à une date future');
    }
    const db = await this.openDatabase();
    const nextSteps = validatedSteps(steps);
    const createdAt = nowIso();
    const revisionId = createId();
    await db.withTransactionAsync(async () => {
      const pendingRevision = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM routine_revisions WHERE routine_id = ? AND effective_from = ? LIMIT 1',
        routineId,
        effectiveFrom,
      );
      if (pendingRevision) {
        await db.runAsync(
          'DELETE FROM routine_revisions WHERE id = ?',
          pendingRevision.id,
        );
      }
      await db.runAsync(
        'INSERT INTO routine_revisions (id, routine_id, effective_from, created_at) VALUES (?, ?, ?, ?)',
        revisionId,
        routineId,
        effectiveFrom,
        createdAt,
      );
      await markStepProductsAsOwned(db, nextSteps, createdAt);
      for (const step of nextSteps)
        await this.insertRevisionStep(db, revisionId, step, createdAt);
      await db.runAsync(
        'UPDATE routines SET updated_at = ? WHERE id = ?',
        createdAt,
        routineId,
      );
    });
  }

  async replaceRoutineFromDate({
    routineId,
    effectiveFrom,
    sourceStepIds,
    steps,
  }: ReplaceRoutineFromDateInput): Promise<void> {
    const earliestRoutineDate = new Date();
    earliestRoutineDate.setDate(earliestRoutineDate.getDate() - 1);
    if (effectiveFrom < formatLocalDate(earliestRoutineDate)) {
      throw new Error('Une révision ne peut pas modifier le passé');
    }

    const db = await this.openDatabase();
    const nextSteps = validatedSteps(steps);
    const createdAt = nowIso();
    const revisionId = createId();
    const currentRevision = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM routine_revisions WHERE routine_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1',
      routineId,
      effectiveFrom,
    );
    const currentRows = currentRevision
      ? await db.getAllAsync<StepRow>(
          `SELECT routine_revision_steps.*, daily_step_statuses.status
           FROM routine_revision_steps LEFT JOIN daily_step_statuses
             ON daily_step_statuses.revision_step_id = routine_revision_steps.id
             AND daily_step_statuses.scheduled_date = ?
           WHERE routine_revision_steps.revision_id = ?
           ORDER BY routine_revision_steps.position ASC`,
          effectiveFrom,
          currentRevision.id,
        )
      : [];
    const unmatchedRows = [...currentRows];
    const preservedStatuses = nextSteps.map((step, index) => {
      const sourceStepId = sourceStepIds[index];
      let matchIndex = sourceStepId
        ? unmatchedRows.findIndex((row) => row.id === sourceStepId)
        : -1;
      if (matchIndex < 0) {
        matchIndex = unmatchedRows.findIndex((row) =>
          matchesRoutineStep(row, step),
        );
      }
      if (matchIndex < 0) return null;
      const [matched] = unmatchedRows.splice(matchIndex, 1);
      return matched.status;
    });

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        'DELETE FROM routine_revisions WHERE routine_id = ? AND effective_from >= ?',
        routineId,
        effectiveFrom,
      );
      await db.runAsync(
        'INSERT INTO routine_revisions (id, routine_id, effective_from, created_at) VALUES (?, ?, ?, ?)',
        revisionId,
        routineId,
        effectiveFrom,
        createdAt,
      );
      await markStepProductsAsOwned(db, nextSteps, createdAt);
      for (const [index, step] of nextSteps.entries()) {
        const stepId = await this.insertRevisionStep(
          db,
          revisionId,
          step,
          createdAt,
        );
        const status = preservedStatuses[index];
        if (status) {
          await db.runAsync(
            'INSERT INTO daily_step_statuses (revision_step_id, scheduled_date, status, updated_at) VALUES (?, ?, ?, ?)',
            stepId,
            effectiveFrom,
            status,
            createdAt,
          );
        }
      }
      await db.runAsync(
        'UPDATE routines SET updated_at = ? WHERE id = ?',
        createdAt,
        routineId,
      );
    });
  }

  async setStepStatus({
    stepId,
    scheduledDate,
    status,
  }: {
    stepId: string;
    scheduledDate: string;
    status: DailyStepStatus | null;
  }): Promise<void> {
    const db = await this.openDatabase();
    if (!status) {
      await db.runAsync(
        'DELETE FROM daily_step_statuses WHERE revision_step_id = ? AND scheduled_date = ?',
        stepId,
        scheduledDate,
      );
      return;
    }
    await db.runAsync(
      `INSERT INTO daily_step_statuses (revision_step_id, scheduled_date, status, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(revision_step_id, scheduled_date) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
      stepId,
      scheduledDate,
      status,
      nowIso(),
    );
  }

  async toggleStep({
    stepId,
    scheduledDate,
    completed,
  }: {
    routineId: string;
    stepId: string;
    scheduledDate: string;
    completed: boolean;
  }): Promise<void> {
    return this.setStepStatus({
      stepId,
      scheduledDate,
      status: completed ? 'completed' : null,
    });
  }

  async addProductStep({
    period,
    productId,
    title,
    category,
    selectedWeekdays,
  }: {
    period: Routine['period'];
    productId: string;
    title: string;
    category: RoutineStep['category'];
    selectedWeekdays: Weekday[];
  }): Promise<void> {
    const db = await this.openDatabase();
    const createdAt = nowIso();
    const effectiveFrom = nextLocalDate(new Date());
    const routine = await db.getFirstAsync<RoutineRow>(
      'SELECT * FROM routines WHERE period = ? AND is_active = 1 LIMIT 1',
      period,
    );
    const productStep: RoutineStepInput = {
      productId,
      title: title.trim(),
      category,
      position: 0,
      selectedWeekdays,
    };

    if (!routine) {
      await this.createRoutine({
        name: routineNameForPeriod(period),
        period,
        steps: [productStep],
      });
      return;
    }

    const revision = await db.getFirstAsync<RevisionRow>(
      'SELECT id, effective_from FROM routine_revisions WHERE routine_id = ? ORDER BY effective_from DESC LIMIT 1',
      routine.id,
    );
    if (!revision) throw new Error('Routine introuvable');
    const existingRows = await db.getAllAsync<StepRow>(
      'SELECT routine_revision_steps.*, NULL AS status FROM routine_revision_steps WHERE revision_id = ? ORDER BY position ASC',
      revision.id,
    );
    const existing = existingRows.map(inputFromStepRow);
    const compatibleIndex = existing.findIndex(
      (step) => !step.productId && step.category === category,
    );
    const nextSteps = [...existing];
    if (compatibleIndex >= 0) {
      nextSteps[compatibleIndex] = {
        ...nextSteps[compatibleIndex],
        productId,
        title: title.trim(),
      };
    } else {
      const insertionIndex = suggestedRoutineInsertionIndex(
        existing.map((step) => ({ category: step.category })),
        category,
      );
      nextSteps.splice(insertionIndex, 0, productStep);
    }
    const validated = validatedSteps(nextSteps);
    const revisionId = createId();
    await db.withTransactionAsync(async () => {
      const pendingRevision = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM routine_revisions WHERE routine_id = ? AND effective_from = ? LIMIT 1',
        routine.id,
        effectiveFrom,
      );
      if (pendingRevision) {
        await db.runAsync(
          'DELETE FROM routine_revisions WHERE id = ?',
          pendingRevision.id,
        );
      }
      await db.runAsync(
        'INSERT INTO routine_revisions (id, routine_id, effective_from, created_at) VALUES (?, ?, ?, ?)',
        revisionId,
        routine.id,
        effectiveFrom,
        createdAt,
      );
      await markStepProductsAsOwned(db, validated, createdAt);
      for (const step of validated) {
        await this.insertRevisionStep(db, revisionId, step, createdAt);
      }
      await db.runAsync(
        'UPDATE routines SET updated_at = ? WHERE id = ?',
        createdAt,
        routine.id,
      );
    });
  }

  private async insertRevisionStep(
    db: SQLite.SQLiteDatabase,
    revisionId: string,
    step: RoutineStepInput,
    createdAt: string,
  ) {
    const stepId = createId();
    await db.runAsync(
      `INSERT INTO routine_revision_steps (id, revision_id, product_id, title, category, instruction, position, is_active, selected_weekdays, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      stepId,
      revisionId,
      step.productId ?? null,
      step.title.trim(),
      step.category,
      step.instruction?.trim() || null,
      step.position,
      Number(step.isActive ?? true),
      serializeWeekdays(step.selectedWeekdays ?? allWeekdays()),
      createdAt,
      createdAt,
    );
    return stepId;
  }
}

export async function replaceProductUsagesWithPlaceholders(
  db: SQLite.SQLiteDatabase,
  productId: string,
  effectiveFrom: string,
): Promise<number> {
  const routines = await db.getAllAsync<RoutineRow>(
    'SELECT * FROM routines WHERE is_active = 1 ORDER BY created_at ASC',
  );
  const createdAt = nowIso();
  let changedRoutines = 0;

  for (const routine of routines) {
    const boundaryRevision = await db.getFirstAsync<RevisionRow>(
      'SELECT id, effective_from FROM routine_revisions WHERE routine_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1',
      routine.id,
      effectiveFrom,
    );
    const futureRevisions = await db.getAllAsync<RevisionRow>(
      'SELECT id, effective_from FROM routine_revisions WHERE routine_id = ? AND effective_from >= ? ORDER BY effective_from ASC',
      routine.id,
      effectiveFrom,
    );
    const revisions = [...futureRevisions];
    if (
      boundaryRevision &&
      !revisions.some((revision) => revision.effective_from === effectiveFrom)
    ) {
      revisions.unshift({ ...boundaryRevision, effective_from: effectiveFrom });
    }

    let routineChanged = false;
    for (const revision of revisions) {
      const rows = await db.getAllAsync<StepRow>(
        'SELECT routine_revision_steps.*, NULL AS status FROM routine_revision_steps WHERE revision_id = ? ORDER BY position ASC',
        revision.id,
      );
      if (!rows.some((step) => step.product_id === productId)) continue;

      const nextSteps = validatedSteps(
        rows.map((step) => ({
          ...inputFromStepRow(step),
          ...(step.product_id === productId
            ? { productId: null, title: step.category }
            : null),
        })),
      );
      const existingAtDate = futureRevisions.find(
        (candidate) => candidate.effective_from === revision.effective_from,
      );
      if (existingAtDate) {
        await db.runAsync(
          'DELETE FROM routine_revisions WHERE id = ?',
          existingAtDate.id,
        );
      }
      const replacementId = createId();
      await db.runAsync(
        'INSERT INTO routine_revisions (id, routine_id, effective_from, created_at) VALUES (?, ?, ?, ?)',
        replacementId,
        routine.id,
        revision.effective_from,
        createdAt,
      );
      for (const step of nextSteps) {
        await db.runAsync(
          `INSERT INTO routine_revision_steps (id, revision_id, product_id, title, category, instruction, position, is_active, selected_weekdays, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          createId(),
          replacementId,
          step.productId ?? null,
          step.title,
          step.category,
          step.instruction ?? null,
          step.position,
          Number(step.isActive ?? true),
          serializeWeekdays(step.selectedWeekdays ?? allWeekdays()),
          createdAt,
          createdAt,
        );
      }
      routineChanged = true;
    }
    if (routineChanged) changedRoutines += 1;
  }

  return changedRoutines;
}

export const routineRepository = new SQLiteRoutineRepository();
