// modules/trace/components/animal/AnimalWizard.tsx
/**
 * LUỒNG VẬT NUÔI — nhận diện và đăng ký, chia thành BƯỚC, dựng trong một tấm
 * trượt từ đáy thay vì hai màn hình riêng.
 *
 * ── Bốn thứ hỏng mà tệp này sinh ra để sửa ──────────────────────────────────
 *
 * 1. NÚT "THÊM CÁ THỂ" MỞ RA RỒI ĐÓNG NGAY. `AnimalEnrollScreen` đòi ĐỦ CẢ HAI
 *    `species` + `farmId`, thiếu một cái là `goBack()` ngay trong `useEffect`
 *    đầu tiên. Tab vật nuôi chỉ cầm `farmId` (nó không thể biết người dùng sắp
 *    ghi con gì), nên mỗi lượt bấm là mở một màn rồi bị đá về — nhìn đúng như
 *    trang tự tải lại. Hỏng CÂM: không lỗi, không log, không màn nào đỏ.
 *
 *    Ở đây loài là BƯỚC MỘT. Không còn tham số bắt buộc nào để mà thiếu.
 *
 * 2. NHẬN DIỆN MỞ ĐƯỢC KHI ĐÀN CÒN RỖNG. Máy chủ trả `EMPTY_FARM` cho ca đó,
 *    tức app bắt người dùng chọn loài, mở máy ảnh, chụp, chờ tải ảnh lên — rồi
 *    mới nói "vườn này chưa có con nào để so". Nay app HỎI TRƯỚC KHI CHỤP
 *    (`listAnimals` với đúng loài + đúng vườn) và nếu đàn rỗng thì nói ngay,
 *    kèm lối rẽ sang đăng ký. Xem bước `chup`.
 *
 * 3. MỘT BIỂU MẪU DÀI. Cả hai màn cũ bày mọi thứ cùng lúc: loài, vườn, ảnh,
 *    tên, nút gửi. Người cầm máy ngoài chuồng phải tự tìm xem còn thiếu gì.
 *    Chia bước thì mỗi khung hình hỏi đúng một câu, và nút "Tiếp" tự khoá khi
 *    câu đó chưa có trả lời.
 *
 * 4. ẢNH VỪA CHỤP HIỆN RA MỘT MẢNG ĐEN. Nền của khung xem trước là `#000`, nên
 *    khi `Image` không đọc được URI thì thứ người dùng thấy là một hình chữ
 *    nhật đen — không một chữ nào nói vì sao. Xem `AnhChup`: nền sáng, có
 *    `onError`, và có ĐƯỜNG DỰ PHÒNG sang `originalPath` của Android.
 *
 * ── Vì sao là tấm trượt, không phải màn hình ────────────────────────────────
 * Cả hai luồng đều là "hỏi vài câu rồi làm một việc", và làm xong thì người
 * dùng phải quay lại ĐÚNG chỗ họ vừa đứng — sổ đàn của một vườn. Một màn hình
 * đẩy chồng lên ngăn xếp làm mất chỗ đứng đó, và mỗi lần quay về là một lượt
 * dựng lại cả màn chi tiết vườn.
 *
 * ── Sắc NÂU ────────────────────────────────────────────────────────────────
 * Nền và nút ở đây dùng chuyển sắc nâu (`GRADIENT.actionBarn`, `GRADIENT.earth`)
 * chứ không dùng xanh lá của module. Xanh lá là màu nhánh CÂY TRỒNG; nâu là màu
 * bốn màn vật nuôi đã mang từ đầu. Giữ nó là giữ cho người dùng biết mình đang
 * đứng ở nhánh nào mà không phải đọc tiêu đề — xem `NATURE.barn` trong
 * `theme/depth.ts`.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '../../../../components/Icon';
import { SPECIES_KEYS, speciesLabel } from '../../../../constants/animalSpecies';
import {
  enrollAnimal, identifyAnimal, listAnimals,
  type AnimalIdentifyResponse,
} from '../../../../services/animalReIDService';
import { ORILIFE_BASE } from '../../../../services/orilifeBase';
import { withPhotoSave } from '../../../../services/mediaSavePermission';
import { showError, showWarning } from '../../../../utils/alert';
import {
  ELEVATION as ORG_ELEV, NATURE as ORG_NATURE, ORGANIC_TILE,
  SPACE as ORG_SPACE, SURFACE as ORG_SURFACE, TONE as ORG_TONE,
} from '../../theme/depth';
import { GradientFill } from '../layered/Organic';
import { luuAnhCaThe } from '../../utils/animalPhotoCache';
import { hinhLoai } from './speciesFa';
import { anhLoai } from './speciesPhoto';

const imagePicker = (() => {
  try { return require('react-native-image-picker'); } catch { return null; }
})();

const CAMERA_OPTIONS = {
  mediaType: 'photo' as const,
  quality: 0.85,
  maxWidth: 1280,
  maxHeight: 1280,
  saveToPhotos: true,
  includeBase64: false,
};

/** Khớp máy chủ — xem `AnimalEnrollScreen`. Dưới mức này hồ sơ không nhận diện được. */
export const ANH_TOI_THIEU = 3;
export const ANH_TOI_DA = 10;

export type AnimalFlowMode = 'identify' | 'enroll';

/** Một ảnh đã chụp, KÈM đường dự phòng — xem `AnhChup`. */
type Anh = { uri: string; duPhong?: string };

/**
 * Các bước, theo thứ tự. `vuon` bị cắt khi nơi gọi đã biết vườn (mở từ trong sổ
 * đàn của một vườn): hỏi lại một câu đã có trả lời là thêm một bước vô nghĩa.
 */
const BUOC_THEO_CHE: Record<AnimalFlowMode, readonly string[]> = {
  identify: ['loai', 'vuon', 'chup'],
  enroll: ['loai', 'vuon', 'anh', 'ten'],
};

