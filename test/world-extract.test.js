import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { linkWorldRooms, parseAreaRooms, parseSkillSymbolsFromText } from "../scripts/extract-world.mjs";

const extractorSource = await readFile(new URL("../scripts/extract-world.mjs", import.meta.url), "utf8");

test("world extraction defaults to the standard Otchlan 1.3 install directory", () => {
  assert.match(extractorSource, /import packageJson from "\.\.\/package\.json" with \{ type: "json" \};/);
  assert.match(extractorSource, /const DEFAULT_OTCHLAN_DIR = "C:\\\\Program Files \(x86\)\\\\Otchlan 1\.3";/);
  assert.match(extractorSource, /const DEFAULT_GAME_DIR = process\.env\.OTCHLAN_DIR \|\| DEFAULT_OTCHLAN_DIR;/);
  assert.match(extractorSource, /appVersion: packageJson\.version/);
});

test("extracts skill symbols from otchlan.exe text for effect name fallback", () => {
  const symbols = parseSkillSymbolsFromText(
    "UM_UKRYCIE:c=i66;\0UM_LASKA_BLYSKAWIC:c=i9B;\0UM_WYKRYCIE_UKRYCIA:c=i91;"
  );
  assert.deepEqual(symbols.filter((symbol) => [0x66, 0x9b, 0x91].includes(symbol.number)), [
    {
      number: 0x66,
      raw: "66",
      symbol: "UKRYCIE",
      name: "ukrycie"
    },
    {
      number: 0x91,
      raw: "91",
      symbol: "WYKRYCIE_UKRYCIA",
      name: "wykrycie ukrycia"
    },
    {
      number: 0x9b,
      raw: "9B",
      symbol: "LASKA_BLYSKAWIC",
      name: "laska blyskawic"
    }
  ]);
});

test("extracts rooms that reuse shared descriptions through %call templates", () => {
  const rooms = parseAreaRooms("traktes.are", [
    "(290,341,13)",
    "001100",
    "%call opis_1",
    "(290,342,13)",
    "001100",
    "%call opis_1",
    "opis_1",
    "Trakt",
    "Wyjścia: north south",
    "Idziesz traktem przez las."
  ]);

  assert.equal(rooms.length, 2);
  assert.deepEqual(rooms.map((room) => room.key), [
    "traktes.are:290,341,13",
    "traktes.are:290,342,13"
  ]);
  assert.equal(rooms[0].title, "Trakt");
  assert.deepEqual(rooms[0].visibleExits.sort(), ["n", "s"]);
  assert.equal(rooms[0].description, "Idziesz traktem przez las.");
});

test("expands %call templates used as room descriptions", () => {
  const rooms = parseAreaRooms("bagnamse.are", [
    "(320,262,13)",
    "111100S",
    "%;8;n;320;261;13;0;",
    "Bagno",
    "Wyjścia: north south east west",
    "%call opis_blab_7a",
    "opis_blab_7a",
    "Cienka warstwa mgły unosi się nad wodą.",
    "%c-20t"
  ]);

  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].key, "bagnamse.are:320,262,13");
  assert.equal(rooms[0].title, "Bagno");
  assert.deepEqual(rooms[0].visibleExits.sort(), ["e", "n", "s", "w"]);
  assert.equal(rooms[0].description, "Cienka warstwa mgły unosi się nad wodą.");
  assert.equal(rooms[0].description.includes("%call"), false);
});

test("extracts explicit coordinate scripted exits from %;8 directives", () => {
  const rooms = parseAreaRooms("bagnamse.are", [
    "(324,265,13)",
    "111100S",
    "Bagno",
    "Wyjscia: north south east west",
    "%;8;e;335;265;13;0;",
    "Czarna woda."
  ]);

  assert.equal(rooms.length, 1);
  assert.deepEqual(rooms[0].coordinateScriptedExits, [
    {
      direction: "e",
      coord: { x: 335, y: 265, z: 13 }
    }
  ]);
});

test("resolves vertical scripted exits on the target z level", () => {
  const rooms = linkWorldRooms([
    ...parseAreaRooms("surface.are", [
      "(10,10,13)",
      "000001{d:m:f}{d:s:f}",
      "Dziura",
      "Wyjscia: down",
      "%;1;under;d;0;0;0;"
    ]),
    ...parseAreaRooms("under.are", [
      "(10,10,12)",
      "000010{u:m:f}{u:s:f}",
      "Dno",
      "Wyjscia: up",
      "%;1;surface;u;0;0;0;"
    ])
  ]);

  assert.equal(
    rooms.find((room) => room.key === "surface.are:10,10,13")?.links.d,
    "under.are:10,10,12"
  );
  assert.equal(
    rooms.find((room) => room.key === "under.are:10,10,12")?.links.u,
    "surface.are:10,10,13"
  );
});
