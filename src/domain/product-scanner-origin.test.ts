import {
  productsScannerOrigin,
  scannerCloseLabel,
  type ProductScannerOrigin,
} from './product-scanner-origin';

describe('product scanner origin', () => {
  it('keeps Products as the default consultation origin', () => {
    expect(productsScannerOrigin).toEqual({ kind: 'products' });
    expect(scannerCloseLabel(productsScannerOrigin)).toBe('Fermer');
  });

  it('carries the routine editor context without linking a product yet', () => {
    const origin: ProductScannerOrigin = {
      kind: 'routine-editor',
      routineId: 'routine-evening',
      routinePeriod: 'evening',
    };

    expect(scannerCloseLabel(origin)).toBe('Retour à la routine');
  });
});
