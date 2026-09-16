// TỆP SINH TỰ ĐỘNG — ĐỪNG SỬA TAY.
//
// Nguồn: Wish/playbooks/*.md
// Sinh lại: (trong thư mục Genie) `node scripts/export-playbooks.js`
//
// Đây là sổ playbook BIÊN DỊCH SẴN trong gói app, để đường tắt trợ lý chạy được
// KHI MẤT MẠNG — mà ngoài vườn thì mất mạng là mặc định, không phải ngoại lệ.
//
// Giá trị thuần, không có đường thực thi nào (INV-SEC, `navigation/registry.ts:7-13`).
// Câu trong `say` là câu KHAI TAY đã qua cổng CI đối chiếu nhãn nút với mã màn
// (`Genie/test/playbook.test.js`) — KHÔNG phải câu do mô hình sinh ra.

export interface GenieAnchor {
  key: string;
  /** Nhãn nút ĐÚNG NGUYÊN VĂN như trên màn hình. Đổi nhãn màn thì phải đổi ở đây. */
  label: string;
}

export interface GeniePlaybook {
  id: string;
  /** Tên route trong navigator. */
  route: string;
  params: Record<string, unknown>;
  /** Những cách người ta thật sự nói ra việc này. */
  utterances: string[];
  anchors: GenieAnchor[];
  /** Câu trợ lý đọc lên ngay sau khi mở màn. */
  say: string;
  rev: number;
}

export const GENIE_PLAYBOOKS: readonly GeniePlaybook[] = [
  {
    "id": "activity.log",
    "route": "Activity",
    "params": {},
    "utterances": [
      "ghi lịch sử",
      "ghi nhật ký",
      "ghi sổ",
      "nhật ký vườn",
      "ghi việc đã làm",
      "sổ tay vườn"
    ],
    "anchors": [],
    "say": "Em mở sổ nhật ký cho bác rồi ạ. Bác ghi hôm nay làm gì — tưới, bón, phun, hay hái — rồi lưu lại là xong.",
    "rev": 1
  },
  {
    "id": "animal.book",
    "route": "AnimalManagement",
    "params": {},
    "utterances": [
      "sổ vật nuôi",
      "danh sách con vật",
      "đàn của tôi",
      "xem đàn",
      "tôi có mấy con"
    ],
    "anchors": [],
    "say": "Em mở sổ vật nuôi của bác rồi ạ. Bác bấm vào con nào thì em mở chi tiết con đó.",
    "rev": 1
  },
  {
    "id": "animal.scan",
    "route": "AnimalIdentity",
    "params": {},
    "utterances": [
      "quét con vật",
      "chụp con bò",
      "nhận diện con vật",
      "soi con vật",
      "con này là con nào",
      "quét vật nuôi"
    ],
    "anchors": [],
    "say": "Em mở máy ảnh nhận diện con vật cho bác rồi ạ. Bác chụp con vật cần nhận, máy sẽ dò xem là con nào trong sổ.",
    "rev": 1
  },
  {
    "id": "care.scan",
    "route": "CareScan",
    "params": {},
    "utterances": [
      "quét nhãn thuốc",
      "chụp bao phân",
      "quét thuốc",
      "chụp nhãn thuốc",
      "ghi thuốc",
      "ghi phân bón"
    ],
    "anchors": [
      {
        "key": "identify",
        "label": "Nhận diện nhãn"
      },
      {
        "key": "manual-pick",
        "label": "Chọn tay trong danh mục"
      },
      {
        "key": "retake",
        "label": "Chụp lại"
      }
    ],
    "say": "Em mở máy ảnh quét nhãn cho bác rồi. Bác chụp rõ cái nhãn trên bao hoặc chai, rồi bấm **Nhận diện nhãn**. Máy đọc không ra thì bác bấm **Chọn tay trong danh mục** cũng được ạ.",
    "rev": 1
  },
  {
    "id": "farm.add",
    "route": "FarmDetail",
    "params": {},
    "utterances": [
      "thêm vườn",
      "tạo vườn",
      "làm vườn mới",
      "khai vườn",
      "đăng ký vườn",
      "mở vườn mới",
      "vườn mới"
    ],
    "anchors": [
      {
        "key": "mode-auto",
        "label": "Tự động ghi"
      },
      {
        "key": "mode-manual",
        "label": "Tự vẽ điểm"
      }
    ],
    "say": "Em mở tính năng thêm vườn cho bác rồi. Bác chọn **Tự động ghi** thì cứ đi vòng quanh vườn, máy tự chấm điểm theo bước chân. Chọn **Tự vẽ điểm** thì bác chấm tay lên bản đồ. Bác muốn cái nào ạ?",
    "rev": 1
  },
  {
    "id": "farm.list",
    "route": "FarmList",
    "params": {},
    "utterances": [
      "xem vườn",
      "vườn của tôi",
      "danh sách vườn",
      "tôi có mấy vườn",
      "sổ vườn",
      "các vườn"
    ],
    "anchors": [],
    "say": "Em mở danh sách vườn của bác rồi ạ. Bác bấm vào vườn nào thì em mở chi tiết vườn đó.",
    "rev": 1
  },
  {
    "id": "farm.map",
    "route": "FarmMap",
    "params": {},
    "utterances": [
      "bản đồ vườn",
      "xem bản đồ",
      "vườn trên bản đồ",
      "ranh vườn",
      "xem ranh"
    ],
    "anchors": [],
    "say": "Em mở bản đồ vườn cho bác rồi ạ. Bác kéo và phóng to để xem ranh với vị trí từng cây.",
    "rev": 1
  },
  {
    "id": "fruit.video",
    "route": "FruitVideo",
    "params": {},
    "utterances": [
      "quay video quả",
      "quay quả",
      "quay trái",
      "quay video trái cây",
      "thu video quả"
    ],
    "anchors": [],
    "say": "Em mở máy quay cho bác rồi ạ. Bác quay chậm quanh quả, đủ sáng, rồi gửi lên là xong.",
    "rev": 1
  },
  {
    "id": "notify",
    "route": "Notifications",
    "params": {},
    "utterances": [
      "thông báo",
      "xem thông báo",
      "có tin gì mới không",
      "tin nhắn hệ thống"
    ],
    "anchors": [],
    "say": "Em mở thông báo cho bác rồi ạ.",
    "rev": 1
  },
  {
    "id": "trace.scan",
    "route": "TraceScan",
    "params": {},
    "utterances": [
      "quét mã truy xuất",
      "quét mã",
      "quét tem",
      "tra nguồn gốc",
      "quét qr",
      "soi nguồn gốc"
    ],
    "anchors": [],
    "say": "Em mở máy quét mã cho bác rồi ạ. Bác đưa mã trên tem vào khung là máy tự đọc.",
    "rev": 1
  },
  {
    "id": "tree.scan",
    "route": "TreeIdentity",
    "params": {},
    "utterances": [
      "quét cây",
      "chụp cây",
      "nhận diện cây",
      "cây này là cây nào",
      "soi cây",
      "định danh cây"
    ],
    "anchors": [
      {
        "key": "create-farm",
        "label": "Tạo vườn mới"
      },
      {
        "key": "confirm-yes",
        "label": "Đúng"
      },
      {
        "key": "confirm-no",
        "label": "Sai"
      },
      {
        "key": "enroll-new",
        "label": "Đăng ký cây mới"
      },
      {
        "key": "retry",
        "label": "Nhận diện lại"
      }
    ],
    "say": "Em mở máy ảnh quét cây cho bác rồi. Bác chọn vườn rồi chụp cái cây cần nhận, máy sẽ dò xem là cây nào trong sổ. Nếu máy đoán đúng bác bấm **Đúng**, đoán sai thì bấm **Sai** ạ.",
    "rev": 1
  },
  {
    "id": "wallet.open",
    "route": "PhoenixWallet",
    "params": {},
    "utterances": [
      "mở ví",
      "xem ví",
      "ví của tôi",
      "số dư",
      "xem số dư",
      "ví tiền"
    ],
    "anchors": [],
    "say": "Em mở ví cho bác rồi ạ. Từ đây em dừng — chuyện tiền bác tự bấm giúp em nhé.",
    "rev": 1
  },
  {
    "id": "work.post",
    "route": "PostJob",
    "params": {},
    "utterances": [
      "đăng việc",
      "thuê người",
      "tìm người làm",
      "cần người làm",
      "đăng tin tuyển",
      "mướn người"
    ],
    "anchors": [],
    "say": "Em mở tính năng đăng việc cho bác rồi ạ. Bác kể việc cần làm, còn giá cả thì bác thoả thuận trực tiếp với người nhận.",
    "rev": 1
  }
] as const;

