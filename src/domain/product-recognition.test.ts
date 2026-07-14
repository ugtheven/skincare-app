import {
  hasProductCandidateImage,
  hasDecisiveCandidate,
  hasReliableCandidate,
  criticalProductVariantsMatch,
  isProductCandidateCompatible,
  isProductCandidateComplete,
  inferProductCategory,
  manualDraftFromRecognizedText,
  normalizeProductCategory,
  normalizeProductText,
  productLookupTextFromRecognizedText,
  selectProductCandidates,
  textLookupQuery,
  type ProductCandidate,
} from './product-recognition';

const candidates: ProductCandidate[] = [
  {
    id: 'cleanser',
    name: 'Foaming Facial Cleanser',
    brand: 'CeraVe',
    category: 'Nettoyant',
    imageUrl: null,
    score: 0,
    source: 'shared',
  },
  {
    id: 'cream',
    name: 'Moisturising Cream',
    brand: 'CeraVe',
    category: 'Hydratant',
    imageUrl: null,
    score: 0,
    source: 'shared',
  },
];

describe('product text recognition', () => {
  it('normalizes accents, punctuation, case and whitespace', () => {
    expect(normalizeProductText('  Crème—Hydratante  À L’EAU  ')).toBe(
      'creme hydratante a l eau',
    );
  });

  it('builds a compact lookup query without packaging noise', () => {
    expect(
      textLookupQuery('CeraVe\nSoin pour le visage\nFoaming Cleanser 236 ml'),
    ).toBe('cerave foaming cleanser');
    expect(
      textLookupQuery(
        '0501601 AROMA-ZONE Sérum cheveux Peptides extrait de Pois 50 ml',
      ),
    ).toBe('0501601 aroma zone serum cheveux peptides extrait pois');
  });

  it('maps provider categories onto the controlled product taxonomy', () => {
    expect(normalizeProductCategory('Hydratants')).toBe('Hydratant');
    expect(
      normalizeProductCategory('Face care', 'Foaming Facial Cleanser'),
    ).toBe('Nettoyant');
    expect(normalizeProductCategory('Sérum')).toBe('Sérum');
  });

  it('ranks matching products and detects a reliable first candidate', () => {
    const selected = selectProductCandidates(
      'CERAVE FOAMING FACIAL CLEANSER',
      candidates,
    );

    expect(selected.map((candidate) => candidate.id)).toEqual(['cleanser']);
    expect(hasReliableCandidate(selected)).toBe(true);
  });

  it('keeps the best candidates ordered when the OCR is ambiguous', () => {
    const selected = selectProductCandidates('CeraVe Foaming Cleanser', [
      candidates[0],
      {
        ...candidates[1],
        name: 'Foaming Cleanser Gel',
      },
    ]);

    expect(selected).toHaveLength(2);
    expect(selected[0].score).toBeGreaterThanOrEqual(selected[1].score);
  });

  it('does not lock a different product variant from the same brand', () => {
    const selected = selectProductCandidates('CeraVe Lait Hydratant', [
      {
        ...candidates[1],
        name: 'Crème Hydratante Visage',
        imageUrl: 'https://example.com/cream.webp',
      },
    ]);

    expect(selected).toEqual([]);
  });

  it('treats SPF levels and missing SPF as incompatible variants', () => {
    const query = 'CeraVe Crème Hydratante Visage AM SPF 30';
    const generic = { ...candidates[1], name: 'Crème Hydratante Visage' };
    const spf50 = {
      ...generic,
      id: 'spf50',
      name: 'Crème Hydratante Visage SPF50',
    };
    const spf30 = {
      ...generic,
      id: 'spf30',
      name: 'Crème Hydratante Visage SPF30',
    };

    expect(criticalProductVariantsMatch(query, generic.name)).toBe(false);
    expect(criticalProductVariantsMatch(query, spf50.name)).toBe(false);
    expect(criticalProductVariantsMatch(query, spf30.name)).toBe(true);
    expect(selectProductCandidates(query, [generic, spf50, spf30])).toEqual([
      expect.objectContaining({ id: 'spf30' }),
    ]);
  });

  it('requires a percentage when OCR read the percent sign', () => {
    expect(
      criticalProductVariantsMatch(
        'AROMA-ZONE Sérum Niacinamide 10%',
        'Sérum Niacinamide 5%',
      ),
    ).toBe(false);
    expect(
      criticalProductVariantsMatch(
        'AROMA-ZONE Sérum Niacinamide 10',
        'Sérum Niacinamide 10%',
      ),
    ).toBe(true);
  });

  it('keeps the distinctive actives of a hair serum and rejects generic brand matches', () => {
    const frontLabel = [
      'AROMA = ZONE',
      'Sérum cheveux',
      'Peptides & extrait de Pois',
      'Hair serum Peptides & Pea extract',
      'MADE IN FRANCE',
    ].join('\n');
    const lookupText = productLookupTextFromRecognizedText(frontLabel);
    const exact: ProductCandidate = {
      id: 'hair-serum',
      name: 'Sérum cheveux anti-chute Peptides & extrait de Pois',
      brand: 'AROMA-ZONE',
      category: 'Soin capillaire',
      imageUrl: 'https://example.com/hair-serum.webp',
      score: 0.72,
      source: 'shared',
    };
    const unrelated: ProductCandidate = {
      ...exact,
      id: 'face-serum',
      name: 'Sérum visage concentré Acide glycolique 10% & AHA',
      score: 0.95,
    };

    expect(lookupText).toBe(
      'AROMA-ZONE Sérum cheveux - Peptides & extrait de Pois',
    );
    expect(
      productLookupTextFromRecognizedText(
        [
          'AROMA = ZONE',
          'Peptides & extrait de Pois',
          'Sérum cheveux',
          'Hair serum Peptides & Pea extract',
          'MADE IN FRANCE',
        ].join('\n'),
      ),
    ).toBe('AROMA-ZONE Sérum cheveux - Peptides & extrait de Pois');
    expect(isProductCandidateCompatible(lookupText, exact)).toBe(true);
    expect(isProductCandidateCompatible(lookupText, unrelated)).toBe(false);
    expect(selectProductCandidates(lookupText, [unrelated, exact])).toEqual([
      expect.objectContaining({ id: 'hair-serum' }),
    ]);
  });

  it('decisively ranks the scanned hyaluronic serum above same-brand acids', () => {
    const frontLabel = [
      'AROMA - ZONE',
      'Sérum',
      'Acide Hyaluronique',
      '3,5%',
      'Hydratant & Anti-âge',
      'Concentrated serum',
      'Hyaluronic acid 3.5%',
      'Moisturizing & Anti-aging',
    ].join('\n');
    const lookupText = productLookupTextFromRecognizedText(frontLabel);
    const selected = selectProductCandidates(lookupText, [
      {
        id: 'glycolic',
        name: 'Sérum concentré Acide glycolique 10% & AHA',
        brand: 'AROMA-ZONE',
        category: 'Sérum',
        imageUrl: 'https://example.com/glycolic.webp',
        score: 0.92,
        source: 'shared',
      },
      {
        id: 'hyaluronic',
        name: 'Sérum Acide Hyaluronique naturel visage',
        brand: 'AROMA-ZONE',
        category: 'Sérum',
        imageUrl: 'https://example.com/hyaluronic.webp',
        score: 0.59,
        source: 'shared',
      },
    ]);

    expect(lookupText).toBe('AROMA-ZONE Sérum Acide Hyaluronique');
    expect(selected.map(({ id }) => id)).toEqual(['hyaluronic']);
    expect(hasDecisiveCandidate(selected)).toBe(true);
  });

  it('keeps asking when two candidates remain close', () => {
    expect(
      hasDecisiveCandidate([
        { ...candidates[0], score: 0.9 },
        { ...candidates[1], score: 0.8 },
      ]),
    ).toBe(false);
  });

  it('removes duplicate public catalogue variants', () => {
    const selected = selectProductCandidates('CeraVe Foaming Cleanser', [
      candidates[0],
      { ...candidates[0], id: 'same-product-other-barcode' },
    ]);

    expect(selected).toHaveLength(1);
  });

  it('requires sourced identity, image and ingredients before skipping enrichment', () => {
    expect(
      isProductCandidateComplete({
        ...candidates[0],
        imageUrl: 'https://example.com/product.webp',
        ingredientsText: 'Aqua, Glycerin, Ceramide NP',
        ingredientsSource: 'Fabricant',
      }),
    ).toBe(true);
    expect(isProductCandidateComplete(candidates[0])).toBe(false);
  });

  it('requires an image before an automatic candidate can be confirmed', () => {
    expect(hasProductCandidateImage(candidates[0])).toBe(false);
    expect(
      hasProductCandidateImage({
        ...candidates[0],
        imageUrl: 'https://example.com/product.webp',
      }),
    ).toBe(true);
  });

  it('prefills manual entry from the first useful OCR lines', () => {
    expect(
      manualDraftFromRecognizedText('CeraVe\nFoaming Facial Cleanser\n236 ml'),
    ).toMatchObject({
      brand: 'CeraVe',
      name: 'Foaming Facial Cleanser',
      category: 'Nettoyant',
    });
  });

  it('rebuilds a product name split over multiple packaging lines', () => {
    const text = [
      'AROMA = ZONE',
      'Sérum acide',
      'glycolique 10% & AHA',
      'Glycolic acid 10% & AHA serum',
      'MADE IN FRANCE',
      'Effet peeling & unifiant',
    ].join('\n');

    expect(manualDraftFromRecognizedText(text)).toMatchObject({
      brand: 'AROMA-ZONE',
      name: 'Sérum acide glycolique 10% & AHA',
      category: 'Exfoliant',
    });
    expect(productLookupTextFromRecognizedText(text)).toBe(
      'AROMA-ZONE Sérum acide glycolique 10% & AHA',
    );
  });

  it('does not append a packaging claim to an already complete name', () => {
    expect(
      manualDraftFromRecognizedText(
        'CeraVe\nFoaming Facial Cleanser\nFor normal to oily skin',
      ),
    ).toMatchObject({ name: 'Foaming Facial Cleanser' });
  });

  it('infers common skincare categories in French and English', () => {
    expect(inferProductCategory('Fluide invisible SPF 50+')).toBe(
      'Protection solaire',
    );
    expect(inferProductCategory('Hydrating face cream')).toBe('Hydratant');
    expect(inferProductCategory('Sérum anti-imperfections')).toBe('Sérum');
  });
});
