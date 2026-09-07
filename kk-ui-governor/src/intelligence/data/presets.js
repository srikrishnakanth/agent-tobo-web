// Preset catalogue for KK-UI-GOVERNOR: styles, page types, platforms, themes, densities, motion,
// devices and accessibility modes. Everything the selector and the recommendation engine reason
// over lives here as data, so new presets are additions, not code changes.

export const STYLES = {
  premium: {
    label: 'Premium', description: 'Refined, high-polish product feel: generous whitespace, tinted neutrals, precise typography, restrained motion.',
    neutralTint: 0.10, saturation: 0.85, radius: 12, shadow: 'soft', density: 'comfortable', motion: 'subtle', threeD: false,
    fonts: { display: ['font-plus-jakarta-sans', 'font-manrope', 'font-sora'], body: ['font-plus-jakarta-sans', 'font-manrope', 'font-geist'], mono: ['font-jetbrains-mono'] },
    signature: 'Layered tinted surfaces with a single accent used only for primary actions.',
    pageAffinity: { landing: 0.9, ecommerce: 0.9, onboarding: 0.8, settings: 0.6, dashboard: 0.6, auth: 0.7, crm: 0.5, admin: 0.4, inbox: 0.5, docs: 0.5, 'ai-ui': 0.8 },
    antiPatterns: ['gradient-text', 'three-card-hero', 'emoji-icons'],
  },
  modern: {
    label: 'Modern', description: 'Clean contemporary UI: crisp neutrals, strong type hierarchy, clear affordances, standard motion.',
    neutralTint: 0.05, saturation: 0.95, radius: 10, shadow: 'medium', density: 'comfortable', motion: 'standard', threeD: false,
    fonts: { display: ['font-sora', 'font-outfit', 'font-manrope'], body: ['font-manrope', 'font-figtree', 'font-geist'], mono: ['font-jetbrains-mono'] },
    signature: 'Bold display headline with a tightly-set body scale and one signature accent.',
    pageAffinity: { landing: 0.9, dashboard: 0.8, crm: 0.7, admin: 0.7, ecommerce: 0.8, inbox: 0.7, settings: 0.8, auth: 0.8, onboarding: 0.8, docs: 0.7, 'ai-ui': 0.9 },
    antiPatterns: ['indigo-purple-gradient', 'three-card-hero', 'inter-default'],
  },
  minimal: {
    label: 'Minimal', description: 'Reduction to essentials: near-monochrome, hairline borders, no decorative shadows, typography carries the design.',
    neutralTint: 0.0, saturation: 0.7, radius: 6, shadow: 'none', density: 'spacious', motion: 'subtle', threeD: false,
    fonts: { display: ['font-geist', 'font-dm-sans', 'font-manrope'], body: ['font-geist', 'font-dm-sans'], mono: ['font-jetbrains-mono'] },
    signature: 'Hairline rules and generous whitespace; colour appears only as a single accent.',
    pageAffinity: { landing: 0.8, docs: 0.9, settings: 0.8, auth: 0.9, onboarding: 0.7, dashboard: 0.5, crm: 0.4, admin: 0.5, ecommerce: 0.6, inbox: 0.6, 'ai-ui': 0.8 },
    antiPatterns: ['glass-blur-spam', 'shadow-spam', 'gradient-text'],
  },
  enterprise: {
    label: 'Enterprise', description: 'Trustworthy, dense-but-clear business UI: conservative palette, tabular type, strong states, minimal motion.',
    neutralTint: 0.04, saturation: 0.75, radius: 6, shadow: 'low', density: 'compact', motion: 'subtle', threeD: false,
    fonts: { display: ['font-ibm-plex-sans', 'font-public-sans'], body: ['font-ibm-plex-sans', 'font-public-sans', 'font-noto-sans'], mono: ['font-ibm-plex-mono', 'font-jetbrains-mono'] },
    signature: 'Structured grid with a persistent sidebar and status colour system.',
    pageAffinity: { dashboard: 0.95, crm: 0.95, admin: 0.95, inbox: 0.85, settings: 0.85, docs: 0.7, auth: 0.7, landing: 0.5, ecommerce: 0.4, onboarding: 0.6, 'ai-ui': 0.6 },
    antiPatterns: ['gradient-text', 'glass-blur-spam', 'emoji-icons', 'parallax'],
  },
  luxury: {
    label: 'Luxury', description: 'Editorial and slow: serif display type, deep neutrals, restrained gold/ink accents, cinematic spacing.',
    neutralTint: 0.08, saturation: 0.6, radius: 2, shadow: 'none', density: 'spacious', motion: 'subtle', threeD: false,
    fonts: { display: ['font-fraunces', 'font-instrument-serif', 'font-cormorant-garamond'], body: ['font-source-serif-4', 'font-newsreader', 'font-dm-sans'], mono: ['font-jetbrains-mono'] },
    signature: 'Oversized serif headline with editorial rhythm and hairline dividers.',
    pageAffinity: { landing: 0.95, ecommerce: 0.9, onboarding: 0.6, auth: 0.6, docs: 0.4, dashboard: 0.2, crm: 0.2, admin: 0.2, inbox: 0.2, settings: 0.4, 'ai-ui': 0.4 },
    antiPatterns: ['rounded-2xl-spam', 'indigo-purple-gradient', 'three-card-hero'],
  },
  creative: {
    label: 'Creative', description: 'Expressive and asymmetric: bold display type, saturated accents, motion with purpose, unusual composition.',
    neutralTint: 0.06, saturation: 1.0, radius: 16, shadow: 'medium', density: 'comfortable', motion: 'complex', threeD: 'css',
    fonts: { display: ['font-bricolage-grotesque', 'font-syne', 'font-space-grotesk'], body: ['font-dm-sans', 'font-figtree', 'font-manrope'], mono: ['font-jetbrains-mono'] },
    signature: 'Asymmetric hero composition with a kinetic display headline.',
    pageAffinity: { landing: 0.95, onboarding: 0.8, 'ai-ui': 0.7, ecommerce: 0.6, docs: 0.3, dashboard: 0.3, crm: 0.2, admin: 0.2, inbox: 0.3, settings: 0.3, auth: 0.5 },
    antiPatterns: ['inter-default', 'three-card-hero', 'numbered-markers'],
  },
  'visual-rich': {
    label: 'Visual Rich', description: 'Imagery-first: full-bleed media, carousels, layered cards, scroll-driven reveals with strict performance budgets.',
    neutralTint: 0.05, saturation: 0.9, radius: 14, shadow: 'medium', density: 'comfortable', motion: 'complex', threeD: 'css',
    fonts: { display: ['font-outfit', 'font-sora', 'font-space-grotesk'], body: ['font-figtree', 'font-manrope'], mono: ['font-jetbrains-mono'] },
    signature: 'Full-bleed hero media with layered content cards and a scroll-snap carousel.',
    pageAffinity: { landing: 0.95, ecommerce: 0.95, onboarding: 0.7, 'ai-ui': 0.6, docs: 0.2, dashboard: 0.3, crm: 0.2, admin: 0.2, inbox: 0.2, settings: 0.3, auth: 0.5 },
    antiPatterns: ['autoplay-without-controls', 'unreserved-media-space'],
  },
  'native-app': {
    label: 'Native App', description: 'Platform-faithful app UI: system fonts, native controls, large touch targets, safe areas, bottom navigation.',
    neutralTint: 0.03, saturation: 0.9, radius: 12, shadow: 'low', density: 'comfortable', motion: 'standard', threeD: false,
    fonts: { display: ['system'], body: ['system'], mono: ['system-mono'] },
    signature: 'Platform-native navigation (tab bar / app bar) with 44–48px targets and safe-area insets.',
    pageAffinity: { inbox: 0.9, settings: 0.9, onboarding: 0.9, auth: 0.9, dashboard: 0.7, ecommerce: 0.8, crm: 0.6, admin: 0.5, landing: 0.5, docs: 0.5, 'ai-ui': 0.8 },
    antiPatterns: ['hover-only-affordance', 'desktop-first-nav'],
  },
  '3d': {
    label: '3D', description: 'Depth-led: 3D hero object or scene with strict degradation to CSS depth and static art on constrained devices.',
    neutralTint: 0.06, saturation: 1.0, radius: 16, shadow: 'high', density: 'comfortable', motion: 'complex', threeD: 'webgl',
    fonts: { display: ['font-space-grotesk', 'font-syne', 'font-sora'], body: ['font-manrope', 'font-dm-sans'], mono: ['font-jetbrains-mono'] },
    signature: 'A single 3D hero object that degrades to CSS depth layers, then to a static render.',
    pageAffinity: { landing: 0.95, 'ai-ui': 0.7, onboarding: 0.6, ecommerce: 0.6, docs: 0.1, dashboard: 0.2, crm: 0.1, admin: 0.1, inbox: 0.1, settings: 0.1, auth: 0.3 },
    antiPatterns: ['3d-without-fallback', 'autoplay-webgl-on-mobile'],
  },
  'data-dense': {
    label: 'Data Dense', description: 'Maximum information per pixel: compact rows, tabular figures, sparklines, muted chrome, colour reserved for data.',
    neutralTint: 0.02, saturation: 0.8, radius: 4, shadow: 'none', density: 'compact', motion: 'none', threeD: false,
    fonts: { display: ['font-ibm-plex-sans', 'font-public-sans'], body: ['font-ibm-plex-sans', 'font-public-sans'], mono: ['font-ibm-plex-mono', 'font-jetbrains-mono'] },
    signature: 'Dense tabular grid with tabular numerals, sticky headers and inline sparklines.',
    pageAffinity: { dashboard: 0.95, admin: 0.9, crm: 0.9, inbox: 0.8, docs: 0.5, settings: 0.6, 'ai-ui': 0.5, landing: 0.2, ecommerce: 0.3, onboarding: 0.2, auth: 0.3 },
    antiPatterns: ['decorative-animation', 'oversized-cards', 'shadow-spam'],
  },
};

