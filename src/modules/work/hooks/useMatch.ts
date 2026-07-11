// modules/work/hooks/useMatch.ts
// Khớp ứng viên cho 1 tin (GET /jobs/:id/match). Flag ON → thật; OFF → mock.

import { useCallback, useEffect, useState } from 'react';
import { isWorkBackendEnabled } from '../services/config';
import { getJobMatch, WorkApiError, type WorkErrorKind } from '../services/workApi';
import type { MatchResult } from '../services/types';
import { MOCK_MATCH } from '../data/workMockApi';

export const useMatch = (jobId: string) => {
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<WorkErrorKind | null>(null);
  const [usingMock, setUsingMock] = useState(false);

  const load = useCallback(async () => {
    if (!isWorkBackendEnabled()) {
      setResult(MOCK_MATCH);
      setLoading(false); setErrorKind(null); setUsingMock(true);
      return;
    }
    setLoading(true); setErrorKind(null); setUsingMock(false);
    try {
      const r = await getJobMatch(jobId);
      setResult(r); setLoading(false);
    } catch (err) {
      const kind = err instanceof WorkApiError ? err.kind : 'server';
      console.warn('[Work] getJobMatch failed:', err);
      setResult(null); setErrorKind(kind); setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);
  return { result, loading, errorKind, usingMock, reload: load };
};
