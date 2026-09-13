/**
 * SPECTRA GUARD - IDENTITY MANAGEMENT
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Khởi tạo danh sách
    loadIdentities();

    // 2. Cập nhật thời gian & Admin link
    fetch('/api/profile')
        .then(res => res.json())
        .then(user => {
            if (user && user.role === 'admin') {
                const adminLink = document.getElementById('adminLink');
                if (adminLink) adminLink.style.display = 'flex';
            }
        })
        .catch(err => {});

    setInterval(() => {
        const el = document.getElementById('currentDateTime');
        if (el) el.innerText = new Date().toLocaleString('vi-VN');
    }, 1000);

    // 3. Xử lý Form Upload
    const addForm = document.getElementById('addIdentityForm');
    if (addForm) {
        addForm.onsubmit = async (e) => {
            e.preventDefault();
            await saveIdentity();
        };
    }

    // 4. Xử lý Form Edit
    const editForm = document.getElementById('editIdentityForm');
    if (editForm) {
        editForm.onsubmit = async (e) => {
            e.preventDefault();
            await submitEditIdentity();
        };
    }

    // 5. Xử lý Preview ảnh
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.onchange = (e) => {
            const [file] = e.target.files;
            if (file) {
                const preview = document.getElementById('previewImg');
                const placeholder = document.getElementById('uploadPlaceholder');
                preview.src = URL.createObjectURL(file);
                preview.style.display = 'block';
                placeholder.style.display = 'none';
            }
        };
    }
});

async function loadIdentities() {
    const list = document.getElementById('identityBody');
    if (!list) return;

    try {
        const res = await fetch('/api/identities');
        const data = await res.json();
        
        if (data.length === 0) {
            list.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 50px; opacity: 0.5;">Chưa có danh tính nào được lưu</td></tr>';
            return;
        }

        list.innerHTML = data.map(item => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
                <td style="padding: 15px; font-weight: 600; color: #00d4ff; font-size: 1rem;">
                    <i class="fas fa-user-circle" style="margin-right: 10px; opacity: 0.5;"></i> ${item.name.toUpperCase()}
                </td>
                <td style="padding: 15px; opacity: 0.7;">${item.mssv || '---'}</td>
                <td style="padding: 15px; opacity: 0.7;">${item.class || '---'}</td>
                <td style="padding: 15px; opacity: 0.7;">
                    <span style="background: rgba(0,255,204,0.1); color: #00ffcc; padding: 3px 12px; border-radius: 15px; font-size: 0.8rem;">
                        ${item.count} ảnh
                    </span>
                </td>
                <td style="padding: 15px; text-align: right;">
                    <button class="detail-btn" onclick="openEditIdentityModal('${item.name}', '${item.mssv || ''}', '${item.class || ''}')" style="background: rgba(0,255,170,0.1); color: #00ffaa; padding: 6px 12px; font-size: 0.75rem; border: none; border-radius: 5px; cursor: pointer; margin-right: 5px;">
                        <i class="fas fa-edit"></i> SỬA
                    </button>
                    <button class="detail-btn" onclick="deleteIdentity('${item.name}')" style="background: rgba(255,51,102,0.1); color: #ff3366; padding: 6px 12px; font-size: 0.75rem; border: none; border-radius: 5px; cursor: pointer;">
                        <i class="fas fa-trash-alt"></i> XÓA
                    </button>
                </td>
            </tr>
        `).join('');

    } catch (err) {
        console.error("Lỗi load danh tính:", err);
        list.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 50px; color: red;">Lỗi kết nối máy chủ</td></tr>';
    }
}

async function saveIdentity() {
    const form = document.getElementById('addIdentityForm');
    const formData = new FormData(form);
    
    // UI state
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ĐANG HUẤN LUYỆN...';
    submitBtn.disabled = true;

    try {
        const res = await fetch('/api/identities', {
            method: 'POST',
            body: formData
        });
        
        const result = await res.json();
        
        if (result.success) {
            alert('Huấn luyện thành công! Gương mặt đã được thêm vào hệ thống.');
            closeAddIdentityModal();
            loadIdentities();
        } else {
            alert('Lỗi: ' + result.message);
        }
    } catch (err) {
        alert('Lỗi kết nối khi lưu danh tính');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

async function deleteIdentity(name) {
    if (!confirm(`Bạn có chắc muốn xóa dữ liệu của "${name.toUpperCase()}"? Hành động này không thể hoàn tác.`)) return;

    try {
        const res = await fetch(`/api/identities/${encodeURIComponent(name)}`, {
            method: 'DELETE'
        });
        const result = await res.json();
        
        if (result.success) {
            loadIdentities();
        } else {
            alert('Lỗi: ' + result.message);
        }
    } catch (err) {
        alert('Lỗi kết nối khi xóa danh tính');
    }
}

window.openAddIdentityModal = () => {
    document.getElementById('addIdentityModal').style.display = 'flex';
}

window.closeAddIdentityModal = () => {
    document.getElementById('addIdentityModal').style.display = 'none';
    document.getElementById('addIdentityForm').reset();
    document.getElementById('previewImg').style.display = 'none';
    document.getElementById('uploadPlaceholder').style.display = 'block';
}

// EDIT MODAL LOGIC
window.openEditIdentityModal = (name, mssv, class_name) => {
    document.getElementById('oldIdentityName').value = name;
    document.getElementById('newIdentityName').value = name;
    document.getElementById('editIdentityMSSV').value = mssv || '';
    document.getElementById('editIdentityClass').value = class_name || '';
    document.getElementById('editIdentityModal').style.display = 'flex';
}

window.closeEditIdentityModal = () => {
    document.getElementById('editIdentityModal').style.display = 'none';
    document.getElementById('editIdentityForm').reset();
}

async function submitEditIdentity() {
    const oldName = document.getElementById('oldIdentityName').value;
    const newName = document.getElementById('newIdentityName').value;
    const mssv = document.getElementById('editIdentityMSSV').value;
    const className = document.getElementById('editIdentityClass').value;
    
    try {
        const res = await fetch(`/api/identities/${encodeURIComponent(oldName)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                new_name: newName,
                mssv: mssv,
                class_name: className
            })
        });
        
        const result = await res.json();
        
        if (result.success) {
            closeEditIdentityModal();
            loadIdentities();
        } else {
            alert('Lỗi: ' + result.message);
        }
    } catch (err) {
        alert('Lỗi kết nối khi cập nhật danh tính');
    }
}
