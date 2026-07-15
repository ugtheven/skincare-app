import type { RoutinePeriod } from './routine';

export type ProductScannerOrigin =
  | { kind: 'products' }
  | {
      kind: 'routine-editor';
      routineId: string | null;
      routinePeriod: RoutinePeriod;
    };

export const productsScannerOrigin: ProductScannerOrigin = {
  kind: 'products',
};

export function scannerCloseLabel(origin: ProductScannerOrigin) {
  return origin.kind === 'routine-editor' ? 'Retour à la routine' : 'Fermer';
}
