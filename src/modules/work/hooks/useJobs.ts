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

/**
 * Loại lỗi màn hình phải phân biệt được.
 *
 * `'backend-off'` là loại RIÊNG của hook này, không phải của `workApi`: cổng
 * `isWorkBackendEnabled()` gộp BA nguyên nhân khác hẳn nhau vào một `false` —
 * chưa cấu hình host · máy chủ trả 404/502 · mạng rớt hoặc quá hạn
 * (`config/runtimeGate.ts` khai đúng hạn chế này trong khối `HEALTH_PATH`). Hai
 * nguyên nhân sau là LẦN GỌI HỎNG, và chúng là ca thường gặp nhất ngoài thực địa.
 */
export type JobsErrorKind = WorkErrorKind | 'backend-off';

export interface LoadState {
  loading: boolean;
  /** null = chưa lỗi. Ngược lại phân loại để StateView chọn offline/error/auth. */
  errorKind: JobsErrorKind | null;
  /** Giữ để tương thích chữ ký cũ; nay LUÔN false (đã gỡ mock). */
  usingMock: boolean;
}

const initState: LoadState = { loading: true, errorKind: null, usingMock: false };

/**
 * Trạng thái khi cổng tắt.
 *
 * ⛔ Trước đây chỗ này đặt `errorKind: null`, và `null` là thứ mọi màn đọc thành
 * "không có lỗi" ⇒ danh sách rỗng ⇒ câu "Chưa có tin việc nào đang mở". Nhưng
 * cổng tắt KHÔNG chứng minh chợ rỗng: app chưa hề hỏi chợ câu nào. Một lần mất
 * mạng và một cái chợ thật sự trống ra CÙNG MỘT MÀN HÌNH, và người đọc màn đó
 * không có cách nào phân biệt — đúng nghĩa cái vỏ im lặng.
 */
const gateOffState: LoadState = { loading: false, errorKind: 'backend-off', usingMock: false };

/** Danh sách tin. openOnly=true → chỉ tin đang mở. */
export const useJobs = (openOnly = false) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [state, setState] = useState<LoadState>(initState);

  const load = useCallback(async () => {
    if (!isWorkBackendEnabled()) {
      // Cổng tắt → KHÔNG chạm mạng (tránh gọi localhost vô nghĩa) và KHÔNG dựng
      // dữ liệu mẫu. Nhưng cũng KHÔNG được báo là danh sách rỗng — xem `gateOffState`.
      setJobs([]);
      setState(gateOffState);
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
      // Cổng tắt → chưa hỏi máy chủ câu nào, nên KHÔNG được nói "không tìm thấy
      // tin" (câu đó khẳng định tin đã bị gỡ). Xem `gateOffState`.
      setJob(null);
      setState(gateOffState);
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
