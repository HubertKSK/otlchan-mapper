export const DIRECTIONS = {
  n: { label: "N", dx: 0, dy: -1, dz: 0, opposite: "s", aliases: ["n", "north", "polnoc", "pn"] },
  s: { label: "S", dx: 0, dy: 1, dz: 0, opposite: "n", aliases: ["s", "south", "poludnie", "pd"] },
  e: { label: "E", dx: 1, dy: 0, dz: 0, opposite: "w", aliases: ["e", "east", "wschod", "wsch"] },
  w: { label: "W", dx: -1, dy: 0, dz: 0, opposite: "e", aliases: ["w", "west", "zachod", "zach"] },
  u: { label: "G", dx: 0, dy: 0, dz: 1, opposite: "d", aliases: ["u", "up", "gora", "g"] },
  d: { label: "D", dx: 0, dy: 0, dz: -1, opposite: "u", aliases: ["d", "down", "dol"] }
};

const BLOCKED_PATTERNS = [
  /^nie mozesz(?: tam)? (?:isc|pojsc)\.?$/i,
  /^nie mozna(?: tam)? (?:isc|pojsc)\.?$/i,
  /^nie potrafisz(?: tam)? (?:isc|pojsc)\.?$/i,
  /^nie ma tam (?:przejscia|wyjscia)\.?$/i,
  /^tam niestety nie pojdziesz\.?$/i,
  /^tam niestety nie pojedziesz\.?$/i,
  /^za bardzo jestes zmeczony\.?$/i,
  /^droga jest zamknieta\.?$/i,
  /^to tylko sciana\.?$/i,
  /^uderzasz w scian[ea]\.?$/i,
  /^sciana (?:blokuje|zagradza|uniemozliwia)(?: ci)? droge\.?$/i
];

export function createEmptyProject() {
  const now = new Date().toISOString();
  const globalNotePage = {
    id: "global-note-1",
    title: "Aktualne zadanie",
    body: "",
    createdAt: now,
    updatedAt: now
  };
  const startRoom = {
    id: "r1",
    area: "Mantar",
    x: 0,
    y: 0,
    z: 0,
    title: "Start",
    description: "",
    descriptionHash: "",
    exitsSeen: [],
    specialExitsSeen: [],
    blockedExitsSeen: [],
    tags: [],
    notes: "",
    confidence: "manual",
    createdAt: now,
    updatedAt: now
  };
  return {
    version: 1,
    currentRoomId: startRoom.id,
    playerRoomId: startRoom.id,
    selectedRoomId: startRoom.id,
    nextRoomNumber: 2,
    areas: [{ id: "Mantar", name: "Mantar" }],
    rooms: [startRoom],
    exits: [],
    sessions: [{ id: `s-${Date.now()}`, startedAt: now }],
    globalNotes: "",
    globalNotesPages: [globalNotePage],
    activeGlobalNotesPageId: globalNotePage.id,
    notes: []
  };
}

export function normalizeDirection(input) {
  const value = stripDiacritics(String(input || "").trim().toLowerCase());
  for (const [dir, meta] of Object.entries(DIRECTIONS)) {
    if (meta.aliases.includes(value)) return dir;
  }
  return null;
}

export function parseMovementCommand(line) {
  const value = normalizeMovementCommandText(line);
  if (!value) return null;

  const exact = normalizeDirection(value);
  if (exact) return { direction: exact, count: 1 };

  const counted = value.match(/^(\d{1,3})([a-z]+)$/i);
  if (counted) {
    const direction = normalizeDirection(counted[2]);
    if (direction) return { direction, count: clampMovementCount(counted[1]) };
  }

  return null;
}

