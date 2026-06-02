using System.Buffers.Binary;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

const uint ProcessVmRead = 0x0010;
const uint ProcessQueryInformation = 0x0400;
var g1Address = new IntPtr(0x47f570);
var mobsMobqAddress = new IntPtr(0x477da0);
var mobsMobyAddress = new IntPtr(0x478610);
var mobsMobYwkAddress = new IntPtr(0x481a40);

const int BufferSize = 8192;
const int MobqBufferSize = 9000;
const int MobyBufferSize = 27000;
const int MobYwkBufferSize = 224;
const int MobRecordSize = 18;
const int MobYwkRecordOffset = 10;
const int MobYwkSlots = 100;
const int MobVisibleRange = 4;
const int DefaultPollMs = 100;
const int DefaultMobPollMs = 1000;
const int FullSnapshotMs = 100;

const int LokacOffset = 312;
const int PlikareaOffset = 1084;
const int LevelOffset = 310;
const int UmiOffset = 1102;
const int UmiSlots = 80;
const int UmiRecordSize = 42;
const int HpsOffset = 178;
const int MvsOffset = 182;
const int ManasOffset = 186;
const int HpOffset = 202;
const int ManaOffset = 210;
const int MvOffset = 218;
const int ExpeOffset = 226;
const int GoldBankOffset = 230;
const int CzasOffset = 1050;
const int DzienOffset = 1056;
const int LiczgOffset = 234;
const int LiczsOffset = 238;
const int HungerWarningThreshold = 3000;
const int HungerSevereThreshold = 6000;
const int CzarkiOffset = 4462;
const int CzarkiSlots = 40;
const int CzarkiRecordSize = 12;
const int CzarkiSkillBaseNumer = 152;
const int MinExpOffset = 5062;
const int ExpLimitOffset = 5066;
const int PrzySobieOffset = 318;
const int ObjListSlots = 60;
const int ObjListRecordSize = 6;

var argsMap = ParseArgs(args);
var gamePid = GetIntArg(argsMap, "GamePid", "game-pid", "pid");
if (gamePid <= 0) throw new ArgumentException("Missing required -GamePid argument.");
var pollMs = Math.Max(20, GetIntArg(argsMap, "PollMs", "poll-ms") is var parsedPoll and > 0 ? parsedPoll : DefaultPollMs);
var mobPollMs = Math.Max(250, GetIntArg(argsMap, "MobPollMs", "mob-poll-ms") is var parsedMobPoll and > 0 ? parsedMobPoll : DefaultMobPollMs);

var encoding = GetGameEncoding();
var jsonOptions = new JsonSerializerOptions
{
  DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
  Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
};
var moneyObjectValues = new Dictionary<int, int>
{
  [500] = 1,
  [1105] = 100,
  [490] = 1000,
  [491] = 2000,
  [492] = 5000,
  [493] = 10000,
  [494] = 20000,
  [495] = 50000
};

var mobNamesById = LoadMobNames(encoding);
var lastSnapshotKey = "";
var lastWorldKey = "";
var lastFullSnapshotAt = DateTime.MinValue;
var lastMobPollAt = DateTime.MinValue;
var lastMobs = new List<MobInfo>();

Console.OutputEncoding = Encoding.UTF8;
using var processHandle = OpenGameProcess(gamePid);

