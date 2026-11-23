# Builds souls.json: every "Soul: X (Bound)" item (534660001 and up) with the monsters that drop it, from aion2hub.com's
# item pages ("Dropped by": name, level, map), whose data is the Global game client's. No Node needed (Windows PowerShell).
# Run in the folder you want souls.json in:  powershell -ExecutionPolicy Bypass -File souls.ps1
# One page every 0.3 s, stops after 40 ids in a row with no Soul. Takes a few minutes.
$ErrorActionPreference = "Stop"
$out = @()
$misses = 0
for ($id = 534660001; $misses -lt 40; $id++) {
  try {
    $html = (Invoke-WebRequest -UseBasicParsing "https://aion2hub.com/database/items/$id").Content
  } catch {
    $misses++; Start-Sleep -Milliseconds 300; continue
  }
  $title = [regex]::Match($html, '<title>([^<]*)').Groups[1].Value
  $name = ($title -split ' — ')[0]
  if ($name -notlike 'Soul:*') { $misses++; Start-Sleep -Milliseconds 300; continue }
  $misses = 0
  $at = $html.IndexOf('Dropped by')
  $mobs = @()
  if ($at -ge 0) {
    $sec = $html.Substring($at)
    $end = $sec.IndexOf('</ul>')
    if ($end -ge 0) { $sec = $sec.Substring(0, $end) }
    $re = '<span class="text-gray-200">([^<]+)</span>.*?Lv <!-- -->(\d+)</span>(?:<a[^>]*href="/maps\?map=([^"]+)">([^<]+)</a>)?'
    foreach ($m in [regex]::Matches($sec, $re)) {
      $mobs += ,@([System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value), [int]$m.Groups[2].Value, $m.Groups[3].Value)
    }
  }
  $out += [ordered]@{ id = $id; name = [System.Net.WebUtility]::HtmlDecode($name); mobs = $mobs }
  Write-Host "$id $name : $($mobs.Count) monsters"
  Start-Sleep -Milliseconds 300
}
$json = ConvertTo-Json -InputObject $out -Depth 5 -Compress
[System.IO.File]::WriteAllText((Join-Path (Get-Location) "souls.json"), $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host "souls.json: $($out.Count) souls"
