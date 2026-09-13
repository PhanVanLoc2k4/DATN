/**
 * SPECTRA GUARD - SMART AI SURVEILLANCE
 * FILE: script.js
 */

// ======================================================
// CONFIGURATION & STATE
// ======================================================
let cameraStatus = {};
let cameraData = {};
let cams = [];

let currentModalCam = null;
const activeLoops = {}; // Quản lý các vòng lặp tránh trùng lặp

// ======================================================
// REAL-TIME SOCKET.IO CLIENT SETUP
// ======================================================
let socket = null;
const socketCallbacks = {};

if (typeof io !== 'undefined') {
    try {
        socket = io({
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 10,
            timeout: 5000
        });

        socket.on('connect', () => {
            console.log("⚡ [Socket.IO] Đã kết nối Real-time với AI Server!");
        });

        socket.on('detection_result', (data) => {
            if (data && data.cam_id && socketCallbacks[data.cam_id]) {
                const cb = socketCallbacks[data.cam_id];
                delete socketCallbacks[data.cam_id];
                cb(data);
            }
        });

        socket.on('connect_error', (err) => {
            console.warn("⚠️ [Socket.IO] Lỗi kết nối Socket, tự động dùng HTTP Polling dự phòng:", err);
        });
    } catch (err) {
        console.warn("⚠️ Không thể khởi tạo Socket.IO:", err);
    }
}

// ======================================================
// CORE AI PROCESSING
// ======================================================


/**
 * Chụp ảnh từ video hiện tại
 */
async function captureSnapshot(videoElem, apiType) {
    if (!videoElem || videoElem.readyState < 2) return null;
    
    // Giữ chi tiết lưỡi dao cho camera vũ khí, trong giới hạn 960px của backend.
    const isWeapon = apiType === 'weapon';
    const MAX_DIM = isWeapon ? 960 : 640;
    let targetWidth = videoElem.videoWidth;
    let targetHeight = videoElem.videoHeight;

    if (targetWidth > MAX_DIM || targetHeight > MAX_DIM) {
        if (targetWidth > targetHeight) {
            targetHeight = (MAX_DIM / targetWidth) * targetHeight;
            targetWidth = MAX_DIM;
        } else {
            targetWidth = (MAX_DIM / targetHeight) * targetWidth;
            targetHeight = MAX_DIM;
        }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElem, 0, 0, targetWidth, targetHeight);
    
    return {
        uri: canvas.toDataURL('image/jpeg', isWeapon ? 0.92 : 0.80),
        width: targetWidth,
        height: targetHeight
    };
}

/**
 * Trộn Video và Canvas để lưu ảnh vi phạm có kèm khung nhận diện
 */
function captureCombinedImage(video, canvasAI) {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    const tempCtx = tempCanvas.getContext("2d");

    // 1. Vẽ hình ảnh từ video gốc
    tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);

    // 2. Vẽ đè các Box nhận diện (Scale ngược lại kích thước gốc của video)
    tempCtx.drawImage(canvasAI, 0, 0, tempCanvas.width, tempCanvas.height);

    return tempCanvas.toDataURL("image/jpeg", 0.8);
}

/**
 * Vòng lặp xử lý AI cho từng Camera
 */
let lastObjects = []; // Lưu trữ đối tượng khung hình trước để làm mượt (Smoothing)

/**
 * KHỞI TRẠY NHẬN DIỆN CHO MỘT CAMERA
 * Đảm bảo chỉ có 1 vòng lặp duy nhất cho 1 Canvas hiện tại trên DOM.
 */
