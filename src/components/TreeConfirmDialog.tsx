/**
 * TreeConfirmDialog - Modal for selecting tree candidate or new tree
 *
 * Shown when identify returns UNCERTAIN decision with multiple candidates
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL } from '../shared/theme';
import { COLORS } from '../constants';
import type { TreeCandidate } from '../services/treeReIDService';

interface TreeConfirmDialogProps {
  visible: boolean;
  candidates: TreeCandidate[];
  onSelect: (treeId: string | 'new') => void;
  onDismiss: () => void;
}

const TreeConfirmDialog: React.FC<TreeConfirmDialogProps> = ({
  visible,
  candidates,
  onSelect,
  onDismiss,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          {/* Header */}
          <View style={styles.header}>
            <Icon name="leaf" size={24} color="#1b5e20" />
            <Text style={styles.title}>Chọn cây phù hợp</Text>
          </View>

          <Text style={styles.subtitle}>
            Hệ thống nhận diện được {candidates.length} cây có thể là cùng một cây.
            Vui lòng chọn cây đúng trên thực địa:
          </Text>

          {/* Candidate List */}
          <ScrollView style={styles.candidateList}>
            {candidates.map((candidate, index) => (
              <TouchableOpacity
                key={candidate.tree_id}
                style={styles.candidateCard}
                onPress={() => onSelect(candidate.tree_id)}
                activeOpacity={0.7}
              >
                {/* Tree Icon with Index */}
                <View style={styles.candidateIcon}>
                  <Icon name="tree" size={32} color="#1b5e20" />
                  <View style={styles.candidateIndex}>
                    <Text style={styles.candidateIndexText}>{index + 1}</Text>
                  </View>
                </View>

                {/* Tree Info */}
                <View style={styles.candidateInfo}>
                  <Text style={styles.candidateName}>
                    {candidate.name || 'Cây không tên'}
                  </Text>
                  <Text style={styles.candidateCode}>
                    {candidate.code || '---'}
                  </Text>
                  <View style={styles.candidateBadges}>
                    {candidate.has3d && (
                      <View style={styles.badge3D}>
                        <Icon name="cube" size={12} color="#fff" />
                        <Text style={styles.badge3DText}>3D</Text>
                      </View>
                    )}
                    {candidate.anchor === 'confirmed' && (
                      <View style={styles.badgeAnchor}>
                        <Icon name="link-variant" size={12} color="#fff" />
                        <Text style={styles.badgeAnchorText}>Neo</Text>
                      </View>
                    )}
                    {candidate.near_prev && (
                      <View style={styles.badgeNearby}>
                        <Icon name="map-marker" size={12} color="#fff" />
                        <Text style={styles.badgeNearbyText}>Cạnh cây vừa quét</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Arrow */}
                <Icon name="chevron-right" size={24} color={NEUTRAL.textMuted} />
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* New Tree Option */}
          <TouchableOpacity
            style={styles.newTreeButton}
            onPress={() => onSelect('new')}
            activeOpacity={0.7}
          >
            <Icon name="plus-circle" size={32} color="#1b5e20" />
            <View style={styles.newTreeInfo}>
              <Text style={styles.newTreeTitle}>Đây là cây mới</Text>
              <Text style={styles.newTreeSubtitle}>Chưa có trong hệ thống</Text>
            </View>
            <Icon name="chevron-right" size={24} color={NEUTRAL.textMuted} />
          </TouchableOpacity>

          {/* Cancel Button */}
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onDismiss}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelText}>Huỷ</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  dialog: {
    backgroundColor: NEUTRAL.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 34, // Safe area
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: NEUTRAL.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: NEUTRAL.text,
  },
  subtitle: {
    fontSize: 14,
    color: NEUTRAL.textSub,
    paddingHorizontal: 20,
    paddingVertical: 16,
    lineHeight: 20,
  },
  candidateList: {
    maxHeight: 300,
    paddingHorizontal: 16,
  },
  candidateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: NEUTRAL.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  candidateIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e8f5e9',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  candidateIndex: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1b5e20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  candidateIndexText: {
    fontSize: 10,
    fontWeight: '700',
    color: NEUTRAL.white,
  },
  candidateInfo: {
    flex: 1,
    marginLeft: 12,
  },
  candidateName: {
    fontSize: 16,
    fontWeight: '600',
    color: NEUTRAL.text,
  },
  candidateCode: {
    fontSize: 12,
    color: NEUTRAL.textMuted,
    marginTop: 2,
  },
  candidateBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  badge3D: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#7b1fa2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badge3DText: {
    fontSize: 10,
    fontWeight: '600',
    color: NEUTRAL.white,
  },
  badgeAnchor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#1976d2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeAnchorText: {
    fontSize: 10,
    fontWeight: '600',
    color: NEUTRAL.white,
  },
  badgeNearby: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#388e3c',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeNearbyText: {
    fontSize: 10,
    fontWeight: '600',
    color: NEUTRAL.white,
  },
  newTreeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 8,
    borderWidth: 2,
    borderColor: '#1b5e20',
    borderStyle: 'dashed',
  },
  newTreeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  newTreeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1b5e20',
  },
  newTreeSubtitle: {
    fontSize: 12,
    color: '#388e3c',
    marginTop: 2,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  cancelText: {
    fontSize: 16,
    color: NEUTRAL.textMuted,
    fontWeight: '600',
  },
});

export default TreeConfirmDialog;
