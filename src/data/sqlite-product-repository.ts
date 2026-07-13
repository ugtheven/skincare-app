import type { Product, ProductDraft, ProductSource } from '@/domain/product';
import { parseIngredientList } from '@/domain/product-ingredients';
import {
  identifierKindFor,
  normalizeProductIdentifier,
} from '@/domain/product-identifier';
import { selectProductCandidates } from '@/domain/product-recognition';

import type { ProductRepository } from './product-repository';
import { openSkincareDatabase } from './sqlite-routine-repository';

type ProductRow = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  image_url: string | null;
  image_source: string | null;
  image_source_url: string | null;
  image_license: string | null;
  image_license_url: string | null;
  ingredients_text: string | null;
  ingredients_source: string | null;
  ingredients_source_url: string | null;
  source: ProductSource;
  created_at: string;
  updated_at: string;
};

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function nullable(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    category: row.category,
    barcode: row.barcode,
    imageUrl: row.image_url,
    imageSource: row.image_source,
    imageSourceUrl: row.image_source_url,
    imageLicense: row.image_license,
    imageLicenseUrl: row.image_license_url,
    ingredientsText: row.ingredients_text,
    ingredientsSource: row.ingredients_source,
    ingredientsSourceUrl: row.ingredients_source_url,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SQLiteProductRepository implements ProductRepository {
  constructor(
    private readonly openDatabase: typeof openSkincareDatabase = openSkincareDatabase,
  ) {}

  async listProducts(): Promise<Product[]> {
    const db = await this.openDatabase();
    const rows = await db.getAllAsync<ProductRow>(
      'SELECT * FROM products ORDER BY created_at DESC',
    );

    return rows.map(toProduct);
  }

  async findByBarcode(barcode: string): Promise<Product | null> {
    return this.findByIdentifier(barcode);
  }

  async findByIdentifier(identifier: string): Promise<Product | null> {
    const db = await this.openDatabase();
    const row = await db.getFirstAsync<ProductRow>(
      `SELECT products.* FROM products
       JOIN product_identifiers ON product_identifiers.product_id = products.id
       WHERE product_identifiers.normalized_value = ?
       LIMIT 1`,
      normalizeProductIdentifier(identifier),
    );

    return row ? toProduct(row) : null;
  }

  async addIdentifier(productId: string, identifier: string): Promise<void> {
    const rawValue = identifier.trim();
    if (!rawValue) return;

    const db = await this.openDatabase();
    await db.runAsync(
      `INSERT OR IGNORE INTO product_identifiers
       (product_id, kind, raw_value, normalized_value, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      productId,
      identifierKindFor(rawValue),
      rawValue,
      normalizeProductIdentifier(rawValue),
      nowIso(),
    );
  }

  async searchByText(text: string): Promise<Product[]> {
    const products = await this.listProducts();
    const byId = new Map(products.map((product) => [product.id, product]));
    return selectProductCandidates(
      text,
      products.map((product) => ({
        id: product.id,
        name: product.name,
        brand: product.brand,
        category: product.category,
        imageUrl: product.imageUrl,
        score: 0,
        source: 'local' as const,
      })),
    )
      .map((candidate) => byId.get(candidate.id))
      .filter((product): product is Product => Boolean(product));
  }

  async saveProduct(
    draft: ProductDraft,
  ): Promise<{ product: Product; created: boolean }> {
    const barcode = nullable(draft.barcode);
    if (barcode) {
      const existing = await this.findByIdentifier(barcode);
      if (existing) return { product: existing, created: false };
    }

    const db = await this.openDatabase();
    const createdAt = nowIso();
    const product: Product = {
      id: createId(),
      name: draft.name.trim(),
      brand: nullable(draft.brand),
      category: nullable(draft.category),
      barcode,
      imageUrl: nullable(draft.imageUrl),
      imageSource: nullable(draft.imageSource),
      imageSourceUrl: nullable(draft.imageSourceUrl),
      imageLicense: nullable(draft.imageLicense),
      imageLicenseUrl: nullable(draft.imageLicenseUrl),
      ingredientsText: nullable(draft.ingredientsText),
      ingredientsSource: nullable(draft.ingredientsSource),
      ingredientsSourceUrl: nullable(draft.ingredientsSourceUrl),
      source: draft.source,
      createdAt,
      updatedAt: createdAt,
    };

    await db.runAsync(
      `INSERT INTO products
       (id, name, brand, category, barcode, image_url, image_source,
        image_source_url, image_license, image_license_url, ingredients_text,
        ingredients_source, ingredients_source_url, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      product.id,
      product.name,
      product.brand,
      product.category,
      product.barcode,
      product.imageUrl,
      product.imageSource,
      product.imageSourceUrl,
      product.imageLicense,
      product.imageLicenseUrl,
      product.ingredientsText,
      product.ingredientsSource,
      product.ingredientsSourceUrl,
      product.source,
      product.createdAt,
      product.updatedAt,
    );

    if (barcode) {
      await db.runAsync(
        `INSERT INTO product_identifiers
         (product_id, kind, raw_value, normalized_value, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        product.id,
        identifierKindFor(barcode),
        barcode,
        normalizeProductIdentifier(barcode),
        product.createdAt,
      );
    }

    for (const ingredient of parseIngredientList(draft.ingredientsText)) {
      await db.runAsync(
        `INSERT OR IGNORE INTO ingredients
         (normalized_name, canonical_name, review_status)
         VALUES (?, ?, 'pending')`,
        ingredient.normalizedName,
        ingredient.name,
      );
      await db.runAsync(
        `INSERT INTO product_ingredients
         (product_id, normalized_name, position, raw_name)
         VALUES (?, ?, ?, ?)`,
        product.id,
        ingredient.normalizedName,
        ingredient.position,
        ingredient.name,
      );
    }

    return { product, created: true };
  }
}

export const productRepository = new SQLiteProductRepository();
