// M3U Server-side Parser for dontmovie companion app
// Mirroring the exact clean-name grouping and regex classification from Tizen TV Svelte client

const s00e00Regex = /s(\d+)\s*e(\d+)/i;
const tempWordEpRegex = /(?:temporada|temp|t|season)\s*(\d+)\s*(?:episodio|ep|e)\s*(\d+)/i;
const tempDashEpRegex = /\b(\d+)\x(\d+)\b/i;
const epSuffixRegex = /(?:episodio|ep|e)\s*(\d+)/i;
const tempSuffixRegex = /(?:temporada|temp|t|season)\s*(\d+)/i;

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

  // Final clean up of the title
  name = name
    .replace(/\s*[([{\s-]*\b(19\d\d|20\d\d)\b[)\]}\s-]*/g, "") // Remove years (e.g. 2020)
    .replace(/\s+-\s*$/, "") // Trailing dashes
    .trim();

  episodeTitle = `${name} - Temp ${season} Ep ${episode}`;

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

  // Group series by base name in post-processing loop (like the Svelte parser)
  const groupedSeriesMap = new Map();

  for (const [name, series] of seriesMap.entries()) {
    let baseName = name
      .replace(/\s*[([{\s-]*\b(19\d\d|20\d\d)\b[)\]}\s-]*/g, "")
      .replace(/\s*[-:]?\s*\b(temporada|temp|t|season)\b\s*[\.]?\s*\d+/i, "")
      .replace(/\s*[-:]?\s*\bs\s*[\.]?\s*\d+/i, "")
      .replace(/\s*[-:]?\s*\d+\s*(?:ª|ª\s*|\s*)\b(temporada|temp|t|season)\b/i, "")
      .replace(/\s*[-:]?\s*\d+\s*(?:ª|ª\s*|\s*)\bs\b/i, "")
      .replace(/\s*[-:]\s*$/g, "")
      .trim();

    if (!baseName) {
      baseName = name.trim();
    }

    let detectedSeason = null;
    const seasonMatch = name.match(/\b(?:temporada|temp|t|season)\b\s*[\.]?\s*(\d+)/i) || name.match(/\bs\s*[\.]?\s*(\d+)/i);
    if (seasonMatch) {
      detectedSeason = parseInt(seasonMatch[1], 10).toString();
    }

    if (!groupedSeriesMap.has(baseName)) {
      groupedSeriesMap.set(baseName, {
        name: baseName,
        logo: series.logo || "",
        category: series.category,
        seasons: {}
      });
    }

    const groupedSeries = groupedSeriesMap.get(baseName);
    if (!groupedSeries.logo && series.logo) {
      groupedSeries.logo = series.logo;
    }

    for (const seasonNum in series.seasons) {
      let targetSeasonNum = seasonNum;
      if (seasonNum === "1" && detectedSeason && detectedSeason !== "1") {
        targetSeasonNum = detectedSeason;
      }

      if (!groupedSeries.seasons[targetSeasonNum]) {
        groupedSeries.seasons[targetSeasonNum] = [];
      }

      for (const ep of series.seasons[seasonNum]) {
        if (!groupedSeries.seasons[targetSeasonNum].some(existingEp => existingEp.url === ep.url)) {
          groupedSeries.seasons[targetSeasonNum].push(ep);
        }
      }
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
