import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildAtlas } from "../scripts/build-world-atlas.mjs";

const atlasSource = await readFile(new URL("../scripts/build-world-atlas.mjs", import.meta.url), "utf8");

test("atlas output is marked with the application version", () => {
  assert.match(atlasSource, /import packageJson from "\.\.\/package\.json" with \{ type: "json" \};/);
  assert.match(atlasSource, /appVersion: packageJson\.version/);
});

test("atlas preserves sparse same-axis visual distance and adds corridor cells", () => {
  const atlas = buildAtlas({
    rooms: [
      room("road.are:290,340,13", { x: 290, y: 340, z: 13 }, {
        exits: ["s"],
        visibleExits: ["s"],
        links: { s: "road.are:290,357,13" },
        linkSources: { s: "sparse-axis" }
      }),
      room("road.are:290,357,13", { x: 290, y: 357, z: 13 }, {
        exits: ["n", "s"],
        visibleExits: ["n", "s"],
        links: { n: "road.are:290,340,13", s: "road.are:290,364,13" },
        linkSources: { n: "sparse-axis", s: "sparse-axis" }
      }),
      room("road.are:290,364,13", { x: 290, y: 364, z: 13 }, {
        exits: ["n"],
        visibleExits: ["n"],
        links: { n: "road.are:290,357,13" },
        linkSources: { n: "sparse-axis" }
      })
    ]
  });

  assert.deepEqual(delta(atlas, "road.are:290,340,13", "road.are:290,357,13"), { dx: 0, dy: 17 });
  assert.deepEqual(delta(atlas, "road.are:290,357,13", "road.are:290,364,13"), { dx: 0, dy: 7 });
  assert.equal(atlas.corridors.reduce((sum, corridor) => sum + corridor.points.length, 0), 22);
  assert.equal(atlas.corridors[0].points[0].key, "corridor:road.are:290,340,13:s:1");
  assert.equal(atlas.corridors[0].points[0].title, "Room");
  assert.equal(atlas.corridors[0].points[0].areaFile, "road.are");
});

test("atlas glues safe horizontal script links between local maps", () => {
  const atlas = buildAtlas({
    rooms: [
      room("road.are:290,364,13", { x: 290, y: 364, z: 13 }, {
        exits: ["e"],
        visibleExits: ["e"],
        links: { e: "village.are:291,364,13" },
        linkSources: { e: "script:village.are" }
      }),
      room("village.are:291,364,13", { x: 291, y: 364, z: 13 }, {
        exits: ["w"],
        visibleExits: ["w"],
        links: { w: "road.are:290,364,13" },
        linkSources: { w: "script:road.are" }
      })
    ]
  });

  assert.deepEqual(delta(atlas, "road.are:290,364,13", "village.are:291,364,13"), { dx: 1, dy: 0 });
  assert.equal(atlasRoom(atlas, "road.are:290,364,13").atlas.componentId, atlasRoom(atlas, "village.are:291,364,13").atlas.componentId);
});

test("atlas keeps unsafe script links as movement links without physical glue", () => {
  const atlas = buildAtlas({
    rooms: [
      room("portal-a.are:0,0,0", { x: 0, y: 0, z: 0 }, {
        exits: ["e"],
        visibleExits: ["e"],
        links: { e: "portal-b.are:50,0,0" },
        linkSources: { e: "script:portal-b.are" }
      }),
      room("portal-b.are:50,0,0", { x: 50, y: 0, z: 0 }, {
        exits: ["w"],
        visibleExits: ["w"],
        links: { w: "portal-a.are:0,0,0" },
        linkSources: { w: "script:portal-a.are" }
      }),
      room("stairs-a.are:1,0,0", { x: 1, y: 0, z: 0 }, {
        exits: ["u"],
        visibleExits: ["u"],
        links: { u: "stairs-b.are:1,0,1" },
        linkSources: { u: "script:stairs-b.are" }
      }),
      room("stairs-b.are:1,0,1", { x: 1, y: 0, z: 1 }, {
        exits: ["d"],
        visibleExits: ["d"],
        links: { d: "stairs-a.are:1,0,0" },
        linkSources: { d: "script:stairs-a.are" }
      })
    ]
  });

  assert.equal(atlasRoom(atlas, "portal-a.are:0,0,0").links.e, "portal-b.are:50,0,0");
  assert.notEqual(atlasRoom(atlas, "portal-a.are:0,0,0").atlas.componentId, atlasRoom(atlas, "portal-b.are:50,0,0").atlas.componentId);
  assert.equal(atlasRoom(atlas, "stairs-a.are:1,0,0").atlas.componentId, atlasRoom(atlas, "stairs-b.are:1,0,1").atlas.componentId);
  assert.deepEqual(delta(atlas, "stairs-a.are:1,0,0", "stairs-b.are:1,0,1"), { dx: 0, dy: 0 });
});

