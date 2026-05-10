import React, { createContext, useContext, useMemo, useState } from 'react';
import { api } from '../services/api';
import { suggestedTasks, summaryBullets, transcriptSegments, workspaceMembers } from '../data/mockData';

const AppContext = createContext(null);

function createDemoSession({ id = `s${Date.now()}`, fileName = 'planning-meeting.m4a', status = 'completed' } = {}) {
  return {
    id,
    transcriptId: 'demo-transcript',
    startedAt: new Date().toISOString(),
    duration: '18분 24초',
    status,
    sourceType: 'upload',
    fileName,
    processStatus: status === 'completed' ? 'done' : 'processing',
    speakerMap: status === 'completed' ? { A: '김민지', B: '이준호', C: '박서연' } : {},
    summary: summaryBullets.join(' '),
    summaryBullets,
    keywords: ['회의요약', '할일', '캘린더'],
    transcript: transcriptSegments,
    tasks: suggestedTasks,
    events: [],
  };
}

function createDemoMeeting() {
  return {
    id: 'm1',
    workspaceId: 'w1',
    name: '캡스톤 서비스 기획 회의',
    description: '회의 기록과 일정 등록 흐름 검토',
    createdAt: '2026-05-09T01:20:00.000Z',
    participants: workspaceMembers.map((member) => member.name),
    sessions: [createDemoSession({ id: 's1' })],
    taskCount: suggestedTasks.length,
    eventCount: 0,
  };
}