async function runCameraDetection(camId) {
    const camConfig = cams.find(c => c.id === camId);
    const video = document.getElementById(`video${camId.toUpperCase()}`);
    const canvas = document.getElementById(`canvas${camId.toUpperCase()}`);

    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");

    function resizeCanvas() {
        if (!video || !canvas) return;
        // Luôn đồng bộ kích thước nội bộ của Canvas với kích thước thực tế hiển thị
        if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
            canvas.width = video.clientWidth;
            canvas.height = video.clientHeight;
        }
    }

    resizeCanvas();

    async function detectionLoop() {
        if (!document.body.contains(canvas)) {
            activeLoops[camId] = false;
            return;
        }

        if (!cameraStatus[camId]) {
            activeLoops[camId] = false;
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        if (video.readyState >= 2) {
            resizeCanvas();
            const snapshotState = await captureSnapshot(video, camConfig.api_type);

            if (snapshotState && snapshotState.uri) {
                try {
                    // ĐÈN BÁO ĐANG XỬ LÝ
                    const dot = document.querySelector(`#aiStatus${camId.toUpperCase()} .ai-dot`);
                    if (dot) dot.style.opacity = "1";

                    const benchmarkTicket = window.webBenchmark?.begin(camId, camConfig.api_type);
                    let data = null;

                    // 1. Thử gửi qua WebSocket Real-time trước (Tối ưu nhất cho ByteTrack)
                    if (socket && socket.connected) {
                        data = await new Promise((resolve) => {
                            const timeoutId = setTimeout(() => {
                                delete socketCallbacks[camId];
                                resolve(null); // Timeout -> Chuyển sang HTTP dự phòng
                            }, 2500);

                            socketCallbacks[camId] = (resData) => {
                                clearTimeout(timeoutId);
                                resolve(resData);
                            };

                            socket.emit('detect_frame', {
                                image: snapshotState.uri,
                                cam_id: camId,
                                api_type: camConfig.api_type
                            });
                        });
                    }

                    // 2. Dự phòng HTTP POST nếu Socket chưa sẵn sàng hoặc bị nổ timeout
                    if (!data) {
                        const apiPath = camConfig.api_type === 'face' ? '/detect_faces' : 
                                        (camConfig.api_type === 'weapon' ? '/detect_weapon' : 
                                        (camConfig.api_type === 'crowd' ? '/detect_crowd' : '/detect_behavior'));
                        const response = await fetch(apiPath, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ image: snapshotState.uri, cam_id: camId })
                        });
                        data = await response.json();
                    }

                    if (dot) dot.style.opacity = "0.5";


                    window.webBenchmark?.record(benchmarkTicket, data);
                    let objects = data.objects || data.faces || [];
                    const isAlert = data.alert || false;
                    const hasObjectAlert = objects.some(o => o.has_alert || o.is_alert);
                    const triggerAlert = isAlert || hasObjectAlert;

                    // Cảnh báo đỏ nhấp nháy cho cam nhận diện hành vi/vũ khí/đám đông và thêm nút cảnh báo
                    const card = document.getElementById(`card-${camId}`);
                    const alertBtn = document.getElementById(`alertIcon${camId.toUpperCase()}`);
                    
                    if (triggerAlert) {
                        if (camConfig.api_type === 'behavior' || camConfig.api_type === 'weapon' || camConfig.api_type === 'crowd') {
                            if (card) {
                                card.classList.add("fighting-alert-active");
                                card.classList.remove("camera-alert-active");
                            }
                        } else {
                            if (card) {
                                card.classList.add("camera-alert-active");
                                card.classList.remove("fighting-alert-active");
                            }
                        }
                        if (alertBtn) alertBtn.style.display = "flex";
                    } else {
                        if (card) {
                            card.classList.remove("fighting-alert-active");
                            card.classList.remove("camera-alert-active");
                        }
                        if (alertBtn) alertBtn.style.display = "none";
                    }

                    // Vẽ dữ liệu lên màn hình
                    ctx.clearRect(0, 0, canvas.width, canvas.height);

                    // --- VẼ LƯỚI PHÁT HIỆN ĐÁM ĐÔNG (3x3 Grid - 9 ô lưới) ---
                    if (camConfig.api_type === 'crowd') {
                        // 1. Luôn vẽ đường lưới 3x3 rõ nét trên camera
                        ctx.strokeStyle = "rgba(0, 255, 204, 0.85)";
                        ctx.lineWidth = 2;
                        for (let i = 1; i < 3; i++) {
                            // Đường ngang
                            ctx.beginPath();
                            ctx.moveTo(0, (canvas.height / 3) * i);
                            ctx.lineTo(canvas.width, (canvas.height / 3) * i);
                            ctx.stroke();
                            // Đường dọc
                            ctx.beginPath();
                            ctx.moveTo((canvas.width / 3) * i, 0);
                            ctx.lineTo((canvas.width / 3) * i, canvas.height);
                            ctx.stroke();
                        }

                        // 2. Vẽ trạng thái màu sắc và số lượng trên từng ô (nếu có dữ liệu grid)
                        if (data.grid && data.grid.length > 0) {
                            const scaleX = canvas.width / snapshotState.width;
                            const scaleY = canvas.height / snapshotState.height;

                            data.grid.forEach((cell, idx) => {
                                const [x1, y1, x2, y2] = cell.bbox;
                                const cx1 = x1 * scaleX;
                                const cy1 = y1 * scaleY;
                                const cx2 = x2 * scaleX;
                                const cy2 = y2 * scaleY;
                                const cw = cx2 - cx1;
                                const ch = cy2 - cy1;

                                // Trạng thái màu sắc của từng ô lưới (độ tương phản cao, rõ nét)
                                let cellColor = "rgba(0, 255, 204, 0.12)"; // Bình thường: xanh ngọc
                                let borderColor = "rgba(0, 255, 204, 0.95)";
                                let textColor = "#00FFCC";

                                if (cell.state === "warning") {
                                    cellColor = "rgba(255, 165, 0, 0.35)"; // Cảnh báo: cam sáng
                                    borderColor = "rgba(255, 165, 0, 1.0)";
                                    textColor = "#FFA500";
                                } else if (cell.state === "alert") {
                                    cellColor = "rgba(255, 51, 102, 0.5)"; // Vi phạm đám đông: đỏ rực
                                    borderColor = "rgba(255, 51, 102, 1.0)";
                                    textColor = "#FF3366";
                                }

                                // Vẽ nền ô lưới
                                ctx.fillStyle = cellColor;
                                ctx.fillRect(cx1, cy1, cw, ch);

                                // Vẽ viền ô lưới
                                ctx.strokeStyle = borderColor;
                                ctx.lineWidth = (cell.state !== "normal") ? 3 : 2;
                                ctx.strokeRect(cx1, cy1, cw, ch);

                                // Hiển thị số lượng đếm trên từng ô lưới
                                ctx.font = "bold 14px 'Outfit', sans-serif";
                                const r = Math.floor(idx / 3);
                                const c = idx % 3;
                                const txt = `Ô[${r},${c}] | ĐẾM: ${cell.count}/${cell.threshold}`;
                                const txtW = ctx.measureText(txt).width;

                                // Tạo background nhãn cho dễ đọc
                                ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
                                ctx.fillRect(cx1 + 6, cy1 + 6, txtW + 14, 24);

                                ctx.fillStyle = textColor;
                                ctx.fillText(txt, cx1 + 12, cy1 + 23);
                            });
                        }
                    }

                    if (objects.length > 0) {
                        const scaleX = canvas.width / snapshotState.width;
                        const scaleY = canvas.height / snapshotState.height;

                        objects.forEach(obj => {
                            if (!obj.bbox) return;
                            const [x1, y1, x2, y2] = obj.bbox;
                            let color = "#00FFCC";
                            if (obj.has_alert || obj.is_alert || (obj.name && obj.name.includes("⚠️"))) {
                                color = "#FF3366";
                            } else if (obj.status && (obj.status.includes("Đang theo dõi") || obj.status.includes("Chưa đủ thời gian"))) {
                                color = "#FFA500";
                            }

                            // Vẽ box lớp 1
                            ctx.strokeStyle = color;
                            ctx.lineWidth = 5;
                            ctx.strokeRect(x1 * scaleX, y1 * scaleY, (x2 - x1) * scaleX, (y2 - y1) * scaleY);

                            // Vẽ box lớp 2 (viền trắng)
                            ctx.strokeStyle = "#FFFFFF";
                            ctx.lineWidth = 1.5;
                            ctx.strokeRect(x1 * scaleX + 2, y1 * scaleY + 2, (x2 - x1) * scaleX - 4, (y2 - y1) * scaleY - 4);

                            // Nhãn tên: Cam phát hiện đám đông, đánh nhau hoặc vũ khí hiển thị mô tả đầy đủ
                            let label;
                            let font, boxHeight, textOffset;
                            if (camConfig.api_type === 'crowd') {
                                let nameStr = obj.name || 'Người';
                                if (!nameStr.includes('#') && obj.track_id !== undefined && obj.track_id !== null && obj.track_id !== -1) {
                                    nameStr += ` #${obj.track_id}`;
                                }
                                label = nameStr.toUpperCase();
                                font = "bold 12px 'Outfit', sans-serif";
                                boxHeight = 24;
                                textOffset = 7;
                            } else if (camConfig.api_type === 'behavior') {
                                const statusStr = obj.status ? ` | ${obj.status}` : '';
                                label = (obj.label || `${obj.name || 'Đối tượng'}${statusStr}`).toUpperCase();
                                font = "bold 13px 'Outfit', sans-serif";
                                boxHeight = 28;
                                textOffset = 8;
                            } else if (camConfig.api_type === 'weapon') {
                                const statusStr = obj.status ? ` | ${obj.status}` : '';
                                label = (obj.label || `${obj.name || 'Vũ khí'}${statusStr}`).toUpperCase();
                                font = "bold 13px 'Outfit', sans-serif";
                                boxHeight = 28;
                                textOffset = 8;
                            } else {
                                label = (obj.name || 'Người lạ').toUpperCase();
                                font = "bold 14px 'Outfit', sans-serif";
                                boxHeight = 30;
                                textOffset = 9;
                            }
                            
                            ctx.font = font;
                            const txtW = ctx.measureText(label).width;
                            ctx.fillStyle = color;
                            ctx.fillRect(x1 * scaleX, y1 * scaleY - boxHeight, txtW + 12, boxHeight);
                            ctx.fillStyle = "#FFFFFF";
                            ctx.fillText(label, x1 * scaleX + 6, y1 * scaleY - textOffset);
                        });
                    }

                    if (isAlert) {
                        const now = Date.now();
                        if (now - cameraData[camId].lastAlertTime > 8000) {
                            setTimeout(() => { renderGlobalHistory(); updateStats(); }, 1000);
                            cameraData[camId].lastAlertTime = now;
                        }
                    }
                } catch (e) {
                    console.error("AI Loop Error:", e);
                }
            }
        }

        // Vòng lặp tiếp theo: Delay cực thấp (10ms) để quét liên tục giống hệt test script
        if (cameraStatus[camId]) {
            const delay = 10; 
            setTimeout(detectionLoop, delay);
        }
    }

    // Nếu đã có loop đang chạy, ta kiểm tra xem nó có đang vẽ vào đúng Canvas này không.
    // Nếu activeLoops là true nhưng Canvas này vừa mới tạo ra, ta reset để loop mới chạy.
    if (activeLoops[camId]) {
        // Ta dùng thuộc tính ẩn để đánh dấu loop đang vẽ vào Canvas nào
        if (canvas.dataset.hasLoop === "true") return;
    }

    // Đánh dấu Canvas này đã có loop
    canvas.dataset.hasLoop = "true";
    activeLoops[camId] = true;
    detectionLoop();
}

