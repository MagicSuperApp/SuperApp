/**
 * weatherService — thời tiết hôm nay + 7 ngày tới cho ĐÚNG mảnh vườn của người dùng.
 *
 * Nguồn: Open-Meteo (https://open-meteo.com) — miễn phí, KHÔNG cần khoá API, không
 * cần đăng ký. Chọn nguồn này chính vì chỗ đó: mọi dịch vụ thời tiết khác đều đòi
 * một khoá, mà khoá thì phải nhúng vào bản dựng, mà khoá nhúng trong app di động
 * thì coi như công khai — rồi tới ngày nó bị khoá vì vượt hạn mức, cả app mất
 * thời tiết mà không ai biết vì sao.
 *
 * Toạ-độ lấy từ RANH GIỚI VƯỜN người dùng đã vẽ (tâm đa-giác). Thời tiết ở tỉnh
 * và thời tiết ở mảnh vườn cách nhau 30 km là hai chuyện khác nhau với người
 * quyết định hôm nay có phun thuốc hay không.
 *
 * Mọi hàm ĐỌC dữ liệu đều không ném: mất mạng thì trả `null`, màn hình hiện lời
 * mời thử lại. Thời tiết là thông tin phụ trợ — nó không được phép làm hỏng trang.
 */

const BASE = 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT_MS = 12_000;

/** Toạ-độ mặc định khi vườn chưa vẽ ranh giới — trung tâm ĐBSCL (Cần Thơ). */
export const DEFAULT_COORD = { lat: 10.0452, lon: 105.7469 };

export interface WeatherNow {
  tempC: number;
  humidity: number;
  /** Lượng mưa đang rơi (mm). */
  rainMm: number;
  windKph: number;
  code: number;
}

export interface WeatherDay {
  /** ISO 'YYYY-MM-DD'. */
  date: string;
  code: number;
  maxC: number;
  minC: number;
  /** Khả năng mưa cao nhất trong ngày (%). */
  rainChance: number;
}

/**
 * MỘT GIỜ trong dự báo. Có mảng này thì mới cảnh báo được "sắp có dông" — còn
 * số theo NGÀY chỉ nói được "hôm nay có lúc mưa", tức đúng nhưng vô dụng: nhà
 * vườn cần biết là còn hai tiếng nữa hay tối mới mưa.
 */
export interface WeatherHour {
  /** Mốc thời gian THẬT (epoch ms), đã quy từ giờ địa phương của máy chủ. */
  at: number;
  code: number;
  /** Khả năng mưa trong giờ đó (%). */
  rainChance: number;
  /** Gió GIẬT (km/h) — số đo gần nhất với "lốc". Gió trung bình không nói được. */
  gustKph: number;
}

export interface WeatherReport {
  now: WeatherNow;
  days: WeatherDay[];
  /** Dự báo theo GIỜ, sớm nhất trước. Rỗng khi máy chủ không trả. */
  hours: WeatherHour[];
  /** Toạ-độ máy chủ thực sự đã tra (có thể lệch vài km so với điểm gửi đi). */
  at: { lat: number; lon: number };
}

/**
 * Tâm của ranh giới vườn. Trung bình cộng các đỉnh — đủ đúng cho việc tra thời
 * tiết (sai số vài trăm mét), và không cần công thức trọng tâm đa-giác vốn vỡ
 * khi người dùng vẽ ranh giới tự cắt nhau.
 */
export function centroidOf(points: Array<{ lat: number; lng: number }>): { lat: number; lon: number } | null {
  const valid = (points ?? []).filter(
    p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng) && (p.lat !== 0 || p.lng !== 0),
  );
  if (!valid.length) return null;
  const lat = valid.reduce((s, p) => s + p.lat, 0) / valid.length;
  const lon = valid.reduce((s, p) => s + p.lng, 0) / valid.length;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/**
 * Mã thời tiết WMO → KHOÁ chữ + icon + tông màu.
 *
 * Trả về KHOÁ (`trace.sky.rain`) chứ không phải câu tiếng Việt: tầng dịch vụ
 * không được quyết định người dùng đọc thứ tiếng gì. Màn hình gọi `tk(labelKey)`.
 * Chữ đằng sau khoá viết theo lối NHÀ VƯỜN, không theo lối bản tin — "Mưa rào"
 * chứ không "Giáng thuỷ dạng rào".
 */
export interface WeatherLook {
  labelKey: string;
  /** Icon giao diện đơn sắc (Font Awesome) — dùng ở chỗ chật, cần theo màu chữ. */
  icon: string;
  /**
   * Icon THỜI TIẾT nhiều màu (bộ meteocons, tiền tố `wx-`).
   *
   * Dùng bộ riêng vì icon giao diện đơn sắc không phân biệt nổi "mưa nhỏ" với
   * "mưa to" khi chỉ còn 20 px — cả hai đều ra một đám mây có mấy vạch. Bộ thời
   * tiết có màu và hình riêng cho từng hiện tượng, đọc được ở cỡ nhỏ.
   */
  wxIcon: string;
  tone: 'sun' | 'cloud' | 'rain' | 'storm';
}

