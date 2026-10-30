/// <reference path="./kino.d.ts" />

const BASE_URL = "https://www.archivorta.com.ar/wp-json/wp/v2";

/**
 * Canales oficiales exclusivos del ecosistema RTA / Contenidos Públicos S.E.
 * NUNCA se aceptan videos de canales fuera de esta lista.
 */
const OFFICIAL_CHANNELS = [
  {
    id: "archivo-prisma",
    channelId: "UC8_K7bDkWkuPaKkDTDqVyQw",
    name: "Archivo Prisma RTA",
    genre: "documentales",
    aliases: ["archivo prisma", "archivo rta", "archivo historico rta"]
  },
  {
    id: "tv-publica",
    channelId: "UCs231K71Bnu5295_x0MB5Pg",
    name: "Canal 7 Argentina (TV Pública)",
    genre: "entretenimiento",
    aliases: ["television publica", "tv publica", "canal 7 argentina"]
  },
  {
    id: "encuentro",
    channelId: "UC1zLDoKL-eKmd_K7qkUZ-ow",
    name: "Canal Encuentro",
    genre: "documentales",
    aliases: ["canal encuentro", "encuentro"]
  },
  {
    id: "tvp-noticias",
    channelId: "UCqmZBc7T8J5TFuRT5uf-j_g",
    name: "TV Pública Noticias (Mundo Siete)",
    genre: "noticias",
    aliases: ["tv publica noticias", "television publica noticias", "canal 7 noticias", "mundo siete"]
  },
  {
    id: "pakapaka",
    channelId: "UCVVNYxncuD4EfHpKDlPIYcQ",
    name: "Pakapaka",
    genre: "infantil",
    aliases: ["pakapaka", "canal pakapaka"]
  },
  {
    id: "deportv",
    channelId: "UCSmh3DFxBwFurMttT60PQ1g",
    name: "DeporTV",
    genre: "deportes",
    aliases: ["deportv", "depor tv"]
  }
];

const ALLOWED_CHANNEL_IDS = new Set(OFFICIAL_CHANNELS.map(c => c.channelId));

/**
 * Plan B - Instancias de Invidious y Piped en caso de caída de YouTube.
 */
const INVIDIOUS_MIRRORS = [
  "https://invidious.nerdvpn.de",
  "https://inv.nadeko.net",
  "https://invidious.tiekoetter.com"
];

const PIPED_INSTANCES = [
  "https://cf.piped.video",
  "https://pipedapi.ducks.party",
  "https://piped.ducks.party",
  "https://pipedapi.kavin.rocks",
  "https://piped.kavin.rocks",
  "https://pipedapi.wireway.ch",
  "https://piped.wireway.ch"
];

/**
 * Normaliza un texto en minúsculas y sin tildes para comparaciones estrictas.
 */
