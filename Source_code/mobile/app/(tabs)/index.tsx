import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Image,
  Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldAlert, Bell, Filter, User, Activity, AlertCircle, ShieldCheck } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColor } from '@/hooks/use-theme-color';
import { AlertCard } from '@/components/alert-card';
import { Violation } from '@/constants/types';
import { useAuth } from '@/context/auth-context';
import { apiService } from '@/services/api';

const { width } = Dimensions.get('window');

export default function DashboardScreen() {
  const { user } = useAuth();
  const [violations, setViolations] = useState<Violation[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ today: 0, processed: 0, pending: 0 });
  const [profileData, setProfileData] = useState<any>(null);
  const [avatarTimestamp, setAvatarTimestamp] = useState(Date.now());

  const [latestAlert, setLatestAlert] = useState<Violation | null>(null);
  const prevAlertIdRef = React.useRef<number | null>(null);

  const [filterStatus, setFilterStatus] = useState<'All' | 'Chưa xử lý' | 'Processed'>('All');

  const isToday = (dateString: string) => {
    if (!dateString || dateString === 'N/A') return false;
    // Format từ backend trả về là: "HH:MM:SS DD/MM/YYYY" (ví dụ: 14:02:11 23/04/2026)
    const parts = dateString.split(' ');
    if (parts.length < 2) return false;
    
    const dateParts = parts[1].split('/');
    if (dateParts.length < 3) return false;

    const day = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1; // 0-based
    const year = parseInt(dateParts[2], 10);

    const t = new Date();
    return day === t.getDate() && month === t.getMonth() && year === t.getFullYear();
  };

  const filteredViolations = violations.filter(v => {
    // Chỉ hiển thị các cảnh báo trong ngày hôm nay
    if (!isToday(v.detected_at)) return false;

    if (filterStatus === 'All') return true;
    if (filterStatus === 'Chưa xử lý') return v.status === 'Chưa xử lý';
    if (filterStatus === 'Processed') return v.status !== 'Chưa xử lý';
    return true;
  });

  const fetchData = async () => {
    if (!user) return;
    try {
      const [historyResult] = await Promise.allSettled([
        apiService.getHistory(),
        apiService.getProfile().then(profile => {
          setProfileData(profile);
          setAvatarTimestamp(Date.now());
        })
      ]);
      if (historyResult.status === 'rejected') throw historyResult.reason;
      const history = historyResult.value;

      const formattedHistory = history.map((v: any) => ({
        ...v,
        image_url: apiService.getImageUrl(v.image_url)
      }));

      const todayVols = formattedHistory.filter((v: any) => isToday(v.detected_at));
      const todayProcessed = todayVols.filter((v: any) => v.status !== 'Chưa xử lý').length;
      const todayPending = todayVols.filter((v: any) => v.status === 'Chưa xử lý').length;

      if (formattedHistory.length > 0) {
        // Lấy record mới nhất (giả định record đầu tiên là mới nhất, hoặc tìm max id)
        const newest = [...formattedHistory].sort((a, b) => b.id - a.id)[0];
        if (prevAlertIdRef.current !== null && newest.id > prevAlertIdRef.current) {
          setLatestAlert(newest);
        }
        prevAlertIdRef.current = Math.max(prevAlertIdRef.current || 0, newest.id);
      }

      setViolations(formattedHistory);
      setStats({
        today: todayVols.length,
        processed: todayProcessed,
        pending: todayPending
      });
    } catch (error) {
      console.error('Fetch Error:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (user) {
        fetchData();
      }
    }, [user])
  );

  useEffect(() => {
    if (user) {
      const interval = setInterval(fetchData, 10000);
      return () => clearInterval(interval);
    }
  }, [user]);

  return (
    <View style={[styles.container, { backgroundColor: '#0F172A' }]}>
      <StatusBar barStyle="light-content" />

      {/* Floating Alert Modal */}
      <Modal
        visible={!!latestAlert}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.alertModalOverlay}>
          <View style={styles.alertModalContent}>
            <View style={styles.alertModalIconBox}>
              <ShieldAlert size={40} color="#EF4444" />
            </View>
            <Text style={styles.alertModalTitle}>CẢNH BÁO MỚI</Text>
            <Text style={styles.alertModalType}>{latestAlert?.violation_type}</Text>
            <Text style={styles.alertModalCamera}>📍 {latestAlert?.camera_name}</Text>
            
            <TouchableOpacity 
              style={styles.alertModalBtn} 
              onPress={() => setLatestAlert(null)}
            >
              <Text style={styles.alertModalBtnText}>XÁC NHẬN</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      {/* Header Section */}
      <View style={styles.header}>
        <LinearGradient
          colors={['rgba(59, 130, 246, 0.15)', 'transparent']}
          style={styles.headerGlow}
        />
        
        <SafeAreaView style={styles.safeHeader}>
          <View style={styles.headerContent}>
            <View style={styles.userInfo}>
              <LinearGradient
                colors={['#3B82F6', '#1E40AF']}
                style={styles.avatarBox}
              >
                {profileData?.avatar_url ? (
                  <Image 
                    source={{ uri: `${apiService.getImageUrl(profileData.avatar_url)}?t=${avatarTimestamp}` }} 
                    style={styles.avatarImage} 
                  />
                ) : (
                  <Text style={styles.avatarLetter}>
                    {profileData?.full_name ? profileData.full_name.charAt(0).toUpperCase() : (user?.username ? user.username.charAt(0).toUpperCase() : 'B')}
                  </Text>
                )}
              </LinearGradient>
              <View>
                <Text style={styles.greeting}>CHÀO BUỔI TỐI,</Text>
                <Text style={styles.userName}>{user?.full_name || user?.username || 'Bảo vệ'}</Text>
                <Text style={styles.employeeCode}>MSNV: {profileData?.employee_code || user?.employee_code || '—'}</Text>
              </View>
            </View>
            
            <TouchableOpacity style={styles.notificationBtn}>
              <Bell size={22} color="#F8FAFC" />
              {stats.pending > 0 && <View style={styles.badge} />}
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        <View style={styles.systemStatusContainer}>
          <View style={styles.systemStatus}>
            <View style={styles.pulseDot} />
            <Text style={styles.systemStatusText}>HỆ THỐNG AI ĐANG GIÁM SÁT</Text>
          </View>
          <View style={styles.statusDivider} />
          <Text style={styles.connectionText}>ĐÃ KẾT NỐI CAMERA</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#60A5FA" />
        }
      >
        {/* Statistics Cards */}
        <Text style={styles.sectionLabel}>TỔNG QUAN HÔM NAY</Text>
        <View style={styles.statsGrid}>
          <TouchableOpacity style={styles.statCard}>
            <LinearGradient colors={['#3B82F6', '#1E40AF']} style={styles.statGradient}>
              <Activity size={20} color="#FFF" />
              <Text style={styles.statCount}>{stats.today}</Text>
              <Text style={styles.statLabel}>Tổng vi phạm</Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.statRightColumn}>
            <View style={[styles.miniStat, { backgroundColor: 'rgba(16, 185, 129, 0.08)' }]}>
              <ShieldCheck size={16} color="#10B981" />
              <View>
                <Text style={styles.miniStatCount}>{stats.processed}</Text>
                <Text style={styles.miniStatLabel}>Đã xử lý</Text>
              </View>
            </View>
            <View style={[styles.miniStat, { backgroundColor: 'rgba(239, 68, 68, 0.08)' }]}>
              <AlertCircle size={16} color="#EF4444" />
              <View>
                <Text style={styles.miniStatCount}>{stats.pending}</Text>
                <Text style={styles.miniStatLabel}>Cần xử lý</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Alerts Section */}
        <View style={styles.feedHeader}>
          <Text style={styles.feedTitle}>Cảnh báo an ninh</Text>
          <View style={styles.filterBar}>
            <TouchableOpacity
              onPress={() => setFilterStatus('All')}
              style={[styles.filterChip, filterStatus === 'All' && styles.activeFilter]}
            >
              <Text style={[styles.filterText, filterStatus === 'All' && styles.activeFilterText]}>Tất cả</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              onPress={() => setFilterStatus('Chưa xử lý')}
              style={[styles.filterChip, filterStatus === 'Chưa xử lý' && styles.warningFilter]}
            >
              <Text style={[styles.filterText, filterStatus === 'Chưa xử lý' && styles.activeFilterText]}>Mới</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setFilterStatus('Processed')}
              style={[styles.filterChip, filterStatus === 'Processed' && styles.successFilter]}
            >
              <Text style={[styles.filterText, filterStatus === 'Processed' && styles.activeFilterText]}>Xong</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.alertList}>
          {filteredViolations.length > 0 ? (
            filteredViolations.map((v) => (
              <AlertCard key={v.id} violation={v} />
            ))
          ) : (
            <View style={styles.emptyBox}>
              <ShieldAlert size={48} color="#1E293B" />
              <Text style={styles.emptyText}>Hiện tại không có cảnh báo nào</Text>
            </View>
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  alertModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 9999,
  },
  alertModalContent: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    elevation: 24,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
  },
  alertModalIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  alertModalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#EF4444',
    marginBottom: 8,
    letterSpacing: 1,
  },
  alertModalType: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 8,
    textAlign: 'center',
  },
  alertModalCamera: {
    fontSize: 15,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 32,
  },
  alertModalBtn: {
    width: '100%',
    height: 56,
    backgroundColor: '#EF4444',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertModalBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  header: {
    paddingBottom: 20,
    backgroundColor: '#0F172A',
    position: 'relative',
  },
  headerGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 180,
  },
  safeHeader: {
    paddingTop: 10,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  avatarLetter: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFF',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    resizeMode: 'cover',
  },
  greeting: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1.5,
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  employeeCode: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  notificationBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  badge: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#0F172A',
  },
  systemStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    marginHorizontal: 24,
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  systemStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  systemStatusText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  statusDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 12,
  },
  connectionText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  scrollContent: {
    paddingTop: 20,
    paddingHorizontal: 24,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 1.5,
    marginBottom: 16,
    marginLeft: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  statCard: {
    flex: 1.2,
    height: 130,
    borderRadius: 24,
    overflow: 'hidden',
  },
  statGradient: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
  },
  statCount: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFF',
    lineHeight: 40,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  statRightColumn: {
    flex: 1,
    gap: 12,
  },
  miniStat: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  miniStatCount: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF',
  },
  miniStatLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  feedHeader: {
    marginBottom: 20,
  },
  feedTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F1F5F9',
    marginBottom: 16,
  },
  filterBar: {
    flexDirection: 'row',
    gap: 10,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  activeFilter: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  warningFilter: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  successFilter: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  activeFilterText: {
    color: '#FFF',
  },
  alertList: {
    gap: 0,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
    borderRadius: 30,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(148, 163, 184, 0.1)',
  },
  emptyText: {
    marginTop: 16,
    color: '#334155',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomSpacer: {
    height: 120,
  },
});
