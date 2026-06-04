export function normalizeVersionTag(version) {
  return String(version || "").trim().replace(/^v/i, "");
}

export function compareSemver(left, right) {
  const leftParts = parseSemverParts(left);
  const rightParts = parseSemverParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1;
    if (leftParts[index] < rightParts[index]) return -1;
  }
  return 0;
}

function parseSemverParts(version) {
  return normalizeVersionTag(version)
    .split(/[.-]/)
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10))
    .concat([0, 0, 0])
    .slice(0, 3)
    .map((part) => Number.isFinite(part) ? part : 0);
}
