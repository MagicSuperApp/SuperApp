/**
 * Độ phủ của cổng xác thực — bài kiểm theo DANH SÁCH ĐÓNG.
 *
 * ══ Vì sao không kiểm từng cổng một ═════════════════════════════════════════
 * Một bài kiểm "cổng X đứng đúng chỗ" chỉ trả lời được câu *"cổng X còn không"*.
 * Câu phải hỏi là câu khác: *"còn đường nhạy nào KHÔNG có cổng không"* — và câu
 * đó không trả lời được bằng cách đếm các cổng đã biết, vì đường thứ N+1 chưa
 * sinh ra lúc viết bài.
 *
 * Nên bài này đảo chiều: nó quét NGUỒN tìm mọi nơi gọi một đường nhạy, rồi so
 * với danh sách khai bên dưới. Thêm một nơi gọi mà không khai ⟹ ĐỎ. Người thêm
 * buộc phải mở tệp này, đọc tiêu chí, và tự trả lời "chỗ này có cần cổng không".
 *
 * ══ Tiêu chí gắn cổng (chốt 13/09) ══════════════════════════════════════════
 * Chỉ gắn ở chỗ **RA TIỀN** và chỗ **MẤT DANH TÍNH** — nơi hỏng thì không hoàn
 * tác được. KHÔNG gắn ở chỗ chỉ ĐỌC (số dư, địa chỉ ví, khoá công khai): đặt
 * cổng lên thao tác hằng ngày là cách chắc nhất để người dùng tắt hẳn sinh trắc,
 * và lúc đó mất luôn cổng ở chỗ thật sự cần.
 *
 * ══ Giới hạn của bài này, nói ra để không ai tin quá mức ═════════════════════
 * Nó đo trên MẪU CHỮ trong nguồn, nên nó không thấy một đường nhạy gọi qua biến
 * trung gian hay qua một lớp bọc mới. Nó chặn được kiểu quên hay gặp nhất (thêm
 * một màn gọi thẳng `txSubmit`), không chặn được người cố ý đi vòng.
 */

import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..');

/** Mọi tệp mã trong `src/`, trừ bài kiểm. */
function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) { listSourceFiles(p, out); continue; }
    if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
    out.push(p);
  }
  return out;
}

const FILES = listSourceFiles(SRC);
const relPath = (p: string) => path.relative(SRC, p).replace(/\\/g, '/');

/**
 * Nguồn đã bỏ các dòng CHÚ THÍCH.
 *
 * Cần thiết vì kho này giải thích rất nhiều trong chú thích, và một chú thích
 * nhắc tên đường nhạy (`wallet.txSubmit(cbor)` ở đầu `cardanoTxService.ts`) làm
 * bài kiểm báo động ở một tệp không gọi gì cả — cảnh báo giả dạy người đọc lướt
 * qua, đúng thứ phải tránh nhất ở một bài canh.
 *
 * Bỏ theo DÒNG chứ không cắt giữa dòng: cắt từ `//` trở đi sẽ chém nhầm phần sau
 * của một URL trong chuỗi (`'https://…'`), và chém nhầm ở đây làm bài kiểm BỎ SÓT
 * — tức hỏng theo chiều im lặng. Bỏ nguyên dòng thì ca đáng ngờ được GIỮ LẠI và
 * bài đỏ, chiều hỏng ồn ào.
 */
function codeOnly(src: string): string {
  return src
    .split('\n')
    .map((line) => (/^\s*(\/\/|\/\*|\*)/.test(line) ? '' : line))
    .join('\n');
}

/**
 * Các đường NHẠY, và nơi KHAI BÁO chúng (nơi khai không phải nơi gọi).
 *
 * `declaredIn` là tệp định nghĩa ra chính đường đó — cổng đặt ở đấy thì vô nghĩa,
 * vì đấy là cái được gọi chứ không phải cái gọi.
 */
