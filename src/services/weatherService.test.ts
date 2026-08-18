/**
 * Bài kiểm cho `weatherService`.
 *
 * Hai chỗ dễ hỏng âm thầm: (1) `precipitation_probability_max` CÓ THỂ là `null`
 * — để nguyên thì màn hiện "NaN%"; (2) tâm vườn tính từ ranh giới người dùng vẽ,
 * mà ranh giới đó có thể còn dở dang hoặc toàn số 0.
 */

import {
  centroidOf, describeWeather, farmAdviceKey, hourEpoch, parseWeather, weekdayVi,
  type WeatherDay, type WeatherNow,
} from './weatherService';

const RAW = {
  latitude: 10.79,
  longitude: 106.63,
  current: {
    time: '2026-08-14T10:15', temperature_2m: 31.1, relative_humidity_2m: 69,
    precipitation: 0, weather_code: 3, wind_speed_10m: 14.4,
  },
  daily: {
    time: ['2026-08-14', '2026-08-15'],
    weather_code: [95, 80],
    temperature_2m_max: [32.9, 31.0],
    temperature_2m_min: [26.2, 25.5],
    precipitation_probability_max: [100, null],
  },
};

describe('parseWeather', () => {
  it('đọc đúng số hiện tại, làm tròn về số nguyên cho dễ đọc', () => {
    const r = parseWeather(RAW)!;
    expect(r.now).toEqual({ tempC: 31, humidity: 69, rainMm: 0, windKph: 14, code: 3 });
  });

  it('đọc đủ các ngày dự báo', () => {
    const r = parseWeather(RAW)!;
    expect(r.days).toHaveLength(2);
    expect(r.days[0]).toEqual({ date: '2026-08-14', code: 95, maxC: 33, minC: 26, rainChance: 100 });
  });

  it('khả năng mưa null → 0, KHÔNG để NaN trườn xuống màn hình', () => {
    const r = parseWeather(RAW)!;
    expect(r.days[1].rainChance).toBe(0);
    expect(Number.isNaN(r.days[1].rainChance)).toBe(false);
  });

  it('dữ-liệu hỏng / rỗng → null để màn hiện lời mời thử lại', () => {
    expect(parseWeather(null)).toBeNull();
    expect(parseWeather({})).toBeNull();
    expect(parseWeather({ current: { temperature_2m: 'nóng' } })).toBeNull();
  });

  it('bỏ ngày thiếu nhiệt độ thay vì đẩy undefined ra màn', () => {
    const r = parseWeather({
      ...RAW,
      daily: { ...RAW.daily, temperature_2m_max: [32.9, null] },
    })!;
    expect(r.days).toHaveLength(1);
  });
});

describe('centroidOf', () => {
  it('tâm của bốn đỉnh là điểm giữa', () => {
    expect(centroidOf([
      { lat: 10, lng: 106 }, { lat: 10, lng: 108 },
      { lat: 12, lng: 108 }, { lat: 12, lng: 106 },
    ])).toEqual({ lat: 11, lon: 107 });
  });

  it('bỏ đỉnh (0,0) — ranh giới vẽ dở hay dính điểm rỗng, tính vào là lệch ra biển', () => {
    expect(centroidOf([{ lat: 10, lng: 106 }, { lat: 0, lng: 0 }])).toEqual({ lat: 10, lon: 106 });
  });

  it('chưa vẽ ranh giới → null để caller rơi về toạ-độ mặc định', () => {
    expect(centroidOf([])).toBeNull();
    expect(centroidOf(undefined as never)).toBeNull();
    expect(centroidOf([{ lat: NaN, lng: 1 }])).toBeNull();
  });

  it('toạ-độ vô lý → null chứ không tra thời tiết ở chỗ không có thật', () => {
    expect(centroidOf([{ lat: 999, lng: 106 }])).toBeNull();
  });
});

describe('describeWeather', () => {
  it.each([
    [0, 'trace.sky.clear'], [2, 'trace.sky.partlyCloudy'], [45, 'trace.sky.fog'],
    [61, 'trace.sky.rain'], [80, 'trace.sky.showers'], [95, 'trace.sky.storm'],
  ])('mã %s → %s', (code, key) => {
    expect(describeWeather(code as number).labelKey).toBe(key);
  });

  it('trả KHOÁ chứ không trả câu tiếng Việt — tầng dịch vụ không quyết định ngôn ngữ', () => {
    expect(describeWeather(0).labelKey).toMatch(/^trace\./);
  });

  it('mã lạ → khoá "chưa rõ", không để trống', () => {
    expect(describeWeather(999).labelKey).toBe('trace.sky.unknown');
  });
});

