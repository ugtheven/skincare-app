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
