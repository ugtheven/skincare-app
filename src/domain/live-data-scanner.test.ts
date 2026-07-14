import {
  itemIdsForSelectedObservations,
  liveTextEvidence,
} from './live-data-scanner';

describe('live data scanner evidence', () => {
  const items = [
    {
      id: 'brand',
      kind: 'text' as const,
      value: ' AROMA = ZONE ',
      confidence: 0.97,
      x: 0.28,
      y: 0.62,
      width: 0.44,
      height: 0.06,
    },
    {
      id: 'name',
      kind: 'text' as const,
      value: 'Sérum acide glycolique 10% & AHA',
      confidence: 0.94,
      x: 0.2,
      y: 0.48,
      width: 0.6,
      height: 0.1,
    },
    {
      id: 'code',
      kind: 'barcode' as const,
      value: '3612623961421',
      type: 'ean13',
      x: 0.25,
      y: 0.2,
      width: 0.5,
      height: 0.08,
    },
  ];

  it('keeps positioned text and excludes machine-readable codes', () => {
    expect(liveTextEvidence(items)).toEqual({
      itemIds: ['brand', 'name'],
      lines: ['AROMA = ZONE', 'Sérum acide glycolique 10% & AHA'],
      observations: [
        {
          confidence: 0.97,
          height: 0.06,
          text: 'AROMA = ZONE',
          width: 0.44,
          x: 0.28,
          y: 0.62,
        },
        {
          confidence: 0.94,
          height: 0.1,
          text: 'Sérum acide glycolique 10% & AHA',
          width: 0.6,
          x: 0.2,
          y: 0.48,
        },
      ],
      text: 'AROMA = ZONE\nSérum acide glycolique 10% & AHA',
    });
  });

  it('maps selected observations back to their stable native ids', () => {
    const evidence = liveTextEvidence(items);
    expect(
      itemIdsForSelectedObservations(evidence, [evidence.observations[1]]),
    ).toEqual(['name']);
  });

  it('splits a multiline native text block into useful product lines', () => {
    const evidence = liveTextEvidence([
      {
        confidence: 0.96,
        height: 0.24,
        id: 'front-label',
        kind: 'text',
        value: 'AROMA-ZONE\nSérum acide glycolique 10% & AHA',
        width: 0.58,
        x: 0.21,
        y: 0.4,
      },
    ]);

    expect(evidence.lines).toEqual([
      'AROMA-ZONE',
      'Sérum acide glycolique 10% & AHA',
    ]);
    expect(evidence.itemIds).toEqual(['front-label', 'front-label']);
    expect(
      itemIdsForSelectedObservations(evidence, evidence.observations),
    ).toEqual(['front-label']);
  });
});
