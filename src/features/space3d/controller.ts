/**
 * space3d/controller — MÁY QUAY: xoay/zoom bằng tay + CHUYỂN CẢNH BAY VÀO CÂY.
 *
 * Giữ trạng-thái camera ngoài React (mutable ref) để cử-chỉ chạm không gây
 * re-render mỗi khung hình. Mỗi khung, `applyTo(camera)` tính lại vị-trí camera
 * từ toạ-độ cầu quanh điểm ngắm.
 *
 * Chuyển cảnh "fly-in" (bấm 1 cây ở chế độ toàn cảnh):
 *   nội-suy ease-in-out cả điểm ngắm, góc và khoảng cách, kèm ĐƯỜNG VÒNG CUNG
 *   (radius vống lên giữa chặng) → camera lượn ra rồi sà vào cây thay vì trượt
 *   thẳng, cho cảm giác điện-ảnh.
 */

import * as THREE from 'three';
import { easeInOutCubic } from './visuals';

export interface OrbitPose {
  target: THREE.Vector3;
  theta: number; // phương vị (rad)
  phi: number;   // góc từ trục đứng (rad)
  radius: number;
}

export const PHI_MIN = 0.15;
export const PHI_MAX = 1.5; // ~86°, không cho chui xuống dưới mặt đất

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Chuẩn hoá chênh lệch góc về [−π, π] để luôn quay theo đường NGẮN NHẤT. */
function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class SpaceController {
  pose: OrbitPose;
  minRadius = 2;
  maxRadius = 400;

  /**
   * Khoá góc nghiêng — chế độ BẢN ĐỒ 2D nhìn thẳng từ trên xuống. Kéo dọc lúc đó
   * không được phép hạ máy quay xuống ngang nữa (sẽ hết là "2D").
   */
  phiLocked = false;

  private flight: {
    from: OrbitPose;
    to: OrbitPose;
    t: number;
    dur: number;
    arc: number;
    onDone?: () => void;
  } | null = null;

  private spherical = new THREE.Spherical();
  private offset = new THREE.Vector3();

  constructor(pose: OrbitPose) {
    this.pose = {
      target: pose.target.clone(),
      theta: pose.theta,
      phi: clamp(pose.phi, PHI_MIN, PHI_MAX),
      radius: pose.radius,
    };
  }

  get isFlying(): boolean {
    return this.flight != null;
  }

  /** Kéo 1 ngón → xoay quanh điểm ngắm. Đang bay thì bỏ qua (không giật cảnh). */
  orbit(dxPx: number, dyPx: number): void {
    if (this.flight) return;
    this.pose.theta -= dxPx * 0.006;
    if (this.phiLocked) return;
    this.pose.phi = clamp(this.pose.phi - dyPx * 0.005, PHI_MIN, PHI_MAX);
  }

  /**
   * KÉO BẢN ĐỒ (chế độ 2D): dời điểm ngắm trong mặt phẳng đất sao cho cảnh chạy
   * theo ngón tay, đúng cảm giác của một bản đồ giấy.
   *
   * `metersPerPx` do nơi gọi tính (phụ thuộc khoảng cách máy quay + góc mở ống
   * kính + chiều cao khung hình) nên 1 px kéo luôn bằng đúng 1 px cảnh, dù đang
   * phóng to hay thu nhỏ.
   *
   * Hai trục lấy từ chính tư-thế máy quay:
   *   phải-trên-màn  = ( cos θ, 0, −sin θ)
   *   lên-trên-màn   = (−sin θ, 0, −cos θ)   (hình chiếu xuống mặt đất)
   */
  panBy(dxPx: number, dyPx: number, metersPerPx: number): void {
    if (this.flight) return;
    const s = Math.sin(this.pose.theta);
    const c = Math.cos(this.pose.theta);
    const mx = dxPx * metersPerPx;
    const my = dyPx * metersPerPx;
    // Ngón sang phải → nội dung sang phải → điểm ngắm dịch sang TRÁI.
    this.pose.target.x += -c * mx + -s * my;
    this.pose.target.z += s * mx + -c * my;
  }

  /** Chụm 2 ngón → tiến/lùi. */
  zoomBy(factor: number): void {
    if (this.flight) return;
    this.pose.radius = clamp(this.pose.radius / factor, this.minRadius, this.maxRadius);
  }

  /** Đặt thẳng (không chuyển cảnh) — dùng khi vừa mở màn. */
  snapTo(to: Partial<OrbitPose>): void {
    this.flight = null;
    if (to.target) this.pose.target.copy(to.target);
    if (to.theta != null) this.pose.theta = to.theta;
    if (to.phi != null) this.pose.phi = clamp(to.phi, PHI_MIN, PHI_MAX);
    if (to.radius != null) this.pose.radius = clamp(to.radius, this.minRadius, this.maxRadius);
  }

  /**
   * Bay tới tư-thế mới theo đường vòng cung.
   * `arc` = phần trăm bán kính vống thêm ở giữa chặng (0 = bay thẳng).
   */
  flyTo(to: OrbitPose, dur = 1.6, arc = 0.35, onDone?: () => void): void {
    const from: OrbitPose = {
      target: this.pose.target.clone(),
      theta: this.pose.theta,
      phi: this.pose.phi,
      radius: this.pose.radius,
    };
    this.flight = {
      from,
      to: {
        target: to.target.clone(),
        // Cộng dồn theo đường ngắn nhất, giữ số vòng hiện tại → không quay ngược 350°.
        theta: from.theta + shortestAngle(from.theta, to.theta),
        phi: clamp(to.phi, PHI_MIN, PHI_MAX),
        radius: clamp(to.radius, this.minRadius, this.maxRadius),
      },
      t: 0,
      dur: Math.max(0.2, dur),
      arc,
      onDone,
    };
  }

  cancelFlight(): void {
    this.flight = null;
  }

  /** Gọi mỗi khung hình: đẩy chuyển cảnh + ghi tư-thế vào camera. */
  applyTo(camera: THREE.Camera, delta: number): void {
    const f = this.flight;
    if (f) {
      f.t = Math.min(1, f.t + delta / f.dur);
      const e = easeInOutCubic(f.t);
      this.pose.target.lerpVectors(f.from.target, f.to.target, e);
      this.pose.theta = f.from.theta + (f.to.theta - f.from.theta) * e;
      this.pose.phi = f.from.phi + (f.to.phi - f.from.phi) * e;
      const straight = f.from.radius + (f.to.radius - f.from.radius) * e;
      // sin(πe) = 0 ở hai đầu, cực đại ở giữa → đường bay cong ra ngoài rồi sà vào.
      this.pose.radius = straight + Math.sin(Math.PI * e) * f.from.radius * f.arc;
      if (f.t >= 1) {
        this.pose.radius = f.to.radius;
        this.flight = null;
        f.onDone?.();
      }
    }

    this.spherical.set(this.pose.radius, clamp(this.pose.phi, PHI_MIN, PHI_MAX), this.pose.theta);
    this.offset.setFromSpherical(this.spherical);
    camera.position.copy(this.pose.target).add(this.offset);
    camera.lookAt(this.pose.target);
  }
}
