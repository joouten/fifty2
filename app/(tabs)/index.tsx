import { getOrCreateDeviceId, supabase } from '@/app/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const API_KEY = process.env.EXPO_PUBLIC_TWELVE_DATA_API_KEY!;
const DEFAULT_STOCKS = ['AAPL', 'MSFT', 'GOOGL'];
const STORAGE_KEY = 'fifty2_watchlist';
const MAX_WATCHLIST_SIZE = 20;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerForPushNotifications() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4fc3f7',
    });
  }
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    Alert.alert('Notifications disabled', 'Enable notifications in your phone settings to receive 52W alerts.');
    return null;
  }
  const token = (await Notifications.getExpoPushTokenAsync({
    projectId: 'fe77dc3f-5b8a-454b-98e7-d7b2b0c77225'
  })).data;
    return token;
}

async function saveDeviceToSupabase(deviceId: string, token: string, stocks: string[]) {
  await supabase
    .from('devices')
    .upsert({ device_id: deviceId, push_token: token }, { onConflict: 'device_id' });

  await supabase
    .from('watchlists')
    .delete()
    .eq('device_id', deviceId);

  const rows = stocks.map((symbol) => ({ device_id: deviceId, push_token: token, symbol }));
  await supabase.from('watchlists').insert(rows);
}

