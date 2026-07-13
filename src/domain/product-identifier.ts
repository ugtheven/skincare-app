export type ProductIdentifierKind = 'barcode' | 'qr';

export function normalizeProductIdentifier(value: string): string {
  const compact = value.trim().replace(/\s+/g, '');

  if (/^\d+$/.test(compact)) return compact;

  return compact.replace(/\/$/, '').toLocaleUpperCase('en-US');
}

export function identifierKindFor(value: string): ProductIdentifierKind {
  return /^\d{8,14}$/.test(normalizeProductIdentifier(value))
    ? 'barcode'
    : 'qr';
}