while (true)
{
  var buffer = ReadProcessBytes(processHandle.DangerousGetHandle(), g1Address, BufferSize);
  if (buffer is null)
  {
    Console.Error.WriteLine($"ReadProcessMemory failed: {Marshal.GetLastWin32Error()}");
    await Task.Delay(pollMs);
    continue;
  }

  var x = ReadInt16(buffer, LokacOffset);
  var y = ReadInt16(buffer, LokacOffset + 2);
  var z = ReadInt16(buffer, LokacOffset + 4);
  var areaFile = ReadLengthPrefixedString(buffer, PlikareaOffset, 100, encoding);
  var worldKey = string.IsNullOrWhiteSpace(areaFile) ? "" : $"{areaFile}:{x},{y},{z}";
  var now = DateTime.UtcNow;
  if (string.IsNullOrWhiteSpace(worldKey))
  {
    await Task.Delay(pollMs);
    continue;
  }

  if (worldKey != lastWorldKey)
  {
    lastWorldKey = worldKey;
    WriteJson(jsonOptions, new PositionPayload
    {
      At = now.ToString("O"),
      Pid = gamePid,
      AreaFile = areaFile,
      X = x,
      Y = y,
      Z = z,
      WorldKey = worldKey,
      Kind = "position"
    });
    await Task.Delay(pollMs);
    continue;
  }

  if ((now - lastFullSnapshotAt).TotalMilliseconds < FullSnapshotMs)
  {
    await Task.Delay(pollMs);
    continue;
  }

  lastFullSnapshotAt = now;
  var telemetry = BuildTelemetryPayload(
    buffer,
    processHandle.DangerousGetHandle(),
    gamePid,
    areaFile,
    worldKey,
    x,
    y,
    z,
    now,
    encoding,
    moneyObjectValues,
    mobNamesById,
    mobPollMs,
    ref lastMobPollAt,
    ref lastMobs,
    mobsMobqAddress,
    mobsMobyAddress,
    mobsMobYwkAddress);
  var snapshotKey = BuildSnapshotKey(telemetry);
  if (snapshotKey != lastSnapshotKey)
  {
    lastSnapshotKey = snapshotKey;
    WriteJson(jsonOptions, telemetry);
  }

  await Task.Delay(pollMs);
}

static TelemetryPayload BuildTelemetryPayload(
  byte[] buffer,
  IntPtr processHandle,
  int gamePid,
  string areaFile,
  string worldKey,
  int x,
  int y,
  int z,
  DateTime now,
  Encoding encoding,
  Dictionary<int, int> moneyObjectValues,
  Dictionary<int, string> mobNamesById,
  int mobPollMs,
  ref DateTime lastMobPollAt,
  ref List<MobInfo> lastMobs,
  IntPtr mobqAddress,
  IntPtr mobyAddress,
  IntPtr mobYwkAddress)
{
  var hp = ReadDouble(buffer, HpOffset);
  var mana = ReadDouble(buffer, ManaOffset);
  var mv = ReadDouble(buffer, MvOffset);
  var level = buffer[LevelOffset];
  var exp = ReadInt32(buffer, ExpeOffset);
  var minExp = ReadInt32(buffer, MinExpOffset);
  var expLimit = ReadInt32(buffer, ExpLimitOffset);
  var goldBank = ReadInt32(buffer, GoldBankOffset);
  var timeRaw = ReadUInt16(buffer, CzasOffset);
  var hunger = ReadInt32(buffer, LiczgOffset);
  var thirst = ReadInt32(buffer, LiczsOffset);

  var gold = 0;
  for (var slot = 0; slot < ObjListSlots; slot++)
  {
    var objectOffset = PrzySobieOffset + slot * ObjListRecordSize;
    var objectNumber = ReadInt16(buffer, objectOffset);
    if (moneyObjectValues.TryGetValue(objectNumber, out var value))
    {
      gold += ReadInt32(buffer, objectOffset + 2) * value;
    }
  }

  var skills = ReadSkills(buffer, encoding);
  var effects = ReadEffects(buffer, skills);
  var conditions = ReadConditions(hunger, thirst);
  var elapsedMobMs = (now - lastMobPollAt).TotalMilliseconds;
  if (elapsedMobMs >= mobPollMs)
  {
    lastMobPollAt = now;
    lastMobs = ReadMobs(processHandle, mobqAddress, mobyAddress, mobYwkAddress, x, y, z, encoding, mobNamesById);
  }

  return new TelemetryPayload
  {
    At = now.ToString("O"),
    Pid = gamePid,
    AreaFile = areaFile,
    X = x,
    Y = y,
    Z = z,
    WorldKey = worldKey,
    Kind = "telemetry",
    Vitals = new Vitals(ReadInt32(buffer, HpsOffset), ReadInt32(buffer, ManasOffset), ReadInt32(buffer, MvsOffset), hp, mana, mv),
    Economy = new Economy(level, exp, minExp, expLimit, gold, goldBank),
    Time = new GameTime(timeRaw, (int)Math.Floor(timeRaw / 180.0) % 24, (int)Math.Floor(timeRaw % 180 / 3.0), ReadInt32(buffer, DzienOffset)),
    Effects = effects,
    Conditions = conditions,
    Mobs = lastMobs
  };
}

