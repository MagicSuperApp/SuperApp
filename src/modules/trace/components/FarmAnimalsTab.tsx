// modules/trace/components/FarmAnimalsTab.tsx
/**
 * TAB VẬT NUÔI của màn chi tiết vườn.
 *
 * ── Vì sao có tệp này ────────────────────────────────────────────────────────
 * Trước bản này lối vào đàn vật nuôi là MỘT Ô nhỏ nằm lọt giữa lưới Bento của
 * tab cây, cạnh ô "Chỉ đường tới vườn". Hai thứ đó không cùng loại: chỉ đường là
 * một việc làm xong trong một giây, còn vật nuôi là MỘT NỬA nội dung của vườn —
 * nó có danh sách riêng, bộ lọc riêng, luồng nhận diện riêng. Nhét một nhánh
 * ngang hàng với cây vào một ô hành động là nói sai kích thước của nó, và ô đó
 * còn tự ẩn hiện theo việc vườn đã vẽ ranh giới hay chưa — một nhánh nội dung
 * không được phép biến mất vì một lý do chẳng liên quan.
 *
 * Nay hai nhánh đứng ngang nhau ở thanh tab trên đầu màn, và tab này dựng theo
 * ĐÚNG luật Bento của tab cây (xem `BentoTile` trong `layered/Surface.tsx`):
 * một ô hero to nhất trả lời "vườn này đang nuôi gì", một hàng hai ô hành động,
 * rồi mới tới bản kiểm kê từng cá thể.
 *
 * ── Khác tab cây ở đâu, và vì sao ───────────────────────────────────────────
 * Hai ô ở hàng giữa của tab cây CỐ Ý không có nhãn: chúng vẽ chính mảnh vườn
 * này, nên hình đã là nhãn. Đàn vật nuôi KHÔNG có hình như vậy — không có ranh
 * giới nào để vẽ — nên hai ô ở đây quay lại lối biểu tượng + nhãn. Đó không
 * phải bước lùi khỏi luật; luật nói ô phải tự nói được nó mở ra cái gì, và khi
 * không có hình thật thì chữ là cách duy nhất nói được.
 *
 * ── Tải hết một lần, lọc tại máy ────────────────────────────────────────────
 * `listAnimals` phân trang theo `limit/offset`. Tab này gom HẾT các trang (tới
 * trần `TRAN_TAI`) rồi lọc/phân trang tại máy — cùng khuôn với danh sách cây.
 * Lọc tại máy trên một danh sách mới tải NỬA VỜI là kiểu sai im lặng tệ nhất:
 * gõ tên một con dê có thật mà màn báo "không tìm thấy", vì con đó nằm ở trang
 * chưa tải. Trần có thật thì nói ra — xem `quaTran`.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Dimensions, FlatList, Image, Modal, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import Icon from '../../../components/Icon';
import { COLORS } from '../../../constants';
import StateView from '../../../components/state/StateView';
import { listAnimals, type AnimalInfo } from '../../../services/animalReIDService';
import { ORILIFE_BASE } from '../../../services/orilifeBase';
import { speciesLabel } from '../../../constants/animalSpecies';
import {
  SURFACE as ORG_SURFACE, TONE as ORG_TONE, NATURE as ORG_NATURE,
  ORGANIC_TILE, SPACE as ORG_SPACE,
} from '../theme/depth';
import { GradientFill } from './layered/Organic';
import { BentoRow, BentoTile } from './layered/Surface';
import PaginationControls from './PaginationControls';
import AnimalWizard, { type AnimalFlowMode, ANH_TOI_THIEU } from './animal/AnimalWizard';
import AnhLoai from './animal/AnhLoai';
import { docAnhCaThe } from '../utils/animalPhotoCache';

const { width } = Dimensions.get('window');

/** 3 cột × 4 hàng. Cùng vai trò với `ITEMS_PER_PAGE` của danh sách cây. */
const MOI_TRANG = 12;

/** Mỗi lượt hỏi máy chủ. Lớn hơn `PAGE_SIZE` của màn quản lý vì ở đây tải gộp. */
const TRANG_MAY_CHU = 100;

/**
 * Trần số cá thể tải về. Vượt trần thì bộ lọc tại máy KHÔNG còn nói đúng nữa,
 * nên màn phải nói ra thay vì im lặng lọc trên một phần.
 */
const TRAN_TAI = 1000;

/**
 * Sắc phát sáng của ô tối nhánh vật nuôi — vàng-nâu ấm, KHÔNG phải xanh ngọc của
 * ô không gian bên tab cây. Hai nhánh, hai sắc; xem `NATURE.barn`.
 */
const SANG = '#F0C9A8';

