import {
  extractIngredientListFromPackagingText,
  parseIngredientList,
} from './product-ingredients';

describe('extractIngredientListFromPackagingText', () => {
  it('isolates the INCI block from a multilingual CeraVe label', () => {
    const lines = [
      'Directions: Apply liberally as often as needed. Suitable for adults and children.',
      'NON-COMEDOGENIC | FRAGRANCE FREE | HYPOALLERGENIC',
      '2021502 3 - INGREDIENTS: AQUA/WATER, GLYCERIN, CAPRYLIC/CAPRIC',
      'TRIGLYCERIDE, CETEARYL ALCOHOL, CETYL ALCOHOL, DIMETHICONE,',
      'PHENOXYETHANOL, POLYSORBATE 20, CETEARETH-20,',
      'BEHENTRIMONIUM METHOSULFATE, POLYGLYCERYL-3 DIISOSTEARATE,',
      'SODIUM LAUROYL LACTYLATE, ETHYLHEXYLGLYCERIN, POTASSIUM',
      'PHOSPHATE, DISODIUM EDTA, DIPOTASSIUM PHOSPHATE, CERAMIDE',
      'NP, CERAMIDE AP, PHYTOSPHINGOSINE, CHOLESTEROL, XANTHAN',
      'GUM, CARBOMER, SODIUM HYALURONATE, TOCOPHEROL, CERAMIDE',
      'EOP. (Code F.I.L. D213778/1)',
      '236 ml',
      'CeraVe LLC, New York, NY 10001',
    ];

    expect(
      extractIngredientListFromPackagingText({ lines, text: lines.join('\n') }),
    ).toBe(
      'AQUA/WATER, GLYCERIN, CAPRYLIC/CAPRIC TRIGLYCERIDE, CETEARYL ALCOHOL, CETYL ALCOHOL, DIMETHICONE, PHENOXYETHANOL, POLYSORBATE 20, CETEARETH-20, BEHENTRIMONIUM METHOSULFATE, POLYGLYCERYL-3 DIISOSTEARATE, SODIUM LAUROYL LACTYLATE, ETHYLHEXYLGLYCERIN, POTASSIUM PHOSPHATE, DISODIUM EDTA, DIPOTASSIUM PHOSPHATE, CERAMIDE NP, CERAMIDE AP, PHYTOSPHINGOSINE, CHOLESTEROL, XANTHAN GUM, CARBOMER, SODIUM HYALURONATE, TOCOPHEROL, CERAMIDE EOP.',
    );
  });

  it('fails closed when the photo contains directions but no INCI list', () => {
    const lines = [
      'Fugtgivende Lotion til tør til meget tør hud.',
      'Anvendelse: Påføres i rigelige mængder så ofte som nødvendigt.',
      'NON-COMEDOGENIC | FRAGRANCE FREE | HYPOALLERGENIC',
    ];

    expect(
      extractIngredientListFromPackagingText({ lines, text: lines.join('\n') }),
    ).toBe('');
  });

  it('uses a comma-dense INCI block when the heading was not recognized', () => {
    const lines = [
      'AQUA, GLYCERIN, NIACINAMIDE, PANTHENOL,',
      'SODIUM HYALURONATE, CARBOMER, PHENOXYETHANOL',
      'Made in France',
    ];

    expect(
      extractIngredientListFromPackagingText({ lines, text: lines.join('\n') }),
    ).toBe(
      'AQUA, GLYCERIN, NIACINAMIDE, PANTHENOL, SODIUM HYALURONATE, CARBOMER, PHENOXYETHANOL',
    );
  });
});

describe('parseIngredientList', () => {
  it('creates ordered normalized ingredients', () => {
    expect(
      parseIngredientList(
        'INGREDIENTS: Aqua/Water, Glycerin, Parfum (Fragrance), Glycerin',
      ),
    ).toEqual([
      { name: 'Aqua/Water', normalizedName: 'aqua water', position: 0 },
      { name: 'Glycerin', normalizedName: 'glycerin', position: 1 },
      {
        name: 'Parfum (Fragrance)',
        normalizedName: 'parfum fragrance',
        position: 2,
      },
    ]);
  });

  it('does not split punctuation inside parentheses', () => {
    expect(
      parseIngredientList(
        'Aqua, Botanical Extract (Leaf, Root), Sodium Hyaluronate',
      ).map(({ name }) => name),
    ).toEqual(['Aqua', 'Botanical Extract (Leaf, Root)', 'Sodium Hyaluronate']);
  });
});
