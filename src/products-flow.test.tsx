import { fireEvent, render } from '@testing-library/react-native';

import type { ProductCandidate } from '@/domain/product-recognition';
import type { RoutineOccurrence } from '@/domain/routine';

import {
  CandidateSelection,
  CloudConsentScreen,
  ProductSuccess,
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
  routineRepository: {},
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
  score: 98,
  source: 'shared',
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
  fireEvent.press(view.getByText('Continuer'));
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

  fireEvent.press(view.getByText('C’est ce produit'));
  expect(onConfirm).toHaveBeenCalledWith(candidate);
});

it('makes routine association secondary after a successful save', async () => {
  const routine: RoutineOccurrence = {
    routine: {
      id: 'routine-1',
      name: 'Routine du soir',
      period: 'evening',
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:00:00.000Z',
    },
    scheduledDate: '2026-07-13',
    steps: [],
  };
  const onDone = jest.fn();
  const view = await render(
    <ProductSuccess
      product={null}
      routine={routine}
      isSaving={false}
      message="Le produit est enregistré."
      onAdd={jest.fn()}
      onDone={onDone}
    />,
  );

  fireEvent.press(view.getByText('Retour aux produits'));
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(view.getByText('Ajouter à Routine du soir')).toBeTruthy();
});
