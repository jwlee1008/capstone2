import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../theme';
import { useAppContext } from '../context/AppContext';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import MeetingListScreen from '../screens/MeetingListScreen';
import AddMeetingScreen from '../screens/AddMeetingScreen';
import MeetingDetailScreen from '../screens/MeetingDetailScreen';
import CalendarScreen from '../screens/CalendarScreen';
import MyInfoScreen from '../screens/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function CustomTabBar({ state, navigation }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.tabBarContainer, { paddingBottom: insets.bottom || 12 }]}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const icons = { Calendar: isFocused ? 'calendar' : 'calendar-outline', Home: isFocused ? 'home' : 'home-outline', MyInfo: isFocused ? 'person' : 'person-outline' };
        const labels = { Calendar: '캘린더', Home: '홈', MyInfo: '내 정보' };
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
        };
        return <TouchableOpacity key={route.key} onPress={onPress} activeOpacity={0.72} style={[styles.tabButton, isFocused && styles.tabButtonActive]}><Ionicons name={icons[route.name]} size={21} color={isFocused ? COLORS.primary : '#9CA3AF'} /><Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>{labels[route.name]}</Text></TouchableOpacity>;
      })}
    </View>
  );
}

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: COLORS.surface }, headerTintColor: COLORS.text, headerTitleStyle: { fontWeight: '700', fontSize: 17 }, headerShadowVisible: false, headerBackTitleVisible: false }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="MeetingList" component={MeetingListScreen} options={{ title: '회의 목록' }} />
      <Stack.Screen name="AddMeeting" component={AddMeetingScreen} options={{ title: '회의 만들기', presentation: 'modal' }} />
      <Stack.Screen name="MeetingDetail" component={MeetingDetailScreen} options={({ route }) => ({ title: route.params?.meetingName || '회의 상세' })} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return <Tab.Navigator initialRouteName="Home" tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}><Tab.Screen name="Calendar" component={CalendarScreen} /><Tab.Screen name="Home" component={HomeStack} /><Tab.Screen name="MyInfo" component={MyInfoScreen} /></Tab.Navigator>;
}

export default function AppNavigator() {
  const { user } = useAppContext();
  return <NavigationContainer><Stack.Navigator screenOptions={{ headerShown: false }}>{user ? <Stack.Screen name="Main" component={MainTabs} /> : <Stack.Screen name="Login" component={LoginScreen} />}</Stack.Navigator></NavigationContainer>;
}

const styles = StyleSheet.create({
  tabBarContainer: { flexDirection: 'row', backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8, paddingHorizontal: 14, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: -1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 6 },
  tabButton: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 6 },
  tabButtonActive: { backgroundColor: '#EFF6FF' },
  tabLabel: { fontSize: 10, color: '#9CA3AF', marginTop: 3, fontWeight: '600' },
  tabLabelActive: { color: COLORS.primary, fontWeight: '700' },
});
