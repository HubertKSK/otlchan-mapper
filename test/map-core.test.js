import test from "node:test";
import assert from "node:assert/strict";
import {
  applyRoomObservation,
  createRoom,
  createEmptyProject,
  extractExits,
  extractSpecialExits,
  isBlockedLine,
  move,
  normalizeDirection,
  parseCoordinateLocationTitle,
  parseMovementCommand,
  parseRoomText
} from "../public/map-core.js";

test("normalizes Otchlan movement commands", () => {
  assert.equal(normalizeDirection("polnoc"), "n");
  assert.equal(normalizeDirection("północ"), "n");
  assert.equal(normalizeDirection("wschod"), "e");
  assert.equal(normalizeDirection("góra"), "u");
  assert.equal(normalizeDirection("dol"), "d");
});

test("parses counted movement commands", () => {
  assert.deepEqual(parseMovementCommand("10e"), { direction: "e", count: 10 });
  assert.deepEqual(parseMovementCommand("3west"), { direction: "w", count: 3 });
  assert.deepEqual(parseMovementCommand("<18/18 100% 18/112 66/96 50g 37%>5n"), { direction: "n", count: 5 });
  assert.equal(parseMovementCommand("5 n"), null);
  assert.equal(parseMovementCommand("Idziesz na polnoc."), null);
  assert.equal(parseMovementCommand("Sprawdzanie plikow...Ok"), null);
  assert.deepEqual(parseMovementCommand("> 2północ"), { direction: "n", count: 2 });
});

test("parses coordinate location titles from lokum-enhanced output", () => {
  assert.deepEqual(parseCoordinateLocationTitle("Arena = (281,352,13) w arena.are"), {
    title: "Arena",
    areaFile: "arena.are",
    coord: { x: 281, y: 352, z: 13 },
    worldKey: "arena.are:281,352,13"
  });
  assert.equal(parseCoordinateLocationTitle("Arena"), null);
});

test("does not treat object commands as movement", () => {
  assert.equal(parseMovementCommand("wez por"), null);
  assert.equal(parseMovementCommand("wez n"), null);
  assert.equal(parseMovementCommand("wez s"), null);
  assert.equal(parseMovementCommand("wez 2n"), null);
  assert.equal(parseMovementCommand("> wez n"), null);
  assert.equal(parseMovementCommand("<18/18 100% 18/112 66/96 50g 37%>wez n"), null);
  assert.equal(parseMovementCommand("p"), null);
});

test("movement without known target does not create rooms", () => {
  const project = createEmptyProject();
  const result = move(project, "e");
  assert.equal(result.status, "missing-target");
  assert.equal(project.rooms.length, 1);
  assert.equal(project.exits.length, 0);
});

test("blocked movement does not create a room", () => {
  const project = createEmptyProject();
  const result = move(project, "n", { blocked: true });
  assert.equal(result.status, "blocked");
  assert.equal(project.rooms.length, 1);
  assert.equal(project.exits[0].blocked, true);
});

test("detects blocked movement lines", () => {
  assert.equal(isBlockedLine("Nie możesz tam iść."), true);
  assert.equal(isBlockedLine("Tam niestety nie pójdziesz."), true);
  assert.equal(isBlockedLine("Nie możesz tam iść."), true);
  assert.equal(isBlockedLine("Tam niestety nie pójdziesz."), true);
  assert.equal(isBlockedLine("Tam niestety nie pojdziesz."), true);
  assert.equal(isBlockedLine("Za bardzo jesteś zmęczony."), true);
  assert.equal(isBlockedLine("Za bardzo jestes zmeczony."), true);
  assert.equal(isBlockedLine("Uderzasz w sciane."), true);
  assert.equal(isBlockedLine("sciana stoi pare zapasowych kol."), false);
  assert.equal(isBlockedLine("Wysoki brzeg jest podniesiony wzgledem rzeki, wiec nie da sie tam pojsc."), false);
  assert.equal(isBlockedLine("Idziesz na północ."), false);
});

test("treats braced exits as normal exits with special marker", () => {
  const text = "Wyjścia: east west {north} south";
  assert.deepEqual(extractExits(text).sort(), ["e", "n", "s", "w"]);
  assert.deepEqual(extractSpecialExits(text), ["n"]);
});

test("extracts exits from exits line instead of description words", () => {
  const observation = parseRoomText("Droga\nNa poludniu widzisz mur.\nWyjscia: east west");
  assert.deepEqual(observation.exitsSeen.sort(), ["e", "w"]);
  assert.equal(observation.description, "Na poludniu widzisz mur.");
});

test("room observations produce stable hashes and ambiguous matches", () => {
  const project = createEmptyProject();
  const observation = parseRoomText("Rynek\nKamienny plac.\nWyjscia: polnoc, wschod");
  applyRoomObservation(project, observation, "current");
  createRoom(project, {
    title: observation.title,
    description: observation.description,
    descriptionHash: observation.descriptionHash,
    exitsSeen: observation.exitsSeen
  });
  project.currentRoomId = "r1";
  const ambiguous = applyRoomObservation(project, observation, "current");
  assert.equal(ambiguous.status, "ambiguous");
  assert.equal(ambiguous.matches.length, 2);
});
