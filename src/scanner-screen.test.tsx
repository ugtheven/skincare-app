import { act, render } from '@testing-library/react-native';
import type { ForwardedRef } from 'react';

import { ScannerScreen } from './app/products';

const mockLiveScannerState = { supported: false };
const mockTakePictureAsync = jest.fn();

jest.mock('expo-image', () => ({
  Image: () => null,
}));

jest.mock('@/components/live-data-scanner', () => {
  const { View } = jest.requireActual('react-native');
  return {
    isLiveDataScannerSupported: () => mockLiveScannerState.supported,
    LiveDataScannerView: (props: Record<string, unknown>) => (
      <View {...props} testID="live-data-scanner" />
    ),
  };
});

jest.mock('expo-camera', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const MockCameraView = React.forwardRef(
    (props: Record<string, unknown>, ref: ForwardedRef<unknown>) => {
      React.useImperativeHandle(ref, () => ({
        takePictureAsync: mockTakePictureAsync,
      }));
      return <View {...props} testID="camera-view" />;
    },
  );
  MockCameraView.displayName = 'MockCameraView';
  return {
    CameraView: MockCameraView,
    useCameraPermissions: () => [
      { granted: true, canAskAgain: true },
      jest.fn(),
    ],
  };
});

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

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
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
  refreshSharedProductByIdentifier: jest.fn(),
  submitConfirmedWebProduct: jest.fn(),
  submitWrongProductGuess: jest.fn(),
  VisualLookupError: class extends Error {},
}));