static Dictionary<int, SkillInfo> ReadSkills(byte[] buffer, Encoding encoding)
{
  var skills = new Dictionary<int, SkillInfo>();
  for (var slot = 0; slot < UmiSlots; slot++)
  {
    var skillOffset = UmiOffset + slot * UmiRecordSize;
    var nameLength = Math.Min((int)buffer[skillOffset + 2], 30);
    if (nameLength <= 0) continue;
    skills[slot] = new SkillInfo(
      encoding.GetString(buffer, skillOffset + 3, nameLength),
      buffer[skillOffset + 33],
      buffer[skillOffset + 34]);
  }
  return skills;
}

static List<EffectInfo> ReadEffects(byte[] buffer, Dictionary<int, SkillInfo> skills)
{
  var effects = new List<EffectInfo>();
  for (var slot = 0; slot < CzarkiSlots; slot++)
  {
    var effectOffset = CzarkiOffset + slot * CzarkiRecordSize;
    var effectNumber = ReadInt32(buffer, effectOffset);
    var duration = ReadInt32(buffer, effectOffset + 4);
    var count = ReadInt32(buffer, effectOffset + 8);
    if (effectNumber == 0 && duration == 0 && count == 0) continue;
    var skillIndex = effectNumber - CzarkiSkillBaseNumer;
    skills.TryGetValue(skillIndex, out var skill);
    effects.Add(new EffectInfo(slot, effectNumber, duration, count, skillIndex, skill?.Name ?? "", skill?.Spell ?? 0));
  }
  return effects;
}

static List<ConditionInfo> ReadConditions(int hunger, int thirst)
{
  var conditions = new List<ConditionInfo>();
  if (hunger >= HungerWarningThreshold)
  {
    var severe = hunger >= HungerSevereThreshold;
    conditions.Add(new ConditionInfo("hunger", severe ? "straszliwie glodny" : "glodny", hunger, severe ? "severe" : "warning"));
  }
  if (thirst >= HungerWarningThreshold)
  {
    var severe = thirst >= HungerSevereThreshold;
    conditions.Add(new ConditionInfo("thirst", severe ? "straszliwie spragniony" : "spragniony", thirst, severe ? "severe" : "warning"));
  }
  return conditions;
}

static List<MobInfo> ReadMobs(
  IntPtr processHandle,
  IntPtr mobqAddress,
  IntPtr mobyAddress,
  IntPtr mobYwkAddress,
  int playerX,
  int playerY,
  int playerZ,
  Encoding encoding,
  Dictionary<int, string> normalNames)
{
  var mobBuffer = ReadProcessBytes(processHandle, mobyAddress, MobyBufferSize);
  var mobYwkBuffer = ReadProcessBytes(processHandle, mobYwkAddress, MobYwkBufferSize);
  if (mobBuffer is null || mobYwkBuffer is null) return [];
  var questNames = ReadQuestMobNames(ReadProcessBytes(processHandle, mobqAddress, MobqBufferSize), encoding);
  var mobs = new List<MobInfo>();
  var seen = new HashSet<int>();
  for (var slot = 0; slot < MobYwkSlots; slot++)
  {
    var idOffset = MobYwkRecordOffset + slot * 2;
    if (idOffset + 2 > mobYwkBuffer.Length) break;
    var id = ReadInt16(mobYwkBuffer, idOffset);
    if (id <= 0 || !seen.Add(id)) continue;
    var mobOffset = id * MobRecordSize;
    if (mobOffset + MobRecordSize > mobBuffer.Length) continue;
    var x = ReadInt16(mobBuffer, mobOffset + 12);
    var y = ReadInt16(mobBuffer, mobOffset + 14);
    var z = ReadInt16(mobBuffer, mobOffset + 16);
    if (x == 0 && y == 0 && z == 0) continue;
    var dx = x - playerX;
    var dy = y - playerY;
    var direction = GetDirection(dx, dy);
    var distance = Math.Abs(dx) + Math.Abs(dy);
    var visibleCardinal4 = z == playerZ && direction.Length > 0 && distance > 0 && distance <= MobVisibleRange;
    var source = "moby.dat";
    if (!questNames.TryGetValue(id, out var name))
    {
      normalNames.TryGetValue(id, out name);
    }
    else
    {
      source = "mobq";
    }
    if (string.IsNullOrWhiteSpace(name))
    {
      name = $"Mob #{id}";
      source = "unknown";
    }
    mobs.Add(new MobInfo(id, name, x, y, z, dx, dy, distance, direction, visibleCardinal4, source));
  }
  return mobs;
}

