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
1. `mobile/capacitor.config.json` already points at `https://cuss.onrender.com`. Change it if your address is different.
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

## iPhone Calendar and Reminders (native app)
The web app already adds things to Apple Calendar (an event file, or the auto-updating subscription from **Add to my iPhone Calendar**) and to Reminders (through the share sheet). In the App Store build, Cuss adds events and reminders **directly**, using the `@ebarooni/capacitor-calendar` plugin (already in `package.json`). After `npm run ios`:
1. In Xcode, open `App/App/Info.plist` and add these keys with a short explanation each:
   - `NSCalendarsFullAccessUsageDescription`: "Cuss adds your readings and deadlines to your calendar."
   - `NSRemindersFullAccessUsageDescription`: "Cuss adds your readings and to-dos to Reminders."
2. Run on a real iPhone and test **Add to Calendar** and **Add to Reminders** on a class item. iOS asks for permission the first time.
3. If the plugin's method names differ in the version you install, update `addToCalendar` and `addToReminders` in `public/app.js`; they fall back to the web behavior if the plugin call fails.