describe('farmAdviceKey', () => {
  const now = (p: Partial<WeatherNow> = {}): WeatherNow =>
    ({ tempC: 30, humidity: 60, rainMm: 0, windKph: 10, code: 1, ...p });
  const day = (p: Partial<WeatherDay> = {}): WeatherDay =>
    ({ date: '2026-08-14', code: 1, maxC: 31, minC: 25, rainChance: 10, ...p });

  it.each([
    ['đang dông', { code: 95 }, {}, 'trace.advice.storm'],
    ['mưa rất cao', {}, { rainChance: 90 }, 'trace.advice.rainLikely'],
    ['đang mưa', { rainMm: 2 }, {}, 'trace.advice.raining'],
    ['nắng gắt', {}, { maxC: 36 }, 'trace.advice.hot'],
    ['khô ráo', { humidity: 55 }, { rainChance: 10 }, 'trace.advice.dry'],
  ])('%s → %s', (_name, n, d, key) => {
    expect(farmAdviceKey(now(n as Partial<WeatherNow>), [day(d as Partial<WeatherDay>)])).toBe(key);
  });

  it('không có gì đáng nói thì IM LẶNG, không nhét câu vô nghĩa', () => {
    expect(farmAdviceKey(now({ humidity: 80 }), [day({ rainChance: 50, maxC: 30 })])).toBeNull();
  });
});

describe('weekdayVi', () => {
  it('ngày hôm nay gọi thẳng là "Hôm nay"', () => {
    expect(weekdayVi('2026-08-14', '2026-08-14')).toBe('Hôm nay');
  });

  it('các ngày sau hiện thứ viết tắt', () => {
    expect(weekdayVi('2026-08-15', '2026-08-14')).toBe('T7');
    expect(weekdayVi('2026-08-16', '2026-08-14')).toBe('CN');
  });

  it('ngày hỏng → chuỗi rỗng', () => {
    expect(weekdayVi('không-phải-ngày')).toBe('');
  });
});

describe('hourEpoch — giờ địa phương của máy chủ → mốc thật', () => {
  it('quy bằng utc_offset_seconds của MÁY CHỦ, không theo múi giờ của máy', () => {
    // 14:00 giờ Việt Nam (UTC+7) = 07:00 UTC.
    expect(hourEpoch('2026-08-18T14:00', 25200)).toBe(Date.parse('2026-08-18T07:00:00Z'));
  });

  it('lệch múi giờ khác vẫn đúng — đây chính là chỗ dễ sai 7 tiếng', () => {
    expect(hourEpoch('2026-08-18T14:00', 0)).toBe(Date.parse('2026-08-18T14:00:00Z'));
  });

  it('chuỗi đã có giây thì không bù thêm', () => {
    expect(hourEpoch('2026-08-18T14:00:30', 25200))
      .toBe(Date.parse('2026-08-18T07:00:30Z'));
  });

  it('chuỗi rác → null, để nơi gọi bỏ ĐÚNG giờ đó chứ không bỏ cả mảng', () => {
    expect(hourEpoch('hôm nay', 25200)).toBeNull();
    expect(hourEpoch('', 25200)).toBeNull();
    expect(hourEpoch(null as any, 25200)).toBeNull();
  });

  it('thiếu độ lệch → coi như UTC, không ra NaN', () => {
    expect(hourEpoch('2026-08-18T14:00', NaN)).toBe(Date.parse('2026-08-18T14:00:00Z'));
  });
});

describe('parseWeather — mảng giờ', () => {
  const base = {
    latitude: 10, longitude: 105, utc_offset_seconds: 25200,
    current: { temperature_2m: 30, relative_humidity_2m: 80, precipitation: 0, weather_code: 0, wind_speed_10m: 9 },
    daily: { time: ['2026-08-18'], weather_code: [0], temperature_2m_max: [33], temperature_2m_min: [25], precipitation_probability_max: [10] },
  };

  it('đọc code · khả năng mưa · gió GIẬT theo giờ', () => {
    const r = parseWeather({
      ...base,
      hourly: {
        time: ['2026-08-18T14:00', '2026-08-18T15:00'],
        weather_code: [0, 95],
        precipitation_probability: [10, 80],
        wind_gusts_10m: [12, 64],
      },
    })!;
    expect(r.hours).toHaveLength(2);
    expect(r.hours[1]).toEqual({
      at: Date.parse('2026-08-18T08:00:00Z'), code: 95, rainChance: 80, gustKph: 64,
    });
  });

  it('một giờ hỏng thì bỏ ĐÚNG giờ đó, giữ phần còn lại', () => {
    const r = parseWeather({
      ...base,
      hourly: { time: ['rác', '2026-08-18T15:00'], weather_code: [0, 0], precipitation_probability: [0, 0], wind_gusts_10m: [0, 0] },
    })!;
    expect(r.hours).toHaveLength(1);
  });

  it('máy chủ không trả hourly → mảng rỗng, KHÔNG phải undefined', () => {
    const r = parseWeather(base)!;
    expect(r.hours).toEqual([]);
  });

  it('giá trị null trong mảng → 0, không để NaN trườn xuống luật cảnh báo', () => {
    const r = parseWeather({
      ...base,
      hourly: { time: ['2026-08-18T14:00'], weather_code: [null], precipitation_probability: [null], wind_gusts_10m: [null] },
    })!;
    expect(r.hours[0]).toMatchObject({ code: 0, rainChance: 0, gustKph: 0 });
  });
});