static Dictionary<int, string> LoadMobNames(Encoding encoding)
{
  var names = new Dictionary<int, string>();
  var gameDir = Environment.GetEnvironmentVariable("OTCHLAN_DIR");
  if (string.IsNullOrWhiteSpace(gameDir)) gameDir = @"C:\Program Files (x86)\Otchlan 1.3";
  var mobyPath = Path.Combine(gameDir, "dat", "moby.dat");
  if (!File.Exists(mobyPath)) return names;
  var bytes = File.ReadAllBytes(mobyPath);
  for (var offset = 0; offset + 251 <= bytes.Length; offset += 251)
  {
    var fields = DecodeMobFields(bytes, offset, encoding);
    for (var index = 0; index < fields.Count; index++)
    {
      if (!int.TryParse(fields[index], out _)) continue;
      var ids = new List<int>();
      var cursor = index;
      while (cursor < fields.Count && int.TryParse(fields[cursor], out var id))
      {
        ids.Add(id);
        cursor++;
      }
      if (ids.Count <= 0 || cursor + 4 >= fields.Count) continue;
      var name = fields[cursor];
      if (name.Length <= 1 || int.TryParse(name, out _) || int.TryParse(fields[cursor + 1], out _) || int.TryParse(fields[cursor + 2], out _)) continue;
      foreach (var id in ids) names.TryAdd(id, name);
    }
  }
  return names;
}

static List<string> DecodeMobFields(byte[] bytes, int offset, Encoding encoding)
{
  const int recordSize = 251;
  var key = new byte[] { 0x70, 0x6c, 0x65, 0x70, 0x6c, 0x06 };
  if (offset + recordSize > bytes.Length) return [];
  var length = Math.Min((int)bytes[offset], recordSize - 1);
  if (length <= 0) return [];
  var decoded = new byte[length];
  for (var index = 0; index < length; index++)
  {
    decoded[index] = (byte)(bytes[offset + 1 + index] ^ key[index % key.Length]);
  }
  var fields = new List<string>();
  var start = 0;
  for (var index = 0; index < decoded.Length; index++)
  {
    if (decoded[index] == 0xfe) break;
    if (decoded[index] != 0x01) continue;
    if (index > start) fields.Add(encoding.GetString(decoded, start, index - start).Trim());
    start = index + 1;
  }
  if (start < decoded.Length) fields.Add(encoding.GetString(decoded, start, decoded.Length - start).Trim());
  return fields;
}

static Dictionary<int, string> ReadQuestMobNames(byte[]? mobqBuffer, Encoding encoding)
{
  var names = new Dictionary<int, string>();
  if (mobqBuffer is null) return names;
  for (var offset = 0; offset + 54 <= mobqBuffer.Length; offset += 54)
  {
    var nameLength = Math.Min((int)mobqBuffer[offset], 30);
    if (nameLength <= 0) continue;
    var name = encoding.GetString(mobqBuffer, offset + 1, nameLength).Trim();
    var id = ReadInt16(mobqBuffer, offset + 38);
    if (id > 0 && name.Length > 0) names[id] = name;
  }
  return names;
}