function mapWorkspace(raw, members = []) {
  if (!raw) return null;
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    ownerId: raw.ownerId,
    ownerName: raw.ownerName,
    createdAt: raw.createdAt,
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

function splitSummary(summary) {
  if (!summary) return [];
  return summary
    .split(/\n|[.!?。]\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mapTranscriptSegment(segment, index) {
  const label = segment.speakerLabel || segment.speakerKey || 'SPEAKER_A';
  const speakerKey = label.replace('SPEAKER_', '');
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

function buildSessionFromBackend({ transcript, summary, tasks = [], events = [], recordings = [] }) {
  if (!transcript && !summary && tasks.length === 0 && events.length === 0 && recordings.length === 0) return null;
  const recording = recordings[0];
  const segments = (transcript?.segments || []).map(mapTranscriptSegment);
  const speakerMap = {};
  segments.forEach((segment) => {
    if (segment.speakerName) speakerMap[segment.speakerKey] = segment.speakerName;
  });

  return {
    id: transcript?.id || recording?.recordingId || `s${Date.now()}`,
    transcriptId: transcript?.id,
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

  const getMeetingById = (id) => meetings.find((meeting) => String(meeting.id) === String(id));

  const loadInvitations = async () => {
    if (!isApiMode) return invitations;
    const rows = await api.getInvitations().catch(() => []);
    const mapped = rows.filter((item) => (item.status || 'PENDING') === 'PENDING').map(mapInvitation);
    setInvitations(mapped);
    return mapped;
  };

  const loadWorkspaceBundle = async (targetWorkspace = null) => {
    const backendWorkspaces = await api.getWorkspaces();
    const mappedList = backendWorkspaces.map((item) => mapWorkspace(item));
    const selected = targetWorkspace || backendWorkspaces?.[0] || null;
    setWorkspaces(mappedList);
    await loadInvitations();

    if (!selected) {
      setWorkspace(null);
      setMeetings([]);
      setCalendarTasks([]);
      setCalendarEvents([]);
      return;
    }

    const members = (await api.getWorkspaceMembers(selected.id)).map(mapMember);
    const mappedWorkspace = mapWorkspace(selected, members);
    const [backendMeetings, tasks, events, stats] = await Promise.all([
      api.getMeetings(selected.id).catch(() => []),
      api.getTasks({ workspaceId: selected.id }).catch(() => []),
      api.getEvents({ workspaceId: selected.id }).catch(() => []),
      api.getTaskStats({ workspaceId: selected.id }).catch(() => null),
    ]);

    setWorkspace(mappedWorkspace);
    setMeetings(backendMeetings.map((meeting) => mapMeeting(meeting, members)));
    setCalendarTasks(tasks.map(mapTask));
    setCalendarEvents(events.map(mapEvent));
    if (stats) setTaskStats(stats);
  };

  const login = async ({ email, password = 'password123', name }) => {
    try {
      const data = await api.login(email, password);
      setIsApiMode(true);
      setUser({ id: data.userId, email, name: data.name || name || email.split('@')[0], role: '서비스 운영' });
      const backendWorkspaces = await api.getWorkspaces();
      setWorkspaces(backendWorkspaces.map((item) => mapWorkspace(item)));
      const rows = await api.getInvitations().catch(() => []);
      setInvitations(rows.filter((item) => (item.status || 'PENDING') === 'PENDING').map(mapInvitation));
      if (backendWorkspaces[0]) await loadWorkspaceBundle(backendWorkspaces[0]);
    } catch {
      setIsApiMode(false);
      setUser({ id: 'me', email, name: name || email.split('@')[0], role: '서비스 운영' });
      setWorkspaces([]);
      setInvitations([]);
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
    if (isApiMode) await api.logout();
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

  const updateUser = async (updates) => {
    if (isApiMode && updates.name) await api.updateProfileName(updates.name).catch(() => null);
    setUser((prev) => ({ ...prev, ...updates }));
  };

  const selectWorkspace = async (workspaceId) => {
    if (isApiMode) {
      const selected = workspaces.find((item) => String(item.id) === String(workspaceId));
      await loadWorkspaceBundle(selected);
      return;
    }
    if (!workspace) setWorkspace({ id: 'w1', name: '프론트엔드 캡스톤 팀', members: workspaceMembers, invitedEmails: [] });
  };

  const createWorkspace = async (name) => {
    if (isApiMode) {
      const created = await api.createWorkspace(name);
      await loadWorkspaceBundle(created);
      return created;
    }

    const nextWorkspace = {
      id: 'w1',
      name: name || '프론트엔드 캡스톤 팀',
      members: workspaceMembers,
      invitedEmails: ['designer@team.com'],
    };
    setWorkspace(nextWorkspace);
    setWorkspaces([nextWorkspace]);
    setMeetings([createDemoMeeting()]);
    return nextWorkspace;
  };

  const acceptInvitation = async (invitationId) => {
    if (isApiMode) {
      await api.acceptInvitation(invitationId);
      await loadWorkspaceBundle();
      return;
    }
    setInvitations((prev) => prev.filter((item) => String(item.id) !== String(invitationId)));
  };

  const declineInvitation = async (invitationId) => {
    if (isApiMode) await api.declineInvitation(invitationId);
    setInvitations((prev) => prev.filter((item) => String(item.id) !== String(invitationId)));
  };

  const inviteMember = async (email) => {
    if (!email.trim()) return;
    if (isApiMode && workspace?.id) await api.inviteMember(workspace.id, email.trim());
    setWorkspace((prev) => ({ ...prev, invitedEmails: [...(prev?.invitedEmails || []), email.trim()] }));
  };

  const addMeeting = async (meetingData) => {
    if (isApiMode && workspace?.id) {
      const created = await api.createMeeting({ workspaceId: workspace.id, title: meetingData.name });
      const mapped = mapMeeting(created, workspace.members || []);
      setMeetings((prev) => [mapped, ...prev]);
      return mapped;
    }

    const meeting = {
      id: `m${Date.now()}`,
      workspaceId: workspace?.id,
      name: meetingData.name,
      description: meetingData.description,
      createdAt: new Date().toISOString(),
      participants: meetingData.participants,
      sessions: [],
      taskCount: 0,
      eventCount: 0,
    };
    setMeetings((prev) => [meeting, ...prev]);
    return meeting;
  };

  const deleteMeeting = async (meetingId) => {
    if (isApiMode) await api.deleteMeeting(meetingId);
    setMeetings((prev) => prev.filter((meeting) => String(meeting.id) !== String(meetingId)));
  };

  const refreshMeetingData = async (meetingId) => {
    if (!isApiMode) return getMeetingById(meetingId);
    const [meetingDetail, summary, transcript, tasks, events, recordings] = await Promise.all([
      api.getMeeting(meetingId).catch(() => null),
      api.getMeetingSummary(meetingId).catch(() => null),
      api.getTranscript(meetingId).catch(() => null),
      api.getTasks({ meetingId }).catch(() => []),
      api.getEvents({ workspaceId: workspace?.id }).catch(() => []),
      api.getRecordings(meetingId).catch(() => []),
    ]);
    const meetingEvents = events.filter((event) => !event.meetingId || String(event.meetingId) === String(meetingId));
    const session = buildSessionFromBackend({ transcript, summary, tasks, events: meetingEvents, recordings });
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
    if (!isApiMode) {
      const session = createDemoSession({ fileName: asset?.name || 'recording.m4a', status: 'processing' });
      setMeetings((prev) => prev.map((meeting) => (
        String(meeting.id) === String(meetingId) ? { ...meeting, sessions: [session, ...meeting.sessions] } : meeting
      )));
      setTimeout(() => {
        setMeetings((prev) => prev.map((meeting) => (
          String(meeting.id) === String(meetingId)
            ? { ...meeting, sessions: meeting.sessions.map((item) => item.id === session.id ? createDemoSession({ id: session.id, fileName: session.fileName, status: 'completed' }) : item) }
            : meeting
        )));
      }, 900);
      return session;
    }

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

    if (isApiMode && session?.transcriptId) {
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

    setMeetings((prev) => prev.map((item) => (
      String(item.id) === String(meetingId)
        ? { ...item, sessions: item.sessions.map((s) => String(s.id) === String(sessionId) ? { ...s, speakerMap: nextMap } : s) }
        : item
    )));
  };

  const addCalendarTask = async (task) => {
    if (isApiMode) {
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
    }

    setCalendarTasks((prev) => [{
      ...task,
      id: task.id || `manual-${Date.now()}`,
      source: task.source || '직접 등록',
      status: '등록됨',
      statusCode: 'TODO',
      workspaceId: task.workspaceId || workspace?.id,
    }, ...prev]);
  };

  const updateCalendarTask = async (taskId, updates) => {
    if (isApiMode) {
      const updated = await api.updateTask(taskId, updates);
      setCalendarTasks((prev) => prev.map((task) => String(task.id) === String(taskId) ? mapTask(updated) : task));
      return updated;
    }
    setCalendarTasks((prev) => prev.map((task) => String(task.id) === String(taskId) ? { ...task, ...updates } : task));
  };

  const deleteCalendarTask = async (taskId) => {
    if (isApiMode) await api.deleteTask(taskId);
    setCalendarTasks((prev) => prev.filter((task) => String(task.id) !== String(taskId)));
  };

  const addCalendarEvent = async (event) => {
    if (isApiMode) {
      const created = await api.createEvent({
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
        workspaceId: event.workspaceId || workspace?.id,
        participantUserIds: event.participantUserIds || [],
      });
      setCalendarEvents((prev) => [mapEvent(created), ...prev]);
      return created;
    }
    setCalendarEvents((prev) => [{ ...event, id: event.id || `event-${Date.now()}`, workspaceId: workspace?.id }, ...prev]);
  };

  const deleteCalendarEvent = async (eventId) => {
    if (isApiMode) await api.deleteEvent(eventId);
    setCalendarEvents((prev) => prev.filter((event) => String(event.id) !== String(eventId)));
  };

  const syncNotionCalendar = async () => {
    if (isApiMode && workspace?.id) await api.syncWorkspaceToNotion(workspace.id);
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
    login,
    register,
    logout,
    updateUser,
    selectWorkspace,
    createWorkspace,
    acceptInvitation,
    declineInvitation,
    inviteMember,
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
  }), [user, workspace, workspaces, invitations, meetings, calendarTasks, calendarEvents, taskStats, notionConnected, isApiMode]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
}
