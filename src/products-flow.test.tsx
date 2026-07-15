import { fireEvent, render } from '@testing-library/react-native';

import type { Product } from '@/domain/product';
import type { ProductCandidate } from '@/domain/product-recognition';

import {
  CandidateSelection,
  CloudConsentScreen,
  ProductDetail,
  ProductTextSearch,
  RoutineAssignmentSheet,
} from './app/products';

jest.mock('expo-image', () => ({
  Image: () => null,
}));

jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
}));

jest.mock('expo-file-system/legacy', () => ({
  deleteAsync: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light' },
  NotificationFeedbackType: { Success: 'Success' },
}));

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@/data/sqlite-product-repository', () => ({
  productRepository: {},
}));

jest.mock('@/data/sqlite-routine-repository', () => ({
  routineRepository: {
    getRoutineForEditing: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('@/data/on-device-text-recognition', () => ({
  isOnDeviceTextRecognitionAvailable: () => false,
  recognizePackagingText: jest.fn(),
}));

jest.mock('@/data/product-visual-fallback', () => ({
  recognizeProductWithVisualFallback: jest.fn(),
}));

jest.mock('@/data/shared-product-api', () => ({
  lookupSharedProductByIdentifier: jest.fn(),
  lookupSharedProductsByText: jest.fn(),
  submitConfirmedWebProduct: jest.fn(),
  submitWrongProductGuess: jest.fn(),
  VisualLookupError: class extends Error {},
}));

const candidate: ProductCandidate = {
  id: 'candidate-1',
  name: 'Sérum apaisant',
  brand: 'Exemple',
  category: 'Sérum',
  imageUrl: 'https://example.com/product.webp',
  imageSource: 'Exemple',
  imageSourceUrl: 'https://example.com/product',
  imageLicense: null,
  imageLicenseUrl: null,
  ingredientsText: 'Aqua, Glycerin',
  ingredientsSource: 'Exemple',
  ingredientsSourceUrl: 'https://example.com/product',
  score: 0.73,
  source: 'shared',
};

const product: Product = {
  id: 'product-1',
  name: candidate.name,
  brand: candidate.brand,
  category: candidate.category,
  barcode: null,
  imageUrl: candidate.imageUrl ?? null,
  imageSource: candidate.imageSource ?? null,
  imageSourceUrl: candidate.imageSourceUrl ?? null,
  imageLicense: candidate.imageLicense ?? null,
  imageLicenseUrl: candidate.imageLicenseUrl ?? null,
  ingredientsText: candidate.ingredientsText ?? null,
  ingredientsSource: candidate.ingredientsSource ?? null,
  ingredientsSourceUrl: candidate.ingredientsSourceUrl ?? null,
  usageText: null,
  usageSource: null,
  usageSourceUrl: null,
  precautionsText: null,
  precautionsSource: null,
  precautionsSourceUrl: null,
  informationConfidence: null,
  confidenceSource: null,
  confidenceSourceUrl: null,
  confidenceNote: null,
  source: 'barcode',
  createdAt: '2026-07-14T00:00:00.000Z',
  updatedAt: '2026-07-14T00:00:00.000Z',
};

const detailedProduct: Product = {
  ...product,
  ingredientsText: 'Aqua, Glycerin, Niacinamide, Panthenol',
  usageText: 'Appliquer une petite quantité sur peau propre.',
  usageSource: 'Exemple',
  usageSourceUrl: 'https://example.com/product',
  precautionsText: 'Éviter le contact direct avec les yeux.',
  precautionsSource: 'Exemple',
  precautionsSourceUrl: 'https://example.com/product',
  informationConfidence: 'moderate',
  confidenceSource: 'Catalogue partagé',
  confidenceSourceUrl: 'https://example.com/product',
  confidenceNote: 'La formule disponible peut varier selon le marché.',
};

it('requires an explicit action before the cloud lookup', async () => {
  const onContinue = jest.fn();
  const onManual = jest.fn();
  const onCancel = jest.fn();
  const view = await render(
    <CloudConsentScreen
      imageUri="file:///product.jpg"
      onCancel={onCancel}
      onContinue={onContinue}
      onManual={onManual}
    />,
  );

  expect(view.getByText(/envoyée à Google/)).toBeTruthy();
  await fireEvent.press(view.getByText('Continuer'));
  expect(onContinue).toHaveBeenCalledTimes(1);
  expect(onManual).not.toHaveBeenCalled();
  expect(onCancel).not.toHaveBeenCalled();
});

it('confirms the chosen candidate in one action', async () => {
  const onConfirm = jest.fn();
  const view = await render(
    <CandidateSelection
      backgroundImageUri={null}
      candidates={[candidate]}
      message={null}
      reportingCandidateId={null}
      onCancel={jest.fn()}
      onConfirm={onConfirm}
      onManual={jest.fn()}
      onWrongGuess={jest.fn()}
    />,
  );

  await fireEvent.press(view.getByText('C’est ce produit'));
  expect(onConfirm).toHaveBeenCalledWith(candidate);
});

it('keeps uncertain text results explicit and selectable', async () => {
  const onSelect = jest.fn();
  const view = await render(
    <ProductTextSearch
      candidates={[
        candidate,
        {
          ...candidate,
          id: 'candidate-2',
          name: 'Sérum apaisant intense',
          score: 0.69,
        },
      ]}
      isPartial={false}
      isSaving={false}
      message={null}
      query="Exemple Sérum apaisant"
      status="results"
      onCancel={jest.fn()}
      onChangeQuery={jest.fn()}
      onManual={jest.fn()}
      onScan={jest.fn()}
      onSearch={jest.fn()}
      onSelect={onSelect}
    />,
  );

  expect(
    view.getByText(/Aucun choix incertain n’est fait automatiquement\./),
  ).toBeTruthy();
  expect(view.getAllByText('Catalogue partagé')).toHaveLength(2);
  await fireEvent.press(view.getByLabelText('Ouvrir Exemple Sérum apaisant'));
  expect(onSelect).toHaveBeenCalledWith(candidate);
});

it('offers reformulation, scan and manual entry after no text result', async () => {
  const onChangeQuery = jest.fn();
  const onScan = jest.fn();
  const onManual = jest.fn();
  const view = await render(
    <ProductTextSearch
      candidates={[]}
      isPartial={false}
      isSaving={false}
      message={null}
      query="Produit inconnu"
      status="not_found"
      onCancel={jest.fn()}
      onChangeQuery={onChangeQuery}
      onManual={onManual}
      onScan={onScan}
      onSearch={jest.fn()}
      onSelect={jest.fn()}
    />,
  );

  expect(view.getByText('Aucun produit trouvé')).toBeTruthy();
  await fireEvent.changeText(
    view.getByLabelText('Nom ou marque du produit'),
    'Autre recherche',
  );
  expect(onChangeQuery).toHaveBeenCalledWith('Autre recherche');
  await fireEvent.press(view.getByText('Scanner le produit'));
  await fireEvent.press(view.getByText('Saisir manuellement'));
  expect(onScan).toHaveBeenCalledTimes(1);
  expect(onManual).toHaveBeenCalledTimes(1);
});

it('keeps a scanned product consultable without changing ownership', async () => {
  const onBack = jest.fn();
  const onMarkAsOwned = jest.fn();
  const view = await render(
    <ProductDetail
      product={product}
      isOwned={false}
      isSaving={false}
      message="Consulte cette fiche sans l’ajouter à Mes produits."
      resultContext="scan"
      closeLabel="Fermer"
      onMarkAsOwned={onMarkAsOwned}
      onBack={onBack}
    />,
  );

  await fireEvent.press(view.getByText('Fermer'));
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onMarkAsOwned).not.toHaveBeenCalled();

  await fireEvent.press(view.getByText('Je l’ai'));
  expect(onMarkAsOwned).toHaveBeenCalledTimes(1);
});

it('shows ownership as text, not color alone', async () => {
  const view = await render(
    <ProductDetail
      product={product}
      isOwned
      message="Produit ajouté à Mes produits."
      resultContext="scan"
      closeLabel="Fermer"
      onMarkAsOwned={jest.fn()}
      onBack={jest.fn()}
    />,
  );

  expect(view.getByText('Dans Mes produits')).toBeTruthy();
  expect(view.queryByText('Je l’ai')).toBeNull();
});

it('keeps ownership available while a barcode result is enriched', async () => {
  const view = await render(
    <ProductDetail
      product={{ ...product, imageUrl: null, ingredientsText: null }}
      isOwned={false}
      isEnriching
      message={null}
      resultContext="scan"
      closeLabel="Fermer"
      onMarkAsOwned={jest.fn()}
      onBack={jest.fn()}
    />,
  );

  expect(
    view.getByText('Photo et ingrédients en cours de récupération…'),
  ).toBeTruthy();
  expect(view.getByText('Je l’ai')).toBeEnabled();
});

it('shows the sourced essential summary before progressive details', async () => {
  const view = await render(
    <ProductDetail
      product={detailedProduct}
      isOwned={false}
      message={null}
      resultContext="search"
      closeLabel="Fermer"
      onMarkAsOwned={jest.fn()}
      onBack={jest.fn()}
    />,
  );

  expect(view.getByText('Sérum')).toBeTruthy();
  expect(
    view.getByText('Appliquer une petite quantité sur peau propre.'),
  ).toBeTruthy();
  expect(
    view.getByText('Éviter le contact direct avec les yeux.'),
  ).toBeTruthy();
  expect(view.getByText('Confiance modérée')).toBeTruthy();
  expect(
    view.getByText('La formule disponible peut varier selon le marché.'),
  ).toBeTruthy();
  expect(view.queryByText('Panthenol')).toBeNull();

  await fireEvent.press(view.getByText('Voir la liste complète (4)'));
  expect(view.getByText('Panthenol')).toBeTruthy();

  await fireEvent.press(view.getByText('Voir les sources et licences'));
  expect(view.getByText('Précautions · Exemple')).toBeTruthy();
  expect(view.getByText('Confiance · Catalogue partagé')).toBeTruthy();
});

it('keeps every absent fact explicit without implying safety', async () => {
  const view = await render(
    <ProductDetail
      product={{
        ...product,
        imageUrl: null,
        category: null,
        ingredientsText: null,
        ingredientsSource: null,
        confidenceSource: 'Catalogue partagé',
        confidenceNote: 'Note orpheline sans confiance sourcée.',
      }}
      isOwned={false}
      message={null}
      resultContext="scan"
      closeLabel="Fermer"
      onMarkAsOwned={jest.fn()}
      onBack={jest.fn()}
    />,
  );

  expect(view.getByText('Photo indisponible')).toBeTruthy();
  expect(view.getByText('Catégorie indisponible')).toBeTruthy();
  expect(view.getByText('Usage non disponible')).toBeTruthy();
  expect(
    view.getByText(
      'Aucune précaution vérifiée n’est disponible pour cette fiche.',
    ),
  ).toBeTruthy();
  expect(view.getByText('Confiance non évaluée')).toBeTruthy();
  expect(view.queryByText('Note orpheline sans confiance sourcée.')).toBeNull();
  expect(view.queryByText('Source : Catalogue partagé')).toBeNull();
  expect(view.queryByText(/aucune précaution connue/i)).toBeNull();
  expect(view.queryByText(/bon|mauvais/i)).toBeNull();
  expect(view.queryByText('Ajouter à une routine')).toBeNull();
});

it('renders a contextual action only when a caller provides one', async () => {
  const onContextualAction = jest.fn();
  const view = await render(
    <ProductDetail
      product={product}
      isOwned
      message={null}
      resultContext="collection"
      closeLabel="Fermer"
      contextualAction={{
        label: 'Action de contexte',
        accessibilityLabel: 'Effectuer l’action de contexte',
        onPress: onContextualAction,
      }}
      onMarkAsOwned={jest.fn()}
      onBack={jest.fn()}
    />,
  );

  await fireEvent.press(view.getByText('Action de contexte'));
  expect(onContextualAction).toHaveBeenCalledTimes(1);
});

it('chooses a routine and explicit weekdays from the product sheet', async () => {
  const onAdd = jest.fn();
  const view = await render(
    <RoutineAssignmentSheet
      product={product}
      visible
      isBusy={false}
      onAdd={onAdd}
      onClose={jest.fn()}
    />,
  );

  await fireEvent.press(view.getByText('Soir'));
  await fireEvent.press(view.getByLabelText('Lundi'));
  await fireEvent.press(view.getByText('Ajouter à la routine'));

  expect(onAdd).toHaveBeenCalledWith({
    period: 'evening',
    selectedWeekdays: [0, 2, 3, 4, 5, 6],
  });
});

it('offers an explicit removal action for an owned product', async () => {
  const onRemove = jest.fn();
  const view = await render(
    <ProductDetail
      product={product}
      isOwned
      message={null}
      resultContext="collection"
      closeLabel="Fermer"
      onMarkAsOwned={jest.fn()}
      onRemoveFromCollection={onRemove}
      onBack={jest.fn()}
    />,
  );

  await fireEvent.press(view.getByText('Retirer de Mes produits'));
  expect(onRemove).toHaveBeenCalledTimes(1);
});
