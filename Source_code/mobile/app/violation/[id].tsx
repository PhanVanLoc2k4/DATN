import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import {
  ChevronLeft,
  MapPin,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  PhoneCall,
  ShieldAlert,
  Info
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColor } from '@/hooks/use-theme-color';
import { SecurityButton, SecurityCard } from '@/components/security-ui';
import { apiService } from '@/services/api';
import { Violation } from '@/constants/types';

const { width, height } = Dimensions.get('window');

export default function ViolationDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [violation, setViolation] = useState<Violation | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [updating, setUpdating] = useState(false);

  const textColor = useThemeColor({}, 'text');
  const backgroundColor = useThemeColor({}, 'background');
  const tintColor = useThemeColor({}, 'tint');
  const dangerColor = useThemeColor({}, 'danger');

  useEffect(() => {
    const fetchViolation = async () => {
      try {
        const history = await apiService.getHistory();
        const item = history.find((v: any) => v.id.toString() === id);
        if (item) {
          const formatted = {
            ...item,
            image_url: apiService.getImageUrl(item.image_url)
          };
          setViolation(formatted);
          setStatus(item.status);
        }
      } catch (error) {
        console.error('Fetch Detail Error:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchViolation();
  }, [id]);

  const handleAction = (action: string) => {
    Alert.alert(
      'Xác nhận',
      `Bạn chắc chắn muốn đánh dấu vi phạm này là: ${action}?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đồng ý',
          onPress: async () => {
            setUpdating(true);
            try {
              const res = await apiService.updateStatus(Number(id), action);
              if (res.success) {
                setStatus(action);
                Alert.alert('Thành công', 'Đã cập nhật trạng thái vi phạm.');
              }
            } catch (error) {
              Alert.alert('Lỗi', 'Không thể cập nhật trạng thái.');
            } finally {
              setUpdating(false);
            }
          }
        }
      ]
    );
  };

  if (loading || !violation) {
    return (
      <View style={[styles.container, { backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#60A5FA" />
        <Text style={{ color: '#64748B', marginTop: 16, fontWeight: '600' }}>Đang tải dữ liệu...</Text>
      </View>
    );
  }

  const isCritical = violation.violation_type.toLowerCase().includes('đánh nhau') ||
    violation.violation_type.toLowerCase().includes('fight');

  return (
    <View style={[styles.container, { backgroundColor: '#0F172A' }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView style={styles.safeTopBar}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.blurBackBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerSubtitle}>CHI TIẾT HỆ THỐNG</Text>
            <Text style={styles.headerTitle}>Sự Kiện An Ninh</Text>
          </View>
          <TouchableOpacity style={styles.blurInfoBtn}>
            <Info size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <View style={styles.imageHeader}>
        <Image
          source={{ uri: violation.image_url }}
          style={styles.headerImage}
          contentFit="contain"
        />
        <LinearGradient
          colors={['rgba(15, 23, 42, 0.4)', 'rgba(15, 23, 42, 0.8)', '#0F172A']}
          style={styles.imageOverlay}
        />

        <View style={[styles.floatingBadge, { backgroundColor: isCritical ? '#EF4444' : '#F59E0B' }]}>
          <ShieldAlert size={16} color="#FFF" />
          <Text style={styles.badgeText}>{isCritical ? 'NGUY HIỂM' : 'CẢNH BÁO'}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.mainInfo}>
          <View style={styles.typeHeader}>
            <Text style={styles.violationTypeLabel}>LOẠI VI PHẠM</Text>
            <View style={styles.typeRow}>
              <Text style={styles.violationType}>{violation.violation_type}</Text>
              <View style={[styles.statusTag, { backgroundColor: status === 'Chưa xử lý' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)' }]}>
                <View style={[styles.statusDot, { backgroundColor: status === 'Chưa xử lý' ? '#EF4444' : '#10B981' }]} />
                <Text style={[styles.statusText, { color: status === 'Chưa xử lý' ? '#EF4444' : '#10B981' }]}>
                  {status}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.glassCard}>
            <View style={styles.detailItem}>
              <View style={[styles.iconWrapper, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                <MapPin size={20} color="#60A5FA" />
              </View>
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>Vị trí Camera</Text>
                <Text style={styles.detailValue}>{violation.camera_name}</Text>
                <Text style={styles.subValue}>{violation.location_detail || 'Khu vực chưa xác định'}</Text>
              </View>
            </View>

            <View style={styles.cardDivider} />

            <View style={styles.detailItem}>
              <View style={[styles.iconWrapper, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                <Clock size={20} color="#34D399" />
              </View>
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>Thời gian phát hiện</Text>
                <Text style={styles.detailValue}>{violation.detected_at}</Text>
              </View>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>ĐỐI TƯỢNG NHẬN DIỆN</Text>
          </View>
          <View style={styles.identitiesGrid}>
            {violation.identities ? violation.identities.split(',').map((item: string, index: number) => (
              <LinearGradient
                key={index}
                colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.02)']}
                style={styles.identityChip}
              >
                <View style={styles.identityMemberIcon}>
                  <Text style={styles.identityInitial}>{item.trim().charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.identityText}>{item.trim()}</Text>
              </LinearGradient>
            )) : (
              <View style={styles.emptyIdentity}>
                <AlertCircle size={18} color="#64748B" />
                <Text style={styles.emptyIdentityText}>Không xác định được danh tính</Text>
              </View>
            )}
          </View>

          <View style={styles.actionsBox}>
            <Text style={styles.actionPrompt}>BẠN MUỐN XỬ LÝ SỰ CỐ NÀY NHƯ THẾ NÀO?</Text>

            {status === 'Đã xử lý' ? (
              <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', padding: 16, borderRadius: 18, minHeight: 50, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                <CheckCircle2 size={22} color="#10B981" />
                <Text style={{ color: '#10B981', fontWeight: '800', fontSize: 14 }}>SỰ CỐ ĐÃ ĐƯỢC XỬ LÝ HOÀN TẤT</Text>
              </View>
            ) : (
              <View style={styles.actionRow}>
                {status !== 'Đang xử lý' && (
                  <TouchableOpacity
                    style={[styles.secondaryActionBtn, { backgroundColor: 'rgba(59, 130, 246, 0.2)', borderWidth: 1, borderColor: '#3B82F6' }]}
                    onPress={() => handleAction('Đã xác nhận')}
                    disabled={updating}
                  >
                    <CheckCircle2 size={18} color="#60A5FA" />
                    <Text style={[styles.actionBtnText, { color: '#60A5FA', fontSize: 12 }]}>TIẾP NHẬN</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.mainActionBtn, { backgroundColor: '#10B981' }]}
                  onPress={() => handleAction('Đã xử lý')}
                  disabled={updating}
                >
                  <CheckCircle2 size={20} color="#FFF" />
                  <Text style={styles.actionBtnText}>ĐÃ XỬ LÝ</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.secondaryActionBtn, { backgroundColor: 'rgba(148, 163, 184, 0.1)' }]}
                  onPress={() => handleAction('Báo cáo nhầm')}
                  disabled={updating}
                >
                  <XCircle size={18} color="#94A3B8" />
                  <Text style={[styles.actionBtnText, { color: '#94A3B8', fontSize: 12 }]}>BÁO NHẦM</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={[styles.emergencyBtn, { backgroundColor: dangerColor }]}
              onPress={() => Alert.alert('Khẩn cấp', 'Đang kết nối tới trạm điều phối...')}
            >
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.15)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <PhoneCall size={22} color="#FFF" />
              <Text style={styles.emergencyText}>GỌI HỖ TRỢ KHẨN CẤP</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  imageHeader: {
    width: '100%',
    height: 220,
    backgroundColor: '#0F172A',
    position: 'relative',
  },
  headerImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '35%',
  },
  safeTopBar: {
    backgroundColor: '#0F172A',
    zIndex: 10,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  blurBackBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  blurInfoBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerSubtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 2,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '800',
  },
  floatingBadge: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  contentScroll: {
    flex: 1,
    marginTop: -20,
  },
  scrollContent: {
    paddingBottom: 60,
  },
  mainInfo: {
    paddingHorizontal: 24,
  },
  typeHeader: {
    marginBottom: 24,
  },
  violationTypeLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  typeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  violationType: {
    color: '#FFF',
    fontSize: 26,
    fontWeight: '900',
    flex: 1,
    letterSpacing: -0.5,
  },
  statusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 32,
  },
  detailItem: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  iconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailText: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  subValue: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '500',
  },
  cardDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginVertical: 20,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1.5,
  },
  identitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 40,
  },
  identityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  identityMemberIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  identityInitial: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '900',
  },
  identityText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    backgroundColor: 'rgba(148, 163, 184, 0.05)',
    borderRadius: 16,
    width: '100%',
  },
  emptyIdentityText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  actionsBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 32,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  actionPrompt: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 20,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  mainActionBtn: {
    flex: 1.5,
    height: 58,
    borderRadius: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  secondaryActionBtn: {
    flex: 1,
    height: 58,
    borderRadius: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  actionBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  emergencyBtn: {
    height: 68,
    borderRadius: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 8,
  },
  emergencyText: {
    color: '#FFF',
    letterSpacing: 0.5,
  },
});
