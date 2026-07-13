# iOS packaging OCR development build

## Why it is needed

Expo Go contains a fixed set of native modules. It can scan barcodes and take a packaging photo with `expo-camera`, but it cannot load the project-local Apple Vision OCR module.

The V2 scanner has no shutter button. In a development build it silently probes compressed stills, performs OCR locally, and requires three consistent product identities before automatic capture. Expo Go therefore remains barcode-only and exposes manual entry as its fallback.

The Expo Go fallback stays usable: after capture, the app explains the limitation and opens manual entry. In a development build, the same photo is read locally and used to search the catalogue. Vision returns text, confidence, and normalized layout coordinates so packaging text can be separated from background objects and rebuilt in reading order.

## First build

Prerequisites: Xcode, an iOS simulator or a signed physical device, and the existing `.env.local` values.

```sh
npm install
npm run ios:dev-build
```

For a physical iPhone:

```sh
npm run ios:device
```

Expo generates the native iOS project and installs pods. Select or confirm the app bundle identifier and Apple development team if Xcode requests them. No `expo-dev-client` dependency is required for this minimal local build.

After changing Swift files or native configuration, rebuild with the same command. Ordinary TypeScript changes continue to reload through Metro.

## Privacy and fallback

- Apple Vision performs OCR on device.
- The captured photo is not sent to Supabase or Open Beauty Facts.
- The app sends only normalized OCR text to `product-lookup`.
- The captured photo is a transient preview and is not stored in the shared catalogue.
- Layout coordinates and confidence remain local. Only compact lookup text leaves the device.
- If OCR, networking, or matching fails, manual entry remains available and is prefilled when readable text exists.
