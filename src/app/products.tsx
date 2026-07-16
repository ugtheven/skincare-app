import {
  CameraView,
  type BarcodeScanningResult,
  useCameraPermissions,
} from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  AccessibilityInfo,
  Alert,
  Animated,
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  isLiveDataScannerSupported,
  LiveDataScannerView,
  type LiveDataScannerItem,
} from '@/components/live-data-scanner';
import {
  lookupOpenBeautyFactsByText,
  lookupProductByBarcode,
} from '@/data/open-beauty-facts';
import {
  isOnDeviceTextRecognitionAvailable,
  recognizePackagingText,
  type RecognizedPackagingText,
} from '@/data/on-device-text-recognition';
import {
  cacheScanResult,
  markScanResultAsOwned,
  openCachedScanResult,
  openProductCandidateResult,
} from '@/data/product-scan-result';
import { productRepository } from '@/data/sqlite-product-repository';
import { routineRepository } from '@/data/sqlite-routine-repository';
import {
  barcodeDraftNeedsEnrichment,
  mergeBarcodeEnrichment,
  recognizeProductBarcode,
  recognizeProductPhoto,
  searchProductsByText,
} from '@/data/product-recognition-service';
import { recognizeProductWithVisualFallback } from '@/data/product-visual-fallback';
import {
  lookupSharedProductByIdentifier,
  lookupSharedProductsByText,
  refreshSharedProductByIdentifier,
  submitConfirmedWebProduct,
  submitWrongProductGuess,
  VisualLookupError,
} from '@/data/shared-product-api';
import { Colors } from '@/constants/theme';
import {
  advanceAutoCaptureIdentifierLock,
  advanceAutoCaptureLock,
  barcodeGuidanceStage,
  emptyAutoCaptureIdentifierLock,
  emptyAutoCaptureLock,
  extractStrongPrintedGtin,
  extractValidGtin,
  type AutoCaptureLockStage,
} from '@/domain/product-auto-capture';
import { parseIngredientList } from '@/domain/product-ingredients';
import {
  itemIdsForSelectedObservations,
  liveTextEvidence,
} from '@/domain/live-data-scanner';
import {
  emptyProductDraft,
  PRODUCT_CATEGORIES,
  type Product,
  type ProductDraft,
} from '@/domain/product';
import {
  allWeekdays,
  routineCategoryForProduct,
  routineNameForPeriod,
  type RoutineDefinition,
  type RoutinePeriod,
  type Weekday,
} from '@/domain/routine';
import {
  productsScannerOrigin,
  scannerCloseLabel,
  type ProductScannerOrigin,
} from '@/domain/product-scanner-origin';
import {
  candidateToDraft,
  hasDecisiveCandidate,
  hasReliableCandidate,
  hasProductCandidateImage,
  manualDraftFromRecognizedText,
  normalizeProductText,
  productLookupTextFromRecognizedText,
  selectProductCandidates,
  type ProductCandidate,
  type RecognizedProductTextLine,
} from '@/domain/product-recognition';
import {
  barcodeHighlightRect,
  identifierHighlightLines,
  recognizedTextHighlightLines,
  visionHighlightRect,
  type ScannerRect,
  type ScannerSize,
} from '@/domain/scanner-highlights';
type Screen =
  | 'catalogue'
  | 'search'
  | 'scanner'
  | 'cloudConsent'
  | 'recognizing'
  | 'recognitionIssue'
  | 'candidates'
  | 'form'
  | 'detail';

export type ProductResultContext = 'collection' | 'manual' | 'scan' | 'search';

export type ProductDetailContextualAction = {
  label: string;
  accessibilityLabel: string;
  isBusy?: boolean;
  onPress: () => void;
  emphasis?: 'primary' | 'secondary';
};

type ProductWorkflowContextValue = {
  onClose: () => void;
  onProductSelected: (product: Product) => void;
};

const ProductWorkflowContext =
  createContext<ProductWorkflowContextValue | null>(null);

type PhotoRecognitionFallback = Extract<
  Awaited<ReturnType<typeof recognizeProductPhoto>>,
  { kind: 'fallback_required' }
>;

type RecognitionIssue = {
  title: string;
  message: string;
};

type ScannerMode = 'barcode' | 'front';

type ScannerHighlight = {
  id: string;
  rect: ScannerRect;
  tone: 'detected' | 'confirmed';
};

type TextSearchStatus =
  'idle' | 'invalid' | 'loading' | 'results' | 'not_found' | 'unavailable';

// Keep confirmed geometry on screen long enough to be perceived before lookup.
const SCAN_SUCCESS_HOLD_MS = 650;
const LIVE_SCANNER_EVALUATION_MS = 400;
const LIVE_BARCODE_FALLBACK_MS = 7500;
const CAMERA_HANDOFF_SETTLE_MS = 300;
const CAMERA_CAPTURE_RETRY_MS = 220;
const CAMERA_CAPTURE_ATTEMPTS = 3;
const CAMERA_READY_TIMEOUT_MS = 2500;
const ROUTINE_WEEKDAYS: { label: string; short: string; value: Weekday }[] = [
  { label: 'Lundi', short: 'L', value: 1 },
  { label: 'Mardi', short: 'M', value: 2 },
  { label: 'Mercredi', short: 'M', value: 3 },
  { label: 'Jeudi', short: 'J', value: 4 },
  { label: 'Vendredi', short: 'V', value: 5 },
  { label: 'Samedi', short: 'S', value: 6 },
  { label: 'Dimanche', short: 'D', value: 0 },
];

function draftFromProduct(product: Product): ProductDraft {
  return {
    name: product.name,
    brand: product.brand ?? '',
    category: product.category ?? '',
    barcode: product.barcode ?? '',
    imageUrl: product.imageUrl ?? '',
    imageSource: product.imageSource ?? '',
    imageSourceUrl: product.imageSourceUrl ?? '',
    imageLicense: product.imageLicense ?? '',
    imageLicenseUrl: product.imageLicenseUrl ?? '',
    ingredientsText: product.ingredientsText ?? '',
    ingredientsSource: product.ingredientsSource ?? '',
    ingredientsSourceUrl: product.ingredientsSourceUrl ?? '',
    usageText: product.usageText ?? '',
    usageSource: product.usageSource ?? '',
    usageSourceUrl: product.usageSourceUrl ?? '',
    precautionsText: product.precautionsText ?? '',
    precautionsSource: product.precautionsSource ?? '',
    precautionsSourceUrl: product.precautionsSourceUrl ?? '',
    informationConfidence: product.informationConfidence ?? '',
    confidenceSource: product.confidenceSource ?? '',
    confidenceSourceUrl: product.confidenceSourceUrl ?? '',
    confidenceNote: product.confidenceNote ?? '',
    source: product.source,
  };
}

function candidateFromProduct(product: Product): ProductCandidate {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    imageUrl: product.imageUrl,
    imageSource: product.imageSource,
    imageSourceUrl: product.imageSourceUrl,
    imageLicense: product.imageLicense,
    imageLicenseUrl: product.imageLicenseUrl,
    ingredientsText: product.ingredientsText,
    ingredientsSource: product.ingredientsSource,
    ingredientsSourceUrl: product.ingredientsSourceUrl,
    usageText: product.usageText,
    usageSource: product.usageSource,
    usageSourceUrl: product.usageSourceUrl,
    precautionsText: product.precautionsText,
    precautionsSource: product.precautionsSource,
    precautionsSourceUrl: product.precautionsSourceUrl,
    informationConfidence: product.informationConfidence,
    confidenceSource: product.confidenceSource,
    confidenceSourceUrl: product.confidenceSourceUrl,
    confidenceNote: product.confidenceNote,
    score: 0,
    source: 'local',
  };
}

type ProductsStackParamList = {
  Catalogue: undefined;
  Workflow: {
    initialScreen: Exclude<Screen, 'catalogue'>;
    origin: ProductScannerOrigin;
    draft?: ProductDraft;
    notice?: string | null;
    product?: Product;
    isOwned?: boolean;
    resultContext?: ProductResultContext;
    nonce: number;
  };
};

type ProductsExperienceProps =
  | NativeStackScreenProps<ProductsStackParamList, 'Catalogue'>
  | NativeStackScreenProps<ProductsStackParamList, 'Workflow'>;

const ProductsStack = createNativeStackNavigator<ProductsStackParamList>();

export default function ProductsScreen() {
  return (
    <ProductsStack.Navigator screenOptions={{ headerShown: false }}>
      <ProductsStack.Screen name="Catalogue" component={ProductsExperience} />
      <ProductsStack.Screen
        name="Workflow"
        component={ProductsExperience}
        options={{ gestureEnabled: true }}
      />
    </ProductsStack.Navigator>
  );
}

export function RoutineProductScanner({
  origin,
  onClose,
  onProductSelected,
}: {
  origin: Extract<ProductScannerOrigin, { kind: 'routine-editor' }>;
  onClose: () => void;
  onProductSelected: (product: Product) => void;
}) {
  return (
    <ProductWorkflowContext.Provider value={{ onClose, onProductSelected }}>
      <ProductsStack.Navigator
        initialRouteName="Workflow"
        screenOptions={{ headerShown: false }}
      >
        <ProductsStack.Screen name="Catalogue" component={ProductsExperience} />
        <ProductsStack.Screen
          name="Workflow"
          component={ProductsExperience}
          initialParams={{
            initialScreen: 'scanner',
            origin,
            nonce: Date.now(),
          }}
          options={{ gestureEnabled: true }}
        />
      </ProductsStack.Navigator>
    </ProductWorkflowContext.Provider>
  );
}

