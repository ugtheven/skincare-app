export const productCategories = [
  'Nettoyant',
  'Démaquillant',
  'Tonique',
  'Exfoliant',
  'Sérum',
  'Soin ciblé',
  'Hydratant',
  'Soin contour des yeux',
  'Protection solaire',
  'Masque',
  'Soin des lèvres',
  'Soin du corps',
  'Soin capillaire',
  'Coiffant',
  'Autre',
] as const;

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const rules: [string, string[]][] = [
  ['Soin capillaire', ['hair serum', 'cuir chevelu', 'hair loss']],
  ['Coiffant', ['styling', 'coiffant', 'pate argileuse']],
  ['Protection solaire', ['sunscreen', 'sun screen', 'solaire', 'spf']],
  ['Soin contour des yeux', ['contour des yeux', 'eye cream', 'eye serum']],
  ['Démaquillant', ['demaquillant', 'makeup remover', 'micellaire']],
  ['Nettoyant', ['cleanser', 'cleansing', 'face wash', 'nettoyant']],
  ['Exfoliant', ['exfoliant', 'peeling', 'scrub', 'gommage']],
  ['Masque', ['masque', 'mask']],
  ['Tonique', ['toner', 'tonique', 'essence']],
  ['Sérum', ['serum']],
  ['Soin ciblé', ['anti imperfections', 'blemish', 'spot treatment']],
  [
    'Hydratant',
    [
      'hydratant',
      'hydrating',
      'moisturizer',
      'moisturiser',
      'moisturizing',
      'moisturising',
      'lotion',
      'face cream',
      'urea repair',
    ],
  ],
];

export function controlledProductCategory(value: string | null, name = '') {
  const normalizedValue = normalize(value ?? '');
  const exact = productCategories.find(
    (category) => normalize(category) === normalizedValue,
  );
  if (exact) return exact;
  const aliases: Record<string, string> = {
    cleansers: 'Nettoyant',
    hydratants: 'Hydratant',
    moisturizers: 'Hydratant',
    moisturisers: 'Hydratant',
    serums: 'Sérum',
    sunscreens: 'Protection solaire',
  };
  if (aliases[normalizedValue]) return aliases[normalizedValue];
  const combined = normalize(`${value ?? ''} ${name}`);
  return (
    rules.find(([, terms]) =>
      terms.some((term) => combined.includes(term)),
    )?.[0] ?? 'Autre'
  );
}
