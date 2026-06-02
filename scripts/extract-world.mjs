import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import { pathToFileURL } from "node:url";

const DEFAULT_OTCHLAN_DIR = "C:\\Program Files (x86)\\Otchlan 1.3";
const DEFAULT_GAME_DIR = process.env.OTCHLAN_DIR || DEFAULT_OTCHLAN_DIR;
const DEFAULT_OUTPUT = "world-cache.json";
const RECORD_SIZE = 251;
const END_MARKER = 0xfe;
const FIELD_SEPARATOR = 0x01;
const AREA_KEY = Uint8Array.from([0x70, 0x6c, 0x65, 0x70, 0x6c, 0x06]);
const decoder = new TextDecoder("windows-1250");
const coordPattern = /^\((-?\d+),(-?\d+),(-?\d+)\)$/;
const coordRefPattern = /\((-?\d+),(-?\d+),(-?\d+)\)/g;
const exitFlagDirections = ["e", "w", "n", "s", "u", "d"];
const oppositeDirections = {
  e: "w",
  w: "e",
  n: "s",
  s: "n",
  u: "d",
  d: "u"
};
const directionNames = {
  e: "east",
  w: "west",
  n: "north",
  s: "south",
  u: "up",
  d: "down"
};

const gameDir = getArg("--game-dir") || DEFAULT_GAME_DIR;
const outputPath = getArg("--out") || DEFAULT_OUTPUT;
const areaDir = path.join(gameDir, "area");

if (isCliEntry()) {
  const world = await extractWorld(areaDir);
  await writeFile(outputPath, `${JSON.stringify(world, null, 2)}\n`, "utf8");

  console.log(
    `World extract OK: ${world.rooms.length} rooms, ${world.areas.length} areas -> ${outputPath}`
  );
}

export async function extractWorld(areaDirPath) {
  const entries = await readdir(areaDirPath, { withFileTypes: true });
  const areaFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".are"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const rooms = [];
  const warnings = [];

  for (const fileName of areaFiles) {
    const filePath = path.join(areaDirPath, fileName);
    const buffer = await readFile(filePath);

    if (buffer.length % RECORD_SIZE !== 0) {
      warnings.push(`${fileName}: size ${buffer.length} is not divisible by ${RECORD_SIZE}`);
    }

    const tokens = decodeAreaTokens(buffer);
    rooms.push(...parseAreaRooms(fileName, tokens));
  }

  const linkedRooms = linkWorldRooms(rooms);
  const layers = buildWorldLayers(linkedRooms);
  const zLayers = buildZLayers(layers);
  const skillSymbols = await extractSkillSymbols(gameDir, warnings);

  return {
    generatedAt: new Date().toISOString(),
    gameDir,
    recordSize: RECORD_SIZE,
    areas: areaFiles,
    skillSymbols,
    layers,
    zLayers,
    rooms: linkedRooms,
    warnings
  };
}

export async function extractSkillSymbols(gameDirPath, warnings = []) {
  const exePath = path.join(gameDirPath, "otchlan.exe");
  try {
    const text = decoder.decode(await readFile(exePath));
    return parseSkillSymbolsFromText(text);
  } catch (error) {
    warnings.push(`otchlan.exe: skill symbol extraction failed: ${error.message}`);
    return [];
  }
}

export function parseSkillSymbolsFromText(text) {
  const symbols = new Map();
  const pattern = /UM_([A-Z0-9_]+):c=i([0-9A-Fa-f]+)/g;
  for (const match of text.matchAll(pattern)) {
    const symbol = match[1];
    const raw = match[2];
    const number = Number.parseInt(raw, 16);
    if (!Number.isFinite(number) || number <= 0 || symbols.has(number)) continue;
    symbols.set(number, {
      number,
      raw,
      symbol,
      name: formatSkillSymbolName(symbol)
    });
  }
  return [...symbols.values()].sort((left, right) => left.number - right.number);
}