test("atlas aligns vertical links on the same visual coordinates", () => {
  const atlas = buildAtlas({
    rooms: [
      room("town.are:10,10,13", { x: 10, y: 10, z: 13 }, {
        exits: ["e", "u"],
        visibleExits: ["e", "u"],
        links: { e: "town.are:11,10,13", u: "town.are:10,10,14" },
        linkSources: { e: "coord+direction", u: "coord+direction" }
      }),
      room("town.are:11,10,13", { x: 11, y: 10, z: 13 }, {
        exits: ["w"],
        visibleExits: ["w"],
        links: { w: "town.are:10,10,13" },
        linkSources: { w: "coord+direction" }
      }),
      room("town.are:10,10,14", { x: 10, y: 10, z: 14 }, {
        exits: ["d", "n"],
        visibleExits: ["d", "n"],
        links: { d: "town.are:10,10,13", n: "town.are:10,9,14" },
        linkSources: { d: "coord+direction", n: "coord+direction" }
      }),
      room("town.are:10,9,14", { x: 10, y: 9, z: 14 }, {
        exits: ["s"],
        visibleExits: ["s"],
        links: { s: "town.are:10,10,14" },
        linkSources: { s: "coord+direction" }
      })
    ]
  });

  assert.deepEqual(delta(atlas, "town.are:10,10,13", "town.are:10,10,14"), { dx: 0, dy: 0 });
  assert.equal(atlasRoom(atlas, "town.are:10,10,13").atlas.z, 13);
  assert.equal(atlasRoom(atlas, "town.are:10,10,14").atlas.z, 14);
});

test("atlas skips conflicting placement constraints without duplicate coordinates", () => {
  const atlas = buildAtlas({
    rooms: [
      room("conflict.are:0,0,0", { x: 0, y: 0, z: 0 }, {
        exits: ["e", "s"],
        visibleExits: ["e", "s"],
        links: { e: "conflict.are:1,0,0", s: "conflict.are:0,1,0" },
        linkSources: { e: "coord+direction", s: "coord+direction" }
      }),
      room("conflict.are:1,0,0", { x: 1, y: 0, z: 0 }, {
        exits: [],
        visibleExits: [],
        links: {},
        linkSources: {}
      }),
      room("conflict.are:0,1,0", { x: 0, y: 1, z: 0 }, {
        exits: ["n"],
        visibleExits: ["n"],
        links: { n: "conflict.are:2,0,0" },
        linkSources: { n: "coord+direction" }
      }),
      room("conflict.are:2,0,0", { x: 2, y: 0, z: 0 }, {
        exits: [],
        visibleExits: [],
        links: {},
        linkSources: {}
      })
    ]
  });

  assert.equal(hasDuplicateAtlasCoords(atlas), false);
  assert.match(atlas.warnings.join("\n"), /placement constraints skipped/);
});

test("atlas keeps multi-level components from colliding with later z-layer maps", () => {
  const atlas = buildAtlas({
    rooms: [
      room("stairs.are:0,0,0", { x: 0, y: 0, z: 0 }, {
        exits: ["u"],
        visibleExits: ["u"],
        links: { u: "stairs.are:0,0,1" },
        linkSources: { u: "coord+direction" }
      }),
      room("stairs.are:0,0,1", { x: 0, y: 0, z: 1 }, {
        exits: ["d"],
        visibleExits: ["d"],
        links: { d: "stairs.are:0,0,0" },
        linkSources: { d: "coord+direction" }
      }),
      room("other.are:0,0,1", { x: 0, y: 0, z: 1 }, {
        exits: [],
        visibleExits: [],
        links: {},
        linkSources: {}
      })
    ]
  });

  assert.equal(hasDuplicateAtlasCoords(atlas), false);
  assert.notDeepEqual(
    atlasRoom(atlas, "stairs.are:0,0,1").atlas,
    atlasRoom(atlas, "other.are:0,0,1").atlas
  );
});

function room(key, coord, values = {}) {
  return {
    key,
    areaFile: key.split(":")[0],
    coord,
    title: values.title || "Room",
    exits: values.exits || [],
    visibleExits: values.visibleExits || [],
    hiddenExits: values.hiddenExits || [],
    links: values.links || {},
    linkSources: values.linkSources || {}
  };
}

function atlasRoom(atlas, key) {
  return atlas.rooms.find((item) => item.key === key);
}

function delta(atlas, from, to) {
  const left = atlasRoom(atlas, from);
  const right = atlasRoom(atlas, to);
  return {
    dx: right.atlas.x - left.atlas.x,
    dy: right.atlas.y - left.atlas.y
  };
}

function hasDuplicateAtlasCoords(atlas) {
  const seen = new Set();
  for (const item of atlas.rooms) {
    const key = `${item.atlas.z},${item.atlas.x},${item.atlas.y}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}
