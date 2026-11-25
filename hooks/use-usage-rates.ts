import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { readUsageRates, type UsageRates } from '@/lib/usage-rates';

const KEY = 'dual-mind-usage-rates-v1';
const EMPTY: UsageRates = { pricing: null, fx: null };

/** Rates are manual, device-local and never silently fetched or guessed. */
export function useUsageRates() {
  const [rates, setRates] = useState<UsageRates>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(KEY)
      .then(value => {
        if (!cancelled && value) setRates(readUsageRates(JSON.parse(value)));
      })
      .catch(error => console.error('Unable to load token rates:', error))
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(KEY, JSON.stringify(rates))
      .catch(error => console.error('Unable to save token rates:', error));
  }, [rates, loaded]);
  return { rates, setRates, loaded };
}