function ProductsExperience({ route, navigation }: ProductsExperienceProps) {
  const colors = Colors;
  const insets = useSafeAreaInsets();
  const workflowParams = route.name === 'Workflow' ? route.params : null;
  const origin = workflowParams?.origin ?? productsScannerOrigin;
  const externalWorkflow = useContext(ProductWorkflowContext);
  const [screen, setScreen] = useState<Screen>(
    workflowParams?.initialScreen ?? 'catalogue',
  );
  const [products, setProducts] = useState<Product[]>([]);
  const [draft, setDraft] = useState<ProductDraft>(
    workflowParams?.draft ?? emptyProductDraft,
  );
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(
    workflowParams?.product ?? null,
  );
  const [selectedProductOwned, setSelectedProductOwned] = useState(
    workflowParams?.isOwned ?? false,
  );
  const [resultContext, setResultContext] = useState<ProductResultContext>(
    workflowParams?.resultContext ??
      (workflowParams?.product ? 'collection' : 'scan'),
  );
  const [candidates, setCandidates] = useState<ProductCandidate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchStatus, setSearchStatus] = useState<TextSearchStatus>('idle');
  const [searchIsPartial, setSearchIsPartial] = useState(false);
  const [recognizedText, setRecognizedText] = useState('');
  const [pendingIdentifier, setPendingIdentifier] = useState<string | null>(
    null,
  );
  const [scannerInitialMode, setScannerInitialMode] =
    useState<ScannerMode>('barcode');
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const [recognitionMode, setRecognitionMode] = useState<'local' | 'web'>(
    'local',
  );
  const [reportingCandidateId, setReportingCandidateId] = useState<
    string | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(
    workflowParams?.notice ?? null,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isRoutineSheetOpen, setIsRoutineSheetOpen] = useState(false);
  const [pendingFallback, setPendingFallback] =
    useState<PhotoRecognitionFallback | null>(null);
  const [pendingObservations, setPendingObservations] = useState<
    RecognizedProductTextLine[]
  >([]);
  const [recognitionIssue, setRecognitionIssue] =
    useState<RecognitionIssue | null>(null);
  const recognitionSessionRef = useRef(0);
  const visualLookupAbortRef = useRef<AbortController | null>(null);
  const capturedImageUriRef = useRef<string | null>(null);

  useEffect(() => {
    capturedImageUriRef.current = capturedImageUri;
  }, [capturedImageUri]);

  useEffect(
    () => () => {
      recognitionSessionRef.current += 1;
      visualLookupAbortRef.current?.abort();
      const uri = capturedImageUriRef.current;
      if (uri) {
        void FileSystem.deleteAsync(uri, { idempotent: true }).catch(
          () => undefined,
        );
      }
    },
    [],
  );

  useEffect(() => {
    const announcements: Partial<Record<Screen, string>> = {
      cloudConsent: 'Autorisation requise pour la recherche avec Google',
      candidates: 'Résultats de reconnaissance disponibles',
      detail: 'Fiche produit ouverte',
      recognitionIssue: 'La reconnaissance a rencontré un problème',
    };
    const announcement = announcements[screen];
    if (announcement) {
      void AccessibilityInfo.announceForAccessibility(announcement);
    }
  }, [screen]);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      setProducts(await productRepository.listOwnedProducts());
      setMessage(null);
    } catch {
      setMessage('Les produits ne peuvent pas être chargés pour le moment.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadProducts();
    }, [loadProducts]),
  );

  useFocusEffect(
    useCallback(() => {
      const tabsNavigation = navigation.getParent();
      tabsNavigation?.setOptions({
        tabBarStyle: screen === 'catalogue' ? undefined : { display: 'none' },
      });
      return () => tabsNavigation?.setOptions({ tabBarStyle: undefined });
    }, [navigation, screen]),
  );

  const closeFlow = useCallback(() => {
    recognitionSessionRef.current += 1;
    visualLookupAbortRef.current?.abort();
    visualLookupAbortRef.current = null;
    setIsLookingUp(false);
    setIsEnriching(false);
    if (externalWorkflow) {
      externalWorkflow.onClose();
      return;
    }
    if (route.name === 'Workflow' && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    setScreen('catalogue');
  }, [externalWorkflow, navigation, route.name]);

  useEffect(() => {
    if (screen !== 'catalogue' || !capturedImageUri) return;
    const uri = capturedImageUri;
    setCapturedImageUri(null);
    void FileSystem.deleteAsync(uri, { idempotent: true }).catch(
      () => undefined,
    );
  }, [capturedImageUri, screen]);

  const openManualForm = (
    prefilledDraft: ProductDraft = emptyProductDraft,
    notice: string | null = null,
  ) => {
    if (route.name === 'Catalogue') {
      navigation.navigate('Workflow', {
        initialScreen: 'form',
        origin: productsScannerOrigin,
        draft: prefilledDraft,
        notice,
        nonce: Date.now(),
      });
      return;
    }
    recognitionSessionRef.current += 1;
    setIsEnriching(false);
    setPendingIdentifier(null);
    setScannerInitialMode('barcode');
    setDraft(prefilledDraft);
    setFormError(null);
    setMessage(notice);
    setScreen('form');
  };

  const openTextSearch = () => {
    if (route.name === 'Catalogue') {
      navigation.navigate('Workflow', {
        initialScreen: 'search',
        origin: productsScannerOrigin,
        nonce: Date.now(),
      });
      return;
    }
    setMessage(null);
    setScreen('search');
  };

  const openTextSearchCandidate = async (candidate: ProductCandidate) => {
    setIsSaving(true);
    try {
      const result = await openProductCandidateResult(
        candidate,
        productRepository,
      );
      setSelectedProduct(result.product);
      setSelectedProductOwned(result.isOwned);
      setResultContext('search');
      setMessage(
        result.isOwned ? 'Ce produit est déjà dans Mes produits.' : null,
      );
      setScreen('detail');
    } catch {
      setSearchStatus('unavailable');
      setMessage('La fiche de ce produit ne peut pas être ouverte. Réessaie.');
    } finally {
      setIsSaving(false);
    }
  };

  const runTextSearch = async () => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setCandidates([]);
      setSearchStatus('invalid');
      setMessage(null);
      return;
    }

    const sessionId = recognitionSessionRef.current + 1;
    recognitionSessionRef.current = sessionId;
    setCandidates([]);
    setSearchStatus('loading');
    setSearchIsPartial(false);
    setMessage(null);

    const outcome = await searchProductsByText(query, {
      searchLocal: async (value) =>
        (await productRepository.searchByText(value)).map(candidateFromProduct),
      searchShared: lookupSharedProductsByText,
      searchPublic: lookupOpenBeautyFactsByText,
    });
    if (sessionId !== recognitionSessionRef.current) return;

    if (outcome.kind === 'results') {
      setCandidates(outcome.candidates);
      setSearchIsPartial(outcome.isPartial);
      setSearchStatus('results');
      if (hasDecisiveCandidate(outcome.candidates)) {
        await openTextSearchCandidate(outcome.candidates[0]);
      } else {
        void AccessibilityInfo.announceForAccessibility(
          `${outcome.candidates.length} résultat${outcome.candidates.length > 1 ? 's' : ''} à confirmer`,
        );
      }
      return;
    }

    setSearchStatus(outcome.kind);
    setSearchIsPartial(
      outcome.kind === 'not_found' ? outcome.isPartial : false,
    );
    void AccessibilityInfo.announceForAccessibility(
      outcome.kind === 'unavailable'
        ? 'Recherche en ligne indisponible'
        : 'Aucun produit trouvé',
    );
  };

  const withPendingIdentifier = (productDraft: ProductDraft): ProductDraft =>
    pendingIdentifier
      ? {
          ...productDraft,
          barcode: pendingIdentifier,
          source: 'barcode',
        }
      : productDraft;

  const discardCapturedImage = async () => {
    const uri = capturedImageUri;
    setCapturedImageUri(null);
    if (uri) {
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(
        () => undefined,
      );
    }
  };

  const openScanner = async () => {
    if (route.name === 'Catalogue') {
      navigation.navigate('Workflow', {
        initialScreen: 'scanner',
        origin: productsScannerOrigin,
        nonce: Date.now(),
      });
      return;
    }
    recognitionSessionRef.current += 1;
    setIsEnriching(false);
    await discardCapturedImage();
    setRecognizedText('');
    setPendingIdentifier(null);
    setScannerInitialMode('barcode');
    setCandidates([]);
    setMessage(null);
    setPendingFallback(null);
    setPendingObservations([]);
    setRecognitionIssue(null);
    setRecognitionMode('local');
    setScreen('scanner');
  };

  const handlePackagingPhoto = async (
    imageUri: string,
    preRecognized?: RecognizedPackagingText,
  ) => {
    const sessionId = recognitionSessionRef.current;
    const recognizedObservations = preRecognized?.observations ?? [];
    setCapturedImageUri(imageUri);
    setCandidates([]);
    setMessage(null);
    setScreen('recognizing');
    setRecognitionMode('local');

    if (!isOnDeviceTextRecognitionAvailable()) {
      openManualForm(
        emptyProductDraft,
        'La photo reste sur cet appareil. Dans Expo Go, ajoute le nom à la main.',
      );
      return;
    }

    const result = await recognizeProductPhoto(imageUri, {
      recognizeText: preRecognized
        ? async () => preRecognized
        : recognizePackagingText,
      searchLocal: async (lookupText) => {
        const localProducts = await productRepository.searchByText(lookupText);
        return localProducts.map(candidateFromProduct);
      },
      searchShared: lookupSharedProductsByText,
      searchPublic: lookupOpenBeautyFactsByText,
    });
    if (sessionId !== recognitionSessionRef.current) return;
    setRecognizedText(result.recognizedText);

    if (
      result.kind === 'fallback_required' &&
      hasReliableCandidate(result.candidates)
    ) {
      const displayableCandidates = result.candidates.filter(
        hasProductCandidateImage,
      );
      if (!hasReliableCandidate(displayableCandidates)) {
        setPendingFallback(result);
        setPendingObservations(recognizedObservations);
        setScreen('cloudConsent');
        return;
      }
      setCandidates(displayableCandidates);
      setMessage('Produit reconnu dans le catalogue partagé.');
      setScreen('candidates');
      return;
    }

    if (result.kind === 'fallback_required') {
      setPendingFallback(result);
      setPendingObservations(recognizedObservations);
      setScreen('cloudConsent');
      return;
    }

    if (result.kind === 'candidates') return;

    const notices = {
      no_text: 'Aucun texte lisible. Tu peux compléter la fiche à la main.',
      not_found: 'Produit absent du catalogue. Vérifie les informations lues.',
      lookup_unavailable:
        'Recherche en ligne indisponible. Vérifie les informations lues.',
      recognition_failed:
        'La reconnaissance a échoué. Tu peux continuer à la main.',
    } as const;
    openManualForm(withPendingIdentifier(result.draft), notices[result.reason]);
  };

  const runVisualEnrichment = async (
    fallback: PhotoRecognitionFallback,
    imageUri: string,
    background = false,
    backgroundSessionId?: number,
    recognizedObservations: RecognizedProductTextLine[] = [],
  ) => {
    const sessionId = recognitionSessionRef.current;
    const controller = background ? null : new AbortController();
    if (controller) visualLookupAbortRef.current = controller;
    if (!background) {
      setPendingFallback(fallback);
      setRecognitionIssue(null);
      setRecognitionMode('web');
      setScreen('recognizing');
    }

    try {
      const lookupText = productLookupTextFromRecognizedText(
        fallback.recognizedText,
        recognizedObservations.length
          ? recognizedObservations
          : fallback.recognizedText.split(/\r?\n/),
      );
      const visualLookupText = lookupText || fallback.recognizedText;
      const visualResult = await recognizeProductWithVisualFallback(
        imageUri,
        visualLookupText,
        recognizedObservations,
        pendingIdentifier ?? undefined,
        controller?.signal,
      );
      if (
        sessionId !== recognitionSessionRef.current ||
        (background && backgroundSessionId !== recognitionSessionRef.current)
      ) {
        return;
      }
      const webCandidates = visualResult.candidates;
      const merged = selectProductCandidates(
        visualLookupText ||
          webCandidates
            .map(({ brand, name }) => [brand, name].filter(Boolean).join(' '))
            .join(' '),
        [...fallback.candidates, ...webCandidates],
      );
      const displayableCandidates = merged.filter(hasProductCandidateImage);
      if (displayableCandidates.length) {
        setCandidates(displayableCandidates);
        setPendingFallback(null);
        setMessage(
          background
            ? 'La fiche a été complétée en arrière-plan.'
            : visualResult.googleCandidateCount > 0 ||
                visualResult.serpApiCandidateCount > 0
              ? 'Produit enrichi depuis une source fabricant vérifiée.'
              : 'Aucune nouvelle source fiable trouvée. Un résultat du catalogue a été conservé.',
        );
        if (!background) setScreen('candidates');
        return;
      }
      if (background) return;
      const advancedSearchUnavailable =
        visualResult.serpApiStatus === 'not_configured' ||
        visualResult.serpApiStatus === 'unavailable';
      setRecognitionIssue({
        title: advancedSearchUnavailable
          ? 'Recherche produit indisponible'
          : 'Produit introuvable',
        message: advancedSearchUnavailable
          ? 'Le nom et la marque ont bien été lus, mais la recherche web avancée n’est pas disponible. Tu peux réessayer ou saisir le produit.'
          : 'Le nom et la marque ont bien été lus, mais aucune fiche suffisamment fiable n’a été trouvée. Réessaie avec la face avant bien visible.',
      });
      setScreen('recognitionIssue');
    } catch (error) {
      if (
        sessionId !== recognitionSessionRef.current ||
        (background && backgroundSessionId !== recognitionSessionRef.current)
      ) {
        return;
      }
      if (background) {
        setMessage(
          'Produit reconnu. La fiche pourra être complétée plus tard.',
        );
        return;
      }
      const errorCode =
        error instanceof VisualLookupError ? error.code : 'unknown';
      const quotaReached = errorCode === 'quota_reached';
      const serviceBusy =
        errorCode === 'global_quota_reached' ||
        errorCode === 'rate_limited' ||
        errorCode === 'duplicate_request';
      const sessionExpired = errorCode === 'authentication_required';
      const invalidImage = errorCode === 'invalid_image';
      const requestTimeout = errorCode === 'request_timeout';
      const providerUnavailable = [
        'disabled',
        'network_unavailable',
        'provider_failed',
        'provider_unavailable',
        'quota_check_failed',
        'quota_not_configured',
        'relay_unavailable',
        'visual_lookup_unavailable',
      ].includes(errorCode);
      if (__DEV__) {
        console.warn(`[product-visual-lookup] ${errorCode}`);
      }
      setRecognitionIssue({
        title: quotaReached
          ? 'Limite de recherche atteinte'
          : serviceBusy
            ? 'Recherche temporairement limitée'
            : sessionExpired
              ? 'Session réinitialisée'
              : invalidImage
                ? 'Photo difficile à transmettre'
                : requestTimeout
                  ? 'Recherche de photo trop longue'
                  : providerUnavailable
                    ? 'Recherche produit indisponible'
                    : 'Recherche de photo interrompue',
        message: quotaReached
          ? 'La limite de recherche du jour est atteinte. Réessaie plus tard, ou saisis ce produit manuellement.'
          : serviceBusy
            ? 'Le service protège actuellement son budget. Réessaie plus tard, ou saisis ce produit manuellement.'
            : sessionExpired
              ? 'La remise à zéro a invalidé l’ancienne session. Réessaie : l’app vient d’en créer une nouvelle.'
              : invalidImage
                ? 'La photo n’a pas pu être préparée. Replace le produit dans le cadre puis réessaie.'
                : requestTimeout
                  ? 'Le service met trop de temps à répondre. Réessaie plus tard ou saisis le produit.'
                  : providerUnavailable
                    ? 'Le service de recherche n’est pas disponible actuellement. Le produit n’est pas considéré comme inconnu.'
                    : 'La recherche a été interrompue. Réessaie plus tard ou saisis le produit.',
      });
      setScreen('recognitionIssue');
    } finally {
      if (background) {
        await FileSystem.deleteAsync(imageUri, { idempotent: true }).catch(
          () => undefined,
        );
      }
      setRecognitionMode('local');
      if (visualLookupAbortRef.current === controller) {
        visualLookupAbortRef.current = null;
      }
    }
  };

  const cancelRecognition = () => {
    recognitionSessionRef.current += 1;
    visualLookupAbortRef.current?.abort();
    visualLookupAbortRef.current = null;
    setPendingFallback(null);
    setPendingObservations([]);
    setIsLookingUp(false);
    void discardCapturedImage();
    closeFlow();
  };

  const showScanResult = async (
    result: Awaited<ReturnType<typeof cacheScanResult>>,
  ) => {
    await discardCapturedImage();
    setSelectedProduct(result.product);
    setSelectedProductOwned(result.isOwned);
    setResultContext('scan');
    setMessage(
      result.isOwned ? 'Ce produit est déjà dans Mes produits.' : null,
    );
    setScreen('detail');
  };

  const confirmCandidate = async (candidate: ProductCandidate) => {
    if (!hasProductCandidateImage(candidate)) {
      setRecognitionIssue({
        title: 'Photo du produit manquante',
        message:
          'Cette fiche doit être complétée avant de pouvoir être consultée.',
      });
      setScreen('recognitionIssue');
      return;
    }
    recognitionSessionRef.current += 1;
    setIsSaving(true);
    try {
      let result;
      if (!pendingIdentifier) {
        result = await openProductCandidateResult(candidate, productRepository);
      } else if (candidate.source === 'local') {
        const product = await productRepository.findById(candidate.id);
        if (!product) throw new Error('Cached product missing');
        result = await openCachedScanResult(
          product,
          pendingIdentifier,
          productRepository,
        );
      } else {
        const candidateDraft = withPendingIdentifier(
          candidateToDraft(candidate),
        );
        result = await cacheScanResult(candidateDraft, productRepository);
      }
      if (candidate.source === 'google-web') {
        void submitConfirmedWebProduct(
          candidate,
          recognizedText,
          pendingIdentifier ?? undefined,
        ).catch(() => undefined);
      }
      await showScanResult(result);
    } catch {
      setRecognitionIssue({
        title: 'Fiche indisponible',
        message:
          'Le produit a été reconnu, mais sa fiche n’a pas pu être ouverte.',
      });
      setScreen('recognitionIssue');
    } finally {
      setIsSaving(false);
    }
  };

  const reportWrongCandidate = async (candidate: ProductCandidate) => {
    setReportingCandidateId(candidate.id);
    try {
      await submitWrongProductGuess(candidate, recognizedText);
      const remaining = candidates.filter((item) => item.id !== candidate.id);
      setCandidates(remaining);
      setMessage('Merci, cette suggestion sera vérifiée.');
      if (!remaining.length) {
        openManualForm(
          withPendingIdentifier(manualDraftFromRecognizedText(recognizedText)),
          'Merci. Vérifie les informations reconnues.',
        );
      }
    } catch {
      setMessage('Le signalement n’a pas pu être envoyé. Tu peux continuer.');
    } finally {
      setReportingCandidateId(null);
    }
  };

  const refreshBarcodeEnrichment = async (
    identifier: string,
    sessionId: number,
    productId: string,
  ) => {
    const delays = [1_200, 2_500, 4_500, 8_000];
    setIsEnriching(true);
    setMessage(null);

    try {
      for (const delay of delays) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (sessionId !== recognitionSessionRef.current) return;

        const refreshed = await refreshSharedProductByIdentifier(
          identifier,
        ).catch(() => undefined);
        if (sessionId !== recognitionSessionRef.current) return;
        if (!refreshed) continue;

        const currentProduct = await productRepository.findById(productId);
        if (!currentProduct || sessionId !== recognitionSessionRef.current) {
          return;
        }
        const enrichedDraft = mergeBarcodeEnrichment(
          draftFromProduct(currentProduct),
          refreshed,
        );
        const { product } = await productRepository.saveProduct(enrichedDraft);
        if (sessionId !== recognitionSessionRef.current) return;
        setSelectedProduct(product);
        if (!barcodeDraftNeedsEnrichment(refreshed)) {
          setMessage('Photo et ingrédients ajoutés à cette fiche.');
          void AccessibilityInfo.announceForAccessibility(
            'Photo et ingrédients ajoutés',
          );
          return;
        }
      }
      if (sessionId === recognitionSessionRef.current) setMessage(null);
    } finally {
      if (sessionId === recognitionSessionRef.current) setIsEnriching(false);
    }
  };

  const handleScannedCode = async (rawValue: string) => {
    const sessionId = recognitionSessionRef.current;
    const identifier = rawValue.trim();
    if (!identifier) return;

    setCapturedImageUri(null);
    setRecognizedText('');
    setPendingIdentifier(identifier);
    setDraft({ ...emptyProductDraft, barcode: identifier, source: 'barcode' });
    setFormError(null);
    setMessage(null);
    setRecognitionMode('local');
    setScreen('recognizing');
    setIsLookingUp(true);

    const result = await recognizeProductBarcode(identifier, {
      findLocal: productRepository.findByIdentifier.bind(productRepository),
      lookupShared: lookupSharedProductByIdentifier,
      lookupPublic: lookupProductByBarcode,
    });
    if (sessionId !== recognitionSessionRef.current) return;

    try {
      if (result.kind === 'local') {
        const existing = result.product;
        const cachedResult = await openCachedScanResult(
          existing,
          identifier,
          productRepository,
        );
        if (sessionId !== recognitionSessionRef.current) return;
        setPendingIdentifier(null);
        setScannerInitialMode('barcode');
        await showScanResult(cachedResult);
      } else if (result.kind === 'draft') {
        const scannedDraft = {
          ...result.draft,
          barcode: identifier,
          source: 'barcode' as const,
        };
        const cachedResult = await cacheScanResult(
          scannedDraft,
          productRepository,
        );
        if (sessionId !== recognitionSessionRef.current) return;
        setPendingIdentifier(null);
        setScannerInitialMode('barcode');
        await showScanResult(cachedResult);
        if (
          result.provider === 'shared' &&
          barcodeDraftNeedsEnrichment(result.draft)
        ) {
          void refreshBarcodeEnrichment(
            identifier,
            sessionId,
            cachedResult.product.id,
          );
        }
      } else {
        setScannerInitialMode('front');
        setScreen('scanner');
      }
    } catch {
      setRecognitionIssue({
        title: 'Fiche indisponible',
        message:
          'Le produit a été reconnu, mais sa fiche n’a pas pu être ouverte.',
      });
      setScreen('recognitionIssue');
    } finally {
      setIsLookingUp(false);
    }
  };

  const saveProduct = async () => {
    if (!draft.name.trim()) {
      setFormError('Ajoute au moins le nom du produit.');
      return;
    }
    if (!draft.category.trim()) {
      setFormError('Choisis une catégorie.');
      return;
    }

    setIsSaving(true);
    recognitionSessionRef.current += 1;
    setIsEnriching(false);
    setFormError(null);
    try {
      const result = await productRepository.saveProduct(draft);
      const shouldOwnImmediately = origin.kind !== 'routine-editor';
      if (shouldOwnImmediately) {
        await productRepository.markAsOwned(result.product.id);
      }
      await discardCapturedImage();
      setSelectedProduct(result.product);
      setSelectedProductOwned(
        shouldOwnImmediately ||
          (await productRepository.isOwned(result.product.id)),
      );
      setResultContext('manual');
      setMessage(
        origin.kind === 'routine-editor'
          ? 'Produit enregistré. Ajoute-le maintenant à la routine.'
          : result.created
            ? 'Produit ajouté à Mes produits.'
            : 'Ce produit est déjà dans Mes produits.',
      );
      setScreen('detail');
      void AccessibilityInfo.announceForAccessibility('Produit enregistré');
    } catch {
      setFormError('Impossible d’enregistrer ce produit. Réessaie.');
    } finally {
      setIsSaving(false);
    }
  };

  const markSelectedProductOwned = async () => {
    if (!selectedProduct || selectedProductOwned || isSaving) return;

    setIsSaving(true);
    try {
      const added = await markScanResultAsOwned(
        selectedProduct.id,
        productRepository,
      );
      setSelectedProductOwned(true);
      await loadProducts();
      setMessage(
        added
          ? 'Produit ajouté à Mes produits.'
          : 'Ce produit est déjà dans Mes produits.',
      );
      void AccessibilityInfo.announceForAccessibility(
        'Produit ajouté à Mes produits',
      );
    } catch {
      setMessage('Impossible d’ajouter ce produit. Réessaie.');
    } finally {
      setIsSaving(false);
    }
  };

  const addSelectedProductToRoutine = async (input: {
    period: RoutinePeriod;
    selectedWeekdays: Weekday[];
  }) => {
    if (!selectedProduct || isSaving) return;
    setIsSaving(true);
    try {
      await routineRepository.addProductStep({
        period: input.period,
        productId: selectedProduct.id,
        title: selectedProduct.name,
        category: routineCategoryForProduct(selectedProduct.category),
        selectedWeekdays: input.selectedWeekdays,
      });
      setSelectedProductOwned(true);
      setIsRoutineSheetOpen(false);
      await loadProducts();
      setMessage(`Produit ajouté à ${routineNameForPeriod(input.period)}.`);
      void AccessibilityInfo.announceForAccessibility(
        `Produit ajouté à ${routineNameForPeriod(input.period)}`,
      );
    } catch {
      setMessage('Impossible d’ajouter ce produit à la routine. Réessaie.');
    } finally {
      setIsSaving(false);
    }
  };

  const removeSelectedProduct = () => {
    if (!selectedProduct || isSaving) return;
    Alert.alert(
      'Retirer de Mes produits ?',
      'Ses usages futurs deviendront des étapes de catégorie. Ton historique restera inchangé.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: async () => {
            setIsSaving(true);
            try {
              await productRepository.removeFromCollection(selectedProduct.id);
              setSelectedProductOwned(false);
              await loadProducts();
              setMessage(
                'Produit retiré. Les routines futures utilisent maintenant des étapes sans produit.',
              );
              void AccessibilityInfo.announceForAccessibility(
                'Produit retiré de Mes produits',
              );
            } catch {
              setMessage('Impossible de retirer ce produit. Réessaie.');
            } finally {
              setIsSaving(false);
            }
          },
        },
      ],
    );
  };

  if (screen === 'search') {
    return (
      <ProductTextSearch
        candidates={candidates}
        isPartial={searchIsPartial}
        isSaving={isSaving}
        message={message}
        query={searchQuery}
        status={searchStatus}
        onCancel={closeFlow}
        onChangeQuery={(value) => {
          setSearchQuery(value);
          if (searchStatus !== 'loading') {
            setSearchStatus('idle');
            setCandidates([]);
            setMessage(null);
          }
        }}
        onManual={() =>
          openManualForm({
            ...emptyProductDraft,
            name: searchQuery.trim(),
          })
        }
        onScan={() => void openScanner()}
        onSearch={() => void runTextSearch()}
        onSelect={(candidate) => void openTextSearchCandidate(candidate)}
      />
    );
  }

  if (screen === 'scanner') {
    return (
      <ScannerScreen
        detectedIdentifier={pendingIdentifier}
        initialMode={scannerInitialMode}
        key={`${scannerInitialMode}:${pendingIdentifier ?? 'new'}`}
        onCancel={() => {
          setPendingIdentifier(null);
          setScannerInitialMode('barcode');
          closeFlow();
        }}
        onScanned={(value) => void handleScannedCode(value)}
        onCaptured={(uri, recognized) =>
          void handlePackagingPhoto(uri, recognized)
        }
        onManual={(recognized) =>
          openManualForm(
            withPendingIdentifier(
              recognized
                ? manualDraftFromRecognizedText(
                    recognized.text,
                    recognized.observations ?? recognized.lines,
                  )
                : emptyProductDraft,
            ),
          )
        }
      />
    );
  }

  if (screen === 'recognizing') {
    return (
      <RecognitionProgress
        imageUri={capturedImageUri}
        mode={recognitionMode}
        onCancel={cancelRecognition}
      />
    );
  }

  if (screen === 'cloudConsent' && pendingFallback && capturedImageUri) {
    return (
      <CloudConsentScreen
        imageUri={capturedImageUri}
        onCancel={cancelRecognition}
        onContinue={() =>
          void runVisualEnrichment(
            pendingFallback,
            capturedImageUri,
            false,
            undefined,
            pendingObservations,
          )
        }
        onManual={() =>
          openManualForm(
            withPendingIdentifier(pendingFallback.draft),
            'Ajout manuel : vérifie les informations reconnues.',
          )
        }
      />
    );
  }

  if (screen === 'recognitionIssue' && recognitionIssue) {
    return (
      <RecognitionIssueScreen
        imageUri={capturedImageUri}
        issue={recognitionIssue}
        onCancel={closeFlow}
        onManual={() =>
          openManualForm(
            withPendingIdentifier(
              pendingFallback?.draft ??
                manualDraftFromRecognizedText(recognizedText),
            ),
            'Ajout manuel : vérifie les informations reconnues.',
          )
        }
        onRetry={() => {
          if (pendingFallback && capturedImageUri) {
            void runVisualEnrichment(pendingFallback, capturedImageUri);
          } else {
            void openScanner();
          }
        }}
      />
    );
  }

  if (screen === 'candidates') {
    return (
      <CandidateSelection
        backgroundImageUri={capturedImageUri}
        candidates={candidates}
        isSaving={isSaving}
        message={message}
        reportingCandidateId={reportingCandidateId}
        onCancel={closeFlow}
        onConfirm={(candidate) => void confirmCandidate(candidate)}
        onManual={() =>
          openManualForm(
            withPendingIdentifier(
              manualDraftFromRecognizedText(recognizedText),
            ),
            'Vérifie les informations reconnues.',
          )
        }
        onWrongGuess={(candidate) => void reportWrongCandidate(candidate)}
      />
    );
  }

  if (screen === 'form') {
    return (
      <ProductForm
        draft={draft}
        previewImageUri={draft.imageUrl}
        isLookingUp={isLookingUp}
        isEnriching={isEnriching}
        isSaving={isSaving}
        message={message}
        error={formError}
        onChange={(key, value) =>
          setDraft((current) => ({ ...current, [key]: value }))
        }
        onCancel={closeFlow}
        onSave={() => void saveProduct()}
      />
    );
  }

  if (screen === 'detail' && selectedProduct) {
    const routineEditorAction =
      origin.kind === 'routine-editor' && externalWorkflow
        ? {
            label: `Ajouter à ${routineNameForPeriod(origin.routinePeriod)}`,
            accessibilityLabel: `Ajouter ${selectedProduct.name} à ${routineNameForPeriod(origin.routinePeriod)}`,
            isBusy: isSaving,
            emphasis: 'primary' as const,
            onPress: () => externalWorkflow.onProductSelected(selectedProduct),
          }
        : null;
    return (
      <>
        <ProductDetail
          product={selectedProduct}
          isOwned={selectedProductOwned}
          isEnriching={isEnriching}
          isSaving={isSaving}
          message={message}
          resultContext={resultContext}
          closeLabel={scannerCloseLabel(origin)}
          contextualAction={
            routineEditorAction ?? {
              label: 'Ajouter à une routine',
              accessibilityLabel: `Ajouter ${selectedProduct.name} à une routine`,
              isBusy: isSaving,
              emphasis: 'primary',
              onPress: () => setIsRoutineSheetOpen(true),
            }
          }
          onMarkAsOwned={() => void markSelectedProductOwned()}
          onRemoveFromCollection={removeSelectedProduct}
          onBack={resultContext === 'search' ? openTextSearch : closeFlow}
        />
        {!routineEditorAction ? (
          <RoutineAssignmentSheet
            isBusy={isSaving}
            product={selectedProduct}
            visible={isRoutineSheetOpen}
            onAdd={(input) => void addSelectedProductToRoutine(input)}
            onClose={() => setIsRoutineSheetOpen(false)}
          />
        ) : null}
      </>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={products}
        keyExtractor={(product) => product.id}
        contentContainerStyle={[
          styles.catalogue,
          { paddingTop: insets.top + 24 },
        ]}
        ListHeaderComponent={
          <View style={styles.catalogueHeader}>
            <Text style={[styles.largeTitle, { color: colors.text }]}>
              Produits
            </Text>
            <Text style={[styles.intro, { color: colors.textSecondary }]}>
              Retrouve les produits que tu utilises.
            </Text>
            {message ? <Notice message={message} /> : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator color={colors.tint} />
              <Text
                style={[styles.loadingText, { color: colors.textSecondary }]}
              >
                Chargement…
              </Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View
                style={[
                  styles.emptyIcon,
                  { backgroundColor: colors.backgroundSelected },
                ]}
              >
                <AppSymbol name="shippingbox" color={colors.tint} size={31} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Ajoute ton premier produit.
              </Text>
              <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
                Recherche par nom ou marque, scanne un produit ou ajoute-le à la
                main.
              </Text>
            </View>
          )
        }
        renderItem={({ item: product }) => (
          <ProductRow
            product={product}
            onPress={() => {
              navigation.navigate('Workflow', {
                initialScreen: 'detail',
                origin: productsScannerOrigin,
                product,
                isOwned: true,
                resultContext: 'collection',
                nonce: Date.now(),
              });
            }}
          />
        )}
        showsVerticalScrollIndicator={false}
      />

      <View
        style={[
          styles.bottomActions,
          {
            backgroundColor: colors.background,
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Rechercher un produit par nom ou marque"
          onPress={openTextSearch}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.tint, opacity: pressed ? 0.86 : 1 },
          ]}
        >
          <AppSymbol name="magnifyingglass" color={colors.onTint} size={20} />
          <Text style={styles.primaryButtonText}>Rechercher un produit</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scanner un produit"
          onPress={() => void openScanner()}
          style={({ pressed }) => [
            styles.outlineButton,
            { borderColor: colors.separator, opacity: pressed ? 0.65 : 1 },
          ]}
        >
          <AppSymbol name="barcode.viewfinder" color={colors.tint} size={20} />
          <Text style={[styles.outlineButtonText, { color: colors.tint }]}>
            Scanner un produit
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setCapturedImageUri(null);
            setRecognizedText('');
            openManualForm();
          }}
          style={styles.secondaryAction}
        >
          <Text style={[styles.secondaryActionText, { color: colors.tint }]}>
            Ajouter manuellement
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function scannerHighlightsFromText(
  lines: RecognizedProductTextLine[],
  image: ScannerSize,
  viewport: ScannerSize,
  tone: ScannerHighlight['tone'],
): ScannerHighlight[] {
  const occurrences = new Map<string, number>();

  return lines.flatMap((line) => {
    const rect = visionHighlightRect(line, image, viewport);
    if (!rect) return [];

    const normalizedText = normalizeProductText(line.text) || 'text';
    const occurrence = occurrences.get(normalizedText) ?? 0;
    occurrences.set(normalizedText, occurrence + 1);
    return [
      {
        id: `text-${normalizedText}-${occurrence}`,
        rect,
        tone,
      },
    ];
  });
}

