import { requireNativeViewManager } from 'expo-modules-core';
import type { ComponentType } from 'react';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';

import textRecognitionModule from '../../modules/skincare-text-recognition';
import type { LiveDataScannerItem } from '@/domain/live-data-scanner';

export type { LiveDataScannerItem } from '@/domain/live-data-scanner';

type LiveDataScannerItemsEvent = NativeSyntheticEvent<{
  items: LiveDataScannerItem[];
}>;

type LiveDataScannerErrorEvent = NativeSyntheticEvent<{
  code: string;
  message: string;
}>;

export type LiveDataScannerViewProps = ViewProps & {
  active: boolean;
  confirmed: boolean;
  highlightedItemIds: string[];
  mode: 'barcode' | 'front';
  onError?: (event: LiveDataScannerErrorEvent) => void;
  onItemsChanged?: (event: LiveDataScannerItemsEvent) => void;
};

let NativeLiveDataScannerView: ComponentType<LiveDataScannerViewProps> | null =
  null;

if (textRecognitionModule?.isLiveDataScannerSupported) {
  NativeLiveDataScannerView =
    requireNativeViewManager<LiveDataScannerViewProps>(
      'SkincareTextRecognition',
      'SkincareDataScannerView',
    );
}

export function isLiveDataScannerSupported(): boolean {
  return NativeLiveDataScannerView !== null;
}

export function LiveDataScannerView(props: LiveDataScannerViewProps) {
  if (!NativeLiveDataScannerView) return null;
  return <NativeLiveDataScannerView {...props} />;
}
