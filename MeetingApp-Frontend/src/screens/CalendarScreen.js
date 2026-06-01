import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAppContext } from '../context/AppContext';
import { persistentStorage } from '../services/api';
import { COLORS, RADIUS } from '../theme';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const CALENDAR_VIEW_MONTH_KEY = 'calendarViewMonth';
const CALENDAR_TASK_COLORS_KEY = 'calendarTaskColors';

function getOAuthClientType() {
  return Platform.OS === 'web' ? 'web' : 'mobile';
}

const STATUS_OPTIONS = [
  { code: 'TODO', label: '할일' },
  { code: 'IN_PROGRESS', label: '진행중' },
  { code: 'DONE', label: '완료' },
];

const TASK_TONES = [
  { id: 'indigo', background: '#EEF2FF', border: '#8B91F8', text: '#4F46E5' },
  { id: 'amber', background: '#FFF7E6', border: '#F5C451', text: '#946A22' },
  { id: 'sky', background: '#EAF5FF', border: '#7CC4F8', text: '#2A6F9E' },
  { id: 'rose', background: '#FDEAF2', border: '#E889A8', text: '#93465F' },
  { id: 'gray', background: '#F0F1F5', border: '#9CA3AF', text: '#4B5563' },
  { id: 'green', background: '#ECFDF5', border: '#6EE7B7', text: '#047857' },
];
const DONE_TASK_TONE = TASK_TONES.find((tone) => tone.id === 'gray');
const SELECTABLE_TASK_TONES = TASK_TONES.filter((tone) => tone.id !== 'gray');
const EVENT_TONE = { background: '#E0F2FE', border: '#38BDF8', text: '#075985' };
const EVENT_COLOR = '#38BDF8';

function getUrlParam(url, key) {
  if (!url) return null;
  const query = String(url).split('?')[1]?.split('#')[0] || '';
  if (!query) return null;

  const params = query.split('&');
  for (const param of params) {
    const [rawName, rawValue = ''] = param.split('=');
    if (decodeURIComponent(rawName) === key) {
      return decodeURIComponent(rawValue.replace(/\+/g, ' '));
    }
  }
  return null;
}

function getNotionCode(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const queryCode = getUrlParam(text, 'code');
  if (queryCode) return queryCode;
  try {
    const parsed = JSON.parse(text);
    if (parsed?.code) return String(parsed.code);
  } catch {
    // The web callback page is plain JSON; non-JSON input falls through to raw code parsing.
  }
  return /^[A-Za-z0-9_-]{12,}$/.test(text) ? text : null;
}

