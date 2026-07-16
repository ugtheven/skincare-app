import {
  migrateDatabase,
  SCHEMA_VERSION,
  SQLiteRoutineRepository,
} from './sqlite-routine-repository';

const mockOpenDatabaseAsync = jest.fn();

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: (...args: unknown[]) => mockOpenDatabaseAsync(...args),
}));

describe('migrateDatabase', () => {
  it('creates the initial local-first schema', async () => {
    const getFirstAsync = jest.fn().mockResolvedValue({ user_version: 0 });
    const execAsync = jest.fn().mockResolvedValue(undefined);

    await migrateDatabase({ getFirstAsync, execAsync } as Parameters<
      typeof migrateDatabase
    >[0]);

    expect(execAsync).toHaveBeenCalledTimes(1);
    expect(execAsync.mock.calls[0][0]).toContain(
      'CREATE TABLE IF NOT EXISTS routines',
    );
    expect(execAsync.mock.calls[0][0]).toContain(
      'CREATE TABLE IF NOT EXISTS step_completions',
    );
    expect(execAsync.mock.calls[0][0]).toContain(
      'CREATE TABLE IF NOT EXISTS products',
    );
    expect(execAsync.mock.calls[0][0]).toContain(
      'CREATE TABLE IF NOT EXISTS product_identifiers',
    );
    expect(execAsync.mock.calls[0][0]).toContain(
      'CREATE TABLE IF NOT EXISTS product_collection',
    );
    expect(execAsync.mock.calls[0][0]).toContain(
      'CREATE TABLE IF NOT EXISTS product_source_references',
    );
    expect(execAsync.mock.calls[0][0]).toContain('usage_text TEXT');
    expect(execAsync.mock.calls[0][0]).toContain('information_confidence TEXT');
    expect(execAsync.mock.calls[0][0]).toContain(
      `PRAGMA user_version = ${SCHEMA_VERSION}`,
    );
  });

  it('does not rerun an already applied migration', async () => {
    const getFirstAsync = jest
      .fn()
      .mockResolvedValue({ user_version: SCHEMA_VERSION });
    const execAsync = jest.fn();

    await migrateDatabase({ getFirstAsync, execAsync } as Parameters<
      typeof migrateDatabase
    >[0]);

    expect(execAsync).not.toHaveBeenCalled();
  });

  it('adds product support to an existing routine database', async () => {
    const getFirstAsync = jest.fn().mockResolvedValue({ user_version: 1 });
    const execAsync = jest.fn().mockResolvedValue(undefined);

    await migrateDatabase({ getFirstAsync, execAsync } as Parameters<
      typeof migrateDatabase
    >[0]);

    expect(execAsync.mock.calls[0][0]).toContain(
      'ALTER TABLE routine_steps ADD COLUMN product_id',
    );
    expect(execAsync.mock.calls[0][0]).toContain(
      'CREATE TABLE IF NOT EXISTS products',
    );
    expect(execAsync.mock.calls[1][0]).toContain(
      'CREATE TABLE IF NOT EXISTS product_identifiers',
    );
  });

  it('adds normalized identifiers to the version 2 product cache', async () => {
    const getFirstAsync = jest.fn().mockResolvedValue({ user_version: 2 });
    const execAsync = jest.fn().mockResolvedValue(undefined);

    await migrateDatabase({ getFirstAsync, execAsync } as Parameters<
      typeof migrateDatabase
    >[0]);

    expect(execAsync.mock.calls[0][0]).toContain(
      'INSERT OR IGNORE INTO product_identifiers',
    );
  });

  it('adds ingredient provenance to the version 3 product cache', async () => {
    const getFirstAsync = jest.fn().mockResolvedValue({ user_version: 3 });
    const execAsync = jest.fn().mockResolvedValue(undefined);

    await migrateDatabase({ getFirstAsync, execAsync } as Parameters<
      typeof migrateDatabase
    >[0]);

    expect(execAsync).toHaveBeenCalledTimes(7);
    expect(execAsync.mock.calls[0][0]).toContain(
      'ALTER TABLE products ADD COLUMN ingredients_text',
    );
    expect(execAsync.mock.calls[1][0]).toContain(
      'ALTER TABLE products ADD COLUMN image_source',
    );
    expect(execAsync.mock.calls[2][0]).toContain(
      'CREATE TABLE IF NOT EXISTS product_ingredients',
    );
    expect(execAsync.mock.calls[6][0]).toContain(
      `PRAGMA user_version = ${SCHEMA_VERSION}`,
    );
  });

  it('adds image provenance to the version 4 product cache', async () => {
    const getFirstAsync = jest.fn().mockResolvedValue({ user_version: 4 });
    const execAsync = jest.fn().mockResolvedValue(undefined);

    await migrateDatabase({ getFirstAsync, execAsync } as Parameters<
      typeof migrateDatabase
    >[0]);

    expect(execAsync).toHaveBeenCalledTimes(6);
    expect(execAsync.mock.calls[0][0]).toContain(
      'ALTER TABLE products ADD COLUMN image_license_url',
    );
    expect(execAsync.mock.calls[1][0]).toContain(
      'CREATE TABLE IF NOT EXISTS product_ingredients',
    );
    expect(execAsync.mock.calls[2][0]).toContain(
      'CREATE TABLE IF NOT EXISTS product_collection',
    );
  });

  it('migrates every cached product to the personal collection without touching references', async () => {
    const getFirstAsync = jest.fn().mockResolvedValue({ user_version: 6 });
    const execAsync = jest.fn().mockResolvedValue(undefined);

    await migrateDatabase({ getFirstAsync, execAsync } as Parameters<
      typeof migrateDatabase
    >[0]);

    expect(execAsync).toHaveBeenCalledTimes(4);
    expect(execAsync.mock.calls[0][0]).toContain(
      'CREATE TABLE IF NOT EXISTS product_collection',
    );
    expect(execAsync.mock.calls[0][0]).toContain(
      'INSERT OR IGNORE INTO product_collection (product_id, added_at)',
    );
    expect(execAsync.mock.calls[0][0]).toContain(
      'SELECT id, created_at FROM products',
    );
    expect(execAsync.mock.calls[0][0]).not.toContain('DELETE FROM products');
    expect(execAsync.mock.calls[0][0]).not.toContain('routine_steps');
    expect(execAsync.mock.calls[3][0]).toContain(
      `PRAGMA user_version = ${SCHEMA_VERSION}`,
    );
  });

  it('migrates routine steps to immutable revisions and preserves completion history', async () => {
    const getFirstAsync = jest.fn().mockResolvedValue({ user_version: 7 });
    const execAsync = jest.fn().mockResolvedValue(undefined);

    await migrateDatabase({ getFirstAsync, execAsync } as Parameters<
      typeof migrateDatabase
    >[0]);

    expect(execAsync).toHaveBeenCalledTimes(3);
    const sql = execAsync.mock.calls[0][0];
    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_active_routine_per_period',
    );
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS routine_revisions');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS routine_revision_steps');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS daily_step_statuses');
    expect(sql).toContain("SELECT 'legacy-' || id, id, '0001-01-01'");
    expect(sql).toContain("SELECT 'legacy-' || step_id, scheduled_date");
    expect(sql).toContain('FROM step_completions WHERE completed = 1');
    expect(sql).toContain('PRAGMA user_version = 8');
    expect(execAsync.mock.calls[1][0]).toContain(
      'ALTER TABLE products ADD COLUMN usage_text',
    );
    expect(execAsync.mock.calls[2][0]).toContain(
      `PRAGMA user_version = ${SCHEMA_VERSION}`,
    );
  });

  it('adds nullable sourced essential details without touching personal data', async () => {
    const getFirstAsync = jest.fn().mockResolvedValue({ user_version: 8 });
    const execAsync = jest.fn().mockResolvedValue(undefined);

    await migrateDatabase({ getFirstAsync, execAsync } as Parameters<
      typeof migrateDatabase
    >[0]);

    expect(execAsync).toHaveBeenCalledTimes(2);
    const sql = execAsync.mock.calls[0][0];
    expect(sql).toContain('ALTER TABLE products ADD COLUMN usage_text TEXT');
    expect(sql).toContain(
      'ALTER TABLE products ADD COLUMN precautions_text TEXT',
    );
    expect(sql).toContain(
      'ALTER TABLE products ADD COLUMN information_confidence TEXT',
    );
    expect(sql).not.toContain('product_collection');
    expect(sql).not.toContain('routine_');
    expect(sql).not.toContain('DELETE FROM');
    expect(sql).toContain('PRAGMA user_version = 9');
    expect(execAsync.mock.calls[1][0]).toContain(
      'CREATE TABLE IF NOT EXISTS product_source_references',
    );
    expect(execAsync.mock.calls[1][0]).toContain(
      `PRAGMA user_version = ${SCHEMA_VERSION}`,
    );
  });

  it('adds stable catalogue references without touching personal data', async () => {
    const getFirstAsync = jest.fn().mockResolvedValue({ user_version: 9 });
    const execAsync = jest.fn().mockResolvedValue(undefined);

    await migrateDatabase({ getFirstAsync, execAsync } as Parameters<
      typeof migrateDatabase
    >[0]);

    expect(execAsync).toHaveBeenCalledTimes(1);
    const sql = execAsync.mock.calls[0][0];
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS product_source_references',
    );
    expect(sql).not.toContain('product_collection');
    expect(sql).not.toContain('routine_');
    expect(sql).not.toContain('DELETE FROM');
    expect(sql).toContain(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
});

