# ทดสอบ API login ด้วย curl.exe (A2 POST /auth/login, M1 GET /me, A3 POST /auth/logout)
#
# วิธีรัน (เปิด server ไว้ก่อนในอีกหน้าต่าง: npm start)
#   cd backend\tests\curl
#   powershell -ExecutionPolicy Bypass -File .\login-test.ps1
#   powershell -ExecutionPolicy Bypass -File .\login-test.ps1 -BaseUrl http://localhost:3999/api/v1
#
# หมายเหตุ: login ผิดจะถูกบันทึก audit LOGIN_FAILED ในฐานที่ server ใช้อยู่
#           ถ้าไม่อยากให้ลงฐานจริง เปิด server ด้วย  $env:DB_NAME = "notebook_loan_test"; npm start

param(
  [string]$BaseUrl = 'http://localhost:3000/api/v1',
  [string]$MemberEmail = 'member@example.com',
  [string]$MemberPassword = 'Member@1234',
  [string]$AdminEmail = 'admin@example.com',
  [string]$AdminPassword = 'Admin@1234'
)

[Console]::OutputEncoding = [Text.Encoding]::UTF8
$tmp = Join-Path $env:TEMP 'nbloan-curl'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$utf8NoBom = New-Object Text.UTF8Encoding $false
$script:pass = 0
$script:fail = 0

# เรียก API แล้วคืน { Status, Text, Json } · Body เป็นข้อความ JSON (เขียนลงไฟล์ก่อนส่ง กันปัญหา quote ใน PowerShell)
function Invoke-Api {
  param([string]$Method, [string]$Path, [string]$Body, [string]$Token)
  $bodyFile = Join-Path $tmp 'response.txt'
  Remove-Item $bodyFile -ErrorAction SilentlyContinue
  $curlArgs = @('-s', '-o', $bodyFile, '-w', '%{http_code}', '-X', $Method, "$BaseUrl$Path")
  if ($Token) { $curlArgs += @('-H', "Authorization: Bearer $Token") }
  if ($Body) {
    $reqFile = Join-Path $tmp 'request.json'
    [IO.File]::WriteAllText($reqFile, $Body, $utf8NoBom)
    $curlArgs += @('-H', 'Content-Type: application/json', '-d', "@$reqFile")
  }
  $status = & curl.exe @curlArgs
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $bodyFile)) {
    Write-Host "เชื่อมต่อ $BaseUrl ไม่ได้ (curl exit $LASTEXITCODE) กรุณาเปิด server ก่อน: npm start" -ForegroundColor Red
    exit 2
  }
  $text = [IO.File]::ReadAllText($bodyFile, [Text.Encoding]::UTF8)
  $json = $null
  try { $json = $text | ConvertFrom-Json } catch { }
  [pscustomobject]@{ Status = [int]$status; Text = $text; Json = $json }
}

# ตรวจผล: status ตรง และ (ถ้าระบุ) error.code ตรง และ (ถ้าระบุ) เงื่อนไขเพิ่มเติมเป็นจริง
function Test-Case {
  param([string]$Name, $Res, [int]$Status, [string]$Code, [scriptblock]$Extra)
  $ok = $Res.Status -eq $Status
  if ($Code) { $ok = $ok -and $Res.Json.error.code -eq $Code }
  if ($ok -and $Extra) { $ok = [bool](& $Extra $Res) }
  if ($ok) {
    $script:pass++
    Write-Host "PASS  $Name" -ForegroundColor Green
  } else {
    $script:fail++
    Write-Host "FAIL  $Name  (ได้ status $($Res.Status))" -ForegroundColor Red
    Write-Host "      $($Res.Text)" -ForegroundColor DarkGray
  }
}

function LoginBody([string]$Email, [string]$Password) {
  @{ email = $Email; password = $Password } | ConvertTo-Json -Compress
}

Write-Host "ทดสอบ login ที่ $BaseUrl`n"