const SENSITIVE_PATHS: { label: string; pattern: RegExp; declaredIn: string[] }[] = [
  {
    label: 'nộp giao dịch lên Cardano',
    pattern: /\.txSubmit\(/,
    declaredIn: ['services/phoenixKey-api.ts', 'services/phoenixWallet-api.ts'],
  },
  {
    label: 'ký bằng khoá ví (Ed25519)',
    pattern: /\bsignEd25519\(/,
    declaredIn: ['sdk/taadEnclave.ts'],
  },
  {
    label: 'ký một giao dịch do bên ngoài dựng',
    pattern: /\bwitnessUnsignedTx\(/,
    declaredIn: ['sdk/taadEnclave.ts'],
  },
  {
    label: 'biến khoá gốc thành 24 từ đọc được',
    pattern: /\bmasterKekToMnemonic\(/,
    declaredIn: ['sdk/taadEnclave.ts'],
  },
  {
    label: 'gỡ một máy khỏi danh tính',
    pattern: /deviceLifecycle\.revoke\(/,
    declaredIn: ['services/phoenixKey-api.ts'],
  },
];

/**
 * DANH SÁCH ĐÓNG — mọi tệp được phép gọi một đường nhạy, và cổng nào canh nó.
 *
 * `gate` là chuỗi phải xuất hiện TRƯỚC lời gọi nhạy đầu tiên trong tệp.
 * `why` bắt buộc: một dòng trong danh sách mà không nói được vì sao nó ở đây là
 * một dòng người sau sẽ chép thêm mà không nghĩ.
 */
const ALLOWED: { file: string; gate: string; why: string; orderInFile?: false }[] = [
  {
    file: 'services/cardanoTxService.ts',
    gate: 'requireUserPresence(',
    why: 'chuyển ADA/LAMP đi khỏi ví — ra tiền trực tiếp',
  },
  {
    file: 'services/stakingService.ts',
    gate: 'requireUserPresence(',
    why: 'uỷ thác đặt cọc khoá stake và đổi nơi nhận thưởng',
  },
  {
    file: 'services/wakemeService.ts',
    gate: 'requireUserPresence(',
    why: 'ký một CBOR do máy chủ dựng — app không đọc được nội dung bên trong',
  },
  {
    file: 'screens/SignRequestScreen.tsx',
    gate: 'requireUserPresence(',
    why: 'ký một yêu cầu do bên ngoài soạn — đường ký mạnh nhất trong app',
  },
  {
    file: 'screens/MyDevicesScreen.tsx',
    gate: 'requireUserPresence(',
    why: 'gỡ máy khỏi danh tính, máy bị gỡ không tự lấy lại được',
  },
  {
    file: 'screens/SeedExportScreen.tsx',
    gate: 'signRaw(',
    why: 'hiện 24 từ — lộ bí mật; cổng có từ trước khi `requireUserPresence` ra đời',
  },
  {
    file: 'screens/RestoreIdentityScreen.tsx',
    gate: 'signRaw(',
    // Thứ tự chữ ở tệp này KHÔNG đo được, và đó là trạng thái thứ ba — không phải
    // "khớp", không phải "lệch". Cổng nằm trong `doRestoreSameDevice`, còn lời gọi
    // nhạy nằm trong `tryAttachWith` mà hàm kia gọi xuống; theo vị trí ký tự thì
    // cổng đứng SAU. Ép một phép so vị trí ở đây là ép bài kiểm nói "lệch" cho một
    // ca đúng, và cảnh báo giả thì đắt hơn không có cảnh báo.
    orderInFile: false,
    why:
      'ký challenge khôi phục. Hai lối vào đều đã có điều kiện: lối ví-sẵn-có qua ' +
      '`doRestoreSameDevice` (cổng `signRaw` tại chỗ, `RestoreIdentityScreen.tsx:385`), ' +
      'lối 24 từ thì chính 24 từ là bằng chứng — và 24 từ KHÔNG nằm trên máy nên ' +
      'người mượn máy không lấy được',
  },
];

describe('độ phủ cổng — danh sách ĐÓNG', () => {
  for (const sp of SENSITIVE_PATHS) {
    it(`không có nơi gọi LẠ nào cho: ${sp.label}`, () => {
      const callers = FILES
        .filter((p) => !sp.declaredIn.includes(relPath(p)))
        .filter((p) => sp.pattern.test(codeOnly(fs.readFileSync(p, 'utf8'))))
        .map(relPath)
        .sort();

      const declared = ALLOWED.map((a) => a.file);
      const unknown = callers.filter((f) => !declared.includes(f));

      // Đỏ ở đây KHÔNG có nghĩa là mã sai. Nó có nghĩa: có một đường nhạy mới mà
      // chưa ai trả lời câu "chỗ này có cần cổng không". Trả lời rồi thì hoặc gắn
      // cổng và khai vào `ALLOWED`, hoặc khai kèm lý do vì sao không cần.
      expect(unknown).toEqual([]);
    });
  }

  for (const a of ALLOWED) {
    const nhan = a.orderInFile === false
      ? `cổng CÓ MẶT trong ${a.file} (thứ tự chữ không đo được)`
      : `cổng đứng TRƯỚC đường nhạy trong ${a.file}`;

    it(nhan, () => {
      const src = codeOnly(fs.readFileSync(path.join(SRC, a.file), 'utf8'));

      const hits = SENSITIVE_PATHS
        .filter((sp) => !sp.declaredIn.includes(a.file))
        .map((sp) => src.search(sp.pattern))
        .filter((i) => i >= 0);

      // Tệp được khai mà không còn gọi đường nhạy nào ⟹ dòng khai đã chết. Xoá nó
      // đi, đừng để nó ở lại làm danh sách trông đầy hơn thực tế.
      expect(hits.length).toBeGreaterThan(0);

      const gatePos = src.indexOf(a.gate);
      expect(gatePos).toBeGreaterThan(-1);
      if (a.orderInFile !== false) {
        expect(gatePos).toBeLessThan(Math.min(...hits));
      }
    });
  }

  it('mỗi dòng trong danh sách đều nói được vì sao nó ở đó', () => {
    for (const a of ALLOWED) {
      expect(a.why.length).toBeGreaterThan(20);
    }
  });

  it('KHÔNG gắn cổng ở màn chỉ ĐỌC dữ liệu công khai', () => {
    // Đối chứng cho tiêu chí: `ExportIdentityScreen` đã soát và CỐ Ý không gắn —
    // nó chỉ hiện DID, khoá công khai, địa chỉ ví. Bài này đỏ khi có ai gắn cổng
    // vào đó, vì đó là dấu hiệu tiêu chí đang trôi về phía "gắn cho chắc".
    const src = fs.readFileSync(path.join(SRC, 'screens/ExportIdentityScreen.tsx'), 'utf8');
    expect(src).not.toContain('requireUserPresence');
  });
});