describe('SQLiteRoutineRepository editing', () => {
  it('loads the revision displayed by Today instead of a later pending revision', async () => {
    const getFirstAsync = jest.fn(async (sql: string) => {
      if (sql.includes('FROM routines WHERE period')) {
        return {
          id: 'morning-routine',
          name: 'Routine du matin',
          period: 'morning',
          created_at: '2026-07-14T08:00:00.000Z',
          updated_at: '2026-07-14T08:00:00.000Z',
        };
      }
      if (sql.includes('effective_from <= ?')) {
        return { id: 'today-revision' };
      }
      return { id: 'future-revision' };
    });
    const getAllAsync = jest.fn().mockResolvedValue([
      {
        id: 'today-placeholder',
        product_id: null,
        title: 'Sérum',
        category: 'Sérum',
        instruction: 'Deux gouttes',
        position: 0,
        is_active: 1,
        selected_weekdays: '0,1,2,3,4,5,6',
        created_at: '2026-07-14T08:00:00.000Z',
        updated_at: '2026-07-14T08:00:00.000Z',
        status: null,
      },
    ]);
    const repository = new SQLiteRoutineRepository(
      jest.fn().mockResolvedValue({ getAllAsync, getFirstAsync }) as never,
    );

    const result = await repository.getRoutineForEditing(
      'morning',
      '2026-07-15',
    );

    expect(getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining('effective_from <= ?'),
      'morning-routine',
      '2026-07-15',
    );
    expect(getAllAsync).toHaveBeenCalledWith(
      expect.any(String),
      'today-revision',
    );
    expect(result?.steps[0]).toEqual(
      expect.objectContaining({
        id: 'today-placeholder',
        instruction: 'Deux gouttes',
      }),
    );
  });

  it('atomically replaces only the pending revision and reopens its complete definition', async () => {
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const getFirstAsync = jest.fn(async (sql: string) => {
      if (sql === 'PRAGMA user_version') {
        return { user_version: SCHEMA_VERSION };
      }
      if (sql.includes('effective_from = ?')) return { id: 'pending-revision' };
      if (sql.includes('FROM routines WHERE period')) {
        return {
          id: 'morning-routine',
          name: 'Routine du matin',
          period: 'morning',
          created_at: '2026-07-14T08:00:00.000Z',
          updated_at: '2026-07-14T08:00:00.000Z',
        };
      }
      if (sql.includes('ORDER BY effective_from DESC')) {
        return { id: 'new-pending-revision' };
      }
      return null;
    });
    const getAllAsync = jest.fn().mockResolvedValue([
      {
        id: 'step-1',
        product_id: null,
        title: 'Nettoyant',
        category: 'Nettoyant',
        instruction: 'Masser doucement',
        position: 0,
        is_active: 1,
        selected_weekdays: '1,3,5',
        created_at: '2026-07-14T08:00:00.000Z',
        updated_at: '2026-07-14T08:00:00.000Z',
        status: null,
      },
    ]);
    const db = {
      execAsync: jest.fn().mockResolvedValue(undefined),
      getAllAsync,
      getFirstAsync,
      runAsync,
      withTransactionAsync: jest.fn(async (operation: () => Promise<void>) =>
        operation(),
      ),
    };
    mockOpenDatabaseAsync.mockResolvedValue(db);
    const repository = new SQLiteRoutineRepository();

    await repository.replaceRoutineForFuture({
      routineId: 'morning-routine',
      effectiveFrom: '2099-01-02',
      steps: [
        {
          title: 'Nettoyant',
          category: 'Nettoyant',
          instruction: 'Masser doucement',
          position: 8,
          selectedWeekdays: [1, 3, 5],
        },
      ],
    });

    expect(runAsync).toHaveBeenCalledWith(
      'DELETE FROM routine_revisions WHERE id = ?',
      'pending-revision',
    );
    expect(
      runAsync.mock.calls.some(([sql]) =>
        String(sql).startsWith('DELETE FROM daily_step_statuses'),
      ),
    ).toBe(false);

    const reopened = await repository.getRoutineForEditing('morning');
    expect(reopened).toEqual({
      routine: expect.objectContaining({
        id: 'morning-routine',
        name: 'Routine du matin',
      }),
      steps: [
        expect.objectContaining({
          routineId: 'morning-routine',
          category: 'Nettoyant',
          instruction: 'Masser doucement',
          position: 0,
          selectedWeekdays: [1, 3, 5],
        }),
      ],
    });
  });

  it('applies a Today edit immediately while preserving its completed steps', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T12:00:00.000Z'));
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue({ id: 'today-revision' }),
      getAllAsync: jest.fn().mockResolvedValue([
        {
          id: 'cleanser-step',
          product_id: null,
          title: 'Nettoyant',
          category: 'Nettoyant',
          instruction: null,
          position: 0,
          is_active: 1,
          selected_weekdays: '0,1,2,3,4,5,6',
          created_at: '2026-07-15T08:00:00.000Z',
          updated_at: '2026-07-15T08:00:00.000Z',
          status: 'completed',
        },
      ]),
      runAsync,
      withTransactionAsync: jest.fn(async (operation: () => Promise<void>) =>
        operation(),
      ),
    };
    const repository = new SQLiteRoutineRepository(
      jest.fn().mockResolvedValue(db) as never,
    );

    await repository.replaceRoutineFromDate({
      routineId: 'morning-routine',
      effectiveFrom: '2026-07-15',
      sourceStepIds: [null, 'cleanser-step'],
      steps: [
        { title: 'Tonique', category: 'Tonique', position: 0 },
        { title: 'Nettoyant', category: 'Nettoyant', position: 1 },
      ],
    });

    expect(runAsync).toHaveBeenCalledWith(
      'DELETE FROM routine_revisions WHERE routine_id = ? AND effective_from >= ?',
      'morning-routine',
      '2026-07-15',
    );
    expect(runAsync).toHaveBeenCalledWith(
      'INSERT INTO daily_step_statuses (revision_step_id, scheduled_date, status, updated_at) VALUES (?, ?, ?, ?)',
      expect.any(String),
      '2026-07-15',
      'completed',
      '2026-07-16T12:00:00.000Z',
    );
    jest.useRealTimers();
  });

  it('replaces a compatible placeholder and marks ownership in the same transaction', async () => {
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('FROM routines WHERE period')) {
          return {
            id: 'morning-routine',
            name: 'Routine du matin',
            period: 'morning',
            created_at: '2026-07-14T08:00:00.000Z',
            updated_at: '2026-07-14T08:00:00.000Z',
          };
        }
        if (sql.includes('ORDER BY effective_from DESC')) {
          return { id: 'current-revision', effective_from: '0001-01-01' };
        }
        return null;
      }),
      getAllAsync: jest.fn().mockResolvedValue([
        {
          id: 'placeholder',
          product_id: null,
          title: 'Sérum',
          category: 'Sérum',
          instruction: 'Deux gouttes',
          position: 0,
          is_active: 1,
          selected_weekdays: '1,3,5',
          created_at: '2026-07-14T08:00:00.000Z',
          updated_at: '2026-07-14T08:00:00.000Z',
          status: null,
        },
      ]),
      runAsync,
      withTransactionAsync: jest.fn(async (operation: () => Promise<void>) =>
        operation(),
      ),
    };
    const repository = new SQLiteRoutineRepository(
      jest.fn().mockResolvedValue(db) as never,
    );

    await repository.addProductStep({
      period: 'morning',
      productId: 'serum-product',
      title: 'Sérum apaisant',
      category: 'Sérum',
      selectedWeekdays: [0, 1, 2, 3, 4, 5, 6],
    });

    expect(db.withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE INTO product_collection'),
      expect.any(String),
      'serum-product',
    );
    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO routine_revision_steps'),
      expect.any(String),
      expect.any(String),
      'serum-product',
      'Sérum apaisant',
      'Sérum',
      'Deux gouttes',
      0,
      1,
      '1,3,5',
      expect.any(String),
      expect.any(String),
    );
  });
});

