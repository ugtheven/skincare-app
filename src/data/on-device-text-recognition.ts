import textRecognitionModule from '../../modules/skincare-text-recognition';
import type { RecognizedProductTextLine } from '@/domain/product-recognition';

export type RecognizedPackagingText = {
  lines: string[];
  observations?: RecognizedProductTextLine[];
  text: string;
};

export function isOnDeviceTextRecognitionAvailable(): boolean {
  return textRecognitionModule !== null;
}

export async function recognizePackagingText(
  imageUri: string,
): Promise<RecognizedPackagingText> {
  if (!textRecognitionModule) throw new Error('ocr_unavailable');

  const rawLines = await textRecognitionModule.recognizeText(imageUri);
  const observations = rawLines
    .map((line) => (typeof line === 'string' ? { text: line } : line))
    .map((line) => ({ ...line, text: line.text.trim() }))
    .filter((line) => Boolean(line.text));
  const lines = observations.map((line) => line.text);

  return { lines, observations, text: lines.join('\n') };
}
