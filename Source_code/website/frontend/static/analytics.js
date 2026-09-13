/**
 * SPECTRA GUARD - ANALYTICS ENGINE
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Khởi tạo các biểu đồ
    initCharts();

    // 2. Load Summary Stats
    loadSummary();

    // 3. Load Mặc định Search (20 bản ghi gần nhất)
    performSearch();

    // 4. Sự kiện nút Search
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        searchBtn.onclick = () => {
            currentPage = 1;
            performSearch();
        };
    }

    // 5. Sự kiện Pagination
    document.getElementById('prevPage').onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            renderResults();
        }
    };
    document.getElementById('nextPage').onclick = () => {
        const totalPages = Math.ceil(allSearchResults.length / pageSize);
        if (currentPage < totalPages) {
            currentPage++;
            renderResults();
        }
    };

    // 6. Khởi tạo Thông báo & Admin link
    fetch('/api/profile')
        .then(res => res.json())
        .then(user => {
            if (user && user.role === 'admin') {
                const adminLink = document.getElementById('adminLink');
                if (adminLink) adminLink.style.display = 'flex';
            }
        })
        .catch(err => {});

    initNotifications();
});

let trendChart = null;
let distChart = null;
let hourlyChart = null;
let offenderChart1 = null;
let offenderChart2 = null;
let offenderChart3 = null;
let allSearchResults = [];
let currentPage = 1;
const pageSize = 10;
let selectedHour = "all";
let selectedName = ""; 
let selectedWeapon = "";
let filterStartDate = "";
let filterEndDate = "";
let lastSeenNotifId = localStorage.getItem('lastSeenNotifId') || 0;


// Hàm làm mới toàn bộ Dashboard dựa trên bộ lọc hiện tại
async function refreshDashboard() {
    console.log("🚀 Đang làm mới Dashboard...");
    const params = new URLSearchParams();
    if (filterStartDate) params.append('start', filterStartDate);
    if (filterEndDate) params.append('end', filterEndDate);
    if (selectedHour !== "all") params.append('hour', selectedHour);
    if (selectedName) params.append('identity', selectedName);

    const queryStr = params.toString();

    // Tải song song để đảm bảo tốc độ và tính chống lỗi
    const updateTask = async (url, callback) => {
        try {
            const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}${queryStr}`);
            const data = await res.json();
            callback(data);
        } catch (e) { console.error(`Lỗi tải từ ${url}:`, e); }
    };

    // 1. Cập nhật Summary & Biểu đồ tròn
    updateTask('/api/analytics/summary', (sumData) => {
        if (document.getElementById('totalViolations')) document.getElementById('totalViolations').innerText = sumData.total;
        if (document.getElementById('todayViolations')) document.getElementById('todayViolations').innerText = sumData.today;
        const topOffenderEl = document.getElementById('topOffender');
        if (topOffenderEl) {
            topOffenderEl.innerText = sumData.top_offender_count > 0 ? `${sumData.top_offender_name} (${sumData.top_offender_count} lần)` : "Chưa có";
        }
        if (distChart) {
            const normalized = normalizeCamDistribution(sumData.cam_distribution);
            distChart.data.labels = Object.keys(normalized);
            distChart.data.datasets[0].data = Object.values(normalized);
            distChart.update();
        }
    });

    // 2. Cập nhật Biểu đồ Xu hướng
    updateTask('/api/analytics/daily', (dailyData) => {
        if (trendChart) {
            trendChart.data.labels = dailyData.map(d => d.date);
            trendChart.data.datasets[0].data = dailyData.map(d => d.count);
            trendChart.update();
        }
    });

    // 3. Cập nhật Biểu đồ Khung giờ
    updateTask('/api/analytics/hourly', (hourlyData) => {
        if (hourlyChart) {
            hourlyChart.data.datasets[0].data = hourlyData;
            // Cập nhật lại màu sắc động dựa trên giá trị mới
            hourlyChart.data.datasets[0].backgroundColor = hourlyData.map(v => {
                if (v > 10) return 'rgba(255, 51, 102, 0.8)';
                if (v > 5) return 'rgba(255, 136, 0, 0.7)';
                return 'rgba(0, 212, 255, 0.6)';
            });
            hourlyChart.update();
        }
    });

    // 4. Cập nhật Top Offenders
    updateTask('/api/analytics/offenders_weekly', (offData) => {
        if (offData.cam1 && offenderChart1) {
            offenderChart1.data.labels = offData.cam1.map(o => o.name);
            offenderChart1.data.datasets[0].data = offData.cam1.map(o => o.count);
            offenderChart1.update();
        }
        if (offData.cam2 && offenderChart2) {
            offenderChart2.data.labels = offData.cam2.map(o => o.name);
            offenderChart2.data.datasets[0].data = offData.cam2.map(o => o.count);
            offenderChart2.update();
        }
        if (offData.cam3 && offenderChart3) {
            offenderChart3.data.labels = weaponLabels;
            offenderChart3.data.datasets[0].data = weaponCounts(offData.cam3);
            offenderChart3.update();
        }
    });

    // 5. Cập nhật bảng tìm kiếm
    performSearch();
}

const weaponLabels = ['Gậy', 'Súng', 'Dao'];

function weaponCounts(rows = []) {
    return weaponLabels.map(name => rows.find(row => row.name === name)?.count ?? 0);
}

function normalizeCamDistribution(dist) {
    if (!dist) return {};
    const result = {};
    for (const [key, val] of Object.entries(dist)) {
        let normKey = key ? key.trim() : "Phát hiện khác";
        const lower = normKey.toLowerCase();
        if (lower.includes('đánh nhau') || lower.includes('hành vi') || lower.includes('fight') || lower.includes('behavior')) {
            normKey = "Nhận diện hành vi đánh nhau";
        } else if (lower.includes('vũ khí') || lower.includes('weapon') || lower.includes('gậy') || lower.includes('dao')) {
            normKey = "Phát hiện vũ khí";
        } else if (lower.includes('đám đông') || lower.includes('crowd') || lower.includes('tụ tập')) {
            normKey = "Phát hiện đám đông";
        } else if (lower.includes('khuôn mặt') || lower.includes('face')) {
            normKey = "Nhận diện khuôn mặt";
        }
        result[normKey] = (result[normKey] || 0) + Number(val);
    }
    return result;
}

async function initCharts() {
    try {
        // Fetch Daily Data
        const resDaily = await fetch('/api/analytics/daily');
        const dailyData = await resDaily.json();

        // Canvas trendChart
        const ctxTrend = document.getElementById('trendChart').getContext('2d');
        trendChart = new Chart(ctxTrend, {
            type: 'line',
            data: {
                labels: dailyData.map(d => d.date),
                datasets: [{
                    label: 'Số lượng vi phạm',
                    data: dailyData.map(d => d.count),
                    borderColor: '#00ffcc',
                    backgroundColor: 'rgba(0, 255, 204, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#00ffcc',
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false }
                },
                onClick: (e, activeEls) => {
                    if (activeEls.length > 0) {
                        const idx = activeEls[0].index;
                        const dateStr = trendChart.data.labels[idx];
                        const parts = dateStr.split('/');
                        if (parts.length === 2) {
                            const year = new Date().getFullYear();
                            const formattedDate = `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                            filterStartDate = formattedDate;
                            filterEndDate = formattedDate;
                            // Đồng bộ với ô input
                            document.getElementById('filterStart').value = formattedDate;
                            document.getElementById('filterEnd').value = formattedDate;
                            
                            updateQuickFilterUI(`Ngày: ${dateStr}`);
                            refreshDashboard();
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#aaa' } },
                    x: { grid: { display: false }, ticks: { color: '#aaa' } }
                }
            }
        });

        // Fetch Summary for Pie Chart
        const resSum = await fetch('/api/analytics/summary');
        const summary = await resSum.json();
        const normDist = normalizeCamDistribution(summary.cam_distribution);

        const ctxDist = document.getElementById('distChart').getContext('2d');
        distChart = new Chart(ctxDist, {
            type: 'doughnut',
            data: {
                labels: Object.keys(normDist),
                datasets: [{
                    data: Object.values(normDist),
                    backgroundColor: ['#00d4ff', '#ff3366', '#ff8800', '#00ffcc'],
                    borderWidth: 0,
                    hoverOffset: 15
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#aaa', padding: 20, font: { size: 12 } }
                    }
                },
                onClick: (e, activeEls) => {
                    if (activeEls.length > 0) {
                        const idx = activeEls[0].index;
                        const camName = distChart.data.labels[idx];
                        document.getElementById('filterCam').value = camName;
                        updateQuickFilterUI(`Camera: ${camName}`);
                        refreshDashboard();
                    }
                },
                cutout: '70%'
            }
        });

        // 3. Hourly Heatmap Chart
        const resHourly = await fetch('/api/analytics/hourly');
        const hourlyData = await resHourly.json();

        const ctxHourly = document.getElementById('hourlyChart').getContext('2d');
        const hourlyLabels = Array.from({length: 24}, (_, i) => `${i}h`);
        
        hourlyChart = new Chart(ctxHourly, {
            type: 'bar',
            data: {
                labels: hourlyLabels,
                datasets: [{
                    label: 'Số vụ vi phạm',
                    data: hourlyData,
                    backgroundColor: hourlyData.map(v => {
                        if (v > 10) return 'rgba(255, 51, 102, 0.8)';
                        if (v > 5) return 'rgba(255, 136, 0, 0.7)';
                        return 'rgba(0, 212, 255, 0.6)';
                    }),
                    borderRadius: 5,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (e, activeEls) => {
                    if (activeEls.length > 0) {
                        const idx = activeEls[0].index;
                        selectedHour = idx;
                        updateQuickFilterUI(`Khung giờ: ${idx}h`);
                        refreshDashboard();
                    }
                },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        grid: { color: 'rgba(255,255,255,0.05)' }, 
                        ticks: { color: '#aaa', stepSize: 1 } 
                    },
                    x: { 
                        grid: { display: false }, 
                        ticks: { color: '#888', font: { size: 10 } } 
                    }
                }
            }
        });

        // 4. TOP OFFENDERS WEEKLY
        const resOff = await fetch('/api/analytics/offenders_weekly');
        const offData = await resOff.json();

        // Chart Cam 1 (Tần suất ra vào)
        const ctx1El = document.getElementById('offenderChart1');
        if (ctx1El) {
            const ctx1 = ctx1El.getContext('2d');
            offenderChart1 = new Chart(ctx1, {
                type: 'bar',
                data: {
                    labels: offData.cam1.map(o => o.name),
                    datasets: [{
                        label: 'Lần xuất hiện',
                        data: offData.cam1.map(o => o.count),
                        backgroundColor: 'rgba(0, 212, 255, 0.6)',
                        borderRadius: 5
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    onClick: (e, activeEls) => {
                        if (activeEls.length > 0) {
                            const idx = activeEls[0].index;
                            const name = offenderChart1.data.labels[idx];
                            selectedName = name;
                            updateQuickFilterUI(`Đối tượng: ${name}`);
                            refreshDashboard();
                        }
                    }
                }
            });
        }

        // Chart Cam 2 (Gây gổ/Đánh nhau)
        const ctx2 = document.getElementById('offenderChart2').getContext('2d');
        offenderChart2 = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: offData.cam2.map(o => o.name),
                datasets: [{
                    label: 'Số lần gây gổ',
                    data: offData.cam2.map(o => o.count),
                    backgroundColor: 'rgba(255, 51, 102, 0.8)',
                    borderRadius: 5
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                onClick: (e, activeEls) => {
                    if (activeEls.length > 0) {
                        const idx = activeEls[0].index;
                        const name = offenderChart2.data.labels[idx];
                        selectedName = name;
                        updateQuickFilterUI(`Học sinh: ${name}`);
                        refreshDashboard();
                    }
                }
            }
        });

        // Chart Cam 3 (Xuất hiện vũ khí)
        const ctx3El = document.getElementById('offenderChart3');
        if (ctx3El) {
            const ctx3 = ctx3El.getContext('2d');
            offenderChart3 = new Chart(ctx3, {
                type: 'bar',
                data: {
                    labels: weaponLabels,
                    datasets: [{
                        label: 'Số lần phát hiện vũ khí',
                        data: weaponCounts(offData.cam3),
                        backgroundColor: 'rgba(255, 204, 0, 0.8)',
                        borderRadius: 5
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    onClick: (e, activeEls) => {
                        if (activeEls.length > 0) {
                            const idx = activeEls[0].index;
                            const name = offenderChart3.data.labels[idx];
                            selectedWeapon = name;
                            selectedName = "";
                            currentPage = 1;
                            updateQuickFilterUI(`Vũ khí: ${name}`);
                            performSearch();
                            document.getElementById('searchTitle')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }
                }
            });
        }

    } catch (err) {
        console.error("Lỗi khởi tạo biểu đồ:", err);
    }
}

async function loadSummary() {
    try {
        const res = await fetch('/api/analytics/summary');
        const data = await res.json();

        if (document.getElementById('totalViolations')) document.getElementById('totalViolations').innerText = data.total;
        if (document.getElementById('todayViolations')) document.getElementById('todayViolations').innerText = data.today;
        
        const topOffenderEl = document.getElementById('topOffender');
        if (topOffenderEl) {
            if (data.top_offender_count > 0) {
                topOffenderEl.innerText = `${data.top_offender_name} (${data.top_offender_count} lần)`;
            } else {
                topOffenderEl.innerText = "Chưa có";
            }
        }
    } catch (err) {
        console.error("Lỗi load summary:", err);
    }
}

async function performSearch() {
    const cam = document.getElementById('filterCam').value;
    const type = document.getElementById('filterType').value;
    const start = document.getElementById('filterStart').value;
    const end = document.getElementById('filterEnd').value;

    const tbody = document.getElementById('resultsBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px; opacity:0.5;"><i class="fas fa-spinner fa-spin"></i> Đang truy vấn...</td></tr>';

    try {
        const params = new URLSearchParams();
        params.append('camera', cam);
        params.append('type', type);
        params.append('start', start);
        params.append('end', end);
        if (selectedWeapon) params.append('weapon', selectedWeapon);
        if (selectedHour !== "all") {
            params.append('hour', selectedHour);
        }
        if (selectedName) {
            params.append('identity', selectedName);
        }

        const res = await fetch(`/api/analytics/search?${params.toString()}`);
        allSearchResults = await res.json();
        
        renderResults();

    } catch (err) {
        console.error("Lỗi search:", err);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px; color:red;">Lỗi kết nối máy chủ</td></tr>';
    }
}

function renderResults() {
    const tbody = document.getElementById('resultsBody');
    if (!tbody) return;
    const totalPages = Math.ceil(allSearchResults.length / pageSize) || 1;
    
    // Update Page Indicator
    const pageInd = document.getElementById('pageIndicator');
    if (pageInd) pageInd.innerText = `Trang ${currentPage} / ${totalPages}`;
    
    // Slice data for current page
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const pageData = allSearchResults.slice(start, end);

    if (pageData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:50px; opacity:0.3;">Không có dữ liệu hiển thị</td></tr>';
        return;
    }

    tbody.innerHTML = pageData.map(item => `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
            <td style="padding: 15px;">
                <img src="${item.image_url}" style="width:100px; height:65px; object-fit:cover; border-radius:8px; border: 1px solid #0ff; cursor:zoom-in;" onclick="showImage('${item.image_url}')">
            </td>
            <td style="padding: 15px; font-family: monospace; color: #aaa;">${item.start_time}</td>
            <td style="padding: 15px; font-weight: 600; color: #00d4ff;">${item.camera_name}</td>
            <td style="padding: 15px;"><span style="background:rgba(255,51,102,0.15); color:#ff3366; padding:4px 12px; border-radius:20px; font-size:0.8rem; font-weight:700;">${
                item.violation_type
                .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|\u26A0\uFE0F|\uD83D\uDD25|\uD83D\uDC64/g, '')
                .replace(/.*ĐANG PHÂN TÍCH\.\.\. /g, '')
                .replace(/.*ID: /g, '')
                .replace(/ ĐANG ĐÁNH NHAU!/g, 'ĐÁNH NHAU')
                .trim()
            }</span></td>
            <td style="padding: 15px; opacity:0.9;">${item.identities}</td>
            <td style="padding: 15px;"><i class="fas fa-circle" style="color:#ffcc00; font-size:0.6rem; margin-right:5px;"></i> ${item.status || "Chưa xử lý"}</td>
            <td style="padding: 15px; color: #888;">${item.processor_name || "---"}</td>
        </tr>
    `).join('');
    
    // Cập nhật trạng thái nút
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    if (prevBtn) {
        prevBtn.disabled = (currentPage === 1);
        prevBtn.style.opacity = (currentPage === 1) ? "0.3" : "1";
    }
    if (nextBtn) {
        nextBtn.disabled = (currentPage === totalPages);
        nextBtn.style.opacity = (currentPage === totalPages) ? "0.3" : "1";
    }
}

window.showImage = (url) => {
    const modal = document.getElementById('imgModal');
    const img = document.getElementById('modalImg');
    if (modal && img) {
        img.src = url;
        modal.style.display = 'flex';
    }
}

function initNotifications() {
    const bell = document.getElementById('notifBell');
    const dropdown = document.getElementById('notifDropdown');
    const dot = document.getElementById('notifDot');
    
    if (!bell || !dropdown) return;

    bell.onclick = (e) => {
        e.stopPropagation();
        const isVisible = dropdown.style.display === 'flex';
        dropdown.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) {
            if (dot) dot.style.display = 'none';
            loadNotifList();
        }
    };

    document.addEventListener('click', () => {
        if (dropdown) dropdown.style.display = 'none';
    });

    setInterval(checkNewNotifications, 5000);
    checkNewNotifications();
}

async function checkNewNotifications() {
    try {
        const res = await fetch('/api/history');
        const history = await res.json();
        if (history.length > 0) {
            const latestId = history[0].id;
            const dot = document.getElementById('notifDot');
            if (latestId > lastSeenNotifId && dot) {
                dot.style.display = 'block';
            }
        }
    } catch (err) {}
}

async function loadNotifList() {
    const list = document.getElementById('notifList');
    if (!list) return;
    try {
        const res = await fetch('/api/history');
        const history = await res.json();
        if (history.length === 0) {
            list.innerHTML = '<div style="padding:20px; text-align:center; opacity:0.5; font-size:0.8rem;">Không có thông báo</div>';
            return;
        }
        lastSeenNotifId = history[0].id;
        localStorage.setItem('lastSeenNotifId', lastSeenNotifId);

        list.innerHTML = history.slice(0, 5).map(item => `
            <div class="notif-item" onclick="location.href='/#searchTitle'">
                <img src="${item.image_url}">
                <div class="notif-msg">
                    <div class="notif-type" style="color:#00ffcc; font-size:0.8rem;">${item.violation_type}</div>
                    <div class="notif-time" style="font-size:0.7rem; opacity:0.6;">${item.camera_name} • ${item.start_time || item.detected_at}</div>
                </div>
            </div>
        `).join('');
    } catch (err) {}
}

function updateQuickFilterUI(text) {
    let el = document.getElementById('quickFilterInfo');
    if (!el) {
        const header = document.getElementById('searchTitle');
        if (!header) return;
        el = document.createElement('span');
        el.id = 'quickFilterInfo';
        el.style = "margin-left: 15px; font-size: 0.9rem; color: #ffcc00; font-weight: normal; background: rgba(255,204,0,0.1); padding: 4px 12px; border-radius: 4px; border: 1px solid #ffcc00; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;";
        el.innerHTML = `${text} <i class="fas fa-times-circle" style="opacity: 0.7;"></i>`;
        el.title = "Bấm để xóa lọc nhanh";
        el.onclick = resetQuickFilters;
        header.appendChild(el);
    } else {
        el.innerHTML = `${text} <i class="fas fa-times-circle" style="opacity: 0.7;"></i>`;
    }
    el.style.display = 'inline-flex';
    
    // Hiện nút nổi "KHÔI PHỤC TỔNG THỂ" khi có bất kỳ bộ lọc nào
    const resetBtn = document.getElementById('resetTotalBtn');
    if (resetBtn) resetBtn.style.display = 'flex';
}

function resetQuickFilters() {
    selectedWeapon = "";
    currentPage = 1;
    selectedHour = "all";
    selectedName = "";
    filterStartDate = "";
    filterEndDate = "";
    document.getElementById('filterStart').value = "";
    document.getElementById('filterEnd').value = "";
    const el = document.getElementById('quickFilterInfo');
    if (el) el.style.display = 'none';
    
    const resetBtn = document.getElementById('resetTotalBtn');
    if (resetBtn) resetBtn.style.display = 'none';
    
    refreshDashboard();
}
