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
});
