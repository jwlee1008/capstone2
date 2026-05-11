import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, restoreTokens, setAuthExpiredHandler } from '../services/api';

const AppContext = createContext(null);
const LOCAL_USER_KEY = 'frontendLocalUser';
const LOCAL_WORKSPACES_KEY = 'frontendLocalWorkspaces';

function getWorkspaceId(raw) {
  return raw?.id || raw?.workspaceId || raw?.workspace?.id;
}

function getWorkspaceName(raw, fallback = '') {
  return raw?.name || raw?.workspaceName || raw?.workspace?.name || raw?.title || raw?.slug || fallback || '이름 없는 워크스페이스';
}

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.content)) return data.content;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function mapWorkspace(raw, members = [], fallbackName = '') {
  if (!raw) return null;
  const id = getWorkspaceId(raw);
  return {
    id,
    name: getWorkspaceName(raw, fallbackName),
    slug: raw.slug || raw.workspace?.slug,
    ownerId: raw.ownerId || raw.owner?.id,
    ownerName: raw.ownerName || raw.owner?.name,
    createdAt: raw.createdAt || raw.workspace?.createdAt,
    members,
    invitedEmails: [],
  };
}

function mapInvitation(raw) {
  return {
    id: raw.id || raw.invitationId,
    workspaceId: raw.workspaceId,
    workspaceName: raw.workspaceName || raw.workspace?.name || '워크스페이스',
    inviterName: raw.inviterName || raw.invitedByName || raw.ownerName || '초대한 사람',
    receivedAt: raw.createdAt || raw.invitedAt || new Date().toISOString(),
    status: raw.status || 'PENDING',
  };
}

function mapMember(raw) {
  return {
    id: raw.userId || raw.id,
    userId: raw.userId || raw.id,
    name: raw.name || raw.email || '사용자',
    email: raw.email || '',
    profileImg: raw.profileImg,
    role: String(raw.role || 'MEMBER').toLowerCase(),
  };
}

function mapParticipants(raw) {
  const participants = raw?.participants || raw?.participantNames || raw?.participantEmails || raw?.attendees || raw?.members;
  return normalizeList(participants)
    .map((item) => (typeof item === 'string' ? item : item.name || item.email || item.userName))
    .filter(Boolean);
}

function mapMeeting(raw, members = []) {
  return {
    id: raw.id,
    workspaceId: raw.workspaceId,
    name: raw.title || raw.name || '회의',
    description: raw.description || '',
    createdAt: raw.createdAt || new Date().toISOString(),
    createdBy: raw.createdBy,
    participants: mapParticipants(raw),
    sessions: raw.sessions || [],
    taskCount: raw.taskCount || raw.savedTaskCount || 0,
    eventCount: raw.eventCount || raw.savedEventCount || 0,
  };
}

