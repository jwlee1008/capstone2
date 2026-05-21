import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAppContext } from '../context/AppContext';
import { persistentStorage } from '../services/api';
import { COLORS } from '../theme';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const CALENDAR_VIEW_MONTH_KEY = 'calendarViewMonth';

const STATUS_OPTIONS = [
  { code: 'TODO', label: '할일' },
  { code: 'IN_PROGRESS', label: '진행중' },
  { code: 'DONE', label: '완료' },
];

const TASK_TONES = [
  { background: '#EEF2FF', border: '#8B91F8', text: '#4F46E5' },
  { background: '#FFF7E6', border: '#F5C451', text: '#946A22' },
  { background: '#EAF5FF', border: '#7CC4F8', text: '#2A6F9E' },
  { background: '#FDEAF2', border: '#E889A8', text: '#93465F' },
  { background: '#F0F1F5', border: '#9CA3AF', text: '#4B5563' },
  { background: '#ECFDF5', border: '#6EE7B7', text: '#047857' },
];

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

function getTaskTone(task, index = 0) {
  if (task?.statusCode === 'DONE') return TASK_TONES[4];
  if (task?.statusCode === 'IN_PROGRESS') return TASK_TONES[2];

  const seed = String(task?.id || task?.title || index);
  const hash = seed.split('').reduce((sum, char) => sum + char.charCodeAt(0), index);
  return TASK_TONES[Math.abs(hash) % TASK_TONES.length];
}

function getStatusLabel(statusCode) {
  return STATUS_OPTIONS.find((option) => option.code === statusCode)?.label || '할일';
}

