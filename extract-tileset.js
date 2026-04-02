import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const CONFIG = {
  input: path.resolve("./rougelike_alpha_tileset.png"),
  output: path.resolve("./tilesets.json"),
  tileWidth: 16,
  tileHeight: 16,

  // Ile najczęstszych kolorów traktować jako kandydatów na tło.
  dominantBgColorCount: 6,

  // Tolerancja podobieństwa koloru do tła.
  colorDistanceThreshold: 28,

  // Minimalny udział "nietła" w tile, żeby uznać go za niepusty.
  nonBgPixelRatioThreshold: 0.08,

  // Minimalna liczba niepustych tili w kolumnie/wierszu, żeby uznać ją za używaną.
  minOccupiedTilesPerColumn: 2,
  minOccupiedTilesPerRow: 2,

  // Gdy tyle pustych kolumn z rzędu wystąpi, rozdziel światy.
  minEmptyColumnsGapBetweenWorlds: 2,

  // Gdy tyle pustych wierszy z rzędu wystąpi, rozdziel sekcje.
  minEmptyRowsGapBetweenSections: 1,

  // Nazwy światów w kolejności od lewej do prawej.
  worldNames: [
    "fantasy",
    "ancient_greece",
    "space",
    "post_apocalypse",
    "prehistoric",
    "world_wars",
    "pirates",
    "ancient_egypt",
    "japan",
    "cyber_punk"
  ],

  // Nazwy sekcji w kolejności od góry do dołu.
  sectionNames: [
    "trees",
    "grass",
    "plants",
    "bushes",
    "rocks",
    "ground",
    "roads",
    "rails",
    "liquids",
    "mountains",
    "farms",
    "buildings",
    "cities",
    "walls",
    "doors",
    "props",
    "animals",
    "monsters",
    "heroes",
    "weapons",
    "apparel",
    "items",
    "resources",
    "tools",
    "food",
    "ui",
    "spells"
  ]
};

function colorKey(r, g, b) {
  return `${r},${g},${b}`;
}

function parseColorKey(key) {
  const [r, g, b] = key.split(",").map(Number);
  return { r, g, b };
}

function colorDistance(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function getPixel(data, width, x, y) {
  const idx = (y * width + x) * 4;
  return {
    r: data[idx],
    g: data[idx + 1],
    b: data[idx + 2],
    a: data[idx + 3]
  };
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function sampleDominantBackgroundColors(data, width, height, count) {
  const freq = new Map();

  // Bierzemy próbki co kilka pikseli, żeby było szybciej.
  // Dodatkowo lekko kwantyzujemy kolory, żeby podobne odcienie się grupowały.
  const step = 4;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const { r, g, b, a } = getPixel(data, width, x, y);
      if (a < 10) continue;

      const qr = Math.round(r / 8) * 8;
      const qg = Math.round(g / 8) * 8;
      const qb = Math.round(b / 8) * 8;

      const key = colorKey(qr, qg, qb);
      freq.set(key, (freq.get(key) || 0) + 1);
    }
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([key]) => parseColorKey(key));
}

function isBackgroundPixel(px, bgColors, threshold) {
  if (px.a < 10) return true;

  for (const bg of bgColors) {
    if (colorDistance(px, bg) <= threshold) {
      return true;
    }
  }

  return false;
}

