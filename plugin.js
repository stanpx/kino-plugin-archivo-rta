/// <reference path="./kino.d.ts" />

const BASE_URL = "https://www.archivorta.com.ar/wp-json/wp/v2";
const PRISMA_CHANNEL_ID = "UC8_K7bDkWkuPaKkDTDqVyQw";

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
  const m = text.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  return m ? m[1] : null;
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
 * Convierte un objeto 'asset' de WordPress al formato KinoItem.
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
 * Convierte un objeto 'programa' de WordPress al formato KinoItem (serie).
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
 * Búsqueda directa en el canal oficial de YouTube de Archivo Prisma (RTA).
 */
async function searchYoutubeChannel(term) {
  try {
    const payload = {
      query: `${term.trim()} "Archivo Prisma"`,
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

    if (!res.ok) return [];
    const data = await res.json();
    const list = [];

    function walk(node) {
      if (!node || typeof node !== "object") return;
      if (node.videoRenderer) {
        const vr = node.videoRenderer;
        const vid = vr.videoId;
        const rawTitle = vr.title?.runs?.map(r => r.text).join("") || "";
        const channel = vr.ownerText?.runs?.map(r => r.text).join("") || "";
        const channelId = vr.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || "";
        const isPrisma = channelId === PRISMA_CHANNEL_ID ||
          channel.toLowerCase().includes("prisma") ||
          channel.toLowerCase().includes("archivo rta");

        if (vid && isPrisma) {
          const title = cleanTitle(rawTitle);
          const desc = vr.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map(r => r.text).join("") ||
            vr.descriptionSnippet?.runs?.map(r => r.text).join("") || "";
          const thumb = vr.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
          const year = extractYear(rawTitle + " " + desc);

          list.push({
            id: `rta-yt-${vid}`,
            ref: `yt:${vid}`,
            title,
            overview: desc,
            poster: thumb,
            year,
            kind: "movie",
            genres: ["documentales", "clasicos"]
          });
        }
      }
      for (const k of Object.keys(node)) {
        walk(node[k]);
      }
    }

    walk(data);
    return list;
  } catch (e) {
    return [];
  }
}

/**
 * Búsqueda exhaustiva que combina el canal de YouTube de Archivo Prisma y la API de WordPress.
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
      searchYoutubeChannel(cleanTerm),
      kino.fetch(`${BASE_URL}/asset?search=${encoded}&per_page=30&_embed`, {
        headers: { "User-Agent": "Mozilla/5.0 KinoPlugin" }
      }),
      kino.fetch(`${BASE_URL}/programa?search=${encoded}&per_page=15&_embed`, {
        headers: { "User-Agent": "Mozilla/5.0 KinoPlugin" }
      })
    ]);

    const items = [];
    const seenRefs = new Set();
    const seenIds = new Set();

    // 1. Programas/Series de WordPress
    if (resProgs.ok) {
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

    // 2. Videos directos del canal oficial Archivo Prisma (YouTube)
    for (const y of ytResults) {
      if (!seenRefs.has(y.ref) && !seenIds.has(y.id)) {
        seenRefs.add(y.ref);
        seenIds.add(y.id);
        items.push(y);
      }
    }

    // 3. Registros (assets) de WordPress
    if (resAssets.ok) {
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

    return items.slice(0, 100);
  } catch (err) {
    return [];
  }
}

/**
 * Pantalla de Inicio organizada por categorías de Kino. Devuelve un array de KinoHomeRow.
 */
export async function home() {
  await null;

  try {
    const [resDocs, resProgs, resHistory, resFiction, resEntertainment] = await Promise.all([
      kino.fetch(`${BASE_URL}/asset?categoria=19691&per_page=12&_embed`, { headers: { "User-Agent": "Mozilla/5.0 KinoPlugin" } }),
      kino.fetch(`${BASE_URL}/programa?per_page=12&_embed`, { headers: { "User-Agent": "Mozilla/5.0 KinoPlugin" } }),
      kino.fetch(`${BASE_URL}/asset?categoria=141&per_page=12&_embed`, { headers: { "User-Agent": "Mozilla/5.0 KinoPlugin" } }),
      kino.fetch(`${BASE_URL}/asset?categoria=19625&per_page=12&_embed`, { headers: { "User-Agent": "Mozilla/5.0 KinoPlugin" } }),
      kino.fetch(`${BASE_URL}/asset?categoria=21&per_page=12&_embed`, { headers: { "User-Agent": "Mozilla/5.0 KinoPlugin" } })
    ]);

    const rows = [];

    // Fila 1: Documentales
    if (resDocs.ok) {
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

    // Fila 2: Series y Programas
    if (resProgs.ok) {
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

    // Fila 3: Archivo Histórico
    if (resHistory.ok) {
      const data = await resHistory.json();
      if (Array.isArray(data)) {
        const items = data.map(formatItemFromAsset).filter(Boolean);
        if (items.length > 0) {
          rows.push({
            id: "cat-141",
            title: "Archivo Histórico",
            genre: "clasicos",
            ref: "cat:141",
            items
          });
        }
      }
    }

    // Fila 4: Ficción
    if (resFiction.ok) {
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

    // Fila 5: Espectáculo y Música
    if (resEntertainment.ok) {
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

    return rows;
  } catch (err) {
    throw kino.error("unavailable", "No se pudo cargar la portada del archivo", {
      userMessage: "No pudimos conectar con el servidor del archivo. Intenta de nuevo más tarde."
    });
  }
}

/**
 * Paginación para "Ver más" de cada categoría.
 */
export async function browse(ref, page) {
  await null;
  const pageNum = page ? Math.max(1, parseInt(String(page), 10) || 1) : 1;

  try {
    let url = "";
    let isProgram = false;

    if (ref === "series") {
      isProgram = true;
      url = `${BASE_URL}/programa?per_page=20&page=${pageNum}&_embed`;
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

  // Si es un programa con múltiples episodios en ACF
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

  // Si es un asset individual
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

      // Ofrecemos episodios del 1 al 20 vinculados a este título para asegurar compatibilidad con TMDB
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
 * Resuelve la URL directa del video en YouTube usando la API de Innertube (cliente Android).
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
      const streamingData = data && data.streamingData;
      if (!streamingData) continue;

      const formats = Array.isArray(streamingData.formats) ? streamingData.formats : [];
      const progFormats = formats
        .filter(f => f && typeof f.url === "string" && f.url.startsWith("https://"))
        .sort((a, b) => (Number(b.height) || 0) - (Number(a.height) || 0));

      if (progFormats.length === 0) continue;

      const best = progFormats[0];
      const mime = String(best.mimeType || "").split(";")[0].trim() || "video/mp4";
      const alternatives = progFormats.slice(1).map(f => ({
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
 * Resuelve la reproducción directa para Kino.
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
    targetYtId = ref.slice(3);
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
    const stream = await resolveYoutubeDirect(targetYtId);
    if (stream) {
      return stream;
    }
  }

  throw kino.error("not_found", "Video no disponible", {
    userMessage: "Este video no se encuentra disponible para reproducción en este momento."
  });
}
