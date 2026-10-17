# Aoji Studio 열기 도우미 Windows 제거 (ADR-78 결정 4)
# 작업 해제, 도우미 프로세스 종료, 설치 폴더 삭제. 토큰 파일(WSL 쪽 .aojistudio\helper-token)은 남긴다.
# -DryRun 이면 아무것도 바꾸지 않고 할 일만 출력한다.
param(
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'

$installDir = Join-Path $env:LOCALAPPDATA 'AojiStudio\helper'
$taskPath = '\AojiStudio\'
$taskName = 'aojistudio-helper'

if ($DryRun) {
  Write-Output 'DRY-RUN 아무것도 바꾸지 않습니다'
  Write-Output "DRY-RUN 작업 해제: $taskPath$taskName"
  Write-Output 'DRY-RUN 도우미 프로세스 종료: aojistudio-helper.mjs 를 실행 중인 node.exe'
  Write-Output "DRY-RUN 폴더 삭제: $installDir"
  Write-Output 'DRY-RUN 토큰 파일은 남깁니다'
  return
}

$task = Get-ScheduledTask -TaskPath $taskPath -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) {
  Stop-ScheduledTask -TaskPath $taskPath -TaskName $taskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskPath $taskPath -TaskName $taskName -Confirm:$false
}

$helperProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine.Contains('aojistudio-helper.mjs') }
foreach ($process in $helperProcesses) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath $installDir) {
  Remove-Item -LiteralPath $installDir -Recurse -Force
}
Write-Output '제거 완료 (토큰 파일은 남겼습니다)'