const TIEU_DE_BUOC: Record<string, string> = {
  loai: 'Con gì?',
  vuon: 'Ở vườn nào?',
  chup: 'Chụp để nhận diện',
  anh: 'Chụp hồ sơ ảnh',
  ten: 'Đặt tên và kiểm lại',
  ketqua: 'Kết quả',
};

// ── Ảnh đã chụp ──────────────────────────────────────────────────────────────
/**
 * ⛔ MỘT MẢNG ĐEN KHÔNG PHẢI MỘT TRẠNG THÁI.
 *
 * Khung xem trước cũ có `backgroundColor: '#000'` và không bắt `onError`. Khi
 * `Image` không đọc được URI — chuyện có thật trên Android, nơi máy ảnh trả một
 * `content://` mà lớp đọc ảnh của RN không phải lúc nào cũng mở được — thứ hiện
 * ra là đúng cái nền đen ấy. Người dùng thấy "ảnh đen thui" và không có cách nào
 * biết được rằng ảnh vẫn nằm nguyên trong máy.
 *
 * Ở đây: nền SÁNG, có `onError`, và trước khi bỏ cuộc thì thử `originalPath` —
 * đường tệp thật mà `react-native-image-picker` trả kèm trên Android. Hết đường
 * thì nói ra bằng chữ, vì một dòng chữ còn sửa được, một mảng đen thì không.
 */
const AnhChup: React.FC<{ anh: Anh; style?: any }> = ({ anh, style }) => {
  const [nguon, setNguon] = useState(anh.uri);
  const [hong, setHong] = useState(false);

  // Đổi ảnh thì trạng thái phải theo — nếu không, một ô lỗi cũ dính lại trên ảnh mới.
  useEffect(() => { setNguon(anh.uri); setHong(false); }, [anh.uri]);

  if (hong) {
    return (
      <View style={[style, styles.anhHong]}>
        <Icon name="image" size={26} color={ORG_NATURE.barkSoft} />
        <Text style={styles.anhHongTxt}>Không hiện được ảnh này</Text>
        <Text style={styles.anhHongPhu}>Ảnh vẫn gửi lên được — chụp lại nếu muốn xem trước.</Text>
      </View>
    );
  }

  return (
    <Image
      key={nguon}
      source={{ uri: nguon }}
      style={style}
      resizeMode="cover"
      /* Android: hiệu ứng mờ dần khi hiện ảnh để lại một khung đen ở khung hình
         đầu trên vài máy. Tắt đi thì ảnh hiện thẳng. */
      fadeDuration={0}
      onError={() => {
        if (anh.duPhong && nguon !== anh.duPhong) setNguon(anh.duPhong);
        else setHong(true);
      }}
    />
  );
};

// ── Tấm trượt nhiều bước ─────────────────────────────────────────────────────

