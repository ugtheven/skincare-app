export type ProductSource = 'manual' | 'barcode';

export type ProductInformationConfidence = 'limited' | 'moderate' | 'high';

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
  usageText: string | null;
  usageSource: string | null;
  usageSourceUrl: string | null;
  precautionsText: string | null;
  precautionsSource: string | null;
  precautionsSourceUrl: string | null;
  informationConfidence: ProductInformationConfidence | null;
  confidenceSource: string | null;
  confidenceSourceUrl: string | null;
  confidenceNote: string | null;
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
  usageText: string;
  usageSource: string;
  usageSourceUrl: string;
  precautionsText: string;
  precautionsSource: string;
  precautionsSourceUrl: string;
  informationConfidence: ProductInformationConfidence | '';
  confidenceSource: string;
  confidenceSourceUrl: string;
  confidenceNote: string;
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
  usageText: '',
  usageSource: '',
  usageSourceUrl: '',
  precautionsText: '',
  precautionsSource: '',
  precautionsSourceUrl: '',
  informationConfidence: '',
  confidenceSource: '',
  confidenceSourceUrl: '',
  confidenceNote: '',
  source: 'manual',
};
