param(
  [Parameter(Mandatory = $true)]
  [int]$GamePid,
  [int]$PollMs = 120
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class OtchlanMemory {
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern IntPtr OpenProcess(UInt32 access, bool inherit, UInt32 pid);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool ReadProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, UInt32 dwSize, out UIntPtr lpNumberOfBytesRead);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool CloseHandle(IntPtr hObject);
}
"@

$PROCESS_VM_READ = 0x0010
$PROCESS_QUERY_INFORMATION = 0x0400
$G1_ADDRESS = [IntPtr]0x47f570
$BUFFER_SIZE = 8192
$LOKAC_OFFSET = 312
$PLIKAREA_OFFSET = 1084
$LEVEL_OFFSET = 310
$UMI_OFFSET = 1102
$UMI_SLOTS = 80
$UMI_RECORD_SIZE = 42
$HPS_OFFSET = 178
$MVS_OFFSET = 182
$MANAS_OFFSET = 186
$HP_OFFSET = 202
$MANA_OFFSET = 210
$MV_OFFSET = 218
$EXPE_OFFSET = 226
$GOLDBANK_OFFSET = 230
$CZAS_OFFSET = 1050
$DZIEN_OFFSET = 1056
$LICZG_OFFSET = 234
$LICZS_OFFSET = 238
$HUNGER_WARNING_THRESHOLD = 3000
$HUNGER_SEVERE_THRESHOLD = 6000
$CZARKI_OFFSET = 4462
$CZARKI_SLOTS = 40
$CZARKI_RECORD_SIZE = 12
$CZARKI_SKILL_BASE_NUMER = 152
$MINEXP_OFFSET = 5062
$EXPLIMIT_OFFSET = 5066
$PRZYSOBIE_OFFSET = 318
$OBJLIST_SLOTS = 60
$OBJLIST_RECORD_SIZE = 6
$MONEY_OBJECT_VALUES = @{
  500 = 1
  1105 = 100
  490 = 1000
  491 = 2000
  492 = 5000
  493 = 10000
  494 = 20000
  495 = 50000
}
$encoding = [Text.Encoding]::GetEncoding(1250)
$lastSnapshotKey = ""

$handle = [OtchlanMemory]::OpenProcess($PROCESS_VM_READ -bor $PROCESS_QUERY_INFORMATION, $false, [uint32]$GamePid)
if ($handle -eq [IntPtr]::Zero) {
  throw "OpenProcess failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
}

