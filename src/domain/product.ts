export type ProductSource = 'manual' | 'barcode';

export const PRODUCT_CATEGORIES = [
  'Nettoyant',
  'Démaquillant',
  'Tonique',
  'Exfoliant',
  'Sérum',
  'Soin ciblé',
  'Hydratant',
  'Soin contour des yeux',
  'Protection solaire',
  'Masque',
  'Soin des lèvres',
  'Soin du corps',
  'Soin capillaire',
  'Coiffant',
  'Autre',
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export type Product = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  imageUrl: string | null;
  imageSource: string | null;
  imageSourceUrl: string | null;
  imageLicense: string | null;
  imageLicenseUrl: string | null;
  ingredientsText: string | null;
  ingredientsSource: string | null;
  ingredientsSourceUrl: string | null;
  source: ProductSource;
  createdAt: string;
  updatedAt: string;
};

export type ProductDraft = {
  name: string;
  brand: string;
  category: string;
  barcode: string;
  imageUrl: string;
  imageSource: string;
  imageSourceUrl: string;
  imageLicense: string;
  imageLicenseUrl: string;
  ingredientsText: string;
  ingredientsSource: string;
  ingredientsSourceUrl: string;
  source: ProductSource;
};

export const emptyProductDraft: ProductDraft = {
  name: '',
  brand: '',
  category: '',
  barcode: '',
  imageUrl: '',
  imageSource: '',
  imageSourceUrl: '',
  imageLicense: '',
  imageLicenseUrl: '',
  ingredientsText: '',
  ingredientsSource: '',
  ingredientsSourceUrl: '',
  source: 'manual',
};
