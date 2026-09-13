import React, { useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { 
  StyleSheet, 
  View, 
  Text, 
  KeyboardAvoidingView, 
  Platform, 
  TouchableWithoutFeedback, 
  Keyboard, 
  Alert,
  Animated,
  AccessibilityInfo,
  TouchableOpacity
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ShieldAlert, User, Lock, CircleAlert, CircleCheck } from 'lucide-react-native';
import { useAuth } from '@/context/auth-context';
import { SecurityButton, SecurityInput } from '@/components/security-ui';
import { useThemeColor } from '@/hooks/use-theme-color';
import { StatusBar } from 'expo-status-bar';
import { apiService } from '@/services/api';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const [shake] = useState(() => new Animated.Value(0));
  const [reveal] = useState(() => new Animated.Value(0));
  const busy = useRef(false);
  const mounted = useRef(true);
  const reduceMotion = useRef(false);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { signIn } = useAuth();

  useEffect(() => {
    mounted.current = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { reduceMotion.current = value; }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { reduceMotion.current = value; });
    return () => {
      mounted.current = false;
      subscription.remove();
      if (successTimer.current) clearTimeout(successTimer.current);
      shake.stopAnimation();
      reveal.stopAnimation();
    };
  }, [reveal, shake]);

  const showFeedback = (kind: 'error' | 'success', message: string) => {
    shake.stopAnimation();
    reveal.stopAnimation();
    shake.setValue(0);
    reveal.setValue(reduceMotion.current ? 1 : 0);
    setFeedback({ kind, message });
    AccessibilityInfo.announceForAccessibility(message);
    if (reduceMotion.current) return;
    Animated.timing(reveal, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    if (kind === 'error') {
      Animated.sequence([ -8, 8, -6, 6, 0 ].map(toValue =>
        Animated.timing(shake, { toValue, duration: 65, useNativeDriver: true })
      )).start();
    }
  };
  
  const tintColor = useThemeColor({}, 'tint');

  const handleLogin = async () => {
    if (busy.current) return;
    Keyboard.dismiss();
    if (!username.trim() || !password) {
      showFeedback('error', 'Vui lòng nhập tài khoản và mật khẩu.');
      return;
    }

    busy.current = true;
    setLoading(true);
    setFeedback(null);
    try {
      const result = await apiService.login(username.trim(), password);
      if (!mounted.current) return;
      if (result.success && result.user) {
        showFeedback('success', 'Đăng nhập thành công! Đang vào hệ thống…');
        successTimer.current = setTimeout(() => {
          if (mounted.current) signIn(result.user);
        }, 1000);
      } else {
        showFeedback('error', result.message || 'Sai tài khoản hoặc mật khẩu. Vui lòng thử lại.');
      }
    } catch (error) {
      if (!mounted.current) return;
      const status = isAxiosError(error) ? error.response?.status : undefined;
      showFeedback('error', status === 401
        ? 'Sai tài khoản hoặc mật khẩu. Vui lòng thử lại.'
        : status === 403
          ? 'Tài khoản không được phép truy cập.'
        : status === 429
          ? 'Bạn đã thử quá nhiều lần. Vui lòng đợi rồi đăng nhập lại.'
          : 'Không thể kết nối đến máy chủ. Vui lòng thử lại.');
    } finally {
      if (mounted.current && !successTimer.current) {
        busy.current = false;
        setLoading(false);
      }
    }
  };

  const handleForgotPass = () => {
    Alert.alert(
      'Khôi phục mật khẩu',
      'Vì lý do bảo mật hệ thống an ninh SpectraGuard, việc đặt lại mật khẩu cần được xác nhận bởi Ban quản trị.\n\nVui lòng liên hệ trực tiếp phòng Kỹ thuật hoặc Ban chỉ huy qua hotline: 0987.654.321 hoặc gửi yêu cầu trên Web Dashboard.',
      [{ text: 'Đã hiểu', style: 'cancel' }]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['#0F172A', '#1E293B', '#0F172A']}
        style={StyleSheet.absoluteFill}
      />
      
      <View style={[styles.circle, { top: -100, left: -100, backgroundColor: tintColor + '30' }]} />
      <View style={[styles.circle, { bottom: -100, right: -100, backgroundColor: '#EF444420' }]} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.inner}>
            <View style={styles.header}>
              <View style={[styles.logoOuter, { borderColor: tintColor + '40' }]}>
                <View style={[styles.logoInner, { backgroundColor: tintColor }]}>
                  <ShieldAlert size={42} color="#FFF" strokeWidth={2.5} />
                </View>
              </View>
              <Text style={styles.title}>SECURITY APP</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>HỆ THỐNG GIÁM SÁT AI</Text>
              </View>
            </View>

            <Animated.View style={[styles.glassContainer, { transform: [{ translateX: shake }] },
              feedback && { borderColor: feedback.kind === 'error' ? '#F87171' : '#34D399' }
            ]}>
              <Text style={styles.loginLabel}>ĐĂNG NHẬP HỆ THỐNG</Text>
              <View pointerEvents={loading ? 'none' : 'auto'}>
              <SecurityInput
                value={username}
                onChangeText={value => { if (!busy.current) { setUsername(value); setFeedback(null); } }}
                placeholder="Tên đăng nhập"
                icon={<User size={20} color={tintColor} />}
                style={styles.input}
              />
              
              <SecurityInput
                value={password}
                onChangeText={value => { if (!busy.current) { setPassword(value); setFeedback(null); } }}
                placeholder="Mật khẩu"
                secureTextEntry
                icon={<Lock size={20} color={tintColor} />}
                style={styles.input}
              />
              </View>

              {feedback && (
                <Animated.View accessibilityLiveRegion="polite" style={[
                  styles.feedback,
                  { backgroundColor: feedback.kind === 'error' ? '#451A23' : '#064E3B',
                    opacity: reveal,
                    transform: [{ scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] }
                ]}>
                  {feedback.kind === 'error'
                    ? <CircleAlert size={26} color="#FCA5A5" />
                    : <CircleCheck size={30} color="#6EE7B7" />}
                  <Text style={[styles.feedbackText, { color: feedback.kind === 'error' ? '#FECACA' : '#A7F3D0' }]}>
                    {feedback.message}
                  </Text>
                </Animated.View>
              )}

              <SecurityButton
                title="TRUY CẬP NGAY"
                onPress={handleLogin}
                loading={loading}
                style={styles.loginBtn}
              />

              <TouchableOpacity disabled={loading} style={styles.forgotPass} onPress={handleForgotPass}>
                <Text style={styles.forgotText}>Quên mật khẩu truy cập?</Text>
              </TouchableOpacity>
            </Animated.View>

            <View style={styles.footer}>
              <Text style={styles.copyright}>© 2024 SECURITY SOLUTIONS PRO</Text>
              <Text style={styles.version}>V 2.0.1 ALPHA</Text>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  feedback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
  },
  feedbackText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  inner: {
    flex: 1,
    padding: 30,
    justifyContent: 'center',
  },
  circle: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoOuter: {
    width: 100,
    height: 100,
    borderRadius: 35,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoInner: {
    width: 80,
    height: 80,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: 3,
  },
  badge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
    marginTop: 10,
  },
  badgeText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  glassContainer: {
    padding: 24,
    borderRadius: 30,
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  loginLabel: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  loginBtn: {
    marginTop: 10,
    height: 60,
  },
  forgotPass: {
    marginTop: 20,
    alignItems: 'center',
  },
  forgotText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '500',
  },
  footer: {
    marginTop: 40,
    alignItems: 'center',
  },
  copyright: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
  },
  version: {
    color: '#334155',
    fontSize: 10,
    marginTop: 4,
  },
});
