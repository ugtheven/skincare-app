import {
  candidatesFromWebDetection,
  criticalProductVariantsMatch,
  matchingApprovedDomain,
  retailerIdentityHintsFromWebDetection,
  visualProductIdentityOverlap,
  webDetectionSignals,
  type ApprovedDomain,
} from './visual-lookup';

const approved: ApprovedDomain[] = [
  {
    domain: 'example-brand.com',
    brand: 'Example Brand',
    source_kind: 'manufacturer',
    license: 'press-use',
    license_url: 'https://example-brand.com/press',
  },
];

describe('visual lookup source policy', () => {
  it('distinguishes exact same-brand products before accepting Google Vision', () => {
    expect(
      visualProductIdentityOverlap(
        'AROMA-ZONE Sérum Rétinal Optimisé',
        'Sérum visage concentré Rétinal optimisé',
        'AROMA-ZONE',
      ),
    ).toBeGreaterThan(0);
    expect(
      visualProductIdentityOverlap(
        'AROMA-ZONE Sérum Rétinal Optimisé',
        'Sérum concentré Acide glycolique 10% & AHA',
        'AROMA-ZONE',
      ),
    ).toBe(0);
  });

  it('requires the exact SPF level before accepting a visual candidate', () => {
    const query = 'CeraVe Crème Hydratante Visage AM SPF 30';
    expect(
      criticalProductVariantsMatch(query, 'Crème Hydratante Visage SPF30'),
    ).toBe(true);
    expect(
      visualProductIdentityOverlap(query, 'Crème Hydratante Visage', 'CeraVe'),
    ).toBe(0);
    expect(
      visualProductIdentityOverlap(
        query,
        'Crème Hydratante Visage SPF50',
        'CeraVe',
      ),
    ).toBe(0);
  });

  it('accepts HTTPS subdomains of an approved source only', () => {
    expect(
      matchingApprovedDomain('https://media.example-brand.com/p.jpg', approved)
        ?.brand,
    ).toBe('Example Brand');
    expect(
      matchingApprovedDomain('http://example-brand.com/p.jpg', approved),
    ).toBeNull();
    expect(
      matchingApprovedDomain(
        'https://example-brand.com.evil.test/p.jpg',
        approved,
      ),
    ).toBeNull();
  });

  it('builds candidates only from approved pages and images', () => {
    expect(
      candidatesFromWebDetection(
        {
          pagesWithMatchingImages: [
            {
              url: 'https://example-brand.com/products/serum',
              pageTitle: 'Example Brand — Hydrating Serum',
              score: 0.81,
              fullMatchingImages: [
                { url: 'https://media.example-brand.com/serum.png' },
              ],
            },
            {
              url: 'https://unknown-shop.test/products/serum',
              pageTitle: 'Hydrating Serum',
              score: 0.99,
            },
          ],
        },
        approved,
      ),
    ).toEqual([
      expect.objectContaining({
        name: 'Hydrating Serum',
        brand: 'Example Brand',
        imageUrl: 'https://media.example-brand.com/serum.png',
        score: 0.81,
      }),
    ]);
  });

  it('uses retailer pages only as brand-bound identity hints', () => {
    const detection = {
      pagesWithMatchingImages: [
        {
          url: 'https://www.sephora.fr/p/example-brand-night-cream.html',
          pageTitle: 'Example Brand Night Cream PM | Sephora',
        },
        {
          url: 'https://unknown-shop.test/example-brand-night-cream',
          pageTitle: 'Example Brand Night Cream PM',
        },
        {
          url: 'https://www.amazon.fr/unrelated-product',
          pageTitle: 'Unrelated Night Cream',
        },
      ],
    };

    expect(
      retailerIdentityHintsFromWebDetection(
        detection,
        [
          { domain: 'sephora.fr', source_kind: 'retailer' },
          { domain: 'amazon.fr', source_kind: 'retailer' },
        ],
        'Example Brand',
      ),
    ).toEqual(['Example Brand Night Cream PM | Sephora']);
  });

  it('combines labels, entities and page titles without image data', () => {
    expect(
      webDetectionSignals({
        bestGuessLabels: [{ label: 'Example serum' }],
        webEntities: [{ description: 'Example Brand' }],
        pagesWithMatchingImages: [{ pageTitle: 'Hydrating Serum' }],
      }),
    ).toBe('Example serum Example Brand Hydrating Serum');
  });

  it('does not mistake a generic licensed catalogue for a manufacturer brand', () => {
    expect(
      candidatesFromWebDetection(
        {
          pagesWithMatchingImages: [
            {
              url: 'https://images.openbeautyfacts.org/product/123',
              pageTitle: 'Example Brand Hydrating Serum',
              fullMatchingImages: [
                { url: 'https://images.openbeautyfacts.org/serum.jpg' },
              ],
            },
          ],
        },
        [
          ...approved,
          {
            domain: 'images.openbeautyfacts.org',
            brand: 'Open Beauty Facts',
            source_kind: 'licensed_catalogue',
            license: 'CC BY-SA',
            license_url: 'https://example.test/license',
          },
        ],
      ),
    ).toEqual([]);
  });
});
