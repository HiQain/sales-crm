import axios from 'axios';
import { getSelectedCompanyId } from '../utils/company';

const rawApiBaseURL = import.meta.env.VITE_API_URL || '/api';
const apiBaseURL = rawApiBaseURL.endsWith('/api')
  ? rawApiBaseURL
  : `${rawApiBaseURL.replace(/\/$/, '')}/api`;

const apiClient = axios.create({
  baseURL: apiBaseURL,
});

apiClient.interceptors.request.use((config) => {
  const jwt = localStorage.getItem('jwt');
  if (jwt) {
    config.headers.Authorization = `Bearer ${jwt}`;
  }
  config.headers['X-Company-Id'] = String(getSelectedCompanyId());
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem('jwt');
      localStorage.removeItem('user');

      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;
