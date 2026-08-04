// modules/work/hooks/useTemplates.ts
// Mẫu việc (JobType, GET /templates — công khai). Dùng để dựng biểu-mẫu ĐỘNG khi
// tạo dịch vụ / đăng việc (fields[] khai enum/số). Flag OFF → rỗng (không bịa mẫu).

import { useCallback, useEffect, useState } from 'react';
import { isWorkBackendEnabled } from '../services/config';
import { getTemplates, WorkApiError, type WorkErrorKind } from '../services/workApi';
import type { JobType } from '../services/types';

export interface TemplatesState {
  templates: JobType[];
  loading: boolean;
  errorKind: WorkErrorKind | null;
  usingMock: boolean;
}

export const useTemplates = () => {
  const [state, setState] = useState<TemplatesState>({
    templates: [], loading: true, errorKind: null, usingMock: false,
  });

  const load = useCallback(async () => {
    if (!isWorkBackendEnabled()) {
      setState({ templates: [], loading: false, errorKind: null, usingMock: true });
      return;
    }
    setState(s => ({ ...s, loading: true, errorKind: null, usingMock: false }));
    try {
      const list = await getTemplates();
      setState({ templates: list ?? [], loading: false, errorKind: null, usingMock: false });
    } catch (err) {
      const kind = err instanceof WorkApiError ? err.kind : 'server';
      console.warn('[Work] getTemplates failed:', err);
      setState({ templates: [], loading: false, errorKind: kind, usingMock: false });
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
};
