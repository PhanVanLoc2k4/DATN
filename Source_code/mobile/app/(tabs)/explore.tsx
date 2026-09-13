import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, FlatList, TextInput, StatusBar, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, History as HistoryIcon, Calendar, Filter, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColor } from '@/hooks/use-theme-color';
import { AlertCard } from '@/components/alert-card';
import { Violation } from '@/constants/types';
import { apiService } from '@/services/api';
import { useAuth } from '@/context/auth-context';

const { width } = Dimensions.get('window');

export default function HistoryScreen() {
  const { user } = useAuth();
  const [violations, setViolations] = useState<Violation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'All' | 'Chưa xử lý' | 'Processed'>('All');
  const [showTimeMenu, setShowTimeMenu] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number | undefined>(undefined);
  const [timeLabel, setTimeLabel] = useState('Tất cả');

  useEffect(() => {
    if (user) {
      fetchHistory();
    }
  }, [user, selectedDays]);

  const fetchHistory = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await apiService.getHistory(selectedDays);
      const formatted = data.map((v: any) => ({
        ...v,
        image_url: apiService.getImageUrl(v.image_url)
      }));
      setViolations(formatted);
    } catch (error) {
      console.error('History Fetch Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTimeSelect = (days: number | undefined, label: string) => {
    setSelectedDays(days);
    setTimeLabel(label);
    setShowTimeMenu(false);
  };

  const filteredViolations = violations.filter(v => {
    // Lọc theo từ khóa tìm kiếm
    const matchesSearch = v.violation_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         v.camera_name.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Lọc theo trạng thái
    let matchesStatus = true;
    if (filterStatus === 'Chưa xử lý') matchesStatus = v.status === 'Chưa xử lý';
    else if (filterStatus === 'Processed') matchesStatus = v.status !== 'Chưa xử lý';

    return matchesSearch && matchesStatus;
  });

  const clearSearch = () => setSearchQuery('');

  const timeOptions = [
    { label: 'Hôm nay', days: 1 },
    { label: '7 ngày qua', days: 7 },
    { label: 'Tháng này', days: 30 },
    { label: 'Tất cả', days: undefined },
  ];

  return (
    <View style={[styles.container, { backgroundColor: '#0F172A' }]}>
      <StatusBar barStyle="light-content" />
      
      {/* Header Section */}
      <View style={styles.header}>
        <LinearGradient
          colors={['rgba(245, 158, 11, 0.08)', 'transparent']}
          style={styles.headerGlow}
        />
        <SafeAreaView>
          <View style={styles.headerContent}>
            <View>
              <Text style={styles.subtitle}>NHẬT KÝ HỆ THỐNG • {timeLabel.toUpperCase()}</Text>
              <Text style={styles.title}>Lịch sử vi phạm</Text>
            </View>
            <TouchableOpacity 
              style={[styles.filterBtn, selectedDays !== undefined && styles.activeFilterBtn]}
              onPress={() => setShowTimeMenu(true)}
            >
              <Filter size={20} color={selectedDays !== undefined ? "#3B82F6" : "#F8FAFC"} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>

      {/* Time Selection Modal */}
      {showTimeMenu && (
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalBackdrop} 
            activeOpacity={1} 
            onPress={() => setShowTimeMenu(false)} 
          />
          <View style={styles.menuContainer}>
            <Text style={styles.menuTitle}>Lọc theo thời gian</Text>
            {timeOptions.map((opt, i) => (
              <TouchableOpacity 
                key={i} 
                style={[styles.menuOption, selectedDays === opt.days && styles.activeOption]}
                onPress={() => handleTimeSelect(opt.days, opt.label)}
              >
                <Text style={[styles.menuOptionText, selectedDays === opt.days && styles.activeOptionText]}>
                  {opt.label}
                </Text>
                {selectedDays === opt.days && <View style={styles.checkDot} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Global Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.glassSearchBar}>
          <Search size={18} color="#64748B" />
          <TextInput
            placeholder="Tìm kiếm sự cố, vị trí camera..."
            placeholderTextColor="#475569"
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={clearSearch}>
              <X size={18} color="#64748B" />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Chips Layer */}
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
            <Text style={[styles.filterText, filterStatus === 'Chưa xử lý' && styles.activeFilterText]}>Chưa xử lý</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setFilterStatus('Processed')}
            style={[styles.filterChip, filterStatus === 'Processed' && styles.successFilter]}
          >
            <Text style={[styles.filterText, filterStatus === 'Processed' && styles.activeFilterText]}>Đã xử lý</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={filteredViolations}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <AlertCard violation={item} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <HistoryIcon size={56} color="#1E293B" />
            <Text style={styles.emptyText}>Không tìm thấy kết quả</Text>
            <Text style={styles.emptySubText}>
              Hãy thử thay đổi từ khóa hoặc bộ lọc trạng thái.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingBottom: 10,
    backgroundColor: '#0F172A',
    position: 'relative',
  },
  headerGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  headerContent: {
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F59E0B',
    letterSpacing: 2,
    marginBottom: 4,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  activeFilterBtn: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  menuContainer: {
    width: width * 0.8,
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 20,
    textAlign: 'center',
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  activeOption: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.2)',
    borderWidth: 1,
  },
  menuOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#94A3B8',
  },
  activeOptionText: {
    color: '#3B82F6',
    fontWeight: '800',
  },
  checkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
  },
  searchContainer: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  glassSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 54,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 15,
    fontWeight: '600',
    color: '#F1F5F9',
  },
  filterBar: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
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
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 120,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 80,
    paddingHorizontal: 40,
  },
  emptyText: {
    color: '#334155',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 20,
    textAlign: 'center',
  },
  emptySubText: {
    color: '#1E293B',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
});