/**
 * AI WATCHDOG: Kiểm tra và khởi động lại AI nếu bị treo
 */
function startAiWatchdog() {
    setInterval(() => {
        cams.forEach(cam => {
            if (!cameraStatus[cam.id]) return;

            const canvas = document.getElementById(`canvas${cam.id.toUpperCase()}`);
            const dot = document.querySelector(`#aiStatus${cam.id.toUpperCase()} .ai-dot`);

            if (canvas && canvas.dataset.hasLoop !== "true") {
                console.warn(`[Watchdog] Phát hiện AI của ${cam.id} chưa chạy. Đang kích hoạt...`);
                runCameraDetection(cam.id);
            }

            // Cập nhật đèn báo lỗi nếu cần
            if (activeLoops[cam.id] === false && cameraStatus[cam.id]) {
                if (dot) dot.className = "ai-dot error";
            } else if (dot) {
                dot.className = "ai-dot active";
            }
        });
    }, 2000);
}

async function updateStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();

        cams.forEach(cam => {
            const count = data[cam.id] || 0;
            cameraData[cam.id].violationCount = count;

            // Cập nhật lên UI (Chân trang)
            const footerCountSpan = document.getElementById(`footerCount${cam.id.toUpperCase()}`);
            if (footerCountSpan) {
                footerCountSpan.innerText = count;
            }
        });
    } catch (err) {
        console.error("Lỗi cập nhật thống kê:", err);
    }
}

// ======================================================
// UI & DATA MANAGEMENT
// ======================================================

function addViolation(camId, imageData, objectName) {
    const record = {
        timestamp: new Date().toLocaleTimeString('vi-VN'),
        image: imageData,
        desc: `Phát hiện: ${objectName}`
    };

    cameraData[camId].history.unshift(record);
    cameraData[camId].violationCount++;

    // Xác định từ ngữ hiển thị dựa trên api_type
    const camConfig = cams.find(c => c.id === camId);
    const apiType = camConfig ? camConfig.api_type : 'face';
    const labelType = (apiType === 'face') ? "Phát hiện" : ((apiType === 'weapon') ? "Vũ khí" : "Vi phạm");
    const footerType = (apiType === 'face') ? "Ghi nhận" : ((apiType === 'weapon') ? "Vũ khí ghi nhận" : "Vi phạm ghi nhận");

    // Cập nhật badge trên card
    const badge = document.querySelector(`#card-${camId} .violation-badge`);
    const footer = document.querySelector(`#card-${camId} .cam-footer div`);

    if (badge) badge.innerText = `${cameraData[camId].violationCount} ${labelType}`;
    if (footer) footer.innerText = `${cameraData[camId].violationCount} ${footerType}`;

    renderGlobalHistory();
    if (currentModalCam === camId) renderModal(camId);

    // Hiệu ứng nháy nhẹ ở viền card khi có vi phạm
    const card = document.getElementById(`card-${camId}`);
    if (card) {
        card.style.borderColor = "#ff3366";
        card.style.boxShadow = "0 0 30px rgba(255, 51, 102, 0.4)";
        setTimeout(() => {
            card.style.borderColor = "rgba(0, 210, 255, 0.35)";
            card.style.boxShadow = "0 10px 25px rgba(0,0,0,0.3)";
        }, 1000);
    }
}

function renderCameraCards() {
    const grid = document.getElementById('camerasGrid');
    if (!grid) return;
    grid.innerHTML = '';

    cams.forEach(cam => {
        const enabled = cameraStatus[cam.id];
        const card = document.createElement('div');
        card.className = `camera-card ${!enabled ? 'disabled' : ''}`;
        card.id = `card-${cam.id}`;

        card.innerHTML = `
            <div class="camera-header">
                <div>
                    <h3 class="cam-name"><i class="fas fa-video"></i> ${cam.name}</h3>
                    <p class="cam-location"><i class="fas fa-map-marker-alt"></i> ${cam.loc}</p>
                </div>
                <div class="cam-status">
                    <span style="color:${enabled ? '#00FFCC' : '#FF3366'}">●</span> ${enabled ? 'ONLINE' : 'OFFLINE'}
                </div>
            </div>
            <div class="video-container">
                ${enabled ? `
                    <video id="video${cam.id.toUpperCase()}" autoplay muted loop playsinline crossorigin="anonymous">
                        <source src="${cam.src}" type="video/mp4">
                    </video>
                    <canvas id="canvas${cam.id.toUpperCase()}"></canvas>
                    <div id="aiStatus${cam.id.toUpperCase()}" class="ai-status-indicator">
                        <div class="ai-dot active"></div>
                        <span>AI ACTIVE</span>
                    </div>
                    <!-- Nút cảnh báo hình tam giác có chấm than nhạt màu -->
                    <button id="alertIcon${cam.id.toUpperCase()}" class="cam-alert-icon" style="display: none;" onclick="openCamDetail('${cam.id}')" title="Xem chi tiết vi phạm">
                        <i class="fas fa-exclamation-triangle"></i>
                    </button>
                ` : `
                    <div class="cam-offline">
                        <i class="fas fa-video-slash" style="font-size:3em; color:#555; margin-bottom:15px;"></i>
                        <span>CAMERA Đã TẮT</span>
                    </div>
                `}
            </div>
            <div class="cam-footer">
                <div class="violation-count">
                    <span id="footerCount${cam.id.toUpperCase()}">${cameraData[cam.id].violationCount}</span> 
                    <span style="font-size:0.5em; opacity:0.6; letter-spacing:1px; margin-left:5px;">
                        ${cam.api_type === 'face' ? 'GHI NHẬN' : (cam.api_type === 'weapon' ? 'VŨ KHÍ' : 'VI PHẠM')}
                    </span>
                </div>
                <button class="detail-btn" onclick="openCamDetail('${cam.id}')">CHI TIẾT</button>
            </div>
        `;
        grid.appendChild(card);
    });

    cams.forEach(cam => {
        const v = document.getElementById(`video${cam.id.toUpperCase()}`);
        if (v) {
            // TỐC ĐỘ VIDEO - Làm chậm video (0.5x cho behavior & weapon, 0.75x cho các camera khác) để AI nhận diện chính xác & box đồng bộ
            if (cam.api_type === 'behavior' || cam.api_type === 'weapon') {
                v.playbackRate = 0.5;
            } else {
                v.playbackRate = 0.75;
            }
            
            // Nếu video lùi từ cache đã sẵn sàng, chạy ngay
            if (v.readyState >= 2) {
                runCameraDetection(cam.id);
            }
            // Dự phòng sự kiện nạp
            v.onloadeddata = () => runCameraDetection(cam.id);
        }
    });
}

