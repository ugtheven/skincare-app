import {
  manualDraftFromRecognizedText,
  normalizeProductText,
  type RecognizedProductTextLine,
} from './product-recognition';

function line(
  text: string,
  options: Partial<RecognizedProductTextLine> = {},
): RecognizedProductTextLine {
  return {
    text,
    confidence: 1,
    x: 0.38,
    y: 0.5,
    width: 0.24,
    height: 0.02,
    ...options,
  };
}

const corpus: {
  id: string;
  lines: RecognizedProductTextLine[];
  expected: { brand: string; name: string; category: string };
}[] = [
  {
    id: 'cerave-pm-face-moisturizer',
    lines: [
      line('CeraVe', { height: 0.05 }),
      line('DEVELOPED WITH DERMATOLOGISTS'),
      line('Feuchtigkeits-'),
      line('spendende'),
      line('Gesichtscreme'),
      line('PARFUMFREI UND NICHT KOMEDOGEN'),
      line('Crème'),
      line('PM'),
      line('Hydratante'),
      line('Visage'),
      line('Peaux Normales à Sèches'),
    ],
    expected: {
      brand: 'CeraVe',
      name: 'Crème Hydratante Visage PM',
      category: 'Hydratant',
    },
  },
  {
    id: 'aroma-zone-hair-serum-peptides-pea',
    lines: [
      line('AROMA = ZONE'),
      line('Peptides & extrait de Pois'),
      line('Sérum cheveux'),
      line('Hair serum Peptides & Pea extract'),
      line('MADE IN FRANCE'),
    ],
    expected: {
      brand: 'AROMA-ZONE',
      name: 'Sérum cheveux - Peptides & extrait de Pois',
      category: 'Soin capillaire',
    },
  },
  {
    id: 'aroma-zone-eye-contour-cream',
    lines: [
      line('SEBRUITE', { confidence: 0.3, x: 0.1, width: 0.07 }),
      line('AROMA = ZONE'),
      line('Crème'),
      line('Théine'),
      line('Contour des yeux'),
      line('& Acide Hyaluronique'),
      line('Eye contour'),
    ],
    expected: {
      brand: 'AROMA-ZONE',
      name: 'Crème Contour des yeux',
      category: 'Soin contour des yeux',
    },
  },
  {
    id: 'schwarzkopf-taft-matt-clay-paste',
    lines: [
      line('ERBRUIS', { confidence: 0.3 }),
      line('Schwarzkopf'),
      line('taft', { height: 0.04 }),
      line('MATIFIANTE'),
      line('PÂTE ARGILEUSE'),
      line('FIXATION'),
    ],
    expected: {
      brand: 'Schwarzkopf',
      name: 'PÂTE ARGILEUSE MATIFIANTE',
      category: 'Coiffant',
    },
  },
  {
    id: 'eucerin-urea-repair-10-body-lotion',
    lines: [
      line('AUTENTIC', { x: 0, width: 0.08, height: 0.05 }),
      line('BEAUTY', { x: 0.02, width: 0.09, height: 0.04 }),
      line('CONCEPT', { x: 0.03, width: 0.12, height: 0.04 }),
      line('Eucerin', { height: 0.04 }),
      line('Urea Repair', { height: 0.03 }),
      line('PIEL MUY SECA Y ÁSPERA'),
      line('INTENSIVA 10% UREA'),
      line('LOCIÓN HIDRATANTE'),
    ],
    expected: {
      brand: 'Eucerin',
      name: 'LOCIÓN HIDRATANTE INTENSIVA 10% UREA',
      category: 'Hydratant',
    },
  },
  {
    id: 'cerave-am-face-moisturizer-spf30',
    lines: [
      line('Sérum', { x: 0.2, y: 0.82 }),
      line('Cerave', { height: 0.05 }),
      line('DEVELOPED WITH DERMATOLOGISTS'),
      line('Feuchtigkeits-'),
      line('spendende'),
      line('Gesichtscreme'),
      line('PARFÜMFREI UND NICHT KOMEDOGEN'),
      line('AM SPF 30'),
      line('UVB + UVA'),
      line('Crème'),
      line('Visage'),
      line('Hydratante'),
      line('Protection UV'),
    ],
    expected: {
      brand: 'CeraVe',
      name: 'Crème Hydratante Visage AM SPF 30',
      category: 'Protection solaire',
    },
  },
  {
    id: 'cerave-moisturizing-lotion',
    lines: [
      line('CeraVe', { height: 0.07 }),
      line('DEVELOPED WITH DERMATOLOGISTS'),
      line('Moisturising'),
      line('Lotion'),
      line('For Dry to Very Dry Skin'),
      line('Lait'),
      line('Hydratant'),
      line('Peaux Sèches à Très Sèches'),
    ],
    expected: {
      brand: 'CeraVe',
      name: 'Lait Hydratant',
      category: 'Hydratant',
    },
  },
  {
    id: 'aroma-zone-niacinamide-copper-zinc-serum',
    lines: [
      line('AROMA = ZONE'),
      line('Niacinamide 10%'),
      line('Sérum'),
      line('Cuivre & Zinc'),
      line('Anti-imperfections & Régulateur'),
    ],
    expected: {
      brand: 'AROMA-ZONE',
      name: 'Sérum Niacinamide 10% Cuivre & Zinc',
      category: 'Sérum',
    },
  },
];

describe('real packaging OCR regression corpus', () => {
  it('normalizes accented multilingual product types', () => {
    expect(normalizeProductText('LOCIÓN HIDRATANTE')).toBe('locion hidratante');
    expect(
      manualDraftFromRecognizedText('Eucerin\nLOCIÓN HIDRATANTE'),
    ).toMatchObject({ brand: 'Eucerin', name: 'LOCIÓN HIDRATANTE' });
  });

  it.each(corpus)('$id', ({ lines, expected }) => {
    const text = lines.map(({ text }) => text).join('\n');
    expect(manualDraftFromRecognizedText(text, lines)).toMatchObject(expected);
  });

  it('does not promote a generic product type to brand', () => {
    expect(
      manualDraftFromRecognizedText('Sérum\nAcide glycolique'),
    ).toMatchObject({
      brand: '',
      name: 'Sérum Acide glycolique',
    });
  });

  it('recovers CeraVe from a manufacturer URL on the back label', () => {
    expect(
      manualDraftFromRecognizedText(
        'Crème hydratante visage SPF 30\nMade in France www.cerave.com',
      ),
    ).toMatchObject({ brand: 'CeraVe' });
  });
});
