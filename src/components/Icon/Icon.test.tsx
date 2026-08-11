/**
 * Unit tests — Icon component (Font Awesome Solid via Iconify).
 * Dùng react-test-renderer, không cần @testing-library.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { SvgXml } from 'react-native-svg';
import { Icon } from './Icon';
import { ICONS } from './icons.generated';

function render(el: React.ReactElement) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(el);
  });
  return tree;
}

describe('Icon', () => {
  it('renders a known icon as SvgXml with square-ish size', () => {
    const tree = render(<Icon name="house" size={32} color="#f00" />);
    const svg = tree.root.findByType(SvgXml);
    expect(svg.props.height).toBe(32);
    // house viewBox is 576x512 → width scales up from height
    expect(svg.props.width).toBe(Math.round(32 * (576 / 512)));
    expect(svg.props.color).toBe('#f00');
    expect(svg.props.xml).toContain('viewBox="0 0 576 512"');
  });

  it('fill variant keeps currentColor fills', () => {
    const tree = render(<Icon name="user" variant="fill" />);
    const { xml } = tree.root.findByType(SvgXml).props;
    expect(xml).toContain('fill="currentColor"');
    expect(xml).not.toContain('stroke=');
  });

  it('outline variant swaps fill for stroke', () => {
    const tree = render(<Icon name="user" variant="outline" strokeWidth={30} />);
    const { xml } = tree.root.findByType(SvgXml).props;
    expect(xml).toContain('fill="none"');
    expect(xml).toContain('stroke="currentColor"');
    expect(xml).toContain('stroke-width="30"');
  });

  it('returns null for an unknown icon', () => {
    const tree = render(<Icon name={'definitely-not-an-icon' as never} />);
    expect(tree.toJSON()).toBeNull();
  });

  it('registry is non-empty and every entry has body + dimensions', () => {
    const names = Object.keys(ICONS);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) {
      const d = ICONS[n as keyof typeof ICONS];
      expect(d.body).toContain('<path');
      expect(d.w).toBeGreaterThan(0);
      expect(d.h).toBeGreaterThan(0);
    }
  });
});