static string BuildSnapshotKey(TelemetryPayload telemetry)
{
  var builder = new StringBuilder();
  builder.Append(telemetry.WorldKey)
    .Append('|').Append(Math.Round(telemetry.Vitals?.Hp ?? 0, 2))
    .Append('|').Append(Math.Round(telemetry.Vitals?.Mana ?? 0, 2))
    .Append('|').Append(Math.Round(telemetry.Vitals?.Mv ?? 0, 2))
    .Append('|').Append(telemetry.Economy?.Level ?? 0)
    .Append('|').Append(telemetry.Economy?.Exp ?? 0)
    .Append('|').Append(telemetry.Economy?.Gold ?? 0)
    .Append('|').Append(telemetry.Economy?.GoldBank ?? 0)
    .Append('|').Append(telemetry.Time?.Raw ?? 0)
    .Append('|').Append(telemetry.Time?.Day ?? 0);
  foreach (var effect in telemetry.Effects ?? [])
  {
    builder.Append("|effect:").Append(effect.Number).Append(',').Append(effect.Duration).Append(',').Append(effect.Count);
  }
  foreach (var condition in telemetry.Conditions ?? [])
  {
    builder.Append("|condition:").Append(condition.Key).Append(',').Append(condition.Level).Append(',').Append(condition.Value);
  }
  foreach (var mob in telemetry.Mobs ?? [])
  {
    builder.Append("|mob:").Append(mob.Id).Append(',').Append(mob.X).Append(',').Append(mob.Y).Append(',').Append(mob.Z);
  }
  return builder.ToString();
}

static Dictionary<string, string> ParseArgs(string[] args)
{
  var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
  for (var index = 0; index < args.Length; index++)
  {
    var key = args[index].TrimStart('-', '/');
    if (string.IsNullOrWhiteSpace(key)) continue;
    if (index + 1 >= args.Length) break;
    map[key] = args[++index];
  }
  return map;
}

static int GetIntArg(Dictionary<string, string> map, params string[] names)
{
  foreach (var name in names)
  {
    if (map.TryGetValue(name, out var value) && int.TryParse(value, out var number)) return number;
  }
  return 0;
}

static Encoding GetGameEncoding()
{
  try
  {
    Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
    return Encoding.GetEncoding(1250);
  }
  catch
  {
    return Encoding.Default;
  }
}

static string ReadLengthPrefixedString(byte[] buffer, int offset, int maxLength, Encoding encoding)
{
  var length = Math.Min(buffer[offset], maxLength);
  return length <= 0 ? "" : encoding.GetString(buffer, offset + 1, length);
}

static string GetDirection(int dx, int dy)
{
  if (dx == 0 && dy < 0) return "n";
  if (dx == 0 && dy > 0) return "s";
  if (dy == 0 && dx > 0) return "e";
  if (dy == 0 && dx < 0) return "w";
  return "";
}

static byte[]? ReadProcessBytes(IntPtr handle, IntPtr address, int size)
{
  var buffer = new byte[size];
  return NativeMethods.ReadProcessMemory(handle, address, buffer, (uint)buffer.Length, out _) ? buffer : null;
}

static SafeProcessHandle OpenGameProcess(int pid)
{
  var handle = NativeMethods.OpenProcess(ProcessVmRead | ProcessQueryInformation, false, (uint)pid);
  if (handle.IsInvalid) throw new InvalidOperationException($"OpenProcess failed: {Marshal.GetLastWin32Error()}");
  return handle;
}

static short ReadInt16(byte[] buffer, int offset) => BinaryPrimitives.ReadInt16LittleEndian(buffer.AsSpan(offset, 2));
static int ReadInt32(byte[] buffer, int offset) => BinaryPrimitives.ReadInt32LittleEndian(buffer.AsSpan(offset, 4));
static ushort ReadUInt16(byte[] buffer, int offset) => BinaryPrimitives.ReadUInt16LittleEndian(buffer.AsSpan(offset, 2));
static double ReadDouble(byte[] buffer, int offset) => BitConverter.ToDouble(buffer, offset);

static void WriteJson(JsonSerializerOptions options, object payload)
{
  Console.WriteLine(JsonSerializer.Serialize(payload, options));
  Console.Out.Flush();
}

