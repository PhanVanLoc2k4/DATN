import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Alert, Dimensions, Image, Linking, Modal, ActivityIndicator, TextInput, Platform } from 'react-native';
import { 
  User, 
  Settings, 
  Bell, 
  ShieldCheck, 
  LogOut, 
  ChevronRight, 
  Heart,
  HelpCircle,
  FileText,
  Shield,
  Activity,
  History,
  Lock
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/context/auth-context';
import { SecurityCard } from '@/components/security-ui';
import { apiService } from '@/services/api';

const { width } = Dimensions.get('window');

type CsvRow = { id: number; camera: string; type: string; time: string; status: string; identities: string; processor: string };
type CsvPeriod = 'day' | 'month' | 'year';
const csvPeriods: { value: CsvPeriod; label: string }[] = [
  { value: 'day', label: 'Hôm nay' },
  { value: 'month', label: 'Tháng này' },
  { value: 'year', label: 'Năm nay' },
];
const csvColumns: { key: keyof CsvRow; label: string; width: number }[] = [
  { key: 'id', label: 'Mã sự kiện', width: 90 },
  { key: 'time', label: 'Thời gian', width: 170 },
  { key: 'camera', label: 'Camera', width: 140 },
  { key: 'type', label: 'Sự kiện', width: 220 },
  { key: 'status', label: 'Trạng thái', width: 140 },
  { key: 'identities', label: 'Đối tượng', width: 180 },
  { key: 'processor', label: 'Người xử lý', width: 160 },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const tintColor = useThemeColor({}, 'tint');

  const [stats, setStats] = React.useState({ total: 0, processed: 0 });
  const [profileData, setProfileData] = React.useState<any>(null);
  const [avatarTimestamp, setAvatarTimestamp] = React.useState(Date.now());
  const [reportVisible, setReportVisible] = React.useState(false);
  const [reportText, setReportText] = React.useState('');
  const [loadingReport, setLoadingReport] = React.useState(false);
  const [activeModalTab, setActiveModalTab] = React.useState<'history' | 'create'>('create');
  const [historyReports, setHistoryReports] = React.useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState(false);
  const [selectedHistoryReport, setSelectedHistoryReport] = React.useState<any | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [csvVisible, setCsvVisible] = React.useState(false);
  const [csvPeriod, setCsvPeriod] = React.useState<CsvPeriod>('day');
  const [csvRows, setCsvRows] = React.useState<CsvRow[]>([]);
  const [csvLoading, setCsvLoading] = React.useState(false);
  const [csvExporting, setCsvExporting] = React.useState(false);
  const [csvError, setCsvError] = React.useState('');
  const csvBusy = React.useRef(false);
  const previewRequest = React.useRef(0);
  React.useEffect(() => () => { previewRequest.current += 1; }, []);

  useFocusEffect(
    React.useCallback(() => {
      const fetchProfileData = async () => {
        try {
          const [summary, profile] = await Promise.all([
            apiService.getAnalyticsSummary(true),
            apiService.getProfile()
          ]);
          setStats({
            total: summary.today || 0,
            processed: summary.today_processed || 0
          });
          setProfileData(profile);
          setAvatarTimestamp(Date.now());
        } catch (error) {
          console.error('Profile Data Fetch Error:', error);
        }
      };
      fetchProfileData();
    }, [])
  );

  const loadCsvPreview = async (period: CsvPeriod) => {
    if (csvBusy.current) return;
    setCsvPeriod(period);
    const requestId = ++previewRequest.current;
    setCsvVisible(true);
    setCsvLoading(true);
    setCsvError('');
    setCsvRows([]);
    try {
      const res = await apiService.exportPersonalReport(period, true);
      if (requestId !== previewRequest.current) return;
      if (!res.success || !Array.isArray(res.data)) throw new Error('Invalid preview');
      setCsvRows(res.data);
    } catch {
      if (requestId === previewRequest.current) setCsvError('Không tải được bảng xem trước. Vui lòng thử lại.');
    } finally {
      if (requestId === previewRequest.current) setCsvLoading(false);
    }
  };

  const handleExportCSV = () => loadCsvPreview(csvPeriod);

  const closeCsvPreview = () => {
    if (csvBusy.current) return;
    previewRequest.current += 1;
    setCsvVisible(false);
  };

  const confirmExportCSV = async () => {
    if (csvBusy.current || csvLoading || csvError || csvRows.length === 0) return;
    csvBusy.current = true;
    setCsvExporting(true);
    try {
      const res = await apiService.exportPersonalReport(csvPeriod);
      if (res.success && res.path) {
        setCsvVisible(false);
        const fileUrl = apiService.getImageUrl(res.path);
        Alert.alert(
          'Xuất báo cáo thành công',
          `Báo cáo cá nhân đã được tạo thành công.\nMã báo cáo: ${res.code}\n\nBạn có muốn tải về hoặc mở file báo cáo không?`,
          [
            { text: 'Hủy', style: 'cancel' },
            { 
              text: 'Mở báo cáo', 
              onPress: () => {
                Linking.openURL(fileUrl).catch(err => 
                  Alert.alert('Lỗi', 'Không thể mở liên kết báo cáo.')
                );
              } 
            }
          ]
        );
      } else {
        Alert.alert('Lỗi', res.error || 'Không thể xuất báo cáo.');
      }
    } catch (error: any) {
      console.error('Export CSV Error:', error);
      Alert.alert('Lỗi', 'Đã xảy ra lỗi khi kết nối tới máy chủ.');
    } finally {
      csvBusy.current = false;
      setCsvExporting(false);
    }
  };

  const handleShiftReport = async () => {
    try {
      setReportVisible(true);
      setActiveModalTab('create');
      setLoadingHistory(true);
      setSelectedHistoryReport(null);
      
      const res = await apiService.getShiftReports(true);
      setHistoryReports(res || []);
    } catch (error: any) {
      console.error('Fetch Shift Reports History Error:', error);
      Alert.alert('Lỗi', 'Không thể tải lịch sử báo cáo ca trực.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const generateNewReport = async () => {
    try {
      setLoadingReport(true);
      setReportText('Đang khởi tạo báo cáo ca trực AI...');
      const res = await apiService.getPersonalShiftReport();
      if (res && res.report) {
        setReportText(res.report);
      } else {
        setReportText('Lỗi: Không nhận được báo cáo từ máy chủ.');
      }
    } catch (error: any) {
      console.error('Generate Shift Report Error:', error);
      setReportText('Lỗi: Không thể kết nối tới máy chủ an ninh.');
    } finally {
      setLoadingReport(false);
    }
  };

  const saveNewReport = async () => {
    if (!reportText || reportText.startsWith('Lỗi') || reportText.startsWith('Đang')) {
      Alert.alert('Lỗi', 'Nội dung báo cáo không hợp lệ để lưu.');
      return;
    }
    try {
      setIsSaving(true);
      const now = new Date();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const res = await apiService.saveShiftReport({
        shift_start: todayStart.toISOString(),
        shift_end: now.toISOString(),
        total_events: stats.processed,
        report_summary: reportText
      });
      
      if (res.success) {
        Alert.alert('Thành công', 'Đã lưu báo cáo ca trực vào cơ sở dữ liệu.');
        // Refresh history
        const historyRes = await apiService.getShiftReports(true);
        setHistoryReports(historyRes || []);
        setActiveModalTab('history');
      } else {
        Alert.alert('Lỗi', res.message || 'Không thể lưu báo cáo.');
      }
    } catch (error: any) {
      console.error('Save Shift Report Error:', error);
      Alert.alert('Lỗi', 'Đã xảy ra lỗi khi lưu báo cáo.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Xác nhận đăng xuất',
      'Bạn có chắc chắn muốn thoát khỏi phiên làm việc hiện tại?',
      [
        { text: 'Hủy', style: 'cancel' },
        { 
          text: 'Đăng xuất', 
          style: 'destructive', 
          onPress: signOut 
        }
      ]
    );
  };

  const accountItems = [
    { 
      icon: <User size={20} color="#60A5FA" />, 
      title: 'Thông tin cá nhân', 
      subtitle: 'Chi tiết tài khoản của bạn', 
      color: 'rgba(59, 130, 246, 0.1)',
      onPress: () => router.push('/settings/profile-info')
    },
    { 
      icon: <ShieldCheck size={20} color="#34D399" />, 
      title: 'Bảo mật & Quyền riêng tư', 
      subtitle: 'Mật khẩu, xác thực 2 lớp', 
      color: 'rgba(16, 185, 129, 0.1)',
      onPress: () => router.push('/settings/security')
    },
    { 
      icon: <Bell size={20} color="#F59E0B" />, 
      title: 'Thông báo', 
      subtitle: 'Cài đặt cảnh báo tức thời', 
      color: 'rgba(245, 158, 11, 0.1)',
      onPress: () => router.push('/settings/notifications')
    },
  ];

  const systemItems = [
    { 
      icon: <History size={20} color="#94A3B8" />, 
      title: 'Nhật ký hoạt động', 
      subtitle: 'Lịch sử thao tác trên ứng dụng',
      onPress: () => router.push('/settings/activity-log')
    },
    { 
      icon: <FileText size={20} color="#38BDF8" />, 
      title: 'Báo cáo ca trực', 
      subtitle: 'Xem báo cáo tổng hợp ca trực hôm nay (AI)',
      onPress: handleShiftReport
    },
    { 
      icon: <FileText size={20} color="#10B981" />, 
      title: 'Xuất báo cáo cá nhân (CSV)', 
      subtitle: 'Vi phạm đã xử lý • Theo ngày, tháng hoặc năm',
      onPress: handleExportCSV
    },
  ];

  const helpItems = [
    { 
      icon: <HelpCircle size={20} color="#94A3B8" />, 
      title: 'Trung tâm hỗ trợ',
      onPress: () => Alert.alert('Hỗ trợ', 'Chức năng đang được cập nhật...')
    },
    { 
      icon: <FileText size={20} color="#94A3B8" />, 
      title: 'Điều khoản & Chính sách',
      onPress: () => Alert.alert('Chính sách', 'Chức năng đang được cập nhật...')
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: '#0F172A' }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Header Section */}
        <View style={styles.header}>
          <LinearGradient
            colors={['rgba(59, 130, 246, 0.2)', 'transparent']}
            style={styles.headerGlow}
          />
          
          <View style={styles.avatarWrapper}>
            <LinearGradient
              colors={['#3B82F6', '#1E40AF']}
              style={styles.avatarGradient}
            >
              {profileData?.avatar_url ? (
                <Image 
                  source={{ uri: `${apiService.getImageUrl(profileData.avatar_url)}?t=${avatarTimestamp}` }} 
                  style={styles.avatarImg} 
                />
              ) : (
                <Text style={styles.avatarText}>
                  {profileData?.full_name ? profileData.full_name.charAt(0).toUpperCase() : (user?.username ? user.username.charAt(0).toUpperCase() : 'A')}
                </Text>
              )}
            </LinearGradient>
            <View style={styles.onlineBadge} />
          </View>

          <Text style={styles.userName}>{user?.full_name || user?.username || 'Người dùng'}</Text>
          <View style={styles.roleBadge}>
            <Shield size={12} color="#60A5FA" />
            <Text style={styles.roleText}>
              {user?.role === 'admin' ? 'QUẢN TRỊ VIÊN' : 'NHÂN VIÊN AN NINH'}
            </Text>
          </View>
        </View>

        {/* Stats Section */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>Sự kiện</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.processed}</Text>
            <Text style={styles.statLabel}>Đã xử lý</Text>
          </View>
        </View>

        {/* Menu Sections */}
        <View style={styles.menuBox}>
          <Text style={styles.sectionTitle}>TÀI KHOẢN & BẢO MẬT</Text>
          <View style={styles.glassCard}>
            {accountItems.map((item, index) => (
              <React.Fragment key={index}>
                <TouchableOpacity style={styles.menuItem} onPress={item.onPress}>
                  <View style={[styles.iconBox, { backgroundColor: item.color }]}>
                    {item.icon}
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
                  </View>
                  <ChevronRight size={18} color="#475569" />
                </TouchableOpacity>
                {index < accountItems.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))}
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 32 }]}>CÀI ĐẶT ỨNG DỤNG</Text>
          <View style={styles.glassCard}>
            {systemItems.map((item, index) => (
              <React.Fragment key={index}>
                <TouchableOpacity style={styles.menuItem} onPress={item.onPress}>
                  <View style={styles.iconBox}>
                    {item.icon}
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
                  </View>
                  <ChevronRight size={18} color="#475569" />
                </TouchableOpacity>
                {index < systemItems.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))}
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 32 }]}>HỖ TRỢ</Text>
          <View style={styles.glassCard}>
            {helpItems.map((item, index) => (
              <React.Fragment key={index}>
                <TouchableOpacity style={styles.menuItem} onPress={item.onPress}>
                  <View style={styles.iconBox}>
                    {item.icon}
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                  </View>
                  <ChevronRight size={18} color="#475569" />
                </TouchableOpacity>
                {index < helpItems.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))}
          </View>

          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <LogOut size={20} color="#EF4444" />
            <Text style={styles.logoutText}>ĐĂNG XUẤT HỆ THỐNG</Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.versionText}>Hệ thống Giám sát An ninh AI v2.1.0</Text>
            <Text style={styles.copyText}>© 2024 Phan Văn Lộc Security Solution</Text>
          </View>
        </View>
      </ScrollView>

      <Modal visible={csvVisible} transparent animationType="slide" onRequestClose={closeCsvPreview}>
        <View style={styles.csvOverlay}>
          <View style={styles.csvPanel} accessibilityViewIsModal>
            <Text style={styles.csvTitle}>Xem trước báo cáo cá nhân</Text>
            <View style={styles.csvActions}>
              {csvPeriods.map(period => <TouchableOpacity key={period.value}
                accessibilityRole="button" accessibilityState={{ selected: csvPeriod === period.value }}
                disabled={csvExporting} onPress={() => loadCsvPreview(period.value)}
                style={[styles.csvCancel, csvPeriod === period.value && { backgroundColor: '#2563EB' }]}>
                <Text style={styles.csvActionText}>{period.label}</Text>
              </TouchableOpacity>)}
            </View>
            <Text style={styles.csvCaption}>{csvPeriods.find(period => period.value === csvPeriod)?.label} • {csvRows.length} vi phạm đã xử lý</Text>
            <Text style={styles.csvCaption}>Chỉ gồm vi phạm đã hoàn tất xử lý bởi tài khoản này. Khoảng thời gian tính theo ngày phát hiện vi phạm.</Text>
            {csvLoading ? <ActivityIndicator style={{ margin: 30 }} color="#60A5FA" />
              : csvError ? <View style={{ paddingVertical: 20 }}>
                  <Text style={styles.csvCaption}>{csvError}</Text>
                  <TouchableOpacity onPress={handleExportCSV} accessibilityRole="button"><Text style={styles.csvActionText}>Thử lại</Text></TouchableOpacity>
                </View>
              : csvRows.length === 0 ? <Text style={[styles.csvCaption, { marginVertical: 24 }]}>Chưa có vi phạm đã xử lý trong khoảng thời gian này để xuất.</Text>
              : <>
                  <Text style={styles.csvCaption}>Vuốt ngang để xem đầy đủ các cột.</Text>
                  <ScrollView style={{ maxHeight: 340 }} nestedScrollEnabled>
                    <ScrollView horizontal nestedScrollEnabled>
                      <View>
                        <View style={[styles.csvRow, { backgroundColor: '#334155' }]}>
                          {csvColumns.map(column => <Text key={column.key} style={[styles.csvCell, { width: column.width, fontWeight: '700' }]}>{column.label}</Text>)}
                        </View>
                        {csvRows.map(row => <View key={row.id} style={styles.csvRow}>
                          {csvColumns.map(column => <Text key={column.key} style={[styles.csvCell, { width: column.width }]}>{String(row[column.key] ?? '—')}</Text>)}
                        </View>)}
                      </View>
                    </ScrollView>
                  </ScrollView>
                  <Text style={styles.csvCaption}>Dữ liệu được cập nhật lại tại thời điểm xác nhận xuất.</Text>
                </>}
            <View style={styles.csvActions}>
              <TouchableOpacity disabled={csvExporting} onPress={closeCsvPreview} accessibilityRole="button" style={styles.csvCancel}>
                <Text style={styles.csvActionText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmExportCSV} accessibilityRole="button"
                disabled={csvLoading || csvExporting || !!csvError || csvRows.length === 0}
                style={[styles.csvConfirm, (csvLoading || csvExporting || !!csvError || csvRows.length === 0) && { opacity: 0.45 }]}>
                {csvExporting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.csvActionText}>Xác nhận xuất</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={reportVisible}
        onRequestClose={() => setReportVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>BÁO CÁO CA TRỰC</Text>
              <TouchableOpacity onPress={() => setReportVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>×</Text>
              </TouchableOpacity>
            </View>

            {selectedHistoryReport ? (
              <View style={{ flex: 1 }}>
                <TouchableOpacity 
                  style={styles.backBtn}
                  onPress={() => setSelectedHistoryReport(null)}
                >
                  <Text style={styles.backBtnText}>← Quay lại danh sách</Text>
                </TouchableOpacity>
                <Text style={styles.detailReportTitle}>
                  {selectedHistoryReport.staff_name} • {selectedHistoryReport.created_at.split(' ')[0]}
                </Text>
                <Text style={styles.detailReportMeta}>
                  Thời gian: {selectedHistoryReport.shift_start.split(' ')[1].substring(0,5)} - {selectedHistoryReport.shift_end.split(' ')[1].substring(0,5)} • Sự kiện: {selectedHistoryReport.total_events}
                </Text>
                <ScrollView style={styles.reportScroll} showsVerticalScrollIndicator={true}>
                  <TextInput
                    multiline={true}
                    editable={false}
                    selectTextOnFocus={true}
                    style={styles.reportInput}
                    value={selectedHistoryReport.report_summary}
                  />
                </ScrollView>
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                <View style={styles.tabContainer}>
                  <TouchableOpacity 
                    style={[styles.tabBtn, activeModalTab === 'history' && styles.activeTabBtn]}
                    onPress={() => setActiveModalTab('history')}
                  >
                    <Text style={[styles.tabBtnText, activeModalTab === 'history' && styles.activeTabBtnText]}>Lịch sử</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.tabBtn, activeModalTab === 'create' && styles.activeTabBtn]}
                    onPress={() => setActiveModalTab('create')}
                  >
                    <Text style={[styles.tabBtnText, activeModalTab === 'create' && styles.activeTabBtnText]}>Tạo báo cáo mới</Text>
                  </TouchableOpacity>
                </View>

                {activeModalTab === 'history' ? (
                  loadingHistory ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="large" color="#3B82F6" />
                      <Text style={styles.loadingText}>Đang tải lịch sử báo cáo...</Text>
                    </View>
                  ) : historyReports.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>Chưa có báo cáo ca trực nào được lưu.</Text>
                    </View>
                  ) : (
                    <ScrollView style={styles.historyScroll} showsVerticalScrollIndicator={false}>
                      {historyReports.map((item, idx) => (
                        <TouchableOpacity 
                          key={idx} 
                          style={styles.historyCard}
                          onPress={() => setSelectedHistoryReport(item)}
                        >
                          <View style={styles.cardHeader}>
                            <Text style={styles.cardStaff}>{item.staff_name}</Text>
                            <Text style={styles.cardDate}>{item.created_at.split(' ')[0]}</Text>
                          </View>
                          <Text style={styles.cardMeta}>
                            Số sự kiện đã xử lý: <Text style={{ color: '#60A5FA', fontWeight: 'bold' }}>{item.total_events}</Text>
                          </Text>
                          <Text style={styles.cardSnippet} numberOfLines={2}>
                            {item.report_summary.replace(/[*#]/g, '').trim()}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )
                ) : (
                  <View style={{ flex: 1 }}>
                    {loadingReport ? (
                      <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#3B82F6" />
                        <Text style={styles.loadingText}>Đang tổng hợp báo cáo bằng AI...</Text>
                      </View>
                    ) : reportText ? (
                      <View style={{ flex: 1 }}>
                        <ScrollView style={styles.reportScroll} showsVerticalScrollIndicator={true}>
                          <TextInput
                            multiline={true}
                            editable={false}
                            selectTextOnFocus={true}
                            style={styles.reportInput}
                            value={reportText}
                          />
                        </ScrollView>
                        <View style={styles.actionRow}>
                          <TouchableOpacity 
                            style={[styles.modalActionBtn, { backgroundColor: 'rgba(59, 130, 246, 0.1)', borderColor: 'rgba(59, 130, 246, 0.3)', marginRight: 10 }]} 
                            onPress={generateNewReport}
                          >
                            <Text style={[styles.modalActionText, { color: '#60A5FA' }]}>Tạo lại</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={[styles.modalActionBtn, { backgroundColor: '#3B82F6', borderColor: '#2563EB', flex: 1 }]} 
                            onPress={saveNewReport}
                            disabled={isSaving}
                          >
                            {isSaving ? (
                              <ActivityIndicator size="small" color="#FFF" />
                            ) : (
                              <Text style={styles.modalActionText}>Lưu báo cáo</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.generatePromptContainer}>
                        <Text style={styles.promptText}>
                          Tổng hợp tất cả các sự kiện an ninh bạn đã xử lý từ 00:00 ngày hôm nay đến thời điểm hiện tại và tạo báo cáo chi tiết bằng mô hình AI.
                        </Text>
                        <TouchableOpacity style={styles.generateBtn} onPress={generateNewReport}>
                          <Text style={styles.generateBtnText}>Bắt đầu tổng hợp báo cáo</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}
            
            {!selectedHistoryReport && (
              <View style={styles.modalFooter}>
                <TouchableOpacity 
                  style={[styles.modalActionBtn, { backgroundColor: '#1E293B', borderColor: '#334155' }]} 
                  onPress={() => setReportVisible(false)}
                >
                  <Text style={styles.modalActionText}>Đóng</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  csvOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', padding: 16 },
  csvPanel: { backgroundColor: '#1E293B', borderRadius: 20, padding: 18, maxHeight: '90%' },
  csvTitle: { color: '#F8FAFC', fontSize: 19, fontWeight: '700' },
  csvCaption: { color: '#94A3B8', fontSize: 13, marginVertical: 8, lineHeight: 19 },
  csvRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#334155' },
  csvCell: { padding: 10, color: '#E2E8F0', fontSize: 12, lineHeight: 18 },
  csvActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  csvCancel: { padding: 14, borderRadius: 12, backgroundColor: '#334155', alignItems: 'center', flex: 1 },
  csvConfirm: { padding: 14, borderRadius: 12, backgroundColor: '#2563EB', alignItems: 'center', flex: 2 },
  csvActionText: { color: '#FFF', fontWeight: '600', textAlign: 'center' },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 30,
    position: 'relative',
  },
  headerGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 250,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 20,
  },
  avatarGradient: {
    width: 100,
    height: 100,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.5)',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  avatarText: {
    fontSize: 42,
    fontWeight: '900',
    color: '#FFF',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#10B981',
    borderWidth: 4,
    borderColor: '#0F172A',
  },
  userName: {
    fontSize: 26,
    fontWeight: '900',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
  },
  roleText: {
    color: '#60A5FA',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    marginHorizontal: 24,
    paddingVertical: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFF',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  menuBox: {
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 16,
    letterSpacing: 1.5,
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
    padding: 18,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(148, 163, 184, 0.05)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    marginHorizontal: 18,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 48,
    height: 64,
    borderRadius: 22,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.15)',
  },
  logoutText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1,
  },
  footer: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 20,
  },
  versionText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  copyText: {
    color: '#1E293B',
    fontSize: 10,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#0F172A',
    width: '100%',
    height: '80%',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#3B82F6',
    letterSpacing: 1.5,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#94A3B8',
    fontSize: 20,
    fontWeight: '300',
  },
  loadingContainer: {
    paddingVertical: 50,
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 15,
    fontSize: 14,
  },
  reportScroll: {
    marginVertical: 10,
  },
  reportInput: {
    color: '#F1F5F9',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    minHeight: 200,
    textAlignVertical: 'top',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 15,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  modalActionBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  modalActionText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  backBtn: {
    paddingVertical: 8,
    marginBottom: 10,
  },
  backBtnText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
  detailReportTitle: {
    color: '#F1F5F9',
    fontSize: 16,
    fontWeight: '800',
  },
  detailReportMeta: {
    color: '#64748B',
    fontSize: 12,
    marginBottom: 10,
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTabBtn: {
    borderBottomColor: '#3B82F6',
  },
  tabBtnText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '700',
  },
  activeTabBtnText: {
    color: '#3B82F6',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
  },
  historyScroll: {
    flex: 1,
  },
  historyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    padding: 15,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  cardStaff: {
    color: '#F1F5F9',
    fontSize: 14,
    fontWeight: '700',
  },
  cardDate: {
    color: '#64748B',
    fontSize: 12,
  },
  cardMeta: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 8,
  },
  cardSnippet: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: 15,
  },
  generatePromptContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  promptText: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 25,
  },
  generateBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 25,
    paddingVertical: 15,
    borderRadius: 16,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  generateBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
