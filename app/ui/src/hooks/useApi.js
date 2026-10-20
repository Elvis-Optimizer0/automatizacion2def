import { useCallback } from 'react';

export function useApi() {
  const api = typeof window !== 'undefined' ? window.api : null;

  const invoke = useCallback(async (channel, ...args) => {
    if (!api || !api[channel]) {
      throw new Error(`IPC channel not found: ${channel}`);
    }
    return api[channel](...args);
  }, []);

  const on = useCallback((channel, callback) => {
    if (!api || !api[`on${channel.charAt(0).toUpperCase() + channel.slice(1)}`]) {
      return () => {};
    }
    return api[`on${channel.charAt(0).toUpperCase() + channel.slice(1)}`](callback);
  }, []);

  return { invoke, on };
}