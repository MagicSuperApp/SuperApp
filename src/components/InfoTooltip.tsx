// Build 52 (2026-05-17) — Inline (?) help icon that opens a modal tooltip.
//
// Usage:
//   <InfoTooltip text="GPS chính xác cần trời quang, không mưa">
//     <Text>Độ chính xác GPS</Text>
//   </InfoTooltip>
//
// Renders the children + a small "?" icon to the right. Tap anywhere
// on the row to open a centered modal with the explanation text and
// a "Đóng" button. Backdrop tap also closes.
//
// Why a modal (not a native popover): React Native doesn't have a
// cross-platform tooltip primitive, and farmer-persona screens are
// already crowded — a clear modal beats a floating popover that may
// clip off-screen.

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLORS } from '../constants';
import {
  useSystemAccessibility,
  scaledFontSize,
} from '../hooks/useSystemAccessibility';

interface Props {
  text: string;
  children?: React.ReactNode;
  /** Optional override for the trigger icon size (default 14). */
  iconSize?: number;
}

const InfoTooltip: React.FC<Props> = ({ text, children, iconSize = 14 }) => {
  const [visible, setVisible] = useState(false);
  const a11y = useSystemAccessibility();
  const bodySize = scaledFontSize(15, a11y.fontScale);
  const dismissSize = scaledFontSize(15, a11y.fontScale);

  const open = () => setVisible(true);
  const close = () => setVisible(false);

  return (
    <>
      <TouchableOpacity
        onPress={open}
        style={styles.row}
        accessibilityRole="button"
        accessibilityLabel="Xem giải thích"
        accessibilityHint={text}
      >
        {children}
        <Icon
          name="help-circle-outline"
          size={iconSize}
          color={COLORS.textMuted}
          style={styles.icon}
        />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <Pressable style={styles.backdrop} onPress={close}>
          {/* Inner Pressable swallows taps so the card doesn't dismiss on tap */}
          <Pressable style={styles.tooltipCard} onPress={() => {}}>
            <Text style={[styles.tooltipText, { fontSize: bodySize }]}>
              {text}
            </Text>
            <TouchableOpacity
              onPress={close}
              style={styles.dismissBtnWrap}
              accessibilityRole="button"
              accessibilityLabel="Đóng giải thích"
            >
              <Text style={[styles.dismissBtn, { fontSize: dismissSize }]}>
                Đóng
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginLeft: 4,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  tooltipCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
    width: '100%',
    maxWidth: 360,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  tooltipText: {
    color: COLORS.text,
    lineHeight: 22,
    marginBottom: 8,
  },
  dismissBtnWrap: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  dismissBtn: {
    color: COLORS.accent,
    fontWeight: '700',
  },
});

export default InfoTooltip;
