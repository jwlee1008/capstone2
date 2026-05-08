import React, { createContext, useContext, useMemo, useState } from 'react';
import { suggestedTasks, summaryBullets, transcriptSegments, workspaceMembers } from '../data/mockData';

const AppContext = createContext(null);

function createSession({ id = `s${Date.now()}`, fileName = 'planning-meeting.m4a', status = 'completed' } = {}) {
  return {
    id,
    startedAt: new Date().toISOString(),
    duration: '18분 24초',
    status,
    sourceType: 'upload',
    fileName,
    processStatus: status === 'completed' ? 'done' : 'processing',
    speakerMap: status === 'completed' ? { A: '김민지', B: '이준호', C: '박서연' } : {},
    summary: summaryBullets.join(' '),
    summaryBullets,
    transcript: transcriptSegments,
    tasks: suggestedTasks,
  };
}

function createDemoMeeting() {
  return {
    id: 'm1',
    name: '캡스톤 서비스 기획 회의',
    description: '회의 기록과 일정 등록 흐름 검토',
    createdAt: '2026-05-09T01:20:00.000Z',
    participants: workspaceMembers.map((member) => member.name),
    sessions: [createSession({ id: 's1' })],
  };
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [calendarTasks, setCalendarTasks] = useState([]);
  const [notionConnected, setNotionConnected] = useState(false);

  const login = async (userData) => {
    setUser({
      id: userData.id || 'me',
      email: userData.email,
      name: userData.name || userData.email?.split('@')[0] || '사용자',
      role: '서비스 운영',
    });
  };

  const logout = () => {
    setUser(null);
    setWorkspace(null);
    setMeetings([]);
    setCalendarTasks([]);
    setNotionConnected(false);
  };

  const updateUser = (updates) => setUser((prev) => ({ ...prev, ...updates }));

  const createWorkspace = (name) => {
    const nextWorkspace = {
      id: 'w1',
      name: name || '프론트엔드 캡스톤 팀',
      members: workspaceMembers,
      invitedEmails: ['designer@team.com'],
    };
    setWorkspace(nextWorkspace);
    setMeetings([createDemoMeeting()]);
    return nextWorkspace;
  };

  const inviteMember = (email) => {
    if (!email.trim()) return;
    setWorkspace((prev) => ({ ...prev, invitedEmails: [...(prev?.invitedEmails || []), email.trim()] }));
  };

  const addMeeting = async (meetingData) => {
    const meeting = {
      id: `m${Date.now()}`,
      name: meetingData.name,
      description: meetingData.description,
      createdAt: new Date().toISOString(),
      participants: meetingData.participants,
      sessions: [],
    };
    setMeetings((prev) => [meeting, ...prev]);
    return meeting;
  };

  const addMeetingSession = (meetingId, fileName) => {
    const session = createSession({ fileName, status: 'processing' });
    setMeetings((prev) => prev.map((meeting) => (
      String(meeting.id) === String(meetingId) ? { ...meeting, sessions: [session, ...meeting.sessions] } : meeting
    )));
    return session;
  };

  const completeSession = (meetingId, sessionId) => {
    setMeetings((prev) => prev.map((meeting) => (
      String(meeting.id) === String(meetingId)
        ? {
            ...meeting,
            sessions: meeting.sessions.map((session) => (
              session.id === sessionId ? createSession({ id: session.id, fileName: session.fileName, status: 'completed' }) : session
            )),
          }
        : meeting
    )));
  };

  const updateSpeakerName = (meetingId, sessionId, speakerKey, name) => {
    setMeetings((prev) => prev.map((meeting) => (
      String(meeting.id) === String(meetingId)
        ? {
            ...meeting,
            sessions: meeting.sessions.map((session) => (
              session.id === sessionId ? { ...session, speakerMap: { ...session.speakerMap, [speakerKey]: name } } : session
            )),
          }
        : meeting
    )));
  };

  const addCalendarTask = (task) => {
    setCalendarTasks((prev) => [{ ...task, id: task.id || `manual-${Date.now()}`, source: task.source || '직접 등록', status: '등록됨' }, ...prev]);
  };

  const getMeetingById = (id) => meetings.find((meeting) => String(meeting.id) === String(id));

  const value = useMemo(() => ({
    user,
    workspace,
    meetings,
    calendarTasks,
    notionConnected,
    login,
    logout,
    updateUser,
    createWorkspace,
    inviteMember,
    addMeeting,
    addMeetingSession,
    completeSession,
    updateSpeakerName,
    addCalendarTask,
    setNotionConnected,
    getMeetingById,
  }), [user, workspace, meetings, calendarTasks, notionConnected]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
}