export function parseCoordinateLocationTitle(line) {
  const text = String(line || "").trim();
  const match = text.match(/^(.+?)\s*=\s*\((-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\)\s+w\s+([^\s]+)$/i);
  if (!match) return null;
  const areaFile = match[5].trim();
  const coord = {
    x: Number(match[2]),
    y: Number(match[3]),
    z: Number(match[4])
  };
  if (!Number.isFinite(coord.x) || !Number.isFinite(coord.y) || !Number.isFinite(coord.z) || !areaFile) return null;
  return {
    title: match[1].trim(),
    areaFile,
    coord,
    worldKey: `${areaFile}:${coord.x},${coord.y},${coord.z}`
  };
}

function normalizeMovementCommandText(line) {
  return stripDiacritics(String(line || "").trim().toLowerCase())
    .replace(/^<[^>\n]+>\s*/, "")
    .replace(/^>\s*/, "")
    .trim();
}

function clampMovementCount(value) {
  return Math.max(1, Math.min(50, Number(value) || 1));
}

export function isBlockedLine(line) {
  const clean = stripDiacritics(String(line || ""));
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(clean));
}

export function parseRoomText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const title = lines[0] || "Bez nazwy";
  const exitsText = lines.filter(isExitsLine).join(" ");
  const exitsSeen = extractExits(exitsText || lines.join(" "));
  const specialExitsSeen = extractSpecialExits(exitsText);
  const blockedExitsSeen = [];
  const description = lines.slice(1).filter((line) => !isExitsLine(line)).join(" ");
  return {
    title,
    description,
    exitsSeen,
    specialExitsSeen,
    blockedExitsSeen,
    descriptionHash: hashText(`${title}\n${description}\n${exitsSeen.sort().join(",")}`)
  };
}

function isExitsLine(line) {
  return /^wyjscia\s*:/i.test(stripDiacritics(line));
}

export function extractExits(text) {
  const clean = stripDiacritics(String(text || "").toLowerCase()).replace(/[{}]/g, " ");
  return extractDirections(clean);
}

export function extractSpecialExits(text) {
  const clean = stripDiacritics(String(text || "").toLowerCase());
  const special = new Set();
  for (const match of clean.matchAll(/\{([^}]*)\}/g)) {
    for (const dir of extractDirections(match[1])) special.add(dir);
  }
  return Array.from(special);
}

