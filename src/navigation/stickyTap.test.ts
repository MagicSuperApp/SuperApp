import { stickyTapAction } from './stickyTap';

describe('stickyTapAction — chạm ở chế độ dính', () => {
  it('mục CÓ arc con: chạm lần đầu bung tầng 2, KHÔNG mở thẳng module', () => {
    expect(stickyTapAction({ hasSub: true }, 2, 1, -1)).toEqual({ kind: 'openSub', index: 2 });
  });

  it('mục KHÔNG có arc con: chạm là chạy ngay, y như cũ', () => {
    expect(stickyTapAction({ hasSub: false }, 0, 1, -1)).toEqual({ kind: 'run', index: 0 });
    expect(stickyTapAction({}, 0, 1, -1)).toEqual({ kind: 'run', index: 0 });
    expect(stickyTapAction(undefined, 0, 1, -1)).toEqual({ kind: 'run', index: 0 });
  });

  it('chạm LẠI đúng mục đang mở arc con → mở module. Đây là đường thoát, đừng gỡ', () => {
    expect(stickyTapAction({ hasSub: true }, 2, 2, 2)).toEqual({ kind: 'run', index: 2 });
  });

  it('đang mở arc con của mục khác → chạm mục có arc con thì CHUYỂN arc, không chạy', () => {
    expect(stickyTapAction({ hasSub: true }, 3, 2, 2)).toEqual({ kind: 'openSub', index: 3 });
  });

  it('đang ở tầng 2 mà chạm mục KHÔNG có arc con → chạy nó', () => {
    expect(stickyTapAction({ hasSub: false }, 1, 2, 2)).toEqual({ kind: 'run', index: 1 });
  });
});