function secondsToTime(seconds = 0) {
  const safe = Number(seconds) || 0;
  const min = Math.floor(safe / 60);
  const sec = Math.floor(safe % 60);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function getTranscriptId(transcript) {
  return transcript?.id || transcript?.transcriptId;
}

function getSpeakerKey(label = 'SPEAKER_A') {
  return String(label).replace('SPEAKER_', '');
}

function splitSummary(summary) {
  if (!summary) return [];
  return summary
    .split(/\n|[.!?。]\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mapTranscriptSegment(segment, index) {
  const label = segment.speakerLabel || segment.speakerKey || 'SPEAKER_A';
  const speakerKey = getSpeakerKey(label);
  return {
    id: `${label}-${segment.sequence ?? index}`,
    speakerKey,
    speakerLabel: label,
    speakerName: segment.speakerName,
    userId: segment.userId,
    time: secondsToTime(segment.startSec),
    text: segment.content || segment.text || '',
  };
}

function mapTask(raw) {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    assigneeId: raw.assigneeId,
    assignee: raw.assigneeName || '담당자 미정',
    assigneeName: raw.assigneeName,
    dueDate: raw.dueDate ? String(raw.dueDate).slice(0, 10) : '',
    statusCode: raw.status || 'TODO',
    status: raw.status === 'DONE' ? '완료' : raw.status === 'IN_PROGRESS' ? '진행중' : '등록됨',
    source: raw.source === 'AI_GENERATED' ? '회의 기록' : '직접 등록',
    meetingId: raw.meetingId,
    workspaceId: raw.workspaceId,
  };
}

function normalizeDueDateForApi(dueDate) {
  const value = normalizeText(dueDate);
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return `${value}:00`;
  return value;
}

function getTaskStatsFallback(tasks = []) {
  return {
    total: tasks.length,
    todo: tasks.filter((task) => task.status === 'TODO').length,
    inProgress: tasks.filter((task) => task.status === 'IN_PROGRESS').length,
    done: tasks.filter((task) => task.status === 'DONE').length,
  };
}

function normalizeTaskStats(stats, tasks = []) {
  const fallback = getTaskStatsFallback(tasks);
  if (!stats) return fallback;
  return {
    total: stats.total ?? stats.totalCount ?? fallback.total,
    todo: stats.todo ?? stats.TODO ?? stats.todoCount ?? fallback.todo,
    inProgress: stats.inProgress ?? stats.in_progress ?? stats.IN_PROGRESS ?? stats.inProgressCount ?? fallback.inProgress,
    done: stats.done ?? stats.DONE ?? stats.doneCount ?? fallback.done,
  };
}

function mapEvent(raw) {
  return {
    id: raw.id,
    title: raw.title,
    startAt: raw.startAt,
    endAt: raw.endAt,
    date: raw.startAt ? String(raw.startAt).slice(0, 10) : '',
    workspaceId: raw.workspaceId,
    meetingId: raw.meetingId,
    relatedTasks: (raw.relatedTasks || []).map(mapTask),
  };
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isEmailLike(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getNameFromEmail(email) {
  const localPart = normalizeText(email).split('@')[0];
  return localPart || '사용자';
}

function readLocalJson(key, fallback) {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalJson(key, value) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function removeLocalValue(key) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  } catch {}
}

function isBackendUnavailable(error) {
  return Boolean(error?.isBackendUnavailable || error?.isNetworkError);
}

function getDisplayNameCache() {
  return readLocalJson('displayNameByEmail', {});
}

function getCachedDisplayName(email) {
  const normalizedEmail = normalizeText(email).toLowerCase();
  if (!normalizedEmail) return '';
  return normalizeText(getDisplayNameCache()[normalizedEmail]);
}

function cacheDisplayName(email, name) {
  const normalizedEmail = normalizeText(email).toLowerCase();
  const displayName = normalizeText(name);
  if (!normalizedEmail || !displayName || displayName === '사용자' || isEmailLike(displayName)) return;
  try {
    const cache = getDisplayNameCache();
    writeLocalJson('displayNameByEmail', { ...cache, [normalizedEmail]: displayName });
  } catch {}
}

function getDisplayName(raw = {}, fallback = {}) {
  const candidates = [
    raw?.name,
    raw?.displayName,
    raw?.userName,
    raw?.username,
    raw?.nickname,
    raw?.fullName,
    raw?.profile?.name,
    raw?.user?.name,
    fallback.name,
    fallback.displayName,
    fallback.userName,
    fallback.username,
    fallback.nickname,
    fallback.fullName,
    fallback.profile?.name,
    fallback.user?.name,
    fallback.cachedName,
  ];

  return candidates
    .map(normalizeText)
    .find((name) => name && !isEmailLike(name)) || '사용자';
}

function mapUser(raw, fallback = {}) {
  const email = raw?.email || raw?.profile?.email || raw?.user?.email || fallback.email || '';
  const cachedName = fallback.cachedName || getCachedDisplayName(email);
  const name = getDisplayName(raw, { ...fallback, cachedName });
  return {
    id: raw?.id || raw?.userId || fallback.id || fallback.userId || (email ? `local-${email}` : 'local-user'),
    userId: raw?.id || raw?.userId || fallback.id || fallback.userId || (email ? `local-${email}` : 'local-user'),
    email,
    name: name === '사용자' && email ? getNameFromEmail(email) : name,
    profileImg: raw?.profileImg || raw?.profileImageUrl || fallback.profileImg || fallback.profileImageUrl,
    role: raw?.role || fallback.role || '서비스 운영',
    status: raw?.status || fallback.status,
  };
}

function getLocalUser() {
  const user = readLocalJson(LOCAL_USER_KEY, null);
  return user ? mapUser(user) : null;
}

function saveLocalUser(user) {
  if (!user) return;
  writeLocalJson(LOCAL_USER_KEY, user);
  cacheDisplayName(user.email, user.name);
}

function getLocalWorkspaces() {
  return readLocalJson(LOCAL_WORKSPACES_KEY, []);
}

function saveLocalWorkspaces(workspaces) {
  writeLocalJson(LOCAL_WORKSPACES_KEY, workspaces);
}

function buildSessionFromBackend({ transcript, summary, tasks = [], events = [], recordings = [], speakerMappings = [] }) {
  if (!transcript && !summary && tasks.length === 0 && events.length === 0 && recordings.length === 0) return null;
  const recording = recordings[0];
  const segments = (transcript?.segments || []).map(mapTranscriptSegment);
  const speakerMap = {};
  normalizeList(speakerMappings).forEach((mapping) => {
    const label = mapping.speakerLabel || mapping.speakerKey;
    const name = mapping.userName || mapping.speakerName || mapping.name;
    if (label && name) speakerMap[getSpeakerKey(label)] = name;
  });
  segments.forEach((segment) => {
    if (segment.speakerName && !speakerMap[segment.speakerKey]) speakerMap[segment.speakerKey] = segment.speakerName;
  });

  return {
    id: getTranscriptId(transcript) || recording?.recordingId || `s${Date.now()}`,
    transcriptId: getTranscriptId(transcript),
    recordingId: transcript?.recordingId || recording?.recordingId,
    startedAt: transcript?.createdAt || recording?.createdAt || new Date().toISOString(),
    duration: recording?.durationSec ? `${Math.round(recording.durationSec / 60)}분` : null,
    fileName: recording?.fileName || recording?.s3Key?.split('/').pop() || 'recording.m4a',
    status: transcript ? 'completed' : 'processing',
    processStatus: transcript ? 'done' : 'processing',
    speakerMap,
    summary: summary?.summary || transcript?.summary || '',
    summaryBullets: splitSummary(summary?.summary || transcript?.summary),
    keywords: summary?.keywords || transcript?.keywords || [],
    transcript: segments,
    tasks: tasks.map(mapTask),
    events: events.map(mapEvent),
    taskCount: summary?.taskCount ?? tasks.length,
    eventCount: summary?.eventCount ?? events.length,
  };
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [calendarTasks, setCalendarTasks] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [taskStats, setTaskStats] = useState({ total: 0, todo: 0, inProgress: 0, done: 0 });
  const [calendarExported, setCalendarExported] = useState(false);
  const [isApiMode, setIsApiMode] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  const resetAppState = () => {
    setUser(null);
    setWorkspace(null);
    setWorkspaces([]);
    setInvitations([]);
    setMeetings([]);
    setCalendarTasks([]);
    setCalendarEvents([]);
    setTaskStats({ total: 0, todo: 0, inProgress: 0, done: 0 });
    setCalendarExported(false);
    setIsApiMode(false);
  };

  const loadLocalWorkspaceBundle = (fallbackUser = user) => {
    const localWorkspaces = getLocalWorkspaces().map((item) => mapWorkspace(item, item.members || [], item.name)).filter((item) => item?.id);
    setWorkspaces(localWorkspaces);
    setWorkspace((prev) => localWorkspaces.find((item) => String(item.id) === String(prev?.id)) || localWorkspaces[0] || null);
    setMeetings([]);
    setCalendarTasks([]);
    setCalendarEvents([]);
    setTaskStats({ total: 0, todo: 0, inProgress: 0, done: 0 });
    if (fallbackUser) saveLocalUser(fallbackUser);
    return localWorkspaces;
  };

  const createLocalWorkspace = (name, fallbackUser = user) => {
    const members = fallbackUser ? [mapMember({ ...fallbackUser, role: 'owner' })] : [];
    const localWorkspace = {
      id: `local-workspace-${Date.now()}`,
      name,
      ownerId: fallbackUser?.id,
      ownerName: fallbackUser?.name,
      createdAt: new Date().toISOString(),
      members,
      invitedEmails: [],
      localOnly: true,
    };
    const nextWorkspaces = [localWorkspace, ...getLocalWorkspaces().filter((item) => item.name !== name)];
    saveLocalWorkspaces(nextWorkspaces);
    setWorkspace(localWorkspace);
    setWorkspaces(nextWorkspaces);
    setMeetings([]);
    setCalendarTasks([]);
    setCalendarEvents([]);
    setTaskStats({ total: 0, todo: 0, inProgress: 0, done: 0 });
    return localWorkspace;
  };

  useEffect(() => {
    setAuthExpiredHandler(resetAppState);
    return () => setAuthExpiredHandler(null);
  }, []);

  const getMeetingById = (id) => meetings.find((meeting) => String(meeting.id) === String(id));

  const loadInvitations = async () => {
    const rows = normalizeList(await api.getInvitations().catch(() => []));
    const mapped = rows.filter((item) => (item.status || 'PENDING') === 'PENDING').map(mapInvitation);
    setInvitations(mapped);
    return mapped;
  };

  const loadWorkspaceBundle = async (targetWorkspace = null, fallbackUser = user) => {
    const backendWorkspaces = normalizeList(await api.getWorkspaces().catch(() => []));
    const explicitTarget = typeof targetWorkspace === 'object' ? targetWorkspace : null;
    const targetId = explicitTarget ? getWorkspaceId(explicitTarget) : targetWorkspace;
    const workspaceRows = explicitTarget && !backendWorkspaces.some((item) => String(getWorkspaceId(item)) === String(targetId))
      ? [explicitTarget, ...backendWorkspaces]
      : backendWorkspaces;
    const mappedList = workspaceRows.map((item) => mapWorkspace(item)).filter((item) => item?.id);
    const selected = targetId
      ? workspaceRows.find((item) => String(getWorkspaceId(item)) === String(targetId)) || explicitTarget
      : workspaceRows?.[0] || null;
    setWorkspaces(mappedList);
    await loadInvitations().catch(() => []);

    const selectedId = getWorkspaceId(selected);
    if (!selected || !selectedId) {
      setWorkspace(null);
      setMeetings([]);
      setCalendarTasks([]);
      setCalendarEvents([]);
      setTaskStats({ total: 0, todo: 0, inProgress: 0, done: 0 });
      return;
    }

    let members = [];
    try {
      members = normalizeList(await api.getWorkspaceMembers(selectedId)).map(mapMember);
    } catch (error) {
      console.error('[workspace] failed to load members', selectedId, error);
      const mappedSelected = mapWorkspace(selected);
      if (fallbackUser && (!mappedSelected.ownerId || String(mappedSelected.ownerId) === String(fallbackUser.id))) {
        members = [mapMember({ ...fallbackUser, role: 'owner' })];
      }
    }
    const mappedWorkspace = mapWorkspace(selected, members);
    const [backendMeetings, tasks, events, stats] = await Promise.all([
      api.getMeetings(selectedId).then(normalizeList).catch(() => []),
      api.getTasks({ workspaceId: selectedId }).then(normalizeList).catch(() => []),
      api.getEvents({ workspaceId: selectedId }).then(normalizeList).catch(() => []),
      api.getTaskStats({ workspaceId: selectedId }).catch(() => null),
    ]);

    setWorkspace(mappedWorkspace);
    setMeetings(backendMeetings.map((meeting) => mapMeeting(meeting, members)));
    setCalendarTasks(tasks.map(mapTask));
    setCalendarEvents(events.map(mapEvent));
    setTaskStats(normalizeTaskStats(stats, tasks));
    return mappedWorkspace;
  };

  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      const tokens = restoreTokens();
      if (!tokens.accessToken && !tokens.refreshToken) {
        if (isMounted) setIsRestoringSession(false);
        return;
      }

      try {
        setIsApiMode(true);
        const profile = await api.getProfile();
        if (!isMounted) return;
        const restoredUser = mapUser(profile);
        saveLocalUser(restoredUser);
        setUser(restoredUser);
        await loadWorkspaceBundle(null, restoredUser).catch(() => {
          setWorkspace(null);
          setWorkspaces([]);
          setInvitations([]);
          setMeetings([]);
          setCalendarTasks([]);
          setCalendarEvents([]);
          setTaskStats({ total: 0, todo: 0, inProgress: 0, done: 0 });
        });
      } catch (error) {
        if (isMounted) resetAppState();
      } finally {
        if (isMounted) setIsRestoringSession(false);
      }
    };

    restoreSession();
    return () => {
      isMounted = false;
    };
  }, []);

  const login = async ({ email, password, name }) => {
    try {
      const data = await api.login(email, password);
      setIsApiMode(true);
      const profile = await api.getProfile().catch(() => null);
      const loggedInUser = mapUser(profile, { ...data, email, name: data?.name || name });
      saveLocalUser(loggedInUser);
      setUser(loggedInUser);
      await loadWorkspaceBundle(null, loggedInUser).catch(() => {
        setWorkspace(null);
        setWorkspaces([]);
        setInvitations([]);
        setMeetings([]);
        setCalendarTasks([]);
        setCalendarEvents([]);
        setTaskStats({ total: 0, todo: 0, inProgress: 0, done: 0 });
      });
    } catch (error) {
      resetAppState();
      throw error;
    }
  };

  const register = async ({ email, password, name }) => {
    try {
      await api.register(email, password, name);
      cacheDisplayName(email, name);
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    if (isApiMode) await api.logout(user?.id).catch(() => {});
    removeLocalValue(LOCAL_USER_KEY);
    resetAppState();
  };

  const updateUser = async (updates) => {
    if (isApiMode && updates.name) await api.updateProfileName(updates.name);
    if (updates.name) cacheDisplayName(user?.email, updates.name);
    setUser((prev) => {
      const nextUser = { ...prev, ...updates };
      saveLocalUser(nextUser);
      return nextUser;
    });
  };

  const updateProfileImageFromAsset = async (asset) => {
    const filename = asset?.name || asset?.file?.name || `profile-${Date.now()}.jpg`;
    const { presignedUrl } = await api.getProfileImageUploadUrl(filename);
    if (!presignedUrl) throw new Error('프로필 이미지 업로드 URL을 받지 못했습니다.');
    await api.uploadToPresignedUrl(presignedUrl, asset, filename);
    const profileImageUrl = presignedUrl.split('?')[0];
    await api.updateProfileImage(profileImageUrl);
    setUser((prev) => ({ ...prev, profileImg: profileImageUrl }));
    return profileImageUrl;
  };

  const changePassword = async ({ currentPassword, newPassword }) => {
    await api.updatePassword({ currentPassword, newPassword });
  };

  const deleteAccount = async () => {
    await api.deleteAccount();
    resetAppState();
  };

  const selectWorkspace = async (workspaceId) => {
    const selected = workspaces.find((item) => String(item.id) === String(workspaceId));
    if (!selected) throw new Error('워크스페이스를 찾을 수 없습니다.');
    setWorkspace((prev) => (prev?.id === selected.id ? prev : mapWorkspace(selected, selected.members || [])));
    await loadWorkspaceBundle(selected.id).catch(() => null);
  };

  const createWorkspace = async (name) => {
    const created = await api.createWorkspace(name);
    const ownerMember = user ? [mapMember({ ...user, role: 'owner' })] : [];
    const mapped = mapWorkspace(created, ownerMember, name);
    if (!mapped?.id) throw new Error('워크스페이스 생성 응답에 ID가 없습니다. 백엔드 응답을 확인해주세요.');
    setWorkspace(mapped);
    setWorkspaces((prev) => [mapped, ...prev.filter((item) => String(item.id) !== String(mapped.id))]);
    setMeetings([]);
    setCalendarTasks([]);
    setCalendarEvents([]);
    setTaskStats({ total: 0, todo: 0, inProgress: 0, done: 0 });
    await loadWorkspaceBundle(created).catch(() => null);
    return created;
  };

  const deleteWorkspace = async (workspaceId) => {
    await api.deleteWorkspace(workspaceId);
    setWorkspaces((prev) => prev.filter((item) => String(item.id) !== String(workspaceId)));
    if (String(workspace?.id) === String(workspaceId)) {
      setWorkspace(null);
      setMeetings([]);
      setCalendarTasks([]);
      setCalendarEvents([]);
      setTaskStats({ total: 0, todo: 0, inProgress: 0, done: 0 });
      await loadWorkspaceBundle().catch(() => null);
    }
  };

  const acceptInvitation = async (invitationId) => {
    const accepted = invitations.find((item) => String(item.id) === String(invitationId));
    await api.acceptInvitation(invitationId);
    await loadWorkspaceBundle(accepted?.workspaceId).catch(() => null);
    setInvitations((prev) => prev.filter((item) => String(item.id) !== String(invitationId)));
  };

  const declineInvitation = async (invitationId) => {
    await api.declineInvitation(invitationId);
    setInvitations((prev) => prev.filter((item) => String(item.id) !== String(invitationId)));
  };

  const inviteMember = async (email) => {
    if (!email.trim()) return;
    if (!workspace?.id) throw new Error('워크스페이스를 먼저 선택해주세요.');
    const normalizedEmail = email.trim().toLowerCase();
    const applyLocalInvite = () => {
      setWorkspace((prev) => ({
        ...prev,
        invitedEmails: Array.from(new Set([...(prev?.invitedEmails || []), normalizedEmail])),
      }));
      setWorkspaces((prev) => prev.map((item) => (
        String(item.id) === String(workspace.id)
          ? { ...item, invitedEmails: Array.from(new Set([...(item.invitedEmails || []), normalizedEmail])) }
          : item
      )));
    };
    await api.inviteMember(workspace.id, normalizedEmail);
    applyLocalInvite();
  };

  const searchUsers = async (query) => {
    if (!query.trim()) return [];
    return normalizeList(await api.searchUsers(query.trim())).map(mapUser);
  };

  const addMeeting = async (meetingData) => {
    if (!workspace?.id) throw new Error('워크스페이스를 먼저 선택해주세요.');
    const created = await api.createMeeting({
      workspaceId: workspace.id,
      title: meetingData.name,
      description: meetingData.description,
    });
    const mapped = mapMeeting(created, workspace.members || []);
    setMeetings((prev) => [mapped, ...prev]);
    return mapped;
  };

  const deleteMeeting = async (meetingId) => {
    await api.deleteMeeting(meetingId);
    setMeetings((prev) => prev.filter((meeting) => String(meeting.id) !== String(meetingId)));
  };

  const deleteRecording = async (meetingId, recordingId) => {
    await api.deleteRecording(recordingId);
    setMeetings((prev) => prev.map((meeting) => {
      if (String(meeting.id) !== String(meetingId)) return meeting;
      const sessions = (meeting.sessions || []).filter((session) => String(session.recordingId) !== String(recordingId));
      return { ...meeting, sessions };
    }));
  };

  const refreshMeetingData = async (meetingId) => {
    const [meetingDetail, summary, transcript, tasks, events, recordings] = await Promise.all([
      api.getMeeting(meetingId).catch(() => null),
      api.getMeetingSummary(meetingId).catch(() => null),
      api.getTranscript(meetingId).catch(() => null),
      api.getTasks({ meetingId }).catch(() => []),
      api.getEvents({ workspaceId: workspace?.id }).catch(() => []),
      api.getRecordings(meetingId).catch(() => []),
    ]);
    const transcriptId = getTranscriptId(transcript);
    const speakerMappings = transcriptId
      ? await api.getSpeakerMappings(transcriptId).catch(() => [])
      : [];
    const meetingEvents = events.filter((event) => String(event.meetingId) === String(meetingId));
    const session = buildSessionFromBackend({ transcript, summary, tasks, events: meetingEvents, recordings, speakerMappings });
    setMeetings((prev) => prev.map((meeting) => (
      String(meeting.id) === String(meetingId)
        ? {
          ...meeting,
          ...mapMeeting(meetingDetail || meeting, workspace?.members || []),
          sessions: session ? [session] : meeting.sessions,
          taskCount: summary?.taskCount ?? tasks.length,
          eventCount: summary?.eventCount ?? meetingEvents.length,
        }
        : meeting
    )));
    setCalendarTasks((prev) => {
      const others = prev.filter((task) => String(task.meetingId) !== String(meetingId));
      return [...tasks.map(mapTask), ...others];
    });
    setCalendarEvents(events.map(mapEvent));
    return session;
  };

  const uploadRecordingAndTranscribe = async (meetingId, asset) => {
    const recording = await api.uploadRecording(meetingId, asset);
    const recordingId = recording.recordingId || recording.id;
    const transcribe = await api.transcribe(meetingId, recordingId);
    await refreshMeetingData(meetingId);
    return transcribe;
  };

  const updateSpeakerName = async (meetingId, sessionId, speakerKey, speaker) => {
    const meeting = getMeetingById(meetingId);
    const session = meeting?.sessions?.find((item) => String(item.id) === String(sessionId)) || meeting?.sessions?.[0];
    const selectedSpeaker = typeof speaker === 'string' ? { name: speaker } : speaker || {};
    const selectedName = selectedSpeaker.name || selectedSpeaker.userName || selectedSpeaker.email || `화자${speakerKey}`;
    const selectedUserId = selectedSpeaker.userId || selectedSpeaker.id || null;
    const nextMap = { ...(session?.speakerMap || {}), [speakerKey]: selectedName };

    if (session?.transcriptId) {
      const mappings = Object.entries(nextMap).map(([key, userName]) => {
        const segment = session.transcript.find((item) => item.speakerKey === key);
        const member = String(key) === String(speakerKey) && selectedUserId
          ? { userId: selectedUserId }
          : workspace?.members?.find((item) => item.name === userName);
        return {
          speakerLabel: segment?.speakerLabel || `SPEAKER_${key}`,
          userName,
          userId: member?.userId || null,
        };
      });
      await api.saveSpeakerMappings(session.transcriptId, mappings);
      await api.analyzeTranscript(session.transcriptId);
      await refreshMeetingData(meetingId);
      return;
    }

    throw new Error('저장할 대화록이 없습니다.');
  };

  const addCalendarTask = async (task) => {
    const created = await api.createTask({
      title: task.title,
      description: task.description,
      assigneeId: task.assigneeId || null,
      assigneeName: task.assignee || task.assigneeName,
      dueDate: normalizeDueDateForApi(task.dueDate),
      workspaceId: task.workspaceId || workspace?.id || null,
      meetingId: task.meetingId || null,
    });
    const mapped = mapTask(created);
    setCalendarTasks((prev) => [mapped, ...prev]);
    if (mapped.meetingId) {
      setMeetings((prev) => prev.map((meeting) => {
        if (String(meeting.id) !== String(mapped.meetingId)) return meeting;
        const sessions = meeting.sessions?.length
          ? meeting.sessions.map((session, index) => (
            index === 0
              ? { ...session, tasks: [mapped, ...(session.tasks || [])], taskCount: (session.taskCount || session.tasks?.length || 0) + 1 }
              : session
          ))
          : meeting.sessions;
        return { ...meeting, sessions, taskCount: (meeting.taskCount || 0) + 1 };
      }));
    }
    return created;
  };

  const updateCalendarTask = async (taskId, updates) => {
    const normalizedUpdates = updates.statusCode && !updates.status ? { ...updates, status: updates.statusCode } : updates;
    const apiUpdates = {
      ...normalizedUpdates,
      dueDate: normalizeDueDateForApi(normalizedUpdates.dueDate),
    };
    delete apiUpdates.statusCode;
    const updated = await api.updateTask(taskId, apiUpdates);
    const currentTask = calendarTasks.find((task) => String(task.id) === String(taskId));
    const backendTask = updated && typeof updated === 'object' ? updated : {};
    const nextTask = currentTask ? mapTask({
      id: currentTask.id,
      title: currentTask.title,
      description: currentTask.description,
      assigneeId: currentTask.assigneeId,
      assigneeName: currentTask.assigneeName || currentTask.assignee,
      dueDate: currentTask.dueDate,
      status: currentTask.statusCode,
      meetingId: currentTask.meetingId,
      workspaceId: currentTask.workspaceId,
      ...normalizedUpdates,
      ...backendTask,
    }) : updated;
    setCalendarTasks((prev) => prev.map((task) => {
      if (String(task.id) !== String(taskId)) return task;
      return nextTask || task;
    }));
    if (nextTask?.id) {
      setMeetings((prev) => prev.map((meeting) => ({
        ...meeting,
        sessions: (meeting.sessions || []).map((session) => ({
          ...session,
          tasks: (session.tasks || []).map((task) => (String(task.id) === String(taskId) ? nextTask : task)),
        })),
      })));
    }
    return nextTask || updated;
  };

  const deleteCalendarTask = async (taskId) => {
    await api.deleteTask(taskId);
    setCalendarTasks((prev) => prev.filter((task) => String(task.id) !== String(taskId)));
    setMeetings((prev) => prev.map((meeting) => ({
      ...meeting,
      sessions: (meeting.sessions || []).map((session) => ({
        ...session,
        tasks: (session.tasks || []).filter((task) => String(task.id) !== String(taskId)),
      })),
    })));
  };

  const addCalendarEvent = async (event) => {
    const created = await api.createEvent({
      title: event.title,
      startAt: event.startAt,
      endAt: event.endAt,
      workspaceId: event.workspaceId || workspace?.id,
      participantUserIds: event.participantUserIds || [],
    });
    setCalendarEvents((prev) => [mapEvent(created), ...prev]);
    return created;
  };

  const deleteCalendarEvent = async (eventId) => {
    await api.deleteEvent(eventId);
    setCalendarEvents((prev) => prev.filter((event) => String(event.id) !== String(eventId)));
  };

  const syncNotionCalendar = async () => {
    if (!workspace?.id) throw new Error('워크스페이스를 먼저 선택해주세요.');
    await api.syncWorkspaceToNotion(workspace.id);
    setCalendarExported(true);
  };

  const value = useMemo(() => ({
    user,
    workspace,
    workspaces,
    invitations,
    meetings,
    calendarTasks,
    calendarEvents,
    taskStats,
    calendarExported,
    isApiMode,
    isRestoringSession,
    login,
    register,
    logout,
    updateUser,
    updateProfileImageFromAsset,
    changePassword,
    deleteAccount,
    selectWorkspace,
    createWorkspace,
    deleteWorkspace,
    acceptInvitation,
    declineInvitation,
    inviteMember,
    searchUsers,
    addMeeting,
    deleteMeeting,
    deleteRecording,
    refreshMeetingData,
    uploadRecordingAndTranscribe,
    updateSpeakerName,
    addCalendarTask,
    updateCalendarTask,
    deleteCalendarTask,
    addCalendarEvent,
    deleteCalendarEvent,
    setCalendarExported,
    syncNotionCalendar,
    getMeetingById,
  }), [user, workspace, workspaces, invitations, meetings, calendarTasks, calendarEvents, taskStats, calendarExported, isApiMode, isRestoringSession]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
}
