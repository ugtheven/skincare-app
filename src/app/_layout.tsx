import { StatusBar } from 'expo-status-bar';
import { Tabs } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SymbolView } from 'expo-symbols';

import { AppTabBarBackground, AppTabBarButton } from '@/components/app-tab-bar';
import { Colors } from '@/constants/theme';

function renderTabBarBackground() {
  return <AppTabBarBackground />;
}

function renderTabBarButton(
  props: React.ComponentProps<typeof AppTabBarButton>,
) {
  return <AppTabBarButton {...props} />;
}

export default function RootLayout() {
  const colors = Colors;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          tabBarActiveTintColor: colors.tint,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarBackground: renderTabBarBackground,
          tabBarButton: renderTabBarButton,
          tabBarHideOnKeyboard: true,
          tabBarIconStyle: styles.tabBarIcon,
          tabBarStyle: {
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            elevation: 0,
            shadowColor: colors.text,
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.08,
            shadowRadius: 8,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            lineHeight: 14,
            fontWeight: '600',
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Aujourd'hui",
            tabBarIcon: ({ color }) => (
              <SymbolView
                name="sun.max.fill"
                tintColor={color}
                size={22}
                fallback={<Text style={{ color, fontSize: 20 }}>☀</Text>}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="products"
          options={{
            title: 'Produits',
            tabBarIcon: ({ color }) => (
              <SymbolView
                name="drop.fill"
                tintColor={color}
                size={22}
                fallback={<Text style={{ color, fontSize: 20 }}>◉</Text>}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="progress"
          options={{
            title: 'Progression',
            tabBarIcon: ({ color }) => (
              <SymbolView
                name="chart.bar.fill"
                tintColor={color}
                size={22}
                fallback={<Text style={{ color, fontSize: 18 }}>▥</Text>}
              />
            ),
          }}
        />
      </Tabs>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  tabBarIcon: {
    marginTop: 1,
  },
});
