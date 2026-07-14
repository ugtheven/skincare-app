import type { RecognizedProductTextLine } from './product-recognition';

export type LiveDataScannerItem = {
  confidence?: number;
  height: number;
  id: string;
  kind: 'barcode' | 'text';
  type?: string;
  value: string;
  width: number;
  x: number;
  y: number;
};

export type LiveTextEvidence = {
  itemIds: string[];
  lines: string[];
  observations: RecognizedProductTextLine[];
  text: string;
};

export function liveTextEvidence(
  items: LiveDataScannerItem[],
): LiveTextEvidence {
  const textLines = items.flatMap((item) =>
    item.kind === 'text'
      ? item.value
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter(Boolean)
          .map((value) => ({ item, value }))
      : [],
  );
  const lines = textLines.map(({ value }) => value);
  const observations = textLines.map(
    ({ item: { confidence, height, width, x, y }, value }) => ({
      confidence,
      height,
      text: value,
      width,
      x,
      y,
    }),
  );

  return {
    itemIds: textLines.map(({ item }) => item.id),
    lines,
    observations,
    text: lines.join('\n'),
  };
}

export function itemIdsForSelectedObservations(
  evidence: LiveTextEvidence,
  selected: RecognizedProductTextLine[],
): string[] {
  const selectedObservations = new Set(selected);
  return [
    ...new Set(
      evidence.itemIds.filter((_, index) =>
        selectedObservations.has(evidence.observations[index]),
      ),
    ),
  ];
}