function ScannerHighlightBox({
  highlight,
  reduceMotion,
}: {
  highlight: ScannerHighlight;
  reduceMotion: boolean;
}) {
  const values = useRef({
    height: new Animated.Value(highlight.rect.height),
    left: new Animated.Value(highlight.rect.left),
    opacity: new Animated.Value(
      reduceMotion || highlight.tone === 'confirmed' ? 1 : 0,
    ),
    top: new Animated.Value(highlight.rect.top),
    width: new Animated.Value(highlight.rect.width),
  }).current;

  useEffect(() => {
    const nextValues = [
      [values.left, highlight.rect.left],
      [values.top, highlight.rect.top],
      [values.width, highlight.rect.width],
      [values.height, highlight.rect.height],
      [values.opacity, 1],
    ] as const;

    if (reduceMotion) {
      nextValues.forEach(([value, next]) => value.setValue(next));
      return;
    }

    Animated.parallel(
      nextValues.map(([value, toValue]) =>
        Animated.timing(value, {
          duration: 180,
          toValue,
          useNativeDriver: false,
        }),
      ),
    ).start();
  }, [highlight.rect, reduceMotion, values]);

  const confirmed = highlight.tone === 'confirmed';
  return (
    <Animated.View
      testID={`scanner-highlight-${highlight.id}`}
      style={[
        styles.scannerHighlight,
        {
          backgroundColor: confirmed
            ? 'rgba(10, 124, 145, 0.28)'
            : 'rgba(10, 124, 145, 0.16)',
          height: values.height,
          left: values.left,
          opacity: values.opacity,
          top: values.top,
          width: values.width,
        },
      ]}
    >
      <View
        testID={`scanner-highlight-${highlight.id}-inner`}
        style={styles.scannerHighlightInner}
      />
    </Animated.View>
  );
}

