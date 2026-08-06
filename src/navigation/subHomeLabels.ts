// navigation/subHomeLabels.ts
//
// SG9 §5.2 — SUBHOME FRAME: nguồn DUY NHẤT cho TAB CON trong một app (song song
// NAV_FRAME của tab dưới). Thêm khu cho app con = CLONE 1 DÒNG trong SUBHOME_FRAME.
//
// Quy ước song ngữ (§5.2): EN là CHUẨN (hiển thị) · ngôn ngữ QUỐC GIA là
// tooltip/ngữ cảnh (KHÔNG vẽ dòng dưới — SubHome 1 dòng gọn, tiết kiệm chiều cao
// ~40dp). Khác NavItemFrame (tab dưới vẽ 2 dòng) đúng như spec.
//
// TẦNG: đây là experience layer (INTEGRATION-STANDARD §7.1) — nhãn/tab con của
// một app, KHÔNG nhét vào module.manifest. Route/feature sub-tab tham chiếu bằng
// ĐỊNH DANH (key), màn thực do app con tự điều hướng.

import type { LangCode } from './navLabels';
import type { NationalLang } from '../i18n/types';
import { getNationalLanguage } from './navLabels';

export interface SubTab {
  /** Định danh tab con (feature key trong app) — dùng cho active/onSelect/ghim. */
  key: string;
  /** Nhãn tiếng Anh — CHUẨN, hiển thị. */
  en: string;
  /** Nhãn ngôn ngữ quốc gia — `Record` đầy đủ, xem lý do ở `NavFrame.national`. */
  national: Record<NationalLang, string>;
  /** Icon Material Community. */
  icon: string;
}

// Khoá = route của app con (khớp NAV_FRAME / route tab dưới). THỨ TỰ khai = ưu
// tiên MẶC ĐỊNH: khi chưa có usage, top-N hiển thị lấy N phần tử ĐẦU; phần dư vào
// dropdown ⌄. usage re-rank; ghim đè.
export const SUBHOME_FRAME: Record<string, SubTab[]> = {
  // Chat (proofchat): hiện Chats · Calls · Pins + ⌄(Docs…).
  ProofChatHome: [
    { key: 'chats', en: 'Chats', national: { vi: 'Trò chuyện', zh: '聊天', ja: 'チャット' }, icon: 'chat-outline' },
    { key: 'calls', en: 'Calls', national: { vi: 'Gọi',        zh: '通话', ja: '通話' },     icon: 'phone-outline' },
    { key: 'pins',  en: 'Pins',  national: { vi: 'Ghim',       zh: '置顶', ja: 'ピン' },     icon: 'pin-outline' },
    { key: 'docs',  en: 'Docs',  national: { vi: 'Tài liệu',   zh: '文档', ja: '書類' },     icon: 'file-document-outline' },
  ],
  // Farm (trace): hiện Garden · Trees · Care + ⌄(Carbon…).
  Farms: [
    { key: 'garden', en: 'Garden', national: { vi: 'Vườn',     zh: '果园', ja: '果樹園' }, icon: 'sprout-outline' },
    { key: 'trees',  en: 'Trees',  national: { vi: 'Cây',      zh: '树木', ja: '樹木' },   icon: 'pine-tree' },
    { key: 'care',   en: 'Care',   national: { vi: 'Chăm sóc', zh: '养护', ja: '手入れ' }, icon: 'watering-can' },
    { key: 'carbon', en: 'Carbon', national: { vi: 'Carbon',   zh: '碳汇', ja: 'カーボン' }, icon: 'leaf' },
  ],
};

// Số tab con HIỂN THỊ mặc định trên khung thu gọn (§5.1: 3 tab quen + nút ⌄).
export const SUBHOME_VISIBLE_COUNT = 3;

// Chiều cao khung SubHome (§5.1: ~40dp, dính đỉnh).
export const SUBHOME_HEIGHT = 40;

// Khoá AsyncStorage cho ghim tab con theo app (§5.3): subhome_pinned_<app>.
export const subHomePinnedKey = (appRoute: string) => `subhome_pinned_${appRoute}`;

/** Nhãn EN (chuẩn) của một tab con. */
export function subEn(tab: SubTab): string {
  return tab.en;
}

/** Nhãn ngôn ngữ quốc gia (tooltip/accessibility) — fallback en. */
export function subNational(tab: SubTab, lang: LangCode = getNationalLanguage()): string {
  // lang === 'en' không có trong `national` → rơi về chính nhãn chuẩn.
  return (tab.national as Partial<Record<LangCode, string>>)[lang] ?? tab.en;
}

export interface RankedSubTabs {
  /** Tab hiển thị trên khung (tối đa SUBHOME_VISIBLE_COUNT). */
  visible: SubTab[];
  /** Tab dôi ra — nằm trong dropdown ⌄. */
  overflow: SubTab[];
}

/**
 * XẾP HẠNG tab con (§5.3): top-N theo usage; phần dư vào dropdown. Ghim ĐÈ (ghim
 * luôn hiển thị trước). HÀM THUẦN — không đọc store/AsyncStorage.
 *
 * Ổn định: usage bằng nhau → giữ THỨ TỰ KHAI BÁO (nên khi chưa có usage, top-N =
 * N phần tử đầu, khớp ví dụ spec).
 *
 * @param tabs   danh sách tab con của app (SUBHOME_FRAME[appRoute])
 * @param usage  tần suất mở từng key (mặc định {})
 * @param pinned danh sách key GHIM (đầu bảng), null = chưa ghim
 * @param visibleCount số ô hiển thị (mặc định SUBHOME_VISIBLE_COUNT)
 */
export function rankSubTabs(
  tabs: SubTab[],
  usage: Record<string, number> = {},
  pinned: string[] | null = null,
  visibleCount: number = SUBHOME_VISIBLE_COUNT,
): RankedSubTabs {
  const declIndex = new Map(tabs.map((t, i) => [t.key, i]));
  const pinnedSet = new Set(pinned ?? []);
  const pinnedRank = new Map((pinned ?? []).map((k, i) => [k, i]));

  const sorted = [...tabs].sort((a, b) => {
    // 1) Ghim trước (theo thứ tự ghim).
    const ap = pinnedSet.has(a.key);
    const bp = pinnedSet.has(b.key);
    if (ap !== bp) return ap ? -1 : 1;
    if (ap && bp) return (pinnedRank.get(a.key) ?? 0) - (pinnedRank.get(b.key) ?? 0);
    // 2) usage giảm dần.
    const au = usage[a.key] ?? 0;
    const bu = usage[b.key] ?? 0;
    if (au !== bu) return bu - au;
    // 3) hoà → thứ tự khai báo (ổn định).
    return (declIndex.get(a.key) ?? 0) - (declIndex.get(b.key) ?? 0);
  });

  return {
    visible: sorted.slice(0, visibleCount),
    overflow: sorted.slice(visibleCount),
  };
}