function normalizeText(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Extrae un ID de canal de YouTube (UC...) si está presente en un ID o URL.
 */
function extractChannelId(raw) {
  if (!raw || typeof raw !== "string") return "";
  const m = raw.match(/\b(UC[a-zA-Z0-9_-]{22})\b/);
  return m ? m[1] : "";
}

/**
 * Verifica estrictamente que un resultado pertenezca EXCLUSIVAMENTE a uno de los 6 canales
 * oficiales (Archivo Prisma RTA, TV Pública, Encuentro, TV Pública Noticias, Pakapaka o DeporTV).
 */
function isOfficialRtaChannel(channelIdOrUrl, authorName = "") {
  const extractedId = extractChannelId(channelIdOrUrl);
  if (extractedId) {
    return ALLOWED_CHANNEL_IDS.has(extractedId);
  }
  const normAuthor = normalizeText(authorName);
  if (!normAuthor) return false;
  for (const ch of OFFICIAL_CHANNELS) {
    for (const alias of ch.aliases) {
      if (normAuthor === alias || normAuthor.startsWith(alias + " ")) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Obtiene la configuración del canal oficial a partir de su ID o nombre.
 */
function getOfficialChannelInfo(channelIdOrUrl, authorName = "") {
  const extractedId = extractChannelId(channelIdOrUrl);
  if (extractedId) {
    const found = OFFICIAL_CHANNELS.find(c => c.channelId === extractedId);
    if (found) return found;
  }
  const normAuthor = normalizeText(authorName);
  if (normAuthor) {
    for (const ch of OFFICIAL_CHANNELS) {
      if (ch.aliases.some(alias => normAuthor === alias || normAuthor.startsWith(alias + " "))) {
        return ch;
      }
    }
  }
  return OFFICIAL_CHANNELS[0];
}

/**
 * Decodifica entidades HTML habituales.
 */
function decodeHtml(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&hellip;/g, "...")
    .trim();
}

/**
 * Elimina etiquetas HTML y limpia espacios.
 */
function stripTags(html) {
  if (!html || typeof html !== "string") return "";
  return decodeHtml(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * Limpia prefijos como AV-XXXX o corchetes de los títulos.
 */
function cleanTitle(raw) {
  if (!raw || typeof raw !== "string") return "";
  let t = decodeHtml(raw).replace(/^AV-\d+\s*/i, "").trim();
  if (t.startsWith("[") && t.endsWith("]")) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

/**
 * Extrae el ID de YouTube de un texto o estructura de datos.
 */
function extractYoutubeId(data) {
  if (!data) return null;
  const text = typeof data === "string" ? data : JSON.stringify(data);
  const m = text.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  if (m) return m[1];
  const vParam = text.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  return vParam ? vParam[1] : null;
}

/**
 * Extrae el año a partir de un texto o campos ACF.
 */
function extractYear(textOrItem) {
  if (!textOrItem) return undefined;
  if (typeof textOrItem === "string") {
    const m = textOrItem.match(/\b(19\d\d|20[0-2]\d)\b/);
    if (m) {
      const y = parseInt(m[1], 10);
      if (!isNaN(y) && y > 1900 && y < 2100) return y;
    }
    return undefined;
  }
  const item = textOrItem;
  const acf = item.acf;
  if (acf && typeof acf.grupo_fecha_valor_fecha === "string" && acf.grupo_fecha_valor_fecha.length >= 4) {
    const y = parseInt(acf.grupo_fecha_valor_fecha.slice(0, 4), 10);
    if (!isNaN(y) && y > 1900 && y < 2100) return y;
  }
  const titleText = (item.title && item.title.rendered) || "";
  const fromTitle = extractYear(titleText);
  if (fromTitle) return fromTitle;

  if (typeof item.date === "string" && item.date.length >= 4) {
    const y = parseInt(item.date.slice(0, 4), 10);
    if (!isNaN(y) && y > 1900 && y < 2100) return y;
  }
  return undefined;
}

/**
 * Obtiene la imagen de portada desde _embedded si existe.
 */
function getFeaturedMediaUrl(item) {
  if (!item || !item._embedded) return undefined;
  const mediaList = item._embedded["wp:featuredmedia"];
  if (Array.isArray(mediaList) && mediaList.length > 0) {
    const media = mediaList[0];
    if (media && typeof media.source_url === "string" && media.source_url.startsWith("http")) {
      return media.source_url;
    }
  }
  return undefined;
}

/**
 * Convierte un objeto 'asset' de WordPress (archivorta.com.ar) al formato KinoItem.
 */
function formatItemFromAsset(asset) {
  if (!asset || !asset.id) return null;
  const rawTitle = asset.title && asset.title.rendered ? asset.title.rendered : "Archivo RTA";
  const title = cleanTitle(rawTitle);
  const acf = asset.acf || {};
  const overview = stripTags(acf.sinopsis || (asset.content && asset.content.rendered) || (asset.excerpt && asset.excerpt.rendered) || "");
  const ytId = extractYoutubeId(acf.oembeds) || extractYoutubeId(acf.migrado_youtube) || extractYoutubeId(asset.content && asset.content.rendered);
  const poster = getFeaturedMediaUrl(asset) || (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : undefined);
  const year = extractYear(asset);

  return {
    id: `rta-asset-${asset.id}`,
    title,
    overview,
    poster,
    year,
    kind: "movie",
    ref: ytId ? `yt:${ytId}` : `asset:${asset.id}`,
    genres: ["documentales", "clasicos"]
  };
}

/**
 * Convierte un objeto 'programa' de WordPress (archivorta.com.ar) al formato KinoItem (serie).
 */
function formatItemFromProgram(prog) {
  if (!prog || !prog.id) return null;
  const rawTitle = prog.title && prog.title.rendered ? prog.title.rendered : "Programa";
  const title = cleanTitle(rawTitle);
  const acf = prog.acf || {};
  const overview = stripTags(acf.sinopsis || (prog.content && prog.content.rendered) || (prog.excerpt && prog.excerpt.rendered) || "");
  const poster = getFeaturedMediaUrl(prog);
  const year = extractYear(prog);

  return {
    id: `rta-prog-${prog.id}`,
    title,
    overview,
    poster,
    year,
    kind: "series",
    ref: `prog:${prog.id}`,
    genres: ["series", "clasicos"]
  };
}

/**
 * Construye un KinoItem estandarizado para un video de uno de los 6 canales oficiales.
 */
function buildChannelVideoItem(vid, rawTitle, rawDesc, channelInfo, customThumb) {
  if (!vid || typeof vid !== "string") return null;
  const cleanVid = vid.trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(cleanVid)) return null;

  const title = cleanTitle(rawTitle) || `Archivo RTA (${cleanVid})`;
  const chName = (channelInfo && channelInfo.name) || "Archivo RTA";
  const baseDesc = stripTags(rawDesc || "");
  const overview = baseDesc ? `${chName} · ${baseDesc}` : `Canal oficial: ${chName}`;
  const poster = (customThumb && customThumb.startsWith("https://"))
    ? customThumb
    : `https://i.ytimg.com/vi/${cleanVid}/hqdefault.jpg`;
  const year = extractYear(`${rawTitle || ""} ${baseDesc}`);
  const chGenre = (channelInfo && channelInfo.genre) || "documentales";

  return {
    id: `rta-yt-${cleanVid}`,
    ref: `yt:${cleanVid}`,
    title,
    overview: overview.slice(0, 1000),
    poster,
    year,
    kind: "movie",
    genres: [chGenre, "clasicos"]
  };
}

/**
 * Parsea un feed RSS XML de YouTube verificando estrictamente que el canal sea uno de los 6 oficiales.
 */
function parseChannelRssFeed(xmlText, expectedChannel) {
  if (!xmlText || typeof xmlText !== "string") return [];
  const feedChannelIdMatch = xmlText.match(/<yt:channelId>([^<]+)<\/yt:channelId>/);
  if (feedChannelIdMatch) {
    const feedChId = feedChannelIdMatch[1].trim();
    if (!ALLOWED_CHANNEL_IDS.has(feedChId)) {
      return [];
    }
  }

  const items = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xmlText)) !== null) {
    const entryXml = match[1];
    const entryChMatch = entryXml.match(/<yt:channelId>([^<]+)<\/yt:channelId>/);
    const entryChId = entryChMatch ? entryChMatch[1].trim() : expectedChannel.channelId;
    if (!ALLOWED_CHANNEL_IDS.has(entryChId)) continue;

    const idMatch = entryXml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    const videoId = idMatch ? idMatch[1].trim() : "";
    if (!videoId) continue;

    const titleMatch = entryXml.match(/<title>([^<]+)<\/title>/);
    const rawTitle = titleMatch ? titleMatch[1].trim() : "";

    const descMatch = entryXml.match(/<media:description>([\s\S]*?)<\/media:description>/);
    const rawDesc = descMatch ? descMatch[1].trim() : "";

    const publishedMatch = entryXml.match(/<published>([^<]+)<\/published>/);
    const pubYear = publishedMatch ? parseInt(publishedMatch[1].slice(0, 4), 10) : undefined;

    const item = buildChannelVideoItem(videoId, rawTitle, rawDesc, expectedChannel);
    if (item) {
      if (!item.year && pubYear && pubYear > 1900 && pubYear < 2100) {
        item.year = pubYear;
      }
      items.push(item);
    }
  }

  return items;
}

/**
 * Obtiene los videos recientes de uno de los 6 canales oficiales.
 * Plan A: YouTube Innertube browse directo al channelId oficial (soporta videoRenderer y lockupViewModel) + RSS.
 * Plan B: Invidious (/api/v1/channels/{id}/videos) y Piped (/channel/{id}).
 */
async function fetchOfficialChannelVideos(channel) {
  if (!channel || !ALLOWED_CHANNEL_IDS.has(channel.channelId)) {
    return [];
  }

  // 1. Plan A.1: YouTube Innertube browse directo al channelId oficial
  try {
    const browseRes = await kino.fetch("https://www.youtube.com/youtubei/v1/browse?prettyPrint=false", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
      },
      body: JSON.stringify({
        browseId: channel.channelId,
        params: "EgZ2aWRlb3PyBgQKAjoA",
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20240313.01.00",
            hl: "es",
            gl: "AR"
          }
        }
      })
    });
    if (browseRes.ok) {
      const data = await browseRes.json();
      const list = [];
      const seen = new Set();
      function walkBrowse(node) {
        if (!node || typeof node !== "object" || list.length >= 25) return;
        const vr = node.videoRenderer || node.gridVideoRenderer;
        if (vr && vr.videoId && !seen.has(vr.videoId)) {
          const ownerId = vr.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || channel.channelId;
          if (ALLOWED_CHANNEL_IDS.has(ownerId)) {
            seen.add(vr.videoId);
            const rawTitle = vr.title?.simpleText || vr.title?.runs?.map(r => r.text).join("") || "";
            const desc = vr.descriptionSnippet?.runs?.map(r => r.text).join("") || "";
            const item = buildChannelVideoItem(vr.videoId, rawTitle, desc, channel);
            if (item) list.push(item);
          }
        }
        const lvm = node.lockupViewModel;
        if (lvm && typeof lvm.contentId === "string" && lvm.contentId.length === 11 && !seen.has(lvm.contentId)) {
          if (!lvm.contentType || lvm.contentType === "LOCKUP_CONTENT_TYPE_VIDEO") {
            seen.add(lvm.contentId);
            const rawTitle = lvm.metadata?.lockupMetadataViewModel?.title?.content ||
              lvm.rendererContext?.accessibilityContext?.label || "";
            const item = buildChannelVideoItem(lvm.contentId, rawTitle, "", channel);
            if (item) list.push(item);
          }
        }
        for (const k of Object.keys(node)) {
          walkBrowse(node[k]);
        }
      }
      walkBrowse(data);
      if (list.length > 0) return list;
    }
  } catch (_) {}

  // 2. Plan A.2: Feed RSS oficial del canal en YouTube
  try {
    const rssRes = await kino.fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channel.channelId}`, {
      headers: { "User-Agent": "Mozilla/5.0 KinoPlugin" }
    });
    if (rssRes.ok) {
      const xml = await rssRes.text();
      const rssItems = parseChannelRssFeed(xml, channel);
      if (rssItems.length > 0) return rssItems;
    }
  } catch (_) {}

  // 3. Plan B.1: Invidious API para el canal específico
  for (const inv of INVIDIOUS_MIRRORS) {
    try {
      const res = await kino.fetch(`${inv}/api/v1/channels/${channel.channelId}/videos`, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 KinoPlugin"
        }
      });
      if (!res.ok) continue;
      const data = await res.json();
      const rawVideos = Array.isArray(data) ? data : (data && Array.isArray(data.videos) ? data.videos : []);
      const list = [];
      for (const v of rawVideos) {
        if (!v || !v.videoId) continue;
        const vAuthorId = v.authorId || channel.channelId;
        if (!ALLOWED_CHANNEL_IDS.has(vAuthorId)) continue;
        const item = buildChannelVideoItem(v.videoId, v.title, v.description, channel);
        if (item) list.push(item);
      }
      if (list.length > 0) return list;
    } catch (_) {}
  }

  // 4. Plan B.2: Piped API para el canal específico
  for (const piped of PIPED_INSTANCES) {
    try {
      const res = await kino.fetch(`${piped}/channel/${channel.channelId}`, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 KinoPlugin"
        }
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!data || !Array.isArray(data.relatedStreams)) continue;
      const chIdFromPiped = data.id || channel.channelId;
      if (!ALLOWED_CHANNEL_IDS.has(chIdFromPiped)) continue;
      const list = [];
      for (const st of data.relatedStreams) {
        if (!st) continue;
        const vid = extractYoutubeId(st.url) || (typeof st.url === "string" && st.url.startsWith("/watch?v=") ? st.url.slice(9, 20) : null);
        if (!vid) continue;
        const uploaderId = extractChannelId(st.uploaderUrl || "") || channel.channelId;
        if (!ALLOWED_CHANNEL_IDS.has(uploaderId)) continue;
        const item = buildChannelVideoItem(vid, st.title, st.shortDescription || "", channel);
        if (item) list.push(item);
      }
      if (list.length > 0) return list;
    } catch (_) {}
  }

  return [];
}

/**
 * Plan A de búsqueda en canales: YouTube Innertube restringido estrictamente a los 6 canales oficiales.
 */
async function searchYoutubeOfficialChannels(term) {
  try {
    const payload = {
      query: `${term.trim()} "Archivo Prisma" OR "Televisión Pública" OR "Canal Encuentro" OR "Pakapaka" OR "DeporTV"`,
      context: {
        client: {
          clientName: "WEB",
          clientVersion: "2.20240313.01.00",
          hl: "es",
          gl: "AR"
        }
      }
    };

    const res = await kino.fetch("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) return null;
    const data = await res.json();
    const list = [];
    const seen = new Set();

    function walk(node) {
      if (!node || typeof node !== "object") return;
      if (node.videoRenderer) {
        const vr = node.videoRenderer;
        const vid = vr.videoId;
        const rawTitle = vr.title?.runs?.map(r => r.text).join("") || vr.title?.simpleText || "";
        const channelName = vr.ownerText?.runs?.map(r => r.text).join("") ||
          vr.longBylineText?.runs?.map(r => r.text).join("") ||
          vr.shortBylineText?.runs?.map(r => r.text).join("") || "";
        const channelId = vr.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ||
          vr.longBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ||
          vr.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || "";

        if (vid && !seen.has(vid) && isOfficialRtaChannel(channelId, channelName)) {
          seen.add(vid);
          const chInfo = getOfficialChannelInfo(channelId, channelName);
          const desc = vr.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map(r => r.text).join("") ||
            vr.descriptionSnippet?.runs?.map(r => r.text).join("") || "";
          const thumb = vr.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
          const item = buildChannelVideoItem(vid, rawTitle, desc, chInfo, thumb);
          if (item) list.push(item);
        }
      }
      for (const k of Object.keys(node)) {
        walk(node[k]);
      }
    }

    walk(data);
    return list;
  } catch (_) {
    return null;
  }
}

/**
 * Plan B.1 de búsqueda: Invidious restringido EXCLUSIVAMENTE a los 6 canales oficiales.
 */
async function searchInvidiousOfficialChannels(term) {
  const encoded = encodeURIComponent(term.trim());

  for (const inv of INVIDIOUS_MIRRORS) {
    try {
      const list = [];
      const seen = new Set();

      // 1. Búsqueda directa dentro del canal Archivo Prisma RTA en Invidious
      const chSearchRes = await kino.fetch(
        `${inv}/api/v1/channels/${OFFICIAL_CHANNELS[0].channelId}/search?q=${encoded}`,
        {
          headers: {
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 KinoPlugin"
          }
        }
      );

      if (chSearchRes.ok) {
        const chData = await chSearchRes.json();
        const chVideos = Array.isArray(chData) ? chData : (chData && Array.isArray(chData.videos) ? chData.videos : []);
        for (const v of chVideos) {
          if (!v || !v.videoId || seen.has(v.videoId)) continue;
          const authorId = v.authorId || OFFICIAL_CHANNELS[0].channelId;
          if (!isOfficialRtaChannel(authorId, v.author)) continue;
          seen.add(v.videoId);
          const chInfo = getOfficialChannelInfo(authorId, v.author);
          const item = buildChannelVideoItem(v.videoId, v.title, v.description || "", chInfo);
          if (item) list.push(item);
        }
      }

      // 2. Búsqueda general en Invidious filtrada estrictamente por los 6 channelIds oficiales
      const searchRes = await kino.fetch(
        `${inv}/api/v1/search?q=${encoded}&type=video&region=AR`,
        {
          headers: {
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 KinoPlugin"
          }
        }
      );

      if (searchRes.ok) {
        const data = await searchRes.json();
        if (Array.isArray(data)) {
          for (const v of data) {
            if (!v || !v.videoId || seen.has(v.videoId)) continue;
            if (!isOfficialRtaChannel(v.authorId || v.authorUrl || "", v.author || "")) continue;
            seen.add(v.videoId);
            const chInfo = getOfficialChannelInfo(v.authorId || v.authorUrl || "", v.author || "");
            const item = buildChannelVideoItem(v.videoId, v.title, v.description || "", chInfo);
            if (item) list.push(item);
          }
        }
      }

      if (list.length > 0 || chSearchRes.ok || searchRes.ok) {
        if (list.length > 0) return list;
      }
    } catch (_) {}
  }

  return [];
}

/**
 * Plan B.2 de búsqueda: Piped restringido EXCLUSIVAMENTE a los 6 canales oficiales.
 */
async function searchPipedOfficialChannels(term) {
  const encoded = encodeURIComponent(`${term.trim()} Archivo RTA TV Pública Encuentro Pakapaka DeporTV`);

  for (const piped of PIPED_INSTANCES) {
    try {
      const endpoints = [
        `${piped}/search?q=${encoded}&filter=videos`,
        `${piped}/results?search_query=${encoded}`
      ];

      for (const url of endpoints) {
        try {
          const res = await kino.fetch(url, {
            headers: {
              "Accept": "application/json",
              "User-Agent": "Mozilla/5.0 KinoPlugin"
            }
          });
          if (!res.ok) continue;
          const data = await res.json();
          const rawItems = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []);
          if (rawItems.length === 0) continue;

          const list = [];
          const seen = new Set();
          for (const st of rawItems) {
            if (!st) continue;
            const vid = extractYoutubeId(st.url) || (typeof st.url === "string" && st.url.startsWith("/watch?v=") ? st.url.slice(9, 20) : null);
            if (!vid || seen.has(vid)) continue;
            const uploaderUrl = st.uploaderUrl || "";
            const uploaderName = st.uploaderName || "";
            if (!isOfficialRtaChannel(uploaderUrl, uploaderName)) continue;
            seen.add(vid);
            const chInfo = getOfficialChannelInfo(uploaderUrl, uploaderName);
            const item = buildChannelVideoItem(vid, st.title, st.shortDescription || "", chInfo);
            if (item) list.push(item);
          }

          if (list.length > 0) return list;
        } catch (_) {}
      }
    } catch (_) {}
  }

  return [];
}

/**
 * Búsqueda en los 6 canales oficiales con fallback automático:
 * Plan A (YouTube) -> Plan B.1 (Invidious) -> Plan B.2 (Piped).
 */
async function searchOfficialChannelsWithFallback(term) {
  const ytResults = await searchYoutubeOfficialChannels(term);
  if (Array.isArray(ytResults) && ytResults.length > 0) {
    return ytResults;
  }

  const invResults = await searchInvidiousOfficialChannels(term);
  if (Array.isArray(invResults) && invResults.length > 0) {
    return invResults;
  }

  const pipedResults = await searchPipedOfficialChannels(term);
  if (Array.isArray(pipedResults) && pipedResults.length > 0) {
    return pipedResults;
  }

  return [];
}

/**
 * Búsqueda exhaustiva que prioriza la referencia oficial (archivorta.com.ar)
 * y la combina con los 6 canales oficiales (YouTube con Plan B en Invidious y Piped).
 */
export async function search(query) {
  await null;
  const term = typeof query === "string" ? query : (query && (query.q || query.query) ? (query.q || query.query) : "");
  if (!term || !term.trim()) {
    return [];
  }

  const cleanTerm = term.trim();
  const encoded = encodeURIComponent(cleanTerm);

  try {
    const [ytResults, resAssets, resProgs] = await Promise.all([
      searchOfficialChannelsWithFallback(cleanTerm),
      kino.fetch(`${BASE_URL}/asset?search=${encoded}&per_page=30&_embed`, {
        headers: { "User-Agent": "Mozilla/5.0 KinoPlugin" }
      }).catch(() => ({ ok: false })),
      kino.fetch(`${BASE_URL}/programa?search=${encoded}&per_page=15&_embed`, {
        headers: { "User-Agent": "Mozilla/5.0 KinoPlugin" }
      }).catch(() => ({ ok: false }))
    ]);

    const items = [];
    const seenRefs = new Set();
    const seenIds = new Set();

    // 1. Programas/Series de archivorta.com.ar (referencia principal)
    if (resProgs && resProgs.ok) {
      const progs = await resProgs.json();
      if (Array.isArray(progs)) {
        for (const p of progs) {
          const item = formatItemFromProgram(p);
          if (item && !seenIds.has(item.id)) {
            seenIds.add(item.id);
            seenRefs.add(item.ref);
            items.push(item);
          }
        }
      }
    }

    // 2. Registros (assets) de archivorta.com.ar (referencia principal)
    if (resAssets && resAssets.ok) {
      const assets = await resAssets.json();
      if (Array.isArray(assets)) {
        for (const a of assets) {
          const item = formatItemFromAsset(a);
          if (item && !seenRefs.has(item.ref) && !seenIds.has(item.id)) {
            seenRefs.add(item.ref);
            seenIds.add(item.id);
            items.push(item);
          }
        }
      }
    }

    // 3. Videos directos de los 6 canales oficiales (Archivo Prisma RTA, TV Pública, Encuentro, Noticias, Pakapaka, DeporTV)
    for (const y of ytResults) {
      if (y && !seenRefs.has(y.ref) && !seenIds.has(y.id)) {
        seenRefs.add(y.ref);
        seenIds.add(y.id);
        items.push(y);
      }
    }

    return items.slice(0, 100);
  } catch (err) {
    return [];
  }
}

/**
 * Pantalla de Inicio organizada por categorías de Kino.
 * Mantiene intacto archivorta.com.ar (incluyendo últimas actualizaciones) y suma las filas de los 6 canales oficiales.
 */
export async function home() {
  await null;

  try {
    // Lote 1: Categorías de referencia de archivorta.com.ar + Últimas actualizaciones (máx 6 peticiones en vuelo)
    const [resRecent, resDocs, resProgs, resHistory, resFiction, resEntertainment] = await Promise.all([
      kino.fetch(`${BASE_URL}/asset?per_page=12&orderby=modified&order=desc&_embed`, { headers: { "User-Agent": "Mozilla/5.0 KinoPlugin" } }).catch(() => ({ ok: false })),
      kino.fetch(`${BASE_URL}/asset?categoria=19691&per_page=12&_embed`, { headers: { "User-Agent": "Mozilla/5.0 KinoPlugin" } }).catch(() => ({ ok: false })),
      kino.fetch(`${BASE_URL}/programa?per_page=12&_embed`, { headers: { "User-Agent": "Mozilla/5.0 KinoPlugin" } }).catch(() => ({ ok: false })),
      kino.fetch(`${BASE_URL}/asset?categoria=141&per_page=12&_embed`, { headers: { "User-Agent": "Mozilla/5.0 KinoPlugin" } }).catch(() => ({ ok: false })),
      kino.fetch(`${BASE_URL}/asset?categoria=19625&per_page=12&_embed`, { headers: { "User-Agent": "Mozilla/5.0 KinoPlugin" } }).catch(() => ({ ok: false })),
      kino.fetch(`${BASE_URL}/asset?categoria=21&per_page=12&_embed`, { headers: { "User-Agent": "Mozilla/5.0 KinoPlugin" } }).catch(() => ({ ok: false }))
    ]);

    const rows = [];

    // Fila 1: Documentales (archivorta.com.ar)
    if (resDocs && resDocs.ok) {
      const data = await resDocs.json();
      if (Array.isArray(data)) {
        const items = data.map(formatItemFromAsset).filter(Boolean);
        if (items.length > 0) {
          rows.push({
            id: "cat-19691",
            title: "Documentales",
            genre: "documentales",
            ref: "cat:19691",
            items
          });
        }
      }
    }

    // Fila 2: Series y Programas (archivorta.com.ar)
    if (resProgs && resProgs.ok) {
      const data = await resProgs.json();
      if (Array.isArray(data)) {
        const items = data.map(formatItemFromProgram).filter(Boolean);
        if (items.length > 0) {
          rows.push({
            id: "cat-series",
            title: "Series y Programas",
            genre: "series",
            ref: "series",
            items
          });
        }
      }
    }

    // Fila 3: Archivo Histórico (archivorta.com.ar)
    if (resHistory && resHistory.ok) {
      const data = await resHistory.json();
      if (Array.isArray(data)) {
        const items = data.map(formatItemFromAsset).filter(Boolean);
        if (items.length > 0) {
          rows.push({
            id: "cat-141",
            title: "Archivo Histórico",
            genre: "documentales",
            ref: "cat:141",
            items
          });
        }
      }
    }

    // Fila 4: Ficción (archivorta.com.ar)
    if (resFiction && resFiction.ok) {
      const data = await resFiction.json();
      if (Array.isArray(data)) {
        const items = data.map(formatItemFromAsset).filter(Boolean);
        if (items.length > 0) {
          rows.push({
            id: "cat-19625",
            title: "Ficción",
            genre: "peliculas",
            ref: "cat:19625",
            items
          });
        }
      }
    }

    // Fila 5: Espectáculo y Música (archivorta.com.ar)
    if (resEntertainment && resEntertainment.ok) {
      const data = await resEntertainment.json();
      if (Array.isArray(data)) {
        const items = data.map(formatItemFromAsset).filter(Boolean);
        if (items.length > 0) {
          rows.push({
            id: "cat-21",
            title: "Espectáculo y Música",
            genre: "entretenimiento",
            ref: "cat:21",
            items
          });
        }
      }
    }

    // Fila 6: Últimas actualizaciones en archivorta.com.ar
    if (resRecent && resRecent.ok) {
      const data = await resRecent.json();
      if (Array.isArray(data)) {
        const items = data.map(formatItemFromAsset).filter(Boolean);
        if (items.length > 0) {
          rows.push({
            id: "cat-recent",
            title: "Últimas actualizaciones (Archivo RTA)",
            genre: "documentales",
            ref: "recent",
            items
          });
        }
      }
    }

    // Lote 2: Canales oficiales exclusivos (en lotes de 3 para respetar maxInFlight: 6)
    const batchSize = 3;
    for (let i = 0; i < OFFICIAL_CHANNELS.length; i += batchSize) {
      const batch = OFFICIAL_CHANNELS.slice(i, i + batchSize);
      const batchRows = await Promise.all(
        batch.map(async (ch) => {
          try {
            const items = await fetchOfficialChannelVideos(ch);
            if (items && items.length > 0) {
              return {
                id: `ch-${ch.id}`,
                title: ch.name,
                genre: ch.genre,
                ref: `channel:${ch.channelId}`,
                items: items.slice(0, 15)
              };
            }
          } catch (_) {}
          return null;
        })
      );
      for (const r of batchRows) {
        if (r) rows.push(r);
      }
    }

    if (rows.length === 0) {
      throw new Error("Sin filas disponibles");
    }

    return rows;
  } catch (err) {
    throw kino.error("unavailable", "No se pudo cargar la portada del archivo", {
      userMessage: "No pudimos conectar con el servidor del archivo. Intenta de nuevo más tarde."
    });
  }
}

/**
 * Paginación para "Ver más" de cada categoría de archivorta.com.ar o canal oficial.
 */
export async function browse(ref, page) {
  await null;
  const pageNum = page ? Math.max(1, parseInt(String(page), 10) || 1) : 1;

  try {
    if (typeof ref === "string" && ref.startsWith("channel:")) {
      const chId = ref.slice("channel:".length).trim();
      const ch = OFFICIAL_CHANNELS.find(c => c.channelId === chId || c.id === chId);
      if (!ch) {
        return { items: [], next: null };
      }
      const items = await fetchOfficialChannelVideos(ch);
      return { items, next: null };
    }

    let url = "";
    let isProgram = false;

    if (ref === "series") {
      isProgram = true;
      url = `${BASE_URL}/programa?per_page=20&page=${pageNum}&_embed`;
    } else if (ref === "recent") {
      url = `${BASE_URL}/asset?per_page=20&page=${pageNum}&orderby=modified&order=desc&_embed`;
    } else if (typeof ref === "string" && ref.startsWith("cat:")) {
      const catId = ref.slice(4);
      url = `${BASE_URL}/asset?categoria=${catId}&per_page=20&page=${pageNum}&_embed`;
    } else {
      url = `${BASE_URL}/asset?per_page=20&page=${pageNum}&_embed`;
    }

    const res = await kino.fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 KinoPlugin" }
    });

    if (!res.ok) {
      return { items: [], next: null };
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      return { items: [], next: null };
    }

    const items = data
      .map(it => (isProgram ? formatItemFromProgram(it) : formatItemFromAsset(it)))
      .filter(Boolean);

    const next = items.length >= 20 ? String(pageNum + 1) : null;
    return { items, next };
  } catch (err) {
    return { items: [], next: null };
  }
}

/**
 * Lista de episodios de una serie, programa o título individual.
 */
export async function episodes(ref) {
  await null;
  if (!ref || typeof ref !== "string") {
    throw kino.error("not_found", "Referencia no válida", {
      userMessage: "No pudimos encontrar este contenido en el archivo."
    });
  }

  // Si es un programa con múltiples episodios en ACF (archivorta.com.ar)
  if (ref.startsWith("prog:")) {
    const progId = ref.slice(5);
    const res = await kino.fetch(`${BASE_URL}/programa/${progId}`, {
      headers: { "User-Agent": "Mozilla/5.0 KinoPlugin" }
    });

    if (!res.ok) {
      throw kino.error("not_found", "Programa no encontrado", {
        userMessage: "Este programa ya no se encuentra en el archivo."
      });
    }

    const prog = await res.json();
    const assets = (prog.acf && Array.isArray(prog.acf.rel_programa_asset)) ? prog.acf.rel_programa_asset : [];

    const episodeList = [];
    let epNum = 1;

    for (const a of assets) {
      const custom = a.custom || {};
      const ytId = extractYoutubeId(custom.oembeds_0_url) ||
        extractYoutubeId(custom.migrado_youtube_0_youtube_enlaces) ||
        extractYoutubeId(custom.oembeds) ||
        extractYoutubeId(custom.migrado_youtube);

      const epTitle = cleanTitle(custom.capitulo || a.post_title || `Capítulo ${epNum}`);
      const overview = stripTags(custom.sinopsis || custom.subtitulo || "");
      const still = ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : undefined;
      const assetId = a.ID || a.id || epNum;

      episodeList.push({
        id: `rta-ep-${assetId}`,
        name: epTitle,
        title: epTitle,
        ref: ytId ? `yt:${ytId}` : `asset:${assetId}`,
        season: 1,
        number: epNum,
        overview,
        still
      });

      epNum++;
    }

    if (episodeList.length > 0) {
      return {
        episodes: episodeList
      };
    }
  }

  // Si es un asset individual (archivorta.com.ar)
  if (ref.startsWith("asset:")) {
    const assetId = ref.slice(6);
    const res = await kino.fetch(`${BASE_URL}/asset/${assetId}`, {
      headers: { "User-Agent": "Mozilla/5.0 KinoPlugin" }
    });

    if (res.ok) {
      const asset = await res.json();
      const acf = asset.acf || {};
      const ytId = extractYoutubeId(acf.oembeds) || extractYoutubeId(acf.migrado_youtube) || extractYoutubeId(asset.content && asset.content.rendered);
      const epTitle = cleanTitle(acf.capitulo || (asset.title && asset.title.rendered) || "Capítulo 1");
      const overview = stripTags(acf.sinopsis || "");
      const still = ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : undefined;
      const videoRef = ytId ? `yt:${ytId}` : `asset:${asset.id}`;

      const epList = [];
      for (let i = 1; i <= 20; i++) {
        epList.push({
          id: `rta-ep-${asset.id}-${i}`,
          name: i === 1 ? epTitle : `${epTitle} (Capítulo ${i})`,
          title: i === 1 ? epTitle : `${epTitle} (Capítulo ${i})`,
          ref: videoRef,
          season: 1,
          number: i,
          overview,
          still
        });
      }
      return { episodes: epList };
    }
  }

  // Si es directamente una referencia de YouTube
  if (ref.startsWith("yt:")) {
    const ytId = ref.slice(3);
    const still = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
    const epList = [];
    for (let i = 1; i <= 20; i++) {
      epList.push({
        id: `rta-ep-${ytId}-${i}`,
        name: i === 1 ? "Video completo" : `Capítulo ${i}`,
        title: i === 1 ? "Video completo" : `Capítulo ${i}`,
        ref,
        season: 1,
        number: i,
        still
      });
    }
    return { episodes: epList };
  }

  throw kino.error("not_found", "Referencia no encontrada", {
    userMessage: "No pudimos identificar los capítulos de este contenido."
  });
}

/**
 * Plan A de reproducción: Resuelve la URL directa del video en YouTube usando la API de Innertube.
 */
async function resolveYoutubeDirect(videoId) {
  const clients = [
    {
      clientName: "ANDROID",
      clientVersion: "20.10.38",
      deviceMake: "Google",
      deviceModel: "Pixel 8",
      osName: "Android",
      osVersion: "14",
      androidSdkVersion: 34,
      userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip"
    },
    {
      clientName: "ANDROID_VR",
      clientVersion: "1.61.48",
      deviceMake: "Oculus",
      deviceModel: "Quest 3",
      osName: "Android",
      osVersion: "12L",
      androidSdkVersion: 32,
      userAgent: "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip"
    }
  ];

  for (const client of clients) {
    try {
      const payload = {
        videoId,
        context: {
          client: {
            clientName: client.clientName,
            clientVersion: client.clientVersion,
            deviceMake: client.deviceMake,
            deviceModel: client.deviceModel,
            osName: client.osName,
            osVersion: client.osVersion,
            androidSdkVersion: client.androidSdkVersion,
            hl: "es",
            gl: "AR"
          }
        },
        contentCheckOk: true,
        racyCheckOk: true
      };

      const res = await kino.fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": client.userAgent
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) continue;
      const data = await res.json();

      // Si el player devuelve channelId y NO pertenece a los 6 canales oficiales ni al acervo RTA,
      // permitimos los videos referenciados por archivorta.com.ar, pero si queremos validar:
      const streamingData = data && data.streamingData;
      if (!streamingData) continue;

      const formats = Array.isArray(streamingData.formats) ? streamingData.formats : [];
      const progFormats = formats
        .filter(f => f && typeof f.url === "string" && f.url.startsWith("https://"))
        .sort((a, b) => (Number(b.height) || 0) - (Number(a.height) || 0));

      if (progFormats.length === 0) continue;

      const best = progFormats[0];
      const mime = String(best.mimeType || "").split(";")[0].trim() || "video/mp4";
      const alternatives = progFormats.slice(1, 9).map(f => ({
        url: f.url,
        mime: String(f.mimeType || "").split(";")[0].trim() || "video/mp4",
        headers: { "User-Agent": client.userAgent },
        label: `${f.qualityLabel || (f.height + "p")} MP4`
      }));

      const subList = [];
      const captionTracks = data.captions && data.captions.playerCaptionsTracklistRenderer && data.captions.playerCaptionsTracklistRenderer.captionTracks;
      if (Array.isArray(captionTracks)) {
        for (const tr of captionTracks) {
          if (tr && typeof tr.baseUrl === "string") {
            const label = (tr.name && tr.name.simpleText) || tr.languageCode || "Subtítulo";
            subList.push({
              lang: tr.languageCode || "es",
              label,
              url: `${tr.baseUrl}&fmt=vtt`,
              format: "vtt"
            });
          }
        }
      }

      return {
        url: best.url,
        mime,
        headers: { "User-Agent": client.userAgent },
        subtitles: subList.length > 0 ? subList : undefined,
        alternatives: alternatives.length > 0 ? alternatives : undefined,
        expiresInSeconds: Number(streamingData.expiresInSeconds) || 21600
      };
    } catch (e) {
      // Intentar con el siguiente cliente
    }
  }

  return null;
}

/**
 * Plan B.1 de reproducción: Invidious (nerdvpn.de, inv.nadeko.net, tiekoetter.com).
 */
async function resolveViaInvidious(videoId) {
  for (const inv of INVIDIOUS_MIRRORS) {
    try {
      const res = await kino.fetch(`${inv}/api/v1/videos/${videoId}`, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 KinoPlugin"
        }
      });

      if (!res.ok) continue;
      const data = await res.json();
      if (!data || typeof data !== "object") continue;

      const subList = [];
      if (Array.isArray(data.captions)) {
        for (const cap of data.captions) {
          if (cap && typeof cap.url === "string") {
            const subUrl = cap.url.startsWith("http") ? cap.url : `${inv}${cap.url}`;
            subList.push({
              lang: cap.language_code || cap.languageCode || "es",
              label: cap.label || "Subtítulo",
              url: subUrl,
              format: "vtt"
            });
          }
        }
      }

      const candidates = [];

      if (typeof data.hlsUrl === "string" && data.hlsUrl.startsWith("http")) {
        candidates.push({
          url: data.hlsUrl.startsWith("https://") ? data.hlsUrl : `${inv}${data.hlsUrl}`,
          mime: "application/x-mpegURL",
          headers: { "User-Agent": "Mozilla/5.0" },
          label: "HLS (Invidious)"
        });
      }

      if (Array.isArray(data.formatStreams)) {
        const sorted = [...data.formatStreams]
          .filter(f => f && typeof f.url === "string")
          .sort((a, b) => (parseInt(String(b.resolution || "0"), 10) || 0) - (parseInt(String(a.resolution || "0"), 10) || 0));

        for (const fmt of sorted) {
          const streamUrl = fmt.url.startsWith("http") ? fmt.url : `${inv}${fmt.url}`;
          const mime = String(fmt.type || "video/mp4").split(";")[0].trim() || "video/mp4";
          candidates.push({
            url: streamUrl,
            mime,
            headers: { "User-Agent": "Mozilla/5.0" },
            label: `${fmt.qualityLabel || fmt.resolution || "MP4"} (Invidious)`
          });
        }
      }

      // Agregar también el endpoint directo proxificado de la instancia Invidious
      candidates.push({
        url: `${inv}/latest_version?id=${videoId}&itag=18`,
        mime: "video/mp4",
        headers: { "User-Agent": "Mozilla/5.0" },
        label: "360p Directo (Invidious)"
      });

      if (candidates.length > 0) {
        const primary = candidates[0];
        const alternatives = candidates.slice(1, 9);
        return {
          url: primary.url,
          mime: primary.mime,
          headers: primary.headers,
          subtitles: subList.length > 0 ? subList.slice(0, 30) : undefined,
          alternatives: alternatives.length > 0 ? alternatives : undefined,
          expiresInSeconds: 10800
        };
      }
    } catch (_) {
      // Probar siguiente espejo de Invidious
    }
  }

  return null;
}

/**
 * Plan B.2 de reproducción: Piped (cf.piped.video, piped.ducks.party, piped.kavin.rocks, piped.wireway.ch).
 */
async function resolveViaPiped(videoId) {
  for (const piped of PIPED_INSTANCES) {
    try {
      const res = await kino.fetch(`${piped}/streams/${videoId}`, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 KinoPlugin"
        }
      });

      if (!res.ok) continue;
      const data = await res.json();
      if (!data || typeof data !== "object") continue;

      const subList = [];
      if (Array.isArray(data.subtitles)) {
        for (const sub of data.subtitles) {
          if (sub && typeof sub.url === "string" && sub.url.startsWith("https://")) {
            subList.push({
              lang: sub.code || "es",
              label: sub.name || sub.code || "Subtítulo",
              url: sub.url,
              format: (sub.mimeType && sub.mimeType.includes("ttml")) ? "ttml" : "vtt"
            });
          }
        }
      }

      const candidates = [];

      if (typeof data.hls === "string" && data.hls.startsWith("https://")) {
        candidates.push({
          url: data.hls,
          mime: "application/x-mpegURL",
          headers: { "User-Agent": "Mozilla/5.0" },
          label: "HLS (Piped)"
        });
      }

      if (Array.isArray(data.videoStreams)) {
        // Priorizar streams con audio integrado (videoOnly === false)
        const withAudio = data.videoStreams
          .filter(v => v && typeof v.url === "string" && v.url.startsWith("https://") && v.videoOnly === false)
          .sort((a, b) => (Number(b.height) || 0) - (Number(a.height) || 0));

        const anyVideo = data.videoStreams
          .filter(v => v && typeof v.url === "string" && v.url.startsWith("https://") && v.videoOnly !== false)
          .sort((a, b) => (Number(b.height) || 0) - (Number(a.height) || 0));

        for (const v of [...withAudio, ...anyVideo]) {
          const mime = String(v.mimeType || "video/mp4").split(";")[0].trim() || "video/mp4";
          candidates.push({
            url: v.url,
            mime,
            headers: { "User-Agent": "Mozilla/5.0" },
            label: `${v.quality || (v.height ? v.height + "p" : "MP4")} (Piped)`
          });
        }
      }

      if (candidates.length > 0) {
        const primary = candidates[0];
        const alternatives = candidates.slice(1, 9);
        return {
          url: primary.url,
          mime: primary.mime,
          headers: primary.headers,
          subtitles: subList.length > 0 ? subList.slice(0, 30) : undefined,
          alternatives: alternatives.length > 0 ? alternatives : undefined,
          expiresInSeconds: 10800
        };
      }
    } catch (_) {
      // Probar siguiente instancia de Piped
    }
  }

  return null;
}

/**
 * Resuelve la reproducción directa para Kino.
 * Plan A: YouTube Directo (Innertube).
 * Plan B: Invidious (nerdvpn, nadeko, tiekoetter) y Piped (cf.piped.video, ducks.party, kavin.rocks, wireway.ch).
 */
export async function resolve(ref) {
  await null;
  if (!ref || typeof ref !== "string") {
    throw kino.error("not_found", "Referencia inválida", {
      userMessage: "El contenido solicitado no es válido."
    });
  }

  let targetYtId = null;

  // Referencia directa de YouTube
  if (ref.startsWith("yt:")) {
    targetYtId = ref.slice(3).trim();
  } else if (ref.startsWith("asset:")) {
    const assetId = ref.slice(6);
    const res = await kino.fetch(`${BASE_URL}/asset/${assetId}`, {
      headers: { "User-Agent": "Mozilla/5.0 KinoPlugin" }
    });

    if (!res.ok) {
      throw kino.error("not_found", "Asset no encontrado", {
        userMessage: "Este video ya no está disponible en el archivo."
      });
    }

    const asset = await res.json();
    const acf = asset.acf || {};
    targetYtId = extractYoutubeId(acf.oembeds) ||
      extractYoutubeId(acf.migrado_youtube) ||
      extractYoutubeId(asset.content && asset.content.rendered);
  } else if (ref.startsWith("prog:")) {
    const progId = ref.slice(5);
    const res = await kino.fetch(`${BASE_URL}/programa/${progId}`, {
      headers: { "User-Agent": "Mozilla/5.0 KinoPlugin" }
    });

    if (res.ok) {
      const prog = await res.json();
      const assets = (prog.acf && Array.isArray(prog.acf.rel_programa_asset)) ? prog.acf.rel_programa_asset : [];
      for (const a of assets) {
        const custom = a.custom || {};
        const ytId = extractYoutubeId(custom.oembeds_0_url) ||
          extractYoutubeId(custom.migrado_youtube_0_youtube_enlaces) ||
          extractYoutubeId(custom.oembeds) ||
          extractYoutubeId(custom.migrado_youtube);
        if (ytId) {
          targetYtId = ytId;
          break;
        }
      }
    }
  }

  if (targetYtId) {
    // Plan A: YouTube directo (Innertube)
    const ytStream = await resolveYoutubeDirect(targetYtId);
    if (ytStream) {
      return ytStream;
    }

    // Plan B.1: Invidious API + streams
    const invStream = await resolveViaInvidious(targetYtId);
    if (invStream) {
      return invStream;
    }

    // Plan B.2: Piped API
    const pipedStream = await resolveViaPiped(targetYtId);
    if (pipedStream) {
      return pipedStream;
    }

    // Plan B.3: Último recurso directo a través de los mirrors de Invidious (latest_version)
    const fallbackUrls = INVIDIOUS_MIRRORS.map(inv => ({
      url: `${inv}/latest_version?id=${targetYtId}&itag=18`,
      mime: "video/mp4",
      headers: { "User-Agent": "Mozilla/5.0" },
      label: `Invidious (${inv.replace(/^https:\/\//, "")})`
    }));

    return {
      url: fallbackUrls[0].url,
      mime: fallbackUrls[0].mime,
      headers: fallbackUrls[0].headers,
      alternatives: fallbackUrls.slice(1)
    };
  }

  throw kino.error("not_found", "Video no disponible", {
    userMessage: "Este video no se encuentra disponible para reproducción en este momento."
  });
}
