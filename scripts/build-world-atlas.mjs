import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import packageJson from "../package.json" with { type: "json" };

const DEFAULT_INPUT = "world-cache.json";
const DEFAULT_OUTPUT = "world-atlas.json";
const DIRECTION_OFFSETS = {
  n: { x: 0, y: -1, z: 0 },
  s: { x: 0, y: 1, z: 0 },
  e: { x: 1, y: 0, z: 0 },
  w: { x: -1, y: 0, z: 0 },
  u: { x: 0, y: 0, z: 1 },
  d: { x: 0, y: 0, z: -1 }
};
const OPPOSITE_DIRECTIONS = {
  n: "s",
  s: "n",
  e: "w",
  w: "e",
  u: "d",
  d: "u"
};
const HORIZONTAL_DIRECTIONS = new Set(["n", "s", "e", "w"]);
const SOURCE_PRIORITIES = {
  "coord+direction": 10,
  vertical: 15,
  "sparse-axis": 20,
  "script-reciprocal": 30,
  script: 40
};

if (isCliEntry()) {
  const inputPath = getArg("--in") || DEFAULT_INPUT;
  const outputPath = getArg("--out") || DEFAULT_OUTPUT;
  const world = JSON.parse(await readFile(inputPath, "utf8"));
  const atlas = buildAtlas(world, { source: inputPath });
  await writeFile(outputPath, `${JSON.stringify(atlas, null, 2)}\n`, "utf8");

  console.log(
    `World atlas OK: ${atlas.rooms.length} rooms, ${atlas.zLayers.length} z-layers, ${atlas.warnings.length} warnings -> ${outputPath}`
  );
}

export function buildAtlas(world, options = {}) {
  const rooms = Array.isArray(world?.rooms) ? world.rooms : [];
  const roomsByKey = new Map(rooms.map((room) => [room.key, room]));
  const constraints = buildRoomPlacementConstraints(rooms, roomsByKey);
  const layout = placeRooms(rooms, constraints);
  const localMaps = buildLocalMaps(rooms, layout);
  const corridors = buildAtlasCorridors(constraints, layout.positions, roomsByKey);
  const atlasRooms = rooms.map((room) => {
    const point = layout.positions.get(room.key) || { x: room.coord.x, y: room.coord.y };
    return {
      key: room.key,
      areaFile: room.areaFile,
      title: room.title,
      coord: room.coord,
      exits: room.exits || [],
      visibleExits: room.visibleExits || [],
      hiddenExits: room.hiddenExits || [],
      links: room.links || {},
      linkSources: room.linkSources || {},
      coordinateScriptedExits: room.coordinateScriptedExits || [],
      walls: buildRoomWalls(room),
      wallDirections: buildWallDirections(room),
      verticalExits: buildVerticalExits(room),
      atlas: {
        x: point.x,
        y: point.y,
        z: room.coord.z,
        localMapKey: makeLocalMapKey(room),
        componentId: layout.componentByRoom.get(room.key) || ""
      }
    };
  });

  const zLayers = buildAtlasZLayers(localMaps, atlasRooms);

  return {
    generatedAt: new Date().toISOString(),
    appVersion: packageJson.version,
    source: options.source || DEFAULT_INPUT,
    rooms: atlasRooms,
    localMaps,
    corridors,
    zLayers,
    constraints,
    warnings: collectWarnings(layout)
  };
}

function buildVerticalExits(room) {
  const visibleExits = new Set(room.visibleExits || []);
  return ["u", "d"].filter((direction) => visibleExits.has(direction));
}

function buildRoomWalls(room) {
  const wallDirections = buildWallDirections(room);
  return Object.entries(wallDirections)
    .filter(([, isWall]) => isWall)
    .map(([direction]) => direction);
}

function buildWallDirections(room) {
  const visibleExits = new Set(room.visibleExits || []);
  for (const direction of room.hiddenExits || []) visibleExits.delete(direction);
  return Object.fromEntries(
    Object.keys(DIRECTION_OFFSETS).map((direction) => [direction, !visibleExits.has(direction)])
  );
}

function buildRoomPlacementConstraints(rooms, roomsByKey) {
  const byKey = new Map();
  for (const room of rooms) {
    for (const [direction, targetKey] of Object.entries(room.links || {})) {
      const constraint = makeRoomConstraint(room, direction, targetKey, roomsByKey);
      if (!constraint) continue;
      const key = makeConstraintKey(constraint);
      const existing = byKey.get(key);
      if (!existing || compareConstraints(constraint, existing) < 0) {
        byKey.set(key, constraint);
      }
    }
  }
  return [...byKey.values()].sort(compareConstraints);
}