function extractDirections(text) {
  const exits = new Set();
  for (const [dir, meta] of Object.entries(DIRECTIONS)) {
    for (const alias of meta.aliases) {
      if (new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i").test(text)) exits.add(dir);
    }
  }
  return Array.from(exits);
}

export function move(project, direction, options = {}) {
  const dir = normalizeDirection(direction);
  if (!dir) return { project, status: "invalid-direction" };

  const current = getCurrentRoom(project);
  if (!current) return { project, status: "missing-current" };

  if (options.blocked) {
    markBlocked(project, current.id, dir);
    return { project, status: "blocked", room: current };
  }

  const existingExit = findExit(project, current.id, dir);
  if (existingExit) {
    project.currentRoomId = existingExit.to;
    return { project, status: "navigated", room: getCurrentRoom(project) };
  }

  return { project, status: "missing-target", room: current };
}

export function applyRoomObservation(project, observation, mode = "current") {
  const matches = observation.descriptionHash
    ? project.rooms.filter((room) => room.descriptionHash === observation.descriptionHash)
    : [];

  if (matches.length > 1) return { status: "ambiguous", matches };

  if (mode === "current") {
    const room = getCurrentRoom(project);
    if (!room) return { status: "missing-current" };
    const now = new Date().toISOString();
    Object.assign(room, {
      title: observation.title || room.title,
      description: observation.description || room.description || "",
      descriptionHash: observation.descriptionHash || room.descriptionHash,
      exitsSeen: unique([...(room.exitsSeen || []), ...(observation.exitsSeen || [])]),
      updatedAt: now
    });
    return { status: "updated", room };
  }

  const now = new Date().toISOString();
  if (matches.length === 1) {
    const room = matches[0];
    project.currentRoomId = room.id;
    Object.assign(room, {
      title: observation.title || room.title,
      description: observation.description || room.description || "",
      exitsSeen: unique([...(room.exitsSeen || []), ...(observation.exitsSeen || [])]),
      updatedAt: now
    });
    return { status: "matched", room };
  }

  return { status: "unmatched" };
}

export function createRoom(project, values) {
  const now = new Date().toISOString();
  const room = {
    id: `r${project.nextRoomNumber || project.rooms.length + 1}`,
    area: values.area || "Mantar",
    x: Number(values.x || 0),
    y: Number(values.y || 0),
    z: Number(values.z || 0),
    title: values.title || "Nowa lokacja",
    description: values.description || "",
    descriptionHash: values.descriptionHash || "",
    exitsSeen: values.exitsSeen || [],
    specialExitsSeen: values.specialExitsSeen || [],
    blockedExitsSeen: values.blockedExitsSeen || [],
    tags: values.tags || [],
    notes: values.notes || "",
    confidence: values.confidence || "manual",
    createdAt: now,
    updatedAt: now
  };
  project.nextRoomNumber = Math.max(project.nextRoomNumber || 1, Number(room.id.slice(1)) + 1);
  project.rooms.push(room);
  return room;
}

export function connectRooms(project, from, to, direction, flags = {}) {
  const dir = normalizeDirection(direction);
  if (!dir || !from || !to || from === to) return null;
  let existing = findExit(project, from, dir);
  if (!existing) {
    existing = { id: `e-${from}-${dir}-${to}`, from, to, direction: dir, hidden: Boolean(flags.hidden), blocked: false };
    project.exits.push(existing);
  } else {
    Object.assign(existing, { to, hidden: Boolean(flags.hidden) });
  }
  const opposite = DIRECTIONS[dir].opposite;
  if (opposite && !findExit(project, to, opposite)) {
    project.exits.push({ id: `e-${to}-${opposite}-${from}`, from: to, to: from, direction: opposite, hidden: Boolean(flags.hidden), blocked: false });
  }
  return existing;
}

export function mergeRooms(project, sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return { status: "noop" };
  const source = project.rooms.find((room) => room.id === sourceId);
  const target = project.rooms.find((room) => room.id === targetId);
  if (!source || !target) return { status: "missing" };
  target.notes = [target.notes, source.notes].filter(Boolean).join("\n");
  target.tags = unique([...(target.tags || []), ...(source.tags || [])]);
  target.exitsSeen = unique([...(target.exitsSeen || []), ...(source.exitsSeen || [])]);
  for (const exit of project.exits) {
    if (exit.from === sourceId) exit.from = targetId;
    if (exit.to === sourceId) exit.to = targetId;
  }
  project.exits = project.exits.filter((exit, index, all) =>
    exit.from !== exit.to &&
    all.findIndex((other) => other.from === exit.from && other.direction === exit.direction && other.to === exit.to) === index
  );
  project.rooms = project.rooms.filter((room) => room.id !== sourceId);
  if (project.currentRoomId === sourceId) project.currentRoomId = targetId;
  return { status: "merged", room: target };
}

export function findExit(project, roomId, direction) {
  const dir = normalizeDirection(direction);
  return project.exits.find((exit) => exit.from === roomId && exit.direction === dir && !exit.blocked);
}

export function markBlocked(project, roomId, direction) {
  const dir = normalizeDirection(direction);
  const id = `e-${roomId}-${dir}-blocked`;
  const existing = project.exits.find((exit) => exit.id === id);
  if (existing) return existing;
  const exit = { id, from: roomId, to: null, direction: dir, blocked: true, hidden: false };
  project.exits.push(exit);
  return exit;
}

export function getCurrentRoom(project) {
  return project.rooms.find((room) => room.id === project.currentRoomId) || project.rooms[0] || null;
}

export function hashText(text) {
  let hash = 2166136261;
  const clean = stripDiacritics(String(text || "").toLowerCase().replace(/\s+/g, " ").trim());
  for (let index = 0; index < clean.length; index += 1) {
    hash ^= clean.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function stripDiacritics(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/ó/g, "o")
    .replace(/Ó/g, "O");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}
