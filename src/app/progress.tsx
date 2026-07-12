import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

export default function ProgressScreen() {
  const colors = Colors;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Progression</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        Tes check-ins et ton évolution apparaîtront ici.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 8 },
  title: { fontSize: 34, fontWeight: '700' },
  body: { fontSize: 17, lineHeight: 24 },
});
