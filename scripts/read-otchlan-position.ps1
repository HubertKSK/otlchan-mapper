param(
  [Parameter(Mandatory = $true)]
  [int]$GamePid,
  [int]$PollMs = 100
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
$MOBS_MOBQ_ADDRESS = [IntPtr]0x477da0
$MOBS_MOBY_ADDRESS = [IntPtr]0x478610
$MOBS_MOBYWK_ADDRESS = [IntPtr]0x481a40
$BUFFER_SIZE = 8192
$MOBQ_BUFFER_SIZE = 9000
$MOBY_BUFFER_SIZE = 27000
$MOBYWK_BUFFER_SIZE = 224
$MOB_RECORD_SIZE = 18
$MOBYWK_RECORD_OFFSET = 10
$MOBYWK_SLOTS = 100
$MOB_VISIBLE_RANGE = 4
$MOB_POLL_MS = 1000
$FULL_SNAPSHOT_MS = 100
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
$LIGHT_OFFSET = 296
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
$mobNamesById = $null
$lastMobPollAt = [DateTime]::MinValue
$lastMobs = @()
$lastFullSnapshotAt = [DateTime]::MinValue
$lastWorldKey = ""

function Test-IsNightHour {
  param([int]$Hour)
  return $Hour -ge 20 -or $Hour -lt 6
}

function Get-GameDataPath {
  $gameDir = $env:OTCHLAN_DIR
  if (-not $gameDir) {
    $gameDir = "C:\Program Files (x86)\Otchlan 1.3"
  }
  return Join-Path $gameDir "dat"
}

function Read-ProcessBytes([IntPtr]$handle, [IntPtr]$address, [int]$size) {
  $buffer = New-Object byte[] $size
  [UIntPtr]$read = [UIntPtr]::Zero
  $ok = [OtchlanMemory]::ReadProcessMemory($handle, $address, $buffer, [uint32]$buffer.Length, [ref]$read)
  if (-not $ok) {
    return $null
  }
  return $buffer
}

function Test-IntegerToken([string]$text) {
  $number = 0
  return [int]::TryParse($text, [ref]$number)
}

function Get-DecodedMobFields([byte[]]$bytes, [int]$offset) {
  $recordSize = 251
  $key = [byte[]](0x70, 0x6c, 0x65, 0x70, 0x6c, 0x06)
  if ($offset + $recordSize -gt $bytes.Length) {
    return @()
  }
  $length = [Math]::Min([int]$bytes[$offset], $recordSize - 1)
  if ($length -le 0) {
    return @()
  }
  $decoded = New-Object byte[] $length
  for ($index = 0; $index -lt $length; $index++) {
    $decoded[$index] = $bytes[$offset + 1 + $index] -bxor $key[$index % $key.Length]
  }
  $fields = New-Object System.Collections.Generic.List[string]
  $start = 0
  for ($index = 0; $index -lt $decoded.Length; $index++) {
    if ($decoded[$index] -eq 0xfe) {
      break
    }
    if ($decoded[$index] -eq 0x01) {
      if ($index -gt $start) {
        $fields.Add($encoding.GetString($decoded, $start, $index - $start).Trim())
      }
      $start = $index + 1
    }
  }
  if ($start -lt $decoded.Length) {
    $fields.Add($encoding.GetString($decoded, $start, $decoded.Length - $start).Trim())
  }
  return $fields
}

function Get-MobNamesById {
  if ($script:mobNamesById -ne $null) {
    return $script:mobNamesById
  }
  $names = @{}
  $mobyPath = Join-Path (Get-GameDataPath) "moby.dat"
  if (-not (Test-Path $mobyPath)) {
    $script:mobNamesById = $names
    return $names
  }
  $bytes = [IO.File]::ReadAllBytes($mobyPath)
  for ($offset = 0; $offset + 251 -le $bytes.Length; $offset += 251) {
    $fields = Get-DecodedMobFields $bytes $offset
    for ($index = 0; $index -lt $fields.Count; $index++) {
      if (-not (Test-IntegerToken $fields[$index])) {
        continue
      }
      $ids = New-Object System.Collections.Generic.List[int]
      $cursor = $index
      while ($cursor -lt $fields.Count -and (Test-IntegerToken $fields[$cursor])) {
        $ids.Add([int]$fields[$cursor])
        $cursor += 1
      }
      if ($ids.Count -gt 0 -and $cursor + 4 -lt $fields.Count) {
        $name = $fields[$cursor]
        if ($name.Length -gt 1 -and -not (Test-IntegerToken $name) -and -not (Test-IntegerToken $fields[$cursor + 1]) -and -not (Test-IntegerToken $fields[$cursor + 2])) {
          foreach ($id in $ids) {
            if (-not $names.ContainsKey($id)) {
              $names[$id] = $name
            }
          }
        }
      }
    }
  }
  $script:mobNamesById = $names
  return $names
}

function Get-QuestMobNamesById([byte[]]$mobqBuffer) {
  $names = @{}
  if (-not $mobqBuffer) {
    return $names
  }
  for ($offset = 0; $offset + 54 -le $mobqBuffer.Length; $offset += 54) {
    $nameLength = [Math]::Min([int]$mobqBuffer[$offset], 30)
    if ($nameLength -le 0) {
      continue
    }
    $name = $encoding.GetString($mobqBuffer, $offset + 1, $nameLength).Trim()
    $id = [int][BitConverter]::ToInt16($mobqBuffer, $offset + 38)
    if ($id -gt 0 -and $name) {
      $names[$id] = $name
    }
  }
  return $names
}

function Get-Direction([int]$dx, [int]$dy) {
  if ($dx -eq 0 -and $dy -lt 0) { return "n" }
  if ($dx -eq 0 -and $dy -gt 0) { return "s" }
  if ($dy -eq 0 -and $dx -gt 0) { return "e" }
  if ($dy -eq 0 -and $dx -lt 0) { return "w" }
  return ""
}

function Get-CurrentMobs([IntPtr]$handle, [int]$playerX, [int]$playerY, [int]$playerZ) {
  $mobBuffer = Read-ProcessBytes $handle $MOBS_MOBY_ADDRESS $MOBY_BUFFER_SIZE
  $mobYwkBuffer = Read-ProcessBytes $handle $MOBS_MOBYWK_ADDRESS $MOBYWK_BUFFER_SIZE
  $mobqBuffer = Read-ProcessBytes $handle $MOBS_MOBQ_ADDRESS $MOBQ_BUFFER_SIZE
  if (-not $mobBuffer -or -not $mobYwkBuffer) {
    return @()
  }
  $normalNames = Get-MobNamesById
  $questNames = Get-QuestMobNamesById $mobqBuffer
  $mobs = @()
  $seen = @{}
  for ($slot = 0; $slot -lt $MOBYWK_SLOTS; $slot++) {
    $idOffset = $MOBYWK_RECORD_OFFSET + ($slot * 2)
    if ($idOffset + 2 -gt $mobYwkBuffer.Length) {
      break
    }
    $id = [int][BitConverter]::ToInt16($mobYwkBuffer, $idOffset)
    if ($id -le 0 -or $seen.ContainsKey($id)) {
      continue
    }
    $seen[$id] = $true
    $mobOffset = $id * $MOB_RECORD_SIZE
    if ($mobOffset + $MOB_RECORD_SIZE -gt $mobBuffer.Length) {
      continue
    }
    $x = [BitConverter]::ToInt16($mobBuffer, $mobOffset + 12)
    $y = [BitConverter]::ToInt16($mobBuffer, $mobOffset + 14)
    $z = [BitConverter]::ToInt16($mobBuffer, $mobOffset + 16)
    if ($x -eq 0 -and $y -eq 0 -and $z -eq 0) {
      continue
    }
    $dx = $x - $playerX
    $dy = $y - $playerY
    $direction = Get-Direction $dx $dy
    $distance = [Math]::Abs($dx) + [Math]::Abs($dy)
    $visibleCardinal4 = $z -eq $playerZ -and $direction -and $distance -gt 0 -and $distance -le $MOB_VISIBLE_RANGE
    $source = "moby.dat"
    $name = ""
    if ($questNames.ContainsKey($id)) {
      $name = $questNames[$id]
      $source = "mobq"
    } elseif ($normalNames.ContainsKey($id)) {
      $name = $normalNames[$id]
    }
    if (-not $name) {
      $name = "Mob #$id"
      $source = "unknown"
    }
    $mobs += @{
      id = $id
      name = $name
      x = $x
      y = $y
      z = $z
      dx = $dx
      dy = $dy
      distance = $distance
      direction = $direction
      visibleCardinal4 = [bool]$visibleCardinal4
      source = $source
    }
  }
  return $mobs
}

function Get-CurrentMobsCached([IntPtr]$handle, [string]$worldKey, [int]$playerX, [int]$playerY, [int]$playerZ) {
  $now = [DateTime]::UtcNow
  $elapsedMs = ($now - $script:lastMobPollAt).TotalMilliseconds
  if ($elapsedMs -lt $MOB_POLL_MS) {
    return $script:lastMobs
  }
  $script:lastMobPollAt = $now
  $script:lastMobs = Get-CurrentMobs $handle $playerX $playerY $playerZ
  return $script:lastMobs
}

$handle = [OtchlanMemory]::OpenProcess($PROCESS_VM_READ -bor $PROCESS_QUERY_INFORMATION, $false, [uint32]$GamePid)
if ($handle -eq [IntPtr]::Zero) {
  throw "OpenProcess failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
}

try {
  while ($true) {
    $buffer = Read-ProcessBytes $handle $G1_ADDRESS $BUFFER_SIZE
    if ($buffer) {
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
      $now = [DateTime]::UtcNow
      $worldChanged = $worldKey -and $worldKey -ne $lastWorldKey
      if (-not $worldKey) {
        Start-Sleep -Milliseconds $PollMs
        continue
      }
      if ($worldChanged) {
        $lastWorldKey = $worldKey
        [Console]::Out.WriteLine((ConvertTo-Json -Compress @{
          at = (Get-Date).ToUniversalTime().ToString("o")
          pid = $GamePid
          areaFile = $areaFile
          x = $x
          y = $y
          z = $z
          worldKey = $worldKey
          kind = "position"
        }))
        [Console]::Out.Flush()
        Start-Sleep -Milliseconds $PollMs
        continue
      }
      $fullSnapshotElapsedMs = ($now - $lastFullSnapshotAt).TotalMilliseconds
      if ($fullSnapshotElapsedMs -lt $FULL_SNAPSHOT_MS) {
        Start-Sleep -Milliseconds $PollMs
        continue
      }
      $lastFullSnapshotAt = $now
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
      $light = [BitConverter]::ToInt32($buffer, $LIGHT_OFFSET)
      $isNight = Test-IsNightHour $timeHour
      $canObserveMobs = $light -gt 0 -or -not $isNight
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
      if (-not $canObserveMobs) {
        $conditions += @{
          key = "darkness"
          name = "ciemność"
          value = 0
          level = "state"
        }
      }
      foreach ($condition in $conditions) {
        $snapshotKey += "|condition:$($condition.key),$($condition.level),$($condition.value)"
      }
      $snapshotKey += "|environment:$light,$([int]$isNight),$([int]$canObserveMobs)"
      $mobs = Get-CurrentMobsCached $handle $worldKey $x $y $z
      foreach ($mob in $mobs) {
        $snapshotKey += "|mob:$($mob.id),$($mob.x),$($mob.y),$($mob.z)"
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
          environment = @{
            light = $light
            hasLight = $light -gt 0
            isNight = $isNight
            canObserveMobs = $canObserveMobs
          }
          effects = $effects
          conditions = $conditions
          mobs = $mobs
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
