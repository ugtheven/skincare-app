import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { type RecognizedProductTextLine } from '@/domain/product-recognition';

import {
  lookupProductsByVisualFallback,
  VisualLookupError,
  type VisualLookupResult,
} from './shared-product-api';

const MAX_IMAGE_EDGE = 1024;

type PixelCrop = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

function boundedOrigin(center: number, size: number) {
  return Math.max(0, Math.min(1 - size, center - size / 2));
}

export function visualLookupCrop(
  imageWidth: number,
  imageHeight: number,
  observations: RecognizedProductTextLine[] = [],
): PixelCrop {
  const positioned = observations.filter(
    ({ confidence = 1, x, y, width, height }) =>
      confidence >= 0.4 &&
      [x, y, width, height].every(
        (value) => typeof value === 'number' && Number.isFinite(value),
      ) &&
      (width ?? 0) > 0 &&
      (height ?? 0) > 0 &&
      (x ?? 0) + (width ?? 0) / 2 >= 0.1 &&
      (x ?? 0) + (width ?? 0) / 2 <= 0.9,
  );

  if (!positioned.length) {
    const cropSize = Math.min(imageWidth, imageHeight);
    return {
      originX: Math.max(0, Math.round((imageWidth - cropSize) / 2)),
      originY: Math.max(0, Math.round((imageHeight - cropSize) / 2)),
      width: cropSize,
      height: cropSize,
    };
  }

  const minX = Math.min(...positioned.map(({ x = 0 }) => x));
  const maxX = Math.max(...positioned.map(({ x = 0, width = 0 }) => x + width));
  const top = Math.min(
    ...positioned.map(({ y = 0, height = 0 }) => 1 - y - height),
  );
  const bottom = Math.max(...positioned.map(({ y = 0 }) => 1 - y));
  const width = Math.min(1, Math.max(0.34, (maxX - minX) * 1.8));
  const height = Math.min(1, Math.max(0.56, (bottom - top) * 1.45));
  const originX = boundedOrigin((minX + maxX) / 2, width);
  const originY = boundedOrigin((top + bottom) / 2, height);

  return {
    originX: Math.round(originX * imageWidth),
    originY: Math.round(originY * imageHeight),
    width: Math.max(1, Math.round(width * imageWidth)),
    height: Math.max(1, Math.round(height * imageHeight)),
  };
}

export type PreparedVisualLookupImage = {
  base64: string;
  mimeType: 'image/jpeg';
  temporaryUri: string;
};

export async function prepareVisualLookupImage(
  imageUri: string,
  observations: RecognizedProductTextLine[] = [],
): Promise<PreparedVisualLookupImage> {
  const source = ImageManipulator.manipulate(imageUri);
  const sourceImage = await source.renderAsync();
  const crop = visualLookupCrop(
    sourceImage.width,
    sourceImage.height,
    observations,
  );
  const longestEdge = Math.max(crop.width, crop.height);
  const targetSize = Math.min(longestEdge, MAX_IMAGE_EDGE);
  const context = ImageManipulator.manipulate(imageUri);
  context.crop(crop);
  context.resize(
    crop.width >= crop.height ? { width: targetSize } : { height: targetSize },
  );
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    compress: 0.78,
    format: SaveFormat.JPEG,
  });
  const base64 = await FileSystem.readAsStringAsync(saved.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return { base64, mimeType: 'image/jpeg', temporaryUri: saved.uri };
}

export async function recognizeProductWithVisualFallback(
  imageUri: string,
  recognizedText: string,
  observations: RecognizedProductTextLine[] = [],
  identifier?: string,
): Promise<VisualLookupResult> {
  const prepared = await prepareVisualLookupImage(imageUri, observations);
  try {
    const input = {
      imageBase64: prepared.base64,
      mimeType: prepared.mimeType,
      recognizedText: recognizedText.trim().slice(0, 3000),
      ...(identifier ? { identifier } : {}),
    } as const;
    try {
      return await lookupProductsByVisualFallback(input);
    } catch (error) {
      const nonRetryable =
        error instanceof VisualLookupError &&
        [
          'disabled',
          'invalid_image',
          'quota_not_configured',
          'quota_reached',
        ].includes(error.code);
      if (nonRetryable) throw error;
      return await lookupProductsByVisualFallback(input);
    }
  } finally {
    await FileSystem.deleteAsync(prepared.temporaryUri, { idempotent: true });
  }
}
