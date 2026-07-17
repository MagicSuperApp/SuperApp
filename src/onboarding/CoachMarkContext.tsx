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
  unregister: (id: TargetId) => void;
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
  const nodes = useRef<Map<TargetId, Measurable>>(new Map());
  const usernameRef = useRef<string | null>(null);

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const register = useCallback((id: TargetId, node: Measurable | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  }, []);

  const unregister = useCallback((id: TargetId) => {
    nodes.current.delete(id);
  }, []);

  const measure = useCallback((id: TargetId): Promise<Rect | null> => {
    return new Promise((resolve) => {
      const node = nodes.current.get(id);
      if (!node || typeof node.measureInWindow !== 'function') {
        resolve(null);
        return;
      }
      node.measureInWindow((x, y, w, h) => {
        if (w === 0 && h === 0) resolve(null);
        else resolve({ x, y, width: w, height: h });
      });
    });
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

  const next = useCallback(() => {
    setStepIndex((i) => {
      if (i + 1 >= TOUR_STEPS.length) {
        finish();
        return 0;
      }
      return i + 1;
    });
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
  const ref = useCallback(
    (node: Measurable | null) => {
      if (node) register(id, node);
      else unregister(id);
    },
    [id, register, unregister],
  );
  return { ref };
}
