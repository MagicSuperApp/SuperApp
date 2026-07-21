// onboarding/CoachMarkContext.tsx
//
// Hạ tầng cho luồng hướng dẫn (coach-mark tour):
//  1) Sổ đăng ký TARGET: các màn/nút gọi `useCoachMarkTarget(id)` để đăng ký vị
//     trí cần spotlight. Overlay đo vị trí thật qua `measureInWindow`.
//  2) TRẠNG THÁI tour: active + bước hiện tại; điều khiển start / next / skip.
//  3) Ghi CỜ ĐÃ-XEM theo username khi Skip hoặc chạy hết (utils/tutorialStorage).
//
// Overlay (CoachMarkOverlay) là consumer chính; đặt gần root điều hướng.

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { TOUR_STEPS, TourStep, TargetId } from './tourSteps';
import { markTutorialSeen } from '../utils/tutorialStorage';

export type Rect = { x: number; y: number; width: number; height: number };

type Measurable = {
  measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
};

type CoachMarkCtx = {
  /** Đăng ký node có thể đo cho một target id. */
  register: (id: TargetId, node: Measurable | null) => void;
  unregister: (id: TargetId, node?: Measurable | null) => void;
  /** Đo vị trí target hiện trên cửa sổ; null nếu chưa gắn/đo được. */
  measure: (id: TargetId) => Promise<Rect | null>;

  active: boolean;
  stepIndex: number;
  steps: TourStep[];

  /** Bắt đầu luồng. `username` để ghi cờ đã-xem theo người dùng. */
  start: (username?: string | null) => void;
  next: () => void;
  skip: () => void;
};

const noop = () => {};
const DEFAULT: CoachMarkCtx = {
  register: noop,
  unregister: noop,
  measure: async () => null,
  active: false,
  stepIndex: 0,
  steps: TOUR_STEPS,
  start: noop,
  next: noop,
  skip: noop,
};

const Ctx = createContext<CoachMarkCtx>(DEFAULT);

export function CoachMarkProvider({ children }: { children: React.ReactNode }) {
  // NHIỀU node cho cùng một id: các màn trong tab navigator KHÔNG unmount khi đổi
  // tab, nên hai bản (vd hai AppHeader) có thể cùng đăng ký 'header.bell'. Giữ cả
  // danh sách và khi đo thì thử từ node ĐĂNG KÝ SAU CÙNG trở về trước, lấy node
  // đầu tiên cho ô hợp lệ (nằm trong màn hình) — tránh spotlight lệch vào bản ẩn.
  const nodes = useRef<Map<TargetId, Measurable[]>>(new Map());
  const usernameRef = useRef<string | null>(null);

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const register = useCallback((id: TargetId, node: Measurable | null) => {
    if (!node) return;
    const list = nodes.current.get(id) ?? [];
    if (!list.includes(node)) list.push(node);
    nodes.current.set(id, list);
  }, []);

  const unregister = useCallback((id: TargetId, node?: Measurable | null) => {
    if (!node) {
      nodes.current.delete(id);
      return;
    }
    const list = (nodes.current.get(id) ?? []).filter((n) => n !== node);
    if (list.length) nodes.current.set(id, list);
    else nodes.current.delete(id);
  }, []);

  const measureOne = (node: Measurable): Promise<Rect | null> =>
    new Promise((resolve) => {
      if (typeof node.measureInWindow !== 'function') {
        resolve(null);
        return;
      }
      let done = false;
      // measureInWindow không gọi callback nếu node đã rời cây → chốt thời gian.
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          resolve(null);
        }
      }, 250);
      node.measureInWindow((x, y, w, h) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (!w || !h || w < 4 || h < 4) resolve(null);
        else resolve({ x, y, width: w, height: h });
      });
    });

  const measure = useCallback(async (id: TargetId): Promise<Rect | null> => {
    const list = nodes.current.get(id) ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const r = await measureOne(list[i]);
      if (r) return r;
    }
    return null;
  }, []);

  const finish = useCallback(() => {
    setActive(false);
    setStepIndex(0);
    markTutorialSeen(usernameRef.current);
  }, []);

  const start = useCallback((username?: string | null) => {
    usernameRef.current = username ?? null;
    setStepIndex(0);
    setActive(true);
  }, []);

  // Đọc stepIndex qua ref: `next` phải KHÔNG đổi identity giữa các bước (overlay
  // giữ tham chiếu ổn định) và không được gọi setState trong updater của setState
  // — kiểu cũ (finish() bên trong setStepIndex) chạy 2 lần ở StrictMode và có lúc
  // làm bước không nhảy khi bấm "Tiếp".
  const stepRef = useRef(0);
  stepRef.current = stepIndex;

  const next = useCallback(() => {
    const i = stepRef.current;
    if (i + 1 >= TOUR_STEPS.length) finish();
    else setStepIndex(i + 1);
  }, [finish]);

  const skip = useCallback(() => {
    finish();
  }, [finish]);

  const value = useMemo<CoachMarkCtx>(
    () => ({ register, unregister, measure, active, stepIndex, steps: TOUR_STEPS, start, next, skip }),
    [register, unregister, measure, active, stepIndex, start, next, skip],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCoachMark(): CoachMarkCtx {
  return useContext(Ctx);
}

/**
 * Gắn một vùng UI thành target của luồng hướng dẫn.
 * Dùng: `const t = useCoachMarkTarget('nav.center'); <View ref={t.ref} collapsable={false}>`
 * (thêm `collapsable={false}` với View thường để Android đo được).
 */
export function useCoachMarkTarget(id: TargetId) {
  const { register, unregister } = useCoachMark();
  const last = useRef<Measurable | null>(null);
  const ref = useCallback(
    (node: Measurable | null) => {
      if (last.current && last.current !== node) unregister(id, last.current);
      last.current = node;
      if (node) register(id, node);
    },
    [id, register, unregister],
  );
  return { ref };
}
