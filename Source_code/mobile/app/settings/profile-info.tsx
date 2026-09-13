import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Phone, Mail, Calendar, ChevronLeft, Save, Edit3, Camera, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { apiService } from '@/services/api';
import { useAuth } from '@/context/auth-context';

export default function ProfileInfoScreen() {
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    email: '',
    dob: '',
    avatar_url: ''
  });

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [avatarTimestamp, setAvatarTimestamp] = useState(Date.now());

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await apiService.getProfile();
      setFormData({
        full_name: data.full_name || '',
        phone: data.phone || '',
        email: data.email || '',
        dob: data.dob || '',
        avatar_url: data.avatar_url || ''
      });
      setSelectedImage(null);
      setAvatarTimestamp(Date.now());
    } catch (error) {
      console.error('Load Profile Error:', error);
      Alert.alert('Lỗi', 'Không thể tải thông tin cá nhân');
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    if (!isEditing) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Quyền truy cập', 'Bạn cần cho phép truy cập thư viện ảnh để đổi ảnh đại diện');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!formData.full_name.trim()) {
      Alert.alert('Lỗi', 'Họ và tên không được để trống');
      return;
    }
    
    setSaving(true);
    try {
      let finalAvatarUrl = formData.avatar_url;

      // 1. Upload ảnh nếu có thay đổi
      if (selectedImage) {
        const uploadResult = await apiService.uploadAvatar(selectedImage);
        if (uploadResult.success) {
          finalAvatarUrl = uploadResult.avatar_url;
        } else {
          throw new Error(uploadResult.message || 'Lỗi upload ảnh');
        }
      }

      // 2. Cập nhật profile
      const updateData = {
        ...formData,
        avatar_url: finalAvatarUrl
      };

      const result = await apiService.updateProfile(updateData);
      if (result.success) {
        // Cập nhật context hệ thống ngay lập tức
        updateUser({
            full_name: updateData.full_name,
            avatar_url: finalAvatarUrl
        } as any);

        Alert.alert('Thành công', 'Thông tin đã được cập nhật');
        setFormData(updateData);
        setSelectedImage(null);
        setAvatarTimestamp(Date.now());
        setIsEditing(false);
      } else {
        Alert.alert('Lỗi', result.message || 'Cập nhật thất bại');
      }
    } catch (error: any) {
      console.error('Save Profile Error:', error);
      Alert.alert('Lỗi', error.message || 'Lỗi kết nối máy chủ');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    loadProfile();
    setIsEditing(false);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  const avatarSource = selectedImage 
    ? { uri: selectedImage }
    : (formData.avatar_url 
        ? { uri: `${apiService.getImageUrl(formData.avatar_url)}?t=${avatarTimestamp}` } 
        : null);

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#0F172A', '#1E293B']}
        style={StyleSheet.absoluteFill}
      />
      
      {/* Custom Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hồ sơ cá nhân</Text>
        {!isEditing ? (
          <TouchableOpacity 
            style={styles.editHeaderBtn} 
            onPress={() => setIsEditing(true)}
          >
            <Edit3 size={20} color="#3B82F6" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.editHeaderBtn} onPress={handleCancel}>
            <X size={20} color="#EF4444" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.avatarSection}>
          <TouchableOpacity 
            activeOpacity={isEditing ? 0.7 : 1} 
            onPress={pickImage}
            style={styles.avatarContainer}
          >
            <LinearGradient
              colors={['#3B82F6', '#1E40AF']}
              style={styles.avatarCircle}
            >
              {avatarSource ? (
                <Image source={avatarSource} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarInitial}>
                  {formData.full_name ? formData.full_name.charAt(0).toUpperCase() : 'U'}
                </Text>
              )}
            </LinearGradient>
            
            {isEditing && (
              <View style={styles.cameraBadge}>
                <Camera size={14} color="#FFF" />
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.displayName}>{formData.full_name || 'Người dùng'}</Text>
          <Text style={styles.usernameText}>@{user?.username}</Text>
        </View>

        <View style={styles.formSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>THÔNG TIN CƠ BẢN</Text>
            {isEditing && (
                <View style={styles.editingBadge}>
                    <Text style={styles.editingBadgeText}>ĐANG CHỈNH SỬA</Text>
                </View>
            )}
          </View>
          
          {[
            { label: 'HỌ VÀ TÊN', value: formData.full_name, icon: <User size={14} color="#60A5FA" />, key: 'full_name' },
            { label: 'SỐ ĐIỆN THOẠI', value: formData.phone, icon: <Phone size={14} color="#60A5FA" />, key: 'phone', keyboard: 'phone-pad' },
            { label: 'EMAIL', value: formData.email, icon: <Mail size={14} color="#60A5FA" />, key: 'email', keyboard: 'email-address' },
            { label: 'NGÀY SINH', value: formData.dob, icon: <Calendar size={14} color="#60A5FA" />, key: 'dob', placeholder: 'YYYY-MM-DD' },
          ].map((field, idx) => (
            <View key={idx} style={[styles.inputGroup, !isEditing && styles.disabledGroup]}>
              <View style={styles.labelRow}>
                {field.icon}
                <Text style={styles.inputLabel}>{field.label}</Text>
              </View>
              <View style={[styles.inputWrapper, isEditing && styles.activeInputWrapper]}>
                <TextInput
                  style={[styles.input, !isEditing && styles.disabledInput]}
                  value={field.value}
                  editable={isEditing}
                  onChangeText={(val) => setFormData({...formData, [field.key]: val})}
                  placeholder={field.placeholder || `Nhập ${field.label.toLowerCase()}`}
                  placeholderTextColor="#475569"
                  keyboardType={field.keyboard as any || 'default'}
                  autoCapitalize={field.key === 'email' ? 'none' : 'words'}
                />
              </View>
            </View>
          ))}

          {isEditing && (
            <View style={styles.actionButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
                <Text style={styles.cancelBtnText}>HỦY</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.saveBtn, saving && styles.disabledBtn]} 
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Save size={18} color="#FFF" />
                    <Text style={styles.saveBtnText}>LƯU THAY ĐỔI</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editHeaderBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatarCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  avatarInitial: {
    fontSize: 44,
    fontWeight: '900',
    color: '#FFF',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: '#3B82F6',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#1E293B',
  },
  displayName: {
    fontSize: 22,
    fontWeight: '900',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  usernameText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  formSection: {
    paddingHorizontal: 24,
  },
  sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 1.5,
  },
  editingBadge: {
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
  },
  editingBadgeText: {
      fontSize: 9,
      fontWeight: '900',
      color: '#3B82F6',
  },
  inputGroup: {
    marginBottom: 20,
  },
  disabledGroup: {
    opacity: 0.7,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    marginLeft: 4,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  inputWrapper: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  activeInputWrapper: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
  },
  disabledInput: {
    color: '#94A3B8',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '800',
  },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#3B82F6',
    height: 56,
    borderRadius: 18,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