export default function WatchlistScreen() {
  const [stocks, setStocks] = useState([]);
  const [stockData, setStockData] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const pushToken = useRef(null);
  const deviceId = useRef(null);

  const saveStocks = async (list) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      if (deviceId.current && pushToken.current) {
        await saveDeviceToSupabase(deviceId.current, pushToken.current, list);
      }
    } catch (e) {
      console.error('Failed to save stocks', e);
    }
  };

  const loadSavedStocks = async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_STOCKS;
    } catch (e) {
      return DEFAULT_STOCKS;
    }
  };

  const fetchStockData = async (symbol) => {
    try {
      const res = await fetch(
        `https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${API_KEY}`
      );
      const data = await res.json();
      if (data.status === 'error' || !data.close) return null;
      const current = parseFloat(data.close);
      const high = parseFloat(data.fifty_two_week?.high);
      const low = parseFloat(data.fifty_two_week?.low);
      return {
        symbol,
        high52: isNaN(high) ? 'N/A' : high.toFixed(2),
        low52: isNaN(low) ? 'N/A' : low.toFixed(2),
        current: isNaN(current) ? 'N/A' : current.toFixed(2),
      };
    } catch (error) {
      return null;
    }
  };

  const loadAllStocks = async (list) => {
    setLoading(true);
    const results = await Promise.all(list.map(fetchStockData));
    const dataMap = {};
    results.forEach((item) => { if (item) dataMap[item.symbol] = item; });
    setStockData((prev) => ({ ...prev, ...dataMap }));
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    const saved = await loadSavedStocks();
    const results = [];
    for (const symbol of saved) {
      const data = await fetchStockData(symbol);
      results.push(data);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const dataMap = {};
    results.forEach((item) => { if (item) dataMap[item.symbol] = item; });
    setStockData((prev) => ({ ...prev, ...dataMap }));
    setRefreshing(false);
  };

useEffect(() => {
  const initialize = async () => {
    try {
      const id = await getOrCreateDeviceId();
      deviceId.current = id;
    } catch (e) {
      console.error('Device ID error', e);
    }
    try {
      const token = await registerForPushNotifications();
      if (token) pushToken.current = token;
      const saved = await loadSavedStocks();
      setStocks(saved);
      await loadAllStocks(saved);
      if (pushToken.current && deviceId.current) {
        await saveDeviceToSupabase(deviceId.current, pushToken.current, saved);
      }
    } catch (e) {
      console.error('Initialization error', e);
      const saved = await loadSavedStocks();
      setStocks(saved);
      await loadAllStocks(saved);
    }
  };
  initialize();
}, []);

  const addStock = async () => {
    const symbol = newSymbol.trim().toUpperCase();
    if (!symbol) return;

    // Input validation
    if (!/^[A-Z]{1,10}$/.test(symbol)) {
      Alert.alert('Invalid symbol', 'Stock symbols can only contain letters (max 10 characters).');
      return;
    }

    // Watchlist size cap
    if (stocks.length >= MAX_WATCHLIST_SIZE) {
      Alert.alert('Watchlist full', `You can track a maximum of ${MAX_WATCHLIST_SIZE} stocks.`);
      return;
    }

    if (stocks.includes(symbol)) {
      Alert.alert('Already added', `${symbol} is already in your watchlist.`);
      return;
    }
    const data = await fetchStockData(symbol);
    if (!data) {
      Alert.alert('Not found', `Could not find data for "${symbol}". Check the symbol and try again.`);
      return;
    }
    const updated = [...stocks, symbol];
    setStocks(updated);
    setStockData((prev) => ({ ...prev, [symbol]: data }));
    await saveStocks(updated);
    setNewSymbol('');
    setAdding(false);
  };

  const removeStock = (symbol) => {
    Alert.alert('Remove stock', `Remove ${symbol} from your watchlist?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const updated = stocks.filter((s) => s !== symbol);
          setStocks(updated);
          await saveStocks(updated);
        }
      },
    ]);
  };

  const renderStock = ({ item }) => {
    const data = stockData[item];
    return (
      <TouchableOpacity style={styles.card} onLongPress={() => removeStock(item)}>
        <Text style={styles.symbol}>{item}</Text>
        <View style={styles.dataRow}>
          <View style={styles.dataItem}>
            <Text style={styles.dataLabel}>52W High</Text>
            <Text style={styles.highValue}>${data?.high52 ?? '...'}</Text>
          </View>
          <View style={styles.dataItem}>
            <Text style={styles.dataLabel}>Current</Text>
            <Text style={styles.currentValue}>${data?.current ?? '...'}</Text>
          </View>
          <View style={styles.dataItem}>
            <Text style={styles.dataLabel}>52W Low</Text>
            <Text style={styles.lowValue}>${data?.low52 ?? '...'}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Fifty2</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setAdding(!adding)}>
          <Text style={styles.addButtonText}>{adding ? '✕' : '+'}</Text>
        </TouchableOpacity>
      </View>
      {adding && (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Enter symbol (e.g. TSLA)"
            placeholderTextColor="#a0a8c0"
            value={newSymbol}
            onChangeText={setNewSymbol}
            autoCapitalize="characters"
            autoFocus
          />
          <TouchableOpacity style={styles.goButton} onPress={addStock}>
            <Text style={styles.goButtonText}>Add</Text>
          </TouchableOpacity>
        </View>
      )}
      {loading ? (
        <ActivityIndicator size="large" color="#4fc3f7" style={styles.loader} />
      ) : (
        <FlatList
          data={stocks}
          keyExtractor={(item) => item}
          renderItem={renderStock}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#4fc3f7"
              colors={['#4fc3f7']}
            />
          }
        />
      )}
      <Text style={styles.hint}>Pull down to refresh · Long press to remove</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a', paddingTop: 60 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 20 },
  header: { fontSize: 32, fontWeight: 'bold', color: '#ffffff' },
  addButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#4fc3f7', alignItems: 'center', justifyContent: 'center' },
  addButtonText: { fontSize: 24, color: '#0f0f1a', fontWeight: 'bold', lineHeight: 28 },
  inputRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 16, gap: 10 },
  input: { flex: 1, backgroundColor: '#1a1a2e', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: '#ffffff', fontSize: 16 },
  goButton: { backgroundColor: '#4fc3f7', borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center' },
  goButtonText: { color: '#0f0f1a', fontWeight: 'bold', fontSize: 16 },
  loader: { marginTop: 40 },
  list: { paddingHorizontal: 20 },
  card: { backgroundColor: '#1a1a2e', borderRadius: 12, padding: 16, marginBottom: 12 },
  symbol: { fontSize: 20, fontWeight: 'bold', color: '#ffffff', marginBottom: 12 },
  dataRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dataItem: { alignItems: 'center' },
  dataLabel: { fontSize: 12, color: '#a0a8c0', marginBottom: 4 },
  highValue: { fontSize: 18, fontWeight: '600', color: '#52b788' },
  currentValue: { fontSize: 18, fontWeight: '600', color: '#4fc3f7' },
  lowValue: { fontSize: 18, fontWeight: '600', color: '#e63946' },
  hint: { textAlign: 'center', color: '#a0a8c0', fontSize: 12, paddingBottom: 16 },
});