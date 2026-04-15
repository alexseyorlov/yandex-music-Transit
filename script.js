(async () => {
    const VERSION = "v4.4 Transit (Gravity Drift)";
    const tracks = new Map();
    let isRunning = true;
    const THEME = { bg: '#1A1A1B', accent: '#D7FF00', main: '#FFFFFF' };

    const panel = document.createElement('div');
    panel.style = `position:fixed;top:24px;right:24px;z-index:100000;background:${THEME.bg};color:${THEME.main};padding:30px;border-radius:12px;width:280px;font-family:sans-serif;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,0.8);border:1px solid #333;`;
    panel.innerHTML = `
        <div style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:2px;margin-bottom:15px;">yandex-music-Transit</div>
        <div id="ym-count" style="font-size:64px;font-weight:700;margin-bottom:10px;color:${THEME.accent};line-height:1;">0</div>
        <div id="ym-phase" style="font-size:11px;font-weight:bold;color:${THEME.accent};text-transform:uppercase;margin-bottom:5px;">Ready</div>
        <div id="ym-status" style="font-size:12px;margin-bottom:20px;opacity:0.7;">Waiting for ignition</div>
        <div style="width:100%;height:2px;background:#333;"><div id="ym-bar" style="width:0%;height:100%;background:${THEME.accent};transition:0.3s;"></div></div>
    `;
    document.body.appendChild(panel);

    const update = (count, phase, status, prog) => {
        document.getElementById('ym-count').innerText = count;
        document.getElementById('ym-phase').innerText = phase;
        document.getElementById('ym-status').innerText = status;
        document.getElementById('ym-bar').style.width = `${prog}%`;
    };

    const grab = () => {
        const rows = document.querySelectorAll('[data-index]');
        rows.forEach(row => {
            const t = row.querySelector('a[href*="/track/"]');
            const a = row.querySelectorAll('a[href*="/artist/"]');
            if (t && a.length > 0) {
                const entry = `${Array.from(a).map(el => el.innerText).join(', ')} - ${t.innerText}`;
                tracks.set(entry, true);
            }
        });
    };

    const scroller = document.querySelector('[data-virtuoso-scroller="true"]') || document.documentElement;

    const descent = async () => {
        let lastPos = -1;
        let stuck = 0;
        while (isRunning) {
            const cur = scroller.scrollTop || window.scrollY;
            const max = (scroller.scrollHeight || document.body.scrollHeight) - (scroller.clientHeight || window.innerHeight);
            if (cur >= max - 20 || stuck > 30) break;
            if (Math.abs(cur - lastPos) < 2) stuck++; else stuck = 0;
            lastPos = cur;
            const step = 3600;
            scroller.scrollTop += step;
            if (scroller === document.documentElement) window.scrollBy(0, step);
            grab();
            update(tracks.size, "PHASE 1: DESCENT", "High-speed drift down...", Math.min(50, (cur/max)*50));
            await new Promise(r => setTimeout(r, 250));
        }
    };

    const ascent = async () => {
        let lastPos = -1;
        let stuck = 0;
        while (isRunning) {
            const cur = scroller.scrollTop || window.scrollY;
            if (cur <= 0 || stuck > 60) break;
            if (Math.abs(cur - lastPos) < 2) stuck++; else stuck = 0;
            lastPos = cur;
            const step = 700;
            scroller.scrollTop -= step;
            if (scroller === document.documentElement) window.scrollBy(0, -step);
            grab();
            const prog = Math.min(100, 50 + (1 - cur / (scroller.scrollHeight || 1)) * 50);
            update(tracks.size, "PHASE 2: ASCENT", "Deep precision scanning...", prog);
            await new Promise(r => setTimeout(r, 500));
        }
    };

    await descent();
    await new Promise(r => setTimeout(r, 1500)); 
    await ascent();

    update(tracks.size, "COMPLETE", "Verification success", 100);
    const btn = document.createElement('button');
    btn.innerText = "SAVE RESULTS";
    btn.style = `width:100%;background:${THEME.accent};color:#000;border:none;padding:14px;border-radius:4px;font-weight:800;cursor:pointer;margin-top:15px;text-transform:uppercase;`;
    btn.onclick = () => {
        const out = `Yandex Music Transit Export | ${VERSION}\nTotal: ${tracks.size}\n---\n\n` + Array.from(tracks.keys()).sort().join('\n');
        const blob = new Blob([out], {type:'text/plain'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `yandex_transit_v4_4.txt`;
        a.click();
    };
    panel.appendChild(btn);
})();