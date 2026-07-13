import { rankManufacturerUrls } from './manufacturer-discovery';

it('ranks the exact manufacturer product route', () => {
  const ranked = rankManufacturerUrls(
    [
      'https://www.cerave.fr/nos-produits/hydratants',
      'https://www.cerave.fr/nos-produits/hydratants/lait-hydratant-intensif',
      'https://www.cerave.fr/nos-produits/hydratants/lait-hydratant',
    ],
    'CeraVe Daily Moisturizing Lotion',
  );
  expect(ranked[0]).toMatch(/\/lait-hydratant$/);
});
