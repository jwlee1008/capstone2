const DEFAULT_BASE_URL = 'http://localhost:8080';

let accessToken = null;
let refreshToken = null;

const storage = {
  get(key) {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch {}
  },
  remove(key) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch {}
  },
};

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || storage.get('API_BASE_URL') || DEFAULT_BASE_URL;

export function setTokens(tokens = {}) {
  accessToken = tokens.accessToken || null;
  refreshToken = tokens.refreshToken || null;
  if (accessToken) storage.set('accessToken', accessToken);
  if (refreshToken) storage.set('refreshToken', refreshToken);
}

export function restoreTokens() {
  accessToken = accessToken || storage.get('accessToken');
  refreshToken = refreshToken || storage.get('refreshToken');
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
  restoreTokens();
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (response.status === 401 && retry && refreshToken) {
    const refreshed = await refreshAuthToken();
    if (refreshed) return request(path, options, false);
  }

  const data = await parseResponse(response);
  if (!response.ok) {
    const message = data?.message || data || `HTTP ${response.status}`;
    throw new Error(String(message));
  }
  return data;
}

async function uploadToPresignedUrl(url, asset, contentType) {
  let body = asset;

  if (asset?.file) {
    body = asset.file;
  } else if (asset?.uri) {
    const response = await fetch(asset.uri);
    body = await response.blob();
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body,
  });

  if (!response.ok) throw new Error(`S3 upload failed: HTTP ${response.status}`);
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
    return request('/api/oauth2/google', {
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

  logout() {
    const token = refreshToken;
    clearTokens();
    if (!token) return Promise.resolve();
    return request('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: token }),
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
    const name = asset?.name || 'recording.m4a';
    const contentType = asset?.mimeType || asset?.file?.type || 'audio/mp4';
    const presigned = await request('/api/recordings/presigned-upload-url', {
      method: 'POST',
      body: JSON.stringify({ meetingId, fileName: name, contentType }),
    });
    await uploadToPresignedUrl(presigned.presignedUrl, asset, contentType);
    await this.updateRecordingStatus(presigned.recordingId, 'UPLOADED');
    return presigned;
  },

  updateRecordingStatus(recordingId, status) {
    return request(`/api/recordings/${recordingId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  transcribe(meetingId, recordingId) {
    return request(`/api/meetings/${meetingId}/recordings/${recordingId}/transcribe`, {
      method: 'POST',
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
      body: JSON.stringify(mappings),
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

  syncWorkspaceToNotion(workspaceId) {
    return request(`/api/calendar/workspaces/${workspaceId}/notion-sync`, {
      method: 'POST',
    });
  },
};
