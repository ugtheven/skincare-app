import type { RecognizedPackagingText } from './on-device-text-recognition';

import type { Product, ProductDraft } from '@/domain/product';
import { isValidGtin } from '@/domain/product-auto-capture';
import {
  manualDraftFromRecognizedText,
  productLookupTextFromRecognizedText,
  selectProductCandidates,
  type ProductCandidate,
} from '@/domain/product-recognition';

export type PhotoRecognitionDependencies = {
  recognizeText: (imageUri: string) => Promise<RecognizedPackagingText>;
  searchLocal: (lookupText: string) => Promise<ProductCandidate[]>;
  searchShared: (lookupText: string) => Promise<ProductCandidate[] | undefined>;
  searchPublic: (lookupText: string) => Promise<ProductCandidate[]>;
};

export type PhotoRecognitionOutcome =
  | {
      kind: 'candidates';
      candidates: ProductCandidate[];
      recognizedText: string;
    }
  | {
      kind: 'fallback_required';
      candidates: ProductCandidate[];
      draft: ProductDraft;
      reason:
        | 'no_text'
        | 'not_found'
        | 'lookup_unavailable'
        | 'recognition_failed'
        | 'low_confidence';
      recognizedText: string;
    }
  | {
      kind: 'draft';
      draft: ProductDraft;
      reason:
        'no_text' | 'not_found' | 'lookup_unavailable' | 'recognition_failed';
      recognizedText: string;
    };

export async function recognizeProductPhoto(
  imageUri: string,
  dependencies: PhotoRecognitionDependencies,
): Promise<PhotoRecognitionOutcome> {
  let recognized: RecognizedPackagingText;
  try {
    recognized = await dependencies.recognizeText(imageUri);
  } catch {
    return {
      kind: 'fallback_required',
      candidates: [],
      draft: manualDraftFromRecognizedText(''),
      reason: 'recognition_failed',
      recognizedText: '',
    };
  }

  const draft = manualDraftFromRecognizedText(
    recognized.text,
    recognized.observations ?? recognized.lines,
  );
  if (!recognized.text.trim()) {
    return {
      kind: 'fallback_required',
      candidates: [],
      draft,
      reason: 'no_text',
      recognizedText: recognized.text,
    };
  }

  const lookupText = productLookupTextFromRecognizedText(
    recognized.text,
    recognized.observations ?? recognized.lines,
  );
  const localLookup = await Promise.allSettled([
    dependencies.searchLocal(lookupText),
  ]);
  const localCandidates =
    localLookup[0].status === 'fulfilled' ? localLookup[0].value : [];
  const rankedLocal = selectProductCandidates(lookupText, localCandidates);

  const [sharedLookup, publicLookup] = await Promise.allSettled([
    dependencies.searchShared(lookupText),
    dependencies.searchPublic(lookupText),
  ]);
  const sharedCandidates =
    sharedLookup.status === 'fulfilled' ? sharedLookup.value : undefined;
  const publicCandidates =
    publicLookup.status === 'fulfilled' ? publicLookup.value : [];
  const ranked = selectProductCandidates(lookupText, [
    ...rankedLocal,
    ...(sharedCandidates ?? []),
    ...publicCandidates,
  ]);
  const remoteUnavailable = publicLookup.status === 'rejected';
  return {
    kind: 'fallback_required',
    candidates: ranked,
    draft,
    reason: remoteUnavailable
      ? 'lookup_unavailable'
      : ranked.length
        ? 'low_confidence'
        : 'not_found',
    recognizedText: recognized.text,
  };
}

export type BarcodeRecognitionDependencies = {
  findLocal: (barcode: string) => Promise<Product | null>;
  lookupShared: (barcode: string) => Promise<ProductDraft | null | undefined>;
  lookupPublic: (barcode: string) => Promise<ProductDraft | null>;
};

export type BarcodeRecognitionOutcome =
  | { kind: 'local'; product: Product }
  | { kind: 'draft'; draft: ProductDraft }
  | { kind: 'not_found' }
  | { kind: 'lookup_unavailable' };

export async function recognizeProductBarcode(
  barcode: string,
  dependencies: BarcodeRecognitionDependencies,
): Promise<BarcodeRecognitionOutcome> {
  try {
    const localProduct = await dependencies.findLocal(barcode);
    if (localProduct) return { kind: 'local', product: localProduct };
  } catch {
    // A damaged local cache must not prevent remote recognition.
  }

  try {
    const sharedProduct = await dependencies.lookupShared(barcode);
    if (sharedProduct) return { kind: 'draft', draft: sharedProduct };
    if (sharedProduct === null) return { kind: 'not_found' };
  } catch {
    // The universal public lookup remains available as a fallback.
  }

  if (!isValidGtin(barcode)) return { kind: 'lookup_unavailable' };

  try {
    const publicProduct = await dependencies.lookupPublic(barcode);
    return publicProduct
      ? { kind: 'draft', draft: publicProduct }
      : { kind: 'not_found' };
  } catch {
    return { kind: 'lookup_unavailable' };
  }
}
