import React, { useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { COLORS } from '../theme';

const STATUS_OPTIONS = [
  { code: 'TODO', label: '등록' },
  { code: 'IN_PROGRESS', label: '진행' },
  { code: 'DONE', label: '완료' },
];

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
const MONTH_NAMES = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

const pad2 = (value) => String(value).padStart(2, '0');

const toDateKey = (value) => {
  if (!value) return 'unscheduled';
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'unscheduled';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const formatDateHeading = (dateKey) => {
  if (dateKey === 'unscheduled') return '마감일 미정';
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${DAY_NAMES[date.getDay()]})`;
};

const getTodayKey = () => toDateKey(new Date().toISOString());

const addMonths = (date, amount) => new Date(date.getFullYear(), date.getMonth() + amount, 1);

const getMonthKey = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;

function buildMonthDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDate = new Date(year, month, 1);
  const startOffset = firstDate.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let index = 0; index < startOffset; index += 1) {
    cells.push({ key: `empty-start-${index}`, isEmpty: true });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${year}-${pad2(month + 1)}-${pad2(day)}`;
    cells.push({ key: dateKey, dateKey, day });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ key: `empty-end-${cells.length}`, isEmpty: true });
  }
  return cells;
}

const formatTimeRange = (startAt, endAt) => {
  if (!startAt) return '시간 미정';
  const start = new Date(startAt);
  const end = endAt ? new Date(endAt) : null;
  if (Number.isNaN(start.getTime())) return String(startAt).replace('T', ' ');
  const startText = `${pad2(start.getHours())}:${pad2(start.getMinutes())}`;
  if (!end || Number.isNaN(end.getTime())) return startText;
  return `${startText}-${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
};

const toGoogleDate = (value, fallbackHour = 9) => {
  if (!value) return '';
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T${pad2(fallbackHour)}:00:00` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().replace(/[-:]|\.\d{3}/g, '');
};

const buildGoogleCalendarUrl = ({ title, startAt, endAt, description, location }) => {
  const start = toGoogleDate(startAt, 9);
  const end = toGoogleDate(endAt || startAt, 10);
  const params = {
    action: 'TEMPLATE',
    text: title || '회의 일정',
    ...(start && end ? { dates: `${start}/${end}` } : {}),
    ...(description ? { details: description } : {}),
    ...(location ? { location } : {}),
  };
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `https://calendar.google.com/calendar/render?${query}`;
};

const getStatusLabel = (code) => STATUS_OPTIONS.find((item) => item.code === code)?.label || '등록';

function normalizeTitle(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildCalendarItems(events, tasks) {
  const eventItems = events.map((event) => ({
    id: `event-${event.id}`,
    rawId: event.id,
    kind: 'event',
    title: event.title || '제목 없는 일정',
    dateKey: toDateKey(event.startAt),
    sortValue: event.startAt || event.date || '',
    timeText: formatTimeRange(event.startAt, event.endAt),
    meta: event.relatedTasks?.length ? `관련 할일 ${event.relatedTasks.length}개` : '일정',
    event,
  }));

  const eventFingerprints = new Set(eventItems.map((item) => `${item.dateKey}:${normalizeTitle(item.title)}`));
  const taskItems = tasks
    .filter((task) => !eventFingerprints.has(`${toDateKey(task.dueDate)}:${normalizeTitle(task.title)}`))
    .map((task) => ({
      id: `task-${task.id}`,
      rawId: task.id,
      kind: 'task',
      title: task.title || '제목 없는 할일',
      dateKey: toDateKey(task.dueDate),
      sortValue: task.dueDate || '',
      timeText: task.dueDate ? '마감' : '일정 미정',
      meta: `${task.assignee || '담당자 미정'} · ${task.source || '할일'}`,
      task,
    }));

  return [...eventItems, ...taskItems].sort((a, b) => {
    if (a.dateKey === 'unscheduled' && b.dateKey !== 'unscheduled') return 1;
    if (a.dateKey !== 'unscheduled' && b.dateKey === 'unscheduled') return -1;
    if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey);
    if (a.kind !== b.kind) return a.kind === 'event' ? -1 : 1;
    return String(a.sortValue).localeCompare(String(b.sortValue));
  });
}

