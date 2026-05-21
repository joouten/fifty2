/**
 * FIFTY2 brand color palette.
 * Values were sampled from the brand logo (`C:\Backup\AI\Logo\v2\icon_square_1024.png`):
 *   - Background: deep black, matches the logo's solid dark backdrop.
 *   - Tint / accent: muted currency-green pulled from the "FIFTY 2" wordmark.
 *   - Text: white, matches the highlights in the portrait artwork.
 *
 * The light mode mirrors the dark scheme intentionally — the FIFTY2 brand is
 * dark-first, so even a light environment renders against the brand backdrop
 * rather than the Expo default white-and-cyan combo.
 */

import { Platform } from 'react-native';

// Brand palette — sampled from icon_square_1024.png.
export const BrandColors = {
  background: '#0A0A0A',     // logo backdrop (deep black)
  surface: '#1A1A1A',        // card / panel surface
  surfaceAlt: '#22221F',     // input / elevated surface
  border: '#2A2A2A',         // divider / hairline
  tint: '#5C8C4A',           // currency-green from the FIFTY 2 wordmark
  tintDark: '#3F6B30',       // shadowed green
  tintLight: '#7BAA68',      // highlight green
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A8B0',
  danger: '#E63946',         // semantic red (52W low)
  success: '#5C8C4A',         // semantic green (52W high) — same as tint
};

const tintColorLight = BrandColors.tint;
const tintColorDark = BrandColors.tint;

export const Colors = {
  light: {
    text: BrandColors.textPrimary,
    background: BrandColors.background,
    tint: tintColorLight,
    icon: BrandColors.textSecondary,
    tabIconDefault: BrandColors.textSecondary,
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: BrandColors.textPrimary,
    background: BrandColors.background,
    tint: tintColorDark,
    icon: BrandColors.textSecondary,
    tabIconDefault: BrandColors.textSecondary,
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