# 1) สมาชิก login ถูกต้อง
$member = Invoke-Api POST '/auth/login' (LoginBody $MemberEmail $MemberPassword)
Test-Case '1. สมาชิก login ถูกต้อง ได้ token + permissions' $member 200 -Extra {
  param($r) $r.Json.success -and $r.Json.data.token -and $r.Json.data.user.email -eq $MemberEmail -and
            ($r.Json.data.permissions -contains 'loan.create') -and -not ($r.Text -match 'password')
}
$token = $member.Json.data.token

# 2) แอดมิน login ถูกต้อง
$admin = Invoke-Api POST '/auth/login' (LoginBody $AdminEmail $AdminPassword)
Test-Case '2. แอดมิน login ถูกต้อง roleCode = admin' $admin 200 -Extra {
  param($r) $r.Json.data.user.roleCode -eq 'admin' -and ($r.Json.data.permissions -contains 'setting.manage')
}

# 3-4) รหัสผิด กับ อีเมลไม่มีในระบบ ต้องได้ error และข้อความเดียวกัน
$wrongPass = Invoke-Api POST '/auth/login' (LoginBody $MemberEmail 'Wrong12345')
Test-Case '3. รหัสผ่านผิด = 401 INVALID_CREDENTIALS' $wrongPass 401 'INVALID_CREDENTIALS'
$wrongEmail = Invoke-Api POST '/auth/login' (LoginBody 'nobody-xyz@example.com' $MemberPassword)
Test-Case '4. อีเมลไม่มีในระบบ = 401 ข้อความเดียวกับรหัสผิด' $wrongEmail 401 'INVALID_CREDENTIALS' -Extra {
  param($r) $r.Json.error.message -eq $wrongPass.Json.error.message
}

# 5) อีเมลตัวพิมพ์ใหญ่ยัง login ได้
$upper = Invoke-Api POST '/auth/login' (LoginBody $MemberEmail.ToUpper() $MemberPassword)
Test-Case '5. อีเมลตัวพิมพ์ใหญ่ login ได้' $upper 200

# 6-7) input ผิดรูปแบบ
$missing = Invoke-Api POST '/auth/login' (@{ email = $MemberEmail } | ConvertTo-Json -Compress)
Test-Case '6. ไม่ส่งรหัสผ่าน = 400 VALIDATION_ERROR (details มี password)' $missing 400 'VALIDATION_ERROR' -Extra {
  param($r) ($r.Json.error.details | Where-Object { $_.field -eq 'password' }) -ne $null
}
$badJson = Invoke-Api POST '/auth/login' '{bad json'
Test-Case '7. JSON ผิดรูปแบบ = 400 VALIDATION_ERROR' $badJson 400 'VALIDATION_ERROR'

# 8-10) ใช้ token เรียก /me
$me = Invoke-Api GET '/me' -Token $token
Test-Case '8. GET /me ด้วย token = ข้อมูลของตัวเอง' $me 200 -Extra {
  param($r) $r.Json.data.email -eq $MemberEmail -and $r.Json.data.createdAt -match '\+07:00$'
}
$noToken = Invoke-Api GET '/me'
Test-Case '9. GET /me ไม่มี token = 401 UNAUTHORIZED' $noToken 401 'UNAUTHORIZED'
$badToken = Invoke-Api GET '/me' -Token 'abc.def.ghi'
Test-Case '10. GET /me token ปลอม = 401 UNAUTHORIZED' $badToken 401 'UNAUTHORIZED'

# 11) logout
$logout = Invoke-Api POST '/auth/logout' -Token $token
Test-Case '11. POST /auth/logout = 200 data null' $logout 200 -Extra { param($r) $r.Json.success -and $null -eq $r.Json.data }

Write-Host "`nผลรวม: ผ่าน $script:pass / ไม่ผ่าน $script:fail"
if ($token) { Write-Host "token ของสมาชิก (ใช้ทดสอบ endpoint อื่นต่อได้):`n$token" -ForegroundColor DarkGray }
if ($script:fail -gt 0) { exit 1 } else { exit 0 }
