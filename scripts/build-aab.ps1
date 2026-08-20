# scripts/build-aab.ps1
#
# DỰNG AAB PHÁT HÀNH — bản đầy đủ, chạy trên Windows.
#
# ══ VÌ SAO CÓ TỆP NÀY, thay vì gõ thẳng `.\gradlew bundleRelease` ═══════════
# Gõ thẳng `bundleRelease` cho ra một tệp .aab **ký đúng, cài được, và THIẾU hai
# thư viện native**. Nó không báo lỗi ở bất kỳ đâu.
#
# Hai module Kotlin nạp thư viện lúc lớp khởi tạo:
#     TaadEnclaveModule.kt:392   System.loadLibrary("taad_enclave_core")
#     ChatMlsModule.kt:168       System.loadLibrary("chat_mls")
#
# Cả hai .so đều KHÔNG có trong git, và `android/app/build.gradle` KHÔNG có
# cargo/rust/externalNativeBuild nào — gradle không biết chúng tồn tại. Chúng do
# một bước RIÊNG dựng, trước gradle (`.github/actions/rust-android/action.yml`,
# `codemagic.yaml:1054`). Bỏ bước ấy thì:
#
#   · gradle vẫn dựng xanh;
#   · AAB vẫn ký được, Play vẫn nhận;
#   · app vẫn mở được — hai module có try/catch, đặt `libLoaded=false`;
#   · và TOÀN BỘ tầng danh tính PhoenixKey (ví · DID · Master_KEK · cụm 24 từ ·
#     uỷ thác) cùng chat mã hoá đầu-cuối im lặng không dùng được.
#
# Đó là lỗi câm: xanh ở máy dựng, hỏng ở tay người dùng. Script này đóng đúng lỗ
# đó — và kiểm lại BÊN TRONG tệp .aab đã ra, chứ không tin vào việc "đã chạy bước
# dựng rồi".
#
# ══ CÁCH DÙNG ══════════════════════════════════════════════════════════════
#     powershell -ExecutionPolicy Bypass -File scripts\build-aab.ps1
#
#     -SkipTests     bỏ cổng tsc + jest (chỉ dùng khi vừa chạy xong)
#     -SkipRust      bỏ bước dựng Rust (chỉ khi jniLibs đã có sẵn và còn mới)
#     -Clean         chạy `gradlew clean` trước
#
# Script DỪNG ở lỗi đầu tiên. Không có bước nào "cảnh báo rồi đi tiếp".

[CmdletBinding()]
param(
    [switch]$SkipTests,
    [switch]$SkipRust,
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

# Ba ABI. KHỚP `abiFilters` trong android/app/build.gradle — x86 (32-bit) đã bỏ
# từ 2026-08-15. Thêm một ABI ở đây mà không thêm ở kia (hoặc ngược lại) là đẻ ra
# đúng lát thiếu .so đã làm hỏng bản 87.
$ABIS = @('arm64-v8a', 'armeabi-v7a', 'x86_64')
$CRATES = @('taad_enclave_core', 'chat_mls')
$JNI = 'android/app/src/main/jniLibs'

function Step($n, $t) { Write-Host "`n=== [$n] $t ===" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  ok  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  !   $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "`nDỪNG: $m" -ForegroundColor Red; exit 1 }

# ───────────────────────────────────────────────────────────────────────────
Step 1 'Soát công cụ và tệp bí mật'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Die 'Không có node.' }
Ok "node $(node -v)"

