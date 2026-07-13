import { migrateDatabase, SCHEMA_VERSION } from './sqlite-routine-repository';

jest.mock('expo-sqlite', () => ({}));

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

    expect(execAsync).toHaveBeenCalledTimes(3);
    expect(execAsync.mock.calls[0][0]).toContain(
      'ALTER TABLE products ADD COLUMN ingredients_text',
    );
    expect(execAsync.mock.calls[1][0]).toContain(
      'ALTER TABLE products ADD COLUMN image_source',
    );
    expect(execAsync.mock.calls[2][0]).toContain(
      'CREATE TABLE IF NOT EXISTS product_ingredients',
    );
    expect(execAsync.mock.calls[2][0]).toContain(
      `PRAGMA user_version = ${SCHEMA_VERSION}`,
    );
  });

  it('adds image provenance to the version 4 product cache', async () => {
    const getFirstAsync = jest.fn().mockResolvedValue({ user_version: 4 });
    const execAsync = jest.fn().mockResolvedValue(undefined);

    await migrateDatabase({ getFirstAsync, execAsync } as Parameters<
      typeof migrateDatabase
    >[0]);

    expect(execAsync).toHaveBeenCalledTimes(2);
    expect(execAsync.mock.calls[0][0]).toContain(
      'ALTER TABLE products ADD COLUMN image_license_url',
    );
    expect(execAsync.mock.calls[1][0]).toContain(
      'CREATE TABLE IF NOT EXISTS product_ingredients',
    );
  });
});