function makeRoomConstraint(room, direction, targetKey, roomsByKey) {
  const offset = DIRECTION_OFFSETS[direction];
  const target = roomsByKey.get(targetKey);
  if (!offset || !target) return null;

  const source = room.linkSources?.[direction] || "link";
  const priority = getConstraintPriority(room, target, direction, source);
  if (!priority) return null;

  const placementOffset = direction === "u" || direction === "d"
    ? { x: 0, y: 0, z: offset.z }
    : source === "sparse-axis"
    ? {
        x: target.coord.x - room.coord.x,
        y: target.coord.y - room.coord.y,
        z: 0
      }
    : { ...offset };

  return {
    from: room.key,
    to: target.key,
    direction,
    dx: placementOffset.x,
    dy: placementOffset.y,
    dz: placementOffset.z || 0,
    source,
    priority,
    reciprocal: target.links?.[OPPOSITE_DIRECTIONS[direction]] === room.key
  };
}

function buildAtlasCorridors(constraints, positions, roomsByKey) {
  const corridors = [];
  for (const constraint of constraints) {
    if (constraint.source !== "sparse-axis") continue;
    const from = positions.get(constraint.from);
    const to = positions.get(constraint.to);
    if (!from || !to) continue;
    const fromRoom = roomsByKey.get(constraint.from);
    const toRoom = roomsByKey.get(constraint.to);
    const dx = Math.sign(to.x - from.x);
    const dy = Math.sign(to.y - from.y);
    const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
    if (length <= 1) continue;
    const points = [];
    for (let step = 1; step < length; step += 1) {
      const x = from.x + dx * step;
      const y = from.y + dy * step;
      points.push({
        key: `corridor:${constraint.from}:${constraint.direction}:${step}`,
        x,
        y,
        title: chooseCorridorTitle(fromRoom, toRoom),
        areaFile: fromRoom?.areaFile || toRoom?.areaFile || ""
      });
    }
    corridors.push({
      from: constraint.from,
      to: constraint.to,
      direction: constraint.direction,
      source: constraint.source,
      title: chooseCorridorTitle(fromRoom, toRoom),
      areaFile: fromRoom?.areaFile || toRoom?.areaFile || "",
      z: positions.get(constraint.from)?.z ?? 0,
      points
    });
  }
  return corridors;
}

function chooseCorridorTitle(fromRoom, toRoom) {
  if (fromRoom?.title && fromRoom.title === toRoom?.title) return fromRoom.title;
  return toRoom?.title || fromRoom?.title || "";
}

function getConstraintPriority(room, target, direction, source) {
  if (direction === "u" || direction === "d") {
    if (target.coord.z === room.coord.z + DIRECTION_OFFSETS[direction].z) return SOURCE_PRIORITIES.vertical;
    return null;
  }
  if (target.coord.z !== room.coord.z) return null;
  if (source === "coord+direction") return SOURCE_PRIORITIES["coord+direction"];
  if (source === "sparse-axis") return SOURCE_PRIORITIES["sparse-axis"];
  if (!source.startsWith("script:") && !source.startsWith("script-reverse:")) return null;
  if (!isSafeScriptConstraint(room, target, direction)) return null;
  return target.links?.[OPPOSITE_DIRECTIONS[direction]] === room.key
    ? SOURCE_PRIORITIES["script-reciprocal"]
    : SOURCE_PRIORITIES.script;
}

function isSafeScriptConstraint(room, target, direction) {
  if (!HORIZONTAL_DIRECTIONS.has(direction)) return false;
  const opposite = OPPOSITE_DIRECTIONS[direction];
  if (!(room.visibleExits || []).includes(direction)) return false;
  if (!(target.visibleExits || []).includes(opposite)) return false;

  const dx = target.coord.x - room.coord.x;
  const dy = target.coord.y - room.coord.y;
  const distance = Math.abs(dx) + Math.abs(dy);
  if (distance > 10) return false;
  if (direction === "n") return dy < 0;
  if (direction === "s") return dy > 0;
  if (direction === "e") return dx > 0;
  if (direction === "w") return dx < 0;
  return false;
}

function makeConstraintKey(constraint) {
  if (constraint.from < constraint.to) {
    return `${constraint.from}|${constraint.to}|${constraint.dx}|${constraint.dy}|${constraint.dz || 0}`;
  }
  return `${constraint.to}|${constraint.from}|${-constraint.dx}|${-constraint.dy}|${-(constraint.dz || 0)}`;
}

function compareConstraints(left, right) {
  return left.priority - right.priority
    || left.from.localeCompare(right.from)
    || left.to.localeCompare(right.to)
    || left.direction.localeCompare(right.direction);
}

