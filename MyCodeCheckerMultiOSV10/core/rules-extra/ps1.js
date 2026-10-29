'use strict';

// PowerShell. Keys use the existing 'ps:' family from core/rules.js.

const { maker } = require('./util');

const R = maker('ps', ['ps1']);

R('write-host', 'S', 'MI', 2, ['convention'],
  /\bWrite-Host\b/i,
  ['Write-Host', 'Write-Host writes to the host (the information stream since PowerShell 5), not to the output pipeline, so callers cannot pipe or assign the text.', 'Use Write-Output, Write-Verbose or Write-Information.'],
  ['Write-Host를 씁니다', 'Write-Host는 출력 파이프라인이 아니라 호스트(PowerShell 5부터는 정보 스트림)에 써서 호출자가 글을 파이프하거나 변수에 받을 수 없습니다.', 'Write-Output, Write-Verbose, Write-Information을 쓰세요.'],
  'Write-Host "Done"', 'Write-Information "Done"');
R('cmdlet-alias', 'S', 'MI', 2, ['convention'],
  // foreach ($x in $list) at the start of a line is the language statement, not the alias.
  // ? Type.Method(...) on a continuation line is the PowerShell 7 ternary.
  /(?:^|\|)\s*(?:%|\?(?!\s+[\w.[\]]+\s*\()|gci|gc|sls|iwr|irm|sal|ni|ri|gcm|gm|ii|sc|select|where|foreach(?!\s*\())(?=\s|\{)/i,
  ['Cmdlet alias in a script', 'Aliases differ between hosts and editions and are hard to read.', 'Use the full cmdlet name, for example ForEach-Object or Where-Object.'],
  ['스크립트에서 cmdlet 별칭을 씁니다', '별칭은 호스트와 버전마다 다르고 읽기 어렵습니다.', 'ForEach-Object, Where-Object처럼 전체 이름을 쓰세요.'],
  'Get-ChildItem | ? { $_.Length -gt 0 }', 'Get-ChildItem | Where-Object { $_.Length -gt 0 }');
R('skip-certificate-check', 'V', 'CR', 15, ['cwe-295', 'owasp-a07', 'tls'],
  /-SkipCertificateCheck\b|ServerCertificateValidationCallback\s*=\s*\{\s*\$true\s*\}/i,
  ['TLS certificate check disabled', 'Any certificate is accepted, allowing man-in-the-middle.', 'Remove the switch and trust the right CA.'],
  ['TLS 인증서 검사를 끕니다', '아무 인증서나 받아들여 중간자 공격을 허용합니다.', '스위치를 지우고 올바른 CA를 신뢰하세요.'],
  'Invoke-RestMethod $url -SkipCertificateCheck', 'Invoke-RestMethod $url');
R('plain-text-password-param', 'V', 'MA', 10, ['cwe-256', 'secrets'],
  /\[string\]\s*\$(?:password|passwd|pwd|pass|secret|apikey|token)\b/i,
  ['Password parameter typed as string', 'A string password stays in memory and logs in plain text.', 'Use [SecureString] or [PSCredential].'],
  ['문자열로 선언한 비밀번호 매개변수입니다', '문자열 비밀번호는 메모리와 로그에 평문으로 남습니다.', '[SecureString]이나 [PSCredential]을 쓰세요.'],
  'param([string]$Password)', 'param([securestring]$Password)');
R('global-variable', 'S', 'MA', 5, ['design'],
  /\$global:\w+\s*=(?!=)/i,
  ['Global variable assigned', 'Globals leak between scripts in the same session.', 'Use script scope or pass values as parameters.'],
  ['전역 변수에 대입합니다', '전역은 같은 세션의 스크립트 사이로 샙니다.', 'script 스코프나 매개변수를 쓰세요.'],
  '$global:Config = Get-Config', '$script:Config = Get-Config');
R('http-request', 'V', 'MA', 10, ['cwe-319', 'owasp-a02'],
  /\b(?:Invoke-WebRequest|Invoke-RestMethod|iwr|irm|Start-BitsTransfer)\b[^|;]*['"]?http:\/\/(?!localhost|127\.0\.0\.1)/i,
  ['Web request over plain HTTP', 'Data and downloads over HTTP can be read or replaced on the network.', 'Use https.'],
  ['평문 HTTP 웹 요청입니다', 'HTTP의 데이터와 내려받기는 네트워크에서 읽히거나 바뀔 수 있습니다.', 'https를 쓰세요.'],
  'Invoke-WebRequest http://example.com/setup.exe -OutFile setup.exe', 'Invoke-WebRequest https://example.com/setup.exe -OutFile setup.exe');
R('download-and-run', 'V', 'BL', 30, ['cwe-494', 'owasp-a08'],
  /\b(?:DownloadString|Invoke-WebRequest|Invoke-RestMethod|iwr|irm)\b[^|]*\|\s*(?:iex|Invoke-Expression)\b|\b(?:iex|Invoke-Expression)\s*\(?\s*\(?\s*(?:New-Object\s+(?:System\.)?Net\.WebClient|\[System\.Net\.WebClient\])/i,
  ['Downloaded script executed directly', 'Running code straight from the network gives the server full control of the machine.', 'Download, verify the signature or hash, then run.'],
  ['내려받은 스크립트를 바로 실행합니다', '네트워크에서 바로 코드를 실행하면 서버가 기계를 완전히 통제합니다.', '내려받아 서명이나 해시를 확인한 뒤 실행하세요.'],
  'iwr https://get.example.com/install.ps1 | iex', 'Invoke-WebRequest https://get.example.com/install.ps1 -OutFile install.ps1');
R('run-as-admin', 'H', 'MA', 10, ['cwe-250'],
  /\bStart-Process\b[^|;]*-Verb\s+['"]?RunAs\b/i,
  ['Process started elevated', 'Elevating gives the started program full administrator rights.', 'Elevate only the step that needs it, and validate its arguments.'],
  ['권한 상승으로 프로세스를 시작합니다', '권한 상승은 시작한 프로그램에 관리자 권한을 모두 줍니다.', '필요한 단계만 올리고 인자를 검증하세요.'],
  'Start-Process powershell -Verb RunAs -ArgumentList $args', 'Start-Process powershell -ArgumentList $args');
R('defender-tampering', 'H', 'CR', 15, ['cwe-693'],
  /\bSet-MpPreference\b[^|;]*-Disable\w+\s+\$?(?:true|1)\b|\bAdd-MpPreference\b[^|;]*-Exclusion(?:Path|Process|Extension)\b/i,
  ['Antivirus settings changed', 'Turning off Defender or adding exclusions removes protection for the machine.', 'Remove the change, or document and scope the exclusion narrowly.'],
  ['백신 설정을 바꿉니다', 'Defender를 끄거나 예외를 더하면 기계의 보호가 사라집니다.', '변경을 지우거나 예외를 좁게 문서화하세요.'],
  'Set-MpPreference -DisableRealtimeMonitoring $true', 'Get-MpPreference');
R('encoded-command', 'H', 'MA', 10, ['cwe-506'],
  /\s-(?:EncodedCommand|enc|ec|e)\s+[A-Za-z0-9+\/=]{20,}/i,
  ['Base64 encoded command', 'Encoded commands hide what runs and are a common malware pattern.', 'Ship the script as readable text.'],
  ['Base64로 인코딩한 명령입니다', '인코딩한 명령은 무엇이 실행되는지 숨기며 흔한 악성 코드 패턴입니다.', '스크립트를 읽을 수 있는 텍스트로 배포하세요.'],
  'powershell -enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQA', 'powershell -File .\\setup.ps1');
R('execution-policy-unrestricted', 'H', 'MA', 10, ['cwe-693', 'policy'],
  /\bSet-ExecutionPolicy\b[^|;]*\bUnrestricted\b/i,
  ['Execution policy set to Unrestricted', 'Unrestricted lets any unsigned script run.', 'Use RemoteSigned or AllSigned.'],
  ['실행 정책을 Unrestricted로 둡니다', 'Unrestricted는 서명 없는 스크립트를 모두 실행하게 합니다.', 'RemoteSigned나 AllSigned를 쓰세요.'],
  'Set-ExecutionPolicy Unrestricted -Scope CurrentUser', 'Set-ExecutionPolicy RemoteSigned -Scope CurrentUser');
R('wmi-cmdlet', 'S', 'MI', 5, ['deprecated'],
  /\bGet-WmiObject\b|\bgwmi\b|\b(?:Invoke|Set|Remove|Register)-Wmi\w*\b/i,
  ['WMI cmdlets', 'The *-WmiObject cmdlets are not available in PowerShell 7.', 'Use Get-CimInstance and the CIM cmdlets.'],
  ['WMI cmdlet을 씁니다', '*-WmiObject cmdlet은 PowerShell 7에 없습니다.', 'Get-CimInstance 등 CIM cmdlet을 쓰세요.'],
  'Get-WmiObject Win32_OperatingSystem', 'Get-CimInstance Win32_OperatingSystem');
R('null-on-right', 'B', 'MA', 5, ['pitfall'],
  /\s-(?:eq|ne|ceq|cne|ieq|ine)\s+\$null\b/i,
  ['$null on the right of a comparison', 'With an array on the left, -eq $null filters the array instead of testing it.', 'Put $null on the left: $null -eq $value.'],
  ['비교의 오른쪽에 $null이 있습니다', '왼쪽이 배열이면 -eq $null은 검사하지 않고 배열을 거릅니다.', '$null을 왼쪽에 두세요: $null -eq $value.'],
  'if ($items -eq $null) {', 'if ($null -eq $items) {');
R('assignment-in-if', 'B', 'MA', 5, ['pitfall'],
  /\b(?:if|elseif|while)\s*\(\s*\$\w+\s*=(?!=)\s*[^=]/i,
  ['Assignment inside a condition', '= assigns; PowerShell compares with -eq.', 'Use -eq, or move the assignment out.'],
  ['조건 안에서 대입합니다', '=는 대입이며 PowerShell은 -eq로 비교합니다.', '-eq를 쓰거나 대입을 밖으로 빼세요.'],
  'if ($status = "Ready") {', 'if ($status -eq "Ready") {');
R('redirect-as-compare', 'B', 'MA', 5, ['pitfall'],
  /\b(?:if|elseif|while)\s*\([^)]*\$\w+\s*>=?\s*[\d$"']/i,
  ['> used as a comparison', '> is file redirection in PowerShell, so this writes a file and the test is wrong.', 'Use -gt / -ge.'],
  ['>를 비교로 씁니다', 'PowerShell에서 >는 파일 리다이렉트라 파일을 쓰고 검사가 틀립니다.', '-gt / -ge를 쓰세요.'],
  'if ($count > 10) {', 'if ($count -gt 10) {');
R('old-tls', 'V', 'CR', 15, ['cwe-326', 'owasp-a02', 'tls'],
  /SecurityProtocolType\]::(?:Ssl3|Tls|Tls11)\b/i,
  ['Outdated SSL / TLS protocol', 'SSL 3 and TLS 1.0 / 1.1 have known attacks.', 'Use [Net.SecurityProtocolType]::Tls12 or Tls13.'],
  ['낡은 SSL / TLS 프로토콜입니다', 'SSL 3과 TLS 1.0 / 1.1에는 알려진 공격이 있습니다.', '[Net.SecurityProtocolType]::Tls12나 Tls13을 쓰세요.'],
  '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls', '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12');
R('certutil-download', 'H', 'MA', 10, ['cwe-494'],
  /\bcertutil(?:\.exe)?\b[^|;]*-urlcache\b/i,
  ['certutil used to download', 'certutil -urlcache is a known living-off-the-land download trick.', 'Use Invoke-WebRequest over https and verify the file.'],
  ['certutil로 내려받습니다', 'certutil -urlcache는 알려진 우회 다운로드 기법입니다.', 'https의 Invoke-WebRequest를 쓰고 파일을 확인하세요.'],
  'certutil -urlcache -split -f https://x.example/a.exe a.exe', 'Invoke-WebRequest https://x.example/a.exe -OutFile a.exe');
R('hidden-window', 'H', 'MI', 5, ['cwe-506'],
  /-WindowStyle\s+['"]?Hidden\b|-w\s+hidden\b/i,
  ['Process started with a hidden window', 'Hidden windows hide what runs from the user.', 'Show the window, or log what the process does.'],
  ['숨긴 창으로 프로세스를 시작합니다', '숨긴 창은 실행 내용을 사용자에게서 숨깁니다.', '창을 보이거나 프로세스가 하는 일을 기록하세요.'],
  'Start-Process powershell -WindowStyle Hidden -ArgumentList "-File x.ps1"', 'Start-Process powershell -ArgumentList "-File x.ps1"');
R('run-key-persistence', 'H', 'MA', 10, ['cwe-506'],
  /\\CurrentVersion\\Run(?:Once)?\b/i,
  ['Writes to a Run registry key', 'Run keys start programs at every logon and are a persistence spot.', 'Use a scheduled task or an installer, and document why.'],
  ['Run 레지스트리 키에 씁니다', 'Run 키는 로그온마다 프로그램을 시작하는 지속성 위치입니다.', '예약 작업이나 설치 프로그램을 쓰고 이유를 문서화하세요.'],
  'Set-ItemProperty HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run -Name App -Value $exe', 'Register-ScheduledTask -TaskName App -Action $action');
R('recursive-remove-variable', 'H', 'MA', 10, ['cwe-73'],
  /\bRemove-Item\b(?=[^|;]*-Recurse)(?=[^|;]*\$\w+)(?![^|;]*-WhatIf)/i,
  ['Recursive delete of a variable path', 'If the variable is empty or wrong, the command can remove far more than intended.', 'Validate the path (Test-Path, a base-folder check) before deleting.'],
  ['변수 경로를 재귀 삭제합니다', '변수가 비었거나 틀리면 의도보다 훨씬 많이 지울 수 있습니다.', '지우기 전에 경로를 검증하세요(Test-Path, 기준 폴더 확인).'],
  'Remove-Item $target -Recurse -Force', ['Remove-Item $target -Recurse -WhatIf', 'if (Test-Path $wixLocal) { Remove-Item $wixLocal -Recurse -Force }'],
  // Checked with Test-Path on the same line (the fix).
  { skip: (raw) => /\bTest-Path\b/i.test(raw) });
R('empty-catch', 'S', 'MA', 5, ['error-handling'],
  /\bcatch\s*(?:\[[^\]]*\]\s*)?\{\s*\}/i,
  ['Empty catch block', 'Errors are silently dropped.', 'Log the error with Write-Error, or rethrow.'],
  ['빈 catch 블록입니다', '오류가 조용히 버려집니다.', 'Write-Error로 기록하거나 다시 던지세요.'],
  'try { Remove-Item $p } catch { }', 'try { Remove-Item $p } catch { Write-Error $_ }');

module.exports = { RULES: R.rules };
