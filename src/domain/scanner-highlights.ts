import {
  normalizeProductText,
  productTextTokens,
  type RecognizedProductTextLine,
} from './product-recognition';

export type ScannerSize = {
  height: number;
  width: number;
};

export type ScannerPoint = {
  x: number;
  y: number;
};

export type ScannerRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export type BarcodeHighlightGeometry = {
  bounds?: {
    origin: ScannerPoint;
    size: ScannerSize;
  };
  cornerPoints?: ScannerPoint[];
};

const HIGHLIGHT_PADDING = 4;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isUsableSize(size: ScannerSize): boolean {
  return size.width > 0 && size.height > 0;
}

function imageSizeInViewportOrientation(
  image: ScannerSize,
  viewport: ScannerSize,
): ScannerSize {
  const imageIsPortrait = image.height >= image.width;
  const viewportIsPortrait = viewport.height >= viewport.width;

  // Expo can expose the JPEG's raw pixel dimensions while Vision returns
  // normalized boxes after applying its orientation metadata. Align both
  // coordinate spaces before reproducing the camera preview's aspect fill.
  return imageIsPortrait === viewportIsPortrait
    ? image
    : { height: image.width, width: image.height };
}

function paddedRect(
  left: number,
  top: number,
  width: number,
  height: number,
  viewport: ScannerSize,
): ScannerRect | null {
  if (
    ![left, top, width, height].every(isFiniteNumber) ||
    width <= 0 ||
    height <= 0 ||
    !isUsableSize(viewport)
  ) {
    return null;
  }

  const paddedLeft = Math.max(0, left - HIGHLIGHT_PADDING);
  const paddedTop = Math.max(0, top - HIGHLIGHT_PADDING);
  const right = Math.min(viewport.width, left + width + HIGHLIGHT_PADDING);
  const bottom = Math.min(viewport.height, top + height + HIGHLIGHT_PADDING);

  if (right <= paddedLeft || bottom <= paddedTop) return null;

  return {
    height: bottom - paddedTop,
    left: paddedLeft,
    top: paddedTop,
    width: right - paddedLeft,
  };
}

export function barcodeHighlightRect(
  geometry: BarcodeHighlightGeometry,
  viewport: ScannerSize,
): ScannerRect | null {
  const points = (geometry.cornerPoints ?? []).filter(
    ({ x, y }) => isFiniteNumber(x) && isFiniteNumber(y),
  );

  if (points.length >= 2) {
    const left = Math.min(...points.map(({ x }) => x));
    const right = Math.max(...points.map(({ x }) => x));
    const top = Math.min(...points.map(({ y }) => y));
    const bottom = Math.max(...points.map(({ y }) => y));
    const rect = paddedRect(left, top, right - left, bottom - top, viewport);
    if (rect) return rect;
  }

  const bounds = geometry.bounds;
  if (!bounds) return null;

  return paddedRect(
    bounds.origin.x,
    bounds.origin.y,
    bounds.size.width,
    bounds.size.height,
    viewport,
  );
}

export function visionHighlightRect(
  observation: RecognizedProductTextLine,
  image: ScannerSize,
  viewport: ScannerSize,
): ScannerRect | null {
  const { x, y, width, height } = observation;
  if (
    ![x, y, width, height].every(isFiniteNumber) ||
    !isUsableSize(image) ||
    !isUsableSize(viewport) ||
    (width ?? 0) <= 0 ||
    (height ?? 0) <= 0
  ) {
    return null;
  }

  const orientedImage = imageSizeInViewportOrientation(image, viewport);

  const scale = Math.max(
    viewport.width / orientedImage.width,
    viewport.height / orientedImage.height,
  );
  const renderedWidth = orientedImage.width * scale;
  const renderedHeight = orientedImage.height * scale;
  const offsetX = (viewport.width - renderedWidth) / 2;
  const offsetY = (viewport.height - renderedHeight) / 2;

  return paddedRect(
    offsetX + (x ?? 0) * renderedWidth,
    offsetY + (1 - (y ?? 0) - (height ?? 0)) * renderedHeight,
    (width ?? 0) * renderedWidth,
    (height ?? 0) * renderedHeight,
    viewport,
  );
}

function hasPosition(observation: RecognizedProductTextLine): boolean {
  return [
    observation.x,
    observation.y,
    observation.width,
    observation.height,
  ].every(isFiniteNumber);
}

export function recognizedTextHighlightLines(
  lookupText: string,
  observations: RecognizedProductTextLine[],
): RecognizedProductTextLine[] {
  const normalizedLookup = normalizeProductText(lookupText);
  const lookupTokens = new Set(productTextTokens(lookupText));
  if (!normalizedLookup || !lookupTokens.size) return [];

  return observations.filter((observation) => {
    if ((observation.confidence ?? 1) < 0.4 || !hasPosition(observation)) {
      return false;
    }

    const normalizedLine = normalizeProductText(observation.text);
    const lineTokens = productTextTokens(observation.text);
    return (
      Boolean(normalizedLine && normalizedLookup.includes(normalizedLine)) ||
      (lineTokens.length > 0 &&
        lineTokens.every((token) => lookupTokens.has(token)))
    );
  });
}

export function identifierHighlightLines(
  identifier: string,
  observations: RecognizedProductTextLine[],
): RecognizedProductTextLine[] {
  return observations.filter(
    (observation) =>
      (observation.confidence ?? 1) >= 0.4 &&
      hasPosition(observation) &&
      observation.text.replace(/\D/g, '') === identifier,
  );
}
