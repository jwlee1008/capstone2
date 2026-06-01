import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from './src/context/AppContext';
import AppNavigator from './src/navigation/AppNavigator';
import { COLORS } from './src/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" backgroundColor={COLORS.background} />
        <AppNavigator />
      </AppProvider>
    </SafeAreaProvider>
  );
}