export function describeWeather(code: number): WeatherLook {
  if (code === 0) return { labelKey: 'trace.sky.clear', icon: 'sun', wxIcon: 'wx-clear', tone: 'sun' };
  if (code === 1) return { labelKey: 'trace.sky.mostlyClear', icon: 'sun', wxIcon: 'wx-clear', tone: 'sun' };
  if (code === 2) return { labelKey: 'trace.sky.partlyCloudy', icon: 'cloud-sun', wxIcon: 'wx-partly', tone: 'cloud' };
  if (code === 3) return { labelKey: 'trace.sky.cloudy', icon: 'cloud', wxIcon: 'wx-cloudy', tone: 'cloud' };
  if (code === 45 || code === 48) return { labelKey: 'trace.sky.fog', icon: 'smog', wxIcon: 'wx-fog', tone: 'cloud' };
  if (code >= 51 && code <= 57) return { labelKey: 'trace.sky.drizzle', icon: 'cloud-rain', wxIcon: 'wx-drizzle', tone: 'rain' };
  if (code >= 61 && code <= 65) return { labelKey: 'trace.sky.rain', icon: 'cloud-showers-heavy', wxIcon: 'wx-rain', tone: 'rain' };
  if (code === 66 || code === 67) return { labelKey: 'trace.sky.freezingRain', icon: 'cloud-rain', wxIcon: 'wx-sleet', tone: 'rain' };
  if (code >= 71 && code <= 77) return { labelKey: 'trace.sky.snow', icon: 'snowflake', wxIcon: 'wx-snow', tone: 'cloud' };
  if (code >= 80 && code <= 82) return { labelKey: 'trace.sky.showers', icon: 'cloud-showers-heavy', wxIcon: 'wx-heavy-rain', tone: 'rain' };
  if (code === 85 || code === 86) return { labelKey: 'trace.sky.sleet', icon: 'snowflake', wxIcon: 'wx-sleet', tone: 'cloud' };
  // WMO chỉ có 95 · 96 · 99 cho dông — chặn TRẦN, không để `>= 95` nuốt mọi mã lạ
  // rồi báo "Dông" cho một con số vô nghĩa (đúng thứ bài kiểm đã bắt được).
  if (code >= 95 && code <= 99) return { labelKey: 'trace.sky.storm', icon: 'cloud-bolt', wxIcon: 'wx-storm', tone: 'storm' };
  return { labelKey: 'trace.sky.unknown', icon: 'cloud', wxIcon: 'wx-unknown', tone: 'cloud' };
}

/**
 * KHOÁ của một câu KHUYÊN VIỆC ĐỒNG ÁNG rút từ dự báo — thứ người dùng thật sự
 * cần, thay vì bắt họ tự suy từ con số. Chỉ nói khi CHẮC; không có gì đáng nói
 * thì trả `null` chứ không nhét một câu vô nghĩa cho đầy chỗ.
 */
export function farmAdviceKey(now: WeatherNow, days: WeatherDay[]): string | null {
  const today = days[0];
  if (now.code >= 95 && now.code <= 99) return 'trace.advice.storm';
  if (today && today.rainChance >= 80) return 'trace.advice.rainLikely';
  if (now.rainMm > 0) return 'trace.advice.raining';
  if (today && today.maxC >= 35) return 'trace.advice.hot';
  if (today && today.rainChance <= 20 && now.humidity < 65) return 'trace.advice.dry';
  return null;
}

/**
 * Thứ trong tuần, từ chuỗi ISO 'YYYY-MM-DD'.
 *
 * Đưa `todayIso` vào thì ngày đó gọi thẳng là "Hôm nay" — trong dải 7 ngày, cột
 * đầu là cột người ta nhìn nhiều nhất, mà "T5" thì bắt phải nhẩm xem hôm nay thứ
 * mấy. `todayLabel` để màn hình truyền chữ đã dịch vào (mặc định tiếng Việt, nên
 * gọi bằng một tham số vẫn chạy đúng như cũ).
 */
export function weekdayVi(isoDate: string, todayIso?: string, todayLabel = 'Hôm nay'): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  if (todayIso && isoDate === todayIso) return todayLabel;
  return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()] ?? '';
}

/**
 * Tra thời tiết. Trả `null` khi không lấy được — KHÔNG ném, và KHÔNG trả số bịa:
 * một con số sai về khả năng mưa còn tệ hơn ô trống, vì người ta hoãn cả buổi phun
 * thuốc theo nó.
 */
