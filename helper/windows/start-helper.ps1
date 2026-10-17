# Aoji Studio 열기 도우미 시작 (작업 스케줄러가 로그온 때 부른다, ADR-78 결정 4)
# 판단은 Node(aojistudio-helper.mjs)가 한다. 이 스크립트는 콘솔 창 없이 node를 띄우기만 한다.
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9._-]{1,64}$')][string]$Distro,
  [Parameter(Mandatory = $true)][ValidatePattern('^/[A-Za-z0-9._/-]+$')][string]$ProjectDir,
  [string]$AllowedOrigins = 'http://127.0.0.1:4180',
  [ValidateRange(1, 65535)][int]$Port = 4181,
  [string]$NodePath = ''
)
$ErrorActionPreference = 'Stop'

if ($ProjectDir.Contains('..')) { throw 'ProjectDir에 ".."를 쓸 수 없습니다' }
if ($NodePath -eq '') { $NodePath = Join-Path $env:ProgramFiles 'nodejs\node.exe' }
if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw "node.exe를 찾을 수 없습니다: $NodePath" }
$helper = Join-Path (Split-Path -Parent $PSScriptRoot) 'aojistudio-helper.mjs'
if (-not (Test-Path -LiteralPath $helper -PathType Leaf)) { throw "도우미 스크립트를 찾을 수 없습니다: $helper" }

# --dry-run은 넣지 않는다(디버그 기본 꺼짐).
$helperArgs = @(
  "`"$helper`"",
  '--platform', 'windows',
  '--wsl-distro', $Distro,
  '--project-dir', $ProjectDir,
  '--allowed-origins', $AllowedOrigins,
  '--port', [string]$Port
)
Start-Process -FilePath $NodePath -ArgumentList $helperArgs -WindowStyle Hidden