const AnimalWizard: React.FC<{
  visible: boolean;
  /** Luồng mở ra ban đầu. Người dùng có thể rẽ sang luồng kia giữa chừng. */
  mode: AnimalFlowMode;
  /** Vườn đã biết → bỏ bước chọn vườn. */
  farmId?: string;
  farmName?: string;
  /** Loài đã biết → bỏ bước chọn loài. */
  species?: string;
  /** Danh sách vườn để chọn, khi chưa biết vườn. */
  farms?: Array<{ id: string; name?: string }>;
  onClose: () => void;
  /** Có ghi được gì lên máy chủ không — nơi gọi dùng để làm mới danh sách. */
  onChanged?: () => void;
  /** Mở hồ sơ một cá thể. Nơi gọi tự đóng tấm trượt rồi điều hướng. */
  onOpenAnimal?: (animalDid: string) => void;
}> = ({
  visible, mode, farmId, farmName, species, farms = [], onClose, onChanged, onOpenAnimal,
}) => {
  const insets = useSafeAreaInsets();

  const [che, setChe] = useState<AnimalFlowMode>(mode);
  const [loai, setLoai] = useState(species ?? '');
  const [vuon, setVuon] = useState(farmId ?? '');
  const [buoc, setBuoc] = useState<string>('loai');

  const [anhMot, setAnhMot] = useState<Anh | null>(null);
  const [anhBo, setAnhBo] = useState<Anh[]>([]);
  const [ten, setTen] = useState('');

  const [dangGoi, setDangGoi] = useState(false);
  const [ketQua, setKetQua] = useState<AnimalIdentifyResponse | null>(null);
  const [didMoi, setDidMoi] = useState<string | null>(null);

  /** Số cá thể CÙNG LOÀI đang có trong vườn. `null` = chưa hỏi xong. */
  const [soDan, setSoDan] = useState<number | null>(null);
  const [loiDan, setLoiDan] = useState<string | null>(null);

  const vuonKhoa = !!farmId;
  const loaiKhoa = !!species;

  /** Các bước THẬT của lượt này — bỏ câu nào nơi gọi đã trả lời sẵn. */
  const cacBuoc = useMemo(
    () => BUOC_THEO_CHE[che].filter(
      (b) => !(b === 'vuon' && vuonKhoa) && !(b === 'loai' && loaiKhoa),
    ),
    [che, vuonKhoa, loaiKhoa],
  );

  // Mở lại tấm trượt thì bắt đầu lại từ đầu. Giữ trạng thái của lượt trước là
  // dựng một luồng mà người dùng không thấy mình đã đi tới đâu.
  useEffect(() => {
    if (!visible) return;
    setChe(mode);
    setLoai(species ?? '');
    setVuon(farmId ?? '');
    setBuoc(BUOC_THEO_CHE[mode].filter(
      (b) => !(b === 'vuon' && farmId) && !(b === 'loai' && species),
    )[0]);
    setAnhMot(null);
    setAnhBo([]);
    setTen('');
    setKetQua(null);
    setDidMoi(null);
    setSoDan(null);
    setLoiDan(null);
  }, [visible, mode, farmId, species]);

  const viTri = cacBuoc.indexOf(buoc);
  const cuoiCung = viTri === cacBuoc.length - 1;

  // ── Đếm đàn TRƯỚC khi cho chụp ────────────────────────────────────────────
  /**
   * Nhận diện so ảnh với đàn ĐÃ ĐĂNG KÝ. Đàn rỗng thì không có gì để so, và máy
   * chủ trả `EMPTY_FARM` — nhưng chỉ SAU khi người dùng đã chụp và chờ tải ảnh
   * lên. Hỏi trước là đổi một câu trả lời muộn và tốn công lấy một câu sớm.
   */
  useEffect(() => {
    if (buoc !== 'chup' || !loai || !vuon) return;
    let con = true;
    setSoDan(null);
    setLoiDan(null);
    listAnimals(ORILIFE_BASE, vuon, loai, 1, 0).then((kq) => {
      if (!con) return;
      if (!kq.ok) {
        setLoiDan(kq.error?.detail || 'Không hỏi được sổ đàn.');
        return;
      }
      // `total` là TỔNG khớp bộ lọc; máy chủ đời cũ không gửi nó, lúc đó dựa vào
      // việc trang đầu có trả về con nào không.
      setSoDan(typeof kq.total === 'number' ? kq.total : (kq.animals?.length ?? 0));
    });
    return () => { con = false; };
  }, [buoc, loai, vuon]);

  // ── Chụp ảnh ──────────────────────────────────────────────────────────────
  const chup = useCallback(async (nhieu: boolean) => {
    if (!imagePicker?.launchCamera) {
      showError('Chưa mở được máy ảnh',
        'Bản app này chưa mở được máy ảnh. Vui lòng cập nhật app rồi thử lại.');
      return;
    }
    imagePicker.launchCamera(await withPhotoSave(CAMERA_OPTIONS), (res: any) => {
      if (res.didCancel) return;
      if (res.errorCode) {
        showError('Lỗi camera',
          res.errorMessage ?? 'Không mở được máy ảnh. Kiểm tra quyền trong Cài đặt.');
        return;
      }
      const a = res.assets?.[0];
      if (!a?.uri) return;
      // `originalPath` chỉ có trên Android. Giữ nó làm ĐƯỜNG DỰ PHÒNG để xem
      // trước — xem `AnhChup`.
      const anh: Anh = {
        uri: a.uri,
        duPhong: a.originalPath ? `file://${String(a.originalPath).replace(/^file:\/\//, '')}` : undefined,
      };
      if (nhieu) setAnhBo((truoc) => (truoc.length >= ANH_TOI_DA ? truoc : [...truoc, anh]));
      else { setAnhMot(anh); setKetQua(null); }
    });
  }, []);

  // ── Gọi máy chủ ───────────────────────────────────────────────────────────
  const nhanDien = useCallback(async () => {
    if (!anhMot || !loai || !vuon) return;
    setDangGoi(true);
    try {
      const res = await identifyAnimal(ORILIFE_BASE, loai, vuon, anhMot.uri);
      if (res.ok && res.data) {
        setKetQua(res.data);
        setBuoc('ketqua');
      } else {
        showError('Nhận diện không xong', res.error?.detail ?? 'Thử lại giúp tôi.');
      }
    } finally {
      setDangGoi(false);
    }
  }, [anhMot, loai, vuon]);

  const dangKy = useCallback(async () => {
    if (anhBo.length < ANH_TOI_THIEU || !loai || !vuon) return;
    setDangGoi(true);
    try {
      const res = await enrollAnimal(
        ORILIFE_BASE, loai, vuon, ten.trim(), anhBo.map((a) => a.uri),
      );
      if (res.ok && res.data) {
        // Nhớ MỘT tấm để sổ đàn có mặt con vật mà bày. Máy chủ không trả ảnh của
        // con nào cả, nên đây là lần DUY NHẤT app cầm ảnh của con này — xem
        // `utils/animalPhotoCache.ts`. Không `await`: đăng ký đã xong trên máy
        // chủ, một lượt ghi đĩa hỏng không được phép giữ người dùng lại.
        if (anhBo[0]?.uri) void luuAnhCaThe(res.data.animal_did, anhBo[0].uri);
        setDidMoi(res.data.animal_did);
        setBuoc('ketqua');
        onChanged?.();
        return;
      }
      const status = res.error?.http_status ?? 0;
      const detail = res.error?.detail ?? 'Lỗi không xác định';

      if (status === 409) {
        // Máy chủ CÓ trả mã con nó cho là trùng. Mở thẳng hồ sơ con đó: nhìn ảnh
        // là biết ngay có phải con đang cầm không, nhanh hơn dò trong sổ.
        // Ảnh vừa chụp GIỮ NGUYÊN — mất công chụp lại năm góc là lý do người ta
        // bỏ giữa chừng.
        const trung = res.error?.similarAnimalDid;
        showWarning(
          'Cá thể có thể đã có rồi',
          `${detail}\n\nẢnh vừa chụp vẫn giữ nguyên.`,
          {
            actions: [
              { text: 'Để sau', style: 'cancel' },
              ...(trung && onOpenAnimal
                ? [{ text: 'Xem con trùng', onPress: () => { onClose(); onOpenAnimal(trung); } }]
                : []),
            ],
          },
        );
        return;
      }
      if (status === 0) {
        showWarning('Mất kết nối', detail, {
          confirmText: 'Thử lại', cancelText: 'Huỷ', onConfirm: () => dangKy(),
        });
        return;
      }
      showError('Chưa đăng ký được', detail);
    } finally {
      setDangGoi(false);
    }
  }, [anhBo, loai, vuon, ten, onChanged, onClose, onOpenAnimal]);

  // ── Điều kiện đi tiếp của TỪNG bước ───────────────────────────────────────
  const diTiepDuoc = (() => {
    switch (buoc) {
      case 'loai': return !!loai;
      case 'vuon': return !!vuon;
      case 'anh': return anhBo.length >= ANH_TOI_THIEU;
      case 'ten': return anhBo.length >= ANH_TOI_THIEU && !dangGoi;
      case 'chup': return !!anhMot && !dangGoi && soDan !== 0;
      default: return false;
    }
  })();

  const tiep = () => {
    if (buoc === 'chup') { nhanDien(); return; }
    if (buoc === 'ten') { dangKy(); return; }
    const ke = cacBuoc[viTri + 1];
    if (ke) setBuoc(ke);
  };

  const lui = () => {
    const truoc = cacBuoc[viTri - 1];
    if (truoc) setBuoc(truoc);
    else onClose();
  };

  /** Rẽ sang đăng ký giữa luồng nhận diện — giữ lại loài và vườn đã chọn. */
  const reSangDangKy = () => {
    setChe('enroll');
    setKetQua(null);
    setAnhMot(null);
    setBuoc('anh');
  };

  const nhanTiep = (() => {
    if (buoc === 'chup') return dangGoi ? 'Đang nhận diện…' : 'Nhận diện';
    if (buoc === 'ten') return dangGoi ? 'Đang đăng ký…' : 'Đăng ký cá thể';
    return 'Tiếp';
  })();

  const tenVuon = farmName
    ?? farms.find((f) => f.id === vuon)?.name
    ?? (vuon ? `Vườn ${vuon.slice(0, 6)}` : '—');

  // ── Từng bước ─────────────────────────────────────────────────────────────

  const oTomTat = (
    <View style={styles.tomTat}>
      <View style={styles.tomTatHang}>
        <Icon name={hinhLoai(loai)} size={15} color={ORG_TONE.barn} />
        <Text style={styles.tomTatNhan}>Loài</Text>
        <Text style={styles.tomTatGt}>{loai ? speciesLabel(loai) : '—'}</Text>
      </View>
      <View style={styles.tomTatHang}>
        <Icon name="warehouse" size={15} color={ORG_TONE.barn} />
        <Text style={styles.tomTatNhan}>Vườn</Text>
        <Text style={styles.tomTatGt} numberOfLines={1}>{tenVuon}</Text>
      </View>
      {che === 'identify' ? (
        <View style={styles.tomTatHang}>
          <Icon name="paw" size={15} color={ORG_TONE.barn} />
          <Text style={styles.tomTatNhan}>Đàn đã ghi</Text>
          <Text style={styles.tomTatGt}>
            {loiDan ? 'chưa hỏi được' : soDan == null ? 'đang đếm…' : `${soDan} cá thể`}
          </Text>
        </View>
      ) : (
        <View style={styles.tomTatHang}>
          <Icon name="camera" size={15} color={ORG_TONE.barn} />
          <Text style={styles.tomTatNhan}>Ảnh</Text>
          <Text style={styles.tomTatGt}>{anhBo.length} tấm</Text>
        </View>
      )}
    </View>
  );

  const veBuoc = () => {
    switch (buoc) {
      // ── Loài ────────────────────────────────────────────────────────────
      case 'loai':
        return (
          <>
            <Text style={styles.loi}>
              Máy so ảnh trong phạm vi MỘT loài. Chọn sai loài thì không con nào khớp.
            </Text>
            <View style={styles.luoiLoai}>
              {SPECIES_KEYS.map((k) => {
                const chon = loai === k;
                /*
                  ẢNH THẬT nếu có, biểu tượng nếu chưa — xem `speciesPhoto.ts`.

                  ⛔ KHÔNG vẽ một ô xám rỗng cho loài chưa có ảnh. Ô rỗng đọc ra
                     "app hỏng"; biểu tượng đọc ra "đây là con gà". Sáu ô này là
                     bước MỘT của cả luồng, nên chúng phải đọc được ngay cả khi
                     bảng ảnh còn trống trơn.
                */
                const anh = anhLoai(k);
                return (
                  <TouchableOpacity
                    key={k}
                    style={[styles.oLoai, chon && styles.oLoaiChon]}
                    onPress={() => setLoai(k)}
                    activeOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: chon }}
                  >
                    {anh ? (
                      <Image
                        source={anh}
                        style={styles.oLoaiAnh}
                        /* `contain`: ảnh xoá nền có tỉ lệ khác nhau (con bò nằm
                           ngang, con gà đứng dọc). `cover` sẽ cắt cụt đầu hoặc
                           chân — và cắt cụt thì mỗi loài cụt một kiểu. */
                        resizeMode="contain"
                        fadeDuration={0}
                      />
                    ) : (
                      <Icon
                        name={hinhLoai(k)}
                        size={24}
                        color={chon ? ORG_TONE.barn : ORG_NATURE.barkSoft}
                      />
                    )}
                    <Text style={[styles.oLoaiTxt, chon && styles.oLoaiTxtChon]}>
                      {speciesLabel(k)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        );

      // ── Vườn ────────────────────────────────────────────────────────────
      case 'vuon':
        return farms.length === 0 ? (
          <View style={styles.trong}>
            <Icon name="warehouse" size={40} color={ORG_NATURE.barkSoft} />
            <Text style={styles.trongTxt}>Chưa có vườn nào</Text>
            <Text style={styles.loi}>
              Vật nuôi phải thuộc một vườn thật thì hồ sơ mới tra lại được. Tạo
              vườn trước rồi quay lại đây.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.loi}>
              Hồ sơ con vật gắn vào vườn này. Chọn nhầm vườn thì nó nằm trong sổ
              của vườn khác.
            </Text>
            <View style={styles.dsVuon}>
              {farms.map((f) => {
                const chon = vuon === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    style={[styles.hangVuon, chon && styles.hangVuonChon]}
                    onPress={() => setVuon(f.id)}
                    activeOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: chon }}
                  >
                    <Icon
                      name={chon ? 'circle-check' : 'circle'}
                      size={18}
                      color={chon ? ORG_TONE.barn : ORG_TONE.border}
                    />
                    <Text style={[styles.hangVuonTxt, chon && styles.hangVuonTxtChon]} numberOfLines={1}>
                      {f.name || f.id}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        );

      // ── Chụp để nhận diện ───────────────────────────────────────────────
      case 'chup':
        // ĐÀN RỖNG — chặn ở đây, trước khi mở máy ảnh. Đây là toàn bộ lý do của
        // bước đếm đàn: nhận diện so với đàn đã đăng ký, không có đàn thì không
        // có phép so nào để làm.
        if (soDan === 0) {
          return (
            <View style={styles.trong}>
              <Icon name="paw" size={40} color={ORG_NATURE.barkSoft} />
              <Text style={styles.trongTxt}>
                Chưa có con {speciesLabel(loai).toLowerCase()} nào trong sổ
              </Text>
              <Text style={styles.loi}>
                Nhận diện là so ảnh với những con ĐÃ ghi sổ ở vườn này. Chưa ghi
                con nào thì chưa có gì để so — ghi con đầu tiên trước đã.
              </Text>
              <TouchableOpacity style={styles.nutPhu} onPress={reSangDangKy} activeOpacity={0.85}>
                <Icon name="circle-plus" size={17} color={ORG_TONE.barn} />
                <Text style={styles.nutPhuTxt}>Đăng ký con đầu tiên</Text>
              </TouchableOpacity>
            </View>
          );
        }
        return (
          <>
            {oTomTat}
            {anhMot ? (
              <View style={styles.khungAnh}>
                <AnhChup anh={anhMot} style={styles.anhTo} />
                <TouchableOpacity
                  style={styles.chipChupLai}
                  onPress={() => chup(false)}
                  activeOpacity={0.85}
                >
                  <Icon name="camera" size={14} color={ORG_NATURE.paper} />
                  <Text style={styles.chipChupLaiTxt}>Chụp lại</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.oChup} onPress={() => chup(false)} activeOpacity={0.85}>
                <Icon name="camera" size={40} color={ORG_TONE.barn} />
                <Text style={styles.oChupTxt}>Chụp ảnh con vật</Text>
                <Text style={styles.oChupPhu}>Lấy rõ mặt và đặc điểm — một ảnh là đủ</Text>
              </TouchableOpacity>
            )}
            {loiDan ? (
              <Text style={styles.canhBao}>
                Chưa đếm được đàn ({loiDan}). Vẫn chụp được, nhưng nếu vườn chưa
                có con nào thì máy chủ sẽ báo không có gì để so.
              </Text>
            ) : null}
          </>
        );

      // ── Hồ sơ ảnh (đăng ký) ─────────────────────────────────────────────
      case 'anh':
        return (
          <>
            <Text style={styles.loi}>
              Cần {ANH_TOI_THIEU}–{ANH_TOI_DA} ảnh ở các góc khác nhau: mặt, thân,
              và chỗ dễ nhận ra con này giữa cả đàn.
            </Text>
            <View style={styles.demAnh}>
              <Icon
                name={anhBo.length >= ANH_TOI_THIEU ? 'circle-check' : 'camera'}
                size={17}
                color={anhBo.length >= ANH_TOI_THIEU ? ORG_TONE.primary : ORG_TONE.barn}
              />
              <Text style={styles.demAnhTxt}>
                {anhBo.length}/{ANH_TOI_DA} ảnh
                {anhBo.length < ANH_TOI_THIEU
                  ? ` — cần thêm ${ANH_TOI_THIEU - anhBo.length}`
                  : ' — đủ để đăng ký'}
              </Text>
            </View>
            <View style={styles.luoiAnh}>
              {anhBo.map((a, i) => (
                <View key={`${a.uri}-${i}`} style={styles.oAnh}>
                  <AnhChup anh={a} style={styles.anhNho} />
                  <TouchableOpacity
                    style={styles.nutXoaAnh}
                    onPress={() => setAnhBo((truoc) => truoc.filter((_, j) => j !== i))}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Icon name="xmark" size={11} color={ORG_NATURE.paper} />
                  </TouchableOpacity>
                </View>
              ))}
              {anhBo.length < ANH_TOI_DA ? (
                <TouchableOpacity style={styles.oThemAnh} onPress={() => chup(true)} activeOpacity={0.8}>
                  <Icon name="camera" size={22} color={ORG_TONE.barn} />
                  <Text style={styles.oThemAnhTxt}>Chụp</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </>
        );

      // ── Tên + kiểm lại ──────────────────────────────────────────────────
      case 'ten':
        return (
          <>
            <Text style={styles.nhan}>Tên cá thể (có thể bỏ trống)</Text>
            <TextInput
              style={styles.oNhap}
              value={ten}
              onChangeText={setTen}
              placeholder={`Ví dụ: ${speciesLabel(loai)} số 3`}
              placeholderTextColor={ORG_NATURE.barkSoft}
              maxLength={60}
              returnKeyType="done"
              editable={!dangGoi}
            />
            <Text style={styles.loi}>
              Bỏ trống cũng đăng ký được — máy chủ vẫn cấp mã định danh riêng.
              Đặt tên chỉ để bạn gọi con này trong sổ.
            </Text>
            {oTomTat}
          </>
        );

      // ── Kết quả ─────────────────────────────────────────────────────────
      case 'ketqua':
        return didMoi ? veDangKyXong() : veNhanDienXong();

      default:
        return null;
    }
  };

  function veDangKyXong() {
    return (
      <View style={styles.xong}>
        <View style={styles.huyHieuXong}>
          <Icon name="circle-check" size={30} color={ORG_TONE.primary} />
        </View>
        <Text style={styles.xongTieuDe}>Đã ghi vào sổ đàn</Text>
        <Text style={styles.xongPhu}>
          {speciesLabel(loai)} · {anhBo.length} ảnh · {tenVuon}
        </Text>
        <Text style={styles.xongMa} numberOfLines={1}>{didMoi}</Text>
        {onOpenAnimal && didMoi ? (
          <TouchableOpacity
            style={styles.nutPhu}
            onPress={() => { onClose(); onOpenAnimal(didMoi); }}
            activeOpacity={0.85}
          >
            <Icon name="id-card" size={17} color={ORG_TONE.barn} />
            <Text style={styles.nutPhuTxt}>Xem hồ sơ</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  function veNhanDienXong() {
    if (!ketQua) return null;
    const { decision, name, animal_did, shoot_hint, moved_distance_m } = ketQua;
    const khop = decision === 'MATCH' || decision === 'MOVED';
    const ungVien = ketQua.candidates ?? [];

    return (
      <View style={{ gap: ORG_SPACE.md }}>
        <View style={[styles.ketLuan, khop ? styles.ketLuanKhop : styles.ketLuanChua]}>
          <Icon
            name={khop ? 'circle-check' : decision === 'UNCERTAIN' ? 'circle-question' : 'circle-info'}
            size={22}
            color={khop ? ORG_TONE.primary : ORG_TONE.sun}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.ketLuanTxt}>
              {decision === 'MATCH' ? `Có vẻ là ${name || 'con đã có trong sổ'}`
                : decision === 'MOVED' ? 'Đúng con này, nhưng đang ở chỗ khác'
                : decision === 'UNCERTAIN' ? 'Chưa chắc — máy đưa ra vài con giống'
                : decision === 'EMPTY_FARM' ? 'Vườn này chưa có con nào để so'
                : 'Không khớp con nào trong sổ'}
            </Text>
            {/* Máy tra ra thế này, CHƯA phải kết luận. Số đo của OriLife: nhãn
                MATCH chỉ đúng khoảng một nửa số lượt. Câu này phải đứng ngay
                dưới kết quả, không nằm ở chú thích cuối trang. */}
            <Text style={styles.ketLuanPhu}>
              {decision === 'MOVED' && moved_distance_m != null
                ? `Cách chỗ ghi lần trước ${moved_distance_m.toFixed(0)} m. `
                : ''}
              Máy tra ra thế này — xin nhìn lại con vật rồi tự xác nhận.
            </Text>
          </View>
        </View>

        {shoot_hint ? (
          <View style={styles.goiY}>
            <Icon name="lightbulb" size={14} color={ORG_TONE.sun} />
            <Text style={styles.goiYTxt}>{shoot_hint}</Text>
          </View>
        ) : null}

        {/* UNCERTAIN — danh sách ứng viên là một BƯỚC, không phải một hộp thoại
            chồng lên hộp thoại: hộp thoại lồng trong tấm trượt hay kẹt trên
            Android, và đóng nhầm một lớp là mất luôn kết quả vừa chụp. */}
        {ungVien.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Text style={styles.nhan}>Con nào đây?</Text>
            {ungVien.map((c) => (
              <TouchableOpacity
                key={c.animal_did}
                style={styles.hangUngVien}
                activeOpacity={0.85}
                onPress={() => { onClose(); onOpenAnimal?.(c.animal_did); }}
              >
                <Icon name={hinhLoai(c.species)} size={18} color={ORG_TONE.barn} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.ungVienTen} numberOfLines={1}>
                    {c.name || 'Chưa đặt tên'}
                  </Text>
                  <Text style={styles.ungVienPhu} numberOfLines={1}>
                    {Math.round((c.sim ?? 0) * 100)}% giống
                    {c.n_views ? ` · ${c.n_views} ảnh` : ''}
                    {c.near_prev ? ' · gần chỗ cũ' : ''}
                  </Text>
                </View>
                <Icon name="chevron-right" size={13} color={ORG_NATURE.barkSoft} />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <View style={styles.hangNut}>
          {khop && animal_did && onOpenAnimal ? (
            <TouchableOpacity
              style={[styles.nutPhu, { flex: 1 }]}
              onPress={() => { onClose(); onOpenAnimal(animal_did); }}
              activeOpacity={0.85}
            >
              <Icon name="id-card" size={17} color={ORG_TONE.barn} />
              <Text style={styles.nutPhuTxt}>Xem hồ sơ</Text>
            </TouchableOpacity>
          ) : null}
          {!khop ? (
            <TouchableOpacity
              style={[styles.nutPhu, { flex: 1 }]}
              onPress={reSangDangKy}
              activeOpacity={0.85}
            >
              <Icon name="circle-plus" size={17} color={ORG_TONE.barn} />
              <Text style={styles.nutPhuTxt}>Ghi con mới</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.nutPhu, { flex: 1 }]}
            onPress={() => { setKetQua(null); setAnhMot(null); setBuoc('chup'); }}
            activeOpacity={0.85}
          >
            <Icon name="camera" size={17} color={ORG_TONE.barn} />
            <Text style={styles.nutPhuTxt}>Chụp lại</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const oKetQua = buoc === 'ketqua';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.nen} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.boc}
        pointerEvents="box-none"
      >
        <View style={[styles.tam, { paddingBottom: Math.max(insets.bottom, ORG_SPACE.lg) }]}>
          {/* Đầu tấm — nâu, để cả luồng tự khai mình thuộc nhánh vật nuôi. */}
          <View style={styles.dau}>
            <GradientFill name="actionBarn" />
            <View style={styles.dauChu}>
              <Text style={styles.dauTieuDe}>
                {che === 'identify' ? 'Nhận diện vật nuôi' : 'Ghi cá thể vào sổ'}
              </Text>
              <Text style={styles.dauPhu}>
                {oKetQua
                  ? TIEU_DE_BUOC.ketqua
                  : `Bước ${viTri + 1}/${cacBuoc.length} · ${TIEU_DE_BUOC[buoc] ?? ''}`}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.nutDong}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Đóng"
            >
              <Icon name="xmark" size={17} color={ORG_NATURE.paper} />
            </TouchableOpacity>
          </View>

          {/* Vạch bước — đi tới đâu thấy tới đó. Không dùng chữ "bước 2/3" một
              mình: một dãy vạch nói được cả quãng còn lại chỉ bằng một cái liếc. */}
          {!oKetQua ? (
            <View style={styles.vach}>
              {cacBuoc.map((b, i) => (
                <View
                  key={b}
                  style={[
                    styles.vachDoan,
                    i <= viTri ? styles.vachDoanXong : null,
                  ]}
                />
              ))}
            </View>
          ) : null}

          <ScrollView
            style={styles.than}
            contentContainerStyle={styles.thanTrong}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {veBuoc()}
          </ScrollView>

          {/* Chân tấm — lui / tiếp. Ở bước kết quả chỉ còn một nút đóng: mọi
              đường đi tiếp đã nằm ngay trong phần kết quả. */}
          <View style={styles.chan}>
            {oKetQua ? (
              <TouchableOpacity style={styles.nutChinh} onPress={onClose} activeOpacity={0.88}>
                <GradientFill name="actionBarn" />
                <Text style={styles.nutChinhTxt}>Xong</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={styles.nutLui} onPress={lui} activeOpacity={0.85}>
                  <Icon name="chevron-left" size={14} color={ORG_NATURE.bark} />
                  <Text style={styles.nutLuiTxt}>{viTri === 0 ? 'Đóng' : 'Lui'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.nutChinh, !diTiepDuoc && styles.nutTat]}
                  onPress={tiep}
                  disabled={!diTiepDuoc}
                  activeOpacity={0.88}
                >
                  {diTiepDuoc ? <GradientFill name="actionBarn" /> : null}
                  {dangGoi ? <ActivityIndicator color={ORG_NATURE.paper} size="small" /> : null}
                  <Text style={[styles.nutChinhTxt, !diTiepDuoc && styles.nutChinhTxtTat]}>
                    {nhanTiep}
                  </Text>
                  {!dangGoi && !cuoiCung ? (
                    <Icon
                      name="chevron-right"
                      size={13}
                      color={diTiepDuoc ? ORG_NATURE.paper : ORG_NATURE.barkSoft}
                    />
                  ) : null}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  nen: { ...StyleSheet.absoluteFillObject, backgroundColor: ORG_SURFACE.scrim },
  boc: { flex: 1, justifyContent: 'flex-end' },
  tam: {
    maxHeight: '92%',
    backgroundColor: ORG_SURFACE.raised,
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    overflow: 'hidden',
    ...ORG_ELEV.sheet,
  },

  dau: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: ORG_SPACE.lg, paddingVertical: ORG_SPACE.lg,
    overflow: 'hidden',
  },
  dauChu: { flex: 1, minWidth: 0 },
  dauTieuDe: { fontSize: 18, fontWeight: '700', color: ORG_NATURE.paper, letterSpacing: -0.3 },
  dauPhu: { fontSize: 13, color: 'rgba(255,255,255,0.78)', marginTop: 2 },
  nutDong: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },

  vach: { flexDirection: 'row', gap: 4, paddingHorizontal: ORG_SPACE.lg, paddingTop: 12 },
  vachDoan: { flex: 1, height: 4, borderRadius: 2, backgroundColor: ORG_SURFACE.sunken },
  vachDoanXong: { backgroundColor: ORG_TONE.barn },

  than: { flexGrow: 0 },
  thanTrong: { padding: ORG_SPACE.lg, gap: ORG_SPACE.md },

  loi: { fontSize: 13, lineHeight: 19, color: ORG_NATURE.barkSoft },
  nhan: { fontSize: 14, fontWeight: '700', color: ORG_NATURE.bark },
  canhBao: { fontSize: 12, lineHeight: 18, color: ORG_TONE.sun },

  // ── Loài
  luoiLoai: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  oLoai: {
    width: '31.5%', aspectRatio: 1, ...ORGANIC_TILE,
    alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: ORG_SURFACE.raised,
  },
  oLoaiChon: { backgroundColor: ORG_TONE.barnSoft },
  /**
   * Ô ảnh loài. Cao hơn hẳn biểu tượng (24) vì một tấm ảnh thật cần chỗ mới đọc
   * ra con gì; `%` theo cạnh ô nên nó co giãn cùng lưới trên máy hẹp.
   */
  oLoaiAnh: { width: '68%', height: '52%' },
  oLoaiTxt: { fontSize: 13, fontWeight: '600', color: ORG_NATURE.barkSoft },
  oLoaiTxtChon: { color: ORG_TONE.barnDeep, fontWeight: '700' },

  // ── Vườn
  dsVuon: { gap: 8 },
  hangVuon: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 13, borderRadius: 14,
    backgroundColor: ORG_SURFACE.raised,
    borderWidth: 1, borderColor: ORG_TONE.border,
  },
  hangVuonChon: { borderColor: ORG_TONE.barn, backgroundColor: ORG_TONE.barnSoft },
  hangVuonTxt: { flex: 1, fontSize: 15, fontWeight: '600', color: ORG_NATURE.bark },
  hangVuonTxtChon: { color: ORG_TONE.barnDeep },

  // ── Tóm tắt
  tomTat: {
    gap: 8, padding: 14, borderRadius: 14,
    backgroundColor: ORG_TONE.barnSoft,
  },
  tomTatHang: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tomTatNhan: { fontSize: 13, color: ORG_NATURE.barkSoft, width: 76 },
  tomTatGt: { flex: 1, fontSize: 14, fontWeight: '700', color: ORG_NATURE.bark },

  // ── Ảnh
  /**
   * ⛔ Nền SÁNG, không phải `#000`.
   *
   * Khung cũ nền đen: mọi lượt `Image` không đọc được URI đều hiện ra một mảng
   * đen không lời giải thích — đúng thứ được báo về. Nền sáng thì ca đó rơi vào
   * `AnhChup` và hiện thành một dòng chữ.
   */
  khungAnh: {
    height: 260, borderRadius: 16, overflow: 'hidden',
    backgroundColor: ORG_SURFACE.sunken,
  },
  anhTo: { width: '100%', height: '100%' },
  chipChupLai: {
    position: 'absolute', right: 10, bottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: 'rgba(18, 38, 46, 0.62)',
  },
  chipChupLaiTxt: { fontSize: 12, fontWeight: '700', color: ORG_NATURE.paper },

  oChup: {
    height: 200, borderRadius: 16, gap: 6,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: ORG_TONE.barnSoft,
    borderWidth: 1, borderColor: ORG_TONE.border, borderStyle: 'dashed',
  },
  oChupTxt: { fontSize: 15, fontWeight: '700', color: ORG_TONE.barnDeep },
  oChupPhu: { fontSize: 12, color: ORG_NATURE.barkSoft },

  demAnh: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
    backgroundColor: ORG_SURFACE.sunken,
  },
  demAnhTxt: { fontSize: 13, fontWeight: '600', color: ORG_NATURE.bark },
  luoiAnh: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  oAnh: { width: '31.5%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden' },
  anhNho: { width: '100%', height: '100%' },
  nutXoaAnh: {
    position: 'absolute', top: 4, right: 4,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(18, 38, 46, 0.68)',
  },
  oThemAnh: {
    width: '31.5%', aspectRatio: 1, borderRadius: 12, gap: 4,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: ORG_TONE.barnSoft,
    borderWidth: 1, borderColor: ORG_TONE.border, borderStyle: 'dashed',
  },
  oThemAnhTxt: { fontSize: 12, fontWeight: '600', color: ORG_TONE.barnDeep },

  anhHong: {
    alignItems: 'center', justifyContent: 'center', gap: 4, padding: 12,
    backgroundColor: ORG_SURFACE.sunken,
  },
  anhHongTxt: { fontSize: 13, fontWeight: '700', color: ORG_NATURE.bark },
  anhHongPhu: { fontSize: 11, color: ORG_NATURE.barkSoft, textAlign: 'center' },

  // ── Nhập
  oNhap: {
    borderWidth: 1, borderColor: ORG_TONE.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: ORG_NATURE.bark,
    backgroundColor: ORG_SURFACE.raised,
  },

  // ── Rỗng / kết quả
  trong: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  trongTxt: { fontSize: 16, fontWeight: '700', color: ORG_NATURE.bark, textAlign: 'center' },

  ketLuan: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 14, borderRadius: 14, borderWidth: 1,
  },
  ketLuanKhop: { backgroundColor: ORG_TONE.primarySoft, borderColor: ORG_TONE.border },
  ketLuanChua: { backgroundColor: ORG_NATURE.sunSoft, borderColor: ORG_TONE.border },
  ketLuanTxt: { fontSize: 15, fontWeight: '700', color: ORG_NATURE.bark },
  ketLuanPhu: { fontSize: 12, lineHeight: 17, color: ORG_NATURE.barkSoft, marginTop: 3 },

  goiY: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 12, borderRadius: 12, backgroundColor: ORG_NATURE.sunSoft,
  },
  goiYTxt: { flex: 1, fontSize: 12, lineHeight: 18, color: ORG_NATURE.bark },

  hangUngVien: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12,
    borderWidth: 1, borderColor: ORG_TONE.border,
    backgroundColor: ORG_SURFACE.raised,
  },
  ungVienTen: { fontSize: 14, fontWeight: '700', color: ORG_NATURE.bark },
  ungVienPhu: { fontSize: 12, color: ORG_NATURE.barkSoft, marginTop: 1 },

  xong: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  huyHieuXong: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: ORG_TONE.primarySoft, marginBottom: 4,
  },
  xongTieuDe: { fontSize: 18, fontWeight: '700', color: ORG_NATURE.bark },
  xongPhu: { fontSize: 13, color: ORG_NATURE.barkSoft },
  xongMa: { fontSize: 11, color: ORG_NATURE.barkSoft, marginTop: 2 },

  hangNut: { flexDirection: 'row', gap: 8 },

  // ── Chân tấm
  chan: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: ORG_SPACE.lg, paddingTop: ORG_SPACE.md,
    borderTopWidth: 1, borderTopColor: ORG_TONE.border,
  },
  nutLui: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14,
    backgroundColor: ORG_SURFACE.sunken,
  },
  nutLuiTxt: { fontSize: 15, fontWeight: '700', color: ORG_NATURE.bark },
  nutChinh: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14, overflow: 'hidden',
    backgroundColor: ORG_TONE.barn,
  },
  nutTat: { backgroundColor: ORG_SURFACE.sunken },
  nutChinhTxt: { fontSize: 15, fontWeight: '700', color: ORG_NATURE.paper },
  nutChinhTxtTat: { color: ORG_NATURE.barkSoft },

  nutPhu: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14,
    backgroundColor: ORG_TONE.barnSoft,
    borderWidth: 1, borderColor: ORG_TONE.border,
  },
  nutPhuTxt: { fontSize: 14, fontWeight: '700', color: ORG_TONE.barnDeep },
});

export default AnimalWizard;
