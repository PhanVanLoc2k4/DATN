document.addEventListener('DOMContentLoaded', function() {
    loadProfile();
    
    // Form update profile
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const fullName = document.getElementById('fullNameInput').value;
            const phone = document.getElementById('phoneInput').value;
            const email = document.getElementById('emailInput').value;
            const dob = document.getElementById('dobInput').value;
            const oldPassword = document.getElementById('oldPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            if (newPassword && newPassword !== confirmPassword) {
                alert('Mật khẩu mới không khớp!');
                return;
            }
            
            const data = { 
                full_name: fullName,
                phone: phone,
                email: email,
                dob: dob
            };
            if (newPassword) {
                data.old_password = oldPassword;
                data.new_password = newPassword;
            }
            
            try {
                const response = await fetch('/api/profile', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                
                const result = await response.json();
                if (result.success) {
                    alert('Cập nhật tài khoản thành công!');
                    location.reload();
                } else {
                    alert(result.message || 'Lỗi khi cập nhật');
                }
            } catch (error) {
                console.error('Error updating profile:', error);
                alert('Lỗi kết nối máy chủ');
            }
        });
    }
});

async function loadProfile() {
    try {
        const response = await fetch('/api/profile');
        const user = await response.json();
        
        if (user.id) {
            document.getElementById('displayUsername').innerText = user.username;
            document.getElementById('displayFullName').innerText = user.full_name || user.username;
            document.getElementById('displayPhone').innerText = user.phone || 'Chưa cập nhật';
            document.getElementById('displayEmail').innerText = user.email || 'Chưa cập nhật';
            document.getElementById('displayDob').innerText = user.dob || 'Chưa cập nhật';
            
            // Hiển thị avatar nếu có
            if (user.avatar_url) {
                const container = document.getElementById('avatarContainer');
                container.innerHTML = `<img src="${user.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;">`;
            }

            document.getElementById('fullNameInput').value = user.full_name || '';
            document.getElementById('phoneInput').value = user.phone || '';
            document.getElementById('emailInput').value = user.email || '';
            document.getElementById('dobInput').value = user.dob || '';
            
            // Show admin link if role is admin
            if (user.role === 'admin') {
                const adminLink = document.getElementById('adminLink');
                if (adminLink) adminLink.style.display = 'flex';
            }
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}