async function renderGlobalHistory() {
    // Backward compatibility helper
    refreshSecurityDashboard();
}

// ======================================================
// SECURITY CONTROL CENTER ACTIONS & PANELS
// ======================================================

let securityStaffList = [];
let currentPage = 1;
const itemsPerPage = 6;
let filteredEvents = [];
let miniStatsChart = null;
let knownAlertIds = new Set();

async function loadSecurityStaff() {
    try {
        const res = await fetch('/api/staff');
        securityStaffList = await res.json();
        console.log("Danh sách bảo vệ đã nạp:", securityStaffList);
    } catch (err) {
        console.error("Lỗi nạp danh sách bảo vệ:", err);
    }
}

async function loadZones() {
    try {
        const res = await fetch('/api/zones');
        const zones = await res.json();
        
        // Populate filter dropdown
        const filterZone = document.getElementById('filterZone');
        if (filterZone) {
            filterZone.innerHTML = '<option value="all">Tất cả khu vực</option>' + 
                zones.map(z => `<option value="${z.name}">${z.name}</option>`).join('');
        }
    } catch (err) {
        console.error("Lỗi nạp danh sách khu vực:", err);
    }
}

function playWarningSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
        gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
        
        oscillator.start();
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
        console.log("Audio API not allowed or blocked:", e);
    }
}

window.zoomImage = function(url) {
    const overlay = document.getElementById('zoomOverlay');
    const img = document.getElementById('zoomImg');
    if (overlay && img) {
        img.src = url;
        overlay.style.display = 'flex';
    }
};

window.openCameraConfigModal = function() {
    document.getElementById('cameraConfigModal').style.display = 'flex';
    loadCameraManagerList();
};

window.confirmAlert = async function(id) {
    await updateAlertStatus(id, 'confirmed');
};

window.dismissAlert = async function(id) {
    if (confirm("Xác nhận đây là báo cáo nhầm / cảnh báo sai?")) {
        await updateAlertStatus(id, 'false_alarm');
    }
};

window.confirmAllEmergencies = async function() {
    try {
        const res = await fetch('/api/history');
        const history = await res.json();
        const activeIds = history.filter(item => item.status === 'Chưa xử lý').map(item => item.id);
        if (activeIds.length === 0) return;
        
        if (confirm(`Tiếp nhận tất cả ${activeIds.length} sự cố đang diễn ra?`)) {
            const updateRes = await fetch('/api/history/update_status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: activeIds, status: 'confirmed' })
            });
            const result = await updateRes.json();
            if (result.success) {
                refreshSecurityDashboard();
            } else {
                alert("Lỗi: " + result.message);
            }
        }
    } catch (err) {
        console.error("Lỗi tiếp nhận tất cả:", err);
    }
};

window.dismissAllEmergencies = async function() {
    try {
        const res = await fetch('/api/history');
        const history = await res.json();
        const activeIds = history.filter(item => item.status === 'Chưa xử lý').map(item => item.id);
        if (activeIds.length === 0) return;
        
        if (confirm(`Xác nhận hủy tất cả ${activeIds.length} sự cố (báo cáo sai)?`)) {
            const updateRes = await fetch('/api/history/update_status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: activeIds, status: 'false_alarm' })
            });
            const result = await updateRes.json();
            if (result.success) {
                refreshSecurityDashboard();
            } else {
                alert("Lỗi: " + result.message);
            }
        }
    } catch (err) {
        console.error("Lỗi hủy tất cả:", err);
    }
};

window.resolveAlert = async function(id) {
    await updateAlertStatus(id, 'resolved');
};

window.assignGuard = async function(id, staffId) {
    if (!staffId) return;
    try {
        const res = await fetch('/api/history/update_status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id, status: 'confirmed', assigned_staff_id: parseInt(staffId) })
        });
        const result = await res.json();
        if (result.success) {
            console.log(`Đã phân công bảo vệ (ID: ${staffId}) cho sự kiện ${id}`);
            refreshSecurityDashboard();
        } else {
            alert("Lỗi: " + result.message);
        }
    } catch (err) {
        console.error("Lỗi phân công bảo vệ:", err);
    }
};

async function updateAlertStatus(id, status) {
    try {
        const res = await fetch('/api/history/update_status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id, status: status })
        });
        const result = await res.json();
        if (result.success) {
            refreshSecurityDashboard();
        } else {
            alert("Lỗi: " + result.message);
        }
    } catch (err) {
        console.error("Lỗi cập nhật trạng thái sự cố:", err);
    }
}