function formatSkillSymbolName(symbol) {
  return symbol
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function linkWorldRooms(rooms) {
  const roomKeys = new Set(rooms.map((room) => room.key));
  const areaTransitionMarkers = buildAreaTransitionMarkers(rooms);
  const missingExitMarkers = buildMissingExitMarkers(rooms, roomKeys);
  const axisRoomIndex = buildAxisRoomIndex(rooms);
  const linkedRooms = rooms.map((room) => {
    const { links, linkSources, wallDirections } = buildLinks(room, roomKeys, areaTransitionMarkers, missingExitMarkers, axisRoomIndex);
    return {
      ...room,
      links,
      linkSources,
      wallDirections
    };
  });
  fillReciprocalScriptLinks(linkedRooms);
  return linkedRooms;
}

export function decodeAreaTokens(buffer) {
  const tokens = [];

  for (let offset = 0; offset + RECORD_SIZE <= buffer.length; offset += RECORD_SIZE) {
    const record = buffer.subarray(offset, offset + RECORD_SIZE);
    const decoded = decodeRecord(record);
    let field = [];

    for (const byte of decoded) {
      if (byte === END_MARKER) break;
      if (byte === FIELD_SEPARATOR) {
        pushToken(tokens, field);
        field = [];
        continue;
      }
      field.push(byte);
    }

    pushToken(tokens, field);
  }

  return tokens;
}

function decodeRecord(record) {
  const length = Math.min(record[0], RECORD_SIZE - 1);
  const decoded = new Uint8Array(length);

  for (let index = 0; index < length; index += 1) {
    decoded[index] = record[index + 1] ^ AREA_KEY[index % AREA_KEY.length];
  }

  return decoded;
}

function pushToken(tokens, bytes) {
  if (!bytes.length) return;
  const text = decoder.decode(Uint8Array.from(bytes)).trim();
  if (text) tokens.push(text);
}

export function parseAreaRooms(areaFile, tokens) {
  const rooms = new Map();
  const templates = buildTemplates(tokens);
  const templateLabels = new Set(templates.keys());
  let pendingCoordinateRefs = [];

  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index] === "[qlok]") {
      const refs = [];
      let cursor = index + 1;
      while (cursor < tokens.length && tokens[cursor] !== "[qlok]") {
        refs.push(...extractCoordRefs(tokens[cursor]));
        cursor += 1;
      }
      pendingCoordinateRefs = refs;
      index = cursor;
      continue;
    }

    const coord = parseCoord(tokens[index]);
    if (!coord) continue;

    let headerIndex = index + 1;
    const conditions = [];
    while (headerIndex < tokens.length && !looksLikeFlags(tokens[headerIndex]) && !parseCoord(tokens[headerIndex]) && tokens[headerIndex] !== "[qlok]") {
      conditions.push(tokens[headerIndex]);
      headerIndex += 1;
    }

    const flags = tokens[headerIndex] || "";
    let bodyIndex = headerIndex + 1;
    const leadingDirectives = [];
    while (bodyIndex < tokens.length && isTechnicalDirective(tokens[bodyIndex]) && !parseTemplateCall(tokens[bodyIndex])) {
      leadingDirectives.push(tokens[bodyIndex]);
      bodyIndex += 1;
    }

    const templateCall = parseTemplateCall(tokens[bodyIndex]);
    const template = templateCall ? templates.get(templateCall) : null;
    const title = template?.title || tokens[bodyIndex] || "";
    const exitsLine = template?.exitsLine || tokens[bodyIndex + 1] || "";

    if (!looksLikeRoomHeader(flags, title, exitsLine)) continue;

    const rawBody = [...leadingDirectives];
    const description = template ? [...template.description] : [];
    if (template) rawBody.push(...template.rawBody);

    let cursor = template ? bodyIndex + 1 : bodyIndex + 2;
    while (cursor < tokens.length && !parseCoord(tokens[cursor]) && tokens[cursor] !== "[qlok]" && !templateLabels.has(tokens[cursor])) {
      rawBody.push(tokens[cursor]);
      if (!template) description.push(...expandDescriptionToken(tokens[cursor], templates));
      cursor += 1;
    }

    const exitBits = parseExitBits(flags);
    const flagTags = parseFlagTags(flags);
    const exitsFromFlags = parseExitsFromFlags(flags);
    const visibleExits = parseVisibleExits(exitsLine);
    const markedHiddenExits = parseMarkedHiddenExits(exitsLine);
    const coordinateRefs = [
      ...pendingCoordinateRefs,
      ...description.flatMap(extractCoordRefs)
    ];
    pendingCoordinateRefs = [];

    const key = makeRoomKey(areaFile, coord);
    const room = {
      key,
      areaFile,
      coord,
      conditions,
      flags,
      exitBits,
      flagTags: [
        ...conditions,
        ...flagTags
      ],
      exitFlags: exitsFromFlags,
      title,
      exitsLine,
      visibleExits,
      hiddenExits: Array.from(new Set([
        ...markedHiddenExits,
        ...exitsFromFlags.filter((direction) => !visibleExits.includes(direction))
      ])),
      exits: Array.from(new Set([...exitsFromFlags, ...visibleExits, ...markedHiddenExits])),
      scriptedExits: parseScriptedExits(rawBody),
      coordinateScriptedExits: parseCoordinateScriptedExits(rawBody),
      coordinateRefs,
      description: description.join("\n")
    };
    rooms.set(key, mergeRoomVariants(rooms.get(key), room));
  }

  return [...rooms.values()];
}

