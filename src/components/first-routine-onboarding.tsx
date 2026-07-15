import {
  RoutineManager,
  type RoutineProductScannerProps,
} from '@/components/routine-editor';
import type { ComponentType } from 'react';

export function FirstRoutineOnboarding({
  onSaved,
  ProductScanner,
}: {
  onSaved: () => void | Promise<void>;
  ProductScanner?: ComponentType<RoutineProductScannerProps>;
}) {
  return (
    <RoutineManager
      onboarding
      onSaved={onSaved}
      ProductScanner={ProductScanner}
    />
  );
}
