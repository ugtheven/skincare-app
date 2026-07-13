import type { Product, ProductDraft } from '@/domain/product';

export interface ProductRepository {
  listProducts(): Promise<Product[]>;
  findByBarcode(barcode: string): Promise<Product | null>;
  findByIdentifier(identifier: string): Promise<Product | null>;
  addIdentifier(productId: string, identifier: string): Promise<void>;
  searchByText(text: string): Promise<Product[]>;
  saveProduct(
    draft: ProductDraft,
  ): Promise<{ product: Product; created: boolean }>;
}
