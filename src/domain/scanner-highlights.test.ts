import {
  barcodeHighlightRect,
  identifierHighlightLines,
  recognizedTextHighlightLines,
  visionHighlightRect,
} from './scanner-highlights';

describe('scanner highlight geometry', () => {
  const viewport = { height: 844, width: 390 };

  it('builds a padded barcode box from preview-space corners', () => {
    expect(
      barcodeHighlightRect(
        {
          cornerPoints: [
            { x: 100, y: 220 },
            { x: 280, y: 218 },
            { x: 282, y: 310 },
            { x: 98, y: 312 },
          ],
        },
        viewport,
      ),
    ).toEqual({ height: 102, left: 94, top: 214, width: 192 });
  });

  it('falls back to barcode bounds when corners are unavailable', () => {
    expect(
      barcodeHighlightRect(
        {
          bounds: {
            origin: { x: 20, y: 40 },
            size: { height: 60, width: 120 },
          },
          cornerPoints: [],
        },
        viewport,
      ),
    ).toEqual({ height: 68, left: 16, top: 36, width: 128 });
  });

  it('projects bottom-left Vision coordinates through the camera aspect fill', () => {
    const rect = visionHighlightRect(
      { text: 'CeraVe', x: 0.4, y: 0.4, width: 0.2, height: 0.1 },
      { height: 1600, width: 1200 },
      viewport,
    );

    expect(rect?.left).toBeCloseTo(127.7, 1);
    expect(rect?.top).toBeCloseTo(418, 1);
    expect(rect?.width).toBeCloseTo(134.6, 1);
    expect(rect?.height).toBeCloseTo(92.4, 1);
  });

  it('aligns raw landscape photo dimensions with a portrait preview', () => {
    const observation = {
      text: 'AROMA-ZONE',
      x: 0.3,
      y: 0.55,
      width: 0.4,
      height: 0.08,
    };

    expect(
      visionHighlightRect(observation, { height: 3024, width: 4032 }, viewport),
    ).toEqual(
      visionHighlightRect(observation, { height: 4032, width: 3024 }, viewport),
    );
  });

  it('ignores missing or empty geometry', () => {
    expect(barcodeHighlightRect({}, viewport)).toBeNull();
    expect(
      visionHighlightRect(
        { text: 'CeraVe' },
        { height: 1600, width: 1200 },
        viewport,
      ),
    ).toBeNull();
  });
});

describe('scanner highlight evidence', () => {
  const observations = [
    {
      text: 'CeraVe',
      confidence: 0.98,
      x: 0.35,
      y: 0.7,
      width: 0.3,
      height: 0.08,
    },
    {
      text: 'Crème hydratante visage',
      confidence: 0.95,
      x: 0.2,
      y: 0.5,
      width: 0.6,
      height: 0.09,
    },
    {
      text: 'Pour peaux sèches',
      confidence: 0.92,
      x: 0.25,
      y: 0.35,
      width: 0.5,
      height: 0.06,
    },
    {
      text: 'Crème testée sur peaux sèches',
      confidence: 0.91,
      x: 0.2,
      y: 0.28,
      width: 0.6,
      height: 0.06,
    },
    {
      text: '50 ml',
      confidence: 0.99,
      x: 0.42,
      y: 0.2,
      width: 0.16,
      height: 0.04,
    },
  ];

  it('keeps only OCR lines represented in the selected identity', () => {
    expect(
      recognizedTextHighlightLines(
        'CeraVe Crème hydratante visage',
        observations,
      ).map(({ text }) => text),
    ).toEqual(['CeraVe', 'Crème hydratante visage']);
  });

  it('keeps a normalized brand line from the photographed product', () => {
    const aromaZone = [
      {
        text: 'AROMA = ZONE',
        confidence: 0.96,
        x: 0.28,
        y: 0.62,
        width: 0.44,
        height: 0.06,
      },
      {
        text: 'Sérum acide exfolique 10% & AHA',
        confidence: 0.93,
        x: 0.22,
        y: 0.48,
        width: 0.56,
        height: 0.1,
      },
    ];

    expect(
      recognizedTextHighlightLines(
        'AROMA-ZONE Sérum acide exfolique 10% & AHA',
        aromaZone,
      ).map(({ text }) => text),
    ).toEqual(['AROMA = ZONE', 'Sérum acide exfolique 10% & AHA']);
  });

  it('keeps only the OCR line containing the accepted printed identifier', () => {
    const withIdentifier = [
      ...observations,
      {
        text: '3 612623 961421',
        confidence: 0.97,
        x: 0.3,
        y: 0.1,
        width: 0.4,
        height: 0.05,
      },
    ];

    expect(
      identifierHighlightLines('3612623961421', withIdentifier).map(
        ({ text }) => text,
      ),
    ).toEqual(['3 612623 961421']);
  });
});