# `2>&1` trên một .exe KHÔNG được dùng ở đây: Windows PowerShell 5.1 bọc từng
# dòng stderr thành ErrorRecord, mà `$ErrorActionPreference='Stop'` ở đầu tệp
# biến ErrorRecord đó thành ngoại lệ — và `java -version` in ra stderr theo
# thiết kế. Đẩy phần gộp luồng sang cmd thì PowerShell chỉ nhận chuỗi.
$javaLine = (cmd /c 'java -version 2>&1' | Select-Object -First 1)
if ($javaLine -notmatch '"(\d+)') { Die "Không đọc được bản Java: $javaLine" }
$javaMajor = [int]$Matches[1]
if ($javaMajor -lt 17) { Die "Java $javaMajor quá cũ — AGP đòi 17 trở lên." }
if ($javaMajor -ne 17) {
    # CI (GitHub + Codemagic) dựng bằng JDK 17. Bản khác VẪN chạy được, nhưng bản
    # ra Play Store nên khớp bản đã đo. Cảnh báo, không chặn.
    Warn "Java $javaMajor — CI dựng bằng JDK 17. Nếu gặp lỗi Kotlin/AGP lạ, thử 17 trước khi đi tìm chỗ khác."
} else { Ok 'Java 17' }

$sdk = $env:ANDROID_HOME; if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk -or -not (Test-Path $sdk)) { Die 'ANDROID_HOME / ANDROID_SDK_ROOT chưa trỏ tới Android SDK.' }
Ok "SDK $sdk"

# NDK: lấy ĐÚNG bản `rootProject.ext.ndkVersion` khai trong android/build.gradle.
# Lấy "bản mới nhất đang cài" như CI làm là đúng ở máy CI (chỉ cài một bản), nhưng
# sai ở máy này — nó có 5 bản NDK, và dựng Rust bằng bản khác bản gradle dùng là
# trộn hai ABI runtime trong cùng một tệp .aab.
$ndkVersion = (Select-String -Path 'android/build.gradle' -Pattern 'ndkVersion\s*=\s*"([^"]+)"').Matches[0].Groups[1].Value
$ndkHome = Join-Path $sdk "ndk/$ndkVersion"
if (-not (Test-Path $ndkHome)) { Die "Thiếu NDK $ndkVersion tại $ndkHome (android/build.gradle khai bản này)." }
$env:ANDROID_NDK_HOME = $ndkHome
Ok "NDK $ndkVersion"

if (-not (Test-Path '.env')) {
    # `.env` nạp lúc BABEL chạy (react-native-dotenv, babel.config.js). Thiếu nó
    # thì mọi import từ '@env' là undefined — bundle vẫn dựng xong, app vẫn mở, và
    # mọi lệnh gọi máy chủ trỏ vào `undefined`. Lại một lỗi câm.
    Die 'Thiếu .env ở gốc kho. Chép từ .env.example rồi điền giá trị thật.'
}
Ok ".env ($((Get-Item '.env').Length) byte)"

if (-not (Test-Path 'android/app/keySigning.bin')) { Die 'Thiếu android/app/keySigning.bin (kho khoá ký tải lên).' }
if (-not (Test-Path 'android/gradle.properties')) { Die 'Thiếu android/gradle.properties (chứa 4 khoá ORILIFE_UPLOAD_*).' }
$gp = Get-Content 'android/gradle.properties' -Raw
foreach ($k in @('ORILIFE_UPLOAD_STORE_FILE','ORILIFE_UPLOAD_STORE_PASSWORD','ORILIFE_UPLOAD_KEY_ALIAS','ORILIFE_UPLOAD_KEY_PASSWORD')) {
    # Thiếu MỘT khoá thì `signingConfigs.release` rỗng hoàn toàn — build.gradle bọc
    # cả khối trong `if (project.hasProperty('ORILIFE_UPLOAD_STORE_FILE'))`. Gradle
    # KHÔNG báo lỗi; nó ký bằng khoá debug, và Play từ chối tệp ở bước tải lên.
    if ($gp -notmatch "(?m)^\s*$k\s*=") { Die "android/gradle.properties thiếu $k." }
}
Ok 'Bốn khoá ký có mặt'

$versionCode = (Select-String -Path 'android/app/build.gradle' -Pattern 'versionCode\s+(\d+)').Matches[0].Groups[1].Value
Warn "versionCode hiện là $versionCode — Play TỪ CHỐI tệp trùng versionCode đã tải lên. Tăng nó trước khi phát hành."

