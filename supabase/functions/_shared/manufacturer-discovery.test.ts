import {
  manufacturerSitemapUrls,
  rankManufacturerUrls,
} from './manufacturer-discovery';

it('tries the canonical www sitemap before the bare domain', () => {
  expect(manufacturerSitemapUrls('cerave.fr')).toEqual([
    'https://www.cerave.fr/sitemap.xml',
    'https://cerave.fr/sitemap.xml',
  ]);
});

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

it('keeps the SPF value when distinguishing face cream variants', () => {
  const ranked = rankManufacturerUrls(
    [
      'https://www.cerave.fr/nos-produits/hydratants/creme-hydratante-visage',
      'https://www.cerave.fr/nos-produits/hydratants/creme-hydratante-visage-spf50',
      'https://www.cerave.fr/nos-produits/hydratants/creme-hydratante-visage-spf30',
    ],
    'CeraVe Crème Hydratante Visage AM SPF 30 Protection UV',
  );

  expect(ranked[0]).toMatch(/creme-hydratante-visage-spf30$/);
});

it('prefers the unprotected PM cream over SPF variants', () => {
  const ranked = rankManufacturerUrls(
    [
      'https://www.cerave.fr/nos-produits/hydratants/creme-hydratante-visage-spf30',
      'https://www.cerave.fr/nos-produits/hydratants/creme-hydratante-visage',
      'https://www.cerave.fr/nos-produits/hydratants/creme-hydratante-visage-spf50',
    ],
    'CeraVe Crème Hydratante Visage PM',
  );

  expect(ranked[0]).toMatch(/creme-hydratante-visage$/);
});
