import { StyleSheet, Text, View, useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function ProductsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Produits</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        Ton catalogue de produits apparaîtra ici.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 8 },
  title: { fontSize: 34, fontWeight: '700' },
  body: { fontSize: 17, lineHeight: 24 },
});
