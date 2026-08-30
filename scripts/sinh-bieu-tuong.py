#!/usr/bin/env python3
"""
Sinh TOÀN BỘ biểu-tượng Android của một app từ MỘT tệp ảnh vuông.

    python3 scripts/sinh-bieu-tuong.py checkfarm

Đọc  : instances/<id>/brand/icon-1024.png   (vuông, ≥1024, nền trong suốt được)
       instances/<id>/instance.json          (lấy `android.iconBackground`)
Ghi  : instances/<id>/android/res/mipmap-*/  + values/ic_launcher_background.xml

Vì sao tệp này tồn tại, nói thẳng: để người dựng app KHÔNG phải nhờ ai làm hộ.
Đối tác muốn app mang biểu tượng của họ thì bỏ một ảnh vào `brand/` rồi chạy một
lệnh — không sửa gradle, không sửa Xcode, không mở PR nhờ người khác.

Kết quả được COMMIT vào kho. Cố ý: đường dựng không được phụ thuộc vào việc máy
CI có cài Pillow hay không. Tệp này là tiện ích cho người thêm app, không phải
một bước trong bản dựng.

── Vì sao đủ ngần này tệp ────────────────────────────────────────────────────
  ic_launcher / ic_launcher_round   biểu tượng đời cũ (Android < 8), 5 mật độ
  ic_launcher_foreground            lớp trước của biểu tượng thích ứng (≥ 8)
  ic_launcher_background            MÀU nền của lớp sau
Lớp trước phải chừa lề: hệ điều hành cắt nó theo hình mặt nạ của từng hãng máy
(tròn, vuông bo, giọt nước…) và chỉ 66/108 ở giữa là chắc chắn nhìn thấy. Vẽ
tràn viền thì Samsung cắt mất đầu lá mà máy khác thì không — hỏng theo hãng máy.
"""
import json
import os
import sys
from PIL import Image

# (thư mục, cạnh biểu-tượng đời cũ, cạnh lớp thích ứng)
MAT_DO = [
    ('mipmap-mdpi',     48, 108),
    ('mipmap-hdpi',     72, 162),
    ('mipmap-xhdpi',    96, 216),
    ('mipmap-xxhdpi',  144, 324),
    ('mipmap-xxxhdpi', 192, 432),
]

# Lớp trước của biểu-tượng thích ứng: phần chắc chắn thấy là 66/108 ở giữa.
TI_LE_AN_TOAN = 66 / 108

XML_THICH_UNG = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
'''


def bo_nen(anh: Image.Image, mau: str) -> Image.Image:
    """Dán ảnh lên nền đặc — biểu-tượng đời cũ không có kênh trong suốt."""
    r, g, b = int(mau[1:3], 16), int(mau[3:5], 16), int(mau[5:7], 16)
    nen = Image.new('RGBA', anh.size, (r, g, b, 255))
    nen.alpha_composite(anh)
    return nen


def sinh(ma_app: str) -> None:
    goc = os.path.join('instances', ma_app)
    tep_cau_hinh = os.path.join(goc, 'instance.json')
    if not os.path.isfile(tep_cau_hinh):
        sys.exit(f'❌ không thấy {tep_cau_hinh}')
    cau_hinh = json.load(open(tep_cau_hinh))
    mau_nen = cau_hinh.get('android', {}).get('iconBackground', '#FFFFFF')

    nguon = os.path.join(goc, 'brand', 'icon-1024.png')
    if not os.path.isfile(nguon):
        sys.exit(f'❌ không thấy {nguon} — bỏ một ảnh VUÔNG ≥1024px vào đó rồi chạy lại')
    anh = Image.open(nguon).convert('RGBA')
    if anh.width != anh.height:
        sys.exit(f'❌ {nguon} phải VUÔNG, đang là {anh.width}×{anh.height}')
    if anh.width < 1024:
        sys.exit(f'❌ {nguon} phải ≥1024px, đang là {anh.width}px')

    res = os.path.join(goc, 'android', 'res')
    for thu_muc, canh_cu, canh_thich_ung in MAT_DO:
        d = os.path.join(res, thu_muc)
        os.makedirs(d, exist_ok=True)

        cu = bo_nen(anh, mau_nen).resize((canh_cu, canh_cu), Image.LANCZOS)
        cu.convert('RGB').save(os.path.join(d, 'ic_launcher.png'))
        cu.convert('RGB').save(os.path.join(d, 'ic_launcher_round.png'))

        # Lớp trước: thu ảnh về vùng an toàn giữa khung, phần còn lại trong suốt.
        truoc = Image.new('RGBA', (canh_thich_ung, canh_thich_ung), (0, 0, 0, 0))
        canh_trong = int(canh_thich_ung * TI_LE_AN_TOAN)
        le = (canh_thich_ung - canh_trong) // 2
        truoc.alpha_composite(anh.resize((canh_trong, canh_trong), Image.LANCZOS), (le, le))
        truoc.save(os.path.join(d, 'ic_launcher_foreground.png'))

    d = os.path.join(res, 'mipmap-anydpi-v26')
    os.makedirs(d, exist_ok=True)
    for ten in ('ic_launcher.xml', 'ic_launcher_round.xml'):
        open(os.path.join(d, ten), 'w').write(XML_THICH_UNG)

    d = os.path.join(res, 'values')
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, 'ic_launcher_background.xml'), 'w').write(
        '<resources>\n'
        f'  <!-- Sinh bởi scripts/sinh-bieu-tuong.py từ instances/{ma_app}/instance.json. -->\n'
        f'  <color name="ic_launcher_background">{mau_nen}</color>\n'
        '</resources>\n'
    )

    print(f'✅ {ma_app}: đã sinh {len(MAT_DO)} mật độ + lớp thích ứng vào {res}')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit('dùng: python3 scripts/sinh-bieu-tuong.py <mã app>   (vd: checkfarm)')
    for ma in sys.argv[1:]:
        sinh(ma)