export default function CalendarScreen() {
  const {
    calendarTasks,
    notionConnected,
    workspace,
    workspaces,
    selectWorkspace,
    refreshWorkspaceData,
    startNotionCalendarLink,
    completeNotionCalendarLink,
    syncNotionCalendar,
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

  useFocusEffect(useCallback(() => {
    refreshWorkspaceData?.().catch(() => {});
  }, [workspace?.id]));

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

  const completeNotionFromUrl = useCallback(async (url) => {
    const error = getUrlParam(url, 'error');
    if (error) {
      Alert.alert('Notion 연결 실패', 'Notion 연결이 취소되었거나 승인되지 않았습니다.');
      return false;
    }

    const code = getUrlParam(url, 'code');
    if (!code) return false;

    try {
      setNotionAction('link');
      await completeNotionCalendarLink(code);
      Alert.alert('Notion 연결 완료', 'Notion 캘린더 연결이 완료되었습니다.');
      return true;
    } catch (connectError) {
      Alert.alert('Notion 연결 실패', connectError?.message || 'Notion 계정을 연결하지 못했습니다.');
      return false;
    } finally {
      setNotionAction(null);
    }
  }, [completeNotionCalendarLink]);

  useEffect(() => {
    let isMounted = true;
    const subscription = Linking.addEventListener('url', ({ url }) => {
      completeNotionFromUrl(url);
    });

    Linking.getInitialURL().then((url) => {
      if (isMounted && url) completeNotionFromUrl(url);
    }).catch(() => {});

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [completeNotionFromUrl]);

  const handleConnectNotion = async () => {
    try {
      setNotionAction('connect');
      const { authUrl } = await startNotionCalendarLink();
      await Linking.openURL(authUrl);
    } catch (error) {
      Alert.alert('Notion 연결 실패', error?.message || 'Notion 인증 화면을 열지 못했습니다.');
    } finally {
      setNotionAction(null);
    }
  };

  const handleExport = async () => {
    if (!notionConnected) {
      await handleConnectNotion();
      return;
    }

    try {
      setNotionAction('sync');
      await syncNotionCalendar();
      Alert.alert('동기화 완료', 'Notion 캘린더와 동기화했습니다.');
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

  const handleDeleteTask = async (taskId) => {
    try {
      await deleteCalendarTask(taskId);
    } catch (error) {
      Alert.alert('삭제 실패', error?.message || '할일을 삭제하지 못했습니다.');
    }
  };

  const isNotionBusy = Boolean(notionAction);
  const notionButtonLabel = notionConnected ? 'Notion 동기화' : 'Notion 연결하기';

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
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>할일 {calendarTasks.length}개</Text>
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
              <Text style={styles.notionDesc}>계정을 승인하면 앱에서 Notion 연결 상태를 관리할 수 있습니다.</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.notionBtn, notionConnected && styles.notionBtnConnected, isNotionBusy && styles.disabledButton]}
            onPress={handleExport}
            activeOpacity={0.85}
            disabled={isNotionBusy}
          >
            {isNotionBusy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name={notionConnected ? 'cloud-upload-outline' : 'link-outline'} size={18} color="#FFFFFF" />
            )}
            <Text style={styles.notionBtnText}>{isNotionBusy ? '처리 중' : notionButtonLabel}</Text>
          </TouchableOpacity>
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
                    {dayTasks.slice(0, 3).map((task, index) => {
                      const tone = getTaskTone(task, index);
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
                    {dayTasks.length > 3 ? (
                      <Text style={styles.moreTasksText}>+{dayTasks.length - 3}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
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
                    onStatusChange={handleUpdateTaskStatus}
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
                <Text style={styles.modalSubtitle}>{selectedDayTasks.length}개 할일</Text>
              </View>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setSelectedDateKey(null)}>
                <Ionicons name="close" size={20} color={COLORS.subtext} />
              </TouchableOpacity>
            </View>

            {selectedDayTasks.length === 0 ? (
              <EmptyState text="이 날짜에 등록된 할일이 없습니다." />
            ) : (
              <ScrollView
                style={styles.modalTaskScroll}
                contentContainerStyle={styles.modalTaskScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {selectedDayTasks.map((task, index) => (
                  <TaskDetailItem
                    key={task.id}
                    task={task}
                    toneIndex={index}
                    variant="modal"
                    onStatusChange={handleUpdateTaskStatus}
                    onDelete={handleDeleteTask}
                  />
                ))}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function TaskDetailItem({ task, toneIndex = 0, variant = 'list', onStatusChange, onDelete }) {
  const tone = getTaskTone(task, toneIndex);
  const dateKey = getTaskDateKey(task);

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
              style={[styles.statusBtn, task.statusCode === option.code && styles.statusBtnActive]}
              onPress={() => onStatusChange(task.id, option.code)}
              activeOpacity={0.8}
            >
              <Text style={[styles.statusBtnText, task.statusCode === option.code && styles.statusBtnTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(task.id)} activeOpacity={0.8}>
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
  headerBadge: { backgroundColor: '#EEF2FF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  headerBadgeText: { color: COLORS.primary, fontWeight: '700', fontSize: 12 },
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
  workspaceChip: { minHeight: 36, maxWidth: 180, borderRadius: 8, backgroundColor: '#F1F5F9', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 5 },
  workspaceChipActive: { backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: COLORS.primary },
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
  notionIconWrap: { width: 46, height: 46, borderRadius: 8, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  notionCopy: { flex: 1 },
  notionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, letterSpacing: 0 },
  notionDesc: { fontSize: 12, color: COLORS.subtext, lineHeight: 18, marginTop: 3 },
  notionBtn: { marginTop: 16, minHeight: 48, borderRadius: 8, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  notionBtnConnected: { backgroundColor: COLORS.secondary },
  notionBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15, letterSpacing: 0 },
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
  monthNavBtn: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  weekRow: { flexDirection: 'row', marginBottom: 8 },
  weekLabel: { width: `${100 / 7}%`, textAlign: 'center', color: '#8C8C8C', fontSize: 15, fontWeight: '700', letterSpacing: 0 },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, minHeight: 92, paddingHorizontal: 2, paddingTop: 5, borderRadius: 6 },
  outsideDayCell: { opacity: 0.42 },
  selectedDayCell: { backgroundColor: '#F8FAFC' },
  dayNumberWrap: { height: 25, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', minWidth: 25, borderRadius: 13 },
  todayNumberWrap: { backgroundColor: '#2EA9E8' },
  dayNumber: { fontSize: 18, fontWeight: '700', color: '#0F172A', letterSpacing: 0 },
  sundayText: { color: '#D64B44' },
  saturdayText: { color: '#1F83B5' },
  outsideDayText: { color: '#A3A3A3' },
  todayNumberText: { color: '#FFFFFF' },
  dayTaskList: { marginTop: 5, gap: 3 },
  dayTaskPill: { minHeight: 20, borderRadius: 4, borderLeftWidth: 4, justifyContent: 'center', paddingLeft: 3, paddingRight: 2 },
  dayTaskText: { fontSize: 9, fontWeight: '800', letterSpacing: 0 },
  moreTasksText: { fontSize: 9, color: COLORS.subtext, fontWeight: '700', textAlign: 'center', marginTop: 1 },
  monthTasksSection: { marginBottom: 10 },
  monthTasksToggle: { minHeight: 54, borderRadius: 8, backgroundColor: COLORS.surface, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthTasksToggleText: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flex: 1 },
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
  modalTaskItem: { backgroundColor: '#F8FAFC', shadowOpacity: 0, elevation: 0 },
  taskContent: { flex: 1, minWidth: 0 },
  taskTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  taskTitle: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '800', color: COLORS.text, letterSpacing: 0 },
  statusChip: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  statusChipText: { fontSize: 10, fontWeight: '800', letterSpacing: 0 },
  taskMeta: { fontSize: 11, color: COLORS.subtext, marginTop: 6, letterSpacing: 0 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  statusBtn: { borderRadius: 6, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: '#F1F5F9' },
  statusBtnActive: { backgroundColor: '#EEF2FF' },
  statusBtnText: { fontSize: 11, color: COLORS.subtext, fontWeight: '800', letterSpacing: 0 },
  statusBtnTextActive: { color: COLORS.primary },
  deleteBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  emptyState: { backgroundColor: COLORS.surface, borderRadius: 8, paddingVertical: 26, paddingHorizontal: 18, alignItems: 'center', marginTop: 10 },
  emptyStateText: { color: COLORS.subtext, fontSize: 13, fontWeight: '700', marginTop: 8, textAlign: 'center', letterSpacing: 0 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.36)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  modalCard: { width: '100%', maxHeight: '74%', backgroundColor: 'rgba(255, 255, 255, 0.94)', borderRadius: 8, padding: 18, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.9)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  modalTitle: { fontSize: 22, fontWeight: '900', color: '#020617', letterSpacing: 0 },
  modalSubtitle: { fontSize: 12, color: COLORS.subtext, fontWeight: '700', marginTop: 5 },
  modalCloseBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  modalTaskScroll: { maxHeight: 420 },
  modalTaskScrollContent: { gap: 10, paddingBottom: 2 },
});
