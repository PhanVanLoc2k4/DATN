document.addEventListener('DOMContentLoaded', function() {
    loadUsers();
    
    const userForm = document.getElementById('userForm');
    if (userForm) {
        userForm.addEventListener('submit', handleUserSubmit);
    }
});

function escapeUserText(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
}

async function loadUsers() {
    try {
        const response = await fetch('/api/admin/users');
        const users = await response.json();
        
        const tbody = document.getElementById('userTableBody');
        tbody.innerHTML = '';
        
        users.forEach(user => {
            const date = new Date(user.created_at).toLocaleDateString('vi-VN');
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            tr.innerHTML = `
                <td style="padding: 15px;">
                    <div style="font-weight: 600; color: #fff;">${escapeUserText(user.full_name || '---')}</div>
                </td>
                <td style="padding: 15px; opacity: 0.8;">${escapeUserText(user.username)}</td>
                <td style="padding: 15px; opacity: 0.8;">${escapeUserText(user.employee_code || '—')}</td>
                <td style="padding: 15px;">
                    <span style="padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; 
                        background: ${user.role === 'admin' ? 'rgba(0,255,255,0.1)' : 'rgba(255,255,255,0.05)'};
                        color: ${user.role === 'admin' ? '#0ff' : '#94A3B8'};
                        border: 1px solid ${user.role === 'admin' ? 'rgba(0,255,255,0.2)' : 'transparent'};">
                        ${escapeUserText((user.role || '').toUpperCase())}
                    </span>
                </td>
                <td style="padding: 15px; opacity: 0.6; font-size: 0.85rem;">${date}</td>
                <td style="padding: 15px; text-align: right;">
                    <button data-action="edit"
                        style="background: none; border: none; color: #0ff; cursor: pointer; margin-right: 15px; font-size: 1.1rem;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button data-action="delete"
                        style="background: none; border: none; color: #ff3366; cursor: pointer; font-size: 1.1rem;">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tr.querySelector('[data-action="edit"]').addEventListener('click', () =>
                openEditUserModal(user.id, user.username, user.full_name, user.role, user.employee_code));
            tr.querySelector('[data-action="delete"]').addEventListener('click', () => deleteUser(user.id));
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

function openAddUserModal() {
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-user-plus"></i> TẠO TÀI KHOẢN MỚI';
    document.getElementById('userId').value = '';
    document.getElementById('userUsername').value = '';
    document.getElementById('userUsername').disabled = false;
    document.getElementById('userFullName').value = '';
    document.getElementById('userEmployeeCode').value = '';
    document.getElementById('userPassword').value = '';
    document.getElementById('userPassword').placeholder = 'Mật khẩu đăng nhập';
    document.getElementById('userPassword').required = true;
    document.getElementById('userRole').value = 'user';
    document.getElementById('userModal').style.display = 'flex';
}

function openEditUserModal(id, username, fullName, role, employeeCode) {
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-user-edit"></i> CHỈNH SỬA TÀI KHOẢN';
    document.getElementById('userId').value = id;
    document.getElementById('userUsername').value = username;
    document.getElementById('userUsername').disabled = true;
    document.getElementById('userFullName').value = fullName === 'null' ? '' : fullName;
    document.getElementById('userEmployeeCode').value = employeeCode || '';
    document.getElementById('userPassword').value = '';
    document.getElementById('userPassword').placeholder = 'Bỏ trống nếu không đổi';
    document.getElementById('userPassword').required = false;
    document.getElementById('userRole').value = role;
    document.getElementById('userModal').style.display = 'flex';
}

function closeUserModal() {
    document.getElementById('userModal').style.display = 'none';
    document.getElementById('userForm').reset();
}

async function handleUserSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('userId').value;
    const data = {
        username: document.getElementById('userUsername').value,
        full_name: document.getElementById('userFullName').value,
        role: document.getElementById('userRole').value,
    };
    
    const password = document.getElementById('userPassword').value;
    if (password) data.password = password;

    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/admin/users/${id}` : '/api/admin/users';

    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (result.success) {
            closeUserModal();
            loadUsers();
        } else {
            alert(result.message || 'Lỗi thao tác');
        }
    } catch (error) {
        console.error('Error saving user:', error);
        alert('Lỗi kết nối');
    }
}

async function deleteUser(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa tài khoản này không?')) return;
    
    try {
        const response = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            loadUsers();
        } else {
            alert(result.message || 'Lỗi khi xóa');
        }
    } catch (error) {
        console.error('Error deleting user:', error);
    }
}