function buildTemplates(tokens) {
  const referenced = new Set(tokens.map(parseTemplateCall).filter(Boolean));
  const templates = new Map();
  for (let index = 0; index < tokens.length; index += 1) {
    const label = tokens[index];
    if (!referenced.has(label)) continue;
    if (parseCoord(label) || looksLikeFlags(label) || label === "[qlok]" || parseTemplateCall(label)) continue;
    const hasRoomHeader = looksLikeRoomHeader("000000", tokens[index + 1] || "", tokens[index + 2] || "");
    const title = hasRoomHeader ? tokens[index + 1] : "";
    const exitsLine = hasRoomHeader ? tokens[index + 2] : "";
    const start = index + (hasRoomHeader ? 3 : 1);
    const rawBody = [];
    const description = [];
    let cursor = start;
    while (cursor < tokens.length && !parseCoord(tokens[cursor]) && tokens[cursor] !== "[qlok]" && !referenced.has(tokens[cursor])) {
      rawBody.push(tokens[cursor]);
      if (!isTechnicalDirective(tokens[cursor])) description.push(tokens[cursor]);
      cursor += 1;
    }
    templates.set(label, { title, exitsLine, description, rawBody });
  }
  return templates;
}

function parseTemplateCall(value) {
  return String(value || "").match(/^%call\s+([^\s]+)$/i)?.[1] || "";
}

function expandDescriptionToken(value, templates) {
  const templateName = parseTemplateCall(value);
  if (templateName) return templates.get(templateName)?.description || [];
  return isTechnicalDirective(value) ? [] : [value];
}

function isTechnicalDirective(value) {
  return /^%/.test(String(value || ""));
}

function looksLikeRoomHeader(flags, title, exitsLine) {
  return looksLikeFlags(flags)
    && title.length > 0
    && /^Wyj/i.test(exitsLine);
}

function looksLikeFlags(value) {
  return /^[01]{6}/.test(String(value || ""));
}

