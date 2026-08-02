// RootErrorBoundary — bọc toàn app để lỗi RENDER không làm màn hình TRẮNG câm lặng.
// Khi có lỗi: hiện thông báo + message NGAY TRÊN MÀN HÌNH (chụp là biết lỗi gì) và
// báo về remoteLogger. Lỗi render của React KHÔNG đi qua ErrorUtils global handler
// nên cần ErrorBoundary riêng (crashReporter.ts chỉ bắt lỗi ngoài React).
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import rLog from '../services/remoteLogger';

interface Props {
  children: React.ReactNode;
}
interface State {
  err: Error | null;
  info: string;
}

export default class RootErrorBoundary extends React.Component<Props, State> {
  state: State = { err: null, info: '' };

  static getDerivedStateFromError(err: Error): Partial<State> {
    return { err };
  }

  componentDidCatch(err: Error, info: { componentStack?: string }): void {
    try {
      rLog.error('js_render_error', {
        name: err && err.name ? err.name : null,
        message: err && err.message ? err.message : String(err),
        stack: String((err && err.stack) || '').slice(0, 4000),
        componentStack: String((info && info.componentStack) || '').slice(0, 2000),
      });
    } catch {
      // ignore
    }
    this.setState({ info: String((info && info.componentStack) || '') });
  }

  render(): React.ReactNode {
    const { err, info } = this.state;
    if (err) {
      return (
        <ScrollView
          style={{ flex: 1, backgroundColor: '#fff' }}
          contentContainerStyle={{ padding: 24, paddingTop: 80 }}
        >
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#c0392b' }}>
            App gặp lỗi khi khởi động
          </Text>
          <Text style={{ marginTop: 12, fontSize: 14, color: '#222' }}>
            {err.message || String(err)}
          </Text>
          <Text style={{ marginTop: 16, fontSize: 11, color: '#666' }}>
            {String(err.stack || '').slice(0, 1500)}
          </Text>
          {info ? (
            <Text style={{ marginTop: 16, fontSize: 11, color: '#999' }}>
              {info.slice(0, 800)}
            </Text>
          ) : null}
        </ScrollView>
      );
    }
    return this.props.children as React.ReactElement;
  }
}