export const PAGE_TYPES = {
  landing: { label: 'Landing Page', components: ['navigation', 'buttons', 'cards'], effects: ['scroll-effects', 'micro-interactions'], keywords: ['landing', 'home', 'index', 'marketing', 'hero', 'pricing', 'features'] },
  dashboard: { label: 'Dashboard', components: ['sidebar', 'navigation', 'cards', 'tables', 'charts', 'buttons'], effects: ['micro-interactions'], keywords: ['dashboard', 'overview', 'analytics', 'metrics', 'stats', 'reports'] },
  crm: { label: 'CRM', components: ['sidebar', 'tables', 'inputs', 'modals', 'cards', 'buttons'], effects: ['micro-interactions'], keywords: ['crm', 'contacts', 'leads', 'deals', 'pipeline', 'customers', 'accounts'] },
  admin: { label: 'Admin', components: ['sidebar', 'tables', 'inputs', 'modals', 'buttons'], effects: ['micro-interactions'], keywords: ['admin', 'manage', 'users', 'roles', 'permissions', 'audit'] },
  ecommerce: { label: 'Ecommerce', components: ['navigation', 'cards', 'carousel', 'buttons', 'inputs', 'modals'], effects: ['carousel', 'micro-interactions'], keywords: ['shop', 'store', 'product', 'products', 'cart', 'checkout', 'catalog', 'collection'] },
  inbox: { label: 'Inbox', components: ['sidebar', 'tables', 'buttons', 'inputs'], effects: ['micro-interactions'], keywords: ['inbox', 'mail', 'messages', 'chat', 'conversation', 'threads', 'notifications'] },
  settings: { label: 'Settings', components: ['sidebar', 'inputs', 'buttons', 'cards'], effects: [], keywords: ['settings', 'preferences', 'profile', 'account', 'billing', 'security'] },
  auth: { label: 'Auth', components: ['inputs', 'buttons', 'cards'], effects: [], keywords: ['login', 'signin', 'sign-in', 'signup', 'sign-up', 'register', 'auth', 'password', 'forgot', 'reset', 'verify'] },
  onboarding: { label: 'Onboarding', components: ['cards', 'buttons', 'inputs'], effects: ['micro-interactions'], keywords: ['onboarding', 'welcome', 'getting-started', 'setup', 'wizard', 'steps'] },
  docs: { label: 'Docs', components: ['sidebar', 'navigation', 'tables'], effects: [], keywords: ['docs', 'documentation', 'guide', 'reference', 'api', 'changelog', 'blog', 'article'] },
  'ai-ui': { label: 'AI UI', components: ['inputs', 'cards', 'buttons', 'sidebar'], effects: ['micro-interactions'], keywords: ['chat', 'assistant', 'agent', 'prompt', 'ai', 'copilot', 'autonomous', 'generate', 'conversation'] },
};