function mergeRoomVariants(existing, room) {
  if (!existing) return room;
  const existingScore = scoreRoomVariant(existing);
  const roomScore = scoreRoomVariant(room);
  const base = roomScore >= existingScore ? room : existing;
  const other = base === room ? existing : room;
  return {
    ...base,
    conditions: Array.from(new Set([...(existing.conditions || []), ...(room.conditions || [])])),
    flagTags: Array.from(new Set([...(existing.flagTags || []), ...(room.flagTags || [])])),
    exitFlags: Array.from(new Set([...(existing.exitFlags || []), ...(room.exitFlags || [])])),
    visibleExits: Array.from(new Set([...(existing.visibleExits || []), ...(room.visibleExits || [])])),
    hiddenExits: Array.from(new Set([...(existing.hiddenExits || []), ...(room.hiddenExits || [])])),
    exits: Array.from(new Set([...(existing.exits || []), ...(room.exits || [])])),
    scriptedExits: mergeScriptedExits(existing.scriptedExits, room.scriptedExits),
    coordinateScriptedExits: mergeCoordinateScriptedExits(existing.coordinateScriptedExits, room.coordinateScriptedExits),
    coordinateRefs: [...(existing.coordinateRefs || []), ...(room.coordinateRefs || [])],
    description: base.description || other.description || ""
  };
}

function scoreRoomVariant(room) {
  return (room.visibleExits?.length || 0)
    + (room.scriptedExits?.length || 0) * 3
    + (room.coordinateScriptedExits?.length || 0) * 3
    + scoreRoomConditions(room.conditions)
    + (room.description?.length || 0) / 10000;
}

function scoreRoomConditions(conditions = []) {
  return conditions.some((condition) => /^!spr\.b\./.test(condition)) ? 0.5 : 0;
}

function mergeScriptedExits(left = [], right = []) {
  const byKey = new Map();
  for (const exit of [...left, ...right]) {
    byKey.set(`${exit.areaFile}|${exit.direction}`, exit);
  }
  return [...byKey.values()];
}

function mergeCoordinateScriptedExits(left = [], right = []) {
  const byKey = new Map();
  for (const exit of [...left, ...right]) {
    byKey.set(`${exit.direction}|${exit.coord.x}|${exit.coord.y}|${exit.coord.z}`, exit);
  }
  return [...byKey.values()];
}

function parseCoord(value) {
  const match = coordPattern.exec(value);
  if (!match) return null;
  return {
    x: Number(match[1]),
    y: Number(match[2]),
    z: Number(match[3])
  };
}

function parseVisibleExits(exitsLine) {
  return parseExits(String(exitsLine || "").replace(/\[[^\]]*\]/g, " "));
}

function parseMarkedHiddenExits(exitsLine) {
  const hiddenText = [...String(exitsLine || "").matchAll(/\[([^\]]*)\]/g)]
    .map((match) => match[1])
    .join(" ");
  return parseExits(hiddenText);
}

function parseExits(text) {
  const lower = String(text || "").toLowerCase();
  const exits = [];
  const directionWords = [
    ["n", "north"],
    ["s", "south"],
    ["e", "east"],
    ["w", "west"],
    ["u", "up"],
    ["d", "down"]
  ];

  for (const [direction, word] of directionWords) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) exits.push(direction);
  }

  return exits;
}

function parseExitsFromFlags(flags) {
  const bits = parseExitBits(flags);
  if (!bits) return [];
  return [...bits]
    .map((bit, index) => bit === "1" ? exitFlagDirections[index] : "")
    .filter(Boolean);
}

function parseExitBits(flags) {
  return String(flags || "").match(/^[01]{6}/)?.[0] || "";
}

function parseFlagTags(flags) {
  const suffix = String(flags || "").replace(/^[01]{6}/, "");
  const tags = [];
  let cursor = 0;

  while (cursor < suffix.length) {
    if (suffix[cursor] === "{") {
      const end = suffix.indexOf("}", cursor);
      if (end === -1) {
        tags.push(suffix.slice(cursor));
        break;
      }
      tags.push(suffix.slice(cursor, end + 1));
      cursor = end + 1;
      continue;
    }

    const nextBrace = suffix.indexOf("{", cursor);
    const segment = suffix.slice(cursor, nextBrace === -1 ? suffix.length : nextBrace);
    const parts = segment.match(/[A-Z]?[a-z]*\d*|[A-Z]+|\d+/g) || [];
    tags.push(...parts.filter(Boolean));
    cursor = nextBrace === -1 ? suffix.length : nextBrace;
  }

  return tags;
}

