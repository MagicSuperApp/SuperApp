// modules/work/hooks/useJobs.ts
//
// Hook nạp danh sách + chi tiết tin tuyển. LÀM THẬT — KHÔNG mock (anh Aladin chốt
// 2026-07-27: "không cần seed, không cần mock, làm thật luôn"):
//   - Cổng runtime bật (backend AladinWork sống, health 2xx) → gọi workApi THẬT,
//     đủ 4 trạng thái loading/empty/offline/error (INTEGRATION §7.3).
//   - Cổng tắt (chưa cấu hình host / backend chưa sống) → danh sách RỖNG + empty-state
//     THẬT, TUYỆT ĐỐI không dựng dữ liệu mẫu lên màn thật.

import { useCallback, useEffect, useState } from 'react';
import { type Job } from '../data/mockData';
import { toUiJob } from '../data/adapters';
import { isWorkBackendEnabled } from '../services/config';
import { getJobs, getJob, WorkApiError, type WorkErrorKind } from '../services/workApi';

export interface LoadState {
  loading: boolean;
  /** null = chưa lỗi. Ngược lại phân loại để StateView chọn offline/error/auth. */
  errorKind: WorkErrorKind | null;
  /** Giữ để tương thích chữ ký cũ; nay LUÔN false (đã gỡ mock). */
  usingMock: boolean;
}

const initState: LoadState = { loading: true, errorKind: null, usingMock: false };

/** Danh sách tin. openOnly=true → chỉ tin đang mở. */
export const useJobs = (openOnly = false) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [state, setState] = useState<LoadState>(initState);

  const load = useCallback(async () => {
    if (!isWorkBackendEnabled()) {
      // Cổng tắt (chưa cấu hình host / backend chưa sống) → RỖNG + empty-state thật,
      // không dựng dữ liệu mẫu. Không chạm mạng để tránh gọi localhost vô nghĩa.
      setJobs([]);
      setState({ loading: false, errorKind: null, usingMock: false });
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
      // Cổng tắt → không có chi tiết thật để hiện; trả null (UI báo không tìm thấy),
      // không rơi về dữ liệu mẫu.
      setJob(null);
      setState({ loading: false, errorKind: null, usingMock: false });
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