# ───────────────────────────────────────────────────────────────────────────
Step 2 'Phụ thuộc npm + bản vá'

# `npm install` (không phải `ci`) vì kho dùng --legacy-peer-deps, khớp CI.
# `postinstall: patch-package` chạy theo — patches/expo-modules-core+56.0.22.patch
# là thứ giữ cho build C++ không gãy ở worklets.
npm install --legacy-peer-deps
if ($LASTEXITCODE -ne 0) { Die 'npm install hỏng.' }
Ok 'node_modules + patch-package'

# ───────────────────────────────────────────────────────────────────────────
if (-not $SkipTests) {
    Step 3 'Cổng chất lượng (tsc + jest)'
    # Cùng hai cổng mà `.github/workflows/android-aab.yml` job `verify` chạy trước
    # khi cho dựng. `--forceExit` bắt buộc: vòng Animated trong test render chạy
    # mãi theo thiết kế, thiếu cờ này thì jest in kết quả xong không thoát.
    npx tsc --noEmit -p tsconfig.json
    if ($LASTEXITCODE -ne 0) { Die 'tsc có lỗi.' }
    Ok 'tsc sạch'
    # `--maxWorkers=50%`: máy dựng có 16 nhân nên jest mở ~15 tiến trình con, mỗi
    # cái nạp trọn đồ thị module RN. Đo trên chính máy này lúc dựng: còn 0,8 GB RAM
    # trống ⇒ chúng hoán trang và các bộ test dựng nguyên màn bị bỏ đói tới mức quá
    # hạn. Nửa số nhân chạy CHẬM HƠN vài giây nhưng KHÔNG đỏ giả — mà một cổng đỏ
    # giả thì tệ hơn một cổng chậm: nó dạy người ta chạy lại cho tới khi xanh.
    # CI (ubuntu runner, máy trống) vẫn dùng mặc định, không đụng tới.
    npx jest --ci --forceExit --silent --maxWorkers=50%
    if ($LASTEXITCODE -ne 0) { Die 'jest có test đỏ.' }
    Ok 'jest xanh'
} else { Step 3 'Cổng chất lượng — BỎ QUA (-SkipTests)' }

# ───────────────────────────────────────────────────────────────────────────
Step 4 'Lõi Rust → jniLibs (PHẢI trước gradle)'

if ($SkipRust) {
    Warn 'Bỏ qua bước dựng (-SkipRust) — vẫn kiểm .so ở bước sau.'
} else {
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        Die @'
Không có cargo. Đây CHÍNH LÀ lý do bản `.\gradlew bundleRelease` gõ tay thiếu
ví/DID/chat — không có Rust thì không có hai tệp .so, mà gradle không hề kêu.

Cài một lần:
    winget install Rustlang.Rustup
    rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
    cargo install cargo-ndk --locked
'@
    }
    Ok (cargo --version)

    rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
    if ($LASTEXITCODE -ne 0) { Die 'rustup target add hỏng.' }

    if (-not (Get-Command cargo-ndk -ErrorAction SilentlyContinue)) {
        Write-Host '  cài cargo-ndk…'
        cargo install cargo-ndk --locked
        if ($LASTEXITCODE -ne 0) { Die 'cargo install cargo-ndk hỏng.' }
    }
    Ok 'cargo-ndk'

    foreach ($crate in $CRATES) {
        Write-Host "  dựng $crate (3 ABI, release)…"
        Push-Location "rust/$crate"
        try {
            cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 -o ../../android/app/src/main/jniLibs build --release --lib
            if ($LASTEXITCODE -ne 0) { Die "cargo ndk hỏng ở $crate." }
        } finally { Pop-Location }
    }
}

# Kiểm SAU khi dựng, không kiểm trước — và kiểm CẢ BA ABI. Cổng cũ ở codemagic chỉ
# canh arm64, nên một bản thiếu .so cho máy 32-bit vẫn xanh và vẫn lên Play.
$missing = @()
foreach ($abi in $ABIS) {
    foreach ($crate in $CRATES) {
        $f = "$JNI/$abi/lib$crate.so"
        if (Test-Path $f) { Ok "$f ($((Get-Item $f).Length) byte)" } else { $missing += $f }
    }
}
if ($missing.Count -gt 0) { Die "Thiếu .so:`n  " + ($missing -join "`n  ") }

