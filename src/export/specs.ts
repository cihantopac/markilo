/**
 * Platform requirements used by the exporter, with the official source for each.
 * Keep every number here so a spec change is a one-line edit plus a test update.
 * Verified: 2026-10-30.
 */
export const SPECS = {
  web: {
    icoSizes: [16, 32, 48],
    appleTouch: 180,
    /** web.dev: 512 if only one; also 192/384. Maskable icons separate from "any". */
    manifestIcons: [192, 384, 512],
    maskableIcons: [192, 512],
    /** Maskable icons: keep content inside a circle of radius 40% of the icon (W3C Manifest, "safe zone"). */
    maskableSafeRadius: 0.4,
    sources: [
      'https://developer.mozilla.org/en-US/docs/Web/Manifest/icons',
      'https://www.w3.org/TR/appmanifest/#icon-masks',
      'https://web.dev/articles/maskable-icon',
      'https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html',
    ],
  },
  ios: {
    /** Single 1024 px source; the system applies the corner mask. No transparency in the default icon. */
    appIcon: 1024,
    sources: [
      'https://developer.apple.com/design/human-interface-guidelines/app-icons',
      'https://developer.apple.com/documentation/xcode/configuring-your-app-icon',
      'https://developer.apple.com/documentation/xcode/creating-your-app-icon-using-icon-composer',
    ],
  },
  macos: {
    canvas: 1024,
    /**
     * macOS 26+ (Icon Composer / asset catalog): full-bleed square layers, the system rounds them.
     * Legacy .icns for apps outside Xcode (Electron, Tauri) and older macOS keeps the classic grid:
     * an 824 px rounded rectangle centered in the 1024 canvas.
     */
    legacyBody: 824,
    legacyCornerRadius: 185.4,
    sources: [
      'https://developer.apple.com/design/human-interface-guidelines/app-icons',
      'https://developer.apple.com/documentation/xcode/creating-your-app-icon-using-icon-composer',
    ],
  },
  android: {
    densities: { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 } as Record<string, number>,
    legacyDp: 48,
    adaptiveDp: 108,
    /** Content safe zone: 66 dp diameter circle inside the 108 dp layer. */
    safeZoneDp: 66,
    playStore: 512,
    /** Play applies its own mask (corner radius 30% of the icon size); upload a full square. */
    playMaskRadius: 0.3,
    /**
     * Android TV home-screen banner: xhdpi resource, 320 x 180 px (API 25 and lower; text in the image).
     * The TV icon guidelines list the full density table; 640 x 360 is the xxxhdpi size (xxhdpi is 480 x 270).
     */
    tvBanner: {
      width: 320,
      height: 180,
      source: 'https://developer.android.com/training/tv/get-started/create',
    },
    tvBannerXxxhdpi: {
      width: 640,
      height: 360,
      source: 'https://developer.android.com/design/ui/tv/guides/system/tv-app-icon-guidelines',
    },
    /** Play feature graphic: 1024 x 500 px, JPEG or 24-bit PNG without alpha. */
    playFeatureGraphic: {
      width: 1024,
      height: 500,
      source: 'https://support.google.com/googleplay/android-developer/answer/9866151',
    },
    sources: [
      'https://developer.android.com/develop/ui/views/launch/icon_design_adaptive',
      'https://developer.android.com/distribute/google-play/resources/icon-design-specifications',
      'https://developer.android.com/training/multiscreen/screendensities',
      'https://developer.android.com/training/tv/get-started/create',
      'https://developer.android.com/design/ui/tv/guides/system/tv-app-icon-guidelines',
      'https://support.google.com/googleplay/android-developer/answer/9866151',
    ],
  },
  tv: {
    /** Banners and splash screens keep the logo inside this margin on every side (10 % of each dimension). */
    safeMargin: 0.1,
    /** The lettering of a banner must stay at least this share of the banner height; otherwise a warning. */
    minTextShare: 0.08,
    /** Amazon Appstore listing: Fire TV app icon 1280 x 720 PNG (no transparency); background 1920 x 1080 JPG or 24-bit PNG. */
    fireTv: { icon: { width: 1280, height: 720 }, background: { width: 1920, height: 1080 } },
    /** LG webOS TV appinfo.json: icon 80 x 80, largeIcon 130 x 130, splashBackground 1920 x 1080, all PNG. */
    webos: { icon: 80, largeIcon: 130, splash: { width: 1920, height: 1080 } },
    /**
     * Samsung Tizen TV: the official "App Icons and Screenshots" guide asks for 1920 x 1080 (logo + background) and
     * 512 x 423 store icons, not 512 x 512, so no Tizen file is exported (see the 1.8.0 plan's Progress record).
     */
    unconfirmed: ['tizen-512'],
    sources: [
      'https://developer.amazon.com/docs/app-submission/add-store-listing-information.html',
      'https://webostv.developer.lge.com/develop/references/appinfo-json',
      'https://developer.samsung.com/smarttv/design/app-icons-and-screenshots.html',
    ],
  },
  windows: {
    /** Minimum 16/24/32/48/256; 64 is optional and included. */
    icoSizes: [16, 24, 32, 48, 64, 256],
    /** Square44x44Logo target sizes; each ships plain, _altform-unplated and _altform-lightunplated. */
    targetSizes: [16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256],
    scales: [100, 200, 400],
    sources: [
      'https://learn.microsoft.com/en-us/windows/apps/design/style/iconography/app-icon-construction',
      'https://learn.microsoft.com/en-us/windows/uwp/app-resources/images-tailored-for-scale-theme-contrast',
      'https://learn.microsoft.com/en-us/uwp/schemas/appxpackage/uapmanifestschema/element-uap-splashscreen',
    ],
  },
  social: {
    og: { width: 1200, height: 630 },
    xHeader: { width: 1500, height: 500 },
    /** LinkedIn company page cover (personal profile backgrounds are 1584×396). */
    linkedinCover: { width: 1512, height: 256 },
    githubPreview: { width: 1280, height: 640 },
    /** ~500 px suits GitHub (recommends ~500) and X (400 minimum) avatars. */
    avatar: 500,
    /** X specs could not be fetched from x.com docs (blocked); values are the widely published ones. */
    unverified: ['xHeader'],
    sources: [
      'https://ogp.me/',
      'https://developers.facebook.com/docs/sharing/webmasters/images/',
      'https://www.linkedin.com/help/linkedin/answer/a566232',
      'https://docs.github.com/en/account-and-profile/reference/profile-reference',
      'https://developer.x.com/en/docs/x-for-websites/cards/overview/summary-card-with-large-image',
      'https://help.x.com/en/managing-your-account/common-issues-when-uploading-profile-photo',
      'https://www.linkedin.com/help/linkedin/answer/a563309',
      'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview',
    ],
  },
} as const;
