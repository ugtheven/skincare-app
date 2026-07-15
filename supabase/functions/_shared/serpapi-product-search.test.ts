import {
  candidatesFromSerpApiImages,
  retailerIdentityHintsFromSerpApiImages,
  searchSerpApiProductImages,
  serpApiGoogleImagesUrl,
} from './serpapi-product-search';
import type { ApprovedDomain } from './visual-lookup';

const approved: ApprovedDomain[] = [
  {
    domain: 'aroma-zone.com',
    brand: 'AROMA-ZONE',
    source_kind: 'manufacturer',
    license: null,
    license_url: null,
  },
];

describe('SerpApi product image search', () => {
  it('builds a Google Images request from OCR text', () => {
    const url = serpApiGoogleImagesUrl(
      'secret',
      'AROMA-ZONE serum acide glycolique 10 AHA',
    );
    expect(url.origin + url.pathname).toBe('https://serpapi.com/search.json');
    expect(url.searchParams.get('engine')).toBe('google_images');
    expect(url.searchParams.get('q')).toContain('acide glycolique');
    expect(url.searchParams.get('safe')).toBe('active');
  });

  it('scopes a known brand query to its approved manufacturer domains', () => {
    const url = serpApiGoogleImagesUrl(
      'secret',
      'AROMA-ZONE Sérum Rétinal Optimisé',
      ['aroma-zone.com', 'www.aroma-zone.com', 'not a domain'],
    );

    expect(url.searchParams.get('q')).toBe(
      'AROMA-ZONE Sérum Rétinal Optimisé (site:aroma-zone.com)',
    );
  });

  it('uses the approved manufacturer scope for the provider request', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({ images_results: [] }),
      ok: true,
    } as Response);

    try {
      await searchSerpApiProductImages(
        'secret',
        'AROMA-ZONE Sérum Rétinal Optimisé',
        approved,
        [],
        'AROMA-ZONE',
      );

      const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
      expect(requestUrl.searchParams.get('q')).toBe(
        'AROMA-ZONE Sérum Rétinal Optimisé (site:aroma-zone.com)',
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('accepts an exact product only when page and image are official', () => {
    expect(
      candidatesFromSerpApiImages(
        {
          images_results: [
            {
              position: 1,
              title:
                'Sérum visage concentré Acide Glycolique 10% & AHA - AROMA-ZONE',
              link: 'https://www.aroma-zone.com/info/fiche-technique/serum-visage-concentre-acide-glycolique-10-aha-aroma-zone',
              original:
                'https://media.aroma-zone.com/serum-acide-glycolique.jpg',
            },
          ],
        },
        approved,
        'AROMA-ZONE serum acide glycolique 10 AHA',
      ),
    ).toEqual([
      expect.objectContaining({
        brand: 'AROMA-ZONE',
        imageUrl: 'https://media.aroma-zone.com/serum-acide-glycolique.jpg',
        name: 'Sérum visage concentré Acide Glycolique 10% & AHA',
      }),
    ]);
  });

  it('rejects a same-brand product with insufficient identity overlap', () => {
    expect(
      candidatesFromSerpApiImages(
        {
          images_results: [
            {
              title: 'Sérum concentré Niacinamide 10% - AROMA-ZONE',
              link: 'https://www.aroma-zone.com/info/fiche-technique/serum-niacinamide',
              original: 'https://media.aroma-zone.com/serum-niacinamide.jpg',
            },
          ],
        },
        approved,
        'AROMA-ZONE serum acide glycolique 10 AHA',
      ),
    ).toEqual([]);
  });

  it('uses the OCR identity when the official title and route complement each other', () => {
    expect(
      candidatesFromSerpApiImages(
        {
          images_results: [
            {
              position: 1,
              title: 'Retinol serum anti-âge - Aroma-Zone',
              link: 'https://www.aroma-zone.com/info/fiche-technique/serum-concentre-retinol-optimise',
              original: 'https://media.aroma-zone.com/serum-retinal.jpg',
            },
          ],
        },
        approved,
        'AROMA-ZONE Sérum Rétinal Optimisé',
      ),
    ).toEqual([
      expect.objectContaining({
        brand: 'AROMA-ZONE',
        name: 'Sérum Rétinal Optimisé',
      }),
    ]);
  });

  it('rejects retailer pages and unapproved image hosts', () => {
    expect(
      candidatesFromSerpApiImages(
        {
          images_results: [
            {
              title: 'Sérum acide glycolique 10% AHA AROMA-ZONE',
              link: 'https://retailer.test/aroma-zone-glycolique',
              original: 'https://images.retailer.test/glycolique.jpg',
            },
          ],
        },
        approved,
        'AROMA-ZONE serum acide glycolique 10 AHA',
      ),
    ).toEqual([]);
  });

  it('keeps approved retailer titles as identity-only hints', () => {
    const payload = {
      images_results: [
        {
          title: 'AROMA-ZONE Sérum Acide Glycolique 10% | Sephora',
          link: 'https://www.sephora.fr/p/serum-glycolique.html',
        },
        {
          title: 'Another brand serum',
          link: 'https://www.amazon.fr/dp/example',
        },
      ],
    };

    expect(
      retailerIdentityHintsFromSerpApiImages(
        payload,
        [
          { domain: 'sephora.fr', source_kind: 'retailer' },
          { domain: 'amazon.fr', source_kind: 'retailer' },
        ],
        'AROMA-ZONE',
      ),
    ).toEqual(['AROMA-ZONE Sérum Acide Glycolique 10% | Sephora']);
  });
});
