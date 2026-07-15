import type { Product, ProductDraft } from '@/domain/product';

export interface ProductRepository {
  listCachedProducts(): Promise<Product[]>;
  listOwnedProducts(): Promise<Product[]>;
  markAsOwned(productId: string): Promise<void>;
  removeFromCollection(productId: string): Promise<void>;
  isOwned(productId: string): Promise<boolean>;
  findById(productId: string): Promise<Product | null>;
  findByBarcode(barcode: string): Promise<Product | null>;
  findByIdentifier(identifier: string): Promise<Product | null>;
  addIdentifier(productId: string, identifier: string): Promise<void>;
  findBySourceReference(
    provider: string,
    externalId: string,
  ): Promise<Product | null>;
  addSourceReference(
    productId: string,
    provider: string,
    externalId: string,
  ): Promise<void>;
  searchByText(text: string): Promise<Product[]>;
  saveProduct(
    draft: ProductDraft,
  ): Promise<{ product: Product; created: boolean }>;
}
