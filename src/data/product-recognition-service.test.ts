import {
  emptyProductDraft,
  type Product,
  type ProductDraft,
} from '@/domain/product';
import type { ProductCandidate } from '@/domain/product-recognition';

import {
  barcodeDraftNeedsEnrichment,
  mergeBarcodeEnrichment,
  recognizeProductBarcode,
  recognizeProductPhoto,
  searchProductsByText,
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

describe('searchProductsByText', () => {
  const localCandidate: ProductCandidate = {
    ...publicCandidate,
    id: 'local-aroma-zone',
    source: 'local',
  };

  it('stops after a reliable local cache result', async () => {
    const searchShared = jest.fn();
    const searchPublic = jest.fn();

    const result = await searchProductsByText(
      'AROMA-ZONE Sérum acide glycolique 10%',
      {
        searchLocal: jest.fn().mockResolvedValue([localCandidate]),
        searchShared,
        searchPublic,
      },
    );

    expect(result).toMatchObject({
      kind: 'results',
      candidates: [expect.objectContaining({ id: 'local-aroma-zone' })],
      isPartial: false,
    });
    expect(searchShared).not.toHaveBeenCalled();
    expect(searchPublic).not.toHaveBeenCalled();
  });

  it('combines shared and free public results after a local miss', async () => {
    const result = await searchProductsByText(
      'AROMA-ZONE Sérum acide glycolique 10%',
      {
        searchLocal: jest.fn().mockResolvedValue([]),
        searchShared: jest.fn().mockResolvedValue([publicCandidate]),
        searchPublic: jest.fn().mockResolvedValue([]),
      },
    );

    expect(result).toMatchObject({
      kind: 'results',
      candidates: [expect.objectContaining({ id: 'public-aroma-zone' })],
      isPartial: false,
    });
  });

  it('reports partial results without hiding an unavailable source', async () => {
    await expect(
      searchProductsByText('AROMA-ZONE Sérum acide glycolique 10%', {
        searchLocal: jest.fn().mockResolvedValue([]),
        searchShared: jest.fn().mockRejectedValue(new Error('offline')),
        searchPublic: jest.fn().mockResolvedValue([publicCandidate]),
      }),
    ).resolves.toMatchObject({ kind: 'results', isPartial: true });
  });

  it('distinguishes no result from complete lookup unavailability', async () => {
    await expect(
      searchProductsByText('Produit Exemple', {
        searchLocal: jest.fn().mockResolvedValue([]),
        searchShared: jest.fn().mockResolvedValue([]),
        searchPublic: jest.fn().mockResolvedValue([]),
      }),
    ).resolves.toEqual({ kind: 'not_found', isPartial: false });

    await expect(
      searchProductsByText('Produit Exemple', {
        searchLocal: jest.fn().mockRejectedValue(new Error('sqlite')),
        searchShared: jest.fn().mockRejectedValue(new Error('offline')),
        searchPublic: jest.fn().mockRejectedValue(new Error('offline')),
      }),
    ).resolves.toEqual({ kind: 'unavailable' });
  });
});

const barcodeDraft: ProductDraft = {
  ...emptyProductDraft,
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
  it('uses a complete local cache hit after shared validation', async () => {
    const completeLocalProduct = {
      ...localProduct,
      imageUrl: 'https://example.com/product.webp',
      ingredientsText: 'Aqua, Glycerin',
    };
    const dependencies = barcodeDependencies({
      findLocal: jest.fn().mockResolvedValue(completeLocalProduct),
    });

    const result = await recognizeProductBarcode(
      barcodeDraft.barcode,
      dependencies,
    );

    expect(result).toEqual({ kind: 'local', product: completeLocalProduct });
    expect(dependencies.lookupShared).toHaveBeenCalledTimes(1);
    expect(dependencies.lookupPublic).not.toHaveBeenCalled();
  });

  it('refreshes an incomplete local binding from the shared catalogue', async () => {
    const correctedDraft = {
      ...barcodeDraft,
      name: 'Crème Hydratante Visage SPF30',
      barcode: '3612623961421',
    };
    const dependencies = barcodeDependencies({
      findLocal: jest.fn().mockResolvedValue(localProduct),
      lookupShared: jest.fn().mockResolvedValue(correctedDraft),
    });

    expect(
      await recognizeProductBarcode('3612623961421', dependencies),
    ).toEqual({
      kind: 'draft',
      draft: correctedDraft,
      provider: 'shared',
    });
  });

  it('uses the shared catalogue before the public provider', async () => {
    const dependencies = barcodeDependencies({
      lookupShared: jest.fn().mockResolvedValue(barcodeDraft),
    });

    const result = await recognizeProductBarcode(
      barcodeDraft.barcode,
      dependencies,
    );

    expect(result).toEqual({
      kind: 'draft',
      draft: barcodeDraft,
      provider: 'shared',
    });
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

    expect(result).toEqual({
      kind: 'draft',
      draft: barcodeDraft,
      provider: 'public',
    });
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

describe('barcode enrichment', () => {
  it('fills image and ingredients without overwriting edited identity fields', () => {
    const current = {
      ...barcodeDraft,
      name: 'Nom corrigé par la personne',
      category: 'Hydratant',
    };
    const enriched = {
      ...barcodeDraft,
      name: 'Lait Hydratant',
      category: 'Autre',
      imageUrl: 'https://example.com/cerave.webp',
      imageSource: 'CeraVe',
      imageSourceUrl: 'https://example.com/cerave',
      ingredientsText: 'Aqua, Glycerin, Ceramide NP',
      ingredientsSource: 'CeraVe',
      ingredientsSourceUrl: 'https://example.com/cerave',
      usageText: 'Appliquer matin et soir.',
      usageSource: 'CeraVe',
      usageSourceUrl: 'https://example.com/cerave',
      precautionsText: 'Éviter le contact direct avec les yeux.',
      precautionsSource: 'CeraVe',
      precautionsSourceUrl: 'https://example.com/cerave',
      informationConfidence: 'high' as const,
      confidenceSource: 'Catalogue partagé',
      confidenceNote: 'Identité vérifiée.',
    };

    expect(mergeBarcodeEnrichment(current, enriched)).toMatchObject({
      name: 'Nom corrigé par la personne',
      category: 'Hydratant',
      imageUrl: 'https://example.com/cerave.webp',
      ingredientsText: 'Aqua, Glycerin, Ceramide NP',
      usageText: 'Appliquer matin et soir.',
      precautionsSource: 'CeraVe',
      informationConfidence: 'high',
    });
  });

  it('does not replace sourced details with unsourced enrichment text', () => {
    const current = {
      ...barcodeDraft,
      usageText: 'Usage existant.',
      usageSource: 'Fabricant',
    };
    const enriched = {
      ...barcodeDraft,
      usageText: 'Texte sans source',
    };

    expect(mergeBarcodeEnrichment(current, enriched)).toMatchObject({
      usageText: 'Usage existant.',
      usageSource: 'Fabricant',
    });
  });

  it('stops refreshing only after both useful fields are available', () => {
    expect(barcodeDraftNeedsEnrichment(barcodeDraft)).toBe(true);
    expect(
      barcodeDraftNeedsEnrichment({
        ...barcodeDraft,
        imageUrl: 'https://example.com/cerave.webp',
        ingredientsText: 'Aqua, Glycerin, Ceramide NP',
      }),
    ).toBe(false);
  });
});
