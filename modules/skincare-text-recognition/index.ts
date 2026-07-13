import { requireOptionalNativeModule } from 'expo-modules-core';

export type SkincareTextRecognitionNativeModule = {
  recognizeText(imageUri: string): Promise<
    | string[]
    | {
        text: string;
        confidence: number;
        x: number;
        y: number;
        width: number;
        height: number;
      }[]
  >;
};

export default requireOptionalNativeModule<SkincareTextRecognitionNativeModule>(
  'SkincareTextRecognition',
);
