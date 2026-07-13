import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  manualDraftFromRecognizedText,
  normalizeProductText,
} from './product-recognition';

type ExpectedCase = {
  id: string;
  photos: string[];
  brand: string;
  name: string;
  ocrExpectedName?: string;
  category: string;
};

type RecognitionResult = {
  path: string;
  lines: {
    text: string;
    confidence: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
};

const localDirectory = resolve('.local/product-recognition');
const expectedPath = resolve(localDirectory, 'expected.json');
const recognizedPath = resolve(localDirectory, 'recognized-structured.json');
const hasLocalCorpus = existsSync(expectedPath) && existsSync(recognizedPath);

describe('local real-photo recognition corpus', () => {
  (hasLocalCorpus ? it : it.skip)(
    'reconstructs every labelled front photo',
    () => {
      const expected = JSON.parse(
        readFileSync(expectedPath, 'utf8'),
      ) as ExpectedCase[];
      const recognized = JSON.parse(
        readFileSync(recognizedPath, 'utf8'),
      ) as RecognitionResult[];

      for (const product of expected) {
        const result = recognized.find(
          ({ path }) => path === product.photos[0],
        );
        expect(result).toBeDefined();
        const lines = result?.lines ?? [];
        const draft = manualDraftFromRecognizedText(
          lines.map(({ text }) => text).join('\n'),
          lines,
        );
        expect(draft).toMatchObject({
          brand: product.brand,
          category: product.category,
        });
        expect(normalizeProductText(draft.name)).toBe(
          normalizeProductText(product.ocrExpectedName ?? product.name),
        );
      }
    },
  );
});
