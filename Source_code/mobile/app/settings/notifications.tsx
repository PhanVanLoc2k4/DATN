import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, ChevronLeft, ShieldAlert, Smartphone, Mail, Volume2, Moon, Clock, ChevronRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

export default function NotificationSettingsScreen() {
  const router = useRouter();
  
  const [settings, setSettings] = useState({
    aiAlerts: true,
    sound: true,
    vibration: true,
    emailNotifications: false,
    systemUpdates: true,
    doNotDisturb: false,
    marketing: false
  });

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

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
        <Text style={styles.headerTitle}>Cài đặt thông báo</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Main Push Toggle Card */}
        <View style={styles.mainToggleCard}>
          <LinearGradient
            colors={['rgba(59, 130, 246, 0.15)', 'rgba(30, 64, 175, 0.05)']}
            style={styles.mainGradient}
          >
            <View style={styles.mainIconBox}>
              <Bell size={28} color="#3B82F6" />
            </View>
            <View style={styles.mainInfo}>
              <Text style={styles.mainTitle}>Thông báo đẩy</Text>
              <Text style={styles.mainSubtitle}>Nhận cảnh báo ngay trên màn hình khóa</Text>
            </View>
            <Switch 
              value={settings.aiAlerts}
              onValueChange={() => toggleSetting('aiAlerts')}
              trackColor={{ false: '#334155', true: '#3B82F6' }}
              thumbColor="#FFF"
            />
          </LinearGradient>
        </View>

        {/* Section: AI Alerts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CẢNH BÁO AN NINH (AI)</Text>
          <View style={styles.glassCard}>
            <View style={styles.menuItem}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                <ShieldAlert size={20} color="#EF4444" />
              </View>
              <View style={styles.menuText}>
                <Text style={styles.itemTitle}>Phát hiện vi phạm</Text>
                <Text style={styles.itemSubtitle}>Thông báo khi AI phát hiện sự cố</Text>
              </View>
              <Switch 
                value={settings.aiAlerts}
                onValueChange={() => toggleSetting('aiAlerts')}
                trackColor={{ false: '#334155', true: '#EF4444' }}
                thumbColor="#FFF"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.menuItem}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                <Smartphone size={20} color="#3B82F6" />
              </View>
              <View style={styles.menuText}>
                <Text style={styles.itemTitle}>Báo cáo định kỳ</Text>
                <Text style={styles.itemSubtitle}>Tóm tắt sự cố vào cuối ngày</Text>
              </View>
              <Switch 
                value={settings.systemUpdates}
                onValueChange={() => toggleSetting('systemUpdates')}
                trackColor={{ false: '#334155', true: '#3B82F6' }}
                thumbColor="#FFF"
              />
            </View>
          </View>
        </View>

        {/* Section: Email & System */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>EMAIL & HỆ THỐNG</Text>
          <View style={styles.glassCard}>
            <View style={styles.menuItem}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                <Mail size={20} color="#10B981" />
              </View>
              <View style={styles.menuText}>
                <Text style={styles.itemTitle}>Thông báo Email</Text>
                <Text style={styles.itemSubtitle}>Gửi báo cáo sự cố qua hòm thư</Text>
              </View>
              <Switch 
                value={settings.emailNotifications}
                onValueChange={() => toggleSetting('emailNotifications')}
                trackColor={{ false: '#334155', true: '#10B981' }}
                thumbColor="#FFF"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.menuItem}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(148, 163, 184, 0.1)' }]}>
                <Bell size={20} color="#94A3B8" />
              </View>
              <View style={styles.menuText}>
                <Text style={styles.itemTitle}>Cập nhật hệ thống</Text>
                <Text style={styles.itemSubtitle}>Tính năng mới và bảo trì</Text>
              </View>
              <Switch 
                value={settings.systemUpdates}
                onValueChange={() => toggleSetting('systemUpdates')}
                trackColor={{ false: '#334155', true: '#94A3B8' }}
                thumbColor="#FFF"
              />
            </View>
          </View>
        </View>

        {/* Section: Sound & Behavior */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ÂM THANH & TRẠNG THÁI</Text>
          <View style={styles.glassCard}>
            <View style={styles.menuItem}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(139, 92, 246, 0.1)' }]}>
                <Volume2 size={20} color="#8B5CF6" />
              </View>
              <View style={styles.menuText}>
                <Text style={styles.itemTitle}>Âm thanh thông báo</Text>
                <Text style={styles.itemSubtitle}>Phát tiếng chuông khi có cảnh báo</Text>
              </View>
              <Switch 
                value={settings.sound}
                onValueChange={() => toggleSetting('sound')}
                trackColor={{ false: '#334155', true: '#8B5CF6' }}
                thumbColor="#FFF"
              />
            </View>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
                <Clock size={20} color="#F59E0B" />
              </View>
              <View style={styles.menuText}>
                <Text style={styles.itemTitle}>Kiểu chuông cảnh báo</Text>
                <Text style={styles.itemSubtitle}>Mặc định (Emergency Alert)</Text>
              </View>
              <ChevronRight size={18} color="#475569" />
            </TouchableOpacity>

            <View style={styles.divider} />

            <View style={styles.menuItem}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(15, 23, 42, 0.5)' }]}>
                <Moon size={20} color="#60A5FA" />
              </View>
              <View style={styles.menuText}>
                <Text style={styles.itemTitle}>Chế độ im lặng</Text>
                <Text style={styles.itemSubtitle}>Tắt thông báo theo khung giờ</Text>
              </View>
              <Switch 
                value={settings.doNotDisturb}
                onValueChange={() => toggleSetting('doNotDisturb')}
                trackColor={{ false: '#334155', true: '#60A5FA' }}
                thumbColor="#FFF"
              />
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />

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
  mainToggleCard: {
    margin: 24,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
  },
  mainGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  mainIconBox: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainInfo: {
    flex: 1,
  },
  mainTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#3B82F6',
    marginBottom: 4,
  },
  mainSubtitle: {
    fontSize: 12,
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
});
