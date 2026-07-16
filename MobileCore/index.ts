/**
 * MobileCore — điểm vào công khai của lõi năng-lực-xử-lý mobile.
 * Orchestrator sở hữu file barrel này (ráp ở PHASE 3). Xem MOBILE-CORE-STANDARD.md.
 *
 * L0 = TS thuần (đã test Jest). L1 = interface contract (native hiện thực riêng, @needs-device-test).
 */

// Nền chung
export * from './l0/errors';
export * from './l0/types';

// E4 — địa lý + quản trị tài nguyên
export * from './l0/geo';
export * from './l0/resource';

// E3 — mạng + đồng bộ
export * from './l0/net';
export * from './l0/sync';

// E2 — media/ML (toán thuần, không inference)
export * from './l0/ml';

// L1 — contract engine native (interface only)
export type { KeystoreEngine } from './l1/keystore.interface';
export type { MlEngine } from './l1/ml-engine.interface';
export type { SqliteEngine } from './l1/sqlite.interface';
export type { LocationEngine } from './l1/location.interface';
export type { CameraEngine } from './l1/camera.interface';
export type { MotionEngine } from './l1/motion.interface';
