import {
  identifierKindFor,
  normalizeProductIdentifier,
} from './product-identifier';

describe('product identifiers', () => {
  it('normalizes an EAN without changing its digits', () => {
    expect(normalizeProductIdentifier(' 3760 2011 31234 ')).toBe(
      '3760201131234',
    );
    expect(identifierKindFor('3760201131234')).toBe('barcode');
  });

  it('keeps a QR payload distinct from a barcode', () => {
    expect(normalizeProductIdentifier('https://example.com/product/')).toBe(
      'HTTPS://EXAMPLE.COM/PRODUCT',
    );
    expect(identifierKindFor('https://example.com/product')).toBe('qr');
  });
});
