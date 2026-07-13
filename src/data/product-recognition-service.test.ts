import type { Product, ProductDraft } from '@/domain/product';
import type { ProductCandidate } from '@/domain/product-recognition';

import {
  recognizeProductBarcode,
  recognizeProductPhoto,
  type BarcodeRecognitionDependencies,
  type PhotoRecognitionDependencies,
} from './product-recognition-service';

const recognizedAromaZone = {
  lines: [
    'AROMA = ZONE',
    'Sérum acide',
    'glycolique 10% & AHA',
    'Glycolic acid 10% & AHA serum',
    'MADE IN FRANCE',
    'Effet peeling & unifiant',
  ],
  text: [
    'AROMA = ZONE',
    'Sérum acide',
    'glycolique 10% & AHA',
    'Glycolic acid 10% & AHA serum',
    'MADE IN FRANCE',
    'Effet peeling & unifiant',
  ].join('\n'),
};

const publicCandidate: ProductCandidate = {
  id: 'public-aroma-zone',
  name: 'Sérum acide glycolique 10% & AHA',
  brand: 'AROMA-ZONE',
  category: 'Exfoliant',
  imageUrl: 'https://example.supabase.co/product-packshots/serum.webp',
  imageSource: 'Open Beauty Facts',
  imageLicense: 'CC BY-SA',
  score: 0,
  source: 'open-beauty-facts',
};

