// modules/proofchat/features/chat/components/ChatInput.tsx

import React, { useState, useRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { PROOFCHAT_THEME } from '../../../theme/colors';

interface Props {
  onSend: (text: string) => void;
  placeholder?: string;
}

const ChatInput: React.FC<Props> = ({ onSend, placeholder = 'Nhắn tin…' }) => {
  const [value, setValue] = useState('');
  const sendScale = useRef(new Animated.Value(1)).current;
  const insets = useSafeAreaInsets();

  const handleSend = () => {
    const t = value.trim();
    if (!t) return;
    onSend(t);
    setValue('');
  };

  const canSend = value.trim().length > 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View style={styles.inputBox}>
          <TouchableOpacity style={styles.iconBtn} hitSlop={6}>
            <Icon name="paperclip" size={20} color={NEUTRAL.textMuted} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={NEUTRAL.textMuted}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity style={styles.iconBtn} hitSlop={6}>
            <Icon name="emoticon-outline" size={20} color={NEUTRAL.textMuted} />
          </TouchableOpacity>
        </View>

        <Animated.View style={{ transform: [{ scale: sendScale }] }}>
          <TouchableOpacity
            activeOpacity={1}
            disabled={!canSend}
            onPressIn={() =>
              Animated.spring(sendScale, { toValue: 0.92, useNativeDriver: true }).start()
            }
            onPressOut={() =>
              Animated.spring(sendScale, {
                toValue: 1,
                friction: 4,
                useNativeDriver: true,
              }).start()
            }
            onPress={handleSend}
            style={[
              styles.sendBtn,
              {
                backgroundColor: canSend
                  ? PROOFCHAT_THEME.primary
                  : withAlpha(PROOFCHAT_THEME.primary, 0.3),
              },
            ]}
          >
            <Icon name="send" size={18} color={NEUTRAL.white} />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: NEUTRAL.bg,
    borderTopWidth: 1,
    borderTopColor: NEUTRAL.border,
  },
  inputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    backgroundColor: NEUTRAL.bgSoft,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    paddingHorizontal: 8,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    minHeight: 44,
  },
  iconBtn: { padding: 6 },
  input: {
    flex: 1,
    fontSize: 14,
    color: NEUTRAL.text,
    maxHeight: 110,
    paddingVertical: Platform.OS === 'ios' ? 4 : 6,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ChatInput;