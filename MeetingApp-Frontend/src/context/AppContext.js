import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, restoreTokens, setAuthExpiredHandler } from '../services/api';

const AppContext = createContext(null);

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

function mapMeeting(raw, members = []) {
  return {
    id: raw.id,
    workspaceId: raw.workspaceId,
    name: raw.title || raw.name || '회의',
    description: raw.description || '',
    createdAt: raw.createdAt || new Date().toISOString(),
    createdBy: raw.createdBy,
    participants: members.map((member) => member.name),
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

function mapUser(raw, fallback = {}) {
  return {
    id: raw?.id || raw?.userId || fallback.id || fallback.userId,
    userId: raw?.id || raw?.userId || fallback.id || fallback.userId,
    email: raw?.email || fallback.email || '',
    name: raw?.name || fallback.name || raw?.email || fallback.email || '사용자',
    profileImg: raw?.profileImg || raw?.profileImageUrl || fallback.profileImg || fallback.profileImageUrl,
    role: raw?.role || fallback.role || '서비스 운영',
    status: raw?.status || fallback.status,
  };
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
  const [notionConnected, setNotionConnected] = useState(false);
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
    setNotionConnected(false);
    setIsApiMode(false);
  };

  useEffect(() => {
    setAuthExpiredHandler(resetAppState);
    return () => setAuthExpiredHandler(null);
  }, []);

  const getMeetingById = (id) => meetings.find((meeting) => String(meeting.id) === String(id));

  const loadInvitations = async () => {
    const rows = await api.getInvitations().catch(() => []);
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
    if (stats) setTaskStats(stats);
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
      } catch {
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
    } catch {
      throw new Error('회원가입에 실패했습니다.');
    }
  };

  const logout = async () => {
    if (isApiMode) await api.logout(user?.id).catch(() => {});
    resetAppState();
  };

  const updateUser = async (updates) => {
    if (isApiMode && updates.name) await api.updateProfileName(updates.name).catch(() => null);
    setUser((prev) => ({ ...prev, ...updates }));
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
    await api.inviteMember(workspace.id, normalizedEmail);
    setWorkspace((prev) => ({
      ...prev,
      invitedEmails: Array.from(new Set([...(prev?.invitedEmails || []), normalizedEmail])),
    }));
  };

  const searchUsers = async (query) => {
    if (!query.trim()) return [];
    return normalizeList(await api.searchUsers(query.trim())).map(mapUser);
  };

  const addMeeting = async (meetingData) => {
    if (!workspace?.id) throw new Error('워크스페이스를 먼저 선택해주세요.');
    const created = await api.createMeeting({ workspaceId: workspace.id, title: meetingData.name });
    const mapped = mapMeeting(created, workspace.members || []);
    setMeetings((prev) => [mapped, ...prev]);
    return mapped;
  };

  const deleteMeeting = async (meetingId) => {
    await api.deleteMeeting(meetingId);
    setMeetings((prev) => prev.filter((meeting) => String(meeting.id) !== String(meetingId)));
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
    const meetingEvents = events.filter((event) => !event.meetingId || String(event.meetingId) === String(meetingId));
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

  const updateSpeakerName = async (meetingId, sessionId, speakerKey, name) => {
    const meeting = getMeetingById(meetingId);
    const session = meeting?.sessions?.find((item) => String(item.id) === String(sessionId)) || meeting?.sessions?.[0];
    const nextMap = { ...(session?.speakerMap || {}), [speakerKey]: name };

    if (session?.transcriptId) {
      const mappings = Object.entries(nextMap).map(([key, userName]) => {
        const segment = session.transcript.find((item) => item.speakerKey === key);
        const member = workspace?.members?.find((item) => item.name === userName);
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
      dueDate: task.dueDate || null,
      workspaceId: task.workspaceId || workspace?.id || null,
      meetingId: task.meetingId || null,
    });
    setCalendarTasks((prev) => [mapTask(created), ...prev]);
    return created;
  };

  const updateCalendarTask = async (taskId, updates) => {
    const updated = await api.updateTask(taskId, updates);
    setCalendarTasks((prev) => prev.map((task) => String(task.id) === String(taskId) ? mapTask(updated) : task));
    return updated;
  };

  const deleteCalendarTask = async (taskId) => {
    await api.deleteTask(taskId);
    setCalendarTasks((prev) => prev.filter((task) => String(task.id) !== String(taskId)));
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
    setNotionConnected(true);
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
    notionConnected,
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
    acceptInvitation,
    declineInvitation,
    inviteMember,
    searchUsers,
    addMeeting,
    deleteMeeting,
    refreshMeetingData,
    uploadRecordingAndTranscribe,
    updateSpeakerName,
    addCalendarTask,
    updateCalendarTask,
    deleteCalendarTask,
    addCalendarEvent,
    deleteCalendarEvent,
    setNotionConnected,
    syncNotionCalendar,
    getMeetingById,
  }), [user, workspace, workspaces, invitations, meetings, calendarTasks, calendarEvents, taskStats, notionConnected, isApiMode, isRestoringSession]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
}
