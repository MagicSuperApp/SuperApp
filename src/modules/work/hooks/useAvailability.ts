// modules/work/hooks/useAvailability.ts
// Khai sẵn sàng (Genie). Flag ON → thật; OFF → mock. Mặc định AN TOÀN: chưa khai
// = { available:false } (không tự nhận là rảnh).

import { useCallback, useEffect, useState } from 'react';
import { isWorkBackendEnabled } from '../services/config';
import {
  getMyAvailability, setAvailability, clearAvailability,
  WorkApiError, type WorkErrorKind, type SetAvailabilityBody,
} from '../services/workApi';
import type { AvailabilityResult, Availability } from '../services/types';
import { MOCK_AVAILABILITY } from '../data/workMockApi';

/** True + bản ghi khi đang khai rảnh; false khi chưa/không rảnh. */
export const isAvailable = (r: AvailabilityResult | null): r is Availability =>
  !!r && 'availableFrom' in r;

export const useAvailability = () => {
  const [data, setData] = useState<AvailabilityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<WorkErrorKind | null>(null);
  const [usingMock, setUsingMock] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!isWorkBackendEnabled()) {
      setData(MOCK_AVAILABILITY);
      setLoading(false); setErrorKind(null); setUsingMock(true);
      return;
    }
    setLoading(true); setErrorKind(null); setUsingMock(false);
    try {
      setData(await getMyAvailability());
      setLoading(false);
    } catch (err) {
      const kind = err instanceof WorkApiError ? err.kind : 'server';
      console.warn('[Work] getMyAvailability failed:', err);
      setData({ available: false }); setErrorKind(kind); setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (body: SetAvailabilityBody) => {
    if (!isWorkBackendEnabled()) { setData({ ...body, did: 'me', updatedAt: Date.now() } as Availability); return; }
    setSaving(true);
    try { const r = await setAvailability(body); setData(r); }
    finally { setSaving(false); }
  }, []);

  const clear = useCallback(async () => {
    if (!isWorkBackendEnabled()) { setData({ available: false }); return; }
    setSaving(true);
    try { await clearAvailability(); setData({ available: false }); }
    finally { setSaving(false); }
  }, []);

  return { data, loading, errorKind, usingMock, saving, reload: load, save, clear };
};
