import React, { useMemo } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { ICONS, IconName, IconData } from './icons.generated';

export type { IconName } from './icons.generated';

export type IconVariant = 'fill' | 'outline';

export interface IconProps {
  /**
   * Font Awesome Solid name, e.g. "house", "user", "magnifying-glass".
   * Known names autocomplete; any string is accepted for registry-driven callers
   * (unknown names render null + warn in DEV).
   */
  name: IconName | (string & {});
  /** Rendered height in px (width scales to keep the glyph aspect ratio). Default 24. */
  size?: number;
  /** Any RN color string. Default "#000". */
  color?: string;
  /**
   * "fill" (default) renders the solid glyph.
   * "outline" strokes the glyph silhouette instead of filling it.
   */
  variant?: IconVariant;
  /** Stroke width used when variant="outline". Default 24 (in the 512 viewBox unit). */
  strokeWidth?: number;
  /** Opacity 0..1. */
  opacity?: number;
  style?: StyleProp<ViewStyle>;
  /** Accessibility label; when omitted the icon is hidden from screen readers. */
  accessibilityLabel?: string;
}

/**
 * App-wide icon component backed by the Font Awesome Solid set (assets/icons).
 * Add new icons with: `node scripts/icons.js <name>` then use <Icon name="<name>" />.
 */
export const Icon: React.FC<IconProps> = ({
  name,
  size = 24,
  color = '#000',
  variant = 'fill',
  strokeWidth = 24,
  opacity = 1,
  style,
  accessibilityLabel,
}) => {
  const icon = ICONS[name as IconName] as IconData | undefined;

  const xml = useMemo(() => {
    if (!icon) return null;
    let body: string = icon.body;
    if (variant === 'outline') {
      body = body.replace(
        /fill="currentColor"/g,
        `fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linejoin="round"`,
      );
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${icon.w} ${icon.h}">${body}</svg>`;
  }, [icon, variant, strokeWidth]);

  if (!icon || !xml) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(`[Icon] Unknown icon "${name}". Run: node scripts/icons.js ${name}`);
    }
    return null;
  }

  const width = Math.round(size * (icon.w / icon.h));

  return (
    <SvgXml
      xml={xml}
      width={width}
      height={size}
      color={color}
      opacity={opacity}
      style={style}
      accessibilityRole={accessibilityLabel ? 'image' : 'none'}
      accessibilityLabel={accessibilityLabel}
    />
  );
};

export default Icon;