export default function CalendarScreen() {
  const {
    calendarTasks,
    calendarEvents,
    taskStats,
    updateCalendarTask,
    deleteCalendarTask,
    addCalendarEvent,
    deleteCalendarEvent,
  } = useAppContext();
  const [eventForm, setEventForm] = useState({ title: '', date: '', startTime: '10:00', endTime: '11:00' });
  const [showComposer, setShowComposer] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const [selectedDateKey, setSelectedDateKey] = useState(getTodayKey);

  const items = useMemo(() => buildCalendarItems(calendarEvents, calendarTasks), [calendarEvents, calendarTasks]);
  const groupedItems = useMemo(() => items.reduce((acc, item) => {
    acc[item.dateKey] = [...(acc[item.dateKey] || []), item];
    return acc;
  }, {}), [items]);
  const monthCells = useMemo(() => buildMonthDays(visibleMonth), [visibleMonth]);
  const monthKey = getMonthKey(visibleMonth);
  const selectedItems = groupedItems[selectedDateKey] || [];
  const selectedHasItems = selectedItems.length > 0;
  const scheduledCount = items.filter((item) => item.dateKey !== 'unscheduled').length;
  const unscheduledCount = items.length - scheduledCount;
  const doneCount = taskStats.done ?? calendarTasks.filter((task) => task.statusCode === 'DONE').length;

  const openGoogleCalendar = async (item) => {
    const payload = item.kind === 'task'
      ? { title: item.title, startAt: item.task.dueDate, description: `담당자: ${item.task.assignee || '미정'}\n출처: ${item.task.source || '할일'}` }
      : item.event;
    if (!payload.startAt) return Alert.alert('일정 미정', '날짜가 있는 항목만 Google 캘린더로 열 수 있습니다.');
    try {
      await Linking.openURL(buildGoogleCalendarUrl(payload));
    } catch (error) {
      Alert.alert('열기 실패', error?.message || 'Google 캘린더 링크를 열지 못했습니다.');
    }
  };

  const handleSelectDate = (dateKey) => {
    setSelectedDateKey(dateKey);
    if (dateKey !== 'unscheduled' && !dateKey.startsWith(monthKey)) {
      const [year, month] = dateKey.split('-').map(Number);
      setVisibleMonth(new Date(year, month - 1, 1));
    }
  };

  const handleCreateForSelectedDate = () => {
    if (selectedDateKey !== 'unscheduled') {
      setEventForm((prev) => ({ ...prev, date: selectedDateKey }));
    }
    setShowComposer(true);
  };

  const handleCreateEvent = async () => {
    if (!eventForm.title.trim() || !eventForm.date.trim()) return Alert.alert('입력 오류', '일정 제목과 날짜를 입력해주세요.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventForm.date.trim())) return Alert.alert('입력 오류', '날짜는 2026-06-01 형식으로 입력해주세요.');
    if (!/^\d{2}:\d{2}$/.test(eventForm.startTime || '') || !/^\d{2}:\d{2}$/.test(eventForm.endTime || '')) return Alert.alert('입력 오류', '시간은 10:00 형식으로 입력해주세요.');
    try {
      await addCalendarEvent({
        title: eventForm.title.trim(),
        startAt: `${eventForm.date.trim()}T${eventForm.startTime || '10:00'}:00`,
        endAt: `${eventForm.date.trim()}T${eventForm.endTime || '11:00'}:00`,
      });
      setEventForm({ title: '', date: '', startTime: '10:00', endTime: '11:00' });
      setShowComposer(false);
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

  const handleDeleteItem = async (item) => {
    try {
      if (item.kind === 'task') await deleteCalendarTask(item.rawId);
      else await deleteCalendarEvent(item.rawId);
    } catch (error) {
      Alert.alert('삭제 실패', error?.message || '항목을 삭제하지 못했습니다.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>캘린더</Text>
            <Text style={styles.headerSubtext}>회의에서 나온 일정과 할일을 날짜순으로 모았습니다</Text>
          </View>
          <TouchableOpacity style={styles.addIconBtn} onPress={() => setShowComposer((prev) => !prev)} activeOpacity={0.85}>
            <Ionicons name={showComposer ? 'close' : 'add'} size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <Stat label="전체" value={items.length} />
          <Stat label="날짜 있음" value={scheduledCount} />
          <Stat label="미정" value={unscheduledCount} />
          <Stat label="완료" value={doneCount} />
        </View>

        <View style={styles.monthCard}>
          <View style={styles.monthHeader}>
            <TouchableOpacity style={styles.monthNavBtn} onPress={() => setVisibleMonth((prev) => addMonths(prev, -1))} activeOpacity={0.75}>
              <Ionicons name="chevron-back" size={18} color={COLORS.text} />
            </TouchableOpacity>
            <View style={styles.monthTitleWrap}>
              <Text style={styles.monthTitle}>{visibleMonth.getFullYear()}년 {MONTH_NAMES[visibleMonth.getMonth()]}</Text>
              <Text style={styles.monthSubtitle}>날짜를 누르면 그날 일정이 아래에 열립니다</Text>
            </View>
            <TouchableOpacity style={styles.monthNavBtn} onPress={() => setVisibleMonth((prev) => addMonths(prev, 1))} activeOpacity={0.75}>
              <Ionicons name="chevron-forward" size={18} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.weekRow}>
            {DAY_NAMES.map((day) => <Text key={day} style={styles.weekLabel}>{day}</Text>)}
          </View>
          <View style={styles.calendarGrid}>
            {monthCells.map((cell) => {
              if (cell.isEmpty) return <View key={cell.key} style={styles.dayCell} />;
              const count = groupedItems[cell.dateKey]?.length || 0;
              const isSelected = selectedDateKey === cell.dateKey;
              const isToday = getTodayKey() === cell.dateKey;
              return (
                <TouchableOpacity key={cell.key} style={[styles.dayCell, isSelected && styles.dayCellSelected]} onPress={() => handleSelectDate(cell.dateKey)} activeOpacity={0.78}>
                  <Text style={[styles.dayCellText, isSelected && styles.dayCellTextSelected, isToday && !isSelected && styles.dayCellTextToday]}>{cell.day}</Text>
                  {count > 0 ? (
                    <View style={styles.dayMarkers}>
                      <View style={[styles.dayDot, isSelected && styles.dayDotSelected]} />
                      {count > 1 ? <Text style={[styles.dayCountTiny, isSelected && styles.dayCountTinySelected]}>{count}</Text> : null}
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {showComposer ? (
          <View style={styles.composerCard}>
            <Text style={styles.composerTitle}>직접 일정 추가</Text>
            <TextInput style={styles.input} placeholder="일정 제목" placeholderTextColor="#A0AEC0" value={eventForm.title} onChangeText={(title) => setEventForm((prev) => ({ ...prev, title }))} />
            <View style={styles.formRow}>
              <TextInput style={[styles.input, styles.formInput]} placeholder="2026-06-01" placeholderTextColor="#A0AEC0" value={eventForm.date} onChangeText={(date) => setEventForm((prev) => ({ ...prev, date }))} />
              <TextInput style={[styles.input, styles.timeInput]} placeholder="10:00" placeholderTextColor="#A0AEC0" value={eventForm.startTime} onChangeText={(startTime) => setEventForm((prev) => ({ ...prev, startTime }))} />
              <TextInput style={[styles.input, styles.timeInput]} placeholder="11:00" placeholderTextColor="#A0AEC0" value={eventForm.endTime} onChangeText={(endTime) => setEventForm((prev) => ({ ...prev, endTime }))} />
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleCreateEvent} activeOpacity={0.85}>
              <Ionicons name="calendar-outline" size={18} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>인앱 캘린더에 추가</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.selectedSection}>
          <View style={styles.selectedHeader}>
            <View>
              <Text style={styles.dayTitle}>{formatDateHeading(selectedDateKey)}</Text>
              <Text style={styles.selectedSubtitle}>{selectedHasItems ? `${selectedItems.length}개의 일정이 정리됐어요` : '이 날짜에는 아직 일정이 없어요'}</Text>
            </View>
            <TouchableOpacity style={styles.smallAddBtn} onPress={handleCreateForSelectedDate} activeOpacity={0.85}>
              <Ionicons name="add" size={16} color={COLORS.primary} />
              <Text style={styles.smallAddText}>추가</Text>
            </TouchableOpacity>
          </View>
          {selectedHasItems ? (
            selectedItems.map((item) => (
              <CalendarItem
                key={item.id}
                item={item}
                onDelete={() => handleDeleteItem(item)}
                onExport={() => openGoogleCalendar(item)}
                onStatusChange={handleUpdateTaskStatus}
              />
            ))
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="calendar-outline" size={42} color={COLORS.border} />
              <Text style={styles.emptyTitle}>비어 있는 날이에요</Text>
              <Text style={styles.emptyDesc}>회의에서 나온 할일이나 직접 추가한 일정이 이 날짜에 모입니다.</Text>
            </View>
          )}
        </View>

        {unscheduledCount > 0 ? (
          <View style={styles.unscheduledSection}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayTitle}>마감일 미정</Text>
              <TouchableOpacity onPress={() => handleSelectDate('unscheduled')}>
                <Text style={styles.unscheduledLink}>{selectedDateKey === 'unscheduled' ? '선택됨' : `${unscheduledCount}개 보기`}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }) {
  return <View style={styles.statBox}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function CalendarItem({ item, onDelete, onExport, onStatusChange }) {
  const isTask = item.kind === 'task';
  return (
    <View style={styles.itemCard}>
      <View style={[styles.typeRail, isTask ? styles.taskRail : styles.eventRail]} />
      <View style={styles.itemBody}>
        <View style={styles.itemTop}>
          <View style={[styles.typeIcon, isTask ? styles.taskIcon : styles.eventIcon]}>
            <Ionicons name={isTask ? 'checkmark-circle-outline' : 'time-outline'} size={16} color={isTask ? COLORS.success : COLORS.primary} />
          </View>
          <View style={styles.itemText}>
            <View style={styles.titleRow}>
              <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
              <View style={[styles.typeBadge, isTask ? styles.taskBadge : styles.eventBadge]}>
                <Text style={[styles.typeBadgeText, isTask ? styles.taskBadgeText : styles.eventBadgeText]}>{isTask ? '할일' : '일정'}</Text>
              </View>
            </View>
            <Text style={styles.itemMeta}>{item.timeText} · {item.meta}</Text>
          </View>
          <TouchableOpacity style={styles.iconButton} onPress={onDelete} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={15} color={COLORS.error} />
          </TouchableOpacity>
        </View>

        {isTask ? (
          <View style={styles.statusRow}>
            {STATUS_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.code}
                style={[styles.statusBtn, item.task.statusCode === option.code && styles.statusBtnActive]}
                onPress={() => onStatusChange(item.rawId, option.code)}
              >
                <Text style={[styles.statusBtnText, item.task.statusCode === option.code && styles.statusBtnTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            ))}
            <Text style={styles.statusLabel}>{getStatusLabel(item.task.statusCode)}</Text>
          </View>
        ) : null}

        <TouchableOpacity style={[styles.exportBtn, item.dateKey === 'unscheduled' && styles.exportBtnDisabled]} onPress={onExport} activeOpacity={0.85}>
          <Ionicons name="open-outline" size={15} color={item.dateKey === 'unscheduled' ? COLORS.subtext : COLORS.primary} />
          <Text style={[styles.exportBtnText, item.dateKey === 'unscheduled' && styles.exportBtnTextDisabled]}>Google 캘린더로 열기</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, marginBottom: 16 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: COLORS.text, letterSpacing: 0 },
  headerSubtext: { fontSize: 12, color: COLORS.subtext, marginTop: 4, lineHeight: 18 },
  addIconBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statBox: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 12, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  statValue: { color: COLORS.text, fontSize: 18, fontWeight: '700' },
  statLabel: { color: COLORS.subtext, fontSize: 10, marginTop: 2, fontWeight: '600' },
  monthCard: { backgroundColor: COLORS.surface, borderRadius: 18, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: COLORS.border },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 },
  monthNavBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  monthTitleWrap: { flex: 1, alignItems: 'center' },
  monthTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  monthSubtitle: { fontSize: 11, color: COLORS.subtext, marginTop: 2 },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', color: COLORS.subtext },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  dayCellSelected: { backgroundColor: COLORS.primary },
  dayCellText: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  dayCellTextSelected: { color: '#FFFFFF' },
  dayCellTextToday: { color: COLORS.primary },
  dayMarkers: { height: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 2 },
  dayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.success },
  dayDotSelected: { backgroundColor: '#FFFFFF' },
  dayCountTiny: { fontSize: 9, fontWeight: '800', color: COLORS.success },
  dayCountTinySelected: { color: '#FFFFFF' },
  composerCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: COLORS.border },
  composerTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  input: { backgroundColor: '#F1F5F9', borderRadius: 10, height: 42, paddingHorizontal: 12, color: COLORS.text, marginBottom: 8, fontSize: 14 },
  formRow: { flexDirection: 'row', gap: 8 },
  formInput: { flex: 1 },
  timeInput: { width: 70 },
  primaryBtn: { height: 44, borderRadius: 11, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 4 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  emptyCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.subtext, marginTop: 12 },
  emptyDesc: { fontSize: 12, color: '#A0AEC0', lineHeight: 18, textAlign: 'center', marginTop: 6 },
  selectedSection: { marginBottom: 16 },
  selectedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 2 },
  selectedSubtitle: { fontSize: 12, color: COLORS.subtext, marginTop: 2 },
  smallAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EEF2FF', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 },
  smallAddText: { color: COLORS.primary, fontSize: 12, fontWeight: '800' },
  unscheduledSection: { marginBottom: 16 },
  unscheduledLink: { color: COLORS.primary, fontWeight: '800', fontSize: 12 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 2 },
  dayTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  dayCount: { fontSize: 12, color: COLORS.primary, fontWeight: '700', backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  itemCard: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  typeRail: { width: 4 },
  eventRail: { backgroundColor: COLORS.primary },
  taskRail: { backgroundColor: COLORS.success },
  itemBody: { flex: 1, padding: 13 },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  typeIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  eventIcon: { backgroundColor: '#EEF2FF' },
  taskIcon: { backgroundColor: '#ECFDF5' },
  itemText: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.text, lineHeight: 20 },
  itemMeta: { fontSize: 11, color: COLORS.subtext, marginTop: 3, lineHeight: 16 },
  typeBadge: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3, flexShrink: 0 },
  eventBadge: { backgroundColor: '#EEF2FF' },
  taskBadge: { backgroundColor: '#ECFDF5' },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },
  eventBadgeText: { color: COLORS.primary },
  taskBadgeText: { color: COLORS.success },
  iconButton: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 11, flexWrap: 'wrap' },
  statusBtn: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#F1F5F9' },
  statusBtnActive: { backgroundColor: '#EEF2FF' },
  statusBtnText: { fontSize: 11, color: COLORS.subtext, fontWeight: '700' },
  statusBtnTextActive: { color: COLORS.primary },
  statusLabel: { marginLeft: 2, fontSize: 11, color: COLORS.subtext, fontWeight: '600' },
  exportBtn: { height: 36, borderRadius: 10, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 11 },
  exportBtnDisabled: { opacity: 0.65 },
  exportBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 12 },
  exportBtnTextDisabled: { color: COLORS.subtext },
});