/** Rút gọn DID cho chỗ hẹp: `did:ori:animal:ab12…cd34` → `ab12…cd34`. */
export function didNgan(did?: string): string {
  const s = (did ?? '').trim();
  if (!s) return '—';
  const duoi = s.split(':').pop() ?? s;
  return duoi.length > 14 ? `${duoi.slice(0, 6)}…${duoi.slice(-4)}` : duoi;
}

function ngayGon(iso?: string): string {
  if (!iso) return 'chưa rõ';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'chưa rõ' : d.toLocaleDateString('vi-VN');
}

// ── Thẻ một cá thể ───────────────────────────────────────────────────────────
/**
 * VUÔNG BO GÓC, ảnh chiếm phần trên, chữ nằm dưới. Không còn hình tròn.
 *
 * ── Vì sao bỏ hình tròn ─────────────────────────────────────────────────────
 * Nút tròn là khuôn của `TreeChip`, và ở đó nó có lý do: viền của hình tròn CHÍNH
 * LÀ thanh tiến độ thu hoạch, nên vòng và lòng là một vật. Bên vật nuôi không có
 * cung tiến độ nào đáng vẽ, nên hình tròn chỉ còn là một cái khung — mà khung
 * tròn thì cắt cụt bốn góc của thứ quan trọng nhất trên thẻ: mặt con vật.
 *
 * ── Ảnh lấy ở đâu ───────────────────────────────────────────────────────────
 * Ba nguồn, theo thứ tự:
 *
 *   1. ẢNH THẬT của chính con này, chụp lúc đăng ký trên máy này
 *      (`utils/animalPhotoCache.ts`). Máy chủ KHÔNG trả ảnh con vật, nên đây là
 *      tấm duy nhất app có — và chỉ có với con ghi trên chính máy này.
 *   2. ẢNH LOÀI (`speciesPhoto.ts`) — con gà chung cho mọi con gà.
 *   3. BIỂU TƯỢNG (`speciesFa.ts`) — khi loài đó chưa có ảnh.
 *
 * ⛔ Đường dẫn ở (1) có thể CHẾT: ảnh nằm trong vùng nhớ tạm của máy ảnh, Android
 *    dọn khi thiếu chỗ. Nên `onError` phải tụt xuống (2), không được để lại một ô
 *    trống — xem `hongAnh`.
 */
const AnimalCard = ({
  item, size, anhRieng, onPress,
}: {
  item: AnimalInfo;
  size: number;
  /** Ảnh thật của chính con này, nếu máy còn giữ. */
  anhRieng?: string;
  onPress: () => void;
}) => {
  const [hongAnh, setHongAnh] = useState(false);
  const ten = item.name?.trim() || 'Chưa đặt tên';
  const loai = speciesLabel(item.species);

  // Ảnh riêng chết thì tụt xuống ảnh loài; đổi con thì thử lại từ đầu.
  useEffect(() => { setHongAnh(false); }, [anhRieng]);
  const dungAnhRieng = !!anhRieng && !hongAnh;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.the, { width: size }]}
      accessibilityRole="button"
      accessibilityLabel={
        `${ten}, ${loai}, ` +
        (item.n_images == null ? 'chưa rõ số ảnh' : `${item.n_images} ảnh`)
      }
    >
      <View style={styles.theAnh}>
        {dungAnhRieng ? (
          <Image
            source={{ uri: anhRieng }}
            style={styles.theAnhPhu}
            /* `cover`: đây là ảnh chụp thật, lấp đầy ô vuông thì thẻ mới ra thẻ.
               Ảnh LOÀI thì ngược lại — xem dưới. */
            resizeMode="cover"
            fadeDuration={0}
            onError={() => setHongAnh(true)}
          />
        ) : (
          /* Không có ảnh riêng thì về ảnh LOÀI, và `AnhLoai` lo nốt nhánh
             "loài chưa có ảnh" → biểu tượng. Cạnh 84% ô để con vật không chạm
             mép; ô ảnh vuông theo bề ngang thẻ nên suy thẳng từ `size`. */
          <AnhLoai species={item.species} size={size * 0.84} color={ORG_TONE.barn} />
        )}

        {/* Huy hiệu số ảnh — ở GÓC, đè lên ảnh, không chiếm một hàng riêng.
            `null` là CHƯA BIẾT chứ không phải 0, nên nó ra một dấu hỏi. */}
        <View style={styles.theHuyHieu}>
          <Icon name="image" size={9} color={ORG_NATURE.paper} />
          <Text style={styles.theHuyHieuTxt}>
            {item.n_images == null ? '?' : item.n_images}
          </Text>
        </View>
      </View>

      <View style={styles.theChu}>
        <Text style={styles.theTen} numberOfLines={1}>{ten}</Text>
        <Text style={styles.theLoai} numberOfLines={1}>{loai}</Text>
      </View>
    </TouchableOpacity>
  );
};