# ───────────────────────────────────────────────────────────────────────────
Step 5 'Gradle bundleRelease'

Push-Location android
try {
    if ($Clean) { ./gradlew clean --no-daemon; if ($LASTEXITCODE -ne 0) { Die 'clean hỏng.' } }
    # Bốn khoá ký đọc từ android/gradle.properties (đã soát ở bước 1), nên không
    # cần truyền -P như CI. `--no-daemon`: daemon giữ lại classpath của lượt trước
    # và đã từng nuốt thay đổi ở jniLibs.
    ./gradlew bundleRelease --no-daemon --stacktrace
    if ($LASTEXITCODE -ne 0) { Die 'bundleRelease hỏng — đọc stacktrace phía trên.' }
} finally { Pop-Location }

# ───────────────────────────────────────────────────────────────────────────
Step 6 'Kiểm BÊN TRONG tệp .aab'

$aab = Get-ChildItem 'android/app/build/outputs/bundle/release' -Filter '*.aab' -ErrorAction SilentlyContinue |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $aab) { Die 'Không thấy tệp .aab nào ở android/app/build/outputs/bundle/release.' }

# Đọc DANH SÁCH MỤC trong tệp, không giải nén. Đây là bước quan trọng nhất của cả
# script: nó kiểm THÀNH PHẨM, chứ không kiểm rằng "các bước đã chạy". Bước dựng
# chạy xong mà gradle vẫn bỏ sót thư viện thì chỉ chỗ này bắt được.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($aab.FullName)
try { $entries = $zip.Entries | ForEach-Object { $_.FullName } } finally { $zip.Dispose() }

$bad = @()

# a) JS bundle. Thiếu nó = app mở ra màn trắng.
if ($entries -contains 'base/assets/index.android.bundle') {
    Ok 'base/assets/index.android.bundle'
} else { $bad += 'THIẾU base/assets/index.android.bundle (bundle JS)' }

# b) Hai .so Rust, ĐỦ BA ABI.
foreach ($abi in $ABIS) {
    foreach ($crate in $CRATES) {
        $e = "base/lib/$abi/lib$crate.so"
        if ($entries -contains $e) { Ok $e } else { $bad += "THIẾU $e" }
    }
}

# c) KHÔNG được có lát ABI nào ngoài ba cái trên. Một lát x86 lọt vào là một lát
#    thiếu .so Rust (Rust cố ý không dựng cho x86) — Play sẽ giao đúng lát đó cho
#    thiết bị x86 và người dùng mất ví trong im lặng.
$abisInAab = $entries | Where-Object { $_ -match '^base/lib/([^/]+)/' } |
             ForEach-Object { ($_ -split '/')[2] } | Sort-Object -Unique
foreach ($abi in $abisInAab) {
    if ($ABIS -notcontains $abi) { $bad += "LÁT LẠ base/lib/$abi/ — không nằm trong abiFilters, sẽ thiếu .so Rust" }
}
Ok "ABI trong tệp: $($abisInAab -join ', ')"

if ($bad.Count -gt 0) { Die "Tệp .aab KHÔNG đầy đủ:`n  " + ($bad -join "`n  ") }

$sha = (Get-FileHash $aab.FullName -Algorithm SHA256).Hash
Write-Host "`n══════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host " AAB ĐẦY ĐỦ" -ForegroundColor Green
Write-Host "   tệp        : $($aab.FullName)"
Write-Host "   kích thước : $([math]::Round($aab.Length/1MB, 2)) MB"
Write-Host "   versionCode: $versionCode"
Write-Host "   SHA256     : $sha"
Write-Host "══════════════════════════════════════════════════════════" -ForegroundColor Green
