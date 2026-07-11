// M3U Server-side Parser for dontmovie companion app
// Mirroring the exact clean-name grouping and regex classification from Tizen TV Svelte client

const s00e00Regex = /s(\d+)\s*e(\d+)/i;
const s00s00Regex = /s(\d+)\s*s(\d+)/i; // Handling S05S03 typo format
const tempWordEpRegex = /(?:temporada|temp|t|season)\s*(\d+)\s*(?:episodio|ep|e)\s*(\d+)/i;
const tempDashEpRegex = /\b(\d+)\x(\d+)\b/i;
const epSuffixRegex = /\b(?:episodio|ep|e)\s*[\.]?\s*(\d+)\b/i; // Added boundaries and dot
const tempSuffixRegex = /\b(?:temporada|temp|t|season|s)\s*[\.]?\s*(\d+)\b/i; // Added "s" and boundaries

function normalizeLogoUrl(url) {
  if (!url) return "";
  return url.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function extractAttr(line, attrName) {
  const match = line.match(new RegExp(`${attrName}="([^"]*)"`, 'i'));
  return match ? match[1].trim() : '';
}

function classifyType(url, category) {
  const lowercaseUrl = url.toLowerCase();
  const lowercaseCategory = (category || "").toLowerCase();

  // If group-title contains series/séries or url contains /series/ -> series
  if (lowercaseCategory.includes("série") || lowercaseCategory.includes("series") || lowercaseUrl.includes("/series/")) {
    return "series";
  }
  // If group-title contains movies/filmes or video formats -> movie
  if (
    lowercaseCategory.includes("filme") ||
    lowercaseCategory.includes("movie") ||
    lowercaseCategory.includes("cinema") ||
    lowercaseUrl.includes("/movie/") ||
    lowercaseUrl.endsWith(".mp4") ||
    lowercaseUrl.endsWith(".mkv") ||
    lowercaseUrl.endsWith(".avi")
  ) {
    return "movie";
  }
  // Otherwise -> live channel
  return "live";
}

function parseSeriesEpisode(title, category) {
  let name = title;
  let season = "1";
  let episode = 1;
  let episodeTitle = "";

  // 1. Check standard S01E02 format
  let match = name.match(s00e00Regex);
  if (match) {
    season = parseInt(match[1], 10).toString();
    episode = parseInt(match[2], 10);
    name = name.replace(s00e00Regex, "").trim();
  } else {
    // 1b. Check S01S02 typo format
    match = name.match(s00s00Regex);
    if (match) {
      season = parseInt(match[1], 10).toString();
      episode = parseInt(match[2], 10);
      name = name.replace(s00s00Regex, "").trim();
    } else {
      // 2. Check "Temporada 1 Ep 2" format
      match = name.match(tempWordEpRegex);
      if (match) {
        season = parseInt(match[1], 10).toString();
        episode = parseInt(match[2], 10);
        name = name.replace(tempWordEpRegex, "").trim();
      } else {
        // 3. Check "1x02" format
        match = name.match(tempDashEpRegex);
        if (match) {
          season = parseInt(match[1], 10).toString();
          episode = parseInt(match[2], 10);
          name = name.replace(tempDashEpRegex, "").trim();
        } else {
          // 4. Try parsing episode suffix alone (default to Season 1)
          match = name.match(epSuffixRegex);
          if (match) {
            episode = parseInt(match[1], 10);
            name = name.replace(epSuffixRegex, "").trim();
          }
          // Try parsing season suffix alone
          match = name.match(tempSuffixRegex);
          if (match) {
            season = parseInt(match[1], 10).toString();
            name = name.replace(tempSuffixRegex, "").trim();
          }
        }
      }
    }
  }

  // Final clean up of the title
  name = name
    .replace(/\s*[([{\s-]*\b(19\d\d|20\d\d)\b[)\]}\s-]*/g, "") // Remove years (e.g. 2020)
    .replace(/\s+-\s*$/, "") // Trailing dashes
    .trim();

  const parsedSeasonNum = parseInt(season, 10);
  if (!isNaN(parsedSeasonNum) && parsedSeasonNum > 20) {
    season = "Especiais";
  }

  episodeTitle = season === "Especiais"
    ? `${name} - Ep ${episode} (Especiais / Perdidos)`
    : `${name} - Temp ${season} Ep ${episode}`;

  return {
    seriesName: name,
    season,
    episode,
    episodeTitle
  };
}

export function parseM3uText(m3uText) {
  const lines = m3uText.split(/\r?\n/);
  
  let currentMeta = null;
  let moviesBuffer = "";
  
  let moviesCount = 0;
  let liveCount = 0;
  let seriesCount = 0;
  
  const seriesMap = new Map();
  const liveMap = new Map();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    if (trimmedLine.startsWith("#EXTINF:")) {
      const commaIndex = trimmedLine.lastIndexOf(',');
      const name = commaIndex !== -1 ? trimmedLine.substring(commaIndex + 1).trim() : 'Canal Sem Nome';
      
      const logo = extractAttr(trimmedLine, 'tvg-logo');
      const tvgId = extractAttr(trimmedLine, 'tvg-id');
      const category = extractAttr(trimmedLine, 'group-title') || 'Outros';

      currentMeta = {
        rawLine: trimmedLine,
        name,
        logo,
        tvgId,
        category
      };
    } else if (trimmedLine.startsWith("http://") || trimmedLine.startsWith("https://")) {
      if (currentMeta) {
        const type = classifyType(trimmedLine, currentMeta.category);

        if (type === "series") {
          const parsed = parseSeriesEpisode(currentMeta.name, currentMeta.category);
          const seriesName = parsed.seriesName;
          
          if (!seriesMap.has(seriesName)) {
            seriesMap.set(seriesName, {
              name: seriesName,
              logo: currentMeta.logo || "",
              category: currentMeta.category,
              seasons: {}
            });
          }
          
          const seriesObj = seriesMap.get(seriesName);
          if (!seriesObj.logo && currentMeta.logo) {
            seriesObj.logo = currentMeta.logo;
          }
          
          if (!seriesObj.seasons[parsed.season]) {
            seriesObj.seasons[parsed.season] = [];
          }
          
          seriesObj.seasons[parsed.season].push({
            episode: parsed.episode,
            name: parsed.episodeTitle,
            url: trimmedLine
          });
          seriesCount++;
        } else if (type === "movie") {
          moviesBuffer += currentMeta.rawLine + "\n" + trimmedLine + "\n";
          moviesCount++;
        } else {
          const liveCategory = currentMeta.category || 'Outros';
          if (!liveMap.has(liveCategory)) {
            liveMap.set(liveCategory, []);
          }
          liveMap.get(liveCategory).push({
            name: currentMeta.name,
            logo: currentMeta.logo || "",
            url: trimmedLine
          });
          liveCount++;
        }
        currentMeta = null;
      }
    }
  }

  // Helper to count total episodes
  function totalEpisodes(s) {
    return Object.values(s.seasons).reduce((acc, curr) => acc + curr.length, 0);
  }

  // Sort series entries by total episode count descending
  // This guarantees that main series items are processed first and duplicates are merged into them
  const seriesEntries = Array.from(seriesMap.values()).sort((a, b) => totalEpisodes(b) - totalEpisodes(a));
  const groupedSeriesMap = new Map();

  for (const series of seriesEntries) {
    let baseName = series.name
      .replace(/\s*[([{\s-]*\b(19\d\d|20\d\d)\b[)\]}\s-]*/g, "")
      .replace(/\s*[-:]?\s*\b(temporada|temp|t|season)\b\s*[\.]?\s*\d+/i, "")
      .replace(/\s*[-:]?\s*\bs\s*[\.]?\s*\d+/i, "")
      .replace(/\s*[-:]?\s*\d+\s*(?:ª|ª\s*|\s*)\b(temporada|temp|t|season)\b/i, "")
      .replace(/\s*[-:]?\s*\d+\s*(?:ª|ª\s*|\s*)\bs\b/i, "")
      .replace(/\s*[-:]?\s*\b(ep|e|episodio|cap|capitulo)\b\s*[\.]?\s*\d+/i, "") // Clean trailing episodes
      .replace(/\s*[-:]\s*\d+\s*$/g, "") // Clean trailing dash + numbers
      .replace(/\s*[-:]\s*$/g, "")
      .trim();

    if (!baseName) {
      baseName = series.name.trim();
    }

    let detectedSeason = null;
    const seasonMatch = series.name.match(/\b(?:temporada|temp|t|season)\b\s*[\.]?\s*(\d+)/i) || series.name.match(/\bs\s*[\.]?\s*(\d+)/i);
    if (seasonMatch) {
      detectedSeason = parseInt(seasonMatch[1], 10).toString();
    }

    let existingKey = null;
    for (const [existingName, existingSeries] of groupedSeriesMap.entries()) {
      const normLogo1 = normalizeLogoUrl(series.logo);
      const normLogo2 = normalizeLogoUrl(existingSeries.logo);
      const sameLogo = normLogo1 && normLogo2 && normLogo1 === normLogo2;
      const sameCategory = series.category === existingSeries.category;

      if (sameCategory) {
        const name1 = baseName.toLowerCase();
        const name2 = existingName.toLowerCase();
        const isPrefixMatch = (name1.startsWith(name2) || name2.startsWith(name1)) && Math.min(name1.length, name2.length) >= 6;

        if (sameLogo || isPrefixMatch) {
          existingKey = existingName;
          break;
        }
      }
    }

    if (existingKey) {
      const existingSeries = groupedSeriesMap.get(existingKey);
      const shorterName = baseName.length < existingSeries.name.length ? baseName : existingSeries.name;
      const duplicateEpsCount = totalEpisodes(series);

      // If the duplicate entry has few episodes (e.g., stray episode typos), group them into Especiais
      if (duplicateEpsCount <= 3) {
        if (!existingSeries.seasons["Especiais"]) {
          existingSeries.seasons["Especiais"] = [];
        }
        for (const seasonNum in series.seasons) {
          for (const ep of series.seasons[seasonNum]) {
            if (!existingSeries.seasons["Especiais"].some(e => e.url === ep.url)) {
              existingSeries.seasons["Especiais"].push({
                ...ep,
                name: `${ep.name} (Perdido / Extra)`
              });
            }
          }
        }
      } else {
        // Otherwise merge seasons normally
        for (const seasonNum in series.seasons) {
          let targetSeasonNum = seasonNum;
          if (seasonNum === "1" && detectedSeason && detectedSeason !== "1") {
            targetSeasonNum = detectedSeason;
          }

          if (!existingSeries.seasons[targetSeasonNum]) {
            existingSeries.seasons[targetSeasonNum] = [];
          }

          for (const ep of series.seasons[seasonNum]) {
            if (!existingSeries.seasons[targetSeasonNum].some(existingEp => existingEp.url === ep.url)) {
              existingSeries.seasons[targetSeasonNum].push(ep);
            }
          }
        }
      }

      // Rename key if shorter name is different
      if (shorterName !== existingKey) {
        existingSeries.name = shorterName;
        groupedSeriesMap.delete(existingKey);
        groupedSeriesMap.set(shorterName, existingSeries);
      }
    } else {
      // Deep copy seasons to avoid mutation issues
      const mappedSeasons = {};
      for (const seasonNum in series.seasons) {
        let targetSeasonNum = seasonNum;
        if (seasonNum === "1" && detectedSeason && detectedSeason !== "1") {
          targetSeasonNum = detectedSeason;
        }
        mappedSeasons[targetSeasonNum] = JSON.parse(JSON.stringify(series.seasons[seasonNum]));
      }

      groupedSeriesMap.set(baseName, {
        name: baseName,
        logo: series.logo || "",
        category: series.category,
        seasons: mappedSeasons
      });
    }
  }

  // Sort episodes
  for (const [name, series] of groupedSeriesMap.entries()) {
    for (const seasonNum in series.seasons) {
      series.seasons[seasonNum].sort((a, b) => a.episode - b.episode);
    }
  }

  return {
    moviesText: moviesBuffer,
    liveObj: Object.fromEntries(liveMap),
    seriesObj: Object.fromEntries(groupedSeriesMap),
    counts: {
      movies: moviesCount,
      series: groupedSeriesMap.size,
      episodes: seriesCount,
      live: liveCount
    }
  };
}
