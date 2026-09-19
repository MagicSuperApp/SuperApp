import {
  LIBRARY_PICK_OPTIONS,
  reEncodesAwayMetadata,
  readLibraryPick,
} from './treeIdentifyFromLibrary';

describe('tuỳ chọn chọn ảnh — EXIF rơi hay không rơi', () => {
  // Ca này KHÔNG canh một mức nén. Nó canh một tính chất riêng tư đang cưỡi lên
  // một mức nén: bộ chọn chỉ dựng lại tệp (và đánh rơi EXIF) khi nó co ảnh, và
  // nó chỉ co ảnh khi `quality < 1` hoặc có trần kích thước. Nới hai số đó là
  // toạ độ GPS trong ảnh đi thẳng ra máy chủ, và không gì khác đỏ.
  it('tuỳ chọn đang dùng LÀM bộ chọn dựng lại tệp', () => {
    expect(reEncodesAwayMetadata(LIBRARY_PICK_OPTIONS)).toBe(true);
  });

  it('quality 1 không trần kích thước ⟹ tệp GỐC đi thẳng ra, nguyên EXIF', () => {
    expect(reEncodesAwayMetadata({ quality: 1 })).toBe(false);
  });

  it('quality 1 nhưng có trần kích thước ⟹ vẫn dựng lại', () => {
    expect(reEncodesAwayMetadata({ quality: 1, maxWidth: 1600, maxHeight: 1600 })).toBe(true);
  });

  it('không khai quality ⟹ đọc thành 1, tức KHÔNG dựng lại', () => {
    // Vắng mặt phải đọc về phía nguy hiểm, không đọc về phía tiện.
    expect(reEncodesAwayMetadata({})).toBe(false);
  });

  it('trần chỉ đặt MỘT chiều thì không đủ — bộ chọn native đòi cả hai', () => {
    expect(reEncodesAwayMetadata({ quality: 1, maxWidth: 1600 })).toBe(false);
  });
});

describe('đọc kết quả bộ chọn', () => {
  const MIN = 3;

  it('huỷ là hành động bình thường, KHÔNG phải lỗi', () => {
    const out = readLibraryPick({ didCancel: true }, MIN);
    expect(out.blocked).toBe('cancelled');
    expect(out.images).toEqual([]);
  });

  it('lỗi bộ chọn tách riêng khỏi huỷ', () => {
    const out = readLibraryPick({ errorCode: 'permission' }, MIN);
    expect(out.blocked).toBe('failed');
  });

  it('huỷ thắng lỗi khi cả hai cùng có — người bấm Huỷ không thấy chữ đỏ', () => {
    const out = readLibraryPick({ didCancel: true, errorCode: 'others' }, MIN);
    expect(out.blocked).toBe('cancelled');
  });

  it('thiếu ảnh thì nói CÒN THIẾU MẤY, không nói chung chung', () => {
    const out = readLibraryPick({ assets: [{ uri: 'a' }] }, MIN);
    expect(out.blocked).toBe('too-few');
    expect(out.missing).toBe(2);
  });

  it('phần tử không có uri bị loại TRƯỚC khi đếm', () => {
    // Đếm trước rồi lọc sau thì ba phần tử trong đó hai cái rỗng sẽ qua cổng,
    // và lượt nhận diện gửi đi một mảng một ảnh.
    const out = readLibraryPick(
      { assets: [{ uri: 'a' }, { uri: null }, { uri: '' }] },
      MIN,
    );
    expect(out.images).toEqual(['a']);
    expect(out.blocked).toBe('too-few');
  });

  it('đủ ảnh thì không chặn', () => {
    const out = readLibraryPick(
      { assets: [{ uri: 'a' }, { uri: 'b' }, { uri: 'c' }] },
      MIN,
    );
    expect(out.blocked).toBeNull();
    expect(out.images).toEqual(['a', 'b', 'c']);
  });

  it('assets vắng mặt hẳn ⟹ coi là không có ảnh, không ném', () => {
    const out = readLibraryPick({}, MIN);
    expect(out.images).toEqual([]);
    expect(out.blocked).toBe('too-few');
  });
});
