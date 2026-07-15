import { emptyProductDraft } from '@/domain/product';

import { SQLiteProductRepository } from './sqlite-product-repository';

jest.mock('expo-sqlite', () => ({}));

const productRows = [
  {
    id: 'cleanser',
    name: 'Foaming Facial Cleanser',
    brand: 'CeraVe',
    category: 'Nettoyant',
    barcode: '12345678',
    image_url: null,
    ingredients_text: null,
    ingredients_source: null,
    ingredients_source_url: null,
    usage_text: 'Appliquer sur peau humide puis rincer.',
    usage_source: 'CeraVe',
    usage_source_url: 'https://example.com/cleanser',
    precautions_text: 'Éviter le contact direct avec les yeux.',
    precautions_source: 'CeraVe',
    precautions_source_url: 'https://example.com/cleanser',
    information_confidence: 'high',
    confidence_source: 'Catalogue partagé',
    confidence_source_url: null,
    confidence_note: 'Identité vérifiée par code-barres.',
    source: 'barcode',
    created_at: '2026-07-12T12:00:00.000Z',
    updated_at: '2026-07-12T12:00:00.000Z',
  },
  {
    id: 'cream',
    name: 'Moisturising Cream',
    brand: 'CeraVe',
    category: 'Hydratant',
    barcode: null,
    image_url: null,
    ingredients_text: null,
    ingredients_source: null,
    ingredients_source_url: null,
    source: 'manual',
    created_at: '2026-07-12T11:00:00.000Z',
    updated_at: '2026-07-12T11:00:00.000Z',
  },
] as const;