export async function fetchWeather(lat: number, lon: number): Promise<WeatherReport | null> {
  const url =
    `${BASE}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    '&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    // Theo GIỜ — để cảnh báo được "sắp có dông" chứ không chỉ "hôm nay có mưa".
    // `wind_gusts_10m` chứ không phải `wind_speed_10m`: lốc là GIẬT, và gió trung
    // bình 20 km/h có thể giấu một cú giật 70 km/h thổi bay giàn lưới.
    '&hourly=weather_code,precipitation_probability,wind_gusts_10m' +
    '&timezone=Asia%2FBangkok&forecast_days=7';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) return null;
    return parseWeather(await resp.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Chuỗi giờ địa phương của Open-Meteo → epoch ms THẬT.
 *
 * ⚠ Máy chủ trả `"2026-08-18T14:00"` KHÔNG kèm múi giờ, và đó là giờ của
 * `Asia/Bangkok` (ta xin như vậy trong URL). `Date.parse` chuỗi đó sẽ hiểu theo
 * múi giờ CỦA MÁY — đúng khi máy để giờ Việt Nam, và lệch đúng bằng chênh lệch
 * múi giờ khi không. Một cảnh báo "dông trong 2 giờ tới" lệch 7 tiếng thì tệ hơn
 * là không có cảnh báo.
 *
 * Nên quy bằng `utc_offset_seconds` mà chính máy chủ gửi kèm: đọc chuỗi như giờ
 * UTC rồi trừ đi độ lệch. Không đoán theo máy.
 */
export function hourEpoch(local: string, utcOffsetSec: number): number | null {
  if (typeof local !== 'string' || !local) return null;
  // Bù giây nếu máy chủ chỉ gửi tới phút.
  const withSec = local.length === 16 ? `${local}:00` : local;
  const ms = Date.parse(`${withSec}Z`);
  if (Number.isNaN(ms)) return null;
  const off = Number.isFinite(utcOffsetSec) ? utcOffsetSec : 0;
  return ms - off * 1000;
}

/** Tách riêng khỏi `fetch` để kiểm được bằng test mà không cần mạng. */
export function parseWeather(raw: unknown): WeatherReport | null {
  const r = raw as {
    latitude?: number; longitude?: number;
    utc_offset_seconds?: number;
    current?: Record<string, number>;
    daily?: Record<string, unknown>;
    hourly?: Record<string, unknown>;
  } | null;
  const cur = r?.current;
  const daily = r?.daily as {
    time?: string[]; weather_code?: number[];
    temperature_2m_max?: number[]; temperature_2m_min?: number[];
    precipitation_probability_max?: Array<number | null>;
  } | undefined;
  if (!cur || !Number.isFinite(cur.temperature_2m)) return null;

  const days: WeatherDay[] = [];
  const times = daily?.time ?? [];
  for (let i = 0; i < times.length; i++) {
    const maxC = daily?.temperature_2m_max?.[i];
    const minC = daily?.temperature_2m_min?.[i];
    if (!Number.isFinite(maxC) || !Number.isFinite(minC)) continue;
    days.push({
      date: times[i],
      code: Number(daily?.weather_code?.[i] ?? 0),
      maxC: Math.round(maxC as number),
      minC: Math.round(minC as number),
      // Trường này CÓ THỂ null (Open-Meteo trả null khi ngoài tầm mô hình) — quy
      // về 0 chứ đừng để NaN trườn xuống tầng vẽ rồi hiện "NaN%" trên màn.
      rainChance: Math.round(Number(daily?.precipitation_probability_max?.[i] ?? 0) || 0),
    });
  }

  const hourly = r?.hourly as {
    time?: string[];
    weather_code?: Array<number | null>;
    precipitation_probability?: Array<number | null>;
    wind_gusts_10m?: Array<number | null>;
  } | undefined;
  const utcOffset = Number(r?.utc_offset_seconds ?? 0);
  const hours: WeatherHour[] = [];
  const hourTimes = hourly?.time ?? [];
  for (let i = 0; i < hourTimes.length; i++) {
    const at = hourEpoch(hourTimes[i], utcOffset);
    // Giờ không đọc được thì BỎ giờ đó, đừng bỏ cả mảng: dự báo thiếu một giờ
    // vẫn cảnh báo được, còn mảng rỗng thì im lặng.
    if (at === null) continue;
    hours.push({
      at,
      code: Number(hourly?.weather_code?.[i] ?? 0) || 0,
      rainChance: Math.round(Number(hourly?.precipitation_probability?.[i] ?? 0) || 0),
      gustKph: Math.round(Number(hourly?.wind_gusts_10m?.[i] ?? 0) || 0),
    });
  }

  return {
    now: {
      tempC: Math.round(cur.temperature_2m),
      humidity: Math.round(Number(cur.relative_humidity_2m ?? 0)),
      rainMm: Number(cur.precipitation ?? 0),
      windKph: Math.round(Number(cur.wind_speed_10m ?? 0)),
      code: Number(cur.weather_code ?? 0),
    },
    days,
    hours,
    at: { lat: Number(r?.latitude ?? 0), lon: Number(r?.longitude ?? 0) },
  };
}