function extractCoordRefs(value) {
  return [...String(value || "").matchAll(coordRefPattern)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
    z: Number(match[3])
  }));
}

function parseScriptedExits(descriptionTokens) {
  const scripted = [];
  for (const token of descriptionTokens) {
    const match = /^%;1;([a-z0-9_]+);([ewnsud]);/i.exec(String(token || ""));
    if (!match) continue;
    scripted.push({
      areaFile: `${match[1].toLowerCase()}.are`,
      direction: match[2].toLowerCase()
    });
  }
  return scripted;
}

function parseCoordinateScriptedExits(descriptionTokens) {
  const scripted = [];
  for (const token of descriptionTokens) {
    const match = /^%;8;([ewnsud]);(-?\d+);(-?\d+);(-?\d+);/i.exec(String(token || ""));
    if (!match) continue;
    scripted.push({
      direction: match[1].toLowerCase(),
      coord: {
        x: Number(match[2]),
        y: Number(match[3]),
        z: Number(match[4])
      }
    });
  }
  return scripted;
}

function buildAreaTransitionMarkers(rooms) {
  const markers = new Map();
  for (const room of rooms) {
    for (const tag of room.flagTags || []) {
      const match = /^\{([ewnsud]):[ms]:f\}$/i.exec(tag);
      if (!match) continue;
      const key = `${room.areaFile}|${match[1].toLowerCase()}|${room.coord.z}`;
      if (!markers.has(key)) markers.set(key, []);
      markers.get(key).push(room);
    }
  }
  return markers;
}

function buildMissingExitMarkers(rooms, roomKeys) {
  const markers = new Map();
  const offsets = getDirectionOffsets();
  for (const room of rooms) {
    for (const direction of room.exits || []) {
      const offset = offsets[direction];
      if (!offset) continue;
      const target = makeRoomKey(room.areaFile, {
        x: room.coord.x + offset.x,
        y: room.coord.y + offset.y,
        z: room.coord.z + offset.z
      });
      if (roomKeys.has(target)) continue;
      const key = `${room.areaFile}|${direction}|${room.coord.z}`;
      if (!markers.has(key)) markers.set(key, []);
      markers.get(key).push(room);
    }
  }
  return markers;
}

function buildAxisRoomIndex(rooms) {
  const index = {
    byX: new Map(),
    byY: new Map()
  };

  for (const room of rooms) {
    const xKey = `${room.areaFile}|${room.coord.z}|${room.coord.x}`;
    const yKey = `${room.areaFile}|${room.coord.z}|${room.coord.y}`;
    if (!index.byX.has(xKey)) index.byX.set(xKey, []);
    if (!index.byY.has(yKey)) index.byY.set(yKey, []);
    index.byX.get(xKey).push(room);
    index.byY.get(yKey).push(room);
  }

  for (const roomsOnX of index.byX.values()) {
    roomsOnX.sort((left, right) => left.coord.y - right.coord.y);
  }
  for (const roomsOnY of index.byY.values()) {
    roomsOnY.sort((left, right) => left.coord.x - right.coord.x);
  }

  return index;
}