function placeRooms(rooms, constraints) {
  const roomsByKey = new Map(rooms.map((room) => [room.key, room]));
  const constraintsByRoom = buildConstraintAdjacency(constraints);
  const relativePositions = new Map();
  const conflicts = [];
  const components = [];
  const sortedRooms = [...rooms].sort((left, right) =>
    left.coord.z - right.coord.z
    || left.areaFile.localeCompare(right.areaFile)
    || left.coord.y - right.coord.y
    || left.coord.x - right.coord.x
    || left.key.localeCompare(right.key)
  );

  for (const room of sortedRooms) {
    if (relativePositions.has(room.key)) continue;
    const component = [];
    const occupied = new Map();
    const queue = [room.key];
    relativePositions.set(room.key, { x: 0, y: 0, z: room.coord.z });
    occupied.set(makePositionKey(0, 0, room.coord.z), room.key);

    while (queue.length) {
      const key = queue.shift();
      const base = relativePositions.get(key);
      component.push(key);
      for (const edge of constraintsByRoom.get(key) || []) {
        const expected = { x: base.x + edge.dx, y: base.y + edge.dy, z: base.z + edge.dz };
        const current = relativePositions.get(edge.key);
        if (current) {
          if (current.x !== expected.x || current.y !== expected.y || current.z !== expected.z) {
            conflicts.push(makeConflict(edge.constraint, edge.key, current, expected, "position-conflict"));
          }
          continue;
        }

        const occupiedBy = occupied.get(makePositionKey(expected.x, expected.y, expected.z));
        if (occupiedBy && occupiedBy !== edge.key) {
          conflicts.push(makeConflict(edge.constraint, edge.key, { occupiedBy }, expected, "occupied-position"));
          continue;
        }

        relativePositions.set(edge.key, expected);
        occupied.set(makePositionKey(expected.x, expected.y, expected.z), edge.key);
        queue.push(edge.key);
      }
    }
    components.push(component);
  }

  const packed = packRoomComponents(components, relativePositions, roomsByKey);
  return {
    positions: packed.positions,
    componentByRoom: packed.componentByRoom,
    conflicts
  };
}

function buildConstraintAdjacency(constraints) {
  const adjacency = new Map();
  for (const constraint of constraints) {
    if (!adjacency.has(constraint.from)) adjacency.set(constraint.from, []);
    if (!adjacency.has(constraint.to)) adjacency.set(constraint.to, []);
    adjacency.get(constraint.from).push({
      key: constraint.to,
      dx: constraint.dx,
      dy: constraint.dy,
      dz: constraint.dz || 0,
      constraint
    });
    adjacency.get(constraint.to).push({
      key: constraint.from,
      dx: -constraint.dx,
      dy: -constraint.dy,
      dz: -(constraint.dz || 0),
      constraint
    });
  }
  for (const edges of adjacency.values()) {
    edges.sort((left, right) => compareConstraints(left.constraint, right.constraint));
  }
  return adjacency;
}

function makeConflict(constraint, map, current, expected, reason) {
  return {
    room: map,
    current,
    expected,
    reason,
    constraint
  };
}

function packRoomComponents(components, relativePositions, roomsByKey) {
  const summaries = components.map((rooms) => {
    const bounds = getRoomComponentBounds(rooms, relativePositions);
    const first = roomsByKey.get(rooms[0]);
    return {
      rooms,
      bounds,
      width: bounds.maxX - bounds.minX + 1,
      height: bounds.maxY - bounds.minY + 1,
      z: first?.coord.z || 0
    };
  }).sort((left, right) =>
    left.z - right.z
    || right.rooms.length - left.rooms.length
    || right.width * right.height - left.width * left.height
    || left.rooms[0].localeCompare(right.rooms[0])
  );

  const byZ = new Map();
  for (const summary of summaries) {
    if (!byZ.has(summary.z)) byZ.set(summary.z, []);
    byZ.get(summary.z).push(summary);
  }

  const positions = new Map();
  const componentByRoom = new Map();
  const occupied = new Set();
  let componentIndex = 0;
  for (const [, zComponents] of byZ) {
    const columns = Math.max(1, Math.ceil(Math.sqrt(zComponents.length || 1)));
    const columnWidths = Array(columns).fill(0);
    const columnHeights = Array(columns).fill(0);
    const gap = 8;

    for (const component of zComponents) {
      let column = 0;
      for (let index = 1; index < columns; index += 1) {
        if (columnHeights[index] < columnHeights[column]) column = index;
      }
      const offsetX = columnWidths.slice(0, column).reduce((sum, width) => sum + width + gap, 0) - component.bounds.minX;
      let offsetY = columnHeights[column] - component.bounds.minY;
      while (componentCollides(component.rooms, relativePositions, occupied, offsetX, offsetY)) {
        offsetY += 1;
      }
      columnWidths[column] = Math.max(columnWidths[column], component.width);
      columnHeights[column] = Math.max(columnHeights[column], component.bounds.maxY + offsetY + gap);
      componentIndex += 1;
      const componentId = `c${componentIndex}`;
      for (const key of component.rooms) {
        const point = relativePositions.get(key);
        const packed = {
          x: point.x + offsetX,
          y: point.y + offsetY,
          z: point.z
        };
        positions.set(key, packed);
        occupied.add(makePositionKey(packed.x, packed.y, packed.z));
        componentByRoom.set(key, componentId);
      }
    }
  }

  return { positions, componentByRoom };
}