async function loadEmergencyAlerts() {
    try {
        const res = await fetch('/api/history');
        const history = await res.json();
        
        // Active/new alerts have status 'Chưa xử lý' or 'mới'
        const activeAlerts = history.filter(item => item.status === 'Chưa xử lý');
        
        // Dynamically toggle emergency alerts panel display
        const sccGrid = document.getElementById('sccGrid');
        const sccMainRight = document.getElementById('sccMainRight');
        if (sccGrid && sccMainRight) {
            if (activeAlerts.length === 0) {
                sccMainRight.style.display = 'none';
                sccGrid.classList.remove('alerts-active');
            } else {
                sccMainRight.style.display = 'flex';
                sccGrid.classList.add('alerts-active');
            }
        }

        // Update badge
        const badge = document.getElementById('emergencyCount');
        if (badge) {
            badge.innerText = `${activeAlerts.length} MỚI`;
            if (activeAlerts.length > 0) {
                badge.style.background = '#ff3366';
            } else {
                badge.style.background = '#2c3e4e';
            }
        }
        
        const bulkActions = document.getElementById('emergencyBulkActions');
        if (bulkActions) {
            bulkActions.style.display = (activeAlerts.length > 0) ? 'flex' : 'none';
        }
        
        const container = document.getElementById('emergencyAlertsList');
        if (!container) return;
        
        // Reset map flash states first
        document.querySelectorAll('.map-area').forEach(el => el.classList.remove('alert-active'));
        
        if (activeAlerts.length === 0) {
            container.innerHTML = `
                <div class="no-alerts-msg">
                    <i class="fas fa-shield-alt"></i>
                    <p>Hệ thống an toàn. Không phát hiện sự cố.</p>
                </div>
            `;
            return;
        }
        
        // Sound warning on new alert
        let hasNewAlert = false;
        activeAlerts.forEach(alert => {
            if (!knownAlertIds.has(alert.id)) {
                knownAlertIds.add(alert.id);
                hasNewAlert = true;
            }
            
            // Map corresponding camera area flash on 2D map
            const nameLower = alert.camera_name.toLowerCase();
            let camNum = null;
            if (nameLower.includes('cam 01') || nameLower.includes('cam1') || nameLower.includes('cổng chính')) camNum = 1;
            else if (nameLower.includes('cam 02') || nameLower.includes('cam2') || nameLower.includes('nhà xe')) camNum = 2;
            else if (nameLower.includes('cam 03') || nameLower.includes('cam3') || nameLower.includes('hành lang')) camNum = 3;
            else if (nameLower.includes('cam 04') || nameLower.includes('cam4') || nameLower.includes('sân')) camNum = 4;
            
            if (camNum) {
                const mapArea = document.getElementById(`map-area-cam${camNum}`);
                if (mapArea) mapArea.classList.add('alert-active');
            }
        });
        
        if (hasNewAlert) {
            playWarningSound();
        }
        
        // Draw the alert items
        container.innerHTML = activeAlerts.map(alert => {
            const levelClass = alert.alert_level.includes('3') ? 'level-3' : (alert.alert_level.includes('2') ? 'level-2' : 'level-1');
            
            // Generate security staff options
            const staffOptions = securityStaffList.map(s => 
                `<option value="${s.id}">${s.name}</option>`
            ).join('');
            
            return `
                <div class="emergency-item" id="alert-item-${alert.id}">
                    <div class="emergency-title">
                        <span>⚠️ ${alert.violation_type.toUpperCase()}</span>
                        <span class="badge-level ${levelClass}">${alert.alert_level}</span>
                    </div>
                    <img src="${alert.image_url}" class="emergency-evidence" onclick="zoomImage('${alert.image_url}')" title="Nhấp để phóng to">
                    <div class="emergency-meta">
                        <div><b>Camera:</b> <span>${alert.camera_name}</span></div>
                        <div><b>Khu vực:</b> <span>${alert.zone_name}</span></div>
                        <div><b>Thời gian:</b> <span>${alert.detected_at}</span></div>
                        <div><b>Đối tượng:</b> <span>${alert.identities}</span></div>
                        <div><b>Độ tin cậy:</b> <span>${Math.round(alert.confidence * 100)}%</span></div>
                    </div>
                    <div class="emergency-actions">
                        <div style="margin-bottom: 8px;">
                            <label style="font-size:0.7rem; color:#aaa; display:block; margin-bottom:4px;">Phân công bảo vệ:</label>
                            <select class="staff-assign-select" onchange="assignGuard(${alert.id}, this.value)">
                                <option value="">-- Chọn bảo vệ --</option>
                                ${staffOptions}
                            </select>
                        </div>
                        <div class="emergency-actions-row">
                            <button class="emergency-btn btn-confirm" onclick="confirmAlert(${alert.id})">Tiếp Nhận</button>
                            <button class="emergency-btn btn-dismiss" onclick="dismissAlert(${alert.id})">Báo Sai</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (err) {
        console.error("Lỗi nạp danh sách cảnh báo khẩn cấp:", err);
    }
}

async function loadEventsTable() {
    const tableBody = document.getElementById('eventsTableBody');
    if (!tableBody) return;
    
    try {
        const filterCameraVal = document.getElementById('filterCamera').value;
        const filterZoneVal = document.getElementById('filterZone').value;
        const filterTypeVal = document.getElementById('filterType').value;
        const filterAlertLevelVal = document.getElementById('filterAlertLevel').value;
        const filterStartDateVal = document.getElementById('filterStartDate').value;
        const filterEndDateVal = document.getElementById('filterEndDate').value;
        
        let url = `/api/analytics/search?camera=${filterCameraVal}&type=${filterTypeVal}&zone=${filterZoneVal}&alert_level=${filterAlertLevelVal}`;
        if (filterStartDateVal) url += `&start=${filterStartDateVal}`;
        if (filterEndDateVal) url += `&end=${filterEndDateVal}`;
        
        const res = await fetch(url);
        filteredEvents = await res.json();
        
        // Paginate
        const totalItems = filteredEvents.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedItems = filteredEvents.slice(startIndex, endIndex);
        
        // Update pagination text
        const text = document.getElementById('pageIndicatorText');
        if (text) {
            text.innerText = `Trang ${currentPage} / ${totalPages} (${totalItems} bản ghi)`;
        }
        
        if (paginatedItems.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align: center; padding: 30px; opacity: 0.5;">Không tìm thấy sự kiện nào khớp bộ lọc</td>
                </tr>
            `;
            return;
        }
        
        tableBody.innerHTML = paginatedItems.map(event => {
            const levelClass = event.alert_level.includes('3') ? 'level-3' : (event.alert_level.includes('2') ? 'level-2' : 'level-1');
            
            let statusClass = 'status-new';
            if (event.status === 'Đang xử lý' || event.status === 'Đang diễn ra' || event.status === 'Đã xác nhận') statusClass = 'status-processing';
            else if (event.status === 'Đã xử lý') statusClass = 'status-resolved';
            else if (event.status === 'Báo cáo nhầm') statusClass = 'status-dismissed';
            
            const staffOptions = securityStaffList.map(s => 
                `<option value="${s.id}" ${event.staff_id === s.id ? 'selected' : ''}>${s.name}</option>`
            ).join('');
            
            const isTerminalState = event.status === 'Đã xử lý' || event.status === 'Báo cáo nhầm';
            
            return `
                <tr>
                    <td><img src="${event.image_url}" class="table-thumb" onclick="zoomImage('${event.image_url}')"></td>
                    <td><b>${event.start_time}</b></td>
                    <td>${event.camera_name}</td>
                    <td>${event.zone_name}</td>
                    <td>${event.violation_type}</td>
                    <td><span class="badge-level ${levelClass}">${event.alert_level}</span></td>
                    <td><span style="color:#00ffcc; font-weight:600;">${event.identities}</span></td>
                    <td>
                        <select style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); color:white; padding:4px 8px; border-radius:6px; font-size:0.75rem; outline:none; ${isTerminalState ? 'opacity:0.5; cursor:not-allowed;' : ''}" onchange="assignGuard(${event.id}, this.value)" ${isTerminalState ? 'disabled' : ''}>
                            <option value="">Chưa phân công</option>
                            ${staffOptions}
                        </select>
                    </td>
                    <td><span class="badge-status ${statusClass}">${event.status}</span></td>
                    <td>
                        <div style="display:flex; gap:6px;">
                            <button class="test-btn" style="padding:4px 8px; font-size:0.7rem; border-color:#00ffcc; color:#00ffcc; background:none; ${isTerminalState ? 'opacity:0.4; cursor:not-allowed;' : ''}" onclick="${isTerminalState ? '' : `confirmAlert(${event.id})`}" ${isTerminalState ? 'disabled' : ''}>Tiếp Nhận</button>
                            <button class="test-btn" style="padding:4px 8px; font-size:0.7rem; border-color:#ff5e7c; color:#ff5e7c; background:none; ${isTerminalState ? 'opacity:0.4; cursor:not-allowed;' : ''}" onclick="${isTerminalState ? '' : `resolveAlert(${event.id})`}" ${isTerminalState ? 'disabled' : ''}>Đã Xử Lý</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        
    } catch (err) {
        console.error("Lỗi tải bảng sự kiện:", err);
        tableBody.innerHTML = `
            <tr>
                <td colspan="10" style="text-align: center; padding: 30px; color: red;">Lỗi kết nối máy chủ.</td>
            </tr>
        `;
    }
}

async function loadStatsAndChart() {
    try {
        const resHistory = await fetch('/api/history');
        const history = await resHistory.json();
        
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        // Calculate start of week (Monday)
        const dayOfWeek = now.getDay();
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
        
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        let cntToday = 0;
        let cntWeek = 0;
        let cntMonth = 0;
        
        history.forEach(item => {
            const parts = item.detected_at.split(' ');
            if (parts.length === 2) {
                const dateParts = parts[1].split('/');
                const timeParts = parts[0].split(':');
                if (dateParts.length === 3 && timeParts.length === 3) {
                    const dt = new Date(dateParts[2], dateParts[1] - 1, dateParts[0], timeParts[0], timeParts[1], timeParts[2]);
                    if (dt >= startOfToday) cntToday++;
                    if (dt >= startOfWeek) cntWeek++;
                    if (dt >= startOfMonth) cntMonth++;
                }
            }
        });
        
        const elToday = document.getElementById('cntToday');
        const elWeek = document.getElementById('cntWeek');
        const elMonth = document.getElementById('cntMonth');
        if (elToday) elToday.innerText = cntToday;
        if (elWeek) elWeek.innerText = cntWeek;
        if (elMonth) elMonth.innerText = cntMonth;
        
        const resDaily = await fetch('/api/analytics/daily');
        const dailyData = await resDaily.json();
        
        const ctx = document.getElementById('miniStatsChart');
        if (!ctx) return;
        
        const labels = dailyData.map(d => d.date);
        const counts = dailyData.map(d => d.count);
        
        if (miniStatsChart) {
            miniStatsChart.destroy();
        }
        
        miniStatsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Sự cố',
                    data: counts,
                    borderColor: '#00ffcc',
                    backgroundColor: 'rgba(0, 255, 204, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 9 } }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 9 }, stepSize: 1 }
                    }
                }
            }
        });
        
    } catch (err) {
        console.error("Lỗi nạp thống kê & biểu đồ:", err);
    }
}

window.openShiftReportModal = function() {
    document.getElementById('shiftReportModal').style.display = 'flex';
    refreshShiftReportPreview();
};

function initializeReportPeriodDropdown() {
    const root = document.getElementById('reportPeriodSelect');
    const input = document.getElementById('exportPeriod');
    const trigger = document.getElementById('reportPeriodTrigger');
    const menu = document.getElementById('reportPeriodMenu');
    const label = document.getElementById('reportPeriodLabel');
    if (!root || !input || !trigger || !menu || !label) return;

    const closeMenu = () => {
        menu.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
    };

    trigger.addEventListener('click', (event) => {
        event.stopPropagation();
        const shouldOpen = !menu.classList.contains('open');
        closeMenu();
        if (shouldOpen) {
            menu.classList.add('open');
            trigger.setAttribute('aria-expanded', 'true');
        }
    });

    menu.querySelectorAll('.report-period-option').forEach(option => {
        option.addEventListener('click', () => {
            input.value = option.dataset.value;
            label.textContent = option.textContent.trim();
            menu.querySelectorAll('.report-period-option').forEach(item => item.classList.remove('active'));
            option.classList.add('active');
            closeMenu();
            refreshShiftReportPreview();
        });
    });

    document.addEventListener('click', (event) => {
        if (!root.contains(event.target)) closeMenu();
    });
}

window.refreshShiftReportPreview = async function() {
    const period = document.getElementById('exportPeriod').value;
    const body = document.getElementById('previewBody');
    const badge = document.getElementById('previewCount');
    if (!body || !badge) return;
    
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Đang tải bản ghi ca trực...</td></tr>';
    
    try {
        const res = await fetch(`/api/export_csv?period=${period}&preview=true`);
        const result = await res.json();
        if (result.success && result.data) {
            badge.innerText = `${result.data.length} bản ghi`;
            if (result.data.length === 0) {
                body.innerHTML = '<tr><td colspan="7" style="text-align:center; opacity:0.5;">Không có dữ liệu ca trực trong khoảng thời gian này.</td></tr>';
                return;
            }
            
            body.innerHTML = result.data.map(item => `
                <tr>
                    <td><span style="font-family:\'JetBrains Mono\', monospace; font-size:0.75rem;">EVT_${item.id}</span></td>
                    <td>${item.camera}</td>
                    <td>${item.type}</td>
                    <td>${item.time}</td>
                    <td><span style="color:#00ffcc;">${item.identities}</span></td>
                    <td>${item.processor}</td>
                    <td>${item.status}</td>
                </tr>
            `).join('');
        } else {
            body.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red;">Lỗi tải dữ liệu ca trực.</td></tr>';
        }
    } catch (err) {
        body.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red;">Lỗi kết nối máy chủ.</td></tr>';
    }
};

window.executeShiftExport = async function() {
    const period = document.getElementById('exportPeriod').value;
    try {
        const res = await fetch(`/api/export_csv?period=${period}&preview=false`);
        const result = await res.json();
        if (result.success && result.path) {
            alert(`Xuất báo cáo ca trực thành công!\nMã báo cáo: ${result.code}\nĐang tải xuống báo cáo...`);
            
            const link = document.createElement('a');
            link.href = result.path;
            link.download = result.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            document.getElementById('shiftReportModal').style.display = 'none';
        } else {
            alert("Lỗi xuất file: " + (result.message || result.error));
        }
    } catch (err) {
        alert("Lỗi kết nối máy chủ");
    }
};

initializeReportPeriodDropdown();

async function refreshSecurityDashboard() {
    await loadEmergencyAlerts();
    await loadEventsTable();
    await loadStatsAndChart();
}

window.openCamDetail = function (camId) {
    currentModalCam = camId;
    renderModal(camId);
    document.getElementById('detailModal').style.display = 'flex';
};

async function renderModal(camId) {
    const camConfig = cams.find(c => c.id === camId);
    document.getElementById('modalTitle').innerHTML = `<i class="fas fa-video"></i> LỊCH SỬ CHI TIẾT: ${camConfig.name}`;
    const list = document.getElementById('modalHistoryList');

    list.innerHTML = `<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Đang tải dữ liệu...</div>`;

    try {
        const response = await fetch('/api/history');
        const allRecords = await response.json();
        const filtered = allRecords.filter(r => r.camera_name === camConfig.name);

        list.innerHTML = filtered.map(h => `
            <div class="history-item" style="display:flex; gap:20px; margin-bottom:15px; background:rgba(255,255,255,0.03); padding:15px; border-radius:15px; border: 1px solid rgba(255,255,255,0.1);">
                <img src="${h.image_url}" style="width:200px; border-radius:10px; border:2px solid #00FFCC; box-shadow: 0 0 15px rgba(0,255,204,0.2); cursor:pointer;" onclick="zoomImage('${h.image_url}')">
                <div style="flex: 1;">
                    <div style="color:#00FFCC; font-weight:bold; font-size:1.1em; margin-bottom:8px;">Thời gian: ${h.detected_at}</div>
                    <div style="color:#FFF; font-size:1rem; margin-bottom:5px;">Loại: ${h.violation_type}</div>
                    <div style="color:#0ff; font-size:0.9rem; margin-bottom:10px; background:rgba(0,255,204,0.1); padding:8px; border-radius:10px;">
                        <i class="fas fa-id-card"></i> Danh tính: <b>${h.identities || 'Người lạ'}</b>
                    </div>
                    <p style="font-size:0.85em; color:#aaa; margin-bottom: 5px;">Mức độ: <b>${h.alert_level}</b></p>
                    <p style="font-size:0.85em; color:#aaa; margin-bottom: 5px;">Khu vực: <b>${h.zone_name}</b></p>
                    <p style="font-size:0.85em; color:#aaa;">Trạng thái: <b>${h.status}</b></p>
                </div>
            </div>
        `).join('') || `<div style="text-align:center; padding:50px; opacity:0.3;">Không có dữ liệu cho Camera này</div>`;
    } catch (err) {
        list.innerHTML = `<div style="color:red; text-align:center; padding:20px;">Lỗi kết nối Server</div>`;
    }
}

// Xử lý bật tắt camera
function setupToggles() {
    const t1 = document.getElementById('toggleCam1');
    const t2 = document.getElementById('toggleCam2');

    if (t1) t1.onclick = function () {
        cameraStatus.cam1 = !cameraStatus.cam1;
        this.classList.toggle('active');
        renderCameraCards();
    };

    if (t2) t2.onclick = function () {
        cameraStatus.cam2 = !cameraStatus.cam2;
        this.classList.toggle('active');
        renderCameraCards();
    };
}

// Khởi tạo
document.addEventListener('DOMContentLoaded', () => {
    // Đảm bảo nút đóng modal hoạt động
    const closeBtn = document.getElementById('closeModalBtn');
    if (closeBtn) {
        closeBtn.onclick = () => {
            document.getElementById('detailModal').style.display = 'none';
            currentModalCam = null;
        };
    }

    // Tab chuyển đổi (History / Settings)
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.onclick = () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.getAttribute('data-tab');
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            const targetPane = document.getElementById(target);
            if (targetPane) targetPane.classList.add('active');
        };
    });

    renderCameraCards();
    renderGlobalHistory();
    updateStats();
    setupToggles();
    startAiWatchdog(); // Bắt đầu giám sát AI
    initNotifications(); // Khởi tạo chuông thông báo

    // INITIAL LOAD FROM API
    loadCameras();
    loadSecurityStaff(); // Nạp danh sách bảo vệ
    loadZones();         // Nạp danh sách khu vực
    checkUserSession(); // Kiểm tra phiên và phân quyền

    // Tự động lọc khi người dùng thay đổi bộ lọc (không cần bấm nút Lọc)
    const filterIds = ['filterCamera', 'filterZone', 'filterType', 'filterAlertLevel', 'filterStartDate', 'filterEndDate'];
    filterIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => loadEventsTable());
            if (el.tagName === 'INPUT') {
                el.addEventListener('input', () => loadEventsTable());
            }
        }
    });

    const applyBtn = document.getElementById('applyFiltersBtn');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => loadEventsTable());
    }

    // Cập nhật toàn bộ dashboard định kỳ mỗi 4 giây để phản ánh sự kiện thực tế
    setInterval(refreshSecurityDashboard, 4000);

    // Cập nhật thống kê định kỳ mỗi 5 giây
    setInterval(updateStats, 5000);

    // Cập nhật đồng hồ
    setInterval(() => {
        const el = document.getElementById('currentDateTime');
        if (el) el.innerText = new Date().toLocaleString('vi-VN');
    }, 1000);
});

async function loadCameras() {
    try {
        const res = await fetch('/api/cameras');
        const data = await res.json();
        console.log("Danh sách Camera từ Server:", data);
        cams = data;

        // Initialize State
        cams.forEach(cam => {
            if (cameraStatus[cam.id] === undefined) cameraStatus[cam.id] = true;
            if (!cameraData[cam.id]) {
                cameraData[cam.id] = {
                    name: cam.name,
                    loc: cam.location,
                    violationCount: 0,
                    history: [],
                    lastAlertTime: 0
                };
            }
        });

        renderCameraCards();
        loadCameraManagerList(); // Cập nhật bên tab cài đặt
        updateStats();
    } catch (err) {
        console.error("Lỗi load camera:", err);
    }
}

function getApiTypeName(apiType) {
    if (apiType === 'face') return 'Khuôn mặt';
    if (apiType === 'behavior') return 'Hành vi';
    if (apiType === 'crowd') return 'Đám đông';
    if (apiType === 'weapon') return 'Vũ khí';
    return apiType;
}

window.toggleCrowdInputs = function (val) {
    const container = document.getElementById('crowdSettingsContainer');
    if (container) {
        container.style.display = (val === 'crowd') ? 'flex' : 'none';
    }
}

window.toggleEditCrowdInputs = function (val) {
    const container = document.getElementById('editCrowdSettingsContainer');
    if (container) {
        container.style.display = (val === 'crowd') ? 'flex' : 'none';
    }
}

function loadCameraManagerList() {
    const list = document.getElementById('cameraManagerList');
    if (!list) return;

    if (cams.length === 0) {
        list.innerHTML = '<div style="padding:20px; text-align:center; opacity:0.5;">Chưa có camera nào</div>';
        return;
    }

    list.innerHTML = cams.map(cam => `
        <div class="setting-row" style="background: rgba(255,255,255,0.02); padding: 12px 18px; border-radius: 12px; margin-bottom: 8px;">
            <div style="display:flex; flex-direction:column;">
                <span style="font-weight:600; color:#fff;"><i class="fas fa-camera"></i> ${cam.name}</span>
                <small style="opacity:0.6; font-size:0.75rem;">
                    Vị trí: ${cam.location} | Loại: ${getApiTypeName(cam.api_type)}
                    ${cam.api_type === 'crowd' ? ` | Ngưỡng: ${cam.crowd_threshold} người / ${cam.crowd_duration}s` : ''}
                </small>
            </div>
            <div style="display:flex; gap:12px; align-items:center;">
                <div type="button" class="toggle-switch ${cameraStatus[cam.id] ? 'active' : ''}" onclick="toggleCameraStatus('${cam.id}')"></div>
                <button onclick="openEditCameraModal(${cam.db_id})" style="background:none; border:none; color:#0ff; cursor:pointer; font-size:1.1rem;"><i class="fas fa-edit"></i></button>
                <button onclick="deleteCamera(${cam.db_id})" style="background:none; border:none; color:#ff4466; cursor:pointer; font-size:1.1rem;"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>
    `).join('');
}

window.toggleCameraStatus = function (camId) {
    cameraStatus[camId] = !cameraStatus[camId];
    renderCameraCards();
    loadCameraManagerList();
}

window.openAddCameraModal = function () {
    document.getElementById('addCameraModal').style.display = 'flex';
    document.getElementById('newCamType').value = 'face';
    toggleCrowdInputs('face');
}

window.openEditCameraModal = function (dbId) {
    const cam = cams.find(c => c.db_id === dbId);
    if (!cam) return alert("Không tìm thấy camera");

    document.getElementById('editCamDbId').value = cam.db_id;
    document.getElementById('editCamName').value = cam.name;
    document.getElementById('editCamLoc').value = cam.location;
    document.getElementById('editCamSrc').value = cam.src;
    document.getElementById('editCamType').value = cam.api_type;
    
    // Set crowd settings
    document.getElementById('editCamThreshold').value = cam.crowd_threshold || 8;
    document.getElementById('editCamDuration').value = cam.crowd_duration || 30;

    // Show/hide settings container
    toggleEditCrowdInputs(cam.api_type);

    document.getElementById('editCameraModal').style.display = 'flex';
}

window.saveEditedCamera = async function () {
    const dbId = document.getElementById('editCamDbId').value;
    const name = document.getElementById('editCamName').value;
    const location = document.getElementById('editCamLoc').value;
    const src = document.getElementById('editCamSrc').value;
    const api_type = document.getElementById('editCamType').value;
    const crowd_threshold = parseInt(document.getElementById('editCamThreshold').value) || 8;
    const crowd_duration = parseInt(document.getElementById('editCamDuration').value) || 30;

    if (!name || !src) return alert("Vui lòng nhập tên và nguồn video");

    try {
        const res = await fetch(`/api/cameras/${dbId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, location, src, api_type, crowd_threshold, crowd_duration })
        });
        const result = await res.json();
        if (result.success) {
            document.getElementById('editCameraModal').style.display = 'none';
            await loadCameras();
            console.log("Đã cập nhật camera thành công");
        } else {
            alert("Lỗi: " + result.message);
        }
    } catch (err) {
        alert("Lỗi kết nối server");
    }
}

