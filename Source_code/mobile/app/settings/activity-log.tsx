import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Dimensions, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Lock, FileText, User, Bell, ShieldCheck, Search, Filter, Smartphone, AlertCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { apiService } from '@/services/api';

const { width } = Dimensions.get('window');

interface ActivityItem {
  id: number;
  type: 'security' | 'action' | 'system' | 'profile';
  title: string;
  description: string;
  time: string;
  date: string;
  icon: React.ReactNode;
  color: string;
}

export default function ActivityLogScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState('All');
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivities();
  }, []);

  const fetchActivities = async () => {
    try {
      const data = await apiService.getUserActivities();
      const mappedData = data.map((item: any) => ({
        ...item,
        icon: <FileText size={16} color="#10B981" />,
        color: 'rgba(16, 185, 129, 0.1)'
      }));
      setActivities(mappedData);
    } catch (error) {
      console.error('Fetch Activities Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredActivities = activeFilter === 'All' 
    ? activities 
    : activities.filter(a => a.type === activeFilter.toLowerCase());

  // Lấy danh sách ngày (unique)
  const groups = Array.from(new Set(filteredActivities.map(a => a.date)));

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
        <Text style={styles.headerTitle}>Nhật ký hoạt động</Text>
        <TouchableOpacity style={styles.searchBtn}>
          <Search size={22} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterContent}>
          {['All', 'Security', 'Action', 'System', 'Profile'].map((filter) => (
            <TouchableOpacity 
              key={filter} 
              onPress={() => setActiveFilter(filter)}
              style={[styles.filterChip, activeFilter === filter && styles.activeFilter]}
            >
              <Text style={[styles.filterText, activeFilter === filter && styles.activeFilterText]}>
                {filter === 'All' ? 'Tất cả' : filter}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Timeline Content */}
        {loading ? (
          <View style={{ marginTop: 50, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        ) : filteredActivities.length === 0 ? (
          <View style={{ marginTop: 50, alignItems: 'center' }}>
            <Text style={{ color: '#94A3B8', fontSize: 16 }}>Chưa có hoạt động nào</Text>
          </View>
        ) : groups.map((groupDate) => {
          const groupItems = filteredActivities.filter(a => a.date === groupDate);
          if (groupItems.length === 0) return null;

          return (
            <View key={groupDate} style={styles.groupSection}>
              <View style={styles.dateHeader}>
                <Text style={styles.dateText}>{groupDate}</Text>
              </View>

              <View style={styles.itemsWrapper}>
                {groupItems.map((item, index) => (
                  <View key={item.id} style={styles.timelineItem}>
                    {/* Time & Vertical Line */}
                    <View style={styles.leftColumn}>
                      <Text style={styles.timeText}>{item.time}</Text>
                      <View style={[
                        styles.verticalLine,
                        index === groupItems.length - 1 && styles.lastLine
                      ]} />
                    </View>

                    {/* Dot */}
                    <View style={styles.dotContainer}>
                      <View style={[styles.dot, { backgroundColor: item.color.replace('0.1', '1') }]} />
                    </View>

                    {/* Content Card */}
                    <View style={styles.cardContainer}>
                      <View style={styles.activityCard}>
                        <View style={[styles.iconBox, { backgroundColor: item.color }]}>
                          {item.icon}
                        </View>
                        <View style={styles.itemInfo}>
                          <Text style={styles.itemTitle}>{item.title}</Text>
                          <Text style={styles.itemDescription} numberOfLines={2}>
                            {item.description}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        <View style={styles.bottomSpacer} />

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
  searchBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  filterBar: {
    marginTop: 10,
    marginBottom: 20,
  },
  filterContent: {
    paddingHorizontal: 24,
    gap: 10,
  },
  filterChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  activeFilter: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  activeFilterText: {
    color: '#3B82F6',
  },
  groupSection: {
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  dateHeader: {
    marginBottom: 20,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  itemsWrapper: {
    paddingLeft: 4,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  leftColumn: {
    width: 50,
    alignItems: 'center',
    paddingTop: 4,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
  },
  verticalLine: {
    width: 2,
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginTop: 4,
  },
  lastLine: {
    backgroundColor: 'transparent',
  },
  dotContainer: {
    width: 20,
    alignItems: 'center',
    paddingTop: 8,
    zIndex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cardContainer: {
    flex: 1,
    marginLeft: 12,
  },
  activityCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 2,
  },
  itemDescription: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    lineHeight: 16,
  },
  bottomSpacer: {
    height: 60,
  },
});
