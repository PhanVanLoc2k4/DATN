import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldCheck, ChevronLeft, ChevronRight, Lock, Fingerprint, Eye, Globe, Smartphone, Trash2, AlertCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

export default function SecurityScreen() {
  const router = useRouter();
  
  const [settings, setSettings] = useState({
    faceId: true,
    activityStatus: true,
    twoFactor: false,
    privacyMode: false
  });

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const loginActivity = [
    { id: 1, device: 'Samsung Galaxy S23', location: 'TP. Hồ Chí Minh', time: 'Đang hoạt động', current: true },
    { id: 2, device: 'iPhone 15 Pro Max', location: 'Hà Nội, Việt Nam', time: '2 giờ trước', current: false },
    { id: 3, device: 'MacBook Pro 14"', location: 'Đà Nẵng, Việt Nam', time: 'Hôm qua', current: false },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#0F172A', '#1E293B']}
        style={StyleSheet.absoluteFill}
      />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bảo mật & Quyền riêng tư</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Security Status Card */}
        <View style={styles.statusCard}>
          <LinearGradient
            colors={['rgba(16, 185, 129, 0.15)', 'rgba(5, 150, 105, 0.05)']}
            style={styles.statusGradient}
          >
            <View style={styles.statusIconBox}>
              <ShieldCheck size={32} color="#10B981" />
            </View>
            <View style={styles.statusInfo}>
              <Text style={styles.statusTitle}>Tài khoản đang an toàn</Text>
              <Text style={styles.statusSubtitle}>Lần kiểm tra cuối: 5 phút trước</Text>
            </View>
          </LinearGradient>
        </View>

        {/* Section: Credentials */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TÀI KHOẢN & MẬT KHẨU</Text>
          <View style={styles.glassCard}>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => router.push('/settings/change-password')}
            >
              <View style={[styles.iconBox, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                <Lock size={20} color="#3B82F6" />
              </View>
              <View style={styles.menuText}>
                <Text style={styles.itemTitle}>Đổi mật khẩu</Text>
                <Text style={styles.itemSubtitle}>Cập nhật mật khẩu mới định kỳ</Text>
              </View>
              <ChevronRight size={18} color="#475569" />
            </TouchableOpacity>

            <View style={styles.divider} />

            <View style={styles.menuItem}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(139, 92, 246, 0.1)' }]}>
                <Fingerprint size={20} color="#8B5CF6" />
              </View>
              <View style={styles.menuText}>
                <Text style={styles.itemTitle}>Xác thực sinh trắc học</Text>
                <Text style={styles.itemSubtitle}>Sử dụng FaceID hoặc Vân tay</Text>
              </View>
              <Switch 
                value={settings.faceId}
                onValueChange={() => toggleSetting('faceId')}
                trackColor={{ false: '#334155', true: '#8B5CF6' }}
                thumbColor="#FFF"
              />
            </View>
          </View>
        </View>

        {/* Section: Login Activity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>HOẠT ĐỘNG ĐĂNG NHẬP</Text>
          <View style={styles.glassCard}>
            {loginActivity.map((item, index) => (
              <View key={item.id}>
                <View style={styles.activityItem}>
                  <View style={styles.deviceIconBox}>
                    <Smartphone size={18} color={item.current ? "#3B82F6" : "#64748B"} />
                  </View>
                  <View style={styles.activityInfo}>
                    <View style={styles.activityHeader}>
                      <Text style={styles.deviceText}>{item.device}</Text>
                      {item.current && <View style={styles.currentBadge}><Text style={styles.currentBadgeText}>HIỆN TẠI</Text></View>}
                    </View>
                    <Text style={styles.locationText}>{item.location} • {item.time}</Text>
                  </View>
                </View>
                {index < loginActivity.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
            <TouchableOpacity style={styles.viewMoreBtn}>
              <Text style={styles.viewMoreText}>Xem tất cả hoạt động</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section: Privacy */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>QUYỀN RIÊNG TƯ</Text>
          <View style={styles.glassCard}>
            <View style={styles.menuItem}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                <Eye size={20} color="#10B981" />
              </View>
              <View style={styles.menuText}>
                <Text style={styles.itemTitle}>Trạng thái hoạt động</Text>
                <Text style={styles.itemSubtitle}>Cho người khác biết bạn đang online</Text>
              </View>
              <Switch 
                value={settings.activityStatus}
                onValueChange={() => toggleSetting('activityStatus')}
                trackColor={{ false: '#334155', true: '#10B981' }}
                thumbColor="#FFF"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.menuItem}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
                <Globe size={20} color="#F59E0B" />
              </View>
              <View style={styles.menuText}>
                <Text style={styles.itemTitle}>Chế độ ẩn danh</Text>
                <Text style={styles.itemSubtitle}>Không lưu lịch sử tìm kiếm</Text>
              </View>
              <Switch 
                value={settings.privacyMode}
                onValueChange={() => toggleSetting('privacyMode')}
                trackColor={{ false: '#334155', true: '#F59E0B' }}
                thumbColor="#FFF"
              />
            </View>
          </View>
        </View>

        {/* Danger Zone */}
        <View style={[styles.section, { marginBottom: 40 }]}>
          <Text style={styles.dangerTitle}>VÙNG NGUY HIỂM</Text>
          <TouchableOpacity 
            style={styles.dangerBtn}
            onPress={() => Alert.alert('Xác nhận', 'Bạn có chắc chắn muốn xóa tài khoản? Hành động này không thể hoàn tác.', [{text: 'Hủy'}, {text: 'Xóa', style: 'destructive'}])}
          >
            <View style={styles.dangerIconBox}>
              <Trash2 size={20} color="#EF4444" />
            </View>
            <Text style={styles.dangerBtnText}>Xóa tài khoản vĩnh viễn</Text>
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
    paddingBottom: 20,
  },
  statusCard: {
    margin: 24,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  statusGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    gap: 20,
  },
  statusIconBox: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusInfo: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#10B981',
    marginBottom: 4,
  },
  statusSubtitle: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: 24,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 1.5,
    marginBottom: 16,
    marginLeft: 4,
  },
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuText: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  itemSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginHorizontal: 20,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 16,
  },
  deviceIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityInfo: {
    flex: 1,
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  deviceText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  currentBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  currentBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#3B82F6',
  },
  locationText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  viewMoreBtn: {
    alignItems: 'center',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  viewMoreText: {
    color: '#3B82F6',
    fontSize: 13,
    fontWeight: '700',
  },
  dangerTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#EF4444',
    letterSpacing: 1.5,
    marginBottom: 16,
    marginLeft: 4,
  },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.1)',
    gap: 16,
  },
  dangerIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dangerBtnText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '800',
  },
});
