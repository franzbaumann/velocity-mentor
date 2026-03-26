# Apple Developer + HealthKit checklist

HealthKit **does not run in Expo Go**. Use a **development build** or **EAS Build**:

```bash
cd app
npx expo prebuild --platform ios   # generates ios/ (gitignored here)
npx expo run:ios --device
# or: eas build --profile development --platform ios
```

## Apple Developer Program

1. Enroll at [developer.apple.com](https://developer.apple.com/programs/) (paid).
2. **Certificates, Identifiers & Profiles** → Identifiers → App ID `com.velocitycoach.app` → enable **HealthKit**.
3. Create **Distribution** certificate + **App Store Connect** provisioning profile (EAS can manage this with `eas credentials`).
4. In **App Store Connect**, create the app record; match **bundle ID** to `app.json` → `ios.bundleIdentifier`.

## App Privacy (required)

In App Store Connect → **App Privacy**, declare data collected from HealthKit (e.g. fitness, heart rate, sleep). Keep this aligned with `lib/appleHealth.ts` (`APPLE_HEALTH_READ_TYPES`) and what you actually sync or send to your backend.

## Entitlements & Info.plist

Handled by `@kingstinct/react-native-healthkit` via `app.json` plugins:

- `com.apple.developer.healthkit`
- `com.apple.developer.healthkit.background-delivery` (when `background: true`)
- `NSHealthShareUsageDescription` / `NSHealthUpdateUsageDescription`

## Code entry points

- **Read scope**: `lib/appleHealth.ts`
- **Permission UX**: `hooks/useAppleHealth.ts` + Settings → Apple Health
- After prompting, use `@kingstinct/react-native-healthkit` queries (e.g. `queryQuantitySamples`, workout APIs) — **always** request authorization before subscribing or reading (see library README).

## Optional next steps

- **Clinical Records** / **Health Records** require separate capability and user flows; not enabled here.
- **Background observers**: call `enableBackgroundDelivery` for specific types after authorization; consider adding `UIBackgroundModes` only when implemented.
