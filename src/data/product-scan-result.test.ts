import {
  emptyProductDraft,
  type Product,
  type ProductDraft,
} from '@/domain/product';

import {
  cacheScanResult,
  markScanResultAsOwned,
  openCachedScanResult,
  openProductCandidateResult,
} from './product-scan-result';
import type { ProductRepository } from './product-repository';

const product: Product = {
  id: 'product-1',
  name: 'Sérum apaisant',
  brand: 'Exemple',
  category: 'Sérum',
  barcode: '12345670',
  imageUrl: null,
  imageSource: null,
  imageSourceUrl: null,
  imageLicense: null,
  imageLicenseUrl: null,
  ingredientsText: null,
  ingredientsSource: null,
  ingredientsSourceUrl: null,
  usageText: null,
  usageSource: null,
  usageSourceUrl: null,
  precautionsText: null,
  precautionsSource: null,
  precautionsSourceUrl: null,
  informationConfidence: null,
  confidenceSource: null,
  confidenceSourceUrl: null,
  confidenceNote: null,
  source: 'barcode',
  createdAt: '2026-07-14T00:00:00.000Z',
  updatedAt: '2026-07-14T00:00:00.000Z',
};

const draft: ProductDraft = {
  ...emptyProductDraft,
  name: product.name,
  brand: product.brand ?? '',
  category: product.category ?? '',
  barcode: product.barcode ?? '',
  imageUrl: '',
  imageSource: '',
  imageSourceUrl: '',
  imageLicense: '',
  imageLicenseUrl: '',
  ingredientsText: '',
  ingredientsSource: '',
  ingredientsSourceUrl: '',
  source: 'barcode',
};

function repository(overrides: Partial<ProductRepository> = {}) {
  return {
    addIdentifier: jest.fn(),
    addSourceReference: jest.fn(),
    findById: jest.fn().mockResolvedValue(product),
    findByIdentifier: jest.fn().mockResolvedValue(null),
    findBySourceReference: jest.fn().mockResolvedValue(null),
    isOwned: jest.fn().mockResolvedValue(false),
    markAsOwned: jest.fn(),
    saveProduct: jest.fn().mockResolvedValue({ product, created: true }),
    ...overrides,
  } as unknown as ProductRepository;
}

it('caches a scanned result without adding it to the collection', async () => {
  const repo = repository();

  await expect(cacheScanResult(draft, repo)).resolves.toEqual({
    product,
    isOwned: false,
  });
  expect(repo.saveProduct).toHaveBeenCalledWith(draft);
  expect(repo.markAsOwned).not.toHaveBeenCalled();
});

it('reopens a sourced candidate from cache without creating a duplicate', async () => {
  const repo = repository({
    findBySourceReference: jest.fn().mockResolvedValue(product),
  });
  const candidate = {
    id: 'shared-product-1',
    name: product.name,
    brand: product.brand,
    category: product.category,
    imageUrl: null,
    score: 0.9,
    source: 'shared' as const,
  };

  await expect(openProductCandidateResult(candidate, repo)).resolves.toEqual({
    product,
    isOwned: false,
  });
  expect(repo.findBySourceReference).toHaveBeenCalledWith(
    'shared',
    'shared-product-1',
  );
  expect(repo.saveProduct).not.toHaveBeenCalled();
  expect(repo.markAsOwned).not.toHaveBeenCalled();
});

it('caches a sourced candidate with a stable reference but no ownership', async () => {
  const repo = repository();
  const candidate = {
    id: 'shared-product-1',
    name: product.name,
    brand: product.brand,
    category: product.category,
    imageUrl: null,
    score: 0.9,
    source: 'shared' as const,
  };

  await openProductCandidateResult(candidate, repo);

  expect(repo.saveProduct).toHaveBeenCalledWith(
    expect.objectContaining({ name: product.name }),
  );
  expect(repo.addSourceReference).toHaveBeenCalledWith(
    product.id,
    'shared',
    'shared-product-1',
  );
  expect(repo.markAsOwned).not.toHaveBeenCalled();
});

it('opens an existing cached result without changing ownership', async () => {
  const repo = repository();

  await expect(
    openCachedScanResult(product, '12345670', repo),
  ).resolves.toEqual({ product, isOwned: false });
  expect(repo.addIdentifier).toHaveBeenCalledWith(product.id, '12345670');
  expect(repo.markAsOwned).not.toHaveBeenCalled();
});

it('marks ownership at most once', async () => {
  const repo = repository();

  await expect(markScanResultAsOwned(product.id, repo)).resolves.toBe(true);
  expect(repo.markAsOwned).toHaveBeenCalledTimes(1);

  (repo.isOwned as jest.Mock).mockResolvedValue(true);
  await expect(markScanResultAsOwned(product.id, repo)).resolves.toBe(false);
  expect(repo.markAsOwned).toHaveBeenCalledTimes(1);
});
