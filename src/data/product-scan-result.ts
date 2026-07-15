import type { Product, ProductDraft } from '@/domain/product';
import {
  candidateToDraft,
  type ProductCandidate,
} from '@/domain/product-recognition';

import type { ProductRepository } from './product-repository';

type ScanResultRepository = Pick<
  ProductRepository,
  'addIdentifier' | 'isOwned' | 'markAsOwned' | 'saveProduct'
>;

type CandidateResultRepository = Pick<
  ProductRepository,
  | 'addSourceReference'
  | 'findById'
  | 'findBySourceReference'
  | 'isOwned'
  | 'saveProduct'
>;

export type ProductScanResult = {
  product: Product;
  isOwned: boolean;
};

export async function openCachedScanResult(
  product: Product,
  identifier: string | null | undefined,
  repository: ScanResultRepository,
): Promise<ProductScanResult> {
  if (identifier) {
    await repository.addIdentifier(product.id, identifier);
  }

  return {
    product,
    isOwned: await repository.isOwned(product.id),
  };
}

export async function cacheScanResult(
  draft: ProductDraft,
  repository: ScanResultRepository,
): Promise<ProductScanResult> {
  const { product } = await repository.saveProduct(draft);

  return {
    product,
    isOwned: await repository.isOwned(product.id),
  };
}

export async function openProductCandidateResult(
  candidate: ProductCandidate,
  repository: CandidateResultRepository,
): Promise<ProductScanResult> {
  if (candidate.source === 'local') {
    const product = await repository.findById(candidate.id);
    if (!product) throw new Error('cached_product_missing');
    return { product, isOwned: await repository.isOwned(product.id) };
  }

  const existing = await repository.findBySourceReference(
    candidate.source,
    candidate.id,
  );
  if (existing) {
    return {
      product: existing,
      isOwned: await repository.isOwned(existing.id),
    };
  }

  const { product } = await repository.saveProduct(candidateToDraft(candidate));
  await repository.addSourceReference(
    product.id,
    candidate.source,
    candidate.id,
  );
  return { product, isOwned: await repository.isOwned(product.id) };
}

export async function markScanResultAsOwned(
  productId: string,
  repository: ScanResultRepository,
): Promise<boolean> {
  if (await repository.isOwned(productId)) return false;

  await repository.markAsOwned(productId);
  return true;
}
