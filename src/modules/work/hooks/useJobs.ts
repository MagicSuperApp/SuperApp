// modules/work/hooks/useJobs.ts
//
// Hook nạp danh sách + chi tiết tin tuyển. ĐIỂM NỐI mock ⟷ API thật:
//   - isWorkBackendEnabled() === true  → gọi workApi (API thật, đủ 4 trạng thái
//     loading/empty/offline/error — INTEGRATION §7.3, phân biệt mạng/quyền/server).
//   - false → trả MOCK ngay (UI test không vỡ khi chưa có host AladinWork dev).
//
// Không xoá mock: mock là fallback + nguồn cho flag OFF.

import { useCallback, useEffect, useState } from 'react';
import { FEATURED_JOBS, type Job } from '../data/mockData';
import { toUiJob } from '../data/adapters';
import { isWorkBackendEnabled } from '../services/config';
import { getJobs, getJob, WorkApiError, type WorkErrorKind } from '../services/workApi';

export interface LoadState {
  loading: boolean;
  /** null = chưa lỗi. Ngược lại phân loại để StateView chọn offline/error/auth. */
  errorKind: WorkErrorKind | null;
  /** true khi đang chạy mock (flag OFF) — screen có thể hiện nhãn dev nếu cần. */
  usingMock: boolean;
}

const initState: LoadState = { loading: true, errorKind: null, usingMock: false };

/** Danh sách tin. openOnly=true → chỉ tin đang mở. */
export const useJobs = (openOnly = false) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [state, setState] = useState<LoadState>(initState);

  const load = useCallback(async () => {
    if (!isWorkBackendEnabled()) {
      // Flag OFF → mock, không chạm mạng.
      setJobs(FEATURED_JOBS);
      setState({ loading: false, errorKind: null, usingMock: true });
      return;
    }
    setState({ loading: true, errorKind: null, usingMock: false });
    try {
      const remote = await getJobs(openOnly);
      setJobs(remote.map(toUiJob));
      setState({ loading: false, errorKind: null, usingMock: false });
    } catch (err) {
      const kind = err instanceof WorkApiError ? err.kind : 'server';
      // Không lộ lỗi kỹ thuật ra UI; chi tiết vào console (OriLife §5).
      console.warn('[Work] getJobs failed:', err);
      setJobs([]);
      setState({ loading: false, errorKind: kind, usingMock: false });
    }
  }, [openOnly]);

  useEffect(() => { load(); }, [load]);

  return { jobs, ...state, reload: load };
};

/** Chi tiết 1 tin. */
export const useJobDetail = (jobId: string) => {
  const [job, setJob] = useState<Job | null>(null);
  const [state, setState] = useState<LoadState>(initState);

  const load = useCallback(async () => {
    if (!isWorkBackendEnabled()) {
      const local = FEATURED_JOBS.find(j => j.id === jobId) ?? null;
      setJob(local);
      setState({ loading: false, errorKind: null, usingMock: true });
      return;
    }
    setState({ loading: true, errorKind: null, usingMock: false });
    try {
      const remote = await getJob(jobId);
      setJob(toUiJob(remote));
      setState({ loading: false, errorKind: null, usingMock: false });
    } catch (err) {
      const kind = err instanceof WorkApiError ? err.kind : 'server';
      console.warn('[Work] getJob failed:', err);
      setJob(null);
      setState({ loading: false, errorKind: kind, usingMock: false });
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  return { job, ...state, reload: load };
};