function analyzeTile(data, imgWidth, tileX, tileY, tileWidth, tileHeight, bgColors, threshold) {
  let nonBgPixels = 0;
  let totalPixels = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const startX = tileX * tileWidth;
  const startY = tileY * tileHeight;

  for (let py = 0; py < tileHeight; py++) {
    for (let px = 0; px < tileWidth; px++) {
      const x = startX + px;
      const y = startY + py;
      const pixel = getPixel(data, imgWidth, x, y);
      totalPixels++;

      if (!isBackgroundPixel(pixel, bgColors, threshold)) {
        nonBgPixels++;
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
    }
  }

  const nonBgRatio = totalPixels === 0 ? 0 : nonBgPixels / totalPixels;

  return {
    nonBgPixels,
    nonBgRatio,
    empty: true,
    bounds: nonBgPixels
      ? {
          x: startX + minX,
          y: startY + minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1
        }
      : null
  };
}

function groupRuns(indices, maxGap = 0) {
  if (!indices.length) return [];

  const runs = [];
  let start = indices[0];
  let prev = indices[0];

  for (let i = 1; i < indices.length; i++) {
    const current = indices[i];
    const gap = current - prev - 1;

    if (gap > maxGap) {
      runs.push({ start, end: prev });
      start = current;
    }

    prev = current;
  }

  runs.push({ start, end: prev });
  return runs;
}

function buildId(sectionName, index) {
  const base = String(sectionName || "tile")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `${base}_${index}`;
}

async function main() {
  const image = sharp(CONFIG.input);
  const meta = await image.metadata();

  if (!meta.width || !meta.height) {
    throw new Error("Nie udało się odczytać wymiarów obrazka.");
  }

  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const imgWidth = info.width;
  const imgHeight = info.height;

  const tilesX = Math.floor(imgWidth / CONFIG.tileWidth);
  const tilesY = Math.floor(imgHeight / CONFIG.tileHeight);

  const bgColors = sampleDominantBackgroundColors(
    data,
    imgWidth,
    imgHeight,
    CONFIG.dominantBgColorCount
  );

  console.log("Wykryte kolory tła:", bgColors);

  // Analiza wszystkich tili
  const tileGrid = Array.from({ length: tilesY }, () => Array(tilesX).fill(null));

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const analysis = analyzeTile(
        data,
        imgWidth,
        tx,
        ty,
        CONFIG.tileWidth,
        CONFIG.tileHeight,
        bgColors,
        CONFIG.colorDistanceThreshold
      );

      analysis.empty = analysis.nonBgRatio < CONFIG.nonBgPixelRatioThreshold;
      tileGrid[ty][tx] = analysis;
    }
  }

  // Które kolumny zawierają sensowne dane
  const occupiedColumns = [];
  for (let tx = 0; tx < tilesX; tx++) {
    let count = 0;
    for (let ty = 0; ty < tilesY; ty++) {
      if (!tileGrid[ty][tx].empty) count++;
    }
    if (count >= CONFIG.minOccupiedTilesPerColumn) {
      occupiedColumns.push(tx);
    }
  }

  // Które wiersze zawierają sensowne dane
  const occupiedRows = [];
  for (let ty = 0; ty < tilesY; ty++) {
    let count = 0;
    for (let tx = 0; tx < tilesX; tx++) {
      if (!tileGrid[ty][tx].empty) count++;
    }
    if (count >= CONFIG.minOccupiedTilesPerRow) {
      occupiedRows.push(ty);
    }
  }

  // Grupy światów po kolumnach
  const worldRuns = groupRuns(
    occupiedColumns,
    CONFIG.minEmptyColumnsGapBetweenWorlds - 1
  );

  // Globalne sekcje po wierszach
  const sectionRuns = groupRuns(
    occupiedRows,
    CONFIG.minEmptyRowsGapBetweenSections - 1
  );

  const sectionsMeta = sectionRuns.map((run, i) => {
    const fallbackName = `section_${String(i + 1).padStart(2, "0")}`;
    return {
      name: CONFIG.sectionNames[i] || fallbackName,
      startRow: run.start,
      endRow: run.end
    };
  });

  const tilesets = worldRuns.map((worldRun, worldIndex) => {
    const worldName =
      CONFIG.worldNames[worldIndex] || `world_${String(worldIndex + 1).padStart(2, "0")}`;

    const world = {
      name: worldName,
      offsetX: worldRun.start * CONFIG.tileWidth,
      offsetY: 0,
      width: (worldRun.end - worldRun.start + 1) * CONFIG.tileWidth,
      sections: {}
    };

    for (const section of sectionsMeta) {
      const items = [];
      let itemCounter = 1;

      for (let ty = section.startRow; ty <= section.endRow; ty++) {
        for (let tx = worldRun.start; tx <= worldRun.end; tx++) {
          const tile = tileGrid[ty][tx];
          if (tile.empty) continue;

          items.push({
            id: buildId(section.name, itemCounter++),
            x: tx * CONFIG.tileWidth,
            y: ty * CONFIG.tileHeight,
            tileX: tx,
            tileY: ty,
            width: CONFIG.tileWidth,
            height: CONFIG.tileHeight,
            ...(tile.bounds ? { contentBounds: tile.bounds } : {})
          });
        }
      }

      if (items.length) {
        world.sections[section.name] = items;
      }
    }

    return world;
  });

  const result = {
    meta: {
      image: path.basename(CONFIG.input),
      imageWidth: imgWidth,
      imageHeight: imgHeight,
      tileWidth: CONFIG.tileWidth,
      tileHeight: CONFIG.tileHeight,
      backgroundColors: bgColors
    },
    tilesets
  };

  fs.writeFileSync(CONFIG.output, JSON.stringify(result, null, 2), "utf8");

  console.log(`Zapisano JSON do: ${CONFIG.output}`);
  console.log(`Wykryto światów: ${tilesets.length}`);
  console.log(`Wykryto sekcji globalnych: ${sectionsMeta.length}`);
}

main().catch((err) => {
  console.error("Błąd:", err);
  process.exit(1);
});