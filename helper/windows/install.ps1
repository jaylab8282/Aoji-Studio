# Aoji Studio 열기 도우미 Windows 설치 (ADR-78 결정 4)
# 도우미 파일을 %LOCALAPPDATA%\AojiStudio\helper\ 로 복사하고, 작업 스케줄러 작업을 등록한 뒤 /health를 확인한다.
# -DryRun 이면 아무것도 바꾸지 않고 복사 대상과 작업 XML만 출력한다.
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9._-]{1,64}$')][string]$Distro,
  [Parameter(Mandatory = $true)][ValidatePattern('^/[A-Za-z0-9._/-]+$')][string]$ProjectDir,
  [string]$AllowedOrigins = 'http://127.0.0.1:4180',
  [ValidateRange(1, 65535)][int]$Port = 4181,
  [string]$NodePath = '',
  [ValidateRange(1, 120)][int]$HealthTimeoutSeconds = 10,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'

function Fail([string]$Message) { throw "install.ps1: $Message" }

if ($ProjectDir.Contains('..')) { Fail 'ProjectDir에 ".."를 쓸 수 없습니다' }

$sourceDir = Split-Path -Parent $PSScriptRoot
$installDir = Join-Path $env:LOCALAPPDATA 'AojiStudio\helper'
$taskPath = '\AojiStudio\'
$taskName = 'aojistudio-helper'

if ($NodePath -eq '') {
  foreach ($entry in ($env:PATH -split ';')) {
    if ($entry -ne '' -and (Test-Path -LiteralPath (Join-Path $entry 'node.exe') -PathType Leaf)) {
      $NodePath = Join-Path $entry 'node.exe'
      break
    }
  }
}
if ($NodePath -eq '' -or -not (Test-Path -LiteralPath $NodePath -PathType Leaf)) {
  Fail 'node.exe를 찾을 수 없습니다 (Node 24 이상) · -NodePath <경로>로 지정하세요'
}
$nodeVersion = (& $NodePath --version).TrimStart('v')
if ([int]($nodeVersion.Split('.')[0]) -lt 24) { Fail "Node 24 이상이 필요합니다 (현재 v$nodeVersion)" }

$userId = "$env:USERDOMAIN\$env:USERNAME"
$helperPath = Join-Path $installDir 'aojistudio-helper.mjs'
# 작업 XML은 Node 순수 함수가 만든다. 설치 전(-DryRun)에는 원본 lib를 쓴다.
$xmlTool = if ($DryRun) { Join-Path $sourceDir 'lib\windowsTask.mjs' } else { Join-Path $installDir 'lib\windowsTask.mjs' }

$copyItems = @(
  @{ From = (Join-Path $sourceDir 'aojistudio-helper.mjs'); To = $installDir },
  @{ From = (Join-Path $sourceDir 'lib\*.mjs'); To = (Join-Path $installDir 'lib') },
  @{ From = (Join-Path $sourceDir 'windows\start-helper.ps1'); To = (Join-Path $installDir 'windows') }
)

if ($DryRun) {
  Write-Output 'DRY-RUN 아무것도 바꾸지 않습니다'
  foreach ($item in $copyItems) { Write-Output "DRY-RUN 복사: $($item.From) -> $($item.To)" }
  Write-Output "DRY-RUN 작업 등록: $taskPath$taskName (Register-ScheduledTask -Xml)"
}

$xmlArgs = @(
  $xmlTool, '--print-xml',
  '--node', $NodePath,
  '--helper', $helperPath,
  '--distro', $Distro,
  '--project-dir', $ProjectDir,
  '--allowed-origins', $AllowedOrigins,
  '--port', [string]$Port,
  '--user-id', $userId
)

if ($DryRun) {
  & $NodePath @xmlArgs
  if ($LASTEXITCODE -ne 0) { Fail '작업 XML을 만들지 못했습니다' }
  return
}

# 등록 전에 포트 선점을 확인한다. 이 작업이 이미 등록돼 있으면 먼저 내린다.
$existing = Get-ScheduledTask -TaskPath $taskPath -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  Stop-ScheduledTask -TaskPath $taskPath -TaskName $taskName -ErrorAction SilentlyContinue
}
$holder = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($holder -and -not $existing) { Fail "포트 $Port 를 다른 프로세스가 쓰고 있습니다 (pid: $($holder.OwningProcess -join ','))" }

foreach ($item in $copyItems) {
  New-Item -ItemType Directory -Force -Path $item.To | Out-Null
  Copy-Item -Path $item.From -Destination $item.To -Force
}

$xml = (& $NodePath @xmlArgs) -join "`n"
if ($LASTEXITCODE -ne 0 -or $xml -eq '') { Fail '작업 XML을 만들지 못했습니다' }
Register-ScheduledTask -TaskPath $taskPath -TaskName $taskName -Xml $xml -Force | Out-Null
Start-ScheduledTask -TaskPath $taskPath -TaskName $taskName

# 등록만으로는 기동 성공을 알 수 없다. /health가 응답할 때까지 기다리고, 없으면 등록을 해제하고 실패한다.
$origin = $AllowedOrigins.Split(',')[0]
$healthUrl = "http://127.0.0.1:$Port/health"
$healthy = $false
for ($i = 0; $i -lt ($HealthTimeoutSeconds * 4); $i++) {
  try {
    $response = Invoke-RestMethod -Uri $healthUrl -Headers @{ Origin = $origin } -TimeoutSec 2
    if ($response.ok -eq $true) { $healthy = $true; break }
  } catch { }
  Start-Sleep -Milliseconds 250
}
if (-not $healthy) {
  Stop-ScheduledTask -TaskPath $taskPath -TaskName $taskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskPath $taskPath -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Fail "도우미가 기동하지 않았습니다 - ${HealthTimeoutSeconds}초 동안 $healthUrl 무응답. 등록을 해제했습니다"
}

Write-Output "설치 완료: $installDir"
Write-Output "기동 확인 완료: $healthUrl"
