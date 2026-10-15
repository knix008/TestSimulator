# Drives the Windows Save dialog of a process through UI Automation (desktop E2E):
# waits for it, reports the check boxes in it, sets the ones named in -Checks
# ("label=1;label=0"), types the file name and presses Save (or Cancel).
# Prints JSON: { found, checks: [{ name, on }], saved }.
param(
  [int]$ProcessId,
  [string]$FileName = '',
  [string]$Checks = '',
  [switch]$Cancel,
  [string]$Dump = '',
  [int]$TimeoutMs = 15000
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$A = [Windows.Automation.AutomationElement]
$T = [Windows.Automation.TreeScope]
$C = [Windows.Automation.ControlType]

function Find-Dialog {
  $byPid = New-Object Windows.Automation.PropertyCondition($A::ProcessIdProperty, $ProcessId)
  $byClass = New-Object Windows.Automation.PropertyCondition($A::ClassNameProperty, '#32770')
  $cond = New-Object Windows.Automation.AndCondition($byPid, $byClass)
  # Owned by the app's window: look among the top-level windows and one level below them.
  $top = $A::RootElement.FindFirst($T::Children, $cond)
  if ($top) { return $top }
  foreach ($w in $A::RootElement.FindAll($T::Children, $byPid)) {
    $inner = $w.FindFirst($T::Descendants, $byClass)
    if ($inner) { return $inner }
  }
  return $null
}

$end = (Get-Date).AddMilliseconds($TimeoutMs)
$dialog = $null
while (-not $dialog -and (Get-Date) -lt $end) { $dialog = Find-Dialog; if (-not $dialog) { Start-Sleep -Milliseconds 200 } }
if (-not $dialog) { '{"found":false}'; exit 0 }
Start-Sleep -Milliseconds 400
if ($Dump) {
  $lines = $dialog.FindAll($T::Descendants, [Windows.Automation.Condition]::TrueCondition) | ForEach-Object { "$($_.Current.ControlType.ProgrammaticName)|$($_.Current.AutomationId)|$($_.Current.Name)|$($_.Current.ClassName)|$($_.Current.IsOffscreen)" }
  $lines | Set-Content -Encoding UTF8 $Dump
}

$boxes = $dialog.FindAll($T::Descendants, (New-Object Windows.Automation.PropertyCondition($A::ControlTypeProperty, $C::CheckBox)))
$wanted = @{}
foreach ($pair in ($Checks -split ';' | Where-Object { $_ })) { $k, $v = $pair -split '=', 2; $wanted[$k] = ($v -eq '1') }
$report = @()
foreach ($box in $boxes) {
  $toggle = $box.GetCurrentPattern([Windows.Automation.TogglePattern]::Pattern)
  $on = $toggle.Current.ToggleState -eq [Windows.Automation.ToggleState]::On
  $report += [pscustomobject]@{ name = $box.Current.Name; on = $on }
  if ($wanted.ContainsKey($box.Current.Name) -and $wanted[$box.Current.Name] -ne $on) { $toggle.Toggle() }
}

$saved = $false
if ($Cancel) {
  $button = $dialog.FindFirst($T::Descendants, (New-Object Windows.Automation.PropertyCondition($A::AutomationIdProperty, '2')))
  $button.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()
} else {
  # The file name box: an Edit inside "FileNameControlHost" (id 1001 on most Windows builds).
  $isEdit = New-Object Windows.Automation.PropertyCondition($A::ControlTypeProperty, $C::Edit)
  $edit = $null
  for ($i = 0; -not $edit -and $i -lt 25; $i++) {
    $host_ = $dialog.FindFirst($T::Descendants, (New-Object Windows.Automation.PropertyCondition($A::AutomationIdProperty, 'FileNameControlHost')))
    if ($host_) { $edit = $host_.FindFirst($T::Descendants, $isEdit) }
    if (-not $edit) { $edit = $dialog.FindFirst($T::Descendants, (New-Object Windows.Automation.AndCondition((New-Object Windows.Automation.PropertyCondition($A::AutomationIdProperty, '1001')), $isEdit))) }
    if (-not $edit) { Start-Sleep -Milliseconds 200 }
  }
  if (-not $edit) {
    $ids = ($dialog.FindAll($T::Descendants, [Windows.Automation.Condition]::TrueCondition) | Where-Object { $_.Current.AutomationId -notlike 'System.*' -and $_.Current.ControlType.ProgrammaticName -match 'Edit|ComboBox|Button|CheckBox' } | ForEach-Object { "$($_.Current.ControlType.ProgrammaticName)#$($_.Current.AutomationId)#$($_.Current.Name)#$($_.Current.ClassName)" }) -join "`n"
    $ids | Set-Content -Encoding UTF8 (Join-Path $env:TEMP 'mycad-save-dialog-dump.txt')
    throw "no file name box (controls written to %TEMP%mycad-save-dialog-dump.txt)"
  }
  $edit.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern).SetValue($FileName)
  $button = $dialog.FindFirst($T::Descendants, (New-Object Windows.Automation.PropertyCondition($A::AutomationIdProperty, '1')))
  $button.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()
  $saved = $true
}
[pscustomobject]@{ found = $true; checks = $report; saved = $saved } | ConvertTo-Json -Compress -Depth 4
