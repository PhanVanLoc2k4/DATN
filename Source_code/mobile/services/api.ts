import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const getApiBaseUrl = () => {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/+$/, '');

  if (Platform.OS === 'web') {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    return `http://${hostname}:5000`;
  }
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const hostname = new URL(`http://${hostUri}`).hostname;
    return `http://${hostname}:5000`;
  }
  throw new Error('Set EXPO_PUBLIC_API_URL to the backend URL when running without Expo Go.');
};

const API_BASE_URL = getApiBaseUrl();

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  withCredentials: true,
});

export const apiService = {
  login: async (username: string, password: string) => {
    const response = await api.post('/api/login', { username, password });
    return response.data;
  },

  getHistory: async (days?: number) => {
    const response = await api.get('/api/history', { 
      params: days ? { days } : {} 
    });
    return response.data;
  },

  getUserActivities: async () => {
    const response = await api.get('/api/user/activities');
    return response.data;
  },


  getStats: async () => {
    const response = await api.get('/api/stats');
    return response.data;
  },

  getAnalyticsSummary: async (me: boolean = false) => {
    const response = await api.get('/api/analytics/summary', {
      params: me ? { me: 'true' } : {}
    });
    return response.data;
  },

  updateStatus: async (id: number, status: string) => {
    const response = await api.post('/api/history/update_status', { 
      id, 
      status, 
      alert_method: 'Mobile App' 
    });
    return response.data;
  },

  getProfile: async () => {
    const response = await api.get('/api/profile');
    return response.data;
  },

  updateProfile: async (data: any) => {
    const response = await api.put('/api/profile', data);
    return response.data;
  },

  uploadAvatar: async (uri: string) => {
    const formData = new FormData();
    const filename = uri.split('/').pop() || 'avatar.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : `image`;
    
    // @ts-ignore
    formData.append('file', { uri, name: filename, type });
    
    const response = await api.post('/api/user/upload_avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  chatWithAI: async (message: string, reset: boolean = false) => {
    const response = await api.post('/api/chatbot/chat', { message, reset });
    return response.data;
  },

  getAIReport: async (shift?: string) => {
    const response = await api.get('/api/chatbot/report', {
      params: shift ? { shift } : {}
    });
    return response.data;
  },

  exportPersonalReport: async (period: string = 'day', preview: boolean = false) => {
    const response = await api.get('/api/export_csv', {
      params: { period, me: 'true', preview: String(preview) }
    });
    return response.data;
  },

  getPersonalShiftReport: async () => {
    const response = await api.get('/api/chatbot/report', {
      params: { me: 'true' }
    });
    return response.data;
  },

  getShiftReports: async (me: boolean = false) => {
    const response = await api.get('/api/shift_reports', {
      params: me ? { me: 'true' } : {}
    });
    return response.data;
  },

  saveShiftReport: async (data: { shift_start: string; shift_end: string; total_events: number; report_summary: string }) => {
    const response = await api.post('/api/shift_reports', data);
    return response.data;
  },


  // Helper để lấy URL ảnh đầy đủ
  getImageUrl: (path: string) => {
    if (path.startsWith('http')) return path;
    return `${API_BASE_URL}${path}`;
  }
};

export default api;
