(function () {
    const VERSION = "v5.0 API-Only";
    const THEME = { bg: "#1A1A1B", accent: "#D7FF00", main: "#FFFFFF" };
    const API_HOST_RE = /^api\.music\.yandex\.(ru|net|kz|by|com)$/i;

    const seenTrackIds = new Set();
    const exportRows = new Map();
    let playlistTitle = "playlist";
    let playlistId = "unknown";
    let expectedTrackCount = 0;
    let captureCount = 0;

    const panel = document.createElement("div");
    panel.style = `position:fixed;top:24px;right:24px;z-index:100000;background:${THEME.bg};color:${THEME.main};padding:24px;border-radius:12px;width:320px;font-family:sans-serif;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,0.8);border:1px solid #333;`;
    panel.innerHTML = `
        <div style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:2px;margin-bottom:12px;">yandex-music-transit</div>
        <div id="ym-count" style="font-size:56px;font-weight:700;margin-bottom:6px;color:${THEME.accent};line-height:1;">0</div>
        <div id="ym-phase" style="font-size:11px;font-weight:bold;color:${THEME.accent};text-transform:uppercase;margin-bottom:6px;">INIT</div>
        <div id="ym-status" style="font-size:12px;opacity:0.8;margin-bottom:14px;">Installing API capture...</div>
        <div style="width:100%;height:2px;background:#333;margin-bottom:14px;">
            <div id="ym-bar" style="width:0%;height:100%;background:${THEME.accent};transition:0.2s;"></div>
        </div>
        <div style="display:flex;gap:8px;">
            <button id="ym-save" style="flex:1;background:${THEME.accent};color:#000;border:none;padding:10px;border-radius:4px;font-weight:700;cursor:pointer;text-transform:uppercase;">Save TXT</button>
            <button id="ym-stop" style="flex:1;background:#2d2d2e;color:#fff;border:1px solid #444;padding:10px;border-radius:4px;font-weight:700;cursor:pointer;text-transform:uppercase;">Stop</button>
        </div>
    `;
    document.body.appendChild(panel);

    const elCount = panel.querySelector("#ym-count");
    const elPhase = panel.querySelector("#ym-phase");
    const elStatus = panel.querySelector("#ym-status");
    const elBar = panel.querySelector("#ym-bar");
    const btnSave = panel.querySelector("#ym-save");
    const btnStop = panel.querySelector("#ym-stop");

    const update = (phase, status, progress) => {
        const p = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
        elCount.innerText = String(exportRows.size);
        elPhase.innerText = phase;
        elStatus.innerText = status;
        elBar.style.width = `${p}%`;
    };

    const normalizeText = (value) => String(value || "").replace(/\s+/g, " ").trim();

    const parseMetaFromUrl = () => {
        const href = window.location.href;
        const usersPlaylist = href.match(/\/users\/([^/]+)\/playlists\/([^/?#]+)/i);
        if (usersPlaylist) {
            return {
                owner: decodeURIComponent(usersPlaylist[1]),
                kind: decodeURIComponent(usersPlaylist[2]),
                uuid: null
            };
        }
        const uuidPlaylist = href.match(/\/playlists\/([^/?#]+)/i);
        if (uuidPlaylist) {
            return { owner: null, kind: null, uuid: decodeURIComponent(uuidPlaylist[1]) };
        }
        return { owner: null, kind: null, uuid: null };
    };

    const saveTxt = () => {
        const rows = Array.from(exportRows.values()).sort((a, b) => a.localeCompare(b, "ru"));
        const header = [
            `Yandex Music Transit Export | ${VERSION}`,
            `Playlist: ${playlistTitle}`,
            `Playlist ID: ${playlistId}`,
            `Captured: ${rows.length}`,
            expectedTrackCount ? `Expected: ${expectedTrackCount}` : "Expected: unknown",
            "---",
            ""
        ].join("\n");
        const text = header + rows.join("\n");
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `yandex_playlist_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const putTrack = (track) => {
        const source = track?.track || track || {};
        const id = String(track?.id || source?.id || "");
        const title = normalizeText(source?.title);
        const artistsArr = Array.isArray(source?.artists) ? source.artists : [];
        const artists = normalizeText(artistsArr.map((a) => a?.name).filter(Boolean).join(", "));
        if (!title || !artists) return;
        if (id && seenTrackIds.has(id)) return;
        if (id) seenTrackIds.add(id);
        exportRows.set(`${artists} - ${title}`, `${artists} - ${title}`);
    };

    const parsePlaylistPayload = (payload) => {
        if (!payload || typeof payload !== "object") return false;

        const playlist = payload.playlist || payload.result?.playlist || payload;
        const tracks = Array.isArray(playlist?.tracks) ? playlist.tracks : Array.isArray(payload?.tracks) ? payload.tracks : null;
        if (!tracks || tracks.length === 0) return false;

        if (playlist?.title) playlistTitle = normalizeText(playlist.title) || playlistTitle;
        if (playlist?.playlistUuid || payload?.playlistUuid) {
            playlistId = String(playlist.playlistUuid || payload.playlistUuid);
        }
        if (playlist?.kind && playlistId === "unknown") playlistId = String(playlist.kind);
        const countCandidate = Number(playlist?.trackCount || playlist?.track_count || payload?.trackCount || 0);
        if (Number.isFinite(countCandidate) && countCandidate > 0) expectedTrackCount = Math.max(expectedTrackCount, countCandidate);

        tracks.forEach(putTrack);
        captureCount += 1;
        return true;
    };

    const scanAnyJsonForTracks = (payload) => {
        if (!payload || typeof payload !== "object") return false;
        if (parsePlaylistPayload(payload)) return true;
        for (const value of Object.values(payload)) {
            if (value && typeof value === "object") {
                if (scanAnyJsonForTracks(value)) return true;
            }
        }
        return false;
    };

    const originalFetch = window.fetch.bind(window);
    let active = true;

    const isPlaylistApiUrl = (urlRaw) => {
        try {
            const u = new URL(urlRaw, window.location.origin);
            if (!API_HOST_RE.test(u.hostname)) return false;
            return u.pathname.startsWith("/playlist/") || u.pathname.includes("playlist");
        } catch {
            return false;
        }
    };

    const withRichTracks = (urlRaw) => {
        try {
            const u = new URL(urlRaw, window.location.origin);
            if (u.searchParams.get("richTracks") !== "true") {
                u.searchParams.set("richTracks", "true");
            }
            return u.toString();
        } catch {
            return urlRaw;
        }
    };

    window.fetch = async (input, init) => {
        const urlRaw = typeof input === "string" ? input : input?.url;
        const maybePlaylist = urlRaw && isPlaylistApiUrl(urlRaw);
        const finalInput = maybePlaylist ? withRichTracks(urlRaw) : input;

        const response = await originalFetch(finalInput, init);
        if (!active) return response;

        try {
            const ct = response.headers.get("content-type") || "";
            if (!ct.includes("application/json")) return response;
            if (!maybePlaylist) return response;

            const data = await response.clone().json();
            const parsed = scanAnyJsonForTracks(data);
            if (parsed) {
                const completion = expectedTrackCount > 0
                    ? Math.min(98, Math.floor((exportRows.size / expectedTrackCount) * 100))
                    : Math.min(98, 20 + captureCount * 10);
                const suffix = expectedTrackCount > 0 ? ` (${exportRows.size}/${expectedTrackCount})` : ` (${exportRows.size})`;
                update("CAPTURE", `Captured from API${suffix}`, completion);
            }
        } catch (error) {
            update("CAPTURE", `JSON parse warning: ${error?.message || "unknown"}`, 15);
        }

        return response;
    };

    const requestJson = async (url) => {
        const res = await originalFetch(url, {
            method: "GET",
            credentials: "include",
            headers: { "X-Requested-With": "XMLHttpRequest" }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    };

    const runActiveProbes = async () => {
        const meta = parseMetaFromUrl();
        const probes = [];

        if (meta.owner && meta.kind) {
            const h = new URL("https://music.yandex.ru/handlers/playlist.jsx");
            h.searchParams.set("owner", meta.owner);
            h.searchParams.set("kinds", meta.kind);
            h.searchParams.set("light", "false");
            h.searchParams.set("lang", "ru");
            h.searchParams.set("external-domain", "music.yandex.ru");
            h.searchParams.set("overembed", "no");
            h.searchParams.set("ncrnd", String(Math.random()));
            probes.push(h.toString());
        }

        if (meta.uuid) {
            const apiCandidate = new URL(`https://api.music.yandex.ru/playlist/${encodeURIComponent(meta.uuid)}`);
            apiCandidate.searchParams.set("richTracks", "true");
            probes.push(apiCandidate.toString());
        }

        if (probes.length === 0) {
            update("WAITING", "Open a playlist page, then run script", 5);
            return;
        }

        update("PROBE", `Trying ${probes.length} API probe(s)...`, 10);

        for (const url of probes) {
            try {
                const data = await requestJson(url);
                const parsed = scanAnyJsonForTracks(data);
                if (parsed) {
                    const suffix = expectedTrackCount > 0 ? ` ${exportRows.size}/${expectedTrackCount}` : ` ${exportRows.size}`;
                    update("PROBE", `Probe success:${suffix}`, 65);
                    return;
                }
            } catch (error) {
                update("PROBE", `Probe failed: ${error?.message || "unknown"}`, 20);
            }
        }

        update("CAPTURE", "Listening for playlist API in background...", 35);
    };

    const finalize = () => {
        const complete = expectedTrackCount > 0 && exportRows.size >= expectedTrackCount;
        if (complete) {
            update("COMPLETE", `Ready (${exportRows.size}/${expectedTrackCount})`, 100);
        } else if (exportRows.size > 0) {
            const exp = expectedTrackCount > 0 ? `/${expectedTrackCount}` : "";
            update("PARTIAL", `Captured ${exportRows.size}${exp}. You can Save TXT now.`, 100);
        } else {
            update("EMPTY", "No tracks captured yet. Open/reopen playlist page.", 100);
        }
    };

    const stop = () => {
        active = false;
        window.fetch = originalFetch;
        update("STOPPED", "Fetcher restored. You can still Save TXT.", 100);
    };

    btnSave.onclick = saveTxt;
    btnStop.onclick = stop;

    window.stopYmTransitExporter = stop;
    window.saveYmTransitExporter = saveTxt;

    update("INIT", "API interceptor installed", 2);
    runActiveProbes()
        .catch((error) => update("ERROR", error?.message || "probe crash", 100))
        .finally(() => {
            setTimeout(finalize, 1500);
            setTimeout(finalize, 6000);
            setTimeout(finalize, 12000);
        });
})();