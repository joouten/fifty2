import { StyleSheet, Text, View } from 'react-native';

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Settings</Text>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.row}>
          <Text style={styles.label}>App</Text>
          <Text style={styles.value}>Fifty2</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Version</Text>
          <Text style={styles.value}>1.0.0</Text>
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Provider</Text>
          <Text style={styles.value}>Twelve Data</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Refresh</Text>
          <Text style={styles.value}>Pull to refresh</Text>
        </View>
      </View>
      <Text style={styles.hint}>More settings coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a', paddingTop: 60 },
  header: { fontSize: 32, fontWeight: 'bold', color: '#ffffff', paddingHorizontal: 20, marginBottom: 30 },
  section: { backgroundColor: '#1a1a2e', borderRadius: 12, marginHorizontal: 20, marginBottom: 20, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 12, color: '#a0a8c0', paddingTop: 14, paddingBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: '#2a2a3e' },
  label: { fontSize: 16, color: '#ffffff' },
  value: { fontSize: 16, color: '#a0a8c0' },
  hint: { textAlign: 'center', color: '#a0a8c0', fontSize: 12, marginTop: 10 },
});