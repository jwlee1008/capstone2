import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CARD_SHADOW, COLORS, RADIUS } from '../theme';
import { useAppContext } from '../context/AppContext';
import { persistentStorage } from '../services/api';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import MeetingListScreen from '../screens/MeetingListScreen';
import AddMeetingScreen from '../screens/AddMeetingScreen';
import MeetingDetailScreen from '../screens/MeetingDetailScreen';
import CalendarScreen from '../screens/CalendarScreen';
import MyInfoScreen from '../screens/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const NAVIGATION_STATE_KEY = 'navigationState';

function CustomTabBar({ state, navigation }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.tabBarContainer, { paddingBottom: insets.bottom || 12 }]}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const isCenter = index === 1;
        const icons = { Calendar: isFocused ? 'calendar' : 'calendar-outline', Home: isFocused ? 'home' : 'home-outline', MyInfo: isFocused ? 'person' : 'person-outline' };
        const labels = { Calendar: '캘린더', Home: '홈', MyInfo: '내 정보' };
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
        };
        if (isCenter) {
          return <TouchableOpacity key={route.key} onPress={onPress} activeOpacity={0.8} style={styles.centerTabButton}><View style={[styles.centerIconWrapper, isFocused && styles.centerIconWrapperActive]}><Ionicons name={icons[route.name]} size={28} color="#FFFFFF" /></View><Text style={[styles.centerTabLabel, isFocused && styles.tabLabelActive]}>{labels[route.name]}</Text></TouchableOpacity>;
        }
        return <TouchableOpacity key={route.key} onPress={onPress} activeOpacity={0.7} style={styles.tabButton}><Ionicons name={icons[route.name]} size={24} color={isFocused ? COLORS.primary : COLORS.tabInactive} /><Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>{labels[route.name]}</Text></TouchableOpacity>;
      })}
    </View>
  );
}

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: COLORS.navigation }, headerTintColor: COLORS.text, headerTitleStyle: { fontWeight: '800', fontSize: 17 }, headerShadowVisible: false, headerBackTitleVisible: false }}>
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
  const { user, isRestoringSession } = useAppContext();
  const [initialState, setInitialState] = useState();
  const [isNavigationReady, setIsNavigationReady] = useState(false);

  useEffect(() => {
    let isMounted = true;
    persistentStorage.get(NAVIGATION_STATE_KEY).then((savedState) => {
      if (!isMounted) return;
      if (savedState) {
        try {
          setInitialState(JSON.parse(savedState));
        } catch {
          persistentStorage.remove(NAVIGATION_STATE_KEY);
        }
      }
    }).finally(() => {
      if (isMounted) setIsNavigationReady(true);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isNavigationReady && !isRestoringSession && !user) {
      persistentStorage.remove(NAVIGATION_STATE_KEY);
    }
  }, [isNavigationReady, isRestoringSession, user]);

  if (!isNavigationReady || isRestoringSession) {
    return <View style={styles.loadingScreen}><ActivityIndicator size="small" color={COLORS.primary} /></View>;
  }

  return (
    <NavigationContainer
      initialState={user ? initialState : undefined}
      onStateChange={(state) => {
        if (user) persistentStorage.set(NAVIGATION_STATE_KEY, JSON.stringify(state));
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? <Stack.Screen name="Main" component={MainTabs} /> : <Stack.Screen name="Login" component={LoginScreen} />}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  tabBarContainer: { flexDirection: 'row', backgroundColor: COLORS.navigation, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8, paddingHorizontal: 16, alignItems: 'flex-end', ...CARD_SHADOW },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 4 },
  centerTabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: Platform.OS === 'web' ? -18 : -24 },
  centerIconWrapper: { width: 60, height: 60, borderRadius: RADIUS.pill, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 12, elevation: 8 },
  centerIconWrapperActive: { backgroundColor: COLORS.primaryDark, transform: [{ scale: 1.04 }] },
  tabLabel: { fontSize: 10, color: COLORS.tabInactive, marginTop: 4, fontWeight: '600' },
  centerTabLabel: { fontSize: 10, color: COLORS.tabInactive, marginTop: 4, fontWeight: '600' },
  tabLabelActive: { color: COLORS.primary, fontWeight: '700' },
});