window.saveNewCamera = async function () {
    const name = document.getElementById('newCamName').value;
    const location = document.getElementById('newCamLoc').value;
    const fileInput = document.getElementById('newCamFile');
    const api_type = document.getElementById('newCamType').value;
    const crowd_threshold = parseInt(document.getElementById('newCamThreshold').value) || 8;
    const crowd_duration = parseInt(document.getElementById('newCamDuration').value) || 30;

    let src = "";
    if (fileInput.files.length > 0) {
        src = "/static/videos/" + fileInput.files[0].name;
    }

    if (!name || !src) return alert("Vui lòng nhập tên và chọn file video");

    try {
        const res = await fetch('/api/cameras', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, location, src, api_type, crowd_threshold, crowd_duration })
        });
        const result = await res.json();
        if (result.success) {
            document.getElementById('addCameraModal').style.display = 'none';
            await loadCameras();
            console.log("Đã tải lại danh sách camera thành công");
        } else {
            alert("Lỗi: " + result.message);
        }
    } catch (err) {
        alert("Lỗi kết nối server");
    }
}

window.deleteCamera = async function (dbId) {
    if (!confirm("Bạn có chắc chắn muốn xóa camera này?")) return;

    try {
        const res = await fetch(`/api/cameras/${dbId}`, { method: 'DELETE' });
        const result = await res.json();
        if (result.success) {
            loadCameras();
        } else {
            alert("Lỗi khi xóa");
        }
    } catch (err) {
        alert("Lỗi kết nối server");
    }
}

