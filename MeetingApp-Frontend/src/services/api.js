import * as SecureStore from 'expo-secure-store';

const DEFAULT_BASE_URL = 'http://localhost:8080';
const REQUEST_TIMEOUT_MS = 12000;
const UPLOAD_TIMEOUT_MS = 120000;
const TRANSCRIBE_TIMEOUT_MS = 12 * 60 * 1000;

let accessToken = null;
let refreshToken = null;
const memoryStorage = {};

function getWebStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

async function canUseSecureStore() {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

const storage = {
  getSync(key) {
    try {
      return getWebStorage()?.getItem(key) || memoryStorage[key] || null;
    } catch {
      return memoryStorage[key] || null;
    }
  },
  async get(key) {
    const webValue = this.getSync(key);
    if (webValue) return webValue;
    if (await canUseSecureStore()) {
      try {
        const secureValue = await SecureStore.getItemAsync(key);
        if (secureValue) memoryStorage[key] = secureValue;
        return secureValue;
      } catch {
        return null;
      }
    }
    return memoryStorage[key] || null;
  },
  set(key, value) {
    memoryStorage[key] = value;
    try {
      getWebStorage()?.setItem(key, value);
    } catch {}
    canUseSecureStore().then((available) => {
      if (available) SecureStore.setItemAsync(key, value).catch(() => {});
    });
  },
  remove(key) {
    delete memoryStorage[key];
    try {
      getWebStorage()?.removeItem(key);
    } catch {}
    canUseSecureStore().then((available) => {
      if (available) SecureStore.deleteItemAsync(key).catch(() => {});
    });
  },
};

export const persistentStorage = storage;

const configuredBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || storage.getSync('API_BASE_URL');
export const API_BASE_URL =
  configuredBaseUrl === 'same-origin' ? '' : configuredBaseUrl || DEFAULT_BASE_URL;

export function setTokens(tokens = {}) {
  if (Object.prototype.hasOwnProperty.call(tokens, 'accessToken')) {
    accessToken = tokens.accessToken || null;
  }
  if (Object.prototype.hasOwnProperty.call(tokens, 'refreshToken')) {
    refreshToken = tokens.refreshToken || null;
  }
  if (accessToken) storage.set('accessToken', accessToken);
  if (refreshToken) storage.set('refreshToken', refreshToken);
}

export async function restoreTokens() {
  accessToken = accessToken || await storage.get('accessToken');
  refreshToken = refreshToken || await storage.get('refreshToken');
  return { accessToken, refreshToken };
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  storage.remove('accessToken');
  storage.remove('refreshToken');
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(path, options = {}, retry = true) {
  await restoreTokens();
  const { timeoutMs, ...fetchOptions } = options;
  const isFormData = options.body instanceof FormData;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs || REQUEST_TIMEOUT_MS);
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(options.headers || {}),
  };

  let response;
  try {
    console.info('[api] request', options.method || 'GET', `${API_BASE_URL}${path}`);
    response = await fetch(`${API_BASE_URL}${path}`, { ...fetchOptions, headers, signal: controller.signal });
  } catch (error) {
    console.error('[api] network error', options.method || 'GET', `${API_BASE_URL}${path}`, error);
    if (error?.name === 'AbortError') {
      throw new Error(`백엔드 응답이 없습니다. IntelliJ에서 서버가 켜져 있는지 확인해주세요. (${API_BASE_URL})`);
    }
    throw new Error(`백엔드에 연결할 수 없습니다. IntelliJ 서버와 API 주소를 확인해주세요. (${API_BASE_URL})`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 401 && retry && refreshToken) {
    const refreshed = await refreshAuthToken();
    if (refreshed) return request(path, options, false);
  }

  const data = await parseResponse(response);
  if (!response.ok) {
    const message = data?.message || data || `HTTP ${response.status}`;
    console.error('[api] request failed', options.method || 'GET', `${API_BASE_URL}${path}`, response.status, data);
    throw new Error(String(message));
  }
  return data;
}

function getAssetName(asset) {
  return asset?.name || asset?.file?.name || 'recording.m4a';
}

function inferAudioContentType(filename, fallback) {
  if (fallback) return fallback;
  const ext = String(filename || '').split('.').pop()?.toLowerCase();
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'm4a') return 'audio/mp4';
  if (ext === 'aac') return 'audio/aac';
  if (ext === 'ogg') return 'audio/ogg';
  if (ext === 'webm') return 'audio/webm';
  return 'audio/mp4';
}

async function appendRecordingFile(formData, asset) {
  const filename = getAssetName(asset);
  const contentType = inferAudioContentType(filename, asset?.mimeType || asset?.file?.type);

  if (asset?.file) {
    formData.append('file', asset.file, filename);
    return;
  }

  if (!asset?.uri) {
    throw new Error('업로드할 녹음 파일을 찾을 수 없습니다.');
  }

  if (typeof File !== 'undefined') {
    const response = await fetch(asset.uri);
    const blob = await response.blob();
    formData.append('file', new File([blob], filename, { type: contentType }));
    return;
  }

  formData.append('file', {
    uri: asset.uri,
    name: filename,
    type: contentType,
  });
}

async function refreshAuthToken() {
  try {
    const data = await request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }, false);
    setTokens(data);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