sealed class SafeProcessHandle : SafeHandle
{
  public SafeProcessHandle() : base(IntPtr.Zero, true) { }
  public override bool IsInvalid => handle == IntPtr.Zero || handle == new IntPtr(-1);
  protected override bool ReleaseHandle() => NativeMethods.CloseHandle(handle);
}

static partial class NativeMethods
{
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern SafeProcessHandle OpenProcess(uint access, bool inherit, uint pid);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool ReadProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, uint dwSize, out nuint lpNumberOfBytesRead);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool CloseHandle(IntPtr hObject);
}

record PositionPayload
{
  [JsonPropertyName("at")] public string At { get; init; } = "";
  [JsonPropertyName("pid")] public int Pid { get; init; }
  [JsonPropertyName("areaFile")] public string AreaFile { get; init; } = "";
  [JsonPropertyName("x")] public int X { get; init; }
  [JsonPropertyName("y")] public int Y { get; init; }
  [JsonPropertyName("z")] public int Z { get; init; }
  [JsonPropertyName("worldKey")] public string WorldKey { get; init; } = "";
  [JsonPropertyName("kind")] public string Kind { get; init; } = "";
}

record TelemetryPayload : PositionPayload
{
  [JsonPropertyName("vitals")] public Vitals? Vitals { get; init; }
  [JsonPropertyName("economy")] public Economy? Economy { get; init; }
  [JsonPropertyName("time")] public GameTime? Time { get; init; }
  [JsonPropertyName("effects")] public List<EffectInfo>? Effects { get; init; }
  [JsonPropertyName("conditions")] public List<ConditionInfo>? Conditions { get; init; }
  [JsonPropertyName("mobs")] public List<MobInfo>? Mobs { get; init; }
}

record Vitals(
  [property: JsonPropertyName("hpMax")] int HpMax,
  [property: JsonPropertyName("manaMax")] int ManaMax,
  [property: JsonPropertyName("mvMax")] int MvMax,
  [property: JsonPropertyName("hp")] double Hp,
  [property: JsonPropertyName("mana")] double Mana,
  [property: JsonPropertyName("mv")] double Mv);

record Economy(
  [property: JsonPropertyName("level")] int Level,
  [property: JsonPropertyName("exp")] int Exp,
  [property: JsonPropertyName("minExp")] int MinExp,
  [property: JsonPropertyName("expLimit")] int ExpLimit,
  [property: JsonPropertyName("gold")] int Gold,
  [property: JsonPropertyName("goldBank")] int GoldBank);

record GameTime(
  [property: JsonPropertyName("raw")] int Raw,
  [property: JsonPropertyName("hour")] int Hour,
  [property: JsonPropertyName("minute")] int Minute,
  [property: JsonPropertyName("day")] int Day);

record SkillInfo(string Name, int Known, int Spell);

record EffectInfo(
  [property: JsonPropertyName("slot")] int Slot,
  [property: JsonPropertyName("number")] int Number,
  [property: JsonPropertyName("duration")] int Duration,
  [property: JsonPropertyName("count")] int Count,
  [property: JsonPropertyName("skillIndex")] int SkillIndex,
  [property: JsonPropertyName("name")] string Name,
  [property: JsonPropertyName("spell")] int Spell);

record ConditionInfo(
  [property: JsonPropertyName("key")] string Key,
  [property: JsonPropertyName("name")] string Name,
  [property: JsonPropertyName("value")] int Value,
  [property: JsonPropertyName("level")] string Level);

record MobInfo(
  [property: JsonPropertyName("id")] int Id,
  [property: JsonPropertyName("name")] string Name,
  [property: JsonPropertyName("x")] int X,
  [property: JsonPropertyName("y")] int Y,
  [property: JsonPropertyName("z")] int Z,
  [property: JsonPropertyName("dx")] int Dx,
  [property: JsonPropertyName("dy")] int Dy,
  [property: JsonPropertyName("distance")] int Distance,
  [property: JsonPropertyName("direction")] string Direction,
  [property: JsonPropertyName("visibleCardinal4")] bool VisibleCardinal4,
  [property: JsonPropertyName("source")] string Source);