function getFreshNotionAuthUrl(authUrl) {
  try {
    const url = new URL(authUrl);
    url.searchParams.set('state', `meno-web-${Date.now()}`);
    return url.toString();
  } catch {
    const separator = String(authUrl).includes('?') ? '&' : '?';
    return `${authUrl}${separator}state=meno-web-${Date.now()}`;
  }
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthTitle(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function getDateLabel(dateKey) {
  const date = parseDateKey(dateKey);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAY_LABELS[date.getDay()]})`;
}

function getTaskDateKey(task) {
  if (!task?.dueDate) return '';
  return String(task.dueDate).slice(0, 10);
}

function compareTasks(a, b) {
  const aDate = getTaskDateKey(a) || '9999-99-99';
  const bDate = getTaskDateKey(b) || '9999-99-99';
  if (aDate !== bDate) return aDate.localeCompare(bDate);
  return String(a.title || '').localeCompare(String(b.title || ''));
}

function buildMonthDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(year, month, 1 - firstDay.getDay());
  const todayKey = toDateKey(new Date());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const key = toDateKey(date);
    return {
      date,
      key,
      isCurrentMonth: date.getMonth() === month,
      isToday: key === todayKey,
    };
  });
}

function getTaskTone(task, index = 0, taskColors = {}) {
  if (task?.statusCode === 'DONE') return DONE_TASK_TONE;
  const savedTone = SELECTABLE_TASK_TONES.find((tone) => tone.id === taskColors[String(task?.id)]);
  if (savedTone) return savedTone;
  if (task?.statusCode === 'IN_PROGRESS') return TASK_TONES[2];

  const seed = String(task?.id || task?.title || index);
  const hash = seed.split('').reduce((sum, char) => sum + char.charCodeAt(0), index);
  return SELECTABLE_TASK_TONES[Math.abs(hash) % SELECTABLE_TASK_TONES.length];
}

function getStatusLabel(statusCode) {
  return STATUS_OPTIONS.find((option) => option.code === statusCode)?.label || '할일';
}

function getEventDateKey(event) {
  if (!event?.startAt) return event?.date || '';
  return String(event.startAt).slice(0, 10);
}

function compareEvents(a, b) {
  const aStart = String(a.startAt || '');
  const bStart = String(b.startAt || '');
  if (aStart !== bStart) return aStart.localeCompare(bStart);
  return String(a.title || '').localeCompare(String(b.title || ''));
}

function getTimePart(value, fallback = '') {
  const text = String(value || '');
  const match = text.match(/T(\d{2}:\d{2})/);
  return match?.[1] || fallback;
}

function buildEventForm(dateKey = toDateKey(new Date())) {
  return {
    title: '',
    date: dateKey,
    startTime: '09:00',
    endTime: '10:00',
    location: '',
    description: '',
  };
}

function buildEventDateTime(dateKey, time) {
  const date = String(dateKey || '').trim();
  const clock = String(time || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}$/.test(clock)) return null;
  return `${date}T${clock}:00`;
}

function formatEventTime(event) {
  const date = getEventDateKey(event);
  const start = getTimePart(event?.startAt);
  const end = getTimePart(event?.endAt);
  if (event?.isAllDay) return `${date} · 종일`;
  return [date, start && end ? `${start}-${end}` : start].filter(Boolean).join(' · ');
}

function getNotionSyncMessage(result) {
  const syncedCount = result?.syncedCount ?? result?.requestedCount;
  if (Number.isFinite(Number(syncedCount))) {
    return `Notion 캘린더와 ${Number(syncedCount)}개 일정을 동기화했습니다.`;
  }
  return 'Notion 캘린더와 동기화했습니다.';
}

function getNotionTargetKey(target) {
  return String(target?.id || target?.url || target?.name || '');
}

export default function CalendarScreen() {
  const {
    calendarTasks,
    calendarEvents,
    notionConnected,
    notionStatus,
    workspace,
    workspaces,
    selectWorkspace,
    refreshWorkspaceData,
    startNotionCalendarLink,
    completeNotionCalendarLink,
    loadNotionCalendarTargets,
    configureNotionCalendarTarget,
    createNotionCalendarTarget,
    refreshNotionStatus,
    syncNotionCalendar,
    syncWorkspaceNotionCalendar,
    addCalendarEvent,
    deleteCalendarEvent,
    updateCalendarTask,
    deleteCalendarTask,
  } = useAppContext();

  const [viewMonth, setViewMonth] = useState(() => new Date());
  const [selectedDateKey, setSelectedDateKey] = useState(null);
  const [isMonthTasksOpen, setIsMonthTasksOpen] = useState(false);
  const [notionAction, setNotionAction] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState(null);
  const [isCalendarStateReady, setIsCalendarStateReady] = useState(false);
  const [isTaskColorStateReady, setIsTaskColorStateReady] = useState(false);
  const [taskColors, setTaskColors] = useState({});
  const [isNotionStatusLoading, setIsNotionStatusLoading] = useState(false);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventForm, setEventForm] = useState(() => buildEventForm());
  const [isEventSaving, setIsEventSaving] = useState(false);
  const [isNotionTargetModalOpen, setIsNotionTargetModalOpen] = useState(false);
  const [notionCalendarTargets, setNotionCalendarTargets] = useState([]);
  const [selectedNotionTargetKey, setSelectedNotionTargetKey] = useState('');
  const [isNotionTargetLoading, setIsNotionTargetLoading] = useState(false);
  const [isNotionTargetSaving, setIsNotionTargetSaving] = useState(false);
  const lastFocusRefreshRef = useRef(null);
  const notionOAuthClientRef = useRef(getOAuthClientType());
  const notionLinkModeRef = useRef('connect');

  const monthDays = useMemo(() => buildMonthDays(viewMonth), [viewMonth]);
  const viewMonthKey = useMemo(() => getMonthKey(viewMonth), [viewMonth]);

  const tasksByDate = useMemo(() => {
    return calendarTasks.reduce((acc, task) => {
      const key = getTaskDateKey(task);
      if (!key) return acc;
      acc[key] = [...(acc[key] || []), task].sort(compareTasks);
      return acc;
    }, {});
  }, [calendarTasks]);

  const monthTasks = useMemo(() => {
    return calendarTasks
      .filter((task) => getTaskDateKey(task).startsWith(viewMonthKey))
      .slice()
      .sort(compareTasks);
  }, [calendarTasks, viewMonthKey]);

  const selectedDayTasks = useMemo(() => {
    if (!selectedDateKey) return [];
    return tasksByDate[selectedDateKey] || [];
  }, [selectedDateKey, tasksByDate]);

  const eventsByDate = useMemo(() => {
    return calendarEvents.reduce((acc, event) => {
      const key = getEventDateKey(event);
      if (!key) return acc;
      acc[key] = [...(acc[key] || []), event].sort(compareEvents);
      return acc;
    }, {});
  }, [calendarEvents]);

  const monthEvents = useMemo(() => {
    return calendarEvents
      .filter((event) => getEventDateKey(event).startsWith(viewMonthKey))
      .slice()
      .sort(compareEvents);
  }, [calendarEvents, viewMonthKey]);

  const selectedDayEvents = useMemo(() => {
    if (!selectedDateKey) return [];
    return eventsByDate[selectedDateKey] || [];
  }, [selectedDateKey, eventsByDate]);

  useEffect(() => {
    let isMounted = true;
    persistentStorage.get(CALENDAR_VIEW_MONTH_KEY).then((savedMonthKey) => {
      if (!isMounted || !savedMonthKey) return;
      const restoredMonth = parseDateKey(`${savedMonthKey}-01`);
      setViewMonth(restoredMonth);
    }).catch(() => {}).finally(() => {
      if (isMounted) setIsCalendarStateReady(true);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isCalendarStateReady) return;
    persistentStorage.set(CALENDAR_VIEW_MONTH_KEY, viewMonthKey);
  }, [isCalendarStateReady, viewMonthKey]);

  useEffect(() => {
    let isMounted = true;
    persistentStorage.get(CALENDAR_TASK_COLORS_KEY).then((savedColors) => {
      if (!isMounted || !savedColors) return;
      try {
        const parsed = JSON.parse(savedColors);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) setTaskColors(parsed);
      } catch {}
    }).catch(() => {}).finally(() => {
      if (isMounted) setIsTaskColorStateReady(true);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isTaskColorStateReady) return;
    persistentStorage.set(CALENDAR_TASK_COLORS_KEY, JSON.stringify(taskColors));
  }, [isTaskColorStateReady, taskColors]);

  useFocusEffect(useCallback(() => {
    const refreshKey = `${workspace?.id || 'none'}:${notionAction || 'idle'}`;
    if (lastFocusRefreshRef.current === refreshKey || notionAction) return undefined;
    lastFocusRefreshRef.current = refreshKey;
    refreshWorkspaceData?.().catch(() => {});
    setIsNotionStatusLoading(true);
    refreshNotionStatus?.().catch(() => {}).finally(() => setIsNotionStatusLoading(false));
    return undefined;
  }, [workspace?.id, notionAction]));

  const handleRefresh = useCallback(async () => {
    try {
      setIsRefreshing(true);
      await refreshWorkspaceData?.();
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshWorkspaceData]);

  const handleSelectWorkspace = async (workspaceId) => {
    if (!workspaceId || String(workspace?.id) === String(workspaceId)) return;
    try {
      setSwitchingWorkspaceId(workspaceId);
      setSelectedDateKey(null);
      await selectWorkspace(workspaceId);
    } catch (error) {
      Alert.alert('워크스페이스 변경 실패', error?.message || '워크스페이스를 변경하지 못했습니다.');
    } finally {
      setSwitchingWorkspaceId(null);
    }
  };

  const openEventModal = (dateKey = selectedDateKey || toDateKey(new Date())) => {
    setEventForm(buildEventForm(dateKey));
    setIsEventModalOpen(true);
  };

  const handleSaveEvent = async () => {
    const title = eventForm.title.trim();
    const startAt = buildEventDateTime(eventForm.date, eventForm.startTime);
    const endAt = buildEventDateTime(eventForm.date, eventForm.endTime);
    if (!title) {
      Alert.alert('일정 추가 실패', '일정 제목을 입력해주세요.');
      return;
    }
    if (!workspace?.id) {
      Alert.alert('일정 추가 실패', '워크스페이스를 먼저 선택해주세요.');
      return;
    }
    if (!startAt || !endAt || endAt <= startAt) {
      Alert.alert('일정 추가 실패', '날짜와 시간을 확인해주세요.');
      return;
    }

    try {
      setIsEventSaving(true);
      await addCalendarEvent({
        title,
        startAt,
        endAt,
        location: eventForm.location.trim(),
        description: eventForm.description.trim(),
        workspaceId: workspace.id,
        color: EVENT_COLOR,
      });
      setSelectedDateKey(eventForm.date);
      setIsEventModalOpen(false);
    } catch (error) {
      Alert.alert('일정 추가 실패', error?.message || '일정을 등록하지 못했습니다.');
    } finally {
      setIsEventSaving(false);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    try {
      await deleteCalendarEvent(eventId);
    } catch (error) {
      Alert.alert('일정 삭제 실패', error?.message || '일정을 삭제하지 못했습니다.');
    }
  };

  const openNotionTargetModal = useCallback(async () => {
    try {
      setIsNotionTargetModalOpen(true);
      setIsNotionTargetLoading(true);
      const targets = await loadNotionCalendarTargets();
      setNotionCalendarTargets(targets);
      setSelectedNotionTargetKey((current) => (
        targets.some((target) => getNotionTargetKey(target) === current) ? current : getNotionTargetKey(targets[0])
      ));
    } catch (error) {
      setIsNotionTargetModalOpen(false);
      Alert.alert('Notion 캘린더 조회 실패', error?.message || '선택 가능한 Notion 캘린더를 불러오지 못했습니다.');
    } finally {
      setIsNotionTargetLoading(false);
    }
  }, [loadNotionCalendarTargets]);

  const handleSaveNotionTarget = async () => {
    const selectedTarget = notionCalendarTargets.find((target) => getNotionTargetKey(target) === selectedNotionTargetKey);
    if (!selectedTarget) {
      Alert.alert('캘린더 선택 필요', '연결할 Notion 캘린더를 선택해주세요.');
      return;
    }

    try {
      setIsNotionTargetSaving(true);
      await configureNotionCalendarTarget(selectedTarget);
      setIsNotionTargetModalOpen(false);
      Alert.alert('Notion 캘린더 연결 완료', `${selectedTarget.name || '선택한 캘린더'}로 동기화합니다.`);
    } catch (error) {
      Alert.alert('Notion 캘린더 연결 실패', error?.message || '선택한 Notion 캘린더를 등록하지 못했습니다.');
    } finally {
      setIsNotionTargetSaving(false);
    }
  };

  const handleCreateNotionTarget = async () => {
    try {
      setIsNotionTargetSaving(true);
      const created = await createNotionCalendarTarget({ name: `${workspace?.name || 'Meno'} Calendar` });
      setIsNotionTargetModalOpen(false);
      setNotionCalendarTargets((current) => [created, ...current.filter((target) => getNotionTargetKey(target) !== getNotionTargetKey(created))]);
      setSelectedNotionTargetKey(getNotionTargetKey(created));
      Alert.alert('Notion 캘린더 생성 완료', `${created?.name || 'Meno Calendar'}로 동기화합니다.`);
    } catch (error) {
      Alert.alert('Notion 캘린더 생성 실패', error?.message || '새 Notion 캘린더를 만들지 못했습니다.');
    } finally {
      setIsNotionTargetSaving(false);
    }
  };

  const completeNotionFromUrl = useCallback(async (url) => {
    const error = getUrlParam(url, 'error');
    if (error) {
      Alert.alert('Notion 연결 실패', 'Notion 연결이 취소되었거나 승인되지 않았습니다.');
      return false;
    }

    const code = getNotionCode(url);
    if (!code) return false;

    const isReconnecting = notionLinkModeRef.current === 'relink';
    try {
      setNotionAction(isReconnecting ? 'relink' : 'link');
      await completeNotionCalendarLink(
        code,
        getUrlParam(url, 'client') || notionOAuthClientRef.current,
        { forceTargetRefresh: isReconnecting },
      );
      if (Platform.OS === 'web' && typeof window !== 'undefined' && String(window.location.href).includes('code=')) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      const status = await refreshNotionStatus?.().catch(() => null);
      const shouldSelectCalendar = isReconnecting || !status?.calendarConfigured;
      if (shouldSelectCalendar) {
        await openNotionTargetModal();
      }
      Alert.alert(
        isReconnecting ? 'Notion 권한 변경 완료' : 'Notion 연결 완료',
        shouldSelectCalendar ? '동기화할 Notion 캘린더를 선택해주세요.' : 'Notion 캘린더 설정이 준비되었습니다.',
      );
      return true;
    } catch (connectError) {
      Alert.alert('Notion 연결 실패', connectError?.message || 'Notion 계정을 연결하지 못했습니다.');
      return false;
    } finally {
      notionLinkModeRef.current = 'connect';
      setNotionAction(null);
    }
  }, [completeNotionCalendarLink, openNotionTargetModal, refreshNotionStatus]);

  useEffect(() => {
    let isMounted = true;
    const subscription = Linking.addEventListener('url', ({ url }) => {
      completeNotionFromUrl(url);
    });

    Linking.getInitialURL().then((url) => {
      if (isMounted && url) completeNotionFromUrl(url);
    }).catch(() => {});

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      completeNotionFromUrl(window.location.href);
    }

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [completeNotionFromUrl]);

  const openNotionAuthOnWeb = (authUrl) => new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }

    const width = Math.min(980, window.screen?.availWidth || 980);
    const height = Math.min(860, window.screen?.availHeight || 860);
    const left = Math.max(0, ((window.screen?.availWidth || width) - width) / 2);
    const top = Math.max(0, ((window.screen?.availHeight || height) - height) / 2);
    const popup = window.open(
      getFreshNotionAuthUrl(authUrl),
      `meno-notion-${Date.now()}`,
      `width=${Math.round(width)},height=${Math.round(height)},left=${Math.round(left)},top=${Math.round(top)},resizable=yes,scrollbars=yes`,
    );
    if (!popup) {
      Alert.alert('Notion 창 열기 실패', '브라우저 팝업 차단을 해제한 뒤 다시 시도해주세요.');
      resolve(false);
      return;
    }

    let settled = false;
    let timer = null;
    let inaccessibleTicks = 0;
    let promptedForCode = false;
    const finish = async (handled) => {
      if (settled) return;
      settled = true;
      if (timer) window.clearInterval(timer);
      window.removeEventListener('message', handleMessage);
      if (handled) popup.close();
      resolve(Boolean(handled));
    };

    async function handleMessage(event) {
      const data = event?.data;
      if (!data || data.type !== 'meno:notion-link') return;

      const params = new URLSearchParams();
      if (data.code) params.set('code', data.code);
      if (data.error) params.set('error', data.error);
      const handled = await completeNotionFromUrl(`meno://notion/link?${params.toString()}`);
      finish(handled);
    }

    async function completeFromPastedCode() {
      if (promptedForCode || settled) return false;
      promptedForCode = true;
      const pasted = window.prompt('Notion 승인 후 새 창에 code가 보이면 code 값만 붙여넣어 주세요.');
      if (!pasted) return false;
      const handled = await completeNotionFromUrl(pasted);
      return handled || await completeNotionFromUrl(`meno://notion/link?code=${encodeURIComponent(pasted.trim())}`);
    }

    window.addEventListener('message', handleMessage);

    timer = window.setInterval(async () => {
      let href = '';
      try {
        href = popup.location?.href || '';
        inaccessibleTicks = 0;
      } catch {
        inaccessibleTicks += 1;
      }

      if (href) {
        const handled = await completeNotionFromUrl(href);
        if (handled) {
          finish(true);
          return;
        }
      }

      if (popup.closed) {
        finish(await completeFromPastedCode());
        return;
      }

      if (inaccessibleTicks >= 60) {
        const handled = await completeFromPastedCode();
        if (handled) finish(true);
      }
    }, 500);
  });

  const handleConnectNotion = async () => {
    try {
      setNotionAction('connect');
      notionLinkModeRef.current = 'connect';
      const status = await refreshNotionStatus?.().catch(() => null);
      if (status?.linked) {
        if (!status?.calendarConfigured) {
          await openNotionTargetModal();
          return;
        }
        const result = await syncNotionCalendar();
        Alert.alert('Notion 설정 완료', getNotionSyncMessage(result));
        return;
      }
      const client = getOAuthClientType();
      const { authUrl, client: resolvedClient } = await startNotionCalendarLink(client);
      notionOAuthClientRef.current = resolvedClient || client;
      if (Platform.OS === 'web') {
        await openNotionAuthOnWeb(authUrl);
        return;
      }
      await Linking.openURL(authUrl);
    } catch (error) {
      Alert.alert('Notion 연결 실패', error?.message || 'Notion 인증 화면을 열지 못했습니다.');
    } finally {
      setNotionAction(null);
    }
  };

  const handleReconnectNotion = async () => {
    try {
      setNotionAction('relink');
      notionLinkModeRef.current = 'relink';
      const client = getOAuthClientType();
      const { authUrl, client: resolvedClient } = await startNotionCalendarLink(client);
      notionOAuthClientRef.current = resolvedClient || client;
      if (Platform.OS === 'web') {
        await openNotionAuthOnWeb(authUrl);
        return;
      }
      await Linking.openURL(authUrl);
    } catch (error) {
      notionLinkModeRef.current = 'connect';
      Alert.alert('Notion 권한 변경 실패', error?.message || 'Notion 인증 화면을 열지 못했습니다.');
    } finally {
      setNotionAction(null);
    }
  };

  const handleExport = async (scope = 'all') => {
    try {
      const status = await refreshNotionStatus?.().catch(() => null);
      if (!status?.linked && !notionConnected) {
        await handleConnectNotion();
        return;
      }
      if (!status?.calendarConfigured) {
        await openNotionTargetModal();
        return;
      }

      setNotionAction(scope === 'workspace' ? 'sync-workspace' : 'sync-all');
      const result = scope === 'workspace'
        ? await syncWorkspaceNotionCalendar(workspace?.id)
        : await syncNotionCalendar();
      Alert.alert('동기화 완료', getNotionSyncMessage(result));
    } catch (error) {
      Alert.alert('동기화 실패', error?.message || 'Notion 캘린더 동기화에 실패했습니다.');
    } finally {
      setNotionAction(null);
    }
  };

  const handleUpdateTaskStatus = async (taskId, status) => {
    try {
      await updateCalendarTask(taskId, { status });
    } catch (error) {
      Alert.alert('변경 실패', error?.message || '할일 상태를 변경하지 못했습니다.');
    }
  };

  const handleUpdateTaskColor = (taskId, toneId) => {
    if (!SELECTABLE_TASK_TONES.some((tone) => tone.id === toneId)) return;
    setTaskColors((prev) => ({ ...prev, [String(taskId)]: toneId }));
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await deleteCalendarTask(taskId);
      setTaskColors((prev) => {
        const next = { ...prev };
        delete next[String(taskId)];
        return next;
      });
    } catch (error) {
      Alert.alert('삭제 실패', error?.message || '할일을 삭제하지 못했습니다.');
    }
  };

  const isNotionBusy = Boolean(notionAction);
  const isConnectingNotion = ['connect', 'link'].includes(notionAction) || isNotionStatusLoading;
  const isReconnectingNotion = notionAction === 'relink';
  const isSyncingWorkspace = notionAction === 'sync-workspace';
  const isSyncingAll = notionAction === 'sync-all';
  const isConfiguringNotionTarget = isNotionTargetLoading || isNotionTargetSaving;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        )}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>캘린더</Text>
          <View style={styles.headerActions}>
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>할일 {calendarTasks.length} · 일정 {calendarEvents.length}</Text>
            </View>
            <TouchableOpacity style={styles.addEventBtn} onPress={() => openEventModal()} activeOpacity={0.82}>
              <Ionicons name="add" size={21} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.workspacePanel}>
          <View style={styles.workspacePanelTop}>
            <View style={styles.workspaceTitleWrap}>
              <Text style={styles.workspaceLabel}>현재 워크스페이스</Text>
              <Text style={styles.workspaceName} numberOfLines={1}>{workspace?.name || '선택된 워크스페이스 없음'}</Text>
            </View>
            {switchingWorkspaceId ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.workspaceChipRow}>
            {workspaces.map((item) => {
              const isActive = String(item.id) === String(workspace?.id);
              const isSwitching = String(item.id) === String(switchingWorkspaceId);
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.workspaceChip, isActive && styles.workspaceChipActive]}
                  onPress={() => handleSelectWorkspace(item.id)}
                  activeOpacity={0.82}
                  disabled={Boolean(switchingWorkspaceId)}
                >
                  {isActive ? <Ionicons name="checkmark-circle" size={15} color={COLORS.primary} /> : null}
                  <Text style={[styles.workspaceChipText, isActive && styles.workspaceChipTextActive]} numberOfLines={1}>
                    {isSwitching ? '변경 중' : item.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.notionCard}>
          <View style={styles.notionTop}>
            <View style={styles.notionIconWrap}>
              <Ionicons name="calendar-clear-outline" size={22} color={COLORS.primary} />
            </View>
            <View style={styles.notionCopy}>
              <Text style={styles.notionTitle}>{notionConnected ? 'Notion 연결됨' : 'Notion 연결 대기'}</Text>
              <Text style={styles.notionDesc}>
                {notionConnected
                  ? (notionStatus?.calendarConfigured
                    ? `${notionStatus?.calendarName || '캘린더 페이지'}로 내보냅니다.`
                    : '동기화할 Notion 캘린더를 선택해주세요.')
                  : '계정을 승인하면 워크스페이스 일정을 Notion 캘린더와 동기화합니다.'}
              </Text>
            </View>
          </View>
          {!notionConnected ? (
            <TouchableOpacity
              style={[styles.notionBtn, isConnectingNotion && styles.disabledButton]}
              onPress={() => handleExport('all')}
              activeOpacity={0.85}
              disabled={isConnectingNotion}
            >
              {isConnectingNotion ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="open-outline" size={18} color="#FFFFFF" />}
              <Text style={styles.notionBtnText}>{isConnectingNotion ? '연결 중' : 'Notion 연결하기'}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.notionActionGrid}>
              <TouchableOpacity style={[styles.notionSmallBtn, isNotionBusy && styles.disabledButton]} onPress={() => handleExport('workspace')} activeOpacity={0.85} disabled={isNotionBusy}>
                {isSyncingWorkspace ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="cloud-upload-outline" size={17} color="#FFFFFF" />}
                <Text style={styles.notionSmallBtnText}>{isSyncingWorkspace ? '내보내는 중' : '현재 워크스페이스'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.notionSmallBtn, styles.notionBtnConnected, isNotionBusy && styles.disabledButton]} onPress={() => handleExport('all')} activeOpacity={0.85} disabled={isNotionBusy}>
                {isSyncingAll ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="cloud-upload-outline" size={17} color="#FFFFFF" />}
                <Text style={styles.notionSmallBtnText}>{isSyncingAll ? '내보내는 중' : '전체 워크스페이스'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.notionOutlineBtn, (isNotionBusy || isConfiguringNotionTarget) && styles.disabledButton]} onPress={openNotionTargetModal} activeOpacity={0.85} disabled={isNotionBusy || isConfiguringNotionTarget}>
                {isConfiguringNotionTarget ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="albums-outline" size={17} color={COLORS.primary} />}
                <Text style={styles.notionOutlineBtnText}>{isConfiguringNotionTarget ? '불러오는 중' : '캘린더 선택/변경'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.notionOutlineBtn, isNotionBusy && styles.disabledButton]} onPress={handleReconnectNotion} activeOpacity={0.85} disabled={isNotionBusy}>
                {isReconnectingNotion ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="open-outline" size={17} color={COLORS.primary} />}
                <Text style={styles.notionOutlineBtnText}>{isReconnectingNotion ? '권한 여는 중' : 'Notion 권한 다시 선택'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.monthCalendar}>
          <View style={styles.monthHeader}>
            <Text style={styles.monthTitle}>{getMonthTitle(viewMonth)}</Text>
            <View style={styles.monthNav}>
              <TouchableOpacity
                style={styles.monthNavBtn}
                onPress={() => setViewMonth((current) => addMonths(current, -1))}
                activeOpacity={0.8}
              >
                <Ionicons name="chevron-back" size={24} color={COLORS.subtext} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.monthNavBtn}
                onPress={() => setViewMonth((current) => addMonths(current, 1))}
                activeOpacity={0.8}
              >
                <Ionicons name="chevron-forward" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAY_LABELS.map((label) => (
              <Text key={label} style={styles.weekLabel}>{label}</Text>
            ))}
          </View>

          <View style={styles.monthGrid}>
            {monthDays.map((day) => {
              const dayTasks = tasksByDate[day.key] || [];
              const dayEvents = eventsByDate[day.key] || [];
              const weekday = day.date.getDay();
              return (
                <TouchableOpacity
                  key={day.key}
                  style={[
                    styles.dayCell,
                    !day.isCurrentMonth && styles.outsideDayCell,
                    selectedDateKey === day.key && styles.selectedDayCell,
                  ]}
                  onPress={() => setSelectedDateKey(day.key)}
                  activeOpacity={0.78}
                >
                  <View style={[styles.dayNumberWrap, day.isToday && styles.todayNumberWrap]}>
                    <Text
                      style={[
                        styles.dayNumber,
                        weekday === 0 && styles.sundayText,
                        weekday === 6 && styles.saturdayText,
                        !day.isCurrentMonth && styles.outsideDayText,
                        day.isToday && styles.todayNumberText,
                      ]}
                    >
                      {day.date.getDate()}
                    </Text>
                  </View>
                  <View style={styles.dayTaskList}>
                    {dayEvents.slice(0, 2).map((event) => (
                      <View
                        key={`event-${event.id}`}
                        style={[
                          styles.dayTaskPill,
                          styles.dayEventPill,
                          { backgroundColor: EVENT_TONE.background, borderLeftColor: EVENT_TONE.border },
                        ]}
                      >
                        <Text style={[styles.dayTaskText, { color: EVENT_TONE.text }]} numberOfLines={1}>
                          {event.title}
                        </Text>
                      </View>
                    ))}
                    {dayTasks.slice(0, 3).map((task, index) => {
                      const tone = getTaskTone(task, index, taskColors);
                      return (
                        <View
                          key={task.id}
                          style={[
                            styles.dayTaskPill,
                            { backgroundColor: tone.background, borderLeftColor: tone.border },
                          ]}
                        >
                          <Text style={[styles.dayTaskText, { color: tone.text }]} numberOfLines={1}>
                            {task.title}
                          </Text>
                        </View>
                      );
                    })}
                    {dayTasks.length + dayEvents.length > 5 ? (
                      <Text style={styles.moreTasksText}>+{dayTasks.length + dayEvents.length - 5}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.monthTasksSection}>
          <View style={styles.monthTasksToggle}>
            <View style={styles.monthTasksToggleText}>
              <Text style={styles.sectionTitle}>{viewMonth.getMonth() + 1}월 일정</Text>
              <Text style={styles.sectionCount}>{monthEvents.length}개</Text>
            </View>
            <TouchableOpacity style={styles.inlineAddBtn} onPress={() => openEventModal(`${viewMonthKey}-01`)} activeOpacity={0.82}>
              <Ionicons name="add" size={17} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
          {monthEvents.length === 0 ? (
            <EmptyState text="이번 달 등록된 일정이 없습니다." />
          ) : (
            <View style={styles.monthTaskList}>
              {monthEvents.map((event) => (
                <EventDetailItem key={event.id} event={event} onDelete={handleDeleteEvent} />
              ))}
            </View>
          )}
        </View>

        <View style={styles.monthTasksSection}>
          <TouchableOpacity
            style={styles.monthTasksToggle}
            onPress={() => setIsMonthTasksOpen((current) => !current)}
            activeOpacity={0.82}
          >
            <View style={styles.monthTasksToggleText}>
              <Text style={styles.sectionTitle}>{viewMonth.getMonth() + 1}월 해야 할 일 전체보기</Text>
              <Text style={styles.sectionCount}>{monthTasks.length}개</Text>
            </View>
            <Ionicons name={isMonthTasksOpen ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.subtext} />
          </TouchableOpacity>

          {isMonthTasksOpen ? (
            monthTasks.length === 0 ? (
              <EmptyState text="이번 달 마감 할일이 없습니다." />
            ) : (
              <View style={styles.monthTaskList}>
                {monthTasks.map((task, index) => (
                  <TaskDetailItem
                    key={task.id}
                    task={task}
                    toneIndex={index}
                    taskColors={taskColors}
                    onStatusChange={handleUpdateTaskStatus}
                    onColorChange={handleUpdateTaskColor}
                    onDelete={handleDeleteTask}
                  />
                ))}
              </View>
            )
          ) : null}
        </View>
      </ScrollView>

      <Modal
        visible={Boolean(selectedDateKey)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedDateKey(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedDateKey(null)}
        >
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{selectedDateKey ? getDateLabel(selectedDateKey) : ''}</Text>
                <Text style={styles.modalSubtitle}>일정 {selectedDayEvents.length}개 · 할일 {selectedDayTasks.length}개</Text>
              </View>
              <View style={styles.modalHeaderActions}>
                <TouchableOpacity style={styles.modalCloseBtn} onPress={() => openEventModal(selectedDateKey)}>
                  <Ionicons name="add" size={20} color={COLORS.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setSelectedDateKey(null)}>
                  <Ionicons name="close" size={20} color={COLORS.subtext} />
                </TouchableOpacity>
              </View>
            </View>

            {selectedDayTasks.length === 0 && selectedDayEvents.length === 0 ? (
              <EmptyState text="이 날짜에 등록된 일정과 할일이 없습니다." />
            ) : (
              <ScrollView
                style={styles.modalTaskScroll}
                contentContainerStyle={styles.modalTaskScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {selectedDayEvents.map((event) => (
                  <EventDetailItem key={event.id} event={event} variant="modal" onDelete={handleDeleteEvent} />
                ))}
                {selectedDayTasks.map((task, index) => (
                  <TaskDetailItem
                    key={task.id}
                    task={task}
                    toneIndex={index}
                    variant="modal"
                    taskColors={taskColors}
                    onStatusChange={handleUpdateTaskStatus}
                    onColorChange={handleUpdateTaskColor}
                    onDelete={handleDeleteTask}
                  />
                ))}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={isNotionTargetModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsNotionTargetModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.formModalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleWrap}>
                <Text style={styles.modalTitle}>Notion 캘린더 선택</Text>
                <Text style={styles.modalSubtitle}>Name·Date 속성이 있는 데이터베이스를 권장합니다.</Text>
              </View>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setIsNotionTargetModalOpen(false)} disabled={isNotionTargetSaving}>
                <Ionicons name="close" size={20} color={COLORS.subtext} />
              </TouchableOpacity>
            </View>

            {isNotionTargetLoading ? (
              <View style={styles.notionTargetLoading}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.notionTargetLoadingText}>Notion 캘린더를 불러오는 중</Text>
              </View>
            ) : notionCalendarTargets.length ? (
              <ScrollView style={styles.notionTargetList} contentContainerStyle={styles.notionTargetListContent} showsVerticalScrollIndicator={false}>
                {notionCalendarTargets.map((target) => {
                  const targetKey = getNotionTargetKey(target);
                  const isSelected = targetKey === selectedNotionTargetKey;
                  return (
                    <TouchableOpacity
                      key={targetKey}
                      style={[styles.notionTargetRow, isSelected && styles.notionTargetRowActive]}
                      onPress={() => setSelectedNotionTargetKey(targetKey)}
                      activeOpacity={0.82}
                      disabled={isNotionTargetSaving}
                    >
                      <Ionicons name={isSelected ? 'radio-button-on' : 'radio-button-off'} size={20} color={isSelected ? COLORS.primary : COLORS.border} />
                      <View style={styles.notionTargetTextWrap}>
                        <Text style={styles.notionTargetName} numberOfLines={1}>{target.name}</Text>
                        <Text style={styles.notionTargetMeta} numberOfLines={1}>{target.url || target.id}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={styles.notionTargetEmpty}>
                <Ionicons name="albums-outline" size={34} color={COLORS.border} />
                <Text style={styles.notionTargetEmptyText}>접근 가능한 Notion 데이터베이스가 없습니다.</Text>
              </View>
            )}

            <View style={styles.notionTargetActions}>
              <TouchableOpacity
                style={[styles.notionTargetCreateBtn, isNotionTargetSaving && styles.disabledButton]}
                onPress={handleCreateNotionTarget}
                activeOpacity={0.85}
                disabled={isNotionTargetSaving}
              >
                {isNotionTargetSaving ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="add" size={18} color={COLORS.primary} />}
                <Text style={styles.notionTargetCreateText}>새 Meno 캘린더 만들기</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.formSubmitBtn,
                  (!selectedNotionTargetKey || isNotionTargetSaving || isNotionTargetLoading) && styles.disabledButton,
                ]}
                onPress={handleSaveNotionTarget}
                activeOpacity={0.85}
                disabled={!selectedNotionTargetKey || isNotionTargetSaving || isNotionTargetLoading}
              >
                {isNotionTargetSaving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
                <Text style={styles.formSubmitText}>선택한 캘린더 연결</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isEventModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsEventModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.formModalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>일정 추가</Text>
                <Text style={styles.modalSubtitle}>{eventForm.date}</Text>
              </View>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setIsEventModalOpen(false)}>
                <Ionicons name="close" size={20} color={COLORS.subtext} />
              </TouchableOpacity>
            </View>
            <TextInput style={styles.formInput} value={eventForm.title} onChangeText={(title) => setEventForm((prev) => ({ ...prev, title }))} placeholder="일정 제목" placeholderTextColor={COLORS.placeholder} />
            <View style={styles.formRow}>
              <TextInput style={[styles.formInput, styles.formInputHalf]} value={eventForm.date} onChangeText={(date) => setEventForm((prev) => ({ ...prev, date }))} placeholder="YYYY-MM-DD" placeholderTextColor={COLORS.placeholder} />
              <TextInput style={[styles.formInput, styles.formInputHalf]} value={eventForm.location} onChangeText={(location) => setEventForm((prev) => ({ ...prev, location }))} placeholder="장소" placeholderTextColor={COLORS.placeholder} />
            </View>
            <View style={styles.formRow}>
              <TextInput style={[styles.formInput, styles.formInputHalf]} value={eventForm.startTime} onChangeText={(startTime) => setEventForm((prev) => ({ ...prev, startTime }))} placeholder="시작 HH:mm" placeholderTextColor={COLORS.placeholder} />
              <TextInput style={[styles.formInput, styles.formInputHalf]} value={eventForm.endTime} onChangeText={(endTime) => setEventForm((prev) => ({ ...prev, endTime }))} placeholder="종료 HH:mm" placeholderTextColor={COLORS.placeholder} />
            </View>
            <TextInput style={[styles.formInput, styles.formTextArea]} value={eventForm.description} onChangeText={(description) => setEventForm((prev) => ({ ...prev, description }))} placeholder="메모" placeholderTextColor={COLORS.placeholder} multiline />
            <TouchableOpacity style={[styles.formSubmitBtn, isEventSaving && styles.disabledButton]} onPress={handleSaveEvent} activeOpacity={0.85} disabled={isEventSaving}>
              {isEventSaving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
              <Text style={styles.formSubmitText}>{isEventSaving ? '저장 중' : '일정 저장'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

function TaskDetailItem({ task, toneIndex = 0, variant = 'list', taskColors = {}, onStatusChange, onColorChange, onDelete }) {
  const tone = getTaskTone(task, toneIndex, taskColors);
  const dateKey = getTaskDateKey(task);
  const isDone = task.statusCode === 'DONE';
  const activeToneId = isDone ? DONE_TASK_TONE.id : tone.id;
  const palette = isDone ? [DONE_TASK_TONE] : SELECTABLE_TASK_TONES;

  return (
    <View
      style={[
        styles.taskItem,
        variant === 'modal' && styles.modalTaskItem,
        { borderLeftColor: tone.border },
      ]}
    >
      <View style={styles.taskContent}>
        <View style={styles.taskTitleRow}>
          <Text style={styles.taskTitle} numberOfLines={2}>{task.title}</Text>
          <View style={[styles.statusChip, { backgroundColor: tone.background }]}>
            <Text style={[styles.statusChipText, { color: tone.text }]}>{getStatusLabel(task.statusCode)}</Text>
          </View>
        </View>
        <Text style={styles.taskMeta} numberOfLines={1}>
          {dateKey || '마감일 미정'} · {task.assignee || '담당자 미정'} · {task.source || '할일'}
        </Text>
        <View style={styles.statusRow}>
          {STATUS_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.code}
              style={[
                styles.statusBtn,
                task.statusCode === option.code && styles.statusBtnActive,
                task.statusCode === option.code && { backgroundColor: tone.background },
              ]}
              onPress={() => onStatusChange(task.id, option.code)}
              activeOpacity={0.8}
            >
              <Text style={[
                styles.statusBtnText,
                task.statusCode === option.code && styles.statusBtnTextActive,
                task.statusCode === option.code && { color: tone.text },
              ]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.colorRow}>
          {palette.map((option) => {
            const isActive = activeToneId === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: option.background, borderColor: isActive ? option.text : option.border },
                  isActive && styles.colorSwatchActive,
                ]}
                onPress={() => onColorChange?.(task.id, option.id)}
                activeOpacity={0.76}
                disabled={isDone}
                accessibilityRole="button"
                accessibilityLabel={`task-color-${option.id}`}
              >
                {isActive ? <Ionicons name="checkmark" size={12} color={option.text} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(task.id)} activeOpacity={0.8}>
        <Ionicons name="trash-outline" size={15} color={COLORS.error} />
      </TouchableOpacity>
    </View>
  );
}

function EventDetailItem({ event, variant = 'list', onDelete }) {
  return (
    <View style={[styles.eventItem, variant === 'modal' && styles.modalTaskItem]}>
      <View style={styles.eventIconWrap}>
        <Ionicons name="calendar-clear-outline" size={18} color={EVENT_TONE.text} />
      </View>
      <View style={styles.taskContent}>
        <View style={styles.taskTitleRow}>
          <Text style={styles.taskTitle} numberOfLines={2}>{event.title}</Text>
          <View style={[styles.statusChip, { backgroundColor: EVENT_TONE.background }]}>
            <Text style={[styles.statusChipText, { color: EVENT_TONE.text }]}>일정</Text>
          </View>
        </View>
        <Text style={styles.taskMeta} numberOfLines={1}>
          {[formatEventTime(event), event.location].filter(Boolean).join(' · ')}
        </Text>
        {event.description ? <Text style={styles.eventDescription} numberOfLines={2}>{event.description}</Text> : null}
      </View>
      <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(event.id)} activeOpacity={0.8}>
        <Ionicons name="trash-outline" size={15} color={COLORS.error} />
      </TouchableOpacity>
    </View>
  );
}

function EmptyState({ text }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name="calendar-outline" size={34} color={COLORS.border} />
      <Text style={styles.emptyStateText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text, letterSpacing: 0 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerBadge: { backgroundColor: COLORS.chip, borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 5 },
  headerBadgeText: { color: COLORS.chipText, fontWeight: '700', fontSize: 12 },
  addEventBtn: { width: 34, height: 34, borderRadius: RADIUS.sm, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  workspacePanel: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  workspacePanelTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  workspaceTitleWrap: { flex: 1, minWidth: 0 },
  workspaceLabel: { fontSize: 11, fontWeight: '800', color: COLORS.primary, letterSpacing: 0 },
  workspaceName: { fontSize: 17, fontWeight: '800', color: COLORS.text, marginTop: 3, letterSpacing: 0 },
  workspaceChipRow: { gap: 8, paddingTop: 12, paddingRight: 2 },
  workspaceChip: { minHeight: 36, maxWidth: 180, borderRadius: RADIUS.sm, backgroundColor: COLORS.inputBg, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 5 },
  workspaceChipActive: { backgroundColor: COLORS.chip, borderWidth: 1, borderColor: COLORS.primary },
  workspaceChipText: { fontSize: 12, color: COLORS.subtext, fontWeight: '800', letterSpacing: 0 },
  workspaceChipTextActive: { color: COLORS.primary },
  notionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
  },
  notionTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  notionIconWrap: { width: 46, height: 46, borderRadius: RADIUS.md, backgroundColor: COLORS.chip, alignItems: 'center', justifyContent: 'center' },
  notionCopy: { flex: 1 },
  notionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, letterSpacing: 0 },
  notionDesc: { fontSize: 12, color: COLORS.subtext, lineHeight: 18, marginTop: 3 },
  notionBtn: { marginTop: 16, minHeight: 48, borderRadius: 8, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  notionBtnConnected: { backgroundColor: COLORS.secondary },
  notionBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15, letterSpacing: 0 },
  notionActionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  notionSmallBtn: { flexGrow: 1, minWidth: '48%', minHeight: 44, borderRadius: 8, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
  notionSmallBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12, letterSpacing: 0 },
  notionOutlineBtn: { flexBasis: '100%', minHeight: 42, borderRadius: 8, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
  notionOutlineBtnText: { color: COLORS.primary, fontWeight: '800', fontSize: 13, letterSpacing: 0 },
  disabledButton: { opacity: 0.7 },
  monthCalendar: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingTop: 18,
    paddingBottom: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  monthTitle: { fontSize: 26, fontWeight: '800', color: '#020617', letterSpacing: 0 },
  monthNav: { flexDirection: 'row', gap: 10 },
  monthNavBtn: { width: 48, height: 48, borderRadius: RADIUS.md, backgroundColor: COLORS.inputBg, alignItems: 'center', justifyContent: 'center' },
  weekRow: { flexDirection: 'row', marginBottom: 8 },
  weekLabel: { width: `${100 / 7}%`, textAlign: 'center', color: '#8C8C8C', fontSize: 15, fontWeight: '700', letterSpacing: 0 },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, minHeight: 92, paddingHorizontal: 2, paddingTop: 5, borderRadius: 6 },
  outsideDayCell: { opacity: 0.42 },
  selectedDayCell: { backgroundColor: COLORS.panel },
  dayNumberWrap: { height: 25, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', minWidth: 25, borderRadius: 13 },
  todayNumberWrap: { backgroundColor: '#2EA9E8' },
  dayNumber: { fontSize: 18, fontWeight: '700', color: '#0F172A', letterSpacing: 0 },
  sundayText: { color: '#D64B44' },
  saturdayText: { color: '#1F83B5' },
  outsideDayText: { color: '#A3A3A3' },
  todayNumberText: { color: '#FFFFFF' },
  dayTaskList: { marginTop: 5, gap: 3 },
  dayTaskPill: { minHeight: 20, borderRadius: 4, borderLeftWidth: 4, justifyContent: 'center', paddingLeft: 3, paddingRight: 2 },
  dayEventPill: { borderStyle: 'solid' },
  dayTaskText: { fontSize: 9, fontWeight: '800', letterSpacing: 0 },
  moreTasksText: { fontSize: 9, color: COLORS.subtext, fontWeight: '700', textAlign: 'center', marginTop: 1 },
  monthTasksSection: { marginBottom: 10 },
  monthTasksToggle: { minHeight: 54, borderRadius: 8, backgroundColor: COLORS.surface, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthTasksToggleText: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flex: 1 },
  inlineAddBtn: { width: 34, height: 34, borderRadius: RADIUS.sm, backgroundColor: COLORS.chip, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, letterSpacing: 0 },
  sectionCount: { fontSize: 12, color: COLORS.subtext, fontWeight: '700' },
  monthTaskList: { marginTop: 10, gap: 10 },
  taskItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderLeftWidth: 5,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  eventItem: { backgroundColor: COLORS.surface, borderRadius: 8, borderLeftWidth: 5, borderLeftColor: EVENT_TONE.border, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  eventIconWrap: { width: 34, height: 34, borderRadius: 8, backgroundColor: EVENT_TONE.background, alignItems: 'center', justifyContent: 'center' },
  eventDescription: { fontSize: 12, color: COLORS.text, lineHeight: 17, marginTop: 7, letterSpacing: 0 },
  modalTaskItem: { backgroundColor: COLORS.panel, shadowOpacity: 0, elevation: 0 },
  taskContent: { flex: 1, minWidth: 0 },
  taskTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  taskTitle: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '800', color: COLORS.text, letterSpacing: 0 },
  statusChip: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  statusChipText: { fontSize: 10, fontWeight: '800', letterSpacing: 0 },
  taskMeta: { fontSize: 11, color: COLORS.subtext, marginTop: 6, letterSpacing: 0 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  statusBtn: { borderRadius: RADIUS.xs, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: COLORS.inputBg },
  statusBtnActive: { backgroundColor: COLORS.chip },
  statusBtnText: { fontSize: 11, color: COLORS.subtext, fontWeight: '800', letterSpacing: 0 },
  statusBtnTextActive: { color: COLORS.primary },
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10 },
  colorSwatch: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  colorSwatchActive: { borderWidth: 3 },
  deleteBtn: { width: 34, height: 34, borderRadius: RADIUS.sm, backgroundColor: COLORS.errorSoft, alignItems: 'center', justifyContent: 'center' },
  emptyState: { backgroundColor: COLORS.surface, borderRadius: 8, paddingVertical: 26, paddingHorizontal: 18, alignItems: 'center', marginTop: 10 },
  emptyStateText: { color: COLORS.subtext, fontSize: 13, fontWeight: '700', marginTop: 8, textAlign: 'center', letterSpacing: 0 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.36)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  modalCard: { width: '100%', maxHeight: '74%', backgroundColor: 'rgba(255, 255, 255, 0.94)', borderRadius: 8, padding: 18, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.9)' },
  formModalCard: { width: '100%', maxWidth: 560, maxHeight: '86%', backgroundColor: COLORS.surface, borderRadius: 8, padding: 18, borderWidth: 1, borderColor: COLORS.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  modalHeaderActions: { flexDirection: 'row', gap: 8 },
  modalTitleWrap: { flex: 1, minWidth: 0 },
  modalTitle: { fontSize: 22, fontWeight: '900', color: '#020617', letterSpacing: 0 },
  modalSubtitle: { fontSize: 12, color: COLORS.subtext, fontWeight: '700', marginTop: 5 },
  modalCloseBtn: { width: 34, height: 34, borderRadius: RADIUS.sm, backgroundColor: COLORS.inputBg, alignItems: 'center', justifyContent: 'center' },
  modalTaskScroll: { maxHeight: 420 },
  modalTaskScrollContent: { gap: 10, paddingBottom: 2 },
  notionTargetLoading: { minHeight: 154, alignItems: 'center', justifyContent: 'center', gap: 10 },
  notionTargetLoadingText: { fontSize: 13, color: COLORS.subtext, fontWeight: '700', letterSpacing: 0 },
  notionTargetList: { maxHeight: 300, marginBottom: 14 },
  notionTargetListContent: { gap: 8, paddingBottom: 2 },
  notionTargetRow: { minHeight: 58, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  notionTargetRowActive: { borderColor: COLORS.primary, backgroundColor: COLORS.chip },
  notionTargetTextWrap: { flex: 1, minWidth: 0 },
  notionTargetName: { fontSize: 14, fontWeight: '800', color: COLORS.text, letterSpacing: 0 },
  notionTargetMeta: { fontSize: 11, color: COLORS.subtext, marginTop: 3, letterSpacing: 0 },
  notionTargetEmpty: { minHeight: 154, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: RADIUS.md, backgroundColor: COLORS.panel, marginBottom: 14 },
  notionTargetEmptyText: { fontSize: 13, color: COLORS.subtext, fontWeight: '700', textAlign: 'center', letterSpacing: 0 },
  notionTargetActions: { gap: 8 },
  notionTargetCreateBtn: { minHeight: 46, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12 },
  notionTargetCreateText: { color: COLORS.primary, fontSize: 14, fontWeight: '800', letterSpacing: 0 },
  formInput: { minHeight: 46, borderRadius: RADIUS.md, backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, color: COLORS.text, fontSize: 14, fontWeight: '600', letterSpacing: 0, marginBottom: 10 },
  formInputHalf: { flex: 1, marginBottom: 0 },
  formTextArea: { minHeight: 84, paddingTop: 12, textAlignVertical: 'top' },
  formRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  formSubmitBtn: { minHeight: 46, borderRadius: 8, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12 },
  formSubmitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 0 },
});