export const PLATFORMS = {
  ios: { label: 'iOS-like', fonts: { display: ['system'], body: ['system'], mono: ['system-mono'] }, radius: 12, touchTarget: 44, navigation: 'tab-bar', systemFontStack: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif", vaultTokens: ['ionic-ios-tokens'] },
  'android-material': { label: 'Android Material', fonts: { display: ['font-noto-sans', 'system'], body: ['font-noto-sans', 'system'], mono: ['system-mono'] }, radius: 16, touchTarget: 48, navigation: 'navigation-bar', systemFontStack: "Roboto, 'Noto Sans', system-ui, sans-serif", vaultTokens: ['material-tokens', 'ionic-md-tokens', 'material-filled-button'] },
  'windows-fluent': { label: 'Windows Fluent', fonts: { display: ['system'], body: ['system'], mono: ['system-mono'] }, radius: 4, touchTarget: 40, navigation: 'navigation-view', systemFontStack: "'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif", vaultTokens: ['fluent-tokens'] },
  'neutral-web': { label: 'Neutral Web', fonts: null, radius: null, touchTarget: 44, navigation: 'top-nav', systemFontStack: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", vaultTokens: ['open-props-sizes', 'open-props-easing', 'open-props-shadows', 'open-props-borders'] },
  'brand-custom': { label: 'Brand Custom', fonts: null, radius: null, touchTarget: 44, navigation: 'top-nav', systemFontStack: "system-ui, sans-serif", vaultTokens: ['radix-colors-light', 'radix-colors-dark'], brandMode: 'replace' },
};

export const THEMES = {
  light: { label: 'Light' }, dark: { label: 'Dark' }, 'high-contrast': { label: 'High Contrast' }, auto: { label: 'Light + Dark (system)' },
};

export const DENSITIES = {
  compact: { label: 'Compact', base: 4, scale: [2, 4, 6, 8, 12, 16, 20, 24, 32, 40], rowHeight: 32, controlHeight: 32, fontBase: 14 },
  comfortable: { label: 'Comfortable', base: 4, scale: [4, 8, 12, 16, 20, 24, 32, 40, 48, 64], rowHeight: 44, controlHeight: 40, fontBase: 16 },
  spacious: { label: 'Spacious', base: 8, scale: [8, 12, 16, 24, 32, 40, 48, 64, 80, 96], rowHeight: 52, controlHeight: 48, fontBase: 17 },
};

export const MOTION_LEVELS = {
  none: { label: 'None', durationFast: 0, durationBase: 0, durationSlow: 0, scroll: false, parallax: false, carousel: 'static', threeD: false },
  subtle: { label: 'Subtle', durationFast: 120, durationBase: 180, durationSlow: 260, scroll: false, parallax: false, carousel: 'scroll-snap', threeD: false },
  standard: { label: 'Standard', durationFast: 150, durationBase: 220, durationSlow: 320, scroll: true, parallax: false, carousel: 'scroll-snap', threeD: false },
  complex: { label: 'Complex', durationFast: 160, durationBase: 260, durationSlow: 420, scroll: true, parallax: true, carousel: 'scroll-snap', threeD: 'auto' },
};

export const DEVICE_CLASSES = {
  mobile: { label: 'Mobile', minWidth: 240, maxWidth: 480, dpr: [2, 3], touch: true },
  foldable: { label: 'Foldable', minWidth: 280, maxWidth: 720, dpr: [2, 3], touch: true, hinge: true },
  tablet: { label: 'Tablet', minWidth: 600, maxWidth: 1024, dpr: [2], touch: true },
  laptop: { label: 'Laptop', minWidth: 1024, maxWidth: 1536, dpr: [1, 2], touch: false },
  desktop: { label: 'Desktop', minWidth: 1280, maxWidth: 1920, dpr: [1], touch: false },
  ultrawide: { label: 'Ultrawide', minWidth: 2560, maxWidth: 3440, dpr: [1], touch: false },
  '4k': { label: '4K', minWidth: 3840, maxWidth: 3840, dpr: [1, 2], touch: false },
};

export const A11Y_MODES = ['reduced-motion', 'keyboard', 'screen-reader', 'forced-colors', 'large-text'];
export const COMPONENTS = ['buttons', 'inputs', 'cards', 'tables', 'navigation', 'sidebar', 'modals', 'charts', 'carousel'];
export const EFFECTS = ['animations', 'micro-interactions', 'scroll-effects', 'carousel', 'parallax', '3d'];

/** Named user-selectable presets: coherent bundles of the dimensions above. */
export const NAMED_PRESETS = {
  'auto': { label: 'Auto Recommend', auto: true },
  'saas-modern-dashboard': { style: 'modern', pageType: 'dashboard', platform: 'neutral-web', theme: 'auto', density: 'comfortable', motion: 'subtle' },
  'enterprise-admin': { style: 'enterprise', pageType: 'admin', platform: 'neutral-web', theme: 'auto', density: 'compact', motion: 'subtle' },
  'data-ops-console': { style: 'data-dense', pageType: 'dashboard', platform: 'neutral-web', theme: 'dark', density: 'compact', motion: 'none' },
  'premium-landing': { style: 'premium', pageType: 'landing', platform: 'neutral-web', theme: 'auto', density: 'comfortable', motion: 'subtle' },
  'luxury-storefront': { style: 'luxury', pageType: 'ecommerce', platform: 'neutral-web', theme: 'light', density: 'spacious', motion: 'subtle' },
  'creative-launch': { style: 'creative', pageType: 'landing', platform: 'neutral-web', theme: 'auto', density: 'comfortable', motion: 'complex' },
  'visual-showcase': { style: 'visual-rich', pageType: 'landing', platform: 'neutral-web', theme: 'auto', density: 'comfortable', motion: 'complex' },
  '3d-hero-landing': { style: '3d', pageType: 'landing', platform: 'neutral-web', theme: 'dark', density: 'comfortable', motion: 'complex' },
  'ios-app': { style: 'native-app', pageType: 'inbox', platform: 'ios', theme: 'auto', density: 'comfortable', motion: 'standard' },
  'android-app': { style: 'native-app', pageType: 'inbox', platform: 'android-material', theme: 'auto', density: 'comfortable', motion: 'standard' },
  'windows-app': { style: 'native-app', pageType: 'settings', platform: 'windows-fluent', theme: 'auto', density: 'compact', motion: 'subtle' },
  'minimal-docs': { style: 'minimal', pageType: 'docs', platform: 'neutral-web', theme: 'auto', density: 'spacious', motion: 'subtle' },
  'ai-assistant': { style: 'modern', pageType: 'ai-ui', platform: 'neutral-web', theme: 'dark', density: 'comfortable', motion: 'standard' },
  'accessible-high-contrast': { style: 'minimal', pageType: 'settings', platform: 'neutral-web', theme: 'high-contrast', density: 'comfortable', motion: 'none', a11y: ['reduced-motion', 'keyboard', 'forced-colors', 'large-text'] },
};
