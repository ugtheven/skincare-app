import type {
  Product,
  ProductDraft,
  ProductInformationConfidence,
  ProductSource,
} from '@/domain/product';
import { parseIngredientList } from '@/domain/product-ingredients';
import {
  identifierKindFor,
  normalizeProductIdentifier,
} from '@/domain/product-identifier';
import { selectTextSearchCandidates } from '@/domain/product-recognition';

import type { ProductRepository } from './product-repository';
import {
  openSkincareDatabase,
  replaceProductUsagesWithPlaceholders,
} from './sqlite-routine-repository';
import { nextLocalDate } from '@/domain/routine';

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
  usage_text: string | null;
  usage_source: string | null;
  usage_source_url: string | null;
  precautions_text: string | null;
  precautions_source: string | null;
  precautions_source_url: string | null;
  information_confidence: ProductInformationConfidence | null;
  confidence_source: string | null;
  confidence_source_url: string | null;
  confidence_note: string | null;
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

function sourcedText(text: string, source: string, sourceUrl: string) {
  const normalizedText = nullable(text);
  const normalizedSource = nullable(source);
  if (!normalizedText || !normalizedSource) return null;
  return {
    text: normalizedText,
    source: normalizedSource,
    sourceUrl: nullable(sourceUrl),
  };
}

function sourcedConfidence(draft: ProductDraft) {
  const source = nullable(draft.confidenceSource);
  if (!draft.informationConfidence || !source) return null;
  return {
    level: draft.informationConfidence,
    source,
    sourceUrl: nullable(draft.confidenceSourceUrl),
    note: nullable(draft.confidenceNote),
  };
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
    usageText: row.usage_text,
    usageSource: row.usage_source,
    usageSourceUrl: row.usage_source_url,
    precautionsText: row.precautions_text,
    precautionsSource: row.precautions_source,
    precautionsSourceUrl: row.precautions_source_url,
    informationConfidence: row.information_confidence,
    confidenceSource: row.confidence_source,
    confidenceSourceUrl: row.confidence_source_url,
    confidenceNote: row.confidence_note,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function replaceProductIngredients(
  db: Awaited<ReturnType<typeof openSkincareDatabase>>,
  productId: string,
  ingredientsText: string,
) {
  await db.runAsync(
    'DELETE FROM product_ingredients WHERE product_id = ?',
    productId,
  );
  for (const ingredient of parseIngredientList(ingredientsText)) {
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
      productId,
      ingredient.normalizedName,
      ingredient.position,
      ingredient.name,
    );
  }
}

export class SQLiteProductRepository implements ProductRepository {
  constructor(
    private readonly openDatabase: typeof openSkincareDatabase = openSkincareDatabase,
  ) {}

  async listCachedProducts(): Promise<Product[]> {
    const db = await this.openDatabase();
    const rows = await db.getAllAsync<ProductRow>(
      'SELECT * FROM products ORDER BY created_at DESC',
    );

    return rows.map(toProduct);
  }

  async listOwnedProducts(): Promise<Product[]> {
    const db = await this.openDatabase();
    const rows = await db.getAllAsync<ProductRow>(
      `SELECT products.* FROM products
       JOIN product_collection ON product_collection.product_id = products.id
       ORDER BY product_collection.added_at DESC`,
    );

    return rows.map(toProduct);
  }

  async markAsOwned(productId: string): Promise<void> {
    const db = await this.openDatabase();
    await db.runAsync(
      `INSERT OR IGNORE INTO product_collection (product_id, added_at)
       SELECT id, ? FROM products WHERE id = ?`,
      nowIso(),
      productId,
    );
  }

  async removeFromCollection(productId: string): Promise<void> {
    const db = await this.openDatabase();
    await db.withTransactionAsync(async () => {
      await replaceProductUsagesWithPlaceholders(
        db,
        productId,
        nextLocalDate(new Date()),
      );
      await db.runAsync(
        'DELETE FROM product_collection WHERE product_id = ?',
        productId,
      );
    });
  }

  async isOwned(productId: string): Promise<boolean> {
    const db = await this.openDatabase();
    const row = await db.getFirstAsync<{ is_owned: number }>(
      `SELECT EXISTS(
         SELECT 1 FROM product_collection WHERE product_id = ?
       ) AS is_owned`,
      productId,
    );

    return Boolean(row?.is_owned);
  }

