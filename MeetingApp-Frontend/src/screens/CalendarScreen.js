import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAppContext } from '../context/AppContext';
import { COLORS } from '../theme';

const STATUS_OPTIONS = [
  { code: 'TODO', label: '등록됨' },
  { code: 'IN_PROGRESS', label: '진행중' },
  { code: 'DONE', label: '완료' },
];

function getUrlParam(url, key) {
  if (!url) return null;
  try {
    return new URL(url).searchParams.get(key);
  } catch {
    const query = String(url).split('?')[1]?.split('#')[0] || '';
    return new URLSearchParams(query).get(key);
  }
}

function formatEventPeriod(event) {
  if (!event.startAt && !event.date) return '일정 시간 미정';
  const start = event.startAt || event.date;
  const end = event.endAt ? ` ~ ${event.endAt}` : '';
  return `${start}${end}`;
}

export default function CalendarScreen() {
  const {
    calendarTasks,
    calendarEvents,
    taskStats,
    notionConnected,
    workspace,
    refreshWorkspaceData,
    startNotionCalendarLink,
    completeNotionCalendarLink,
    syncNotionCalendar,
    updateCalendarTask,
    deleteCalendarTask,
    addCalendarEvent,
    deleteCalendarEvent,
  } = useAppContext();
  const [eventForm, setEventForm] = useState({ title: '', date: '', startTime: '10:00', endTime: '11:00' });
  const [notionAction, setNotionAction] = useState(null);

  const localTaskStats = useMemo(() => calendarTasks.reduce((acc, task) => {
    acc.total += 1;
    if (task.statusCode === 'DONE') acc.done += 1;
    else if (task.statusCode === 'IN_PROGRESS') acc.inProgress += 1;
    else acc.todo += 1;
    return acc;
  }, { total: 0, todo: 0, inProgress: 0, done: 0 }), [calendarTasks]);

  const groupedTasks = useMemo(() => calendarTasks.reduce((acc, task) => {
    const key = task.dueDate || '마감일 미정';
    acc[key] = [...(acc[key] || []), task];
    return acc;
  }, {}), [calendarTasks]);

  useFocusEffect(useCallback(() => {
    refreshWorkspaceData?.().catch(() => {});
  }, [workspace?.id]));

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
      Alert.alert('내보내기 완료', 'Notion 캘린더로 일정을 내보냈습니다.');
    } catch (error) {
      Alert.alert('내보내기 실패', error?.message || 'Notion 캘린더 내보내기에 실패했습니다.');
    } finally {
      setNotionAction(null);
    }
  };

  const handleCreateEvent = async () => {
    if (!eventForm.title.trim() || !eventForm.date.trim()) {
      Alert.alert('입력 오류', '일정 제목과 날짜를 입력해주세요.');
      return;
    }

    try {
      await addCalendarEvent({
        title: eventForm.title.trim(),
        startAt: `${eventForm.date}T${eventForm.startTime || '10:00'}:00`,
        endAt: `${eventForm.date}T${eventForm.endTime || '11:00'}:00`,
      });
      setEventForm({ title: '', date: '', startTime: '10:00', endTime: '11:00' });
    } catch (error) {
      Alert.alert('등록 실패', error?.message || '일정을 등록하지 못했습니다.');
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

  const handleDeleteEvent = async (eventId) => {
    try {
      await deleteCalendarEvent(eventId);
    } catch (error) {
      Alert.alert('삭제 실패', error?.message || '일정을 삭제하지 못했습니다.');
    }
  };

  const isNotionBusy = Boolean(notionAction);
  const notionButtonLabel = notionConnected ? 'Notion으로 내보내기' : 'Notion 연결하기';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>캘린더</Text>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{calendarTasks.length + calendarEvents.length}개</Text>
          </View>
        </View>

        <View style={styles.notionCard}>
          <View style={styles.notionTop}>
            <View style={styles.notionIconWrap}>
              <Ionicons name="calendar-clear-outline" size={22} color={COLORS.primary} />
            </View>
            <View style={styles.notionCopy}>
              <Text style={styles.notionTitle}>{notionConnected ? 'Notion 연결됨' : 'Notion 연결 대기'}</Text>
              <Text style={styles.notionDesc}>Notion에서 허용한 캘린더로 일정을 내보냅니다.</Text>
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

        <View style={styles.statsRow}>
          <Stat label="전체" value={localTaskStats.total || taskStats.total || 0} />
          <Stat label="TODO" value={localTaskStats.todo} />
          <Stat label="진행" value={localTaskStats.inProgress} />
          <Stat label="완료" value={localTaskStats.done} />
        </View>

        <Text style={styles.sectionTitle}>일정</Text>
        <View style={styles.dayCard}>
          <TextInput
            style={styles.input}
            placeholder="일정 제목"
            value={eventForm.title}
            onChangeText={(title) => setEventForm((prev) => ({ ...prev, title }))}
          />
          <View style={styles.formRow}>
            <TextInput
              style={[styles.input, styles.formInput]}
              placeholder="2026-06-01"
              value={eventForm.date}
              onChangeText={(date) => setEventForm((prev) => ({ ...prev, date }))}
            />
            <TextInput
              style={[styles.input, styles.timeInput]}
              placeholder="10:00"
              value={eventForm.startTime}
              onChangeText={(startTime) => setEventForm((prev) => ({ ...prev, startTime }))}
            />
            <TextInput
              style={[styles.input, styles.timeInput]}
              placeholder="11:00"
              value={eventForm.endTime}
              onChangeText={(endTime) => setEventForm((prev) => ({ ...prev, endTime }))}
            />
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={handleCreateEvent}>
            <Text style={styles.addBtnText}>일정 등록</Text>
          </TouchableOpacity>
        </View>

        {calendarEvents.length === 0 ? (
          <Empty text="등록된 일정이 없어요" />
        ) : calendarEvents.map((event) => (
          <View key={event.id} style={styles.dayCard}>
            <View style={styles.eventRow}>
              <View style={styles.eventInfo}>
                <Text style={styles.taskTitle}>{event.title}</Text>
                <Text style={styles.taskMeta}>{formatEventPeriod(event)} · 관련 할일 {event.relatedTasks?.length || 0}개</Text>
              </View>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteEvent(event.id)}>
                <Ionicons name="trash-outline" size={14} color={COLORS.error} />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <Text style={styles.sectionTitle}>등록된 할일</Text>
        {calendarTasks.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={54} color={COLORS.border} />
            <Text style={styles.emptyTitle}>등록된 할일이 없어요</Text>
            <Text style={styles.emptyDesc}>회의 상세에서 제안된 할일을 검토하거나 직접 할일을 등록해보세요.</Text>
          </View>
        ) : Object.entries(groupedTasks).map(([date, tasks]) => (
          <View key={date} style={styles.dayCard}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayTitle}>{date}</Text>
              <Text style={styles.dayCount}>{tasks.length}개</Text>
            </View>
            {tasks.map((task) => (
              <View key={task.id} style={styles.taskItem}>
                <View style={styles.taskDot} />
                <View style={styles.taskContent}>
                  <Text style={styles.taskTitle}>{task.title}</Text>
                  <Text style={styles.taskMeta}>{task.assignee || '담당자 미정'} · {task.source}</Text>
                  <View style={styles.statusRow}>
                    {STATUS_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.code}
                        style={[styles.statusBtn, task.statusCode === option.code && styles.statusBtnActive]}
                        onPress={() => handleUpdateTaskStatus(task.id, option.code)}
                      >
                        <Text style={[styles.statusBtnText, task.statusCode === option.code && styles.statusBtnTextActive]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteTask(task.id)}>
                  <Ionicons name="trash-outline" size={14} color={COLORS.error} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Empty({ text }) {
  return (
    <View style={styles.emptySlim}>
      <Text style={styles.emptyTitle}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: COLORS.text, letterSpacing: 0 },
  headerBadge: { backgroundColor: '#EEF2FF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  headerBadgeText: { color: COLORS.primary, fontWeight: '700', fontSize: 12 },
  notionCard: { backgroundColor: COLORS.surface, borderRadius: 18, padding: 18, marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 3 },
  notionTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  notionIconWrap: { width: 46, height: 46, borderRadius: 13, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  notionCopy: { flex: 1 },
  notionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  notionDesc: { fontSize: 12, color: COLORS.subtext, lineHeight: 18, marginTop: 3 },
  notionBtn: { marginTop: 16, height: 48, borderRadius: 14, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  notionBtnConnected: { backgroundColor: COLORS.secondary },
  notionBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  disabledButton: { opacity: 0.7 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  statBox: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  statValue: { color: COLORS.text, fontSize: 18, fontWeight: '700' },
  statLabel: { color: COLORS.subtext, fontSize: 10, marginTop: 2 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginBottom: 12, marginTop: 8 },
  input: { backgroundColor: '#F1F5F9', borderRadius: 10, height: 42, paddingHorizontal: 12, color: COLORS.text, marginBottom: 8 },
  formRow: { flexDirection: 'row', gap: 8 },
  formInput: { flex: 1 },
  timeInput: { width: 70 },
  addBtn: { height: 42, borderRadius: 11, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  emptyCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 32, alignItems: 'center' },
  emptySlim: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 18, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.subtext, marginTop: 4 },
  emptyDesc: { fontSize: 12, color: '#A0AEC0', lineHeight: 18, textAlign: 'center', marginTop: 6 },
  dayCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  dayTitle: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  dayCount: { fontSize: 12, color: COLORS.subtext, fontWeight: '600' },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eventInfo: { flex: 1 },
  taskItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  taskDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success, marginTop: 5 },
  taskContent: { flex: 1 },
  taskTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  taskMeta: { fontSize: 11, color: COLORS.subtext, marginTop: 3 },
  statusRow: { flexDirection: 'row', gap: 5, marginTop: 7 },
  statusBtn: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: '#F1F5F9' },
  statusBtnActive: { backgroundColor: '#EEF2FF' },
  statusBtnText: { fontSize: 10, color: COLORS.subtext, fontWeight: '700' },
  statusBtnTextActive: { color: COLORS.primary },
  deleteBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
});