try {
  while ($true) {
    $buffer = New-Object byte[] $BUFFER_SIZE
    [UIntPtr]$read = [UIntPtr]::Zero
    $ok = [OtchlanMemory]::ReadProcessMemory($handle, $G1_ADDRESS, $buffer, [uint32]$buffer.Length, [ref]$read)
    if ($ok) {
      $x = [BitConverter]::ToInt16($buffer, $LOKAC_OFFSET)
      $y = [BitConverter]::ToInt16($buffer, $LOKAC_OFFSET + 2)
      $z = [BitConverter]::ToInt16($buffer, $LOKAC_OFFSET + 4)
      $areaLength = [Math]::Min([int]$buffer[$PLIKAREA_OFFSET], 100)
      $areaBytes = New-Object byte[] $areaLength
      if ($areaLength -gt 0) {
        [Array]::Copy($buffer, $PLIKAREA_OFFSET + 1, $areaBytes, 0, $areaLength)
      }
      $areaFile = $encoding.GetString($areaBytes)
      $worldKey = if ($areaFile) { "$areaFile`:$x,$y,$z" } else { "" }
      $hp = [BitConverter]::ToDouble($buffer, $HP_OFFSET)
      $mana = [BitConverter]::ToDouble($buffer, $MANA_OFFSET)
      $mv = [BitConverter]::ToDouble($buffer, $MV_OFFSET)
      $hpMax = [BitConverter]::ToInt32($buffer, $HPS_OFFSET)
      $manaMax = [BitConverter]::ToInt32($buffer, $MANAS_OFFSET)
      $mvMax = [BitConverter]::ToInt32($buffer, $MVS_OFFSET)
      $level = [int]$buffer[$LEVEL_OFFSET]
      $exp = [BitConverter]::ToInt32($buffer, $EXPE_OFFSET)
      $minExp = [BitConverter]::ToInt32($buffer, $MINEXP_OFFSET)
      $expLimit = [BitConverter]::ToInt32($buffer, $EXPLIMIT_OFFSET)
      $goldBank = [BitConverter]::ToInt32($buffer, $GOLDBANK_OFFSET)
      $timeRaw = [int][BitConverter]::ToUInt16($buffer, $CZAS_OFFSET)
      $timeHour = [int]([Math]::Floor($timeRaw / 180) % 24)
      $timeMinute = [int]([Math]::Floor(($timeRaw % 180) / 3))
      $journeyDay = [BitConverter]::ToInt32($buffer, $DZIEN_OFFSET)
      $hunger = [BitConverter]::ToInt32($buffer, $LICZG_OFFSET)
      $thirst = [BitConverter]::ToInt32($buffer, $LICZS_OFFSET)
      $gold = 0
      for ($slot = 0; $slot -lt $OBJLIST_SLOTS; $slot++) {
        $objectOffset = $PRZYSOBIE_OFFSET + ($slot * $OBJLIST_RECORD_SIZE)
        $objectNumber = [int][BitConverter]::ToInt16($buffer, $objectOffset)
        if ($MONEY_OBJECT_VALUES.ContainsKey($objectNumber)) {
          $quantity = [BitConverter]::ToInt32($buffer, $objectOffset + 2)
          $gold += $quantity * $MONEY_OBJECT_VALUES[$objectNumber]
        }
      }
      $skills = @{}
      for ($slot = 0; $slot -lt $UMI_SLOTS; $slot++) {
        $skillOffset = $UMI_OFFSET + ($slot * $UMI_RECORD_SIZE)
        $nameLength = [Math]::Min([int]$buffer[$skillOffset + 2], 30)
        if ($nameLength -gt 0) {
          $nameBytes = New-Object byte[] $nameLength
          [Array]::Copy($buffer, $skillOffset + 3, $nameBytes, 0, $nameLength)
          $skills[$slot] = @{
            name = $encoding.GetString($nameBytes)
            known = [int]$buffer[$skillOffset + 33]
            spell = [int]$buffer[$skillOffset + 34]
          }
        }
      }
      $effects = @()
      for ($slot = 0; $slot -lt $CZARKI_SLOTS; $slot++) {
        $effectOffset = $CZARKI_OFFSET + ($slot * $CZARKI_RECORD_SIZE)
        $effectNumber = [BitConverter]::ToInt32($buffer, $effectOffset)
        $duration = [BitConverter]::ToInt32($buffer, $effectOffset + 4)
        $count = [BitConverter]::ToInt32($buffer, $effectOffset + 8)
        if ($effectNumber -ne 0 -or $duration -ne 0 -or $count -ne 0) {
          $skillIndex = $effectNumber - $CZARKI_SKILL_BASE_NUMER
          $skill = if ($skills.ContainsKey($skillIndex)) { $skills[$skillIndex] } else { $null }
          $effects += @{
            slot = $slot
            number = $effectNumber
            duration = $duration
            count = $count
            skillIndex = $skillIndex
            name = if ($skill) { $skill.name } else { "" }
            spell = if ($skill) { $skill.spell } else { 0 }
          }
        }
      }
      $snapshotKey = "$worldKey|$([Math]::Round($hp, 2))|$([Math]::Round($mana, 2))|$([Math]::Round($mv, 2))|$level|$exp|$gold|$goldBank|$timeRaw|$journeyDay"
      foreach ($effect in $effects) {
        $snapshotKey += "|effect:$($effect.number),$($effect.duration),$($effect.count)"
      }
      $conditions = @()
      if ($hunger -ge $HUNGER_WARNING_THRESHOLD) {
        $conditions += @{
          key = "hunger"
          name = if ($hunger -ge $HUNGER_SEVERE_THRESHOLD) { "straszliwie glodny" } else { "glodny" }
          value = $hunger
          level = if ($hunger -ge $HUNGER_SEVERE_THRESHOLD) { "severe" } else { "warning" }
        }
      }
      if ($thirst -ge $HUNGER_WARNING_THRESHOLD) {
        $conditions += @{
          key = "thirst"
          name = if ($thirst -ge $HUNGER_SEVERE_THRESHOLD) { "straszliwie spragniony" } else { "spragniony" }
          value = $thirst
          level = if ($thirst -ge $HUNGER_SEVERE_THRESHOLD) { "severe" } else { "warning" }
        }
      }
      foreach ($condition in $conditions) {
        $snapshotKey += "|condition:$($condition.key),$($condition.level),$($condition.value)"
      }
      if ($worldKey -and $snapshotKey -ne $lastSnapshotKey) {
        $lastSnapshotKey = $snapshotKey
        [Console]::Out.WriteLine((ConvertTo-Json -Compress @{
          at = (Get-Date).ToUniversalTime().ToString("o")
          pid = $GamePid
          areaFile = $areaFile
          x = $x
          y = $y
          z = $z
          worldKey = $worldKey
          vitals = @{
            hp = $hp
            hpMax = $hpMax
            mana = $mana
            manaMax = $manaMax
            mv = $mv
            mvMax = $mvMax
          }
          economy = @{
            level = $level
            exp = $exp
            minExp = $minExp
            expLimit = $expLimit
            gold = $gold
            goldBank = $goldBank
          }
          time = @{
            raw = $timeRaw
            hour = $timeHour
            minute = $timeMinute
            day = $journeyDay
          }
          effects = $effects
          conditions = $conditions
        }))
        [Console]::Out.Flush()
      }
    } else {
      [Console]::Error.WriteLine("ReadProcessMemory failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())")
      [Console]::Error.Flush()
    }
    Start-Sleep -Milliseconds $PollMs
  }
} finally {
  [void][OtchlanMemory]::CloseHandle($handle)
}
