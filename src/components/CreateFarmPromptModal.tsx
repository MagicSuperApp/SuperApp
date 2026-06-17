// components/CreateFarmPromptModal.tsx
//
// Modal nhắc nhở tạo nông trại trước khi định danh cây
// Hiển thị khi user mở app lần đầu và chưa có farm nào

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';

const { width } = Dimensions.get('window');
const MODAL_WIDTH = width - 48;

interface CreateFarmPromptModalProps {
  visible: boolean;
  onCreateFarm: () => void;
  onDismiss: () => void;
}

const CreateFarmPromptModal: React.FC<CreateFarmPromptModalProps> = ({
  visible,
  onCreateFarm,
  onDismiss,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.9,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onDismiss}
        />
        <Animated.View
          style={[
            styles.modalCard,
            {
              transform: [{ scale: scaleAnim }],
              opacity: fadeAnim,
            },
          ]}
        >
          {/* Icon */}
          <View style={styles.iconCircle}>
            <Text style={styles.iconEmoji}>🚜</Text>
          </View>

          {/* Title */}
          <Text style={styles.title}>Tạo nông trại trước</Text>

          {/* Body */}
          <Text style={styles.body}>
            Vui lòng tạo nông trại trước khi thêm cây. Cây quét được sẽ được lưu vào nông trại của bạn.
          </Text>

          {/* Buttons */}
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={onCreateFarm}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Tạo nông trại</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={onDismiss}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryBtnText}>Để sau</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: MODAL_WIDTH,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconEmoji: {
    fontSize: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 24,
  },
  primaryBtn: {
    width: '100%',
    height: 52,
    backgroundColor: '#2E7D32',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryBtn: {
    width: '100%',
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#999999',
  },
});

export default CreateFarmPromptModal;
