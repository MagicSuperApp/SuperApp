// shared/components/ComingSoonLayout.tsx
//
// Layout placeholder dùng cho các module chưa hoàn thiện. Hiển thị header
// theo màu module, icon, mô tả, danh sách tính năng sắp tới và CTA thông báo.

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Animated,
  Platform,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { NEUTRAL, withAlpha } from '../theme';
import type { ModuleTheme } from '../theme/colors';

const { width } = Dimensions.get('window');

export interface ComingSoonFeature {
  icon: string;
  title: string;
  description: string;
}

interface Props {
  theme: ModuleTheme;
  title: string;
  tagline: string;
  description: string;
  icon: string;
  features: ComingSoonFeature[];
  releaseLabel?: string;
  onNotify?: () => void;
}

const ComingSoonLayout: React.FC<Props> = ({
  theme,
  title,
  tagline,
  description,
  icon,
  features,
  releaseLabel = 'Sắp ra mắt',
  onNotify,
}) => {
  const navigation = useNavigation();

  const heroFade = useRef(new Animated.Value(0)).current;
  const heroSlide = useRef(new Animated.Value(-12)).current;
  const ctaScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroFade, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(heroSlide, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: NEUTRAL.bgSoft }]}>
      <StatusBar barStyle="light-content" backgroundColor={theme.primaryDeep} />

      {/* Themed header */}
      <View style={[styles.header, { backgroundColor: theme.primary }]}>
        <View style={styles.headerOrb} />
        <View style={styles.headerOrb2} />

        <View style={styles.headerTopRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            hitSlop={8}
          >
            <Icon name="chevron-left" size={22} color={NEUTRAL.white} />
          </TouchableOpacity>
          <View style={styles.releaseBadge}>
            <View style={styles.releaseBadgeDot} />
            <Text style={styles.releaseBadgeText}>{releaseLabel}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <Animated.View
          style={[
            styles.heroContent,
            { opacity: heroFade, transform: [{ translateY: heroSlide }] },
          ]}
        >
          <View style={styles.heroIconWrap}>
            <Icon name={icon} size={46} color={NEUTRAL.white} />
          </View>
          <Text style={styles.heroTitle}>{title}</Text>
          <Text style={styles.heroTagline}>{tagline}</Text>
        </Animated.View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.descriptionCard}>
          <Text style={styles.description}>{description}</Text>
        </View>

        <Text style={styles.sectionTitle}>Tính năng sắp tới</Text>

        {features.map((f, i) => (
          <FeatureRow key={f.title} feature={f} index={i} accent={theme.primary} />
        ))}

        {onNotify && (
          <Animated.View
            style={[
              { transform: [{ scale: ctaScale }] },
              { marginTop: 24 },
            ]}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPressIn={() =>
                Animated.spring(ctaScale, { toValue: 0.97, useNativeDriver: true }).start()
              }
              onPressOut={() =>
                Animated.spring(ctaScale, {
                  toValue: 1,
                  friction: 4,
                  useNativeDriver: true,
                }).start()
              }
              onPress={onNotify}
              style={[
                styles.ctaBtn,
                {
                  backgroundColor: theme.primary,
                  shadowColor: theme.primary,
                },
              ]}
            >
              <Icon name="bell-plus-outline" size={18} color={NEUTRAL.white} />
              <Text style={styles.ctaText}>Nhận thông báo khi ra mắt</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        <Text style={styles.footer}>
          Hiện tại bạn vẫn có thể sử dụng đầy đủ module Truy xuất.
        </Text>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
};

// ── Feature row ─────────────────────────────────────────────────────────────
const FeatureRow: React.FC<{
  feature: ComingSoonFeature;
  index: number;
  accent: string;
}> = ({ feature, index, accent }) => {
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 350,
        delay: 200 + index * 80,
        useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: 0,
        duration: 350,
        delay: 200 + index * 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[styles.featureRow, { opacity: fade, transform: [{ translateY: slide }] }]}
    >
      <View
        style={[styles.featureIcon, { backgroundColor: withAlpha(accent, 0.12) }]}
      >
        <Icon name={feature.icon} size={20} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.featureTitle}>{feature.title}</Text>
        <Text style={styles.featureDesc}>{feature.description}</Text>
      </View>
    </Animated.View>
  );
};

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: 20,
    paddingBottom: 36,
    overflow: 'hidden',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerOrb: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -60,
    right: -50,
  },
  headerOrb2: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: -30,
    left: -20,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  releaseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.20)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  releaseBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: NEUTRAL.white,
  },
  releaseBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: NEUTRAL.white,
  },

  heroContent: { alignItems: 'center', marginTop: 8 },
  heroIconWrap: {
    width: 86,
    height: 86,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.30)',
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: NEUTRAL.white,
    letterSpacing: -0.6,
    marginBottom: 6,
  },
  heroTagline: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    maxWidth: width * 0.75,
    lineHeight: 19,
  },

  scroll: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },

  descriptionCard: {
    backgroundColor: NEUTRAL.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    marginBottom: 24,
  },
  description: {
    fontSize: 14,
    color: NEUTRAL.textSub,
    lineHeight: 22,
  },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: NEUTRAL.text,
    letterSpacing: -0.2,
    marginBottom: 12,
  },

  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: NEUTRAL.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    marginBottom: 10,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: NEUTRAL.text,
    marginBottom: 3,
  },
  featureDesc: {
    fontSize: 12,
    color: NEUTRAL.textMuted,
    lineHeight: 17,
  },

  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.30,
    shadowRadius: 14,
    elevation: 5,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '700',
    color: NEUTRAL.white,
    letterSpacing: 0.2,
  },

  footer: {
    fontSize: 11,
    color: NEUTRAL.textMuted,
    textAlign: 'center',
    marginTop: 16,
  },
});

export default ComingSoonLayout;
