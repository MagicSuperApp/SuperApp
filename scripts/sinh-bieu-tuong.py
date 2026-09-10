#!/usr/bin/env python3
"""
Sinh TOÀN BỘ biểu-tượng Android **và iOS** của một app từ MỘT tệp ảnh vuông.

    python3 scripts/sinh-bieu-tuong.py checkfarm

Đọc  : instances/<id>/brand/icon-1024.png   (vuông, ≥1024, nền trong suốt được)
       instances/<id>/instance.json          (lấy `android.iconBackground`)
Ghi  : instances/<id>/android/res/mipmap-*/  + values/ic_launcher_background.xml
       instances/<id>/ios/AppIcon.appiconset/  (19 tệp PNG + Contents.json)

Vì sao tệp này tồn tại, nói thẳng: để người dựng app KHÔNG phải nhờ ai làm hộ.
Đối tác muốn app mang biểu tượng của họ thì bỏ một ảnh vào `brand/` rồi chạy một
lệnh — không sửa gradle, không sửa Xcode, không mở PR nhờ người khác.

Kết quả được COMMIT vào kho. Cố ý: đường dựng không được phụ thuộc vào việc máy
CI có cài Pillow hay không. Tệp này là tiện ích cho người thêm app, không phải
một bước trong bản dựng.

⚠ ĐỪNG chạy lại cho một app ĐÃ PHÁT HÀNH chỉ vì thấy tiện. Đo 2026-09-10 trên
`aladin`: chạy lại sinh ra bộ khác BYTE với bộ đang nằm trên cửa hàng, cả Android
lẫn iOS, dù ảnh nguồn trùng byte. Nguyên nhân là bộ cũ do công cụ khác dựng, và ở
cỡ nhỏ (20×20, 29×29) thì hai thuật toán thu ảnh cho ra hai ảnh KHÁC NHAU thật —
không phải khác mã hoá. Nên bộ iOS của `aladin` trong `instances/aladin/ios/` là
bản CHÉP từ bộ đang phát hành, không phải bản sinh ra từ đây. Ngày nào đổi nhận
diện thì mới sinh lại, và lúc đó là đổi có chủ ý.

── Vì sao đủ ngần này tệp ────────────────────────────────────────────────────
  ic_launcher / ic_launcher_round   biểu tượng đời cũ (Android < 8), 5 mật độ
  ic_launcher_foreground            lớp trước của biểu tượng thích ứng (≥ 8)
  ic_launcher_background            MÀU nền của lớp sau
Lớp trước phải chừa lề: hệ điều hành cắt nó theo hình mặt nạ của từng hãng máy
(tròn, vuông bo, giọt nước…) và chỉ 66/108 ở giữa là chắc chắn nhìn thấy. Vẽ
tràn viền thì Samsung cắt mất đầu lá mà máy khác thì không — hỏng theo hãng máy.

── Vì sao iOS chỉ có MỘT lớp, và vì sao KHÔNG được có kênh trong suốt ────────
iOS không có biểu-tượng thích ứng: mỗi cỡ là một ảnh ĐẶC, hệ điều hành tự bo góc.
Nên bản iOS dùng đúng phép làm phẳng của biểu-tượng Android đời cũ (`bo_nen`) —
cùng một hàm, để hai nền tảng không trôi khỏi nhau.

Kênh trong suốt là chỗ hỏng ĐẮT nhất ở đây: Xcode dựng được, ký được, tải lên
được, rồi App Store Connect từ chối ở bước **nộp**. Tức chỗ hỏng lộ ra cách chỗ
gõ nhầm vài tiếng đồng hồ, và cách nó cả một lượt dựng trả tiền. Vì vậy mọi tệp
ghi ra đều `.convert('RGB')` — không phải để nhẹ tệp, mà để cái sai đó không thể
xảy ra.
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

# ── iOS ──────────────────────────────────────────────────────────────────────
# Tên tệp MANG cạnh tính bằng điểm ảnh, và đó là quy ước cố ý chứ không phải
# trùng hợp: `icon-180.png` là 180×180. Nhờ vậy bảng dưới không cần cột thứ hai,
# và không có chỗ nào để hai cột lệch nhau.
#
# `icon-ipad-*` trùng cạnh với vài tệp iPhone (`icon-ipad-40` cũng là 40×40).
# Giữ hai tệp riêng thay vì trỏ chung một tệp là theo đúng bộ đang phát hành —
# và đổi cách đặt tên của một bộ biểu-tượng đang sống trên cửa hàng thì được gì
# không rõ, mất gì thì rõ.
TEN_TEP_IOS = [
    'icon-20.png', 'icon-29.png', 'icon-40.png', 'icon-58.png', 'icon-60.png',
    'icon-76.png', 'icon-80.png', 'icon-87.png', 'icon-120.png', 'icon-152.png',
    'icon-167.png', 'icon-180.png', 'icon-1024.png',
    'icon-ipad-20.png', 'icon-ipad-29.png', 'icon-ipad-40.png',
    'icon-ipad-76.png', 'icon-ipad-152.png', 'icon-ipad-167.png',
]

# Chép nguyên văn từ bộ đang phát hành
# (`ios/SuperApp/Images.xcassets/AppIcon.appiconset/Contents.json`). Đây là bảng
# do Xcode viết; không tự bịa lại bố cục.
CONTENTS_IOS = '''{
  "images" : [
    { "filename" : "icon-1024.png", "idiom" : "universal", "platform" : "ios", "size" : "1024x1024" },
    { "filename" : "icon-40.png", "idiom" : "iphone", "scale" : "2x", "size" : "20x20" },
    { "filename" : "icon-60.png", "idiom" : "iphone", "scale" : "3x", "size" : "20x20" },
    { "filename" : "icon-58.png", "idiom" : "iphone", "scale" : "2x", "size" : "29x29" },
    { "filename" : "icon-87.png", "idiom" : "iphone", "scale" : "3x", "size" : "29x29" },
    { "filename" : "icon-80.png", "idiom" : "iphone", "scale" : "2x", "size" : "40x40" },
    { "filename" : "icon-120.png", "idiom" : "iphone", "scale" : "3x", "size" : "40x40" },
    { "filename" : "icon-120.png", "idiom" : "iphone", "scale" : "2x", "size" : "60x60" },
    { "filename" : "icon-180.png", "idiom" : "iphone", "scale" : "3x", "size" : "60x60" },
    { "filename" : "icon-ipad-20.png", "idiom" : "ipad", "scale" : "1x", "size" : "20x20" },
    { "filename" : "icon-ipad-40.png", "idiom" : "ipad", "scale" : "2x", "size" : "20x20" },
    { "filename" : "icon-ipad-29.png", "idiom" : "ipad", "scale" : "1x", "size" : "29x29" },
    { "filename" : "icon-58.png", "idiom" : "ipad", "scale" : "2x", "size" : "29x29" },
    { "filename" : "icon-ipad-40.png", "idiom" : "ipad", "scale" : "1x", "size" : "40x40" },
    { "filename" : "icon-80.png", "idiom" : "ipad", "scale" : "2x", "size" : "40x40" },
    { "filename" : "icon-ipad-76.png", "idiom" : "ipad", "scale" : "1x", "size" : "76x76" },
    { "filename" : "icon-ipad-152.png", "idiom" : "ipad", "scale" : "2x", "size" : "76x76" },
    { "filename" : "icon-ipad-167.png", "idiom" : "ipad", "scale" : "2x", "size" : "83.5x83.5" },
    { "filename" : "icon-1024.png", "idiom" : "ios-marketing", "scale" : "1x", "size" : "1024x1024" }
  ],
  "info" : { "author" : "xcode", "version" : 1 }
}
'''

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

    sinh_ios(ma_app, anh, mau_nen)


def sinh_ios(ma_app: str, anh: Image.Image, mau_nen: str) -> None:
    """Sinh bộ AppIcon.appiconset của một app.

    KHÔNG ghi thẳng vào `ios/SuperApp/Images.xcassets/`. Bộ trong `ios/` là bộ
    của app đang được dựng, do bước dựng chép vào; ghi thẳng vào đó là đặt biểu
    tượng của app cuối cùng chạy script này lên mọi bản dựng sau.
    """
    dich = os.path.join('instances', ma_app, 'ios', 'AppIcon.appiconset')
    os.makedirs(dich, exist_ok=True)

    dac = bo_nen(anh, mau_nen)
    for ten in TEN_TEP_IOS:
        canh = int(ten.rsplit('-', 1)[1].removesuffix('.png'))
        # `.convert('RGB')` bỏ hẳn kênh alpha — xem khối đầu tệp: alpha đi lọt tới
        # tận bước NỘP rồi mới bị từ chối.
        dac.resize((canh, canh), Image.LANCZOS).convert('RGB').save(os.path.join(dich, ten))

    open(os.path.join(dich, 'Contents.json'), 'w').write(CONTENTS_IOS)
    print(f'✅ {ma_app}: đã sinh {len(TEN_TEP_IOS)} cỡ iOS vào {dich}')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit('dùng: python3 scripts/sinh-bieu-tuong.py <mã app>   (vd: checkfarm)')
    for ma in sys.argv[1:]:
        sinh(ma)
