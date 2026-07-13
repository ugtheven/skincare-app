import {
  extractIngredientListFromDocument,
  extractProductPageData,
  parseIngredientList,
} from './product-ingredients';

it('parses a manufacturer JSON-LD ingredient property', () => {
  const document = `<script type="application/ld+json">{
    "additionalProperty": [{
      "name": "Ingredients",
      "value": "Description. INGREDIENTS: AQUA / WATER, GLYCERIN, CERAMIDE NP (F.I.L. 123). Please note that formulas change."
    }]
  }</script>`;
  const value = extractIngredientListFromDocument(document);
  expect(value).toBe('AQUA / WATER, GLYCERIN, CERAMIDE NP');
});

it('prefers the bounded JSON-LD formula over the rest of the page', () => {
  const noise = Array.from(
    { length: 120 },
    (_, index) => `Marketing claim ${index}`,
  ).join(', ');
  const document = `<script type="application/ld+json">{
    "name": "Ingredients",
    "value": "INGREDIENTS: AQUA, GLYCERIN, CERAMIDE NP"
  }</script><main>INGREDIENTS: ${noise}</main>`;
  const value = extractIngredientListFromDocument(document);
  expect(value).toBe('AQUA, GLYCERIN, CERAMIDE NP');
});

it('extracts official page metadata', () => {
  const data = extractProductPageData(
    '<meta property="og:title" content="Lait Hydratant | CeraVe"><meta property="og:image" content="/packshot.webp">',
    'https://www.cerave.fr/nos-produits/lait-hydratant',
  );
  expect(data).toMatchObject({
    imageUrl: 'https://www.cerave.fr/packshot.webp',
    title: 'Lait Hydratant | CeraVe',
  });
});

it('keeps formula order and parentheses', () => {
  const parsed = parseIngredientList(
    'Aqua, Botanical Extract (Leaf, Root), Glycerin',
  );
  expect(parsed).toHaveLength(3);
  expect(parsed[1].name).toBe('Botanical Extract (Leaf, Root)');
});