describe('SQLiteProductRepository', () => {
  it('lists only products explicitly present in the personal collection', async () => {
    const db = { getAllAsync: jest.fn().mockResolvedValue(productRows) };
    const repository = new SQLiteProductRepository(
      jest.fn().mockResolvedValue(db) as never,
    );

    const products = await repository.listOwnedProducts();

    expect(products.map((product) => product.id)).toEqual([
      'cleanser',
      'cream',
    ]);
    expect(db.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('JOIN product_collection'),
    );
  });

  it('marks ownership idempotently and reports it independently of the cache', async () => {
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue({ is_owned: 1 }),
      runAsync: jest.fn().mockResolvedValue(undefined),
    };
    const repository = new SQLiteProductRepository(
      jest.fn().mockResolvedValue(db) as never,
    );

    await repository.markAsOwned('cleanser');
    await repository.markAsOwned('cleanser');

    expect(db.runAsync).toHaveBeenCalledTimes(2);
    expect(db.runAsync).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT OR IGNORE INTO product_collection'),
      expect.any(String),
      'cleanser',
    );
    await expect(repository.isOwned('cleanser')).resolves.toBe(true);
    expect(db.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining('FROM product_collection'),
      'cleanser',
    );
  });

  it('removes only ownership while preserving the cached product and references', async () => {
    const db = {
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn().mockResolvedValue(undefined),
      withTransactionAsync: jest.fn(async (operation: () => Promise<void>) =>
        operation(),
      ),
    };
    const repository = new SQLiteProductRepository(
      jest.fn().mockResolvedValue(db) as never,
    );

    await repository.removeFromCollection('cleanser');

    expect(db.runAsync).toHaveBeenCalledWith(
      'DELETE FROM product_collection WHERE product_id = ?',
      'cleanser',
    );
    expect(
      db.runAsync.mock.calls.some(([statement]) =>
        String(statement).includes('DELETE FROM products'),
      ),
    ).toBe(false);
  });

  it('keeps cache and references intact across duplicate ownership and removal', async () => {
    const ownedIds = new Set<string>();
    const routineReference = { productId: 'cleanser' };
    const historicalReference = { productId: 'cleanser' };
    const db = {
      getAllAsync: jest.fn(async (statement: string) => {
        if (statement.includes('FROM routines')) return [];
        return statement.includes('JOIN product_collection')
          ? productRows.filter((product) => ownedIds.has(product.id))
          : productRows;
      }),
      getFirstAsync: jest.fn(async (statement: string, productId: string) => {
        if (statement.includes('SELECT EXISTS')) {
          return { is_owned: ownedIds.has(productId) ? 1 : 0 };
        }
        return productRows.find((product) => product.id === productId) ?? null;
      }),
      runAsync: jest.fn(async (statement: string, ...params: string[]) => {
        if (statement.includes('INSERT OR IGNORE INTO product_collection')) {
          ownedIds.add(params[1]);
        }
        if (statement.startsWith('DELETE FROM product_collection')) {
          ownedIds.delete(params[0]);
        }
      }),
      withTransactionAsync: jest.fn(async (operation: () => Promise<void>) =>
        operation(),
      ),
    };
    const repository = new SQLiteProductRepository(
      jest.fn().mockResolvedValue(db) as never,
    );

    await repository.markAsOwned('cleanser');
    await repository.markAsOwned('cleanser');

    await expect(repository.listOwnedProducts()).resolves.toHaveLength(1);
    expect(ownedIds.size).toBe(1);

    await repository.removeFromCollection('cleanser');

    await expect(repository.listOwnedProducts()).resolves.toEqual([]);
    await expect(repository.isOwned('cleanser')).resolves.toBe(false);
    await expect(repository.findById('cleanser')).resolves.toMatchObject({
      id: 'cleanser',
    });
    expect(routineReference.productId).toBe('cleanser');
    expect(historicalReference.productId).toBe('cleanser');
  });

  it('converts future usages to placeholders before removing ownership', async () => {
    const calls: string[] = [];
    const db = {
      getFirstAsync: jest.fn(async (statement: string) =>
        statement.includes('effective_from <=')
          ? { id: 'historical-revision', effective_from: '0001-01-01' }
          : null,
      ),
      getAllAsync: jest.fn(async (statement: string) => {
        if (statement.includes('FROM routines')) {
          return [
            {
              id: 'morning-routine',
              name: 'Routine du matin',
              period: 'morning',
              created_at: '2026-07-14T08:00:00.000Z',
              updated_at: '2026-07-14T08:00:00.000Z',
            },
          ];
        }
        if (statement.includes('FROM routine_revisions')) return [];
        if (statement.includes('FROM routine_revision_steps')) {
          return [
            {
              id: 'historical-step',
              product_id: 'cleanser',
              title: 'Foaming Facial Cleanser',
              category: 'Nettoyant',
              instruction: 'Masser doucement',
              position: 0,
              is_active: 1,
              selected_weekdays: '1,3,5',
              created_at: '2026-07-14T08:00:00.000Z',
              updated_at: '2026-07-14T08:00:00.000Z',
              status: null,
            },
          ];
        }
        return [];
      }),
      runAsync: jest.fn(async (statement: string) => {
        calls.push(statement);
      }),
      withTransactionAsync: jest.fn(async (operation: () => Promise<void>) =>
        operation(),
      ),
    };
    const repository = new SQLiteProductRepository(
      jest.fn().mockResolvedValue(db) as never,
    );

    await repository.removeFromCollection('cleanser');

    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO routine_revision_steps'),
      expect.any(String),
      expect.any(String),
      null,
      'Nettoyant',
      'Nettoyant',
      'Masser doucement',
      0,
      1,
      '1,3,5',
      expect.any(String),
      expect.any(String),
    );
    expect(calls.at(-1)).toBe(
      'DELETE FROM product_collection WHERE product_id = ?',
    );
    expect(
      calls.some((statement) => statement.includes('DELETE FROM products')),
    ).toBe(false);
    expect(calls).not.toContain('DELETE FROM routine_revisions WHERE id = ?');
  });

  it('keeps identifier lookup in the local cache', async () => {
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue(productRows[0]),
    };
    const repository = new SQLiteProductRepository(
      jest.fn().mockResolvedValue(db) as never,
    );

    const product = await repository.findByIdentifier(' 1234 5678 ');

    expect(product?.id).toBe('cleanser');
    expect(db.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining('product_identifiers.normalized_value'),
      '12345678',
    );
  });

  it('ranks cached products before any remote text lookup is needed', async () => {
    const db = { getAllAsync: jest.fn().mockResolvedValue(productRows) };
    const repository = new SQLiteProductRepository(
      jest.fn().mockResolvedValue(db) as never,
    );

    const matches = await repository.searchByText(
      'CeraVe Foaming Facial Cleanser',
    );

    expect(matches.map((product) => product.id)).toEqual(['cleanser']);
    expect(db.getAllAsync).toHaveBeenCalledTimes(1);
  });

  it('finds cached products from a deliberate brand-only search', async () => {
    const db = { getAllAsync: jest.fn().mockResolvedValue(productRows) };
    const repository = new SQLiteProductRepository(
      jest.fn().mockResolvedValue(db) as never,
    );

    const matches = await repository.searchByText('CeraVe');

    expect(matches.map((product) => product.id)).toEqual(['cleanser', 'cream']);
  });

  it('binds a manufacturer code to a confirmed local product', async () => {
    const db = { runAsync: jest.fn().mockResolvedValue(undefined) };
    const repository = new SQLiteProductRepository(
      jest.fn().mockResolvedValue(db) as never,
    );

    await repository.addIdentifier('cream', ' 05110 ');

    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE INTO product_identifiers'),
      'cream',
      'qr',
      '05110',
      '05110',
      expect.any(String),
    );
  });

  it('stores catalogue references separately from scannable identifiers', async () => {
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue(productRows[0]),
      runAsync: jest.fn().mockResolvedValue(undefined),
    };
    const repository = new SQLiteProductRepository(
      jest.fn().mockResolvedValue(db) as never,
    );

    await expect(
      repository.findBySourceReference('shared', 'catalogue-product'),
    ).resolves.toMatchObject({ id: 'cleanser' });
    await repository.addSourceReference(
      'cleanser',
      'shared',
      'catalogue-product',
    );

    expect(db.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining('JOIN product_source_references'),
      'shared',
      'catalogue-product',
    );
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining(
        'INSERT OR IGNORE INTO product_source_references',
      ),
      'cleanser',
      'shared',
      'catalogue-product',
      expect.any(String),
    );
  });

  it('saves the product, identifier, and ingredients in one transaction', async () => {
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue(null),
      runAsync: jest.fn().mockResolvedValue(undefined),
      withTransactionAsync: jest.fn(async (task: () => Promise<void>) =>
        task(),
      ),
    };
    const repository = new SQLiteProductRepository(
      jest.fn().mockResolvedValue(db) as never,
    );

    await repository.saveProduct({
      ...emptyProductDraft,
      name: 'Sérum test',
      brand: 'Marque',
      category: 'Sérum',
      barcode: '12345670',
      imageUrl: '',
      imageSource: '',
      imageSourceUrl: '',
      imageLicense: '',
      imageLicenseUrl: '',
      ingredientsText: 'Aqua, Glycerin',
      ingredientsSource: 'Fabricant',
      ingredientsSourceUrl: 'https://example.com',
      source: 'barcode',
    });

    expect(db.withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO product_ingredients'),
      expect.any(String),
      'aqua',
      0,
      'Aqua',
    );
    expect(
      db.runAsync.mock.calls.some(([statement]) =>
        String(statement).includes('product_collection'),
      ),
    ).toBe(false);
  });

  it('persists sourced essential details without changing ownership', async () => {
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue(null),
      runAsync: jest.fn().mockResolvedValue(undefined),
      withTransactionAsync: jest.fn(async (task: () => Promise<void>) =>
        task(),
      ),
    };
    const repository = new SQLiteProductRepository(
      jest.fn().mockResolvedValue(db) as never,
    );

    const result = await repository.saveProduct({
      ...emptyProductDraft,
      name: 'Sérum test',
      category: 'Sérum',
      usageText: 'Appliquer le soir.',
      usageSource: 'Fabricant',
      usageSourceUrl: 'https://example.com/serum',
      precautionsText: 'Utiliser une protection solaire adaptée.',
      precautionsSource: 'Fabricant',
      precautionsSourceUrl: 'https://example.com/serum',
      informationConfidence: 'high',
      confidenceSource: 'Catalogue partagé',
      confidenceNote: 'Identité vérifiée.',
    });

    expect(result.product).toMatchObject({
      usageText: 'Appliquer le soir.',
      precautionsSource: 'Fabricant',
      informationConfidence: 'high',
    });
    expect(
      db.runAsync.mock.calls.some(([statement]) =>
        String(statement).includes('usage_text, usage_source'),
      ),
    ).toBe(true);
    expect(
      db.runAsync.mock.calls.some(([statement]) =>
        String(statement).includes('product_collection'),
      ),
    ).toBe(false);
  });

  it('preserves sourced details when a partial lookup has no replacement', async () => {
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue(productRows[0]),
      runAsync: jest.fn().mockResolvedValue(undefined),
      withTransactionAsync: jest.fn(async (task: () => Promise<void>) =>
        task(),
      ),
    };
    const repository = new SQLiteProductRepository(
      jest.fn().mockResolvedValue(db) as never,
    );

    const result = await repository.saveProduct({
      ...emptyProductDraft,
      name: productRows[0].name,
      brand: productRows[0].brand,
      category: productRows[0].category,
      barcode: productRows[0].barcode,
      usageText: 'Texte sans provenance',
    });

    expect(result.product).toMatchObject({
      usageText: productRows[0].usage_text,
      usageSource: productRows[0].usage_source,
      precautionsText: productRows[0].precautions_text,
      informationConfidence: 'high',
    });
  });

  it('replaces a stale local barcode result with the corrected shared variant', async () => {
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue(productRows[0]),
      runAsync: jest.fn().mockResolvedValue(undefined),
      withTransactionAsync: jest.fn(async (task: () => Promise<void>) =>
        task(),
      ),
    };
    const repository = new SQLiteProductRepository(
      jest.fn().mockResolvedValue(db) as never,
    );

    const result = await repository.saveProduct({
      ...emptyProductDraft,
      name: 'Crème Hydratante Visage SPF30',
      brand: 'CeraVe',
      category: 'Protection solaire',
      barcode: '12345678',
      imageUrl: 'https://example.com/spf30.webp',
      imageSource: 'CeraVe',
      imageSourceUrl: 'https://example.com/spf30',
      imageLicense: '',
      imageLicenseUrl: '',
      ingredientsText: 'Aqua, Glycerin',
      ingredientsSource: 'CeraVe',
      ingredientsSourceUrl: 'https://example.com/spf30',
      source: 'barcode',
    });

    expect(result).toMatchObject({
      created: false,
      product: {
        id: 'cleanser',
        name: 'Crème Hydratante Visage SPF30',
        category: 'Protection solaire',
      },
    });
    expect(
      db.runAsync.mock.calls.some(([statement]) =>
        String(statement).includes('UPDATE products'),
      ),
    ).toBe(true);
  });
});