describe('SQLiteRoutineRepository daily execution', () => {
  it('dates a new routine from creation or an explicit routine day', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T00:30:00.000Z'));
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('FROM routines WHERE period')) {
          return {
            id: 'evening-routine',
            name: 'Routine du soir',
            period: 'evening',
            created_at: '2026-07-15T00:30:00.000Z',
            updated_at: '2026-07-15T00:30:00.000Z',
          };
        }
        if (sql.includes('FROM routine_revisions')) return { id: 'revision-1' };
        return null;
      }),
      getAllAsync: jest.fn().mockResolvedValue([
        {
          id: 'step-1',
          routine_id: 'evening-routine',
          product_id: null,
          title: 'Hydratant',
          category: 'Hydratant',
          instruction: null,
          position: 0,
          is_active: 1,
          selected_weekdays: '0,1,2,3,4,5,6',
          created_at: '2026-07-15T00:30:00.000Z',
          updated_at: '2026-07-15T00:30:00.000Z',
          status: null,
        },
      ]),
      runAsync,
      withTransactionAsync: jest.fn(async (operation: () => Promise<void>) =>
        operation(),
      ),
    };
    const repository = new SQLiteRoutineRepository(
      jest.fn().mockResolvedValue(db) as never,
    );

    const created = await repository.createRoutine({
      name: 'Routine du soir',
      period: 'evening',
      steps: [{ title: 'Hydratant', category: 'Hydratant', position: 0 }],
    });

    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO routine_revisions'),
      expect.any(String),
      expect.any(String),
      '2026-07-15',
      '2026-07-15T00:30:00.000Z',
    );
    expect(created.scheduledDate).toBe('2026-07-15');

    const contextual = await repository.createRoutine({
      effectiveFrom: '2026-07-14',
      name: 'Routine du soir',
      period: 'evening',
      steps: [{ title: 'Hydratant', category: 'Hydratant', position: 0 }],
    });
    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO routine_revisions'),
      expect.any(String),
      expect.any(String),
      '2026-07-14',
      '2026-07-15T00:30:00.000Z',
    );
    expect(contextual.scheduledDate).toBe('2026-07-14');
    jest.useRealTimers();
  });

  it('does not expose a routine before its first revision date', async () => {
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('FROM routines WHERE period')) {
          return {
            id: 'morning-routine',
            name: 'Routine du matin',
            period: 'morning',
            created_at: '2026-07-15T08:00:00.000Z',
            updated_at: '2026-07-15T08:00:00.000Z',
          };
        }
        return null;
      }),
      getAllAsync: jest.fn(),
    };
    const repository = new SQLiteRoutineRepository(
      jest.fn().mockResolvedValue(db) as never,
    );

    await expect(
      repository.getOccurrenceForDate({
        period: 'morning',
        scheduledDate: '2026-07-14',
      }),
    ).resolves.toBeNull();
    expect(db.getFirstAsync).toHaveBeenLastCalledWith(
      expect.stringContaining('effective_from <= ?'),
      'morning-routine',
      '2026-07-14',
    );
    expect(db.getAllAsync).not.toHaveBeenCalled();
  });

  it('opens evening before 04:00 and keeps the fallback on the same routine day', async () => {
    const repository = new SQLiteRoutineRepository(jest.fn() as never);
    const getOccurrenceForDate = jest
      .spyOn(repository, 'getOccurrenceForDate')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({} as never);

    await repository.getCurrentOccurrence(new Date(2026, 6, 15, 2, 30));

    expect(getOccurrenceForDate).toHaveBeenNthCalledWith(1, {
      period: 'evening',
      scheduledDate: '2026-07-14',
    });
    expect(getOccurrenceForDate).toHaveBeenNthCalledWith(2, {
      period: 'morning',
      scheduledDate: '2026-07-14',
    });
  });

  it('loads only the active scheduled steps with their persisted statuses', async () => {
    const getAllAsync = jest.fn().mockResolvedValue([
      {
        id: 'placeholder-step',
        routine_id: 'morning-routine',
        product_id: 'moisturizer-product',
        product_image_url: 'https://example.com/moisturizer.webp',
        title: 'Hydratant',
        category: 'Hydratant',
        instruction: null,
        position: 0,
        is_active: 1,
        selected_weekdays: '3',
        created_at: '2026-07-15T08:00:00.000Z',
        updated_at: '2026-07-15T08:00:00.000Z',
        status: 'skipped',
      },
    ]);
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('FROM routines WHERE period')) {
          return {
            id: 'morning-routine',
            name: 'Routine du matin',
            period: 'morning',
            created_at: '2026-07-15T08:00:00.000Z',
            updated_at: '2026-07-15T08:00:00.000Z',
          };
        }
        if (sql.includes('FROM routine_revisions')) {
          return { id: 'revision-1' };
        }
        return null;
      }),
      getAllAsync,
    };
    const repository = new SQLiteRoutineRepository(
      jest.fn().mockResolvedValue(db) as never,
    );

    const result = await repository.getOccurrenceForDate({
      period: 'morning',
      scheduledDate: '2026-07-15',
    });

    expect(getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('routine_revision_steps.is_active = 1'),
      '2026-07-15',
      'revision-1',
      3,
    );
    expect(getAllAsync.mock.calls[0][0]).toContain('selected_weekdays');
    expect(getAllAsync.mock.calls[0][0]).toContain('LEFT JOIN products');
    expect(result?.steps).toEqual([
      expect.objectContaining({
        completed: false,
        productId: 'moisturizer-product',
        productImageUrl: 'https://example.com/moisturizer.webp',
        status: 'skipped',
        title: 'Hydratant',
      }),
    ]);
  });

  it.each([
    ['completed', 'INSERT INTO daily_step_statuses'],
    ['skipped', 'INSERT INTO daily_step_statuses'],
    [null, 'DELETE FROM daily_step_statuses'],
  ] as const)('persists the %s daily status', async (status, sqlFragment) => {
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const repository = new SQLiteRoutineRepository(
      jest.fn().mockResolvedValue({ runAsync }) as never,
    );

    await repository.setStepStatus({
      stepId: 'step-1',
      scheduledDate: '2026-07-15',
      status,
    });

    expect(runAsync.mock.calls[0][0]).toContain(sqlFragment);
    expect(runAsync.mock.calls[0]).toContain('step-1');
    expect(runAsync.mock.calls[0]).toContain('2026-07-15');
    if (status) expect(runAsync.mock.calls[0]).toContain(status);
  });
});
