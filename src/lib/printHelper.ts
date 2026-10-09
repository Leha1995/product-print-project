const psScript = (endpoint: string, key: string) => `
$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$Host.UI.RawUI.WindowTitle = 'ASAP - pomoshnik pechati'
$api = '${endpoint}'
$key = '${key}'
$headers = @{ 'X-Print-Key' = $key }
[Net.ServicePointManager]::DefaultConnectionLimit = 8
$dir = Join-Path $env:LOCALAPPDATA 'AsapPechat'
$logFile = Join-Path $dir 'log.txt'

function Get-Procs {
  try { return @(Get-CimInstance Win32_Process) } catch {}
  try { return @(Get-WmiObject Win32_Process) } catch {}
  return @()
}

if ($env:ASAP_MODE -eq 'install') {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $target = Join-Path $dir 'asap-pechat.bat'
  $startup = [Environment]::GetFolderPath('Startup')
  $all = Get-Procs
  $parent = ($all | Where-Object { $_.ProcessId -eq $PID } | Select-Object -First 1).ParentProcessId
  $all | Where-Object {
    $_.ProcessId -ne $PID -and $_.ProcessId -ne $parent -and $_.CommandLine -and
    @('cmd.exe', 'powershell.exe', 'wscript.exe') -contains $_.Name.ToLower() -and
    ($_.CommandLine -like '*ASAPPS*' -or $_.CommandLine -like '*asap-pechat*')
  } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }
  Start-Sleep -Seconds 1
  if ($env:ASAP_SELF -and ($env:ASAP_SELF -ne $target)) {
    Copy-Item -LiteralPath $env:ASAP_SELF -Destination $target -Force
  }
  Remove-Item -LiteralPath (Join-Path $startup 'asap-pechat.bat') -Force -ErrorAction SilentlyContinue
  $vbs = Join-Path $startup 'asap-pechat.vbs'
  $cmdLine = 'cmd /c ""' + $target + '" run"'
  $vbsText = 'CreateObject("WScript.Shell").Run "' + $cmdLine.Replace('"', '""') + '", 0, False'
  Set-Content -LiteralPath $vbs -Value $vbsText -Encoding Unicode
  Start-Process -FilePath 'wscript.exe' -ArgumentList ('"' + $vbs + '"')
  try {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
      "Помощник печати установлен и работает в фоне — окно больше не нужно.\`n\`nОн сам запускается при включении компьютера. Проверить связь можно на сайте в настройках печати: «Помощник печати в сети».",
      'ASAP — помощник печати', 'OK', 'Information') | Out-Null
  } catch {}
  [Environment]::Exit(0)
}

$mutex = New-Object System.Threading.Mutex($false, 'Local\\AsapPechatHelper')
$own = $false
try { $own = $mutex.WaitOne(10000) } catch { $own = $true }
if (-not $own) { [Environment]::Exit(3) }

function Log($text, $color = 'Gray') {
  $line = "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $text"
  Write-Host $line -ForegroundColor $color
  try {
    if ((Test-Path -LiteralPath $logFile) -and ((Get-Item -LiteralPath $logFile).Length -gt 200KB)) {
      Move-Item -LiteralPath $logFile -Destination ($logFile + '.old') -Force
    }
    Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
  } catch {}
}

try {
  Add-Type -Name AsapWin -Namespace Asap -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int h);
[DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr h, out uint m);
[DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr h, uint m);
[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);
'@
  $inp = [Asap.AsapWin]::GetStdHandle(-10)
  $mode = 0
  if ([Asap.AsapWin]::GetConsoleMode($inp, [ref]$mode)) {
    [Asap.AsapWin]::SetConsoleMode($inp, (($mode -band (-bnot 0x0040)) -bor 0x0080)) | Out-Null
  }
} catch {}

function Keep-Awake {
  try { [Asap.AsapWin]::SetThreadExecutionState([uint32]2147483649) | Out-Null } catch {}
}

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

New-Item -ItemType Directory -Force -Path $dir | Out-Null
Log 'pomoshnik setevoy pechati zapushen v fone' Green

$idle = 0
$offline = $false
$beat = Get-Date
while ($true) {
  Keep-Awake
  if (((Get-Date) - $beat).TotalMinutes -ge 30) {
    Log 'pomoshnik rabotaet' DarkGray
    $beat = Get-Date
  }
  try {
    $res = Invoke-RestMethod -Uri ($api + '?action=poll&t=' + [DateTime]::Now.Ticks) -Headers $headers -TimeoutSec 15
    if ($offline) { Log 'svyaz s saytom vosstanovlena' Green; $offline = $false }
    $jobs = @($res.jobs)
    foreach ($job in $jobs) {
      if (-not $job) { continue }
      try {
        Send-ToPrinter $job.ip $job.port ([Convert]::FromBase64String($job.data))
        Send-Report $job.id $true ''
        Log "napechatano -> $($job.ip)" Cyan
      } catch {
        Send-Report $job.id $false "$($_.Exception.Message)"
        Log "oshibka $($job.ip): $($_.Exception.Message)" Red
      }
    }
    if ($jobs.Count -gt 0) { $idle = 0 } else { $idle++ }
  } catch {
    $code = $null
    try { $code = [int]$_.Exception.Response.StatusCode } catch {}
    if ($code -eq 403) {
      Log 'Klyuch pechati ustarel. Skachayte pomoshnik zanovo v nastroykah markirovki.' Red
      Start-Sleep -Seconds 60
    } elseif (-not $offline) {
      Log "net svyazi s saytom, povtoryayu... $($_.Exception.Message)" Yellow
      $offline = $true
    }
    $idle = 30
  }
  if ($idle -lt 30) { Start-Sleep -Milliseconds 300 } else { Start-Sleep -Seconds 3 }
}
`;

export const buildHelperBat = (endpoint: string, key: string) => {
  const run =
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "$t = Get-Content -LiteralPath \'%~f0\' -Raw -Encoding UTF8; $m = \'#\' + \'ASAPPS\'; Invoke-Expression ($t.Substring($t.LastIndexOf($m) + $m.Length))"';
  const head = [
    '@echo off',
    'chcp 65001 >nul',
    'set "ASAP_SELF=%~f0"',
    'if /i "%~1"=="run" goto asap_loop',
    'echo Ustanavlivayu pomoshnik pechati...',
    'set "ASAP_MODE=install"',
    run,
    'exit /b',
    ':asap_loop',
    'set "ASAP_MODE=run"',
    run,
    'if errorlevel 3 if not errorlevel 4 exit /b',
    'ping -n 6 127.0.0.1 >nul',
    'goto asap_loop',
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
