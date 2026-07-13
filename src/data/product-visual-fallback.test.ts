import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator } from 'expo-image-manipulator';

import { lookupProductsByVisualFallback } from './shared-product-api';
import {
  prepareVisualLookupImage,
  recognizeProductWithVisualFallback,
  visualLookupCrop,
} from './product-visual-fallback';

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { Base64: 'base64' },
  readAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg' },
}));
jest.mock('./shared-product-api', () => ({
  lookupProductsByVisualFallback: jest.fn(),
  VisualLookupError: class extends Error {
    code: string;

    constructor(errorCode: string) {
      super(errorCode);
      this.code = errorCode;
    }
  },
}));

const mockFileSystem = jest.mocked(FileSystem);
const mockManipulate = ImageManipulator.manipulate as jest.Mock;
const mockLookup = jest.mocked(lookupProductsByVisualFallback);

beforeEach(() => {
  jest.clearAllMocks();
  const sourceContext = {
    renderAsync: jest.fn().mockResolvedValue({ width: 2000, height: 3000 }),
  };
  const preparedContext = {
    crop: jest.fn(),
    resize: jest.fn(),
    renderAsync: jest.fn().mockResolvedValue({
      saveAsync: jest.fn().mockResolvedValue({ uri: 'file:///prepared.jpg' }),
    }),
  };
  mockManipulate
    .mockReturnValueOnce(sourceContext as never)
    .mockReturnValueOnce(preparedContext as never);
  mockFileSystem.readAsStringAsync.mockResolvedValue('encoded-image');
  mockFileSystem.deleteAsync.mockResolvedValue(undefined);
});

it('crops the camera frame centrally and caps the upload at 1024px', async () => {
  await prepareVisualLookupImage('file:///captured.jpg');

  const preparedContext = mockManipulate.mock.results[1].value;
  expect(preparedContext.crop).toHaveBeenCalledWith({
    originX: 0,
    originY: 500,
    width: 2000,
    height: 2000,
  });
  expect(preparedContext.resize).toHaveBeenCalledWith({
    width: 1024,
  });
});

it('uses Apple text bounds to zoom onto the product label', () => {
  expect(
    visualLookupCrop(2000, 3000, [
      {
        text: 'AROMA-ZONE',
        confidence: 0.95,
        x: 0.4,
        y: 0.25,
        width: 0.2,
        height: 0.4,
      },
    ]),
  ).toEqual({
    originX: 640,
    originY: 780,
    width: 720,
    height: 1740,
  });
});

it('always deletes the re-encoded upload after the server call', async () => {
  mockLookup.mockRejectedValue(new Error('offline'));

  await expect(
    recognizeProductWithVisualFallback('file:///captured.jpg', 'product text'),
  ).rejects.toThrow('offline');
  expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith(
    'file:///prepared.jpg',
    { idempotent: true },
  );
});

it('retries one transient visual lookup before surfacing an error', async () => {
  const result = {
    candidates: [],
    googleCandidateCount: 0,
    normalizedGoogleCandidateCount: 0,
    serpApiCandidateCount: 0,
    normalizedSerpApiCandidateCount: 0,
    serpApiStatus: 'not_configured' as const,
    catalogueCandidateCount: 0,
  };
  mockLookup
    .mockRejectedValueOnce(new Error('temporary relay failure'))
    .mockResolvedValueOnce(result);

  await expect(
    recognizeProductWithVisualFallback('file:///captured.jpg', 'product text'),
  ).resolves.toEqual(result);
  expect(mockLookup).toHaveBeenCalledTimes(2);
});

it('forwards an internal manufacturer code separately from OCR text', async () => {
  const result = {
    candidates: [],
    googleCandidateCount: 0,
    normalizedGoogleCandidateCount: 0,
    serpApiCandidateCount: 0,
    normalizedSerpApiCandidateCount: 0,
    serpApiStatus: 'no_match' as const,
    catalogueCandidateCount: 0,
  };
  mockLookup.mockResolvedValue(result);

  await recognizeProductWithVisualFallback(
    'file:///captured.jpg',
    'AROMA-ZONE Sérum cheveux Peptides extrait de Pois',
    [],
    '0501601',
  );

  expect(mockLookup).toHaveBeenCalledWith({
    identifier: '0501601',
    imageBase64: 'encoded-image',
    mimeType: 'image/jpeg',
    recognizedText: 'AROMA-ZONE Sérum cheveux Peptides extrait de Pois',
  });
});
