/**
 * space3d/labelBus — cầu nối NHÃN 3D → lớp chữ của React Native.
 *
 * Tên cây / tên quả vẽ bằng <Text> của RN đè lên canvas (nét căng, dùng được font
 * tiếng Việt) thay vì texture chữ trong 3D. Mỗi khung hình, component `Projector`
 * chiếu điểm 3D ra px màn hình rồi đẩy qua bus này.
 *
 * Vì sao cần bus thay vì setState thẳng: nhãn cập nhật liên tục; nếu setState ở
 * màn cha thì CẢ CÂY React (gồm <Canvas>) dựng lại mỗi lần → giật. Bus cho phép
 * duy nhất lớp nhãn (anh em của Canvas) lắng nghe và vẽ lại.
 */

export type LabelKind = 'tree' | 'fruit';

export interface ScreenLabel {
  id: string;
  kind: LabelKind;
  text: string;
  /** px trong khung canvas. */
  x: number;
  y: number;
  /** Nằm trong khung nhìn (sau camera / ngoài mép → false). */
  visible: boolean;
  /** Khoảng cách tới camera (mét) — dùng làm mờ nhãn ở xa. */
  distance: number;
}

type Listener = (labels: ScreenLabel[]) => void;

class LabelBus {
  private listeners = new Set<Listener>();
  private labels: ScreenLabel[] = [];

  publish(labels: ScreenLabel[]): void {
    this.labels = labels;
    this.listeners.forEach((fn) => fn(labels));
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.labels);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Gọi khi rời màn — tránh nhãn của cảnh cũ đọng lại ở lần mở sau. */
  reset(): void {
    this.labels = [];
    this.listeners.forEach((fn) => fn([]));
  }
}

export const labelBus = new LabelBus();