export const api = {
  login(email, password) {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }).then((data) => {
      setTokens(data);
      return data;
    });
  },

  googleLogin(code) {
    return request('/api/oauth2/google/callback', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }).then((data) => {
      setTokens(data);
      return data;
    });
  },

  register(email, password, displayName) {
    return request('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    });
  },

  logout(userId) {
    clearTokens();
    if (!userId) return Promise.resolve();
    return request('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }, false).catch(() => {});
  },

  getProfile() {
    return request('/api/user/profile');
  },

  createWorkspace(name) {
    return request('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  getWorkspaces() {
    return request('/api/workspaces');
  },

  deleteWorkspace(workspaceId) {
    return request(`/api/workspaces/${workspaceId}`, { method: 'DELETE' });
  },

  getInvitations() {
    return request('/api/invitations');
  },

  acceptInvitation(invitationId) {
    return request(`/api/invitations/${invitationId}/accept`, { method: 'POST' });
  },

  declineInvitation(invitationId) {
    return request(`/api/invitations/${invitationId}/decline`, { method: 'POST' });
  },

  getWorkspaceMembers(workspaceId) {
    return request(`/api/workspaces/${workspaceId}/members`);
  },

  inviteMember(workspaceId, email) {
    return request(`/api/workspaces/${workspaceId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  leaveWorkspace(workspaceId) {
    return request(`/api/workspaces/${workspaceId}/members/me`, { method: 'DELETE' });
  },

  searchUsers(query) {
    return request(`/api/user/search?q=${encodeURIComponent(query)}`);
  },

  getMeetings(workspaceId) {
    const query = workspaceId ? `?workspaceId=${workspaceId}` : '';
    return request(`/api/meetings${query}`);
  },

  createMeeting({ workspaceId, title }) {
    return request('/api/meetings', {
      method: 'POST',
      body: JSON.stringify({ workspaceId, title }),
    });
  },

  deleteMeeting(meetingId) {
    return request(`/api/meetings/${meetingId}`, { method: 'DELETE' });
  },

  getMeeting(meetingId) {
    return request(`/api/meetings/${meetingId}`);
  },

  getMeetingSummary(meetingId) {
    return request(`/api/meetings/${meetingId}/summary`);
  },

  getRecordings(meetingId) {
    return request(`/api/recordings?meetingId=${meetingId}`);
  },

  async uploadRecording(meetingId, asset) {
    const formData = new FormData();
    await appendRecordingFile(formData, asset);

    return request(`/api/recordings/upload?meetingId=${encodeURIComponent(meetingId)}`, {
      method: 'POST',
      body: formData,
      timeoutMs: UPLOAD_TIMEOUT_MS,
    });
  },

  updateRecordingStatus(recordingId, status) {
    return request(`/api/recordings/${recordingId}/status?status=${encodeURIComponent(status)}`, {
      method: 'PATCH',
    });
  },

  transcribe(meetingId, recordingId) {
    return request(`/api/meetings/${meetingId}/recordings/${recordingId}/transcribe`, {
      method: 'POST',
      timeoutMs: TRANSCRIBE_TIMEOUT_MS,
    });
  },

  getTranscript(meetingId) {
    return request(`/api/meetings/${meetingId}/transcript`);
  },

  getSpeakerMappings(transcriptId) {
    return request(`/api/meetings/transcripts/${transcriptId}/speaker-mappings`);
  },

  saveSpeakerMappings(transcriptId, mappings) {
    return request(`/api/meetings/transcripts/${transcriptId}/speaker-mappings`, {
      method: 'PUT',
      body: JSON.stringify({ mappings }),
    });
  },

  analyzeTranscript(transcriptId) {
    return request(`/api/meetings/transcripts/${transcriptId}/gemini-analyze`, {
      method: 'POST',
    });
  },

  getTasks(params = {}) {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
    return request(`/api/tasks${query ? `?${query}` : ''}`);
  },

  createTask(task) {
    return request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    });
  },

  updateTask(taskId, updates) {
    return request(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  deleteTask(taskId) {
    return request(`/api/tasks/${taskId}`, { method: 'DELETE' });
  },

  getTaskStats(params = {}) {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
    return request(`/api/tasks/stats${query ? `?${query}` : ''}`);
  },

  getEvents(params = {}) {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
    return request(`/api/events${query ? `?${query}` : ''}`);
  },

  createEvent(event) {
    return request('/api/events', {
      method: 'POST',
      body: JSON.stringify(event),
    });
  },

  updateEvent(eventId, updates) {
    return request(`/api/events/${eventId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  deleteEvent(eventId) {
    return request(`/api/events/${eventId}`, { method: 'DELETE' });
  },

  updateProfileName(name) {
    return request('/api/user/profile/name', {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  },

  updateProfileImage(profileImageUrl) {
    return request('/api/user/profile/image', {
      method: 'PATCH',
      body: JSON.stringify({ profileImageUrl }),
    });
  },

  updatePassword(payload) {
    return request('/api/user/password', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  deleteAccount() {
    return request('/api/user/account', { method: 'DELETE' });
  },

  getNotionLinkAuthUrl() {
    return request('/api/oauth2/notion/link/auth-url');
  },

  getNotionStatus() {
    return request('/api/oauth2/notion/status');
  },

  linkNotionAccount(code) {
    return request('/api/oauth2/notion/link', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  createNotionCalendarTarget(payload = {}) {
    return request('/api/oauth2/notion/calendar-targets', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getNotionCalendarTargets() {
    return request('/api/oauth2/notion/calendar-targets');
  },

  setNotionCalendarDatabase(payload) {
    return request('/api/oauth2/notion/calendar-database', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  syncWorkspaceToNotion(workspaceId) {
    return request(`/api/calendar/workspaces/${workspaceId}/notion-sync`, {
      method: 'POST',
    });
  },
};
