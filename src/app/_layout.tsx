import { StatusBar } from 'expo-status-bar';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Colors } from '@/constants/theme';

export default function RootLayout() {
  const colors = Colors;

  return (
    <>
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          tabBarActiveTintColor: colors.tint,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopColor: colors.separator,
          },
          tabBarLabelStyle: {
            fontSize: 11,
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
    </>
  );
}
