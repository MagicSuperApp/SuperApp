#!/usr/bin/env python3
"""
Vẽ biểu-tượng nguồn của CheckFarm từ bản phác thảo tay của chủ nhân (28/08).

⚠ ĐÂY LÀ BẢN TẠM, cố ý ghi ra đây chứ không giấu trong lịch sử commit.
Chủ nhân nói rõ: dùng để dựng bản THỬ NỘI BỘ, chưa phát hành chính thức. Ngày có
bộ nhận diện thật thì thay `instances/checkfarm/brand/icon-1024.png` rồi chạy
`scripts/sinh-bieu-tuong.py checkfarm` — KHÔNG cần chạy lại tệp này.

Bản phác thảo đọc theo mặt đồng hồ, đúng các mốc chủ nhân ghi tay:
  · một vòng tròn viền
  · lá LỚN: đầu nhọn ở 1h30, thân cong sang trái, đuôi ở 6h
  · lá NHỎ: từ 9h vòng xuống 6h, nằm ở góc dưới-trái
  · ngôi sao 5 cánh ở khoảng 3h–4h, bên phải tâm
"""
import math
from PIL import Image, ImageDraw

S = 1024
CX = CY = S / 2
R = 470

NEN        = (250, 247, 239, 255)
VIEN       = (31, 107, 58, 255)
LA_LON     = (46, 125, 79, 255)
LA_NHO     = (63, 158, 99, 255)
GAN_LA     = (24, 84, 46, 255)
SAO        = (228, 167, 43, 255)


def diem(gio: float, ban_kinh: float = R):
    """Toạ độ theo mặt đồng hồ: 12h ở trên, chạy thuận chiều kim."""
    t = gio / 12 * 2 * math.pi
    return (CX + ban_kinh * math.sin(t), CY - ban_kinh * math.cos(t))


def bezier(p0, p1, p2, p3, n=120):
    """Bézier bậc ba, trả danh sách điểm."""
    ra = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        x = u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]
        ra.append((x, y))
    return ra


def rel(dx, dy):
    """Điểm theo tỉ lệ bán kính, gốc ở tâm."""
    return (CX + dx * R, CY + dy * R)


def ve_sao(d, tam, bk, mau):
    ngoai, trong = bk, bk * 0.42
    dinh = []
    for i in range(10):
        r = ngoai if i % 2 == 0 else trong
        t = -math.pi / 2 + i * math.pi / 5
        dinh.append((tam[0] + r * math.cos(t), tam[1] + r * math.sin(t)))
    d.polygon(dinh, fill=mau)


def ve(size=S) -> Image.Image:
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Nền + viền tròn
    d.ellipse([CX - R, CY - R, CX + R, CY + R], fill=NEN, outline=VIEN, width=14)

    # ── Lá LỚN: 1h30 → 6h ───────────────────────────────────────────────────
    dau, duoi = diem(1.5), diem(6)
    ngoai = bezier(dau, rel(0.10, -0.55), rel(-0.42, 0.18), duoi)      # mép trái, phình ra
    trong = bezier(duoi, rel(0.16, 0.42), rel(0.40, -0.28), dau)       # mép phải, gần thẳng
    d.polygon(ngoai + trong, fill=LA_LON)
    # gân giữa
    d.line(bezier(dau, rel(0.16, -0.42), rel(-0.10, 0.25), duoi), fill=GAN_LA, width=10, joint='curve')

    # ── Lá NHỎ: 9h → 6h, ôm theo vành dưới-trái ─────────────────────────────
    trai, day = diem(9), diem(6)
    tren = bezier(trai, rel(-0.55, 0.30), rel(-0.10, 0.55), day)       # mép trên
    duoi_la = [diem(9 - i * 3 / 60) for i in range(61)]                 # mép dưới = vành tròn 9h→7h30→6h
    d.polygon(tren + list(reversed(duoi_la)), fill=LA_NHO)
    d.line(bezier(trai, rel(-0.60, 0.42), rel(-0.16, 0.66), day), fill=GAN_LA, width=10, joint='curve')

    # ── Ngôi sao, khoảng 3h30 ───────────────────────────────────────────────
    ve_sao(d, rel(0.46, 0.06), R * 0.20, SAO)

    return img.resize((size, size), Image.LANCZOS) if size != S else img


if __name__ == '__main__':
    import sys
    ra = sys.argv[1] if len(sys.argv) > 1 else 'instances/checkfarm/brand/icon-1024.png'
    ve().save(ra)
    print('đã ghi', ra)
