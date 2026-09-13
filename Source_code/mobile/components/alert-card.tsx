import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Pressable, Animated } from 'react-native';
import { Image } from 'expo-image';
import { ShieldAlert, ShieldCheck, Clock, MapPin, ChevronRight, Zap } from 'lucide-react-native';
import { SecurityCard } from './security-ui';
import { apiService } from '@/services/api';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Violation } from '@/constants/types';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

interface AlertCardProps {
  violation: Violation;
}

export function AlertCard({ violation }: AlertCardProps) {
  const router = useRouter();
  
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  const isUnprocessed = violation.status === 'Chưa xử lý';
  const isFight = violation.violation_type.toLowerCase().includes('đánh nhau') || 
                  violation.violation_type.toLowerCase().includes('fight');

  useEffect(() => {
    if (isUnprocessed) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 1200,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [isUnprocessed]);

  const iconColor = isFight ? '#EF4444' : '#F59E0B';
  const statusColor = isUnprocessed ? '#EF4444' : '#10B981';

  return (
    <Pressable 
      onPress={() => router.push(`/violation/${violation.id}`)}
      style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1, marginBottom: 16 }]}
    >
      <SecurityCard 
        variant="default"
        style={[
          styles.card, 
          isUnprocessed && isFight && styles.criticalCard,
          { borderColor: isUnprocessed ? statusColor + '30' : 'rgba(255,255,255,0.04)' }
        ]}
      >
        <View style={styles.header}>
          <View style={styles.typeRow}>
            <View style={[styles.iconBox, { backgroundColor: iconColor + '10' }]}>
              <ShieldAlert size={18} color={iconColor} />
            </View>
            <Text 
              style={styles.typeText} 
              numberOfLines={1} 
            >
              {violation.violation_type}
            </Text>
          </View>
          
          <View style={[styles.statusTag, { backgroundColor: 'transparent' }]}>
            {isUnprocessed && (
              <Animated.View style={[styles.pulseDot, { backgroundColor: statusColor, opacity: pulseAnim }]} />
            )}
            <Text style={[styles.statusText, { color: statusColor }]}>
              {violation.status.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.imageWrapper}>
            <Image 
              source={{ uri: violation.image_url }} 
              style={styles.image}
              contentFit="cover"
              transition={300}
            />
            {isUnprocessed && (
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.5)']}
                style={StyleSheet.absoluteFill}
              />
            )}
          </View>

          <View style={styles.info}>
            <View style={styles.infoContent}>
              <View style={styles.infoRow}>
                <MapPin size={12} color="#475569" />
                <Text style={styles.infoText} numberOfLines={1}>{violation.camera_name}</Text>
              </View>
              <View style={[styles.infoRow, { marginTop: 4 }]}>
                <Clock size={12} color="#475569" />
                <Text style={styles.infoText}>{violation.detected_at}</Text>
              </View>
            </View>
            
            <View style={styles.footer}>
              <Text style={styles.actionLink}>Chi tiết</Text>
              <ChevronRight size={14} color="#60A5FA" />
            </View>
          </View>
        </View>
      </SecurityCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginBottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 24,
    borderWidth: 1,
  },
  criticalCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.02)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  typeText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.3,
  },
  statusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  body: {
    flexDirection: 'row',
    gap: 16,
  },
  imageWrapper: {
    width: 110,
    height: 80,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  info: {
    flex: 1,
    justifyContent: 'space-between',
  },
  infoContent: {
    flex: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  infoText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    flexShrink: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    gap: 2,
    marginTop: 4,
  },
  actionLink: {
    fontSize: 11,
    fontWeight: '800',
    color: '#60A5FA',
    textTransform: 'uppercase',
  },
});

