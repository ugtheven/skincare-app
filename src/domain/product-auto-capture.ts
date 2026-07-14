import {
  normalizeProductText,
  productTextTokens,
  type RecognizedProductTextLine,
} from './product-recognition';

export type AutoCaptureLockStage = 0 | 1 | 2 | 3;
export type BarcodeGuidanceStage = 'seek' | 'rotate' | 'fallback';

export type AutoCaptureLock = {
  identity: string;
  stage: AutoCaptureLockStage;
};

export type AutoCaptureIdentifierLock = {
  observations: number;
  value: string;
};

export const emptyAutoCaptureLock: AutoCaptureLock = {
  identity: '',
  stage: 0,
};

export const emptyAutoCaptureIdentifierLock: AutoCaptureIdentifierLock = {
  observations: 0,
  value: '',
};

export function barcodeGuidanceStage(
  failedProbeAttempts: number,
): BarcodeGuidanceStage {
  if (failedProbeAttempts >= 5) return 'fallback';
  if (failedProbeAttempts >= 2) return 'rotate';
  return 'seek';
}

export function isValidGtin(value: string): boolean {
  if (![8, 12, 13, 14].includes(value.length) || !/^\d+$/.test(value)) {
    return false;
  }

  const digits = [...value].map(Number);
  const checkDigit = digits.pop();
  const sum = digits
    .reverse()
    .reduce(
      (total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1),
      0,
    );

  return (10 - (sum % 10)) % 10 === checkDigit;
}

export function extractValidGtin(recognizedText: string): string | null {
  const candidates = recognizedText
    .split(/\r?\n/)
    .flatMap((line) => line.match(/\d[\d\t .-]{6,24}\d/g) ?? []);

  for (const candidate of candidates) {
    const compact = candidate.replace(/\D/g, '');
    if (isValidGtin(compact)) return compact;
  }

  return null;
}

export function extractStrongPrintedGtin(
  observations: RecognizedProductTextLine[],
): string | null {
  for (const observation of observations) {
    const identifier = extractValidGtin(observation.text);
    if (!identifier || (observation.confidence ?? 0) < 0.8) continue;

    if (observation.x === undefined || observation.width === undefined) {
      continue;
    }
    const center = observation.x + observation.width / 2;
    if (center >= 0.2 && center <= 0.8) return identifier;
  }

  return null;
}

export function advanceAutoCaptureIdentifierLock(
  current: AutoCaptureIdentifierLock,
  recognizedValue: string | null,
): AutoCaptureIdentifierLock {
  if (!recognizedValue) return emptyAutoCaptureIdentifierLock;
  if (recognizedValue !== current.value) {
    return { observations: 1, value: recognizedValue };
  }

  return {
    observations: Math.min(2, current.observations + 1),
    value: recognizedValue,
  };
}

export function advanceAutoCaptureLock(
  current: AutoCaptureLock,
  recognizedIdentity: string,
): AutoCaptureLock {
  const identity = normalizeProductText(recognizedIdentity);
  const identityTokens = productTextTokens(identity);
  if (identityTokens.length < 2) return emptyAutoCaptureLock;

  const previousTokens = productTextTokens(current.identity);
  const sharedTokenCount = identityTokens.filter((token) =>
    previousTokens.includes(token),
  ).length;
  const sameProductSignal =
    identity === current.identity ||
    (sharedTokenCount >= 2 &&
      sharedTokenCount /
        Math.min(identityTokens.length, previousTokens.length) >=
        0.66);

  if (!sameProductSignal) return { identity, stage: 1 };

  return {
    identity,
    stage: Math.min(3, current.stage + 1) as AutoCaptureLockStage,
  };
}