  async findById(productId: string): Promise<Product | null> {
    const db = await this.openDatabase();
    const row = await db.getFirstAsync<ProductRow>(
      'SELECT * FROM products WHERE id = ? LIMIT 1',
      productId,
    );

    return row ? toProduct(row) : null;
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

  async findBySourceReference(
    provider: string,
    externalId: string,
  ): Promise<Product | null> {
    const db = await this.openDatabase();
    const row = await db.getFirstAsync<ProductRow>(
      `SELECT products.* FROM products
       JOIN product_source_references
         ON product_source_references.product_id = products.id
       WHERE product_source_references.provider = ?
         AND product_source_references.external_id = ?
       LIMIT 1`,
      provider,
      externalId,
    );

    return row ? toProduct(row) : null;
  }

  async addSourceReference(
    productId: string,
    provider: string,
    externalId: string,
  ): Promise<void> {
    const db = await this.openDatabase();
    await db.runAsync(
      `INSERT OR IGNORE INTO product_source_references
       (product_id, provider, external_id, created_at)
       VALUES (?, ?, ?, ?)`,
      productId,
      provider,
      externalId,
      nowIso(),
    );
  }

  async searchByText(text: string): Promise<Product[]> {
    const products = await this.listCachedProducts();
    const byId = new Map(products.map((product) => [product.id, product]));
    return selectTextSearchCandidates(
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
    const usage = sourcedText(
      draft.usageText,
      draft.usageSource,
      draft.usageSourceUrl,
    );
    const precautions = sourcedText(
      draft.precautionsText,
      draft.precautionsSource,
      draft.precautionsSourceUrl,
    );
    const confidence = sourcedConfidence(draft);
    if (barcode) {
      const existing = await this.findByIdentifier(barcode);
      if (existing) {
        const db = await this.openDatabase();
        const updatedAt = nowIso();
        const product: Product = {
          ...existing,
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
          usageText: usage?.text ?? existing.usageText,
          usageSource: usage?.source ?? existing.usageSource,
          usageSourceUrl: usage ? usage.sourceUrl : existing.usageSourceUrl,
          precautionsText: precautions?.text ?? existing.precautionsText,
          precautionsSource: precautions?.source ?? existing.precautionsSource,
          precautionsSourceUrl: precautions
            ? precautions.sourceUrl
            : existing.precautionsSourceUrl,
          informationConfidence:
            confidence?.level ?? existing.informationConfidence,
          confidenceSource: confidence?.source ?? existing.confidenceSource,
          confidenceSourceUrl: confidence
            ? confidence.sourceUrl
            : existing.confidenceSourceUrl,
          confidenceNote: confidence
            ? confidence.note
            : existing.confidenceNote,
          source: draft.source,
          updatedAt,
        };
        await db.withTransactionAsync(async () => {
          await db.runAsync(
            `UPDATE products
             SET name = ?, brand = ?, category = ?, barcode = ?, image_url = ?,
                 image_source = ?, image_source_url = ?, image_license = ?,
                 image_license_url = ?, ingredients_text = ?,
                 ingredients_source = ?, ingredients_source_url = ?,
                 usage_text = ?, usage_source = ?, usage_source_url = ?,
                 precautions_text = ?, precautions_source = ?,
                 precautions_source_url = ?, information_confidence = ?,
                 confidence_source = ?, confidence_source_url = ?, confidence_note = ?,
                 source = ?, updated_at = ?
             WHERE id = ?`,
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
            product.usageText,
            product.usageSource,
            product.usageSourceUrl,
            product.precautionsText,
            product.precautionsSource,
            product.precautionsSourceUrl,
            product.informationConfidence,
            product.confidenceSource,
            product.confidenceSourceUrl,
            product.confidenceNote,
            product.source,
            product.updatedAt,
            product.id,
          );
          await replaceProductIngredients(
            db,
            product.id,
            draft.ingredientsText,
          );
        });
        return { product, created: false };
      }
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
      usageText: usage?.text ?? null,
      usageSource: usage?.source ?? null,
      usageSourceUrl: usage?.sourceUrl ?? null,
      precautionsText: precautions?.text ?? null,
      precautionsSource: precautions?.source ?? null,
      precautionsSourceUrl: precautions?.sourceUrl ?? null,
      informationConfidence: confidence?.level ?? null,
      confidenceSource: confidence?.source ?? null,
      confidenceSourceUrl: confidence?.sourceUrl ?? null,
      confidenceNote: confidence?.note ?? null,
      source: draft.source,
      createdAt,
      updatedAt: createdAt,
    };

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO products
       (id, name, brand, category, barcode, image_url, image_source,
        image_source_url, image_license, image_license_url, ingredients_text,
        ingredients_source, ingredients_source_url,
        usage_text, usage_source, usage_source_url, precautions_text,
        precautions_source, precautions_source_url, information_confidence,
        confidence_source, confidence_source_url, confidence_note,
        source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        product.usageText,
        product.usageSource,
        product.usageSourceUrl,
        product.precautionsText,
        product.precautionsSource,
        product.precautionsSourceUrl,
        product.informationConfidence,
        product.confidenceSource,
        product.confidenceSourceUrl,
        product.confidenceNote,
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

      await replaceProductIngredients(db, product.id, draft.ingredientsText);
    });

    return { product, created: true };
  }
}

export const productRepository = new SQLiteProductRepository();