/**
 * HỆ THỐNG THÔNG BÁO (NOTIFICATIONS)
 */
let lastSeenNotifId = localStorage.getItem('lastSeenNotifId') || 0;

function initNotifications() {
    const bell = document.getElementById('notifBell');
    const dropdown = document.getElementById('notifDropdown');
    const dot = document.getElementById('notifDot');

    if (!bell || !dropdown) return;

    bell.onclick = (e) => {
        e.stopPropagation();
        const isVisible = dropdown.style.display === 'flex';

        // Đóng tất cả các modal khác nếu cần
        dropdown.style.display = isVisible ? 'none' : 'flex';

        if (!isVisible) {
            // Khi mở ra thì ẩn chấm đỏ
            if (dot) dot.style.display = 'none';
            loadNotifList();
        }
    };

    // Đóng khi click ngoài
    document.addEventListener('click', () => {
        if (dropdown) dropdown.style.display = 'none';
    });

    // Polling thông báo mới mỗi 5 giây
    setInterval(checkNewNotifications, 5000);
    checkNewNotifications(); // Chạy lần đầu
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
    } catch (err) { console.error("Lỗi check notif:", err); }
}

async function loadNotifList() {
    const list = document.getElementById('notifList');
    if (!list) return;

    try {
        const res = await fetch('/api/history');
        const history = await res.json();

        if (history.length === 0) {
            list.innerHTML = '<div style="padding:20px; text-align:center; opacity:0.5; font-size:0.8rem;">Không có thông báo mới</div>';
            return;
        }

        // Cập nhật ID cuối cùng đã xem
        lastSeenNotifId = history[0].id;
        localStorage.setItem('lastSeenNotifId', lastSeenNotifId);

        list.innerHTML = history.slice(0, 5).map(item => `
            <div class="notif-item" onclick="location.href='/#searchTitle'">
                <img src="${item.image_url}">
                <div class="notif-msg">
                    <div class="notif-type" style="color:#00ffcc; font-size:0.8rem;">${item.violation_type}</div>
                    <div class="notif-time" style="font-size:0.7rem; opacity:0.6;">${item.camera_name} • ${item.detected_at}</div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error("Lỗi load list notif:", err);
        list.innerHTML = '<div style="padding:20px; text-align:center; color:#ff4466; font-size:0.8rem;">Lỗi kết nối máy chủ</div>';
    }
}
async function checkUserSession() {
    try {
        const res = await fetch('/api/profile');
        if (!res.ok) return;
        const user = await res.json();
        if (user.id) {
            const adminLink = document.getElementById('adminLink');
            if (adminLink && user.role === 'admin') {
                adminLink.style.display = 'flex';
            }
        }
    } catch (err) {
        console.error('L?i ki?m tra session:', err);
    }
}

