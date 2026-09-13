/* Browser-observed detection throughput. RTT includes socket timeout/HTTP fallback. */
(() => {
    let run = null, timer = null, sampling = false;
    const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    const p95 = xs => {
        if (!xs.length) return null;
        const sorted = [...xs].sort((a, b) => a - b), pos = (sorted.length - 1) * .95;
        const lo = Math.floor(pos), hi = Math.ceil(pos);
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
    };
    function summary() {
        if (!run) return null;
        const duration = Math.max(0, ((run.end ?? performance.now()) - run.measureStart) / 1000);
        const cameras = [...new Set(run.requests.map(r => r.camera))].map(camera => {
            const requests = run.requests.filter(r => r.camera === camera);
            const done = requests.filter(r => r.ok);
            const latency = done.map(r => r.rtt_ms), detect = done.map(r => r.detect_logic_ms).filter(Number.isFinite);
            return {camera, task: requests[0].task, seconds: duration, started: requests.length,
                completed: done.length, errors: requests.filter(r => r.error).length,
                unfinished: requests.filter(r => r.finished === undefined).length,
                fps: duration ? done.length / duration : null,
                request_rtt_mean_ms: mean(latency), request_rtt_p95_ms: p95(latency),
                detect_logic_mean_ms: mean(detect), detect_logic_p95_ms: p95(detect)};
        });
        const stats = xs => ({samples: xs.length, mean: mean(xs), peak: xs.length ? Math.max(...xs) : null});
        const resources = {};
        for (const key of ['cpu_percent', 'ram_gb', 'process_ram_gb'])
            resources[key] = stats(run.resources.map(r => r[key]).filter(Number.isFinite));
        resources.gpus = [...new Set(run.resources.flatMap(r => (r.gpus || []).map(g => g.index)))].map(index => {
            const samples = run.resources.flatMap(r => r.gpus || []).filter(g => g.index === index);
            return {index, name: samples[0].name, percent: stats(samples.map(g => g.percent)),
                vram_gb: stats(samples.map(g => g.vram_gb))};
        });
        return {id: run.id, started_at: run.started_at, warmup_seconds: run.warmup,
            requested_seconds: run.duration, measured_seconds: duration, cameras, resources,
            limitations: ['FPS is completed browser detection requests per measurement second, not source video FPS.',
                'Request RTT includes upload, server work, transport and HTTP fallback; not alert end-to-end latency.',
                'detect_logic_ms is detector pipeline wall time, not GPU-only inference.',
                'CPU/RAM/GPU totals include other applications. Missing values are null, not zero.',
                'This tool does not start cameras or measure dropped source frames. Keep the tab visible.',
                'Record model/checkpoint, thresholds, video resolution and source separately.'],
            notes: run.notes, hidden_tab_events: run.hidden};
    }
    window.webBenchmark = {
        begin(camera, task) {
            const now = performance.now();
            if (!run || run.end !== undefined || now < run.measureStart || now >= run.deadline) return null;
            const ticket = {camera, task, start: now}; run.requests.push(ticket); return ticket;
        },
        record(ticket, data) {
            const now = performance.now();
            if (!ticket || !run || run.end !== undefined || !run.requests.includes(ticket) || now >= run.deadline) return;
            ticket.finished = now;
            ticket.ok = !!data && !data.error;
            ticket.error = data?.error || (!data ? 'No response' : undefined);
            ticket.rtt_ms = now - ticket.start;
            ticket.detect_logic_ms = data?.benchmark?.detect_logic_ms ?? null;
        }
    };
    function stop() {
        if (!run || run.end !== undefined) return;
        run.end = Math.min(performance.now(), run.deadline);
        clearInterval(timer); timer = null; render();
    }
    async function tick() {
        if (!run || run.end !== undefined) return;
        if (performance.now() >= run.deadline) { stop(); return; }
        render();
        if (performance.now() < run.measureStart || sampling) return;
        sampling = true;
        const current = run;
        try {
            const response = await fetch('/api/benchmark/resources', {signal: AbortSignal.timeout(5000)});
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (run === current && run.end === undefined && performance.now() < run.deadline)
                run.resources.push({...data, elapsed_seconds: (performance.now() - run.measureStart) / 1000});
        } catch (e) {
            current.resource_errors.push(String(e));
        } finally { sampling = false; }
    }
    function render() {
        const output = document.getElementById('benchmark-output');
        if (!output || !run) return;
        const s = summary(), number = n => n === null ? '—' : n.toFixed(2);
        let text = performance.now() < run.measureStart && run.end === undefined
            ? `Đang ổn định: còn ${Math.ceil((run.measureStart - performance.now()) / 1000)} giây`
            : `${run.end === undefined ? 'Đang đo' : 'Đã dừng'}: ${s.measured_seconds.toFixed(1)} giây; ${s.cameras.length} camera có gửi frame`;
        for (const c of s.cameras) text += `\n${c.camera} (${c.task}): ${number(c.fps)} FPS | detect ${number(c.detect_logic_mean_ms)} ms | RTT P95 ${number(c.request_rtt_p95_ms)} ms | ${c.completed}/${c.started} hoàn tất`;
        text += `\nCPU TB: ${number(s.resources.cpu_percent.mean)}% | RAM TB: ${number(s.resources.ram_gb.mean)} GB`;
        for (const g of s.resources.gpus) text += `\n${g.name}: GPU ${number(g.percent.mean)}% | VRAM ${number(g.vram_gb.mean)} GB`;
        if (run.resource_errors.length) text += '\nKhông lấy được một số mẫu tài nguyên; xem JSON.';
        if (run.hidden.length) text += '\nTab đã bị ẩn trong phiên đo; kết quả có thể bị trình duyệt giới hạn.';
        output.textContent = text;
        document.getElementById('benchmark-start').disabled = run.end === undefined;
    }
    function download(csv) {
        if (!run) return;
        const s = summary();
        let body;
        if (csv) {
            const columns = ['camera','task','seconds','started','completed','errors','unfinished','fps',
                'request_rtt_mean_ms','request_rtt_p95_ms','detect_logic_mean_ms','detect_logic_p95_ms'];
            const quote = x => '"' + String(x ?? '').replaceAll('"','""') + '"';
            body = '\uFEFF' + [columns, ...s.cameras.map(c => columns.map(k => c[k]))].map(row => row.map(quote).join(',')).join('\r\n');
        } else body = JSON.stringify({summary: s, frames: run.requests, resource_samples: run.resources,
            resource_errors: run.resource_errors}, null, 2);
        const url = URL.createObjectURL(new Blob([body], {type: csv ? 'text/csv;charset=utf-8' : 'application/json'}));
        const a = document.createElement('a'); a.href = url; a.download = `${run.id}.${csv ? 'csv' : 'json'}`;
        a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    document.addEventListener('visibilitychange', () => {
        if (run && run.end === undefined && document.hidden) run.hidden.push(new Date().toISOString());
    });
    document.addEventListener('DOMContentLoaded', () => {
        const host = document.querySelector('.top-header'); if (!host) return;
        const panel = document.createElement('details'); panel.className = 'info-tabs';
        panel.style.cssText = 'margin:16px 24px;padding:18px;';
        panel.innerHTML = `<summary style="cursor:pointer;font-weight:700">Đo hiệu năng camera</summary>
            <p style="margin:12px 0">Bật các camera cần thử trước khi đo, giữ tab này hiển thị. RTT là thời gian gửi frame đến nhận kết quả, không phải độ trễ cảnh báo.</p>
            <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
            <label>Ổn định (giây) <input id="benchmark-warmup" type="number" min="0" max="600" value="60" style="width:75px"></label>
            <label>Đo (giây) <input id="benchmark-duration" type="number" min="5" max="1800" value="300" style="width:85px"></label>
            <input id="benchmark-notes" placeholder="Ghi model, video, độ phân giải…" aria-label="Cấu hình phiên đo">
            <button class="detail-btn" id="benchmark-start">Bắt đầu đo</button>
            <button class="detail-btn" id="benchmark-stop">Dừng</button>
            <button class="detail-btn" id="benchmark-json">Tải JSON đầy đủ</button>
            <button class="detail-btn" id="benchmark-csv">Tải CSV camera</button></div>
            <pre id="benchmark-output" style="white-space:pre-wrap;margin-top:12px">Chưa có phiên đo.</pre>`;
        host.after(panel);
        document.getElementById('benchmark-start').onclick = () => {
            if (run && run.end === undefined) return;
            const warmup = Number(document.getElementById('benchmark-warmup').value);
            const duration = Number(document.getElementById('benchmark-duration').value);
            if (!Number.isFinite(warmup) || warmup < 0 || warmup > 600 || !Number.isFinite(duration) || duration < 5 || duration > 1800) {
                document.getElementById('benchmark-output').textContent = 'Ổn định: 0–600 giây; đo: 5–1800 giây.'; return;
            }
            const now = performance.now();
            run = {id: 'benchmark_' + Date.now(), started_at: new Date().toISOString(), warmup, duration,
                measureStart: now + warmup*1000, deadline: now + (warmup+duration)*1000,
                requests: [], resources: [], resource_errors: [], hidden: [],
                notes: document.getElementById('benchmark-notes').value};
            timer = setInterval(tick, 1000); tick(); render();
        };
        document.getElementById('benchmark-stop').onclick = stop;
        document.getElementById('benchmark-json').onclick = () => download(false);
        document.getElementById('benchmark-csv').onclick = () => download(true);
    });
})();