// ── Tab ──────────────────────────────────────────────────────────────────────

const FarmAnimalsTab = ({
  farmId,
  chuaDay,
}: {
  /** Mã vườn THẬT. Thiếu nó thì danh sách liệt kê vật nuôi của MỌI vườn. */
  farmId: string;
  /** Chỗ chừa cho thanh hành động nổi ở đáy — đo bởi màn cha. */
  chuaDay: number;
}) => {
  const navigation = useNavigation<any>();

  const [dan, setDan] = useState<AnimalInfo[]>([]);
  const [tong, setTong] = useState<number | null>(null);
  const [dangTai, setDangTai] = useState(true);
  const [dangLamMoi, setDangLamMoi] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [tim, setTim] = useState('');
  const [locLoai, setLocLoai] = useState<string>('');
  const [trang, setTrang] = useState(1);
  const [dangXem, setDangXem] = useState<AnimalInfo | null>(null);

  /**
   * Luồng đang mở trong tấm trượt nhiều bước, `null` = đóng.
   *
   * ⛔ Hai ô này TỪNG điều hướng sang `AnimalIdentity`/`AnimalEnroll`. Lối đăng
   *    ký hỏng câm vì màn đó đòi ĐỦ `species` + `farmId` và `goBack()` ngay khi
   *    thiếu một cái — mà tab này không thể biết trước người dùng sắp ghi con
   *    gì. Bấm vào là mở một màn rồi bị đá về: nhìn đúng như trang tự tải lại.
   *    Nay loài là bước MỘT của tấm trượt, nên không còn tham số nào để thiếu.
   */
  const [luong, setLuong] = useState<AnimalFlowMode | null>(null);

  /**
   * Ảnh thật của từng cá thể, giữ trên máy — máy chủ không trả ảnh con vật nào.
   * Rỗng là chuyện BÌNH THƯỜNG (máy khác ghi, hoặc mới cài lại): thẻ rơi về ảnh
   * loài. Xem `utils/animalPhotoCache.ts`.
   */
  const [anhRieng, setAnhRieng] = useState<Record<string, string>>({});

  /** Chặn hai lượt tải chồng nhau khi màn được focus lại giữa lúc đang tải. */
  const dangChay = useRef(false);

  const tai = useCallback(async (lamMoi = false) => {
    if (dangChay.current) return;
    dangChay.current = true;
    if (lamMoi) setDangLamMoi(true); else setDangTai(true);
    setLoi(null);

    const gom: AnimalInfo[] = [];
    let tongMayChu: number | null = null;
    let offset = 0;
    let batLoi: string | null = null;

    // Gom hết các trang: lọc tại máy chỉ đúng khi danh sách tại máy là đủ.
    for (;;) {
      const kq = await listAnimals(ORILIFE_BASE, farmId, undefined, TRANG_MAY_CHU, offset);
      if (!kq.ok) {
        batLoi = kq.error?.detail || 'Không tải được danh sách vật nuôi.';
        break;
      }
      const lo = kq.animals ?? [];
      gom.push(...lo);
      if (typeof kq.total === 'number') tongMayChu = kq.total;
      offset += lo.length;
      if (lo.length < TRANG_MAY_CHU || gom.length >= TRAN_TAI) break;
    }

    // Lượt hỏi hỏng ở TRANG ĐẦU là không có dữ liệu; hỏng ở trang sau thì phần
    // đã gom vẫn dùng được — nhưng nó KHÔNG đủ, nên vẫn phải báo.
    if (batLoi && gom.length === 0) {
      setLoi(batLoi);
    } else {
      setDan(gom);
      setTong(tongMayChu);
      if (batLoi) setLoi(batLoi);
    }
    setDangTai(false);
    setDangLamMoi(false);
    dangChay.current = false;
  }, [farmId]);

  // Nạp lại bảng ảnh cùng nhịp với sổ đàn: vừa đăng ký xong một con là bảng có
  // thêm một mục, và thẻ của con đó phải mang ảnh thật ngay chứ không đợi lần
  // mở màn sau.
  useEffect(() => { docAnhCaThe().then(setAnhRieng); }, [dan.length]);

  // Tải lại mỗi lần quay về màn: người dùng vừa đi đăng ký một cá thể mới xong,
  // và danh sách cũ ở đây sẽ nói rằng việc đó chưa xảy ra.
  useFocusEffect(
    useCallback(() => {
      tai();
    }, [tai]),
  );

  /** Đếm theo loài — dựng trên TOÀN đàn, không trên kết quả lọc. */
  const coCau = useMemo(() => {
    const dem = new Map<string, number>();
    for (const c of dan) {
      const k = (c.species ?? '').trim().toLowerCase() || 'unknown';
      dem.set(k, (dem.get(k) ?? 0) + 1);
    }
    return [...dem.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([khoa, so]) => ({ khoa, so }));
  }, [dan]);

  const daLoc = useMemo(() => {
    const q = tim.trim().toLowerCase();
    return dan.filter((c) => {
      if (locLoai && (c.species ?? '').trim().toLowerCase() !== locLoai) return false;
      if (!q) return true;
      return (
        (c.name ?? '').toLowerCase().includes(q) ||
        (c.animal_did ?? '').toLowerCase().includes(q) ||
        speciesLabel(c.species).toLowerCase().includes(q)
      );
    });
  }, [dan, tim, locLoai]);

  const tongTrang = Math.ceil(daLoc.length / MOI_TRANG);
  const tuIdx = (trang - 1) * MOI_TRANG;
  const denIdx = tuIdx + MOI_TRANG;
  const trangHienTai = daLoc.slice(tuIdx, denIdx);

  /**
   * Đường kính nút trong lưới BA cột — suy từ bề ngang màn, cùng công thức với
   * lưới cây (lề 12 mỗi bên, HAI khe 12 giữa ba cột). Đổi số cột mà quên đổi số
   * khe ở đây thì cột cuối tràn ÂM THẦM khỏi mép phải.
   */
  const coNut = Math.floor((width - 12 * 2 - 12 * 2) / 3);

  const quaTran = dan.length >= TRAN_TAI;
  const soHien = tong ?? dan.length;

  const moNhanDien = () => setLuong('identify');
  const moDangKy = () => setLuong('enroll');

  const bento = (
    <View style={styles.bento}>
      {/* Dòng thông tin phụ — nhỏ, không viền, không bấm được. Cùng vai trò với
          dòng "quả · diện tích" của tab cây. */}
      <View style={styles.facts}>
        <Icon name="paw" size={13} color={ORG_TONE.barn} />
        <Text style={styles.factTxt}>
          {dan.length === 0 ? (
            <Text style={styles.factHint}>chưa có cá thể nào</Text>
          ) : (
            <>{soHien.toLocaleString('vi-VN')} cá thể</>
          )}
        </Text>
        {coCau.length > 0 ? (
          <>
            <View style={styles.factDot} />
            <Icon name="chart-simple" size={13} color={ORG_TONE.rain} />
            <Text style={styles.factTxt}>{coCau.length} loài</Text>
          </>
        ) : null}
        {quaTran ? (
          <>
            <View style={styles.factDot} />
            <Text style={styles.factHint}>chỉ hiện {TRAN_TAI} cá thể đầu</Text>
          </>
        ) : null}
      </View>

      {/* Ô CHÍNH — cơ cấu đàn. Người mở tab này hỏi "vườn đang nuôi những gì,
          mỗi thứ bao nhiêu" trước khi hỏi về một con cụ thể; danh sách từng cá
          thể là bản kiểm kê và nó đã nằm ngay dưới. */}
      <BentoTile tone="heroBarn" style={styles.hero}>
        <View style={styles.heroHead}>
          <Icon name="paw" size={18} color={ORG_TONE.barn} />
          <Text style={styles.heroTitle}>Cơ cấu đàn</Text>
        </View>
        {coCau.length === 0 ? (
          <Text style={styles.heroTrong}>
            {dangTai ? 'Đang đọc sổ đàn…' : 'Chưa ghi cá thể nào cho vườn này.'}
          </Text>
        ) : (
          <View style={styles.heroBang}>
            {coCau.map(({ khoa, so }) => (
              <View key={khoa} style={styles.heroHang}>
                <AnhLoai species={khoa} size={18} color={ORG_TONE.barn} />
                <Text style={styles.heroNhan} numberOfLines={1}>{speciesLabel(khoa)}</Text>
                {/* Thanh tỉ lệ so với loài ĐÔNG NHẤT, không so với tổng: mắt đọc
                    được "loài nào nhiều hơn loài nào" ngay cả khi đàn lệch hẳn
                    về một loài. */}
                <View style={styles.heroThanh}>
                  <View
                    style={[
                      styles.heroThanhDay,
                      { width: `${Math.max(6, (so / coCau[0].so) * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.heroSo}>{so}</Text>
              </View>
            ))}
          </View>
        )}
      </BentoTile>

      {/*
        HAI Ô HÀNH ĐỘNG.

        Ô TỐI là nhận diện — nó là việc KHÁC LOẠI với mọi thứ còn lại trên trang:
        mở máy ảnh, hỏi máy chủ, trả về một cá thể. Luật Bento cho phép đúng một
        ô tối mỗi trang, và trang này dùng nó ở đây.
      */}
      <BentoRow style={styles.hanh}>
        <BentoTile flex={1} tone="earth" onPress={moNhanDien} style={styles.o}>
          <Icon name="camera" size={26} color={SANG} />
          <Text style={styles.oTxtToi}>Nhận diện vật nuôi</Text>
          <Text style={styles.oPhuToi}>chụp để tìm ra cá thể</Text>
        </BentoTile>
        <BentoTile flex={1} tone="barn" onPress={moDangKy} style={styles.o}>
          <Icon name="circle-plus" size={26} color={ORG_TONE.barn} />
          <Text style={styles.oTxt}>Thêm cá thể</Text>
          <Text style={styles.oPhu}>cần ít nhất {ANH_TOI_THIEU} ảnh</Text>
        </BentoTile>
      </BentoRow>

      {/* Tiêu đề danh sách — số cá thể về đây, cạnh chính danh sách nó đếm. */}
      <View style={styles.mucDau}>
        <View style={styles.mucTrai}>
          <View style={styles.mucCham} />
          <Text style={styles.mucTen}>Sổ đàn</Text>
          <Text style={styles.mucSo}>{daLoc.length}</Text>
        </View>
        <TouchableOpacity style={styles.themBtn} onPress={moDangKy} activeOpacity={0.8}>
          <View style={styles.themBtnTrong}>
            <Icon name="plus" size={16} color={ORG_TONE.barnDeep} />
            <Text style={styles.themBtnTxt}>Thêm</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.timBoc}>
        <Icon name="magnifying-glass" size={18} color={COLORS.textMuted} />
        <TextInput
          style={styles.timO}
          placeholder="Tìm theo tên, loài, mã…"
          placeholderTextColor={COLORS.textMuted}
          value={tim}
          onChangeText={(v) => { setTim(v); setTrang(1); }}
        />
        {tim.length > 0 ? (
          <TouchableOpacity
            onPress={() => { setTim(''); setTrang(1); }}
            hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
          >
            <Icon name="circle-xmark" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Chip lọc loài — CHỈ những loài đàn này thật sự có. Bày đủ sáu loài của
          danh mục là bày ra năm cái nút bấm vào chỉ để thấy danh sách rỗng. */}
      {coCau.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipHang}
        >
          {[{ khoa: '', so: dan.length }, ...coCau].map(({ khoa, so }) => {
            const on = locLoai === khoa;
            return (
              <TouchableOpacity
                key={khoa || 'tat-ca'}
                style={[styles.chipLoc, on && styles.chipLocOn]}
                onPress={() => { setLocLoai(khoa); setTrang(1); }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${khoa ? speciesLabel(khoa) : 'Tất cả'}, ${so} cá thể`}
              >
                {/* Ảnh loài làm biểu tượng. Ô "Tất cả" KHÔNG có ảnh nào đại diện
                    được — nó là cả sáu loài — nên nó giữ biểu tượng bàn chân. */}
                {khoa ? (
                  <AnhLoai
                    species={khoa}
                    size={22}
                    color={on ? ORG_TONE.barnDeep : ORG_NATURE.barkSoft}
                  />
                ) : (
                  <Icon name="paw" size={14} color={on ? ORG_TONE.barnDeep : ORG_NATURE.barkSoft} />
                )}
                <Text style={[styles.chipLocTxt, on && styles.chipLocTxtOn]}>
                  {khoa ? speciesLabel(khoa) : 'Tất cả'}
                </Text>
                {/* Con số thành HUY HIỆU, không còn là chữ dính đuôi nhãn. Dính
                    đuôi thì "Gà 12" đọc ra một cái tên, và mắt phải tách nó ra
                    mới thấy 12 là số lượng. */}
                <View style={[styles.chipLocSo, on && styles.chipLocSoOn]}>
                  <Text style={[styles.chipLocSoTxt, on && styles.chipLocSoTxtOn]}>{so}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );

  return (
    <View style={styles.goc}>
      <FlatList
        data={trangHienTai}
        keyExtractor={(c) => c.animal_did}
        numColumns={3}
        columnWrapperStyle={styles.hangLuoi}
        contentContainerStyle={styles.noiDung}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={bento}
        refreshControl={
          <RefreshControl
            refreshing={dangLamMoi}
            onRefresh={() => tai(true)}
            tintColor={ORG_TONE.barn}
          />
        }
        renderItem={({ item }) => (
          <AnimalCard
            item={item}
            size={coNut}
            anhRieng={anhRieng[item.animal_did]}
            onPress={() => setDangXem(item)}
          />
        )}
        ListEmptyComponent={
          dangTai ? (
            <View style={styles.dangTai}>
              <ActivityIndicator size="large" color={ORG_TONE.barn} />
              <Text style={styles.dangTaiTxt}>Đang đọc sổ đàn…</Text>
            </View>
          ) : loi && dan.length === 0 ? (
            /* Danh sách rỗng vì KHÔNG HỎI ĐƯỢC máy chủ là một màn KHÁC với đàn
               rỗng thật. "Vườn chưa có vật nuôi" là một khẳng định về dữ liệu
               của người dùng; app chỉ được nói câu đó khi nó hỏi được. */
            <StateView
              status="error"
              title="Không tải được sổ đàn"
              message={loi}
              onRetry={() => tai()}
            />
          ) : dan.length === 0 ? (
            <StateView
              status="empty"
              title="Vườn chưa có vật nuôi"
              message="Đăng ký cá thể đầu tiên để nhận diện và truy xuất."
              actionLabel="Thêm cá thể đầu tiên"
              onAction={moDangKy}
            />
          ) : (
            <View style={styles.khongThay}>
              <Icon name="magnifying-glass-minus" size={48} color={COLORS.textMuted} />
              <Text style={styles.khongThayTxt}>Không tìm thấy cá thể</Text>
            </View>
          )
        }
        ListFooterComponent={
          <View>
            {daLoc.length > 0 ? (
              <PaginationControls
                currentPage={trang}
                totalPages={tongTrang}
                startIndex={tuIdx}
                endIndex={denIdx}
                totalItems={daLoc.length}
                onPreviousPage={() => setTrang((p) => Math.max(1, p - 1))}
                onNextPage={() => setTrang((p) => Math.min(tongTrang, p + 1))}
              />
            ) : null}
            {/* Lượt hỏi hỏng GIỮA CHỪNG: có dữ liệu để xem, nhưng nó thiếu — và
                một danh sách thiếu mà không nói gì là một danh sách nói dối. */}
            {loi && dan.length > 0 ? (
              <TouchableOpacity style={styles.loiMot} onPress={() => tai()} activeOpacity={0.8}>
                <Icon name="triangle-exclamation" size={14} color={ORG_TONE.sun} />
                <Text style={styles.loiMotTxt}>Danh sách có thể còn thiếu — chạm để tải lại</Text>
              </TouchableOpacity>
            ) : null}
            <View style={{ height: chuaDay }} />
          </View>
        }
      />

      {/* POPUP MỘT CÁ THỂ — cùng nhịp với popup cây: quét mắt qua lưới, chạm xem
          nhanh, chạm con kế. Màn chi tiết vẫn ở đó, sau MỘT nút. */}
      <Modal
        visible={dangXem != null}
        transparent
        animationType="fade"
        onRequestClose={() => setDangXem(null)}
      >
        <Pressable style={styles.popupNen} onPress={() => setDangXem(null)} />
        <View style={styles.popupBoc} pointerEvents="box-none">
          <View style={styles.popup}>
            <GradientFill name="tile" />

            <View style={styles.popupDau}>
              {/* Cùng ba nguồn ảnh với thẻ trong lưới, cùng thứ tự — hai chỗ bày
                  cùng một con thì phải bày cùng một hình. */}
              <View style={styles.popupAnh}>
                {dangXem && anhRieng[dangXem.animal_did] ? (
                  <Image
                    source={{ uri: anhRieng[dangXem.animal_did] }}
                    style={styles.popupAnhPhu}
                    resizeMode="cover"
                    fadeDuration={0}
                  />
                ) : (
                  <AnhLoai species={dangXem?.species} size={54} color={ORG_TONE.barn} />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.popupTen} numberOfLines={2}>
                  {dangXem?.name?.trim() || 'Chưa đặt tên'}
                </Text>
                <Text style={styles.popupPhu}>
                  {dangXem?.n_images == null
                    ? 'chưa rõ số ảnh trong hồ sơ'
                    : dangXem.n_images >= ANH_TOI_THIEU
                      ? 'hồ sơ ảnh đã đủ để nhận diện'
                      : `thiếu ${ANH_TOI_THIEU - dangXem.n_images} ảnh để nhận diện`}
                </Text>
              </View>
            </View>

            <View style={styles.popupBang}>
              {[
                { nhan: 'Loài', gt: speciesLabel(dangXem?.species) },
                { nhan: 'Mã định danh', gt: didNgan(dangXem?.animal_did) },
                {
                  nhan: 'Ảnh trong hồ sơ',
                  gt: dangXem?.n_images == null ? 'chưa rõ' : String(dangXem.n_images),
                },
                { nhan: 'Ghi sổ ngày', gt: ngayGon(dangXem?.created_at) },
              ].map((d) => (
                <View key={d.nhan} style={styles.popupHang}>
                  <Text style={styles.popupNhan}>{d.nhan}</Text>
                  <Text style={styles.popupGt} numberOfLines={1}>{d.gt}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.popupNut}
              activeOpacity={0.88}
              onPress={() => {
                const c = dangXem;
                setDangXem(null);
                if (c) navigation.navigate('AnimalDetail', { animalDid: c.animal_did });
              }}
            >
              <GradientFill name="actionBarn" />
              <Text style={styles.popupNutTxt}>Xem chi tiết</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* LUỒNG NHIỀU BƯỚC — nhận diện và ghi sổ, cùng một tấm trượt.
          `farmId` truyền sẵn nên bước chọn vườn tự biến mất: hỏi lại một câu đã
          có trả lời là thêm một bước vô nghĩa. `onChanged` làm mới sổ đàn ngay
          tại chỗ — không điều hướng đi đâu nên cũng không có gì phải tải lại. */}
      <AnimalWizard
        visible={luong != null}
        mode={luong ?? 'identify'}
        farmId={farmId}
        onClose={() => setLuong(null)}
        onChanged={() => tai(true)}
        onOpenAnimal={(did) => navigation.navigate('AnimalDetail', { animalDid: did })}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  goc: { flex: 1 },
  noiDung: { paddingHorizontal: 12, paddingTop: 4, flexGrow: 1 },
  /**
   * Lề ÂM để phần đầu Bento trải rộng bằng mép màn: `contentContainerStyle` đã
   * chừa 12 mỗi bên cho lưới nút, mà các ô Bento tự mang lề 12 của riêng chúng
   * (`BentoRow`). Không trừ lại thì phần đầu thụt vào 24 còn lưới thụt 12 — một
   * mép lệch mà mắt bắt được ngay dù không gọi tên ra được.
   */
  bento: { paddingBottom: 2, marginHorizontal: -12 },
  hangLuoi: { gap: 12, marginBottom: 12 },

  facts: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingBottom: ORG_SPACE.sm,
  },
  factTxt: { fontSize: 13, color: ORG_NATURE.barkSoft },
  factHint: { fontStyle: 'italic', color: ORG_NATURE.barkSoft },
  factDot: {
    width: 3, height: 3, borderRadius: 2,
    backgroundColor: ORG_TONE.border, marginHorizontal: 2,
  },

  hero: { marginHorizontal: 12, paddingHorizontal: 0, paddingVertical: ORG_SPACE.md },
  heroHead: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: ORG_SPACE.md, paddingBottom: ORG_SPACE.sm,
  },
  heroTitle: {
    fontSize: 17, fontWeight: '700', color: ORG_NATURE.bark, letterSpacing: -0.2,
  },
  heroTrong: {
    fontSize: 14, color: ORG_NATURE.barkSoft, fontStyle: 'italic',
    paddingHorizontal: ORG_SPACE.md, paddingVertical: 6,
  },
  heroBang: { paddingHorizontal: ORG_SPACE.md, gap: 9 },
  heroHang: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroNhan: { fontSize: 14, fontWeight: '600', color: ORG_NATURE.bark, width: 56 },
  heroThanh: {
    flex: 1, height: 7, borderRadius: 4,
    backgroundColor: 'rgba(18, 38, 46, 0.06)', overflow: 'hidden',
  },
  heroThanhDay: { height: '100%', borderRadius: 4, backgroundColor: ORG_TONE.barn },
  heroSo: {
    fontSize: 14, fontWeight: '700', color: ORG_NATURE.bark,
    minWidth: 26, textAlign: 'right',
  },

  hanh: { marginTop: 8, marginBottom: ORG_SPACE.lg },
  o: { minHeight: 104, alignItems: 'center', justifyContent: 'center', gap: 6 },
  oTxt: {
    fontSize: 14, fontWeight: '700', color: ORG_NATURE.bark, textAlign: 'center',
  },
  oPhu: { fontSize: 11, color: ORG_NATURE.barkSoft, textAlign: 'center' },
  // Ô `tone="space"` là nền TỐI: chữ trong nó PHẢI sáng. Ô không tự đổi màu chữ
  // của con — nó không biết con là chữ, biểu tượng hay ảnh.
  oTxtToi: {
    fontSize: 14, fontWeight: '700', color: ORG_NATURE.paper, textAlign: 'center',
  },
  oPhuToi: { fontSize: 11, color: 'rgba(255,255,255,0.72)', textAlign: 'center' },

  mucDau: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, marginBottom: 8,
  },
  mucTrai: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mucCham: { width: 6, height: 6, borderRadius: 3, backgroundColor: ORG_TONE.barn },
  mucTen: {
    fontSize: 19, fontWeight: '700', color: ORG_NATURE.bark, letterSpacing: -0.2,
  },
  mucSo: { fontSize: 14, fontWeight: '700', color: ORG_NATURE.barkSoft, marginLeft: 2 },
  themBtn: { overflow: 'hidden', borderRadius: 10 },
  themBtnTrong: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: ORG_TONE.barnSoft,
    borderWidth: 1, borderColor: ORG_TONE.border,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
  },
  themBtnTxt: { fontSize: 13, fontWeight: '600', color: ORG_TONE.barnDeep },

  timBoc: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: ORG_SURFACE.raised,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    marginHorizontal: 12, marginBottom: 10,
    borderWidth: 1, borderColor: ORG_TONE.border, gap: 8,
  },
  timO: { flex: 1, fontSize: 14, color: COLORS.text, paddingVertical: 4 },

  chipHang: { gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  chipLoc: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingLeft: 8, paddingRight: 8, paddingVertical: 6, borderRadius: 999,
    backgroundColor: ORG_SURFACE.raised,
    borderWidth: 1, borderColor: ORG_TONE.border,
  },
  chipLocOn: { backgroundColor: ORG_TONE.barnSoft, borderColor: ORG_TONE.barn },
  chipLocTxt: { fontSize: 13, fontWeight: '600', color: ORG_NATURE.barkSoft },
  chipLocTxtOn: { color: ORG_TONE.barnDeep },
  /** Huy hiệu số — tròn, nền chìm, để con số tách hẳn khỏi nhãn. */
  chipLocSo: {
    minWidth: 20, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: ORG_SURFACE.sunken,
  },
  chipLocSoOn: { backgroundColor: ORG_TONE.barn },
  chipLocSoTxt: { fontSize: 11, fontWeight: '800', color: ORG_NATURE.barkSoft },
  chipLocSoTxtOn: { color: ORG_NATURE.paper },

  // ── Thẻ một cá thể: vuông bo góc, ảnh trên, chữ dưới ───────────────────────
  the: {
    borderRadius: 16, overflow: 'hidden',
    backgroundColor: ORG_SURFACE.raised,
    borderWidth: 1, borderColor: ORG_TONE.border,
  },
  /**
   * Ô ảnh VUÔNG (`aspectRatio: 1`), không gõ chiều cao: bề ngang thẻ suy từ bề
   * ngang màn, nên một con số cố định sẽ méo trên máy hẹp hoặc máy rộng.
   */
  theAnh: {
    width: '100%', aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: ORG_TONE.barnSoft,
  },
  /** Ảnh chụp thật — lấp đầy ô. */
  theAnhPhu: { width: '100%', height: '100%' },
  theHuyHieu: {
    position: 'absolute', top: 6, right: 6,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999,
    backgroundColor: 'rgba(18, 38, 46, 0.55)',
  },
  theHuyHieuTxt: { fontSize: 10, fontWeight: '800', color: ORG_NATURE.paper },
  theChu: { paddingHorizontal: 8, paddingTop: 6, paddingBottom: 8, gap: 1 },
  theTen: {
    fontSize: 12, fontWeight: '700', color: ORG_NATURE.bark, letterSpacing: -0.2,
  },
  theLoai: { fontSize: 11, color: ORG_NATURE.barkSoft },

  /** Ảnh trong popup — cùng ô vuông bo góc với thẻ trong lưới. */
  popupAnh: {
    width: 64, height: 64, borderRadius: 14, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: ORG_TONE.barnSoft,
  },
  popupAnhPhu: { width: '100%', height: '100%' },

  dangTai: { alignItems: 'center', paddingTop: 56, gap: 10 },
  dangTaiTxt: { fontSize: 14, color: COLORS.textMuted },
  khongThay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  khongThayTxt: { fontSize: 16, color: COLORS.textMuted, marginTop: 12, fontWeight: '500' },

  loiMot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 12, marginTop: 4,
  },
  loiMotTxt: { fontSize: 13, color: ORG_NATURE.barkSoft },

  popupNen: { ...StyleSheet.absoluteFillObject, backgroundColor: ORG_SURFACE.scrim },
  popupBoc: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  popup: {
    width: '100%', maxWidth: 420, overflow: 'hidden',
    backgroundColor: ORG_SURFACE.raised, ...ORGANIC_TILE, padding: 18,
  },
  popupDau: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  popupTen: {
    fontSize: 19, fontWeight: '700', color: ORG_NATURE.bark, letterSpacing: -0.3,
  },
  popupPhu: { fontSize: 13, color: ORG_NATURE.barkSoft, marginTop: 2 },
  popupBang: { gap: 2, marginBottom: 14 },
  popupHang: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 7, gap: 12,
  },
  popupNhan: { fontSize: 14, color: ORG_NATURE.barkSoft },
  popupGt: { fontSize: 14, fontWeight: '700', color: ORG_NATURE.bark, flexShrink: 1 },
  popupNut: {
    overflow: 'hidden', borderRadius: 14, paddingVertical: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  popupNutTxt: { fontSize: 15, fontWeight: '700', color: COLORS.white },
});

export default FarmAnimalsTab;