function buildLinks(room, roomKeys, areaTransitionMarkers, missingExitMarkers, axisRoomIndex) {
  const links = {};
  const linkSources = {};
  const wallDirections = {};
  const offsets = getDirectionOffsets();

  for (const direction of Object.keys(directionNames)) {
    wallDirections[direction] = !(room.visibleExits || []).includes(direction);
  }

  for (const direction of room.exits) {
    const offset = offsets[direction];
    const target = makeRoomKey(room.areaFile, {
      x: room.coord.x + offset.x,
      y: room.coord.y + offset.y,
      z: room.coord.z + offset.z
    });

    if (roomKeys.has(target)) {
      links[direction] = target;
      linkSources[direction] = "coord+direction";
      continue;
    }

    const sparseTarget = resolveSparseAxisExit(room, direction, axisRoomIndex);
    links[direction] = sparseTarget?.key || null;
    linkSources[direction] = sparseTarget ? "sparse-axis" : "missing-target";
  }

  for (const scriptedExit of room.scriptedExits || []) {
    const target = resolveScriptedExit(room, scriptedExit, areaTransitionMarkers, missingExitMarkers);
    links[scriptedExit.direction] = target?.key || null;
    linkSources[scriptedExit.direction] = target
      ? `script:${scriptedExit.areaFile}`
      : `script-missing-target:${scriptedExit.areaFile}`;
  }

  for (const scriptedExit of room.coordinateScriptedExits || []) {
    const target = makeRoomKey(room.areaFile, scriptedExit.coord);
    links[scriptedExit.direction] = roomKeys.has(target) ? target : null;
    linkSources[scriptedExit.direction] = roomKeys.has(target)
      ? "coord-script"
      : "coord-script-missing-target";
  }

  return { links, linkSources, wallDirections };
}

function resolveSparseAxisExit(room, direction, axisRoomIndex) {
  const opposite = oppositeDirections[direction];
  if (!opposite || !["n", "s", "e", "w"].includes(direction)) return null;

  const candidates = direction === "n" || direction === "s"
    ? axisRoomIndex.byX.get(`${room.areaFile}|${room.coord.z}|${room.coord.x}`) || []
    : axisRoomIndex.byY.get(`${room.areaFile}|${room.coord.z}|${room.coord.y}`) || [];
  const ordered = direction === "n" || direction === "w"
    ? [...candidates].reverse()
    : candidates;

  for (const candidate of ordered) {
    if (candidate.key === room.key) continue;
    if (direction === "n" && candidate.coord.y >= room.coord.y) continue;
    if (direction === "s" && candidate.coord.y <= room.coord.y) continue;
    if (direction === "w" && candidate.coord.x >= room.coord.x) continue;
    if (direction === "e" && candidate.coord.x <= room.coord.x) continue;
    return (candidate.exits || []).includes(opposite) ? candidate : null;
  }

  return null;
}

function resolveScriptedExit(room, scriptedExit, areaTransitionMarkers, missingExitMarkers) {
  const opposite = oppositeDirections[scriptedExit.direction];
  if (!opposite) return null;
  const targetZ = getScriptedTargetZ(room, scriptedExit.direction);
  const missingCandidates = missingExitMarkers.get(`${scriptedExit.areaFile}|${opposite}|${targetZ}`) || [];
  if (missingCandidates.length === 1) return missingCandidates[0];
  const missingTarget = pickNearestRoom(room, missingCandidates);
  if (missingTarget) return missingTarget;
  const candidates = areaTransitionMarkers.get(`${scriptedExit.areaFile}|${opposite}|${targetZ}`) || [];
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  return pickNearestRoom(room, candidates);
}

function getScriptedTargetZ(room, direction) {
  if (direction === "u") return Number(room.coord.z) + 1;
  if (direction === "d") return Number(room.coord.z) - 1;
  return Number(room.coord.z);
}

function pickNearestRoom(room, candidates) {
  if (!candidates.length) return null;
  const scored = candidates
    .map((candidate) => ({
      room: candidate,
      distance: Math.abs(candidate.coord.x - room.coord.x) + Math.abs(candidate.coord.y - room.coord.y)
    }))
    .sort((left, right) => left.distance - right.distance);
  if (scored.length > 1 && scored[0].distance === scored[1].distance) return null;
  return scored[0].room;
}

