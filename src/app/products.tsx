import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useNavigation } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AccessibilityInfo,
  Animated,
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
  lookupOpenBeautyFactsByText,
  lookupProductByBarcode,
} from '@/data/open-beauty-facts';
import {
  isOnDeviceTextRecognitionAvailable,
  recognizePackagingText,
  type RecognizedPackagingText,
} from '@/data/on-device-text-recognition';
import { productRepository } from '@/data/sqlite-product-repository';
import { routineRepository } from '@/data/sqlite-routine-repository';
import {
  recognizeProductBarcode,
  recognizeProductPhoto,
} from '@/data/product-recognition-service';
import { recognizeProductWithVisualFallback } from '@/data/product-visual-fallback';
import {
  lookupSharedProductByIdentifier,
  lookupSharedProductsByText,
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
  extractValidGtin,
  type AutoCaptureLockStage,
} from '@/domain/product-auto-capture';
import { parseIngredientList } from '@/domain/product-ingredients';
import {
  emptyProductDraft,
  PRODUCT_CATEGORIES,
  type Product,
  type ProductDraft,
} from '@/domain/product';
import {
  candidateToDraft,
  hasDecisiveCandidate,
  hasReliableCandidate,
  hasProductCandidateImage,
  isProductCandidateComplete,
  manualDraftFromRecognizedText,
  productLookupTextFromRecognizedText,
  selectProductCandidates,
  type ProductCandidate,
  type RecognizedProductTextLine,
} from '@/domain/product-recognition';
import type { RoutineOccurrence } from '@/domain/routine';

type Screen =
  | 'catalogue'
  | 'scanner'
  | 'recognizing'
  | 'recognitionIssue'
  | 'candidates'
  | 'form'
  | 'routine';

type PhotoRecognitionFallback = Extract<
  Awaited<ReturnType<typeof recognizeProductPhoto>>,
  { kind: 'fallback_required' }
>;

type RecognitionIssue = {
  title: string;
  message: string;
};

type ScannerMode = 'barcode' | 'front';

