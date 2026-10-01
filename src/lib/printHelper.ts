const psScript = (endpoint: string, key: string) => `
$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$Host.UI.RawUI.WindowTitle = 'ASAP - pomoshnik pechati'
$api = '${endpoint}'
$key = '${key}'
$headers = @{ 'X-Print-Key' = $key }

function Send-Report($id, $ok, $err) {
  $body = @{ action = 'report'; id = $id; ok = $ok; error = $err } | ConvertTo-Json -Compress
  try {
    Invoke-RestMethod -Uri $api -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 15 | Out-Null
  } catch {}
}

function Send-ToPrinter($ip, $port, $bytes) {
  $client = New-Object System.Net.Sockets.TcpClient
  $wait = $client.BeginConnect($ip, [int]$port, $null, $null)
  if (-not $wait.AsyncWaitHandle.WaitOne(5000)) { $client.Close(); throw "net otveta ot $($ip):$($port)" }
  $client.EndConnect($wait)
  $stream = $client.GetStream()
  $stream.Write($bytes, 0, $bytes.Length)
  $stream.Flush()
  Start-Sleep -Milliseconds 300
  $client.Close()
}

Write-Host ''
Write-Host '  ASAP: pomoshnik setevoy pechati zapushen' -ForegroundColor Green
Write-Host '  Ne zakryvayte eto okno - cherez nego idet pechat na printery po IP.'
Write-Host ''

$idle = 0
$offline = $false
while ($true) {
  try {
    $res = Invoke-RestMethod -Uri ($api + '?action=poll') -Headers $headers -TimeoutSec 20
    if ($offline) { Write-Host "  $(Get-Date -Format HH:mm:ss)  svyaz s saytom vosstanovlena" -ForegroundColor Green; $offline = $false }
    $jobs = @($res.jobs)
    foreach ($job in $jobs) {
      if (-not $job) { continue }
      try {
        Send-ToPrinter $job.ip $job.port ([Convert]::FromBase64String($job.data))
        Send-Report $job.id $true ''
        Write-Host "  $(Get-Date -Format HH:mm:ss)  napechatano -> $($job.ip)" -ForegroundColor Cyan
      } catch {
        Send-Report $job.id $false "$($_.Exception.Message)"
        Write-Host "  $(Get-Date -Format HH:mm:ss)  oshibka $($job.ip): $($_.Exception.Message)" -ForegroundColor Red
      }
    }
    if ($jobs.Count -gt 0) { $idle = 0 } else { $idle++ }
  } catch {
    $code = $null
    try { $code = [int]$_.Exception.Response.StatusCode } catch {}
    if ($code -eq 403) {
      Write-Host '  Klyuch pechati ustarel. Skachayte pomoshnik zanovo v nastroykah markirovki.' -ForegroundColor Red
      Start-Sleep -Seconds 60
    } elseif (-not $offline) {
      Write-Host "  $(Get-Date -Format HH:mm:ss)  net svyazi s saytom, povtoryayu..." -ForegroundColor Yellow
      $offline = $true
    }
    $idle = 30
  }
  if ($idle -lt 30) { Start-Sleep -Milliseconds 500 } else { Start-Sleep -Seconds 6 }
}
`;

export const buildHelperBat = (endpoint: string, key: string) => {
  const head = [
    '@echo off',
    'chcp 65001 >nul',
    'set "ASAP_STARTUP=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\asap-pechat.bat"',
    'if /i not "%~f0"=="%ASAP_STARTUP%" copy /y "%~f0" "%ASAP_STARTUP%" >nul 2>&1',
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "$t = Get-Content -LiteralPath \'%~f0\' -Raw -Encoding UTF8; $m = \'#\' + \'ASAPPS\'; Invoke-Expression ($t.Substring($t.LastIndexOf($m) + $m.Length))"',
    'pause',
    'exit /b',
    '#ASAPPS',
  ].join('\r\n');
  return `${head}\r\n${psScript(endpoint, key).replace(/\n/g, '\r\n')}`;
};

export const downloadHelper = (endpoint: string, key: string) => {
  const blob = new Blob([buildHelperBat(endpoint, key)], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'asap-pechat.bat';
  link.click();
  URL.revokeObjectURL(url);
};
