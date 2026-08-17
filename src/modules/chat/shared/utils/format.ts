// modules/chat/shared/utils/format.ts

export const formatTime = (ts: number) => {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

export const formatRelative = (ts: number) => {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'Vừa xong';
  if (min < 60) return `${min} phút`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} giờ`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ngày`;
  return new Date(ts).toLocaleDateString('vi-VN');
};

export const truncateAddress = (addr: string, head = 6, tail = 4) => {
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
};

export const formatToken = (n: number) => {
  return n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
};
