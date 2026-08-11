// modules/work/hooks/useTaskers.ts
//
// Hook danh bạ thợ (H-02, GET /taskers — CÔNG KHAI). Flag ON → thật; OFF → rỗng
// THẬT (không bịa thợ demo — 2026-07-27 đã gỡ mockup khỏi màn thật để không dựng
// hợp đồng với hồ sơ ma). `now` cố định 1 lần / phiên load để server dựng đúng 1
// cảnh (kéo làm mới không nhảy thứ tự).

import { useCallback, useEffect, useState } from 'react';
import { isWorkBackendEnabled } from '../services/config';
import { getTaskers, WorkApiError, type WorkErrorKind, type TaskersQuery } from '../services/workApi';
import type { Tasker } from '../services/types';

export interface TaskersState {
  taskers: Tasker[];
  total: number;
  loading: boolean;
  errorKind: WorkErrorKind | null;
  usingMock: boolean;
}

export interface UseTaskersOpts {
  templateKey?: string;
  availableOnly?: boolean;
  limit?: number;
}

export const useTaskers = (opts: UseTaskersOpts = {}) => {
  const { templateKey, availableOnly, limit } = opts;
  const [state, setState] = useState<TaskersState>({
    taskers: [], total: 0, loading: true, errorKind: null, usingMock: false,
  });

  const load = useCallback(async () => {
    if (!isWorkBackendEnabled()) {
      setState({ taskers: [], total: 0, loading: false, errorKind: null, usingMock: true });
      return;
    }
    setState(s => ({ ...s, loading: true, errorKind: null, usingMock: false }));
    try {
      // now cố định TẠI thời-điểm gọi → server lọc availableOnly + xếp tất-định theo
      // đúng mốc này (không lệch giữa lúc build danh sách và lúc render).
      const q: TaskersQuery = { templateKey, availableOnly, limit, now: Date.now() };
      const r = await getTaskers(q);
      setState({ taskers: r.taskers ?? [], total: r.total ?? 0, loading: false, errorKind: null, usingMock: false });
    } catch (err) {
      const kind = err instanceof WorkApiError ? err.kind : 'server';
      console.warn('[Work] getTaskers failed:', err);
      setState({ taskers: [], total: 0, loading: false, errorKind: kind, usingMock: false });
    }
  }, [templateKey, availableOnly, limit]);

  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
};
