import {
  lookupOpenBeautyFactsByText,
  lookupProductByBarcode,
  productCandidatesFromSearch,
  productDraftFromLookup,
} from './open-beauty-facts';
import { emptyProductDraft } from '@/domain/product';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('productDraftFromLookup', () => {
  it('maps the simple product fields used by the catalogue', () => {
    expect(
      productDraftFromLookup('3760201131234', {
        status: 1,
        product: {
          product_name: 'Crème hydratante',
          brands: 'Laboratoire Exemple',
          categories: 'Hydratants, Soins visage',
          image_front_url: 'https://example.com/product.jpg',
        },
      }),
    ).toEqual({
      ...emptyProductDraft,
      name: 'Crème hydratante',
      brand: 'Laboratoire Exemple',
      category: 'Hydratant',
      barcode: '3760201131234',
      imageUrl: '',
      imageSource: '',
      imageSourceUrl: '',
      imageLicense: '',
      imageLicenseUrl: '',
      ingredientsText: '',
      ingredientsSource: '',
      ingredientsSourceUrl: '',
      source: 'barcode',
    });
  });

  it('uses manual entry when the catalogue has no usable product', () => {
    expect(productDraftFromLookup('123', { status: 0 })).toBeNull();
    expect(
      productDraftFromLookup('123', { status: 1, product: {} }),
    ).toBeNull();
  });

  it('maps the universal v3 response and infers a missing category', () => {
    expect(
      productDraftFromLookup('3606000537194', {
        status: 'success',
        result: { id: 'product_found' },
        product: {
          product_name: 'Foaming Facial Cleanser',
          brands: 'CeraVe',
        },
      }),
    ).toMatchObject({
      name: 'Foaming Facial Cleanser',
      brand: 'CeraVe',
      category: 'Nettoyant',
    });
  });

  it('keeps the original INCI text and its provenance', () => {
    expect(
      productDraftFromLookup('3760201131234', {
        status: 1,
        product: {
          product_name: 'Sérum exemple',
          ingredients_text_fr: 'Aqua, Glycerin, Niacinamide',
        },
      }),
    ).toMatchObject({
      ingredientsText: 'Aqua, Glycerin, Niacinamide',
      ingredientsSource: 'Open Beauty Facts',
      ingredientsSourceUrl:
        'https://world.openbeautyfacts.org/product/3760201131234',
    });
  });

  it('maps text search results to confirmable candidates', () => {
    expect(
      productCandidatesFromSearch({
        products: [
          {
            code: '3606000537194',
            product_name: 'Foaming Facial Cleanser',
            brands: 'CeraVe',
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        id: 'open-beauty-facts:3606000537194',
        name: 'Foaming Facial Cleanser',
        brand: 'CeraVe',
        category: 'Nettoyant',
        informationConfidence: 'limited',
        confidenceSource: 'Open Beauty Facts (ODbL 1.0)',
        source: 'open-beauty-facts',
      }),
    ]);
  });

  it('uses a stable sourced identity when a public result has no barcode', () => {
    expect(
      productCandidatesFromSearch({
        products: [
          {
            product_name: 'Sérum apaisant',
            brands: 'Marque Exemple',
          },
        ],
      })[0].id,
    ).toBe('open-beauty-facts:marque exemple serum apaisant');
  });
});

describe('Open Facts network lookup', () => {
  it('uses the universal product endpoint for a barcode', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        status: 'success',
        result: { id: 'product_found' },
        product: {
          product_name: 'Foaming Facial Cleanser',
          brands: 'CeraVe',
        },
      }),
    });
    global.fetch = fetchMock;

    await expect(
      lookupProductByBarcode('3606000537194'),
    ).resolves.toMatchObject({
      name: 'Foaming Facial Cleanser',
      barcode: '3606000537194',
    });
    const requestedUrl = new URL(fetchMock.mock.calls[0][0].toString());
    expect(requestedUrl.pathname).toContain('/api/v3/product/3606000537194');
    expect(requestedUrl.searchParams.get('product_type')).toBe('all');
  });

  it('returns null for a definitive barcode miss', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        status: 'success',
        result: { id: 'product_not_found' },
      }),
    });

    await expect(lookupProductByBarcode('12345678')).resolves.toBeNull();
  });

  it('rejects provider errors so orchestration can use its fallback', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });

    await expect(lookupProductByBarcode('3606000537194')).rejects.toThrow(
      'lookup_failed',
    );
    await expect(
      lookupOpenBeautyFactsByText('CeraVe cleanser'),
    ).rejects.toThrow('lookup_failed');
  });

  it('builds one focused text query and maps its response', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        products: [
          {
            code: '3606000537194',
            product_name: 'Foaming Facial Cleanser',
            brands: 'CeraVe',
          },
        ],
      }),
    });
    global.fetch = fetchMock;

    const result = await lookupOpenBeautyFactsByText(
      'CeraVe\nFoaming Facial Cleanser\n236 ml',
    );

    expect(result[0]).toMatchObject({ name: 'Foaming Facial Cleanser' });
    const requestedUrl = new URL(fetchMock.mock.calls[0][0].toString());
    expect(requestedUrl.searchParams.get('search_terms')).toBe(
      'cerave foaming facial cleanser',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not call the network for unusable OCR text', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    await expect(lookupOpenBeautyFactsByText('236 ml')).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
