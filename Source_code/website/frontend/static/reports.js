document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const shiftStartInput = document.getElementById('shiftStart');
    const shiftEndInput = document.getElementById('shiftEnd');
    const shiftNameInput = document.getElementById('shiftName');
    const quickShiftSelect = document.getElementById('quickShiftSelect');
    const extraNotesInput = document.getElementById('extraNotes');
    
    const generateReportBtn = document.getElementById('generateReportBtn');
    const aiSummarySection = document.getElementById('aiSummarySection');
    const eventCountBadge = document.getElementById('eventCountBadge');
    const reportSummaryInput = document.getElementById('reportSummary');
    
    const saveReportBtn = document.getElementById('saveReportBtn');
    const cancelReportBtn = document.getElementById('cancelReportBtn');
    const reportsHistoryList = document.getElementById('reportsHistoryList');
    
    // Modal Elements
    const reportDetailModal = document.getElementById('reportDetailModal');
    const modalReportId = document.getElementById('modalReportId');
    const modalStaffName = document.getElementById('modalStaffName');
    const modalCreatedAt = document.getElementById('modalCreatedAt');
    const modalShiftRange = document.getElementById('modalShiftRange');
    const modalTotalEvents = document.getElementById('modalTotalEvents');
    const modalReportSummary = document.getElementById('modalReportSummary');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const modalCloseActionBtn = document.getElementById('modalCloseActionBtn');

    let currentGeneratedEventsCount = 0;

    // Initialize datetime inputs
    function initDateTimeInputs() {
        const now = new Date();
        const eightHoursAgo = new Date(now.getTime() - (8 * 60 * 60 * 1000));
        
        shiftEndInput.value = formatLocalDateTime(now);
        shiftStartInput.value = formatLocalDateTime(eightHoursAgo);
        
        updateDefaultShiftName();
    }

    // Helper: Format Date to YYYY-MM-DDTHH:MM
    function formatLocalDateTime(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    // Update shift name placeholder/value based on selected times
    function updateDefaultShiftName() {
        if (!shiftStartInput.value || !shiftEndInput.value) return;
        
        const start = new Date(shiftStartInput.value);
        const end = new Date(shiftEndInput.value);
        
        const formatTime = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const formatDate = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        
        shiftNameInput.value = `Ca trực ${formatTime(start)} - ${formatTime(end)} (${formatDate(start)})`;
    }

    // Event listeners for date changes
    shiftStartInput.addEventListener('change', updateDefaultShiftName);
    shiftEndInput.addEventListener('change', updateDefaultShiftName);

    // Quick shift selection change
    quickShiftSelect.addEventListener('change', (e) => {
        const now = new Date();
        let start;

        switch (e.target.value) {
            case 'last8':
                start = new Date(now.getTime() - (8 * 60 * 60 * 1000));
                break;
            case 'last12':
                start = new Date(now.getTime() - (12 * 60 * 60 * 1000));
                break;
            case 'last24':
                start = new Date(now.getTime() - (24 * 60 * 60 * 1000));
                break;
            case 'today':
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
                break;
            default:
                return; // custom, do nothing
        }

        shiftEndInput.value = formatLocalDateTime(now);
        shiftStartInput.value = formatLocalDateTime(start);
        updateDefaultShiftName();
    });

    // Generate AI Report draft
    generateReportBtn.addEventListener('click', async () => {
        const start = shiftStartInput.value;
        const end = shiftEndInput.value;
        const shiftName = shiftNameInput.value;
        const extraNotes = extraNotesInput.value;

        if (!start || !end) {
            alert('Vui lòng chọn đầy đủ thời gian bắt đầu và kết thúc ca trực.');
            return;
        }

        // Show loading state
        generateReportBtn.disabled = true;
        const originalBtnHTML = generateReportBtn.innerHTML;
        generateReportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ĐANG TỔNG HỢP & DỰ THẢO BẰNG AI...';
        aiSummarySection.style.display = 'none';

        try {
            const res = await fetch('/api/shift_reports/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shift_start: start,
                    shift_end: end,
                    shift_name: shiftName,
                    extra_notes: extraNotes
                })
            });

            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.error || 'Lỗi không xác định khi tạo báo cáo.');
            }

            // Populate AI drafting summary
            currentGeneratedEventsCount = data.total_events;
            eventCountBadge.innerText = `Ghi nhận: ${data.total_events} sự kiện`;
            reportSummaryInput.value = data.report_summary;
            
            // Show summary section
            aiSummarySection.style.display = 'block';
            aiSummarySection.scrollIntoView({ behavior: 'smooth' });

        } catch (error) {
            console.error('Lỗi sinh báo cáo AI:', error);
            alert(`Không thể sinh báo cáo bằng AI: ${error.message}`);
        } finally {
            generateReportBtn.disabled = false;
            generateReportBtn.innerHTML = originalBtnHTML;
        }
    });

    // Cancel / Reset report draft
    cancelReportBtn.addEventListener('click', () => {
        aiSummarySection.style.display = 'none';
        extraNotesInput.value = '';
        currentGeneratedEventsCount = 0;
    });

    // Save shift report to DB
    saveReportBtn.addEventListener('click', async () => {
        const start = shiftStartInput.value;
        const end = shiftEndInput.value;
        const summary = reportSummaryInput.value;

        if (!start || !end || !summary) {
            alert('Thông tin báo cáo không hợp lệ.');
            return;
        }

        saveReportBtn.disabled = true;
        saveReportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ĐANG LƯU BÁO CÁO...';

        try {
            const res = await fetch('/api/shift_reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shift_start: start,
                    shift_end: end,
                    total_events: currentGeneratedEventsCount,
                    report_summary: summary
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Lỗi khi lưu báo cáo.');
            }

            alert('Đã lưu báo cáo ca trực và bàn giao thành công!');
            
            // Hide report draft inputs, refresh list
            aiSummarySection.style.display = 'none';
            extraNotesInput.value = '';
            currentGeneratedEventsCount = 0;
            quickShiftSelect.value = 'custom';
            initDateTimeInputs();
            loadReportsHistory();

        } catch (error) {
            console.error('Lỗi khi lưu báo cáo:', error);
            alert(`Lưu báo cáo thất bại: ${error.message}`);
        } finally {
            saveReportBtn.disabled = false;
            saveReportBtn.innerHTML = '<i class="fas fa-save"></i> LƯU BÁO CÁO LÊN CƠ SỞ DỮ LIỆU';
        }
    });

    // Load past reports history list
    async function loadReportsHistory() {
        reportsHistoryList.innerHTML = `
            <div style="padding:40px; text-align:center; opacity:0.5; font-size:0.9rem;">
                <i class="fas fa-spinner fa-spin" style="font-size: 1.5rem; margin-bottom: 10px; display: block; color: #0ff;"></i>
                Đang tải danh sách báo cáo...
            </div>
        `;

        try {
            const res = await fetch('/api/shift_reports');
            if (!res.ok) throw new Error('Không thể tải lịch sử báo cáo.');
            
            const reports = await res.json();
            
            if (reports.length === 0) {
                reportsHistoryList.innerHTML = `
                    <div style="padding:40px; text-align:center; opacity:0.5; font-size:0.9rem; border: 1px dashed rgba(255,255,255,0.1); border-radius:16px;">
                        <i class="fas fa-folder-open" style="font-size: 2rem; margin-bottom: 10px; display: block; color: #555;"></i>
                        Chưa có báo cáo ca trực nào được lưu.
                    </div>
                `;
                return;
            }

            reportsHistoryList.innerHTML = '';
            reports.forEach(report => {
                const card = document.createElement('div');
                card.className = 'report-card';
                card.addEventListener('click', () => showReportDetails(report));

                const formatDate = (dateStr) => {
                    if (!dateStr) return '';
                    const d = new Date(dateStr.replace(' ', 'T'));
                    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                };

                card.innerHTML = `
                    <div class="report-card-title">
                        <span><i class="fas fa-file-invoice" style="color: #0ff; margin-right: 8px;"></i>Báo cáo #${report.report_id}</span>
                        <span style="font-size: 0.75rem; background: rgba(0, 255, 255, 0.15); color: #0ff; padding: 2px 10px; border-radius: 12px; font-weight: 500;">
                            ${report.total_events} sự kiện
                        </span>
                    </div>
                    <div style="font-size: 0.82rem; opacity: 0.9; margin-bottom: 8px; color: #e2e8f0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                        ${report.report_summary.split('\n')[0] || 'Xem chi tiết báo cáo...'}
                    </div>
                    <div class="report-card-meta">
                        <div class="report-card-meta-row">
                            <i class="fas fa-user-shield" style="font-size: 0.7rem; width: 14px;"></i>
                            <span>Nhân viên: <strong>${report.staff_name}</strong></span>
                        </div>
                        <div class="report-card-meta-row">
                            <i class="fas fa-clock" style="font-size: 0.7rem; width: 14px;"></i>
                            <span>Ca trực: ${formatDate(report.shift_start)} - ${formatDate(report.shift_end)}</span>
                        </div>
                        <div class="report-card-meta-row" style="margin-top: 4px; font-size: 0.72rem; opacity: 0.6;">
                            <i class="fas fa-calendar-check" style="font-size: 0.7rem; width: 14px;"></i>
                            <span>Nộp lúc: ${formatDate(report.created_at)}</span>
                        </div>
                    </div>
                `;
                reportsHistoryList.appendChild(card);
            });

        } catch (error) {
            console.error('Lỗi tải lịch sử báo cáo:', error);
            reportsHistoryList.innerHTML = `
                <div style="padding:40px; text-align:center; opacity:0.8; font-size:0.9rem; color: #ff3366;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 1.8rem; margin-bottom: 10px; display: block;"></i>
                    Không thể tải dữ liệu: ${error.message}
                </div>
            `;
        }
    }

    // Modal Details Show/Hide
    function showReportDetails(report) {
        modalReportId.innerText = report.report_id;
        modalStaffName.innerText = report.staff_name;
        
        const formatFullDate = (str) => {
            if (!str) return 'N/A';
            const d = new Date(str.replace(' ', 'T'));
            return d.toLocaleString('vi-VN');
        };

        modalCreatedAt.innerText = formatFullDate(report.created_at);
        modalShiftRange.innerText = `${formatFullDate(report.shift_start)} - ${formatFullDate(report.shift_end)}`;
        modalTotalEvents.innerText = `${report.total_events} sự kiện`;
        modalReportSummary.innerText = report.report_summary;

        reportDetailModal.style.display = 'flex';
    }

    function hideReportDetails() {
        reportDetailModal.style.display = 'none';
    }

    closeModalBtn.addEventListener('click', hideReportDetails);
    modalCloseActionBtn.addEventListener('click', hideReportDetails);
    
    // Close modal on clicking backdrop
    reportDetailModal.addEventListener('click', (e) => {
        if (e.target === reportDetailModal) {
            hideReportDetails();
        }
    });

    // Run Initializers
    initDateTimeInputs();
    loadReportsHistory();
});