describe('scanner highlights', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockLiveScannerState.supported = false;
    mockTakePictureAsync.mockReset();
    mockTakePictureAsync.mockResolvedValue({ uri: 'file://front.jpg' });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('shows the scanned code before completing the lookup', async () => {
    const onScanned = jest.fn();
    const view = await render(
      <ScannerScreen
        detectedIdentifier={null}
        initialMode="barcode"
        onCancel={jest.fn()}
        onCaptured={jest.fn()}
        onManual={jest.fn()}
        onScanned={onScanned}
      />,
    );

    await act(async () => {
      view.getByTestId('scanner-screen').props.onLayout({
        nativeEvent: { layout: { height: 844, width: 390 } },
      });
    });
    await act(async () => {
      view.getByTestId('camera-view').props.onBarcodeScanned({
        bounds: {
          origin: { x: 96, y: 220 },
          size: { height: 92, width: 188 },
        },
        cornerPoints: [
          { x: 100, y: 220 },
          { x: 280, y: 220 },
          { x: 280, y: 312 },
          { x: 100, y: 312 },
        ],
        data: '3612623961421',
        type: 'ean13',
      });
    });

    expect(view.getByText('Code détecté')).toBeTruthy();
    expect(
      view.getByTestId('scanner-highlight-code-ean13', {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    expect(
      view.getByTestId('scanner-highlight-code-ean13-inner', {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    expect(onScanned).not.toHaveBeenCalled();

    await act(async () => jest.advanceTimersByTime(500));
    expect(onScanned).not.toHaveBeenCalled();

    await act(async () => jest.advanceTimersByTime(150));
    expect(onScanned).toHaveBeenCalledWith('3612623961421');
  });

  it('confirms a barcode reported by the native live scanner', async () => {
    mockLiveScannerState.supported = true;
    const onScanned = jest.fn();
    const view = await render(
      <ScannerScreen
        detectedIdentifier={null}
        initialMode="barcode"
        onCancel={jest.fn()}
        onCaptured={jest.fn()}
        onManual={jest.fn()}
        onScanned={onScanned}
      />,
    );

    await act(async () => {
      view.getByTestId('live-data-scanner').props.onItemsChanged({
        nativeEvent: {
          items: [
            {
              height: 0.1,
              id: 'barcode-1',
              kind: 'barcode',
              value: '3612623961421',
              width: 0.5,
              x: 0.25,
              y: 0.4,
            },
          ],
        },
      });
    });

    expect(view.getByText('Code détecté')).toBeTruthy();
    expect(
      view.getByTestId('live-data-scanner').props.highlightedItemIds,
    ).toEqual(['barcode-1']);
    expect(view.getByTestId('live-data-scanner').props.confirmed).toBe(true);

    await act(async () => jest.advanceTimersByTime(650));
    expect(onScanned).toHaveBeenCalledWith('3612623961421');
  });

  it('keeps evaluating stable native text until it locks', async () => {
    mockLiveScannerState.supported = true;
    const view = await render(
      <ScannerScreen
        detectedIdentifier={null}
        initialMode="front"
        onCancel={jest.fn()}
        onCaptured={jest.fn()}
        onManual={jest.fn()}
        onScanned={jest.fn()}
      />,
    );
    const items = [
      {
        confidence: 0.98,
        height: 0.06,
        id: 'brand',
        kind: 'text',
        value: 'AROMA-ZONE',
        width: 0.38,
        x: 0.3,
        y: 0.62,
      },
      {
        confidence: 0.96,
        height: 0.08,
        id: 'name',
        kind: 'text',
        value: 'Sérum acide glycolique 10% & AHA',
        width: 0.64,
        x: 0.18,
        y: 0.48,
      },
    ];

    await act(async () => {
      view.getByTestId('live-data-scanner').props.onItemsChanged({
        nativeEvent: { items },
      });
    });

    expect(
      view.getByTestId('live-data-scanner').props.highlightedItemIds,
    ).toEqual(['brand', 'name']);

    await act(async () => jest.advanceTimersByTime(1200));

    expect(view.getByText('Produit reconnu')).toBeTruthy();
    expect(
      view.getByTestId('live-data-scanner').props.highlightedItemIds,
    ).toEqual(['brand', 'name']);
    expect(view.getByTestId('live-data-scanner').props.confirmed).toBe(true);

    await act(async () => jest.advanceTimersByTime(650));
    expect(view.getByTestId('camera-view')).toBeTruthy();
  });

  it('locks a multiline text block re-emitted by the native scanner', async () => {
    mockLiveScannerState.supported = true;
    const view = await render(
      <ScannerScreen
        detectedIdentifier="3612623961421"
        initialMode="front"
        onCancel={jest.fn()}
        onCaptured={jest.fn()}
        onManual={jest.fn()}
        onScanned={jest.fn()}
      />,
    );
    const event = {
      nativeEvent: {
        items: [
          {
            confidence: 0.96,
            height: 0.24,
            id: 'front-label',
            kind: 'text',
            value: 'AROMA-ZONE\nSérum acide glycolique 10% & AHA',
            width: 0.58,
            x: 0.21,
            y: 0.4,
          },
        ],
      },
    };

    await act(async () => {
      view.getByTestId('live-data-scanner').props.onItemsChanged(event);
      jest.advanceTimersByTime(1200);
    });

    expect(view.getByText('Produit reconnu')).toBeTruthy();
    expect(
      view.getByTestId('live-data-scanner').props.highlightedItemIds,
    ).toEqual(['front-label']);
  });

  it('resets a completed barcode session when reused for the front label', async () => {
    mockLiveScannerState.supported = true;
    const props = {
      detectedIdentifier: null as string | null,
      initialMode: 'barcode' as const,
      onCancel: jest.fn(),
      onCaptured: jest.fn(),
      onManual: jest.fn(),
      onScanned: jest.fn(),
    };
    const view = await render(<ScannerScreen {...props} />);

    await act(async () => {
      view.getByTestId('live-data-scanner').props.onItemsChanged({
        nativeEvent: {
          items: [
            {
              height: 0.1,
              id: 'barcode-1',
              kind: 'barcode',
              value: '3612623961421',
              width: 0.5,
              x: 0.25,
              y: 0.4,
            },
          ],
        },
      });
      jest.advanceTimersByTime(650);
    });

    await view.rerender(
      <ScannerScreen
        {...props}
        detectedIdentifier="3612623961421"
        initialMode="front"
      />,
    );
    await act(async () => {
      view.getByTestId('live-data-scanner').props.onItemsChanged({
        nativeEvent: {
          items: [
            {
              confidence: 0.2,
              height: 0.24,
              id: 'front-label',
              kind: 'text',
              value: 'AROMA-ZONE\nSérum acide glycolique 10% & AHA',
              width: 0.58,
              x: 0.21,
              y: 0.4,
            },
          ],
        },
      });
      jest.advanceTimersByTime(1200);
    });

    expect(view.getByText('Produit reconnu')).toBeTruthy();
  });

  it('waits for the standard camera before capturing the locked product', async () => {
    mockLiveScannerState.supported = true;
    const onCaptured = jest.fn();
    const view = await render(
      <ScannerScreen
        detectedIdentifier="3612623961421"
        initialMode="front"
        onCancel={jest.fn()}
        onCaptured={onCaptured}
        onManual={jest.fn()}
        onScanned={jest.fn()}
      />,
    );
    const items = [
      {
        confidence: 0.96,
        height: 0.24,
        id: 'front-label',
        kind: 'text',
        value: 'AROMA-ZONE\nSérum acide glycolique 10% & AHA',
        width: 0.58,
        x: 0.21,
        y: 0.4,
      },
    ];

    await act(async () => {
      view.getByTestId('live-data-scanner').props.onItemsChanged({
        nativeEvent: { items },
      });
      jest.advanceTimersByTime(1200);
    });
    await act(async () => {
      jest.advanceTimersByTime(650);
    });
    await act(async () => {
      view.getByTestId('camera-view').props.onCameraReady();
    });
    await act(async () => {
      jest.advanceTimersByTime(299);
    });
    expect(mockTakePictureAsync).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(mockTakePictureAsync).toHaveBeenCalledTimes(1);
    expect(onCaptured).toHaveBeenCalledWith('file://front.jpg', {
      lines: ['AROMA-ZONE', 'Sérum acide glycolique 10% & AHA'],
      observations: expect.any(Array),
      text: 'AROMA-ZONE\nSérum acide glycolique 10% & AHA',
    });
  });

  it('falls back to the standard scanner instead of restarting the loop', async () => {
    mockLiveScannerState.supported = true;
    mockTakePictureAsync.mockRejectedValue(new Error('camera_busy'));
    const view = await render(
      <ScannerScreen
        detectedIdentifier="3612623961421"
        initialMode="front"
        onCancel={jest.fn()}
        onCaptured={jest.fn()}
        onManual={jest.fn()}
        onScanned={jest.fn()}
      />,
    );

    await act(async () => {
      view.getByTestId('live-data-scanner').props.onItemsChanged({
        nativeEvent: {
          items: [
            {
              confidence: 0.96,
              height: 0.24,
              id: 'front-label',
              kind: 'text',
              value: 'AROMA-ZONE\nSérum acide glycolique 10% & AHA',
              width: 0.58,
              x: 0.21,
              y: 0.4,
            },
          ],
        },
      });
      jest.advanceTimersByTime(1200);
    });
    await act(async () => jest.advanceTimersByTime(650));
    await act(async () => {
      view.getByTestId('camera-view').props.onCameraReady();
    });

    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(220);
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(220);
      await Promise.resolve();
    });

    expect(mockTakePictureAsync).toHaveBeenCalledTimes(3);
    expect(view.queryByTestId('live-data-scanner')).toBeNull();
    expect(
      view.getByText(
        'La photo automatique reprend avec le scan standard. Garde le produit dans le cadre.',
      ),
    ).toBeTruthy();
  });
});
