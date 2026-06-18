/**
 * Unit tests — FeeDisplay component
 *
 * Dùng react-test-renderer (không cần @testing-library/react-native).
 * Mock react-native để tránh native bridge trong môi trường jest.
 */

import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {FeeDisplay} from './FeeDisplay';
import type {FeeQuote} from './FeeDisplay';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const VALID_FEE: FeeQuote = {
  fee_lamp: 2.5,
  fee_ada: 0.18,
  lamp_magiclamp: 1.25,
  lamp_orilife: 1.25,
  demand_factor: 1.2,
  display_vn: '2.50 LAMP (~0.18 ADA)',
};

const DEMAND_1_FEE: FeeQuote = {
  fee_lamp: 1.0,
  fee_ada: 0.08,
  lamp_magiclamp: 0.5,
  lamp_orilife: 0.5,
  demand_factor: 1.0,
  display_vn: '1.00 LAMP (~0.08 ADA)',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Trả về tất cả Text node trong cây dưới dạng mảng chuỗi.
 *  Các Text node liền kề cùng cha được ghép lại để test chuỗi liên tục. */
function getAllTextContent(instance: renderer.ReactTestInstance): string[] {
  const results: string[] = [];

  function collectChildren(node: renderer.ReactTestInstance): string[] {
    const parts: string[] = [];
    if (!node.children) return parts;
    for (const child of node.children) {
      if (typeof child === 'string') {
        parts.push(child);
      } else if ((child.type as string) === 'Text') {
        // ghép children của Text node lại để xử lý template literal bị tách
        const joined = collectChildren(child).join('');
        if (joined) parts.push(joined);
      } else {
        parts.push(...collectChildren(child));
      }
    }
    return parts;
  }

  function walk(node: renderer.ReactTestInstance) {
    if ((node.type as string) === 'Text') {
      const joined = collectChildren(node).join('');
      if (joined) results.push(joined);
    } else if (node.children) {
      for (const child of node.children) {
        if (typeof child !== 'string') walk(child);
      }
    }
  }

  walk(instance);
  return results;
}

function textExists(root: renderer.ReactTestInstance, text: string): boolean {
  return getAllTextContent(root).some(t => t.includes(text));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FeeDisplay', () => {
  // ── 1. feeQuote null ──────────────────────────────────────────────────────
  describe('khi feeQuote là null', () => {
    it('không render bất kỳ element nào', () => {
      const tree = renderer.create(<FeeDisplay feeQuote={null} />);
      expect(tree.toJSON()).toBeNull();
    });
  });

  describe('khi feeQuote là undefined', () => {
    it('không render bất kỳ element nào', () => {
      const tree = renderer.create(<FeeDisplay feeQuote={undefined} />);
      expect(tree.toJSON()).toBeNull();
    });
  });

  // ── 2. Hiển thị display_vn ────────────────────────────────────────────────
  describe('khi feeQuote hợp lệ', () => {
    it('hiển thị display_vn ở hàng tóm tắt', () => {
      let tree!: renderer.ReactTestRenderer;
      act(() => { tree = renderer.create(<FeeDisplay feeQuote={VALID_FEE} />); });
      expect(textExists(tree.root, VALID_FEE.display_vn)).toBe(true);
    });

    it('hiển thị label "Phí"', () => {
      let tree!: renderer.ReactTestRenderer;
      act(() => { tree = renderer.create(<FeeDisplay feeQuote={VALID_FEE} />); });
      expect(textExists(tree.root, 'Phí')).toBe(true);
    });

    it('không hiển thị chi tiết bucket khi chưa expand', () => {
      let tree!: renderer.ReactTestRenderer;
      act(() => { tree = renderer.create(<FeeDisplay feeQuote={VALID_FEE} />); });
      // Cardano Treasury chỉ xuất hiện trong panel mở rộng
      expect(textExists(tree.root, 'Cardano Treasury')).toBe(false);
      expect(textExists(tree.root, 'MagicLamp Treasury')).toBe(false);
      expect(textExists(tree.root, 'OriLife Treasury')).toBe(false);
    });
  });

  // ── 3. Press expand → hiện chi tiết ──────────────────────────────────────
  describe('khi bấm expand', () => {
    it('hiển thị 3 dòng chi tiết bucket sau khi bấm', () => {
      let tree!: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(<FeeDisplay feeQuote={VALID_FEE} />);
      });

      // Tìm TouchableOpacity root và gọi onPress
      const touchable = tree.root.findAll(
        n => (n.type as string) === 'TouchableOpacity' || n.props?.onPress !== undefined,
      )[0];

      act(() => {
        touchable.props.onPress();
      });

      const root = tree.root;
      expect(textExists(root, 'Cardano Treasury')).toBe(true);
      expect(textExists(root, 'MagicLamp Treasury')).toBe(true);
      expect(textExists(root, 'OriLife Treasury')).toBe(true);
    });

    it('bấm lần 2 → thu gọn lại, không còn hiện chi tiết', () => {
      let tree!: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(<FeeDisplay feeQuote={VALID_FEE} />);
      });

      const touchable = tree.root.findAll(
        n => (n.type as string) === 'TouchableOpacity' || n.props?.onPress !== undefined,
      )[0];

      // Mở
      act(() => { touchable.props.onPress(); });
      expect(textExists(tree.root, 'Cardano Treasury')).toBe(true);

      // Đóng
      act(() => { touchable.props.onPress(); });
      expect(textExists(tree.root, 'Cardano Treasury')).toBe(false);
    });
  });

  // ── 4. Giá trị ADA + LAMP đúng ───────────────────────────────────────────
  describe('giá trị ADA + LAMP', () => {
    it('hiển thị fee_ada đúng (2 chữ số thập phân)', () => {
      let tree!: renderer.ReactTestRenderer;
      act(() => { tree = renderer.create(<FeeDisplay feeQuote={VALID_FEE} />); });

      const touchable = tree.root.findAll(
        n => n.props?.onPress !== undefined,
      )[0];
      act(() => { touchable.props.onPress(); });

      // fee_ada = 0.18 → "0.18 ADA"
      expect(textExists(tree.root, '0.18 ADA')).toBe(true);
    });

    it('hiển thị lamp_magiclamp đúng', () => {
      let tree!: renderer.ReactTestRenderer;
      act(() => { tree = renderer.create(<FeeDisplay feeQuote={VALID_FEE} />); });

      const touchable = tree.root.findAll(n => n.props?.onPress !== undefined)[0];
      act(() => { touchable.props.onPress(); });

      // lamp_magiclamp = 1.25 → "1.25 LAMP"
      expect(textExists(tree.root, '1.25 LAMP')).toBe(true);
    });

    it('hiển thị lamp_orilife đúng', () => {
      let tree!: renderer.ReactTestRenderer;
      act(() => { tree = renderer.create(<FeeDisplay feeQuote={VALID_FEE} />); });

      const touchable = tree.root.findAll(n => n.props?.onPress !== undefined)[0];
      act(() => { touchable.props.onPress(); });

      // lamp_orilife = 1.25 → "1.25 LAMP"
      const allText = getAllTextContent(tree.root);
      const lampCount = allText.filter(t => t.includes('1.25 LAMP')).length;
      // Cả magiclamp lẫn orilife đều là 1.25 → xuất hiện ít nhất 2 lần
      expect(lampCount).toBeGreaterThanOrEqual(2);
    });

    it('hiển thị hệ số cầu khi demand_factor > 1', () => {
      let tree!: renderer.ReactTestRenderer;
      act(() => { tree = renderer.create(<FeeDisplay feeQuote={VALID_FEE} />); });

      const touchable = tree.root.findAll(n => n.props?.onPress !== undefined)[0];
      act(() => { touchable.props.onPress(); });

      // demand_factor = 1.2
      expect(textExists(tree.root, '×1.20')).toBe(true);
    });

    it('KHÔNG hiển thị hệ số cầu khi demand_factor = 1.0', () => {
      let tree!: renderer.ReactTestRenderer;
      act(() => { tree = renderer.create(<FeeDisplay feeQuote={DEMAND_1_FEE} />); });

      const touchable = tree.root.findAll(n => n.props?.onPress !== undefined)[0];
      act(() => { touchable.props.onPress(); });

      expect(textExists(tree.root, 'Hệ số cầu')).toBe(false);
    });
  });

  // ── 5. Snapshot smoke test ────────────────────────────────────────────────
  describe('snapshot', () => {
    it('snapshot thu gọn khớp', () => {
      const tree = renderer.create(<FeeDisplay feeQuote={VALID_FEE} />);
      expect(tree.toJSON()).toMatchSnapshot();
    });

    it('snapshot mở rộng khớp', () => {
      let tree!: renderer.ReactTestRenderer;
      act(() => { tree = renderer.create(<FeeDisplay feeQuote={VALID_FEE} />); });
      const touchable = tree.root.findAll(n => n.props?.onPress !== undefined)[0];
      act(() => { touchable.props.onPress(); });
      expect(tree.toJSON()).toMatchSnapshot();
    });
  });
});
