import React, { useState } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock, Eye, EyeOff, ChevronLeft, ShieldCheck, AlertCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { apiService } from '@/services/api';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  
  const [form, setForm] = useState({
    old_password: '',
    new_password: '',
    confirm_password: ''
  });

  const handleUpdate = async () => {
    if (!form.old_password || !form.new_password || !form.confirm_password) {
      Alert.alert('Lỗi', 'Vui lòng điền đầy đủ các trường');
      return;
    }
    
    if (form.new_password !== form.confirm_password) {
      Alert.alert('Lỗi', 'Mật khẩu mới không khớp');
      return;
    }
    
    if (form.new_password.length < 3) {
      Alert.alert('Lỗi', 'Mật khẩu mới quá ngắn');
      return;
    }

    setLoading(true);
    try {
      const result = await apiService.updateProfile({
        old_password: form.old_password,
        new_password: form.new_password
      });
      
      if (result.success) {
        Alert.alert('Thành công', 'Mật khẩu đã được thay đổi', [
          { text: 'OK', onPress: () => router.back() }
        ]);
      } else {
        Alert.alert('Lỗi', result.message || 'Thay đổi mật khẩu thất bại');
      }
    } catch (error) {
      console.error('Change Password Error:', error);
      Alert.alert('Lỗi', 'Lỗi kết nối máy chủ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#0F172A', '#1E293B']}
        style={StyleSheet.absoluteFill}
      />
      
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Đổi mật khẩu</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.illustrationSection}>
          <View style={styles.iconCircle}>
            <ShieldCheck size={40} color="#3B82F6" />
          </View>
          <Text style={styles.instructionText}>
            Vui lòng nhập mật khẩu hiện tại và thiết lập mật khẩu mới cho tài khoản của bạn.
          </Text>
        </View>

        <View style={styles.formSection}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>MẬT KHẨU HIỆN TẠI</Text>
            <View style={styles.inputWrapper}>
              <Lock size={18} color="#475569" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                secureTextEntry={!showOld}
                value={form.old_password}
                onChangeText={(v) => setForm({...form, old_password: v})}
                placeholder="••••••••"
                placeholderTextColor="#334155"
              />
              <TouchableOpacity onPress={() => setShowOld(!showOld)}>
                {showOld ? <EyeOff size={20} color="#64748B" /> : <Eye size={20} color="#64748B" />}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>MẬT KHẨU MỚI</Text>
            <View style={styles.inputWrapper}>
              <Lock size={18} color="#60A5FA" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                secureTextEntry={!showNew}
                value={form.new_password}
                onChangeText={(v) => setForm({...form, new_password: v})}
                placeholder="Tối thiểu 3 ký tự"
                placeholderTextColor="#334155"
              />
              <TouchableOpacity onPress={() => setShowNew(!showNew)}>
                {showNew ? <EyeOff size={20} color="#64748B" /> : <Eye size={20} color="#64748B" />}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>XÁC NHẬN MẬT KHẨU MỚI</Text>
            <View style={styles.inputWrapper}>
              <Lock size={18} color="#60A5FA" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                secureTextEntry={!showConfirm}
                value={form.confirm_password}
                onChangeText={(v) => setForm({...form, confirm_password: v})}
                placeholder="Nhập lại mật khẩu mới"
                placeholderTextColor="#334155"
              />
              <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)}>
                {showConfirm ? <EyeOff size={20} color="#64748B" /> : <Eye size={20} color="#64748B" />}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.warningBox}>
            <AlertCircle size={16} color="#F59E0B" />
            <Text style={styles.warningText}>
              Đảm bảo mật khẩu của bạn là duy nhất và khó đoán để nâng cao tính bảo mật.
            </Text>
          </View>

          <TouchableOpacity 
            style={[styles.updateBtn, loading && styles.disabledBtn]} 
            onPress={handleUpdate}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.updateBtnText}>CẬP NHẬT MẬT KHẨU</Text>
            )}
          </TouchableOpacity>
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  illustrationSection: {
    alignItems: 'center',
    paddingHorizontal: 40,
    marginTop: 30,
    marginBottom: 40,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 30,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
  },
  instructionText: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500',
  },
  formSection: {
    paddingHorizontal: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 10,
    marginLeft: 4,
    letterSpacing: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 18,
    paddingHorizontal: 16,
    height: 60,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginVertical: 10,
    marginBottom: 30,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
    padding: 16,
    borderRadius: 16,
    gap: 12,
    alignItems: 'center',
    marginBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.1)',
  },
  warningText: {
    flex: 1,
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 18,
  },
  updateBtn: {
    backgroundColor: '#3B82F6',
    height: 64,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  updateBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