function componentCollides(component, positions, occupied, offsetX, offsetY) {
  return component.some((key) => {
    const point = positions.get(key);
    return occupied.has(makePositionKey(point.x + offsetX, point.y + offsetY, point.z));
  });
}

function getRoomComponentBounds(component, positions) {
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity
  };
  for (const key of component) {
    const point = positions.get(key);
    bounds.minX = Math.min(bounds.minX, point.x);
    bounds.maxX = Math.max(bounds.maxX, point.x);
    bounds.minY = Math.min(bounds.minY, point.y);
    bounds.maxY = Math.max(bounds.maxY, point.y);
  }
  return bounds;
}

function buildLocalMaps(rooms, layout) {
  const maps = new Map();
  for (const room of rooms) {
    const key = makeLocalMapKey(room);
    const point = layout.positions.get(room.key) || { x: room.coord.x, y: room.coord.y };
    if (!maps.has(key)) {
      maps.set(key, {
        key,
        areaFile: room.areaFile,
        z: room.coord.z,
        rooms: [],
        componentIds: new Set(),
        bounds: {
          minX: point.x,
          maxX: point.x,
          minY: point.y,
          maxY: point.y
        }
      });
    }
    const map = maps.get(key);
    map.rooms.push(room.key);
    map.componentIds.add(layout.componentByRoom.get(room.key) || "");
    map.bounds.minX = Math.min(map.bounds.minX, point.x);
    map.bounds.maxX = Math.max(map.bounds.maxX, point.x);
    map.bounds.minY = Math.min(map.bounds.minY, point.y);
    map.bounds.maxY = Math.max(map.bounds.maxY, point.y);
  }

  return [...maps.values()].map((map) => {
    const componentIds = [...map.componentIds].filter(Boolean).sort();
    return {
      key: map.key,
      areaFile: map.areaFile,
      z: map.z,
      rooms: map.rooms,
      bounds: map.bounds,
      roomCount: map.rooms.length,
      width: map.bounds.maxX - map.bounds.minX + 1,
      height: map.bounds.maxY - map.bounds.minY + 1,
      componentId: componentIds[0] || "",
      componentIds,
      conflicts: layout.conflicts.filter((conflict) => map.rooms.includes(conflict.room))
    };
  });
}

function buildAtlasZLayers(localMaps, rooms) {
  const byZ = new Map();
  for (const room of rooms) {
    const z = room.atlas.z;
    if (!byZ.has(z)) {
      byZ.set(z, {
        z,
        roomCount: 0,
        localMapCount: 0,
        componentCount: 0,
        bounds: {
          minX: room.atlas.x,
          maxX: room.atlas.x,
          minY: room.atlas.y,
          maxY: room.atlas.y
        }
      });
    }
    const layer = byZ.get(z);
    layer.roomCount += 1;
    layer.bounds.minX = Math.min(layer.bounds.minX, room.atlas.x);
    layer.bounds.maxX = Math.max(layer.bounds.maxX, room.atlas.x);
    layer.bounds.minY = Math.min(layer.bounds.minY, room.atlas.y);
    layer.bounds.maxY = Math.max(layer.bounds.maxY, room.atlas.y);
  }

  for (const [z, layer] of byZ) {
    const maps = localMaps.filter((map) => map.z === z);
    layer.localMapCount = maps.length;
    layer.componentCount = new Set(maps.flatMap((map) => map.componentIds || [map.componentId])).size;
    layer.width = layer.bounds.maxX - layer.bounds.minX + 1;
    layer.height = layer.bounds.maxY - layer.bounds.minY + 1;
  }

  return [...byZ.values()].sort((left, right) => left.z - right.z);
}

function collectWarnings(layout) {
  const warnings = [];
  if (layout.conflicts.length) warnings.push(`${layout.conflicts.length} placement constraints skipped`);
  return warnings;
}

function makePositionKey(x, y, z = 0) {
  return `${x},${y},${z}`;
}

function makeLocalMapKey(room) {
  return `${room.areaFile}|z:${room.coord.z}`;
}

function isCliEntry() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}
