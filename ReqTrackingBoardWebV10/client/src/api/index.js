import axios from 'axios';
import { isDataMutation, notifyDataChanged, updateKnownVersion } from '../utils/dataSyncNotify';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => {
    const method = res.config?.method;
    const url = res.config?.url || '';
    if (isDataMutation(method, url)) {
      notifyDataChanged();
      api.get('/sync/version')
        .then(r => updateKnownVersion(r.data.version))
        .catch(() => {});
    }
    return res;
  },
  (err) => {
    if (err.response?.status === 401 && !err.config.url.includes('/auth/login')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