function photoDependencies(
  overrides: Partial<PhotoRecognitionDependencies> = {},
): PhotoRecognitionDependencies {
  return {
    recognizeText: jest.fn().mockResolvedValue(recognizedAromaZone),
    searchLocal: jest.fn().mockResolvedValue([]),
    searchShared: jest.fn().mockResolvedValue([]),
    searchPublic: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('recognizeProductPhoto', () => {
  it('returns a complete editable draft when every catalogue misses', async () => {
    const result = await recognizeProductPhoto(
      'file:///product.jpg',
      photoDependencies(),
    );

    expect(result).toEqual({
      kind: 'fallback_required',
      candidates: [],
      draft: expect.objectContaining({
        brand: 'AROMA-ZONE',
        name: 'Sérum acide glycolique 10% & AHA',
        category: 'Exfoliant',
      }),
      reason: 'not_found',
      recognizedText: recognizedAromaZone.text,
    });
  });

  it('keeps a local match but still requires web enrichment', async () => {
    const dependencies = photoDependencies({
      searchLocal: jest
        .fn()
        .mockResolvedValue([
          { ...publicCandidate, id: 'local-product', source: 'local' },
        ]),
    });

    const result = await recognizeProductPhoto(
      'file:///product.jpg',
      dependencies,
    );

    expect(result).toMatchObject({
      kind: 'fallback_required',
      candidates: [expect.objectContaining({ id: 'local-product' })],
    });
    expect(dependencies.searchShared).toHaveBeenCalled();
    expect(dependencies.searchPublic).toHaveBeenCalled();
  });

  it('keeps the public fallback when the shared catalogue fails', async () => {
    const result = await recognizeProductPhoto(
      'file:///product.jpg',
      photoDependencies({
        searchShared: jest.fn().mockRejectedValue(new Error('offline')),
        searchPublic: jest.fn().mockResolvedValue([publicCandidate]),
      }),
    );

    expect(result).toMatchObject({
      kind: 'fallback_required',
      candidates: [expect.objectContaining({ id: 'public-aroma-zone' })],
    });
  });

  it('keeps remote recognition when the local cache fails', async () => {
    const result = await recognizeProductPhoto(
      'file:///product.jpg',
      photoDependencies({
        searchLocal: jest.fn().mockRejectedValue(new Error('sqlite_error')),
        searchPublic: jest.fn().mockResolvedValue([publicCandidate]),
      }),
    );

    expect(result.kind).toBe('fallback_required');
  });

  it('requires a normalized image before displaying a suggestion', async () => {
    const result = await recognizeProductPhoto(
      'file:///product.jpg',
      photoDependencies({
        searchShared: jest
          .fn()
          .mockResolvedValue([{ ...publicCandidate, imageUrl: null }]),
      }),
    );

    expect(result).toMatchObject({
      kind: 'fallback_required',
      reason: 'low_confidence',
    });
  });

  it('distinguishes empty OCR from an OCR failure', async () => {
    const noText = await recognizeProductPhoto(
      'file:///blank.jpg',
      photoDependencies({
        recognizeText: jest.fn().mockResolvedValue({ lines: [], text: '' }),
      }),
    );
    const failure = await recognizeProductPhoto(
      'file:///broken.jpg',
      photoDependencies({
        recognizeText: jest.fn().mockRejectedValue(new Error('ocr_failed')),
      }),
    );

    expect(noText).toMatchObject({
      kind: 'fallback_required',
      reason: 'no_text',
    });
    expect(failure).toMatchObject({
      kind: 'fallback_required',
      reason: 'recognition_failed',
    });
  });

  it('reports unavailable lookup when the public search cannot complete', async () => {
    const result = await recognizeProductPhoto(
      'file:///product.jpg',
      photoDependencies({
        searchShared: jest.fn().mockResolvedValue([]),
        searchPublic: jest.fn().mockRejectedValue(new Error('offline')),
      }),
    );

    expect(result).toMatchObject({
      kind: 'fallback_required',
      reason: 'lookup_unavailable',
    });
  });
});

const barcodeDraft: ProductDraft = {
  name: 'Foaming Facial Cleanser',
  brand: 'CeraVe',
  category: 'Nettoyant',
  barcode: '3606000537194',
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

const localProduct: Product = {
  id: 'local-product',
  ...barcodeDraft,
  brand: barcodeDraft.brand,
  category: barcodeDraft.category,
  barcode: barcodeDraft.barcode,
  imageUrl: null,
  createdAt: '2026-07-12T12:00:00.000Z',
  updatedAt: '2026-07-12T12:00:00.000Z',
};

function barcodeDependencies(
  overrides: Partial<BarcodeRecognitionDependencies> = {},
): BarcodeRecognitionDependencies {
  return {
    findLocal: jest.fn().mockResolvedValue(null),
    lookupShared: jest.fn().mockResolvedValue(null),
    lookupPublic: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe('recognizeProductBarcode', () => {
  it('stops after a local cache hit', async () => {
    const dependencies = barcodeDependencies({
      findLocal: jest.fn().mockResolvedValue(localProduct),
    });

    const result = await recognizeProductBarcode(
      barcodeDraft.barcode,
      dependencies,
    );

    expect(result).toEqual({ kind: 'local', product: localProduct });
    expect(dependencies.lookupShared).not.toHaveBeenCalled();
    expect(dependencies.lookupPublic).not.toHaveBeenCalled();
  });

  it('uses the shared catalogue before the public provider', async () => {
    const dependencies = barcodeDependencies({
      lookupShared: jest.fn().mockResolvedValue(barcodeDraft),
    });

    const result = await recognizeProductBarcode(
      barcodeDraft.barcode,
      dependencies,
    );

    expect(result).toEqual({ kind: 'draft', draft: barcodeDraft });
    expect(dependencies.lookupPublic).not.toHaveBeenCalled();
  });

  it('does not repeat the public lookup after an authoritative shared miss', async () => {
    const dependencies = barcodeDependencies({
      lookupShared: jest.fn().mockResolvedValue(null),
    });
    const result = await recognizeProductBarcode(
      barcodeDraft.barcode,
      dependencies,
    );

    expect(result).toEqual({ kind: 'not_found' });
    expect(dependencies.lookupPublic).not.toHaveBeenCalled();
  });

  it('uses the public fallback when the shared service is unavailable', async () => {
    const result = await recognizeProductBarcode(barcodeDraft.barcode, {
      ...barcodeDependencies(),
      lookupShared: jest.fn().mockRejectedValue(new Error('offline')),
      lookupPublic: jest.fn().mockResolvedValue(barcodeDraft),
    });

    expect(result).toEqual({ kind: 'draft', draft: barcodeDraft });
  });

  it('does not send a short manufacturer code to the public GTIN provider', async () => {
    const dependencies = barcodeDependencies({
      lookupShared: jest.fn().mockRejectedValue(new Error('offline')),
    });

    const result = await recognizeProductBarcode('05110', dependencies);

    expect(result).toEqual({ kind: 'lookup_unavailable' });
    expect(dependencies.lookupPublic).not.toHaveBeenCalled();
  });

  it('distinguishes a definitive miss from provider unavailability', async () => {
    const miss = await recognizeProductBarcode(
      barcodeDraft.barcode,
      barcodeDependencies(),
    );
    const unavailable = await recognizeProductBarcode(
      barcodeDraft.barcode,
      barcodeDependencies({
        lookupShared: jest.fn().mockRejectedValue(new Error('offline')),
        lookupPublic: jest.fn().mockRejectedValue(new Error('offline')),
      }),
    );

    expect(miss).toEqual({ kind: 'not_found' });
    expect(unavailable).toEqual({ kind: 'lookup_unavailable' });
  });
});
