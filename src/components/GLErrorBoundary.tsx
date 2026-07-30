/**
 * GLErrorBoundary — chặn lỗi JS trong cây con (thường là cảnh 3D react-three-fiber)
 * để KHÔNG kéo sập cả app; log lên remote để chẩn đoán. Chỉ bắt lỗi render JS —
 * KHÔNG bắt được crash NATIVE (GL context chết), nhưng log onEnter/onError giúp
 * khoanh vùng là JS hay native.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import rLog from '../services/remoteLogger';

interface Props {
  /** Nhãn để phân biệt trong log (vd "space3d", "fruit_place3d"). */
  tag: string;
  children: React.ReactNode;
  onRetry?: () => void;
}
interface State { hasError: boolean; message?: string }

export default class GLErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: unknown, info: { componentStack?: string }): void {
    rLog.viewer3d.boundaryError(
      this.props.tag,
      err instanceof Error ? err.message : String(err),
      info?.componentStack?.slice(0, 500) ?? null,
    );
  }

  private retry = () => {
    this.setState({ hasError: false, message: undefined });
    this.props.onRetry?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children as React.ReactElement;
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Không mở được không gian 3D</Text>
        <Text style={styles.desc}>Thiết bị có thể thiếu bộ nhớ đồ hoạ. Thử lại hoặc quay lại sau.</Text>
        <TouchableOpacity style={styles.btn} onPress={this.retry}>
          <Text style={styles.btnText}>Thử lại</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#0b0b0b' },
  title: { fontSize: 16, fontWeight: '700', color: '#fff', textAlign: 'center' },
  desc: { fontSize: 13, color: '#bbb', textAlign: 'center', marginTop: 8, lineHeight: 19 },
  btn: { marginTop: 18, backgroundColor: '#2a6', borderRadius: 10, paddingHorizontal: 22, paddingVertical: 11 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