export function ScannerScreen({
  detectedIdentifier,
  initialMode,
  onCancel,
  onScanned,
  onCaptured,
  onManual,
}: {
  detectedIdentifier: string | null;
  initialMode: ScannerMode;
  onCancel: () => void;
  onScanned: (value: string) => void;
  onCaptured: (uri: string, recognized: RecognizedPackagingText) => void;
  onManual: (recognized?: RecognizedPackagingText) => void;
}) {
  const colors = Colors;
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const recognitionAvailable = isOnDeviceTextRecognitionAvailable();
  const liveScannerSupported = isLiveDataScannerSupported();
  const [cameraReady, setCameraReady] = useState(false);
  const [scanMode, setScanMode] = useState<ScannerMode>(initialMode);
  const [barcodeProbeAttempts, setBarcodeProbeAttempts] = useState(0);
  const [lockStage, setLockStage] = useState<AutoCaptureLockStage>(0);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [liveScannerFailed, setLiveScannerFailed] = useState(false);
  const [liveHighlightedItemIds, setLiveHighlightedItemIds] = useState<
    string[]
  >([]);
  const [liveConfirmed, setLiveConfirmed] = useState(false);
  const [liveCapture, setLiveCapture] =
    useState<RecognizedPackagingText | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [previewSize, setPreviewSize] = useState<ScannerSize>({
    height: 0,
    width: 0,
  });
  const [highlights, setHighlights] = useState<ScannerHighlight[]>([]);
  const busyRef = useRef(false);
  const initialModeRef = useRef(initialMode);
  const liveCaptureStartedRef = useRef(false);
  const latestLiveItemsRef = useRef<LiveDataScannerItem[]>([]);
  const scanModeRef = useRef<ScannerMode>(initialMode);
  const guidanceOpacity = useRef(new Animated.Value(1)).current;
  const identifierLockRef = useRef(emptyAutoCaptureIdentifierLock);
  const latestRecognizedRef = useRef<RecognizedPackagingText | null>(null);
  const lockRef = useRef(emptyAutoCaptureLock);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const useLiveScanner = liveScannerSupported && !liveScannerFailed;

  useEffect(() => {
    if (initialModeRef.current === initialMode) return;
    initialModeRef.current = initialMode;
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    busyRef.current = false;
    liveCaptureStartedRef.current = false;
    latestLiveItemsRef.current = [];
    latestRecognizedRef.current = null;
    identifierLockRef.current = emptyAutoCaptureIdentifierLock;
    lockRef.current = emptyAutoCaptureLock;
    scanModeRef.current = initialMode;
    setBarcodeProbeAttempts(0);
    setCaptureError(null);
    setHighlights([]);
    setLiveCapture(null);
    setLiveConfirmed(false);
    setLiveHighlightedItemIds([]);
    setLockStage(0);
    setScanMode(initialMode);
  }, [initialMode]);

  const barcodeGuidance = barcodeGuidanceStage(barcodeProbeAttempts);
  const guidanceKey =
    scanMode === 'barcode'
      ? lockStage === 3
        ? 'barcode-success'
        : barcodeGuidance
      : `front-${lockStage}`;

  const finishIdentifierScan = useCallback(
    (value: string, nextHighlights: ScannerHighlight[]) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setHighlights(
        nextHighlights.map((highlight) => ({
          ...highlight,
          tone: 'confirmed',
        })),
      );
      setLockStage(3);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      successTimerRef.current = setTimeout(
        () => onScanned(value),
        SCAN_SUCCESS_HOLD_MS,
      );
    },
    [onScanned],
  );

  const finishProductScan = useCallback(
    (
      uri: string,
      recognized: RecognizedPackagingText,
      nextHighlights: ScannerHighlight[],
    ) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setHighlights(
        nextHighlights.map((highlight) => ({
          ...highlight,
          tone: 'confirmed',
        })),
      );
      setLockStage(3);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      successTimerRef.current = setTimeout(
        () => onCaptured(uri, recognized),
        SCAN_SUCCESS_HOLD_MS,
      );
    },
    [onCaptured],
  );

  const finishLiveProductScan = useCallback(
    (recognized: RecognizedPackagingText, itemIds: string[]) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setLiveHighlightedItemIds(itemIds);
      setLiveConfirmed(true);
      setLockStage(3);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      successTimerRef.current = setTimeout(() => {
        setCameraReady(false);
        setLiveCapture(recognized);
      }, SCAN_SUCCESS_HOLD_MS);
    },
    [],
  );

  const fallBackFromLiveCapture = useCallback(() => {
    busyRef.current = false;
    liveCaptureStartedRef.current = false;
    lockRef.current = emptyAutoCaptureLock;
    setLiveCapture(null);
    setLiveConfirmed(false);
    setLiveHighlightedItemIds([]);
    setLiveScannerFailed(true);
    setLockStage(0);
    setCaptureError(
      'La photo automatique reprend avec le scan standard. Garde le produit dans le cadre.',
    );
  }, []);

  useEffect(
    () => () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!liveCapture || !cameraReady || liveCaptureStartedRef.current) return;

    let cancelled = false;
    liveCaptureStartedRef.current = true;
    const wait = (duration: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, duration));
    const capture = async () => {
      await wait(CAMERA_HANDOFF_SETTLE_MS);
      for (let attempt = 0; attempt < CAMERA_CAPTURE_ATTEMPTS; attempt += 1) {
        if (cancelled) return;
        try {
          const photo = await cameraRef.current?.takePictureAsync({
            quality: 0.66,
            shutterSound: false,
            skipProcessing: false,
          });
          if (cancelled) return;
          if (!photo?.uri) throw new Error('capture_unavailable');
          onCaptured(photo.uri, liveCapture);
          return;
        } catch {
          if (attempt < CAMERA_CAPTURE_ATTEMPTS - 1) {
            await wait(CAMERA_CAPTURE_RETRY_MS);
          }
        }
      }
      if (!cancelled) fallBackFromLiveCapture();
    };
    void capture();

    return () => {
      cancelled = true;
    };
  }, [cameraReady, fallBackFromLiveCapture, liveCapture, onCaptured]);

  useEffect(() => {
    if (!liveCapture || cameraReady) return;
    const timer = setTimeout(fallBackFromLiveCapture, CAMERA_READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [cameraReady, fallBackFromLiveCapture, liveCapture]);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      guidanceOpacity.setValue(1);
      return;
    }
    guidanceOpacity.setValue(0.35);
    Animated.timing(guidanceOpacity, {
      duration: 180,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [guidanceKey, guidanceOpacity, reduceMotion]);

  const handleLiveItemsChanged = useCallback(
    (event: { nativeEvent: { items: LiveDataScannerItem[] } }) => {
      if (busyRef.current) return;
      const items = event.nativeEvent.items;
      latestLiveItemsRef.current = items;

      if (scanModeRef.current === 'barcode') {
        const barcode = items.find(
          (item) => item.kind === 'barcode' && item.value.trim(),
        );
        if (barcode) {
          setLiveHighlightedItemIds([barcode.id]);
          setLiveConfirmed(true);
          finishIdentifierScan(barcode.value.trim(), []);
          return;
        }

        const evidence = liveTextEvidence(items);
        const identifier = extractValidGtin(evidence.text);
        const strongIdentifier = extractStrongPrintedGtin(
          evidence.observations,
        );
        const selected = identifierHighlightLines(
          strongIdentifier ?? identifier ?? '',
          evidence.observations,
        );
        const selectedItemIds = itemIdsForSelectedObservations(
          evidence,
          selected,
        );
        setLiveHighlightedItemIds((current) =>
          current.length === selectedItemIds.length &&
          current.every((id, index) => id === selectedItemIds[index])
            ? current
            : selectedItemIds,
        );
        return;
      }

      const evidence = liveTextEvidence(items);
      const recognized: RecognizedPackagingText = {
        lines: evidence.lines,
        observations: evidence.observations,
        text: evidence.text,
      };
      latestRecognizedRef.current = recognized;
      const identity = productLookupTextFromRecognizedText(
        recognized.text,
        recognized.observations ?? recognized.lines,
      );
      const selected = recognizedTextHighlightLines(
        identity,
        evidence.observations,
      );
      const selectedItemIds = itemIdsForSelectedObservations(
        evidence,
        selected,
      );
      setLiveHighlightedItemIds((current) =>
        current.length === selectedItemIds.length &&
        current.every((id, index) => id === selectedItemIds[index])
          ? current
          : selectedItemIds,
      );
    },
    [finishIdentifierScan],
  );

  const evaluateLiveItems = useCallback(() => {
    if (busyRef.current) return;
    const evidence = liveTextEvidence(latestLiveItemsRef.current);

    if (scanModeRef.current === 'barcode') {
      const identifier = extractValidGtin(evidence.text);
      const strongIdentifier = extractStrongPrintedGtin(evidence.observations);
      const identifierLock = advanceAutoCaptureIdentifierLock(
        identifierLockRef.current,
        identifier,
      );
      identifierLockRef.current = identifierLock;
      if (strongIdentifier || identifierLock.observations === 2) {
        const value = strongIdentifier ?? identifierLock.value;
        setLiveConfirmed(true);
        finishIdentifierScan(value, []);
      }
      return;
    }

    const recognized: RecognizedPackagingText = {
      lines: evidence.lines,
      observations: evidence.observations,
      text: evidence.text,
    };
    latestRecognizedRef.current = recognized;
    const identity = productLookupTextFromRecognizedText(
      recognized.text,
      recognized.observations ?? recognized.lines,
    );
    const selected = recognizedTextHighlightLines(
      identity,
      evidence.observations,
    );
    const selectedItemIds = itemIdsForSelectedObservations(evidence, selected);
    const confirmedItemIds = selectedItemIds.length
      ? selectedItemIds
      : [...new Set(evidence.itemIds)];
    const previous = lockRef.current;
    const next = advanceAutoCaptureLock(previous, identity || evidence.text);
    lockRef.current = next;
    setLockStage(next.stage);
    if (next.stage > 0 && next.stage !== previous.stage) {
      if (next.stage === 1) void Haptics.selectionAsync();
      if (next.stage === 2) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
    if (next.stage === 3) {
      finishLiveProductScan(recognized, confirmedItemIds);
    }
  }, [finishIdentifierScan, finishLiveProductScan]);

  useEffect(() => {
    if (!useLiveScanner || !isFocused) return;
    const timer = setInterval(evaluateLiveItems, LIVE_SCANNER_EVALUATION_MS);
    return () => clearInterval(timer);
  }, [evaluateLiveItems, isFocused, useLiveScanner]);

  useEffect(() => {
    if (!useLiveScanner || scanMode !== 'barcode' || busyRef.current) return;
    const timer = setTimeout(
      () => setBarcodeProbeAttempts(5),
      LIVE_BARCODE_FALLBACK_MS,
    );
    return () => clearTimeout(timer);
  }, [scanMode, useLiveScanner]);

  useEffect(() => {
    if (
      useLiveScanner ||
      !isFocused ||
      !cameraReady ||
      !permission?.granted ||
      !recognitionAvailable
    )
      return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const hapticForStage = async (stage: AutoCaptureLockStage) => {
      if (stage === 1) await Haptics.selectionAsync();
      if (stage === 2) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    };

    const schedule = (delay = scanMode === 'barcode' ? 1800 : 1250) => {
      if (!cancelled && !busyRef.current) {
        timer = setTimeout(() => void probe(), delay);
      }
    };

    const probe = async () => {
      if (cancelled || busyRef.current) return;
      let probeUri: string | null = null;
      try {
        setCaptureError(null);
        const photo = await cameraRef.current?.takePictureAsync({
          quality: 0.66,
          shutterSound: false,
          skipProcessing: false,
        });
        if (!photo?.uri || cancelled || busyRef.current) return;
        probeUri = photo.uri;

        const recognized = await recognizePackagingText(photo.uri);
        if (cancelled || busyRef.current) return;
        latestRecognizedRef.current = recognized;
        if (scanMode === 'barcode') {
          const observations = recognized.observations ?? [];
          const identifier = extractValidGtin(recognized.text);
          const strongIdentifier = extractStrongPrintedGtin(observations);
          const identifierLock = advanceAutoCaptureIdentifierLock(
            identifierLockRef.current,
            identifier,
          );
          identifierLockRef.current = identifierLock;
          if (strongIdentifier || identifierLock.observations === 2) {
            const value = strongIdentifier ?? identifierLock.value;
            const nextHighlights = scannerHighlightsFromText(
              identifierHighlightLines(value, observations),
              { height: photo.height, width: photo.width },
              previewSize,
              'confirmed',
            );
            finishIdentifierScan(value, nextHighlights);
            return;
          }

          setBarcodeProbeAttempts((current) => Math.min(5, current + 1));
        } else {
          const observations = recognized.observations ?? [];
          const identity = productLookupTextFromRecognizedText(
            recognized.text,
            recognized.observations ?? recognized.lines,
          );
          const previous = lockRef.current;
          const next = advanceAutoCaptureLock(previous, identity);
          const nextHighlights = scannerHighlightsFromText(
            recognizedTextHighlightLines(identity, observations),
            { height: photo.height, width: photo.width },
            previewSize,
            next.stage === 3 ? 'confirmed' : 'detected',
          );
          lockRef.current = next;
          setLockStage(next.stage);
          setHighlights(next.stage > 0 ? nextHighlights : []);
          if (next.stage > 0 && next.stage !== previous.stage) {
            void hapticForStage(next.stage).catch(() => undefined);
          }

          if (next.stage === 3) {
            probeUri = null;
            finishProductScan(photo.uri, recognized, nextHighlights);
            return;
          }
        }
      } catch {
        lockRef.current = emptyAutoCaptureLock;
        setLockStage(0);
        setHighlights([]);
        setCaptureError('La lecture automatique reprendra dans un instant.');
      } finally {
        if (probeUri) {
          await FileSystem.deleteAsync(probeUri, { idempotent: true }).catch(
            () => undefined,
          );
        }
        schedule();
      }
    };

    schedule(900);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    cameraReady,
    finishIdentifierScan,
    finishProductScan,
    isFocused,
    permission?.granted,
    previewSize,
    recognitionAvailable,
    scanMode,
    useLiveScanner,
  ]);

  const handleBarcode = (result: BarcodeScanningResult) => {
    if (scanModeRef.current !== 'barcode' || busyRef.current) return;
    const rect = barcodeHighlightRect(result, previewSize);
    finishIdentifierScan(
      result.data,
      rect
        ? [
            {
              id: `code-${result.type}`,
              rect,
              tone: 'confirmed',
            },
          ]
        : [],
    );
  };

  useEffect(() => {
    if (
      !recognitionAvailable ||
      scanMode !== 'barcode' ||
      barcodeGuidance !== 'fallback'
    ) {
      return;
    }

    scanModeRef.current = 'front';
    identifierLockRef.current = emptyAutoCaptureIdentifierLock;
    lockRef.current = emptyAutoCaptureLock;
    setCaptureError(null);
    setLockStage(0);
    setHighlights([]);
    setLiveConfirmed(false);
    setLiveHighlightedItemIds([]);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setScanMode('front');
  }, [barcodeGuidance, recognitionAvailable, scanMode]);

  const guidance =
    scanMode === 'barcode'
      ? lockStage === 3
        ? {
            detail: 'Recherche du produit…',
            title: 'Code détecté',
          }
        : barcodeGuidance === 'seek'
          ? {
              detail: 'Barres ou chiffres : il peut être au dos ou dessous.',
              title: 'Montre le code du produit',
            }
          : barcodeGuidance === 'rotate'
            ? {
                detail:
                  'Je lis aussi les codes composés uniquement de chiffres.',
                title: 'Tourne doucement le produit',
              }
            : {
                detail: 'Montre maintenant la face avant.',
                title: 'Aucun code détecté',
              }
      : lockStage === 0
        ? detectedIdentifier
          ? {
              detail: 'Montre maintenant le nom et la marque.',
              title: 'Code détecté',
            }
          : {
              detail:
                barcodeProbeAttempts >= 5
                  ? 'Montre maintenant le nom et la marque.'
                  : 'Place le nom et la marque dans le cadre.',
              title:
                barcodeProbeAttempts >= 5
                  ? 'Aucun code détecté'
                  : 'Cadre la face avant',
            }
        : lockStage === 1
          ? {
              detail: 'Garde le produit au centre.',
              title: 'Produit détecté',
            }
          : lockStage === 2
            ? {
                detail: 'Encore un instant.',
                title: 'Reste immobile',
              }
            : { detail: 'Recherche du produit…', title: 'Produit reconnu' };

  const showScannerChoices = recognitionAvailable && scanMode === 'front';

  if (!permission)
    return <View style={[styles.scanner, { backgroundColor: colors.text }]} />;

  if (!permission.granted) {
    const canAskAgain = permission.canAskAgain !== false;
    return (
      <ScrollView
        contentContainerStyle={[
          styles.permissionScreen,
          {
            paddingBottom: insets.bottom + 32,
            paddingTop: insets.top + 32,
          },
        ]}
        style={{ backgroundColor: colors.background }}
      >
        <View
          style={[
            styles.emptyIcon,
            { backgroundColor: colors.backgroundSelected },
          ]}
        >
          <AppSymbol name="camera" color={colors.tint} size={31} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          Autoriser l’appareil photo
        </Text>
        <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
          Il lit les codes. Si tu continues avec la face avant, une version
          recadrée est envoyée à Google pour identifier le produit, puis
          supprimée.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            void (canAskAgain ? requestPermission() : Linking.openSettings())
          }
          style={[styles.primaryButton, { backgroundColor: colors.tint }]}
        >
          <Text style={styles.primaryButtonText}>
            {canAskAgain ? 'Autoriser l’appareil photo' : 'Ouvrir Réglages'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          style={styles.secondaryAction}
        >
          <Text style={[styles.secondaryActionText, { color: colors.tint }]}>
            Retour
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <View
      testID="scanner-screen"
      onLayout={({ nativeEvent }) => {
        const { height, width } = nativeEvent.layout;
        setPreviewSize((current) =>
          current.height === height && current.width === width
            ? current
            : { height, width },
        );
      }}
      style={styles.scanner}
    >
      {useLiveScanner && !liveCapture ? (
        <LiveDataScannerView
          active={isFocused}
          confirmed={liveConfirmed}
          highlightedItemIds={liveHighlightedItemIds}
          mode={scanMode}
          onError={({ nativeEvent }) => {
            setLiveScannerFailed(true);
            setLiveConfirmed(false);
            setLiveHighlightedItemIds([]);
            setCameraReady(false);
            setCaptureError(
              nativeEvent.message ||
                'Le suivi en direct est indisponible. Le scan standard prend le relais.',
            );
          }}
          onItemsChanged={handleLiveItemsChanged}
          style={StyleSheet.absoluteFill}
          testID="live-data-scanner"
        />
      ) : (
        <CameraView
          active={isFocused}
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          onCameraReady={() => setCameraReady(true)}
          barcodeScannerSettings={{
            barcodeTypes: [
              'ean13',
              'ean8',
              'upc_a',
              'upc_e',
              'code128',
              'code39',
              'code93',
              'itf14',
              'codabar',
              'datamatrix',
              'pdf417',
              'aztec',
              'qr',
            ],
          }}
          onBarcodeScanned={
            scanMode === 'barcode' && !busyRef.current
              ? handleBarcode
              : undefined
          }
          testID="camera-view"
        />
      )}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.scannerHighlights}
      >
        {highlights.map((highlight) => (
          <ScannerHighlightBox
            highlight={highlight}
            key={highlight.id}
            reduceMotion={reduceMotion}
          />
        ))}
      </View>
      <View style={[styles.scannerTop, { paddingTop: insets.top + 12 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Annuler le scan"
          onPress={onCancel}
          style={styles.scannerCancel}
        >
          <Text style={styles.scannerCancelText}>Annuler</Text>
        </Pressable>
      </View>
      <View pointerEvents="box-none" style={styles.scannerGuide}>
        <View style={styles.scanFrame} pointerEvents="none">
          {(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const).map(
            (corner) => (
              <View
                key={corner}
                style={[
                  styles.scanCorner,
                  styles[corner],
                  {
                    borderColor: lockStage === 3 ? colors.tint : colors.onTint,
                    opacity: lockStage === 0 ? 0.82 : 1,
                  },
                ]}
              />
            ),
          )}
        </View>
        <Animated.View
          style={[styles.scannerCopy, { opacity: guidanceOpacity }]}
        >
          <Text
            accessibilityLiveRegion="polite"
            style={styles.scannerInstruction}
          >
            {guidance.title}
          </Text>
          <Text style={styles.scannerDetail}>{guidance.detail}</Text>
          {recognitionAvailable && scanMode === 'front' && lockStage > 0 ? (
            <View style={styles.lockProgress}>
              {[1, 2, 3].map((stage) => (
                <View
                  key={stage}
                  style={[
                    styles.lockProgressDot,
                    {
                      backgroundColor:
                        lockStage === 3 && stage <= lockStage
                          ? colors.tint
                          : 'transparent',
                      borderColor:
                        lockStage === 3 ? colors.tint : colors.onTint,
                      opacity: stage <= lockStage ? 1 : 0.45,
                    },
                  ]}
                />
              ))}
            </View>
          ) : null}
          {showScannerChoices ? (
            <View style={styles.scannerChoices}>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  onManual(
                    scanMode === 'front'
                      ? (latestRecognizedRef.current ?? undefined)
                      : undefined,
                  )
                }
                style={styles.scannerManualAction}
              >
                <Text style={styles.scannerManualText}>Saisir le produit</Text>
              </Pressable>
            </View>
          ) : null}
        </Animated.View>
      </View>
      {!recognitionAvailable || captureError ? (
        <View
          style={[
            styles.captureArea,
            { paddingBottom: Math.max(insets.bottom + 16, 28) },
          ]}
        >
          {!recognitionAvailable || (captureError && !showScannerChoices) ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                onManual(
                  scanMode === 'front'
                    ? (latestRecognizedRef.current ?? undefined)
                    : undefined,
                )
              }
              style={styles.scannerManualAction}
            >
              <Text style={styles.scannerManualText}>Saisir le produit</Text>
            </Pressable>
          ) : null}
          {captureError ? (
            <Text style={styles.captureError} accessibilityLiveRegion="polite">
              {captureError}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function CloudConsentScreen({
  imageUri,
  onCancel,
  onContinue,
  onManual,
}: {
  imageUri: string;
  onCancel: () => void;
  onContinue: () => void;
  onManual: () => void;
}) {
  const colors = Colors;
  const insets = useSafeAreaInsets();
  const [isStarting, setIsStarting] = useState(false);
  return (
    <View style={[styles.screen, { backgroundColor: colors.cameraBackground }]}>
      <Image
        source={imageUri}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        accessibilityLabel="Produit photographié"
      />
      <View style={[StyleSheet.absoluteFill, styles.candidateCameraScrim]} />
      <View style={styles.issueLayout}>
        <View
          style={[
            styles.issueSheet,
            {
              backgroundColor: colors.background,
              paddingBottom: insets.bottom + 24,
            },
          ]}
        >
          <View
            style={[
              styles.issueIcon,
              { backgroundColor: colors.backgroundSelected },
            ]}
          >
            <AppSymbol name="hand.raised.fill" color={colors.tint} size={27} />
          </View>
          <Text style={[styles.issueTitle, { color: colors.text }]}>
            Rechercher avec la face avant ?
          </Text>
          <Text style={[styles.issueBody, { color: colors.textSecondary }]}>
            Une image recadrée sera envoyée à Google pour identifier le produit,
            puis supprimée. Elle ne sera pas ajoutée à ton catalogue.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isStarting }}
            disabled={isStarting}
            onPress={() => {
              setIsStarting(true);
              onContinue();
            }}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: colors.tint,
                opacity: pressed || isStarting ? 0.65 : 1,
              },
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {isStarting ? 'Démarrage…' : 'Continuer'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onManual}
            style={styles.secondaryAction}
          >
            <Text style={[styles.secondaryActionText, { color: colors.tint }]}>
              Saisir manuellement
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            style={styles.secondaryAction}
          >
            <Text
              style={[
                styles.secondaryActionText,
                { color: colors.textSecondary },
              ]}
            >
              Annuler
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function textSearchSource(candidate: ProductCandidate) {
  if (candidate.source === 'local') return 'Sur cet appareil';
  if (candidate.source === 'shared') return 'Catalogue partagé';
  if (candidate.source === 'open-beauty-facts') {
    return 'Open Beauty Facts · données ODbL 1.0';
  }
  return 'Source fabricant vérifiée';
}

export function ProductTextSearch({
  candidates,
  isPartial,
  isSaving,
  message,
  query,
  status,
  onCancel,
  onChangeQuery,
  onManual,
  onScan,
  onSearch,
  onSelect,
}: {
  candidates: ProductCandidate[];
  isPartial: boolean;
  isSaving: boolean;
  message: string | null;
  query: string;
  status: TextSearchStatus;
  onCancel: () => void;
  onChangeQuery: (value: string) => void;
  onManual: () => void;
  onScan: () => void;
  onSearch: () => void;
  onSelect: (candidate: ProductCandidate) => void;
}) {
  const colors = Colors;
  const insets = useSafeAreaInsets();
  const searched =
    status === 'results' || status === 'not_found' || status === 'unavailable';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.textSearchScreen,
          {
            paddingBottom: insets.bottom + 40,
            paddingTop: insets.top + 12,
          },
        ]}
      >
        <View style={styles.textSearchNavRow}>
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            style={styles.navAction}
          >
            <Text style={[styles.cancelText, { color: colors.tint }]}>
              Annuler
            </Text>
          </Pressable>
        </View>

        <View style={styles.textSearchIntro}>
          <Text style={[styles.candidateTitle, { color: colors.text }]}>
            Trouver un produit
          </Text>
          <Text style={[styles.formIntro, { color: colors.textSecondary }]}>
            Saisis son nom, sa marque ou les deux. Ajoute la variante exacte,
            comme SPF 30 ou 10 %, si elle apparaît sur l’emballage.
          </Text>
        </View>

        <View style={styles.textSearchField}>
          <TextInput
            accessibilityLabel="Nom ou marque du produit"
            autoCapitalize="words"
            autoCorrect={false}
            clearButtonMode="while-editing"
            editable={status !== 'loading'}
            onChangeText={onChangeQuery}
            onSubmitEditing={onSearch}
            placeholder="Ex. CeraVe nettoyant moussant"
            placeholderTextColor={colors.textSecondary}
            returnKeyType="search"
            style={[
              styles.textSearchInput,
              {
                borderColor:
                  status === 'invalid' ? colors.error : colors.separator,
                color: colors.text,
              },
            ]}
            value={query}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              busy: status === 'loading',
              disabled: status === 'loading',
            }}
            disabled={status === 'loading'}
            onPress={onSearch}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: colors.tint,
                opacity: pressed || status === 'loading' ? 0.65 : 1,
              },
            ]}
          >
            <AppSymbol name="magnifyingglass" color={colors.onTint} size={20} />
            <Text style={styles.primaryButtonText}>
              {status === 'loading' ? 'Recherche…' : 'Rechercher'}
            </Text>
          </Pressable>
        </View>

        {status === 'invalid' ? (
          <Text accessibilityRole="alert" style={styles.errorText}>
            Saisis au moins deux caractères.
          </Text>
        ) : null}

        {status === 'loading' ? (
          <View accessibilityLiveRegion="polite" style={styles.loadingBlock}>
            <ActivityIndicator color={colors.tint} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Recherche sur cet appareil, puis dans les catalogues autorisés…
            </Text>
          </View>
        ) : null}

        {message ? <Notice message={message} /> : null}

        {status === 'results' ? (
          <View style={styles.textSearchResults}>
            <View style={styles.textSearchResultsHeader}>
              <Text style={[styles.detailSectionTitle, { color: colors.text }]}>
                Choisis le bon produit
              </Text>
              <Text
                style={[
                  styles.detailSupportingText,
                  { color: colors.textSecondary },
                ]}
              >
                {candidates.length} résultat{candidates.length > 1 ? 's' : ''}.
                Aucun choix incertain n’est fait automatiquement.
              </Text>
            </View>
            {isPartial ? (
              <Notice message="Résultats partiels : une source en ligne est indisponible." />
            ) : null}
            <View>
              {candidates.map((candidate) => (
                <Pressable
                  key={`${candidate.source}:${candidate.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Ouvrir ${[candidate.brand, candidate.name].filter(Boolean).join(' ')}`}
                  accessibilityState={{ disabled: isSaving }}
                  disabled={isSaving}
                  onPress={() => onSelect(candidate)}
                  style={({ pressed }) => [
                    styles.textSearchResult,
                    {
                      borderColor: colors.separator,
                      opacity: pressed || isSaving ? 0.65 : 1,
                    },
                  ]}
                >
                  {candidate.imageUrl ? (
                    <Image
                      source={candidate.imageUrl}
                      style={styles.rowImage}
                      contentFit="contain"
                      accessible={false}
                    />
                  ) : (
                    <View
                      style={[
                        styles.rowImage,
                        { backgroundColor: colors.backgroundSelected },
                      ]}
                    >
                      <AppSymbol
                        name="drop"
                        color={colors.textSecondary}
                        size={22}
                      />
                    </View>
                  )}
                  <View style={styles.productCopy}>
                    <Text style={[styles.productName, { color: colors.text }]}>
                      {candidate.name}
                    </Text>
                    <Text
                      style={[
                        styles.productMeta,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {[candidate.brand, candidate.category]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    <Text
                      style={[
                        styles.candidateSource,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {textSearchSource(candidate)}
                      {candidate.imageLicense
                        ? ` · image ${candidate.imageLicense}`
                        : ''}
                    </Text>
                  </View>
                  <AppSymbol
                    name="chevron.right"
                    color={colors.textSecondary}
                    size={14}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {status === 'not_found' ? (
          <View
            accessibilityLiveRegion="polite"
            style={styles.searchEmptyState}
          >
            <View
              style={[
                styles.emptyIcon,
                { backgroundColor: colors.backgroundSelected },
              ]}
            >
              <AppSymbol name="magnifyingglass" color={colors.tint} size={28} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Aucun produit trouvé
            </Text>
            <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
              Vérifie l’orthographe ou précise la marque et la variante.
              {isPartial
                ? ' Une source en ligne est temporairement indisponible.'
                : ''}
            </Text>
          </View>
        ) : null}

        {status === 'unavailable' ? (
          <View
            accessibilityLiveRegion="polite"
            style={styles.searchEmptyState}
          >
            <View
              style={[
                styles.emptyIcon,
                { backgroundColor: colors.backgroundSelected },
              ]}
            >
              <AppSymbol name="wifi.slash" color={colors.tint} size={28} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Recherche en ligne indisponible
            </Text>
            <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
              Réessaie plus tard, scanne l’emballage ou saisis le produit à la
              main.
            </Text>
          </View>
        ) : null}

        {searched ? (
          <View style={styles.searchFallbackActions}>
            <Pressable
              accessibilityRole="button"
              onPress={onScan}
              style={({ pressed }) => [
                styles.outlineButton,
                {
                  borderColor: colors.separator,
                  opacity: pressed ? 0.65 : 1,
                },
              ]}
            >
              <AppSymbol
                name="barcode.viewfinder"
                color={colors.tint}
                size={20}
              />
              <Text style={[styles.outlineButtonText, { color: colors.tint }]}>
                Scanner le produit
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onManual}
              style={styles.secondaryAction}
            >
              <Text
                style={[styles.secondaryActionText, { color: colors.tint }]}
              >
                Saisir manuellement
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function RecognitionProgress({
  imageUri,
  mode,
  onCancel,
}: {
  imageUri: string | null;
  mode: 'local' | 'web';
  onCancel: () => void;
}) {
  const colors = Colors;
  const insets = useSafeAreaInsets();
  if (imageUri) {
    return (
      <View
        accessibilityLiveRegion="polite"
        style={[styles.screen, { backgroundColor: colors.cameraBackground }]}
      >
        <Image
          source={imageUri}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessibilityLabel="Photo du produit en cours d’analyse"
        />
        <View style={[StyleSheet.absoluteFill, styles.progressCameraScrim]} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Annuler la recherche"
          onPress={onCancel}
          style={[styles.issueCancel, { top: insets.top + 8 }]}
        >
          <Text style={styles.scannerCancelText}>Annuler</Text>
        </Pressable>
        <View
          style={[
            styles.progressCameraStatus,
            { paddingBottom: insets.bottom + 32 },
          ]}
        >
          <ActivityIndicator color={colors.onTint} size="large" />
          <Text style={styles.progressCameraTitle}>
            {mode === 'web'
              ? 'Recherche de la fiche complète…'
              : 'Lecture du produit…'}
          </Text>
          <Text style={styles.progressCameraBody}>
            {mode === 'web'
              ? 'Skincare ne conserve pas la photo transmise.'
              : 'La première lecture reste sur cet appareil.'}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <ScrollView
      contentContainerStyle={[
        styles.progressScreen,
        {
          paddingBottom: insets.bottom + 32,
          paddingTop: insets.top + 48,
        },
      ]}
      accessibilityLiveRegion="polite"
      style={{ backgroundColor: colors.background }}
    >
      <ActivityIndicator color={colors.tint} size="large" />
      <Text style={[styles.progressTitle, { color: colors.text }]}>
        {mode === 'web'
          ? 'Recherche de correspondances…'
          : 'Lecture du produit…'}
      </Text>
      <Text style={[styles.progressBody, { color: colors.textSecondary }]}>
        {mode === 'web'
          ? 'La photo recadrée est envoyée à Google, puis supprimée.'
          : 'Lecture locale avant la recherche en ligne.'}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onCancel}
        style={styles.secondaryAction}
      >
        <Text style={[styles.secondaryActionText, { color: colors.tint }]}>
          Annuler
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function RecognitionIssueScreen({
  imageUri,
  issue,
  onCancel,
  onManual,
  onRetry,
}: {
  imageUri: string | null;
  issue: RecognitionIssue;
  onCancel: () => void;
  onManual: () => void;
  onRetry: () => void;
}) {
  const colors = Colors;
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { backgroundColor: colors.cameraBackground }]}>
      {imageUri ? (
        <Image
          source={imageUri}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessibilityLabel="Produit photographié"
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, styles.candidateCameraScrim]} />
      <Pressable
        accessibilityRole="button"
        onPress={onCancel}
        style={[styles.issueCancel, { top: insets.top + 8 }]}
      >
        <Text style={styles.scannerCancelText}>Annuler</Text>
      </Pressable>
      <View style={styles.issueLayout}>
        <View
          accessibilityLiveRegion="assertive"
          style={[
            styles.issueSheet,
            {
              backgroundColor: colors.background,
              paddingBottom: insets.bottom + 24,
            },
          ]}
        >
          <View
            style={[
              styles.issueIcon,
              { backgroundColor: colors.backgroundSelected },
            ]}
          >
            <AppSymbol
              name="exclamationmark.circle"
              color={colors.tint}
              size={28}
            />
          </View>
          <Text style={[styles.issueTitle, { color: colors.text }]}>
            {issue.title}
          </Text>
          <Text style={[styles.issueBody, { color: colors.textSecondary }]}>
            {issue.message}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: colors.tint,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={styles.primaryButtonText}>Réessayer</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onManual}
            style={styles.secondaryAction}
          >
            <Text style={[styles.secondaryActionText, { color: colors.tint }]}>
              Saisir manuellement
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function CandidateSelection({
  backgroundImageUri,
  candidates,
  isSaving = false,
  message,
  reportingCandidateId,
  onCancel,
  onConfirm,
  onManual,
  onWrongGuess,
}: {
  backgroundImageUri: string | null;
  candidates: ProductCandidate[];
  isSaving?: boolean;
  message: string | null;
  reportingCandidateId: string | null;
  onCancel: () => void;
  onConfirm: (candidate: ProductCandidate) => void;
  onManual: () => void;
  onWrongGuess: (candidate: ProductCandidate) => void;
}) {
  const colors = Colors;
  const insets = useSafeAreaInsets();
  const overCamera = Boolean(backgroundImageUri);
  const decisive = hasDecisiveCandidate(candidates);
  const visibleCandidates = decisive ? candidates.slice(0, 1) : candidates;
  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: overCamera
            ? colors.cameraBackground
            : colors.background,
        },
      ]}
    >
      {backgroundImageUri ? (
        <>
          <Image
            source={backgroundImageUri}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityLabel="Produit photographié"
          />
          <View
            style={[StyleSheet.absoluteFill, styles.candidateCameraScrim]}
          />
        </>
      ) : null}
      <ScrollView
        contentContainerStyle={[
          styles.candidateScreen,
          overCamera
            ? [
                styles.candidateCameraScreen,
                { backgroundColor: colors.background },
              ]
            : null,
          {
            paddingBottom: insets.bottom + 48,
            paddingTop: insets.top + 12,
          },
        ]}
      >
        <View style={styles.navRow}>
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            style={styles.navAction}
          >
            <Text style={[styles.cancelText, { color: colors.tint }]}>
              Annuler
            </Text>
          </Pressable>
          <Text style={[styles.navTitle, { color: colors.text }]}>
            Résultats
          </Text>
          <View style={styles.navBalance} />
        </View>
        <View style={styles.recognizedStatus}>
          <AppSymbol
            name="checkmark.circle.fill"
            color={colors.tint}
            size={20}
          />
          <Text style={[styles.recognizedStatusText, { color: colors.tint }]}>
            {decisive ? 'Correspondance fiable' : 'Produit reconnu'}
          </Text>
        </View>
        <Text style={[styles.candidateTitle, { color: colors.text }]}>
          {decisive ? 'Produit trouvé' : 'Quel est le bon produit ?'}
        </Text>
        <Text style={[styles.formIntro, { color: colors.textSecondary }]}>
          {decisive
            ? 'Vérifie une dernière fois avant d’ouvrir la fiche.'
            : 'Choisis une suggestion pour ouvrir sa fiche.'}
        </Text>
        {message ? <Notice message={message} /> : null}
        <View style={styles.candidateList}>
          {visibleCandidates.map((candidate) => (
            <View
              key={candidate.id}
              style={[styles.candidateRow, { borderColor: colors.separator }]}
            >
              <View style={styles.candidateMain}>
                {candidate.imageUrl ? (
                  <Image
                    source={candidate.imageUrl}
                    style={styles.rowImage}
                    contentFit="contain"
                    accessible={false}
                  />
                ) : (
                  <View
                    style={[
                      styles.rowImage,
                      { backgroundColor: colors.backgroundSelected },
                    ]}
                  >
                    <AppSymbol
                      name="drop"
                      color={colors.textSecondary}
                      size={22}
                    />
                  </View>
                )}
                <View style={styles.productCopy}>
                  <Text style={[styles.productName, { color: colors.text }]}>
                    {candidate.name}
                  </Text>
                  <Text
                    style={[
                      styles.productMeta,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {[candidate.brand, candidate.category]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {candidate.imageSource ? (
                    <Text
                      style={[
                        styles.candidateSource,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {candidate.source === 'google-web'
                        ? `Google · image ${candidate.imageSource}${candidate.imageLicense ? ` · ${candidate.imageLicense}` : ''}`
                        : `Image ${candidate.imageSource}${candidate.imageLicense ? ` · ${candidate.imageLicense}` : ''}`}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Confirmer ${[candidate.brand, candidate.name].filter(Boolean).join(' ')}`}
                accessibilityState={{ disabled: isSaving }}
                disabled={isSaving}
                onPress={() => onConfirm(candidate)}
                style={({ pressed }) => [
                  styles.candidateConfirm,
                  {
                    backgroundColor: colors.tint,
                    opacity: pressed || isSaving ? 0.65 : 1,
                  },
                ]}
              >
                <Text style={styles.candidateConfirmText}>
                  {isSaving
                    ? 'Ouverture…'
                    : decisive
                      ? 'Voir la fiche'
                      : 'C’est ce produit'}
                </Text>
              </Pressable>
              {candidate.source === 'shared' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Signaler que ${[candidate.brand, candidate.name].filter(Boolean).join(' ')} n’est pas le bon produit`}
                  disabled={reportingCandidateId === candidate.id}
                  onPress={() => onWrongGuess(candidate)}
                  style={styles.wrongGuessAction}
                >
                  <Text style={[styles.wrongGuessText, { color: colors.tint }]}>
                    {reportingCandidateId === candidate.id
                      ? 'Signalement…'
                      : 'Ce n’est pas le bon produit'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onManual}
          style={styles.secondaryAction}
        >
          <Text style={[styles.secondaryActionText, { color: colors.tint }]}>
            Aucun de ces produits
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function ProductForm({
  draft,
  previewImageUri,
  isLookingUp,
  isEnriching,
  isSaving,
  message,
  error,
  onChange,
  onCancel,
  onSave,
}: {
  draft: ProductDraft;
  previewImageUri: string | null;
  isLookingUp: boolean;
  isEnriching: boolean;
  isSaving: boolean;
  message: string | null;
  error: string | null;
  onChange: (key: keyof ProductDraft, value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const colors = Colors;
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[
          styles.form,
          {
            paddingBottom: insets.bottom + 48,
            paddingTop: insets.top + 12,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.navRow}>
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            style={styles.navAction}
          >
            <Text style={[styles.cancelText, { color: colors.tint }]}>
              Annuler
            </Text>
          </Pressable>
          <Text style={[styles.navTitle, { color: colors.text }]}>
            Vérifier le produit
          </Text>
          <View style={styles.navBalance} />
        </View>
        <Text style={[styles.formIntro, { color: colors.textSecondary }]}>
          Vérifie les informations avant d’ajouter ce produit.
        </Text>
        {isLookingUp || isEnriching ? (
          <View style={styles.lookupRow}>
            <ActivityIndicator color={colors.tint} />
            <Text style={[styles.lookupText, { color: colors.textSecondary }]}>
              {isEnriching
                ? 'Ajout de la photo et des ingrédients…'
                : 'Recherche du produit…'}
            </Text>
          </View>
        ) : null}
        {message ? <Notice message={message} /> : null}
        {previewImageUri ? (
          <View style={styles.productImageBlock}>
            <Image
              source={previewImageUri}
              style={[
                styles.productImage,
                { backgroundColor: colors.backgroundSelected },
              ]}
              contentFit="contain"
              accessibilityLabel="Photo normalisée du produit"
            />
            {draft.imageSource ? (
              <Text
                style={[styles.imageCredit, { color: colors.textSecondary }]}
              >
                Image : {draft.imageSource}
                {draft.imageLicense ? ` · ${draft.imageLicense}` : ''}
              </Text>
            ) : null}
          </View>
        ) : (
          <View
            style={[
              styles.productImage,
              styles.imagePlaceholder,
              { backgroundColor: colors.backgroundSelected },
            ]}
          >
            <AppSymbol name="drop" color={colors.textSecondary} size={34} />
          </View>
        )}
        <ProductField
          label="Nom du produit"
          value={draft.name}
          onChangeText={(value) => onChange('name', value)}
          autoFocus={!isLookingUp && !draft.name}
          required
        />
        <ProductField
          label="Marque"
          value={draft.brand}
          onChangeText={(value) => onChange('brand', value)}
        />
        <CategoryField
          value={draft.category}
          onChange={(value) => onChange('category', value)}
        />
        {draft.barcode ? (
          <View style={[styles.barcodeRow, { borderColor: colors.separator }]}>
            <AppSymbol name="barcode" color={colors.textSecondary} size={22} />
            <Text style={[styles.barcodeText, { color: colors.text }]}>
              {draft.barcode}
            </Text>
          </View>
        ) : null}
        <IngredientsSection draft={draft} />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={isSaving || isLookingUp}
          onPress={onSave}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: colors.tint,
              opacity: pressed || isSaving || isLookingUp ? 0.65 : 1,
            },
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {isSaving ? 'Enregistrement…' : 'Ajouter à mes produits'}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function IngredientsSection({ draft }: { draft: ProductDraft }) {
  const colors = Colors;
  const [expanded, setExpanded] = useState(false);
  const ingredients = parseIngredientList(draft.ingredientsText);
  const hasIngredients = ingredients.length > 0;

  return (
    <View
      style={[styles.ingredientsSection, { borderColor: colors.separator }]}
    >
      <View style={styles.ingredientsHeader}>
        <View
          style={[
            styles.ingredientsIcon,
            { backgroundColor: colors.backgroundSelected },
          ]}
        >
          <AppSymbol
            name={hasIngredients ? 'checkmark' : 'list.bullet'}
            color={colors.tint}
            size={18}
          />
        </View>
        <View style={styles.productCopy}>
          <Text style={[styles.productName, { color: colors.text }]}>
            {hasIngredients
              ? `${ingredients.length} ingrédients trouvés`
              : 'Ingrédients non disponibles'}
          </Text>
          <Text style={[styles.productMeta, { color: colors.textSecondary }]}>
            {hasIngredients
              ? `Source : ${draft.ingredientsSource || 'à vérifier'}`
              : 'Aucune liste fiable trouvée sur les sources vérifiées.'}
          </Text>
        </View>
      </View>
      {hasIngredients || expanded ? (
        <>
          {hasIngredients ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setExpanded((current) => !current)}
              style={styles.inlineAction}
            >
              <Text style={[styles.inlineActionText, { color: colors.tint }]}>
                {expanded ? 'Masquer la liste' : 'Voir la liste structurée'}
              </Text>
            </Pressable>
          ) : null}
          {expanded ? (
            <View accessibilityLabel="Liste structurée des ingrédients">
              {ingredients.map((ingredient) => (
                <View
                  key={`${ingredient.position}-${ingredient.normalizedName}`}
                  style={[
                    styles.ingredientRow,
                    { borderColor: colors.separator },
                  ]}
                >
                  <Text
                    style={[
                      styles.ingredientPosition,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {ingredient.position + 1}
                  </Text>
                  <Text style={[styles.ingredientName, { color: colors.text }]}>
                    {ingredient.name}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <Text style={[styles.ingredientHelp, { color: colors.textSecondary }]}>
          Tu peux ajouter le produit maintenant. La fiche sera enrichie dès
          qu’une source fiable sera trouvée.
        </Text>
      )}
    </View>
  );
}

function ProductField({
  label,
  value,
  onChangeText,
  autoFocus,
  required,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  autoFocus?: boolean;
  required?: boolean;
}) {
  const colors = Colors;
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
        {label}
        {required ? ' *' : ''}
      </Text>
      <TextInput
        accessibilityLabel={label}
        autoFocus={autoFocus}
        value={value}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor={colors.textSecondary}
        style={[
          styles.fieldInput,
          { borderColor: colors.separator, color: colors.text },
        ]}
      />
    </View>
  );
}

function CategoryField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const colors = Colors;
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => subscription.remove();
  }, []);

  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
        Catégorie *
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choisir une catégorie"
        accessibilityValue={{ text: value || 'Aucune catégorie' }}
        onPress={() => setVisible(true)}
        style={({ pressed }) => [
          styles.categoryControl,
          {
            borderColor: colors.separator,
            opacity: pressed ? 0.72 : 1,
          },
        ]}
      >
        <Text
          style={[
            styles.categoryValue,
            { color: value ? colors.text : colors.textSecondary },
          ]}
        >
          {value || 'Choisir une catégorie'}
        </Text>
        <AppSymbol
          name="chevron.up.chevron.down"
          color={colors.textSecondary}
          size={16}
        />
      </Pressable>
      <Modal
        animationType={reduceMotion ? 'none' : 'slide'}
        onRequestClose={() => setVisible(false)}
        presentationStyle="pageSheet"
        visible={visible}
      >
        <View style={[styles.screen, { backgroundColor: colors.background }]}>
          <ScrollView
            accessibilityViewIsModal
            contentContainerStyle={[
              styles.categorySheet,
              {
                paddingBottom: insets.bottom + 32,
                paddingTop: insets.top + 12,
              },
            ]}
          >
            <View style={styles.navRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setVisible(false)}
                style={styles.navAction}
              >
                <Text style={[styles.cancelText, { color: colors.tint }]}>
                  Annuler
                </Text>
              </Pressable>
              <Text style={[styles.navTitle, { color: colors.text }]}>
                Catégorie
              </Text>
              <View style={styles.navBalance} />
            </View>
            <View>
              {PRODUCT_CATEGORIES.map((category) => {
                const selected = category === value;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={category}
                    onPress={() => {
                      onChange(category);
                      setVisible(false);
                    }}
                    style={({ pressed }) => [
                      styles.categoryOption,
                      {
                        backgroundColor: selected
                          ? colors.backgroundSelected
                          : colors.background,
                        borderColor: colors.separator,
                        opacity: pressed ? 0.72 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryOptionText,
                        { color: colors.text },
                      ]}
                    >
                      {category}
                    </Text>
                    {selected ? (
                      <AppSymbol
                        name="checkmark"
                        color={colors.tint}
                        size={18}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

type EvidenceSource = {
  label: string;
  name: string;
  url: string | null;
};

function safeSourceUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function displaySourceName(value: string) {
  const knownSources: Record<string, string> = {
    curated_packaging_corpus: 'Corpus packaging vérifié',
    manufacturer_sitemap: 'Fabricant',
    open_beauty_facts: 'Open Beauty Facts',
    open_food_facts: 'Open Food Facts',
  };
  return knownSources[value] ?? value;
}

function evidenceSources(product: Product): EvidenceSource[] {
  const sources = [
    {
      label: 'Usage',
      name: product.usageText ? product.usageSource : null,
      url: product.usageSourceUrl,
    },
    {
      label: 'Précautions',
      name: product.precautionsText ? product.precautionsSource : null,
      url: product.precautionsSourceUrl,
    },
    {
      label: 'Ingrédients',
      name: product.ingredientsText ? product.ingredientsSource : null,
      url: product.ingredientsSourceUrl,
    },
    {
      label: 'Confiance',
      name: product.informationConfidence ? product.confidenceSource : null,
      url: product.confidenceSourceUrl,
    },
    {
      label: 'Image',
      name: product.imageSource,
      url: product.imageSourceUrl,
    },
  ].filter(
    (source): source is { label: string; name: string; url: string | null } =>
      Boolean(source.name),
  );

  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.label}:${source.name}:${source.url ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function SourceReference({ source }: { source: EvidenceSource }) {
  const colors = Colors;
  const url = safeSourceUrl(source.url);
  const copy = `${source.label} · ${displaySourceName(source.name)}`;
  if (!url) {
    return (
      <View style={styles.sourceReference}>
        <Text style={[styles.sourceLabel, { color: colors.textSecondary }]}>
          {copy}
        </Text>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Ouvrir la source ${source.label} : ${displaySourceName(source.name)}`}
      accessibilityHint="Ouvre le site de la source"
      onPress={() => void Linking.openURL(url)}
      style={({ pressed }) => [
        styles.sourceReference,
        { opacity: pressed ? 0.65 : 1 },
      ]}
    >
      <Text style={[styles.sourceLabel, { color: colors.tint }]}>{copy}</Text>
      <AppSymbol name="arrow.up.right" color={colors.tint} size={13} />
    </Pressable>
  );
}

function InformationSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const colors = Colors;
  return (
    <View style={[styles.detailSection, { borderColor: colors.separator }]}>
      <Text
        accessibilityRole="header"
        style={[styles.detailSectionTitle, { color: colors.text }]}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function Disclosure({
  expanded,
  label,
  onPress,
  children,
}: {
  expanded: boolean;
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const colors = Colors;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.disclosureAction,
          { opacity: pressed ? 0.65 : 1 },
        ]}
      >
        <Text style={[styles.disclosureLabel, { color: colors.tint }]}>
          {label}
        </Text>
        <AppSymbol
          name={expanded ? 'chevron.up' : 'chevron.down'}
          color={colors.tint}
          size={14}
        />
      </Pressable>
      {expanded ? children : null}
    </View>
  );
}

export function RoutineAssignmentSheet({
  product,
  visible,
  isBusy,
  onAdd,
  onClose,
}: {
  product: Product;
  visible: boolean;
  isBusy: boolean;
  onAdd: (input: {
    period: RoutinePeriod;
    selectedWeekdays: Weekday[];
  }) => void;
  onClose: () => void;
}) {
  const colors = Colors;
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<RoutinePeriod>('morning');
  const [selectedWeekdays, setSelectedWeekdays] =
    useState<Weekday[]>(allWeekdays());
  const [definitions, setDefinitions] = useState<
    Record<RoutinePeriod, RoutineDefinition | null>
  >({ morning: null, evening: null });
  const [loadError, setLoadError] = useState(false);
  const [isLoadingDefinitions, setIsLoadingDefinitions] = useState(false);
  const category = routineCategoryForProduct(product.category);
  const compatiblePlaceholder = definitions[period]?.steps.find(
    (step) => !step.productId && step.category === category,
  );
  const effectiveWeekdays =
    compatiblePlaceholder?.selectedWeekdays ?? selectedWeekdays;

  useEffect(() => {
    if (!visible) return;
    setLoadError(false);
    setIsLoadingDefinitions(true);
    void Promise.all([
      routineRepository.getRoutineForEditing('morning'),
      routineRepository.getRoutineForEditing('evening'),
    ])
      .then(([morning, evening]) => setDefinitions({ morning, evening }))
      .catch(() => setLoadError(true))
      .finally(() => setIsLoadingDefinitions(false));
    void AccessibilityInfo.announceForAccessibility(
      `Ajouter ${product.name} à une routine`,
    );
  }, [product.name, visible]);

  const toggleWeekday = (weekday: Weekday) => {
    if (compatiblePlaceholder) return;
    setSelectedWeekdays((current) =>
      current.includes(weekday)
        ? current.filter((candidate) => candidate !== weekday)
        : [...current, weekday],
    );
  };

  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <View
        style={[styles.routineSheet, { backgroundColor: colors.background }]}
      >
        <ScrollView
          contentContainerStyle={[
            styles.routineSheetContent,
            {
              paddingBottom: insets.bottom + 24,
              paddingTop: 24,
            },
          ]}
        >
          <View style={styles.routineSheetHeader}>
            <Text
              accessibilityRole="header"
              style={[styles.routineSheetTitle, { color: colors.text }]}
            >
              Ajouter à une routine
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fermer le choix de routine"
              onPress={onClose}
              style={styles.routineSheetClose}
            >
              <AppSymbol name="xmark" color={colors.tint} size={18} />
            </Pressable>
          </View>
          <Text style={[styles.routineSheetProduct, { color: colors.text }]}>
            {product.name}
          </Text>
          <Text style={[styles.formIntro, { color: colors.textSecondary }]}>
            Choisis la routine puis les jours d’utilisation.
          </Text>

          <View style={styles.routinePeriodChoices}>
            {(['morning', 'evening'] as const).map((candidate) => {
              const selected = candidate === period;
              return (
                <Pressable
                  key={candidate}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setPeriod(candidate)}
                  style={({ pressed }) => [
                    styles.routinePeriodChoice,
                    {
                      backgroundColor: selected
                        ? colors.backgroundSelected
                        : colors.background,
                      borderColor: selected ? colors.tint : colors.separator,
                      opacity: pressed ? 0.72 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[styles.routineChoiceTitle, { color: colors.text }]}
                  >
                    {candidate === 'morning' ? 'Matin' : 'Soir'}
                  </Text>
                  <Text
                    style={[styles.fieldHint, { color: colors.textSecondary }]}
                  >
                    {definitions[candidate]
                      ? routineNameForPeriod(candidate)
                      : 'Sera créée'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.routineDaysSection}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>
              Jours
            </Text>
            {compatiblePlaceholder ? (
              <Text style={[styles.fieldHint, { color: colors.textSecondary }]}>
                L’étape sans produit {category.toLocaleLowerCase('fr-FR')} sera
                remplacée. Ses jours et son instruction seront conservés.
              </Text>
            ) : null}
            <View style={styles.routineWeekdays}>
              {ROUTINE_WEEKDAYS.map((weekday) => {
                const selected = effectiveWeekdays.includes(weekday.value);
                return (
                  <Pressable
                    key={weekday.value}
                    accessibilityRole="checkbox"
                    accessibilityLabel={weekday.label}
                    accessibilityState={{
                      checked: selected,
                      disabled: Boolean(compatiblePlaceholder),
                    }}
                    disabled={Boolean(compatiblePlaceholder)}
                    onPress={() => toggleWeekday(weekday.value)}
                    style={[
                      styles.routineWeekday,
                      {
                        backgroundColor: selected
                          ? colors.tint
                          : colors.backgroundSelected,
                        opacity: compatiblePlaceholder ? 0.72 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.routineWeekdayText,
                        { color: selected ? colors.onTint : colors.text },
                      ]}
                    >
                      {weekday.short}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {loadError ? (
            <Text accessibilityLiveRegion="polite" style={styles.errorText}>
              Les routines n’ont pas pu être chargées. Tu peux quand même
              choisir une routine.
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ajouter ${product.name} à ${routineNameForPeriod(period)}`}
            accessibilityState={{
              busy: isBusy,
              disabled:
                isBusy ||
                isLoadingDefinitions ||
                effectiveWeekdays.length === 0,
            }}
            disabled={
              isBusy || isLoadingDefinitions || effectiveWeekdays.length === 0
            }
            onPress={() =>
              onAdd({ period, selectedWeekdays: effectiveWeekdays })
            }
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: colors.tint,
                opacity:
                  pressed ||
                  isBusy ||
                  isLoadingDefinitions ||
                  effectiveWeekdays.length === 0
                    ? 0.62
                    : 1,
              },
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {isBusy
                ? 'Ajout…'
                : isLoadingDefinitions
                  ? 'Chargement…'
                  : 'Ajouter à la routine'}
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

export function ProductDetail({
  product,
  isOwned,
  isEnriching = false,
  isSaving = false,
  message,
  resultContext,
  closeLabel,
  contextualAction,
  onMarkAsOwned,
  onRemoveFromCollection,
  onBack,
}: {
  product: Product;
  isOwned: boolean;
  isEnriching?: boolean;
  isSaving?: boolean;
  message: string | null;
  resultContext: ProductResultContext;
  closeLabel: string;
  contextualAction?: ProductDetailContextualAction;
  onMarkAsOwned: () => void;
  onRemoveFromCollection?: () => void;
  onBack: () => void;
}) {
  const colors = Colors;
  const insets = useSafeAreaInsets();
  const ingredients = parseIngredientList(
    product.ingredientsText && product.ingredientsSource
      ? product.ingredientsText
      : '',
  );
  const verifiedUsage =
    product.usageText && product.usageSource ? product.usageText : null;
  const verifiedPrecautions =
    product.precautionsText && product.precautionsSource
      ? product.precautionsText
      : null;
  const [ingredientsExpanded, setIngredientsExpanded] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const sources = evidenceSources(product);
  const confidence =
    product.informationConfidence && product.confidenceSource
      ? {
          high: {
            label: 'Élevée',
            detail: 'Les informations d’identité sont bien étayées.',
          },
          moderate: {
            label: 'Modérée',
            detail:
              'La source est identifiée, mais la fiche peut être incomplète.',
          },
          limited: {
            label: 'Limitée',
            detail: 'Certaines informations restent à confirmer.',
          },
        }[product.informationConfidence]
      : null;
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.form,
          { paddingBottom: insets.bottom + 48, paddingTop: insets.top + 12 },
        ]}
      >
        <View style={styles.detailNavRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            onPress={onBack}
            style={styles.detailBackAction}
          >
            <AppSymbol name="chevron.left" color={colors.tint} size={16} />
            <Text style={[styles.cancelText, { color: colors.tint }]}>
              {closeLabel}
            </Text>
          </Pressable>
          <Text style={[styles.detailNavTitle, { color: colors.text }]}>
            Produit
          </Text>
        </View>
        {product.imageUrl ? (
          <Image
            source={product.imageUrl}
            style={styles.detailImage}
            contentFit="contain"
            accessibilityLabel={`Photo de ${[product.brand, product.name].filter(Boolean).join(' ')}`}
          />
        ) : (
          <View
            accessibilityLabel="Photo indisponible"
            style={[
              styles.detailImage,
              styles.detailImagePlaceholder,
              { backgroundColor: colors.backgroundSelected },
            ]}
          >
            <AppSymbol name="photo" color={colors.textSecondary} size={32} />
            <Text style={[styles.imageCredit, { color: colors.textSecondary }]}>
              Photo indisponible
            </Text>
          </View>
        )}
        <Text
          accessibilityRole="header"
          style={[styles.candidateTitle, { color: colors.text }]}
        >
          {product.name}
        </Text>
        {product.brand ? (
          <Text style={[styles.detailBrand, { color: colors.textSecondary }]}>
            {product.brand}
          </Text>
        ) : null}
        {resultContext !== 'collection' && !isOwned ? (
          <Text style={[styles.formIntro, { color: colors.textSecondary }]}>
            Cette consultation ne modifie pas Mes produits.
          </Text>
        ) : null}
        {isEnriching ? (
          <View accessibilityLiveRegion="polite" style={styles.lookupRow}>
            <ActivityIndicator color={colors.tint} />
            <Text style={[styles.lookupText, { color: colors.textSecondary }]}>
              Photo et ingrédients en cours de récupération…
            </Text>
          </View>
        ) : null}
        {message ? <Notice message={message} /> : null}
        <InformationSection title="En bref">
          <View style={styles.detailFact}>
            <Text
              style={[styles.detailFactLabel, { color: colors.textSecondary }]}
            >
              Rôle
            </Text>
            <Text style={[styles.detailFactValue, { color: colors.text }]}>
              {product.category || 'Catégorie indisponible'}
            </Text>
          </View>
          <View style={styles.detailFact}>
            <Text
              style={[styles.detailFactLabel, { color: colors.textSecondary }]}
            >
              Usage
            </Text>
            <Text style={[styles.detailFactValue, { color: colors.text }]}>
              {verifiedUsage || 'Usage non disponible'}
            </Text>
            {verifiedUsage && product.usageSource ? (
              <Text
                style={[styles.sourceSummary, { color: colors.textSecondary }]}
              >
                Source : {displaySourceName(product.usageSource)}
              </Text>
            ) : null}
          </View>
        </InformationSection>

        <InformationSection title="Ingrédients disponibles">
          {ingredients.length ? (
            <>
              <Text
                style={[
                  styles.detailSupportingText,
                  { color: colors.textSecondary },
                ]}
              >
                {ingredients.length} ingrédient
                {ingredients.length > 1 ? 's' : ''} dans la liste INCI. L’ordre
                ne désigne pas à lui seul les ingrédients clés.
              </Text>
              {(ingredientsExpanded
                ? ingredients
                : ingredients.slice(0, 3)
              ).map((ingredient) => (
                <View
                  key={`${ingredient.position}-${ingredient.normalizedName}`}
                  style={[
                    styles.ingredientRow,
                    { borderColor: colors.separator },
                  ]}
                >
                  <Text
                    style={[
                      styles.ingredientPosition,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {ingredient.position + 1}
                  </Text>
                  <Text style={[styles.ingredientName, { color: colors.text }]}>
                    {ingredient.name}
                  </Text>
                </View>
              ))}
              {ingredients.length > 3 ? (
                <Disclosure
                  expanded={ingredientsExpanded}
                  label={
                    ingredientsExpanded
                      ? 'Masquer la liste complète'
                      : `Voir la liste complète (${ingredients.length})`
                  }
                  onPress={() => setIngredientsExpanded((current) => !current)}
                >
                  <View />
                </Disclosure>
              ) : null}
              {product.ingredientsSource ? (
                <Text
                  style={[
                    styles.sourceSummary,
                    { color: colors.textSecondary },
                  ]}
                >
                  Source : {displaySourceName(product.ingredientsSource)}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={[styles.detailFactValue, { color: colors.text }]}>
              Ingrédients indisponibles. Aucune liste fiable n’est enregistrée
              pour cette fiche.
            </Text>
          )}
        </InformationSection>

        <InformationSection title="Précautions vérifiées">
          <Text style={[styles.detailFactValue, { color: colors.text }]}>
            {verifiedPrecautions ||
              'Aucune précaution vérifiée n’est disponible pour cette fiche.'}
          </Text>
          {verifiedPrecautions && product.precautionsSource ? (
            <Text
              style={[styles.sourceSummary, { color: colors.textSecondary }]}
            >
              Source : {displaySourceName(product.precautionsSource)}
            </Text>
          ) : null}
        </InformationSection>

        <InformationSection title="Confiance des informations">
          <Text style={[styles.confidenceLabel, { color: colors.text }]}>
            {confidence
              ? `Confiance ${confidence.label.toLocaleLowerCase('fr-FR')}`
              : 'Confiance non évaluée'}
          </Text>
          <Text
            style={[
              styles.detailSupportingText,
              { color: colors.textSecondary },
            ]}
          >
            {(confidence ? product.confidenceNote : null) ||
              confidence?.detail ||
              'Le niveau de confiance n’est pas disponible pour cette fiche.'}
          </Text>
          <Text
            style={[
              styles.detailSupportingText,
              { color: colors.textSecondary },
            ]}
          >
            Ce niveau décrit la provenance des informations, pas la qualité ou
            la sécurité du produit.
          </Text>
          {confidence && product.confidenceSource ? (
            <Text
              style={[styles.sourceSummary, { color: colors.textSecondary }]}
            >
              Source : {displaySourceName(product.confidenceSource)}
            </Text>
          ) : null}
        </InformationSection>

        <InformationSection title="Provenance">
          <Disclosure
            expanded={sourcesExpanded}
            label={
              sourcesExpanded
                ? 'Masquer les sources'
                : 'Voir les sources et licences'
            }
            onPress={() => setSourcesExpanded((current) => !current)}
          >
            <View style={styles.sourceList}>
              {sources.length ? (
                sources.map((source) => (
                  <SourceReference
                    key={`${source.label}:${source.name}:${source.url ?? ''}`}
                    source={source}
                  />
                ))
              ) : (
                <Text
                  style={[
                    styles.detailSupportingText,
                    { color: colors.textSecondary },
                  ]}
                >
                  Provenance détaillée indisponible.
                </Text>
              )}
              {product.imageLicense ? (
                <Text
                  style={[
                    styles.detailSupportingText,
                    { color: colors.textSecondary },
                  ]}
                >
                  Licence de l’image : {product.imageLicense}
                </Text>
              ) : null}
            </View>
          </Disclosure>
        </InformationSection>
        {contextualAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={contextualAction.accessibilityLabel}
            accessibilityState={{
              busy: contextualAction.isBusy,
              disabled: contextualAction.isBusy,
            }}
            disabled={contextualAction.isBusy}
            onPress={contextualAction.onPress}
            style={({ pressed }) => [
              contextualAction.emphasis === 'primary'
                ? styles.primaryButton
                : styles.secondaryContextAction,
              contextualAction.emphasis === 'primary'
                ? { backgroundColor: colors.tint }
                : { borderColor: colors.separator },
              {
                opacity: pressed || contextualAction.isBusy ? 0.65 : 1,
              },
            ]}
          >
            <Text
              style={
                contextualAction.emphasis === 'primary'
                  ? styles.primaryButtonText
                  : [styles.secondaryContextActionText, { color: colors.tint }]
              }
            >
              {contextualAction.label}
            </Text>
          </Pressable>
        ) : null}
        {isOwned ? (
          <View
            accessibilityLabel="Dans Mes produits"
            style={[
              styles.ownedStatus,
              { backgroundColor: colors.backgroundSelected },
            ]}
          >
            <AppSymbol
              name="checkmark.circle.fill"
              color={colors.tint}
              size={20}
            />
            <Text style={[styles.ownedStatusText, { color: colors.text }]}>
              Dans Mes produits
            </Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Je l’ai, ajouter à Mes produits"
            accessibilityState={{ busy: isSaving, disabled: isSaving }}
            disabled={isSaving}
            onPress={onMarkAsOwned}
            style={({ pressed }) => [
              contextualAction
                ? styles.secondaryContextAction
                : styles.primaryButton,
              {
                ...(contextualAction
                  ? { borderColor: colors.separator }
                  : { backgroundColor: colors.tint }),
                opacity: pressed || isSaving ? 0.65 : 1,
              },
            ]}
          >
            <Text
              style={
                contextualAction
                  ? [styles.secondaryContextActionText, { color: colors.tint }]
                  : styles.primaryButtonText
              }
            >
              {isSaving ? 'Ajout…' : 'Je l’ai'}
            </Text>
          </Pressable>
        )}
        {isOwned && onRemoveFromCollection ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Retirer ${product.name} de Mes produits`}
            accessibilityState={{
              busy: isSaving,
              disabled: isSaving,
            }}
            disabled={isSaving}
            onPress={onRemoveFromCollection}
            style={({ pressed }) => [
              styles.removeCollectionAction,
              {
                opacity: pressed || isSaving ? 0.65 : 1,
              },
            ]}
          >
            <Text
              style={[styles.removeCollectionText, { color: colors.error }]}
            >
              Retirer de Mes produits
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ProductRow({
  product,
  onPress,
}: {
  product: Product;
  onPress: () => void;
}) {
  const colors = Colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir ${product.name}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.productRow,
        { borderColor: colors.separator, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {product.imageUrl ? (
        <Image
          source={product.imageUrl}
          style={[
            styles.rowImage,
            { backgroundColor: colors.backgroundSelected },
          ]}
          contentFit="contain"
          accessible={false}
        />
      ) : (
        <View
          style={[
            styles.rowImage,
            { backgroundColor: colors.backgroundSelected },
          ]}
        >
          <AppSymbol name="drop" color={colors.textSecondary} size={22} />
        </View>
      )}
      <View style={styles.productCopy}>
        <Text
          style={[styles.productName, { color: colors.text }]}
          numberOfLines={2}
        >
          {product.name}
        </Text>
        {product.brand || product.category ? (
          <Text
            style={[styles.productMeta, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {[product.brand, product.category].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
      <AppSymbol name="chevron.right" color={colors.textSecondary} size={14} />
    </Pressable>
  );
}

function Notice({ message }: { message: string }) {
  const colors = Colors;
  return (
    <View
      style={[styles.notice, { backgroundColor: colors.backgroundSelected }]}
    >
      <AppSymbol name="info.circle" color={colors.tint} size={19} />
      <Text style={[styles.noticeText, { color: colors.text }]}>{message}</Text>
    </View>
  );
}

function AppSymbol({
  name,
  color,
  size,
}: {
  name: SFSymbol;
  color: string;
  size: number;
}) {
  return (
    <SymbolView
      name={name}
      tintColor={color}
      size={size}
      weight="semibold"
      fallback={null}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  catalogue: { gap: 16, paddingBottom: 188, paddingHorizontal: 24 },
  catalogueHeader: { gap: 16 },
  largeTitle: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.7,
    lineHeight: 40,
  },
  intro: { fontSize: 17, lineHeight: 24 },
  loadingBlock: { alignItems: 'center', gap: 12, paddingTop: 76 },
  loadingText: { fontSize: 16 },
  emptyState: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 22,
    paddingTop: 56,
  },
  emptyIcon: {
    alignItems: 'center',
    borderRadius: 16,
    height: 68,
    justifyContent: 'center',
    width: 68,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  emptyBody: { fontSize: 17, lineHeight: 24, textAlign: 'center' },
  bottomActions: {
    borderTopColor: Colors.separator,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 16,
  },
  primaryButtonText: { color: Colors.onTint, fontSize: 17, fontWeight: '700' },
  outlineButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  outlineButtonText: { fontSize: 17, fontWeight: '600' },
  secondaryAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  secondaryActionText: { fontSize: 17, fontWeight: '600' },
  productRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 78,
    paddingVertical: 10,
  },
  rowImage: {
    alignItems: 'center',
    borderRadius: 10,
    height: 54,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 54,
  },
  productCopy: { flex: 1, gap: 3 },
  productName: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  productMeta: { fontSize: 15, lineHeight: 20 },
  candidateSource: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  textSearchScreen: { gap: 20, paddingHorizontal: 24 },
  textSearchNavRow: { minHeight: 44 },
  textSearchIntro: { gap: 8 },
  textSearchField: { gap: 12 },
  textSearchInput: {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 17,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  textSearchResults: { gap: 12 },
  textSearchResultsHeader: { gap: 4 },
  textSearchResult: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 82,
    paddingVertical: 12,
  },
  searchEmptyState: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 24,
  },
  searchFallbackActions: { gap: 4 },
  scanner: { backgroundColor: Colors.cameraBackground, flex: 1 },
  scannerHighlights: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  scannerHighlight: {
    borderColor: Colors.onTint,
    borderRadius: 8,
    borderWidth: 2,
    position: 'absolute',
    shadowColor: Colors.cameraBackground,
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 2,
  },
  scannerHighlightInner: {
    borderColor: Colors.tint,
    borderRadius: 6,
    borderWidth: 2,
    bottom: 1,
    left: 1,
    position: 'absolute',
    right: 1,
    top: 1,
  },
  scannerTop: { paddingHorizontal: 18, zIndex: 2 },
  scannerCancel: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.cameraScrim,
    borderRadius: 12,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  scannerCancelText: {
    color: Colors.onTint,
    fontSize: 17,
    fontWeight: '600',
  },
  scannerGuide: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 2,
  },
  scanFrame: {
    height: 300,
    maxWidth: 300,
    position: 'relative',
    width: '88%',
  },
  scanCorner: {
    height: 42,
    position: 'absolute',
    width: 42,
  },
  topLeft: {
    borderLeftWidth: 3,
    borderTopLeftRadius: 12,
    borderTopWidth: 3,
    left: 0,
    top: 0,
  },
  topRight: {
    borderRightWidth: 3,
    borderTopRightRadius: 12,
    borderTopWidth: 3,
    right: 0,
    top: 0,
  },
  bottomLeft: {
    borderBottomLeftRadius: 12,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    bottom: 0,
    left: 0,
  },
  bottomRight: {
    borderBottomRightRadius: 12,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    bottom: 0,
    right: 0,
  },
  scannerCopy: {
    alignItems: 'center',
    backgroundColor: Colors.cameraOverlayStrong,
    borderRadius: 10,
    gap: 2,
    marginTop: 20,
    maxWidth: 330,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: '100%',
  },
  scannerInstruction: {
    color: Colors.onTint,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  scannerDetail: {
    color: Colors.onTint,
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
  },
  lockProgress: { flexDirection: 'row', gap: 10, marginTop: 10 },
  lockProgressDot: {
    borderRadius: 6,
    borderWidth: 1.5,
    height: 12,
    width: 12,
  },
  captureArea: { alignItems: 'center', gap: 8, paddingTop: 12 },
  captureError: { color: Colors.onTint, fontSize: 15, fontWeight: '600' },
  scannerChoices: {
    alignSelf: 'stretch',
    gap: 4,
    marginTop: 10,
  },
  scannerManualAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  scannerManualText: {
    color: Colors.onTint,
    fontSize: 17,
    fontWeight: '600',
  },
  permissionScreen: {
    alignItems: 'center',
    flexGrow: 1,
    gap: 16,
    paddingHorizontal: 30,
  },
  progressScreen: {
    alignItems: 'center',
    flexGrow: 1,
    gap: 16,
    paddingHorizontal: 30,
  },
  progressCameraScrim: { backgroundColor: Colors.cameraScrim },
  progressCameraStatus: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'flex-end',
    paddingHorizontal: 30,
  },
  progressCameraTitle: {
    color: Colors.onTint,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  progressCameraBody: {
    color: Colors.onTint,
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
  },
  issueCancel: {
    backgroundColor: Colors.cameraScrim,
    borderRadius: 12,
    justifyContent: 'center',
    left: 18,
    minHeight: 44,
    paddingHorizontal: 14,
    position: 'absolute',
    zIndex: 1,
  },
  issueLayout: { flex: 1, justifyContent: 'flex-end' },
  issueSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  issueIcon: {
    alignItems: 'center',
    borderRadius: 16,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  issueTitle: { fontSize: 24, fontWeight: '700', lineHeight: 30 },
  issueBody: { fontSize: 17, lineHeight: 24, marginBottom: 8 },
  progressTitle: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  progressBody: { fontSize: 17, lineHeight: 24, textAlign: 'center' },
  candidateScreen: { gap: 16, paddingBottom: 48, paddingHorizontal: 24 },
  candidateCameraScrim: { backgroundColor: Colors.cameraScrimLight },
  candidateCameraScreen: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    marginTop: 300,
    minHeight: 520,
    paddingTop: 12,
  },
  recognizedStatus: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  recognizedStatusText: { fontSize: 15, fontWeight: '700' },
  candidateTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginTop: 4,
  },
  candidateList: { gap: 12 },
  candidateRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
    paddingBottom: 16,
  },
  candidateMain: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  candidateConfirm: {
    alignItems: 'center',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  candidateConfirmText: {
    color: Colors.onTint,
    fontSize: 17,
    fontWeight: '700',
  },
  wrongGuessAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  wrongGuessText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  form: { gap: 16, paddingBottom: 48, paddingHorizontal: 24 },
  navRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
    position: 'relative',
  },
  navAction: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 58,
  },
  cancelText: { fontSize: 17 },
  navTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  navBalance: { width: 58 },
  formIntro: { fontSize: 17, lineHeight: 24 },
  lookupRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  lookupText: { fontSize: 15 },
  productImage: {
    alignSelf: 'center',
    borderRadius: 16,
    height: 118,
    overflow: 'hidden',
    width: 118,
  },
  detailImage: {
    alignSelf: 'center',
    borderRadius: 16,
    height: 220,
    overflow: 'hidden',
    width: 220,
  },
  detailImagePlaceholder: {
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
  },
  detailNavRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 44,
  },
  detailBackAction: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 4,
    minHeight: 44,
  },
  detailNavTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginLeft: 'auto',
  },
  detailBrand: { fontSize: 17, lineHeight: 24 },
  detailSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
    paddingTop: 18,
  },
  detailSectionTitle: { fontSize: 20, fontWeight: '700', lineHeight: 25 },
  detailFact: { gap: 4 },
  detailFactLabel: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  detailFactValue: { fontSize: 17, lineHeight: 24 },
  detailSupportingText: { fontSize: 15, lineHeight: 21 },
  sourceSummary: { fontSize: 13, lineHeight: 18 },
  confidenceLabel: { fontSize: 17, fontWeight: '600', lineHeight: 23 },
  disclosureAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    minHeight: 44,
  },
  disclosureLabel: { flex: 1, fontSize: 16, fontWeight: '600', lineHeight: 22 },
  sourceList: { gap: 4, paddingTop: 4 },
  sourceReference: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    minHeight: 44,
  },
  sourceLabel: { flex: 1, fontSize: 15, lineHeight: 20 },
  productImageBlock: { alignItems: 'center', gap: 6 },
  imageCredit: { fontSize: 12, lineHeight: 16 },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  field: { gap: 6 },
  fieldLabel: { fontSize: 15, fontWeight: '600' },
  fieldInput: {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 17,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  categoryControl: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  categoryValue: { flex: 1, fontSize: 17 },
  categorySheet: { paddingHorizontal: 24 },
  categoryOption: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 52,
    paddingHorizontal: 12,
  },
  categoryOptionText: { flex: 1, fontSize: 17 },
  barcodeRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 44,
  },
  barcodeText: { fontSize: 16, fontVariant: ['tabular-nums'] },
  ingredientsSection: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
    paddingVertical: 16,
  },
  ingredientsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  ingredientsIcon: {
    alignItems: 'center',
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  inlineAction: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
  },
  inlineActionText: { fontSize: 16, fontWeight: '600' },
  ingredientRow: {
    alignItems: 'baseline',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 44,
    paddingVertical: 10,
  },
  ingredientPosition: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    width: 24,
  },
  ingredientName: { flex: 1, fontSize: 16, lineHeight: 22 },
  ingredientHelp: { fontSize: 15, lineHeight: 21 },
  errorText: { color: Colors.error, fontSize: 15, lineHeight: 20 },
  notice: {
    alignItems: 'flex-start',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 10,
    padding: 14,
  },
  noticeText: { flex: 1, fontSize: 15, lineHeight: 20 },
  ownedStatus: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 4,
    minHeight: 50,
    paddingHorizontal: 16,
  },
  ownedStatusText: { fontSize: 17, fontWeight: '600' },
  secondaryContextAction: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 16,
  },
  secondaryContextActionText: { fontSize: 17, fontWeight: '600' },
  removeCollectionAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  removeCollectionText: { fontSize: 16, fontWeight: '600' },
  routineSheet: { flex: 1 },
  routineSheetContent: { gap: 20, paddingHorizontal: 24 },
  routineSheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  routineSheetTitle: { flex: 1, fontSize: 28, fontWeight: '700' },
  routineSheetClose: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  routineSheetProduct: { fontSize: 20, fontWeight: '600', lineHeight: 26 },
  routinePeriodChoices: { flexDirection: 'row', gap: 10 },
  routinePeriodChoice: {
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    minHeight: 72,
    padding: 12,
  },
  fieldHint: { fontSize: 14, lineHeight: 20 },
  routineDaysSection: { gap: 10 },
  routineWeekdays: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  routineWeekday: {
    alignItems: 'center',
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  routineWeekdayText: { fontSize: 16, fontWeight: '700' },
  routineChoiceTitle: { fontSize: 18, fontWeight: '700' },
});
