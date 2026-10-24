# Putting Cuss on the App Store and Google Play

The `mobile/` folder is a [Capacitor](https://capacitorjs.com) project: native iOS and Android apps that load your hosted Cuss web app. Do this **after** Cuss is hosted (for example on Render) and has a public `https://` address.

## What you need
| | Apple App Store | Google Play |
|---|---|---|
| Account | Apple Developer Program, $99/year | Google Play Console, $25 one time |
| Computer | A Mac with **Xcode** (free, from the Mac App Store) | **Android Studio** (free, Mac or Windows) |
| Review | Usually 1–3 days | New personal accounts must run a closed test with at least 12 testers for 14 days before going public |
| Also required | Privacy policy URL, screenshots, app description, support URL | Same, plus a data-safety form |

Your privacy policy is already live at `https://YOUR-APP/privacy.html`.

## Steps
1. In `mobile/capacitor.config.json`, replace `https://YOUR-CUSS-APP.onrender.com` with your real address.
2. In Terminal:
   ```
   cd mobile
   npm install
   npm run icons      # makes every app icon size from assets/icon.png (the Cuss logo)
   npm run ios        # creates the iOS project and opens Xcode
   npm run android    # creates the Android project and opens Android Studio
   ```
3. **iOS (Xcode):** select the **App** target → **Signing & Capabilities** → choose your team. Pick **Any iOS Device**, then **Product → Archive → Distribute App → App Store Connect**. Finish the listing at appstoreconnect.apple.com.
4. **Android (Android Studio):** **Build → Generate Signed App Bundle** (.aab), then upload it in the Play Console under **Testing → Closed testing**.

## Before you submit
- **Apple rule 4.2 (minimum functionality):** Apple can reject apps that are "just a website". Add something native before submitting. The best fit is **push notifications** for deadline reminders and professor replies (`@capacitor/push-notifications`). Haptics and widgets help too.
- **School sign-in inside the app:** test your school's login in the app. If it refuses to load inside an app window, switch the login to open in the system browser with `@capacitor/browser`.
- **Canvas approval:** real students can only sign in once the school has issued Cuss a developer key (see `ADMIN-REQUEST.md`). Until then, the store version can still offer the demo.
- **Screenshots:** take them in the iOS Simulator (iPhone 6.7" and 6.5" sizes) and on an Android emulator.