export default function ProductsScreen() {
  const colors = Colors;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [screen, setScreen] = useState<Screen>('catalogue');
  const [products, setProducts] = useState<Product[]>([]);
  const [draft, setDraft] = useState<ProductDraft>(emptyProductDraft);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [candidates, setCandidates] = useState<ProductCandidate[]>([]);
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
  const [routine, setRoutine] = useState<RoutineOccurrence | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingFallback, setPendingFallback] =
    useState<PhotoRecognitionFallback | null>(null);
  const [recognitionIssue, setRecognitionIssue] =
    useState<RecognitionIssue | null>(null);
  const recognitionSessionRef = useRef(0);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      setProducts(await productRepository.listProducts());
      setMessage(null);
    } catch {
      setMessage('Les produits ne peuvent pas être chargés pour le moment.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: screen === 'catalogue' ? undefined : { display: 'none' },
    });
    return () => navigation.setOptions({ tabBarStyle: undefined });
  }, [navigation, screen]);

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
    recognitionSessionRef.current += 1;
    setPendingIdentifier(null);
    setScannerInitialMode('barcode');
    setDraft(prefilledDraft);
    setFormError(null);
    setMessage(notice);
    setScreen('form');
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

  const openScanner = () => {
    recognitionSessionRef.current += 1;
    setCapturedImageUri(null);
    setRecognizedText('');
    setPendingIdentifier(null);
    setScannerInitialMode('barcode');
    setCandidates([]);
    setMessage(null);
    setPendingFallback(null);
    setRecognitionIssue(null);
    setRecognitionMode('local');
    setScreen('scanner');
  };

  const handlePackagingPhoto = async (
    imageUri: string,
    preRecognized?: RecognizedPackagingText,
  ) => {
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
        return localProducts.map((product) => ({
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
          score: 0,
          source: 'local' as const,
        }));
      },
      searchShared: lookupSharedProductsByText,
      searchPublic: lookupOpenBeautyFactsByText,
    });
    setRecognizedText(result.recognizedText);

    if (
      result.kind === 'fallback_required' &&
      hasReliableCandidate(result.candidates)
    ) {
      const displayableCandidates = result.candidates.filter(
        hasProductCandidateImage,
      );
      const complete = displayableCandidates[0]
        ? isProductCandidateComplete(displayableCandidates[0])
        : false;
      if (!hasReliableCandidate(displayableCandidates)) {
        await runVisualEnrichment(
          result,
          imageUri,
          false,
          undefined,
          recognizedObservations,
        );
        return;
      }
      setCandidates(displayableCandidates);
      setMessage(
        complete
          ? 'Produit reconnu dans le catalogue partagé.'
          : 'Produit reconnu. La fiche se complète en arrière-plan.',
      );
      setScreen('candidates');
      if (!complete && FileSystem.cacheDirectory) {
        const sessionId = recognitionSessionRef.current;
        const enrichmentImageUri = `${FileSystem.cacheDirectory}product-enrichment-${Date.now()}.jpg`;
        try {
          await FileSystem.copyAsync({
            from: imageUri,
            to: enrichmentImageUri,
          });
          void runVisualEnrichment(
            result,
            enrichmentImageUri,
            true,
            sessionId,
            recognizedObservations,
          );
        } catch {
          setMessage(
            'Produit reconnu. La fiche pourra être complétée plus tard.',
          );
        }
      }
      return;
    }

    if (result.kind === 'fallback_required') {
      await runVisualEnrichment(
        result,
        imageUri,
        false,
        undefined,
        recognizedObservations,
      );
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
      );
      if (background && backgroundSessionId !== recognitionSessionRef.current) {
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
      if (background && backgroundSessionId !== recognitionSessionRef.current) {
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
      const sessionExpired = errorCode === 'authentication_required';
      const invalidImage = errorCode === 'invalid_image';
      const requestTimeout = errorCode === 'request_timeout';
      if (__DEV__) {
        console.warn(`[product-visual-lookup] ${errorCode}`);
      }
      setRecognitionIssue({
        title: quotaReached
          ? 'Limite de recherche atteinte'
          : sessionExpired
            ? 'Session réinitialisée'
            : invalidImage
              ? 'Photo difficile à transmettre'
              : requestTimeout
                ? 'Recherche de photo trop longue'
                : 'Recherche de photo interrompue',
        message: quotaReached
          ? 'Les 10 recherches autorisées aujourd’hui ont été utilisées. Réessaie plus tard, ou saisis ce produit manuellement.'
          : sessionExpired
            ? 'La remise à zéro a invalidé l’ancienne session. Réessaie : l’app vient d’en créer une nouvelle.'
            : invalidImage
              ? 'La photo n’a pas pu être préparée. Replace le produit dans le cadre puis réessaie.'
              : requestTimeout
                ? 'Le service a dépassé une minute malgré une seconde tentative automatique. Réessaie.'
                : 'La fiche ne sera pas ajoutée sans photo. Le service a rencontré une erreur temporaire ; réessaie.',
      });
      setScreen('recognitionIssue');
    } finally {
      if (background) {
        await FileSystem.deleteAsync(imageUri, { idempotent: true }).catch(
          () => undefined,
        );
      }
      setRecognitionMode('local');
    }
  };

  const confirmCandidate = async (candidate: ProductCandidate) => {
    if (!hasProductCandidateImage(candidate)) {
      setRecognitionIssue({
        title: 'Photo du produit manquante',
        message:
          'Cette fiche doit être complétée avant de pouvoir être ajoutée.',
      });
      setScreen('recognitionIssue');
      return;
    }
    recognitionSessionRef.current += 1;
    if (candidate.source === 'local') {
      const product = products.find((item) => item.id === candidate.id);
      if (product) {
        if (pendingIdentifier) {
          await productRepository.addIdentifier(product.id, pendingIdentifier);
        }
        await discardCapturedImage();
        setSelectedProduct(product);
        setRoutine(await routineRepository.getCurrentOccurrence(new Date()));
        setMessage('Ce produit est déjà dans ton catalogue.');
        setScreen('routine');
        return;
      }
    }

    if (candidate.source === 'google-web') {
      void submitConfirmedWebProduct(
        candidate,
        recognizedText,
        pendingIdentifier ?? undefined,
      ).catch(() => undefined);
    }

    await discardCapturedImage();
    openManualForm(withPendingIdentifier(candidateToDraft(candidate)));
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

  const handleScannedCode = async (rawValue: string) => {
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

    if (result.kind === 'local') {
      const existing = result.product;
      setSelectedProduct(existing);
      setDraft({
        name: existing.name,
        brand: existing.brand ?? '',
        category: existing.category ?? '',
        barcode: existing.barcode ?? identifier,
        imageUrl: existing.imageUrl ?? '',
        imageSource: existing.imageSource ?? '',
        imageSourceUrl: existing.imageSourceUrl ?? '',
        imageLicense: existing.imageLicense ?? '',
        imageLicenseUrl: existing.imageLicenseUrl ?? '',
        ingredientsText: existing.ingredientsText ?? '',
        ingredientsSource: existing.ingredientsSource ?? '',
        ingredientsSourceUrl: existing.ingredientsSourceUrl ?? '',
        source: existing.source,
      });
      setMessage('Ce produit est déjà dans ton catalogue.');
      setPendingIdentifier(null);
      setScannerInitialMode('barcode');
      setScreen('form');
    } else if (result.kind === 'draft') {
      setDraft({ ...result.draft, barcode: identifier, source: 'barcode' });
      setPendingIdentifier(null);
      setScannerInitialMode('barcode');
      setScreen('form');
    } else {
      setScannerInitialMode('front');
      setScreen('scanner');
    }
    setIsLookingUp(false);
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
    setFormError(null);
    try {
      const result = await productRepository.saveProduct(draft);
      await discardCapturedImage();
      setSelectedProduct(result.product);
      setMessage(
        result.created
          ? 'Produit ajouté à ton catalogue.'
          : 'Ce produit était déjà dans ton catalogue.',
      );
      setRoutine(await routineRepository.getCurrentOccurrence(new Date()));
      setScreen('routine');
    } catch {
      setFormError('Impossible d’enregistrer ce produit. Réessaie.');
    } finally {
      setIsSaving(false);
    }
  };

  const addToRoutine = async () => {
    if (!routine || !selectedProduct) return;

    setIsSaving(true);
    try {
      await routineRepository.addProductStep({
        routineId: routine.routine.id,
        productId: selectedProduct.id,
        title: selectedProduct.name,
      });
      const successMessage = `${selectedProduct.name} a été ajouté à ${routine.routine.name}.`;
      await loadProducts();
      setMessage(successMessage);
      setScreen('catalogue');
    } catch {
      setMessage(
        'Le produit est enregistré, mais pas encore ajouté à la routine.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (screen === 'scanner') {
    return (
      <ScannerScreen
        detectedIdentifier={pendingIdentifier}
        initialMode={scannerInitialMode}
        onCancel={() => {
          setPendingIdentifier(null);
          setScannerInitialMode('barcode');
          setScreen('catalogue');
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
      <RecognitionProgress imageUri={capturedImageUri} mode={recognitionMode} />
    );
  }

  if (screen === 'recognitionIssue' && recognitionIssue) {
    return (
      <RecognitionIssueScreen
        imageUri={capturedImageUri}
        issue={recognitionIssue}
        onCancel={() => {
          recognitionSessionRef.current += 1;
          setScreen('catalogue');
        }}
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
            openScanner();
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
        message={message}
        reportingCandidateId={reportingCandidateId}
        onCancel={() => {
          recognitionSessionRef.current += 1;
          setScreen('catalogue');
        }}
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
        isSaving={isSaving}
        message={message}
        error={formError}
        onChange={(key, value) =>
          setDraft((current) => ({ ...current, [key]: value }))
        }
        onCancel={() => setScreen('catalogue')}
        onSave={() => void saveProduct()}
      />
    );
  }

  if (screen === 'routine') {
    return (
      <RoutineAssociation
        product={selectedProduct}
        routine={routine}
        isSaving={isSaving}
        message={message}
        onAdd={() => void addToRoutine()}
        onSkip={async () => {
          await loadProducts();
          setScreen('catalogue');
        }}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.catalogue,
          { paddingTop: insets.top + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.largeTitle, { color: colors.text }]}>
          Produits
        </Text>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          Retrouve les produits que tu utilises.
        </Text>

        {message ? <Notice message={message} /> : null}

        {isLoading ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={colors.tint} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Chargement…
            </Text>
          </View>
        ) : products.length === 0 ? (
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
              Ton catalogue commence ici.
            </Text>
            <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
              Scanne un produit ou ajoute-le à la main. Tu pourras ensuite le
              placer dans ta routine.
            </Text>
          </View>
        ) : (
          <View style={styles.productList}>
            {products.map((product) => (
              <ProductRow key={product.id} product={product} />
            ))}
          </View>
        )}
      </ScrollView>

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
          accessibilityLabel="Scanner un produit"
          onPress={openScanner}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.tint, opacity: pressed ? 0.86 : 1 },
          ]}
        >
          <AppSymbol name="barcode.viewfinder" color="#FFFFFF" size={21} />
          <Text style={styles.primaryButtonText}>Scanner un produit</Text>
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

function ScannerScreen({
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
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const recognitionAvailable = isOnDeviceTextRecognitionAvailable();
  const [cameraReady, setCameraReady] = useState(false);
  const [scanMode, setScanMode] = useState<ScannerMode>(initialMode);
  const [barcodeProbeAttempts, setBarcodeProbeAttempts] = useState(0);
  const [lockStage, setLockStage] = useState<AutoCaptureLockStage>(0);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const busyRef = useRef(false);
  const scanModeRef = useRef<ScannerMode>(initialMode);
  const guidanceOpacity = useRef(new Animated.Value(1)).current;
  const identifierLockRef = useRef(emptyAutoCaptureIdentifierLock);
  const latestRecognizedRef = useRef<RecognizedPackagingText | null>(null);
  const lockRef = useRef(emptyAutoCaptureLock);

  const barcodeGuidance = barcodeGuidanceStage(barcodeProbeAttempts);
  const guidanceKey =
    scanMode === 'barcode' ? barcodeGuidance : `front-${lockStage}`;

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

  useEffect(() => {
    if (!cameraReady || !permission?.granted || !recognitionAvailable) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const hapticForStage = async (stage: AutoCaptureLockStage) => {
      if (stage === 1) await Haptics.selectionAsync();
      if (stage === 2) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      if (stage === 3) {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      }
    };

    const schedule = (delay = 900) => {
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
          const identifier = extractValidGtin(recognized.text);
          const identifierLock = advanceAutoCaptureIdentifierLock(
            identifierLockRef.current,
            identifier,
          );
          identifierLockRef.current = identifierLock;
          if (identifierLock.observations === 2) {
            busyRef.current = true;
            void Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
            );
            onScanned(identifierLock.value);
            return;
          }

          setBarcodeProbeAttempts((current) => Math.min(5, current + 1));
        } else {
          const identity = productLookupTextFromRecognizedText(
            recognized.text,
            recognized.observations ?? recognized.lines,
          );
          const previous = lockRef.current;
          const next = advanceAutoCaptureLock(previous, identity);
          lockRef.current = next;
          setLockStage(next.stage);
          if (next.stage > 0 && next.stage !== previous.stage) {
            void hapticForStage(next.stage).catch(() => undefined);
          }

          if (next.stage === 3) {
            busyRef.current = true;
            probeUri = null;
            onCaptured(photo.uri, recognized);
            return;
          }
        }
      } catch {
        lockRef.current = emptyAutoCaptureLock;
        setLockStage(0);
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

    schedule(650);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    cameraReady,
    onCaptured,
    onScanned,
    permission?.granted,
    recognitionAvailable,
    scanMode,
  ]);

  const handleBarcode = (value: string) => {
    if (scanModeRef.current !== 'barcode' || busyRef.current) return;
    busyRef.current = true;
    setLockStage(3);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onScanned(value);
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
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setScanMode('front');
  }, [barcodeGuidance, recognitionAvailable, scanMode]);

  const guidance =
    scanMode === 'barcode'
      ? barcodeGuidance === 'seek'
        ? {
            detail: 'Il peut être au dos, dessous ou sur le côté.',
            title: 'Montre le code-barres',
          }
        : barcodeGuidance === 'rotate'
          ? {
              detail: 'Je cherche aussi les petits codes verticaux.',
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
          onPress={() => void requestPermission()}
          style={[styles.primaryButton, { backgroundColor: colors.tint }]}
        >
          <Text style={styles.primaryButtonText}>
            Autoriser l’appareil photo
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
    <View style={styles.scanner}>
      <CameraView
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
            ? ({ data }) => handleBarcode(data)
            : undefined
        }
      />
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
      <View style={styles.scannerGuide}>
        <View style={styles.scanFrame} pointerEvents="none">
          {(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const).map(
            (corner) => (
              <View
                key={corner}
                style={[
                  styles.scanCorner,
                  styles[corner],
                  {
                    borderColor: lockStage === 3 ? colors.tint : '#FFFFFF',
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
                      borderColor: lockStage === 3 ? colors.tint : '#FFFFFF',
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

function RecognitionProgress({
  imageUri,
  mode,
}: {
  imageUri: string | null;
  mode: 'local' | 'web';
}) {
  const colors = Colors;
  const insets = useSafeAreaInsets();
  if (imageUri) {
    return (
      <View
        accessibilityLiveRegion="polite"
        style={[styles.screen, { backgroundColor: '#000000' }]}
      >
        <Image
          source={imageUri}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessibilityLabel="Photo du produit en cours d’analyse"
        />
        <View style={[StyleSheet.absoluteFill, styles.progressCameraScrim]} />
        <View
          style={[
            styles.progressCameraStatus,
            { paddingBottom: insets.bottom + 32 },
          ]}
        >
          <ActivityIndicator color="#FFFFFF" size="large" />
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
    <View style={[styles.screen, { backgroundColor: '#000000' }]}>
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

function CandidateSelection({
  backgroundImageUri,
  candidates,
  message,
  reportingCandidateId,
  onCancel,
  onConfirm,
  onManual,
  onWrongGuess,
}: {
  backgroundImageUri: string | null;
  candidates: ProductCandidate[];
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
        { backgroundColor: overCamera ? '#000000' : colors.background },
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
            <Text
              maxFontSizeMultiplier={1.4}
              style={[styles.cancelText, { color: colors.tint }]}
            >
              Annuler
            </Text>
          </Pressable>
          <Text
            maxFontSizeMultiplier={1.4}
            numberOfLines={1}
            style={[styles.navTitle, { color: colors.text }]}
          >
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
            ? 'Vérifie une dernière fois avant de consulter sa fiche.'
            : 'Choisis une suggestion, puis vérifie sa fiche.'}
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
                onPress={() => onConfirm(candidate)}
                style={({ pressed }) => [
                  styles.candidateConfirm,
                  {
                    backgroundColor: colors.tint,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Text style={styles.candidateConfirmText}>
                  C’est ce produit
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
            <Text
              maxFontSizeMultiplier={1.4}
              style={[styles.cancelText, { color: colors.tint }]}
            >
              Annuler
            </Text>
          </Pressable>
          <Text
            maxFontSizeMultiplier={1.4}
            numberOfLines={1}
            style={[styles.navTitle, { color: colors.text }]}
          >
            Vérifier le produit
          </Text>
          <View style={styles.navBalance} />
        </View>
        <Text style={[styles.formIntro, { color: colors.textSecondary }]}>
          Vérifie les informations avant d’ajouter ce produit.
        </Text>
        {isLookingUp ? (
          <View style={styles.lookupRow}>
            <ActivityIndicator color={colors.tint} />
            <Text style={[styles.lookupText, { color: colors.textSecondary }]}>
              Recherche du produit…
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

function RoutineAssociation({
  product,
  routine,
  isSaving,
  message,
  onAdd,
  onSkip,
}: {
  product: Product | null;
  routine: RoutineOccurrence | null;
  isSaving: boolean;
  message: string | null;
  onAdd: () => void;
  onSkip: () => void;
}) {
  const colors = Colors;
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.association,
          {
            paddingBottom: insets.bottom + 32,
            paddingTop: insets.top + 48,
          },
        ]}
      >
        <View
          style={[
            styles.emptyIcon,
            { backgroundColor: colors.backgroundSelected },
          ]}
        >
          <AppSymbol name="checklist" color={colors.tint} size={31} />
        </View>
        <Text style={[styles.associationTitle, { color: colors.text }]}>
          L’ajouter à ta routine ?
        </Text>
        <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
          {product?.name ?? 'Ce produit'} est enregistré dans ton catalogue.
        </Text>
        {message ? <Notice message={message} /> : null}
        {routine ? (
          <View
            style={[
              styles.routineChoice,
              { backgroundColor: colors.backgroundSelected },
            ]}
          >
            <Text
              style={[
                styles.routineChoiceLabel,
                { color: colors.textSecondary },
              ]}
            >
              Routine choisie
            </Text>
            <Text style={[styles.routineChoiceTitle, { color: colors.text }]}>
              {routine.routine.name}
            </Text>
          </View>
        ) : (
          <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
            Crée une routine depuis Aujourd’hui pour pouvoir y ajouter ce
            produit.
          </Text>
        )}
        {routine ? (
          <Pressable
            accessibilityRole="button"
            disabled={isSaving}
            onPress={onAdd}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: colors.tint,
                opacity: pressed || isSaving ? 0.65 : 1,
              },
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {isSaving ? 'Ajout…' : 'Ajouter à cette routine'}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={onSkip}
          style={styles.secondaryAction}
        >
          <Text style={[styles.secondaryActionText, { color: colors.tint }]}>
            Pas maintenant
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function ProductRow({ product }: { product: Product }) {
  const colors = Colors;
  return (
    <View style={[styles.productRow, { borderColor: colors.separator }]}>
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
        {product.imageSource ? (
          <Text
            style={[styles.imageCredit, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            Image : {product.imageSource}
            {product.imageLicense ? ` · ${product.imageLicense}` : ''}
          </Text>
        ) : null}
      </View>
    </View>
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
  catalogue: { gap: 16, paddingBottom: 148, paddingHorizontal: 24 },
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
    borderTopColor: '#D8E1E8',
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
  primaryButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  secondaryAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  secondaryActionText: { fontSize: 17, fontWeight: '600' },
  productList: { gap: 1, marginTop: 8 },
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
  scanner: { backgroundColor: '#000000', flex: 1 },
  scannerTop: { paddingHorizontal: 18 },
  scannerCancel: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 12,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  scannerCancelText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  scannerGuide: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
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
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    gap: 2,
    marginTop: 20,
    maxWidth: 330,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: '100%',
  },
  scannerInstruction: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  scannerDetail: {
    color: '#FFFFFF',
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
  captureError: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
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
  scannerManualText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
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
  progressCameraScrim: { backgroundColor: 'rgba(0, 0, 0, 0.42)' },
  progressCameraStatus: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'flex-end',
    paddingHorizontal: 30,
  },
  progressCameraTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  progressCameraBody: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
  },
  issueCancel: {
    backgroundColor: 'rgba(0,0,0,0.45)',
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
  candidateCameraScrim: { backgroundColor: 'rgba(0, 0, 0, 0.34)' },
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
  candidateConfirmText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
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
    fontSize: 17,
    fontWeight: '700',
    left: 84,
    position: 'absolute',
    right: 84,
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
  errorText: { color: '#B42318', fontSize: 15, lineHeight: 20 },
  notice: {
    alignItems: 'flex-start',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 10,
    padding: 14,
  },
  noticeText: { flex: 1, fontSize: 15, lineHeight: 20 },
  association: {
    alignItems: 'center',
    flexGrow: 1,
    gap: 16,
    paddingHorizontal: 24,
  },
  associationTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  routineChoice: {
    alignSelf: 'stretch',
    borderRadius: 12,
    gap: 4,
    padding: 16,
  },
  routineChoiceLabel: { fontSize: 13, fontWeight: '600' },
  routineChoiceTitle: { fontSize: 18, fontWeight: '700' },
});
