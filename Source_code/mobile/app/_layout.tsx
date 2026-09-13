import React, { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const [isReady, setIsReady] = React.useState(false);

  // Mark root as ready after first mount
  useEffect(() => {
    setIsReady(true);
  }, []);

  // Logic điều hướng tập trung: Xử lý cả việc chặn và cho phép vào hệ thống
  useEffect(() => {
    if (!isReady) return;

    if (!user && (segments[0] === '(tabs)' || segments[0] === 'violation')) {
      // Trường hợp 1: Chưa đăng nhập mà cố vào trang trong -> Đẩy ra Login
      router.replace('/login');
    } else if (user && (segments[0] === 'login' || segments[0] === undefined)) {
      // Trường hợp 2: Đã đăng nhập thành công -> Đẩy vào Dashboard
      router.replace('/(tabs)');
    }
  }, [user, segments, isReady]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        {/* Để login lên đầu để Expo Router ưu tiên route này */}
        <Stack.Screen name="login" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="violation/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen 
          name="modal" 
          options={{ presentation: 'modal', title: 'Thông báo', headerShown: true }} 
        />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