function fillReciprocalScriptLinks(rooms) {
  const roomsByKey = new Map(rooms.map((room) => [room.key, room]));
  for (const room of rooms) {
    for (const [direction, targetKey] of Object.entries(room.links || {})) {
      if (!targetKey || !String(room.linkSources?.[direction] || "").startsWith("script:")) continue;
      const opposite = oppositeDirections[direction];
      const target = roomsByKey.get(targetKey);
      if (!opposite || !target) continue;
      if (target.links?.[opposite]) continue;
      if (!target.links || !Object.hasOwn(target.links, opposite)) continue;
      target.links[opposite] = room.key;
      target.linkSources[opposite] = `script-reverse:${room.areaFile}`;
    }
  }
}

function getDirectionOffsets() {
  return {
    n: { x: 0, y: -1, z: 0 },
    s: { x: 0, y: 1, z: 0 },
    e: { x: 1, y: 0, z: 0 },
    w: { x: -1, y: 0, z: 0 },
    u: { x: 0, y: 0, z: 1 },
    d: { x: 0, y: 0, z: -1 }
  };
}

function makeRoomKey(areaFile, coord) {
  return `${areaFile}:${coord.x},${coord.y},${coord.z}`;
}

function buildWorldLayers(rooms) {
  const layerByRoomKey = new Map();
  const layersByKey = new Map();

  for (const room of rooms) {
    const layerKey = makeLayerKey(room);
    layerByRoomKey.set(room.key, layerKey);
    if (!layersByKey.has(layerKey)) {
      layersByKey.set(layerKey, {
        key: layerKey,
        areaFile: room.areaFile,
        z: room.coord.z,
        rooms: [],
        bounds: {
          minX: room.coord.x,
          maxX: room.coord.x,
          minY: room.coord.y,
          maxY: room.coord.y
        },
        portals: []
      });
    }

    const layer = layersByKey.get(layerKey);
    layer.rooms.push(room.key);
    layer.bounds.minX = Math.min(layer.bounds.minX, room.coord.x);
    layer.bounds.maxX = Math.max(layer.bounds.maxX, room.coord.x);
    layer.bounds.minY = Math.min(layer.bounds.minY, room.coord.y);
    layer.bounds.maxY = Math.max(layer.bounds.maxY, room.coord.y);
  }

  const portalKeys = new Set();
  for (const room of rooms) {
    const fromLayerKey = layerByRoomKey.get(room.key);
    const fromLayer = layersByKey.get(fromLayerKey);
    for (const [direction, targetKey] of Object.entries(room.links || {})) {
      if (!targetKey) continue;
      const toLayerKey = layerByRoomKey.get(targetKey);
      if (!toLayerKey || toLayerKey === fromLayerKey) continue;
      const portalKey = `${room.key}|${direction}|${targetKey}`;
      if (portalKeys.has(portalKey)) continue;
      portalKeys.add(portalKey);
      fromLayer.portals.push({
        direction,
        from: room.key,
        to: targetKey,
        toLayer: toLayerKey
      });
    }
  }

  return [...layersByKey.values()]
    .map((layer) => ({
      ...layer,
      roomCount: layer.rooms.length,
      width: layer.bounds.maxX - layer.bounds.minX + 1,
      height: layer.bounds.maxY - layer.bounds.minY + 1
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function makeLayerKey(room) {
  return `${room.areaFile}|z:${room.coord.z}`;
}

function buildZLayers(layers) {
  const byZ = new Map();
  for (const layer of layers) {
    const key = String(layer.z);
    if (!byZ.has(key)) {
      byZ.set(key, {
        z: layer.z,
        layers: [],
        roomCount: 0,
        portalCount: 0
      });
    }
    const zLayer = byZ.get(key);
    zLayer.layers.push(layer.key);
    zLayer.roomCount += layer.roomCount;
    zLayer.portalCount += layer.portals.length;
  }

  return [...byZ.values()]
    .map((zLayer) => ({
      ...zLayer,
      layerCount: zLayer.layers.length
    }))
    .sort((left, right) => Number(left.z) - Number(right.z));
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

function isCliEntry() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