/**
 * Tổng số playbook trong gói — nơi gọi dùng để biết trợ lý có việc gì làm được.
 *
 * Khai kiểu `number` chứ KHÔNG để `tsc` tự suy ra kiểu chữ-số-cố-định (`13`):
 * suy ra được thì mọi phép so sánh với 0 bị báo là "không bao giờ xảy ra", và một
 * cổng bảo vệ ở nơi gọi biến thành một lỗi biên dịch. Cổng phải sống sót qua lần
 * sinh lại tiếp theo, kể cả khi sổ playbook có đúng một mục hay rỗng.
 */
export const GENIE_PLAYBOOK_COUNT: number = 13;

/**
 * Mọi scope sổ tool ĐÒI — sinh từ chính `src/genie/tools/registry.js`.
 *
 * Phiên mở với danh sách này thì máy chủ trả về ĐỦ sổ tool. Thiếu một cái là
 * `visibleCatalog` lọc mất đúng những tool cần nó — và nó hỏng CÂM: phiên vẫn
 * mở, vẫn 200, sổ tool vẫn trả về, chỉ ngắn đi.
 *
 * ⛔ Ca đã xảy ra: `genieAgent.ts` gõ tay `farm.read`/`care.write`… không khớp
 * một chữ nào với tên thật `read:trace.record`/`write:trace.record`. App nhìn
 * thấy đúng 5 tool `ui.*`; 17 tool máy chủ vô hình. Trợ lý mở được màn mà không
 * đọc nổi một cái vườn.
 */
export const GENIE_SCOPES: readonly string[] = [
  'read:profile',
  'read:trace.record',
  'read:work.job',
  'write:trace.record',
  'write:work.job',
];
