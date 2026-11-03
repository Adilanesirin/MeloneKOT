import React, { useCallback, useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import NoNetworkScreen from './NoNetworkScreen';
import { isServerReachable, subscribeNoNetwork } from '../services/api';

/** Shows the waiter screen when the network drops. OK hides it without clearing any screen banner. */
export default function NetworkGate() {
  const [visible, setVisible] = useState(false);
  const dismissed = useRef(false); // user pressed OK: don't reopen until the network comes back

  useEffect(() => {
    const offDown = subscribeNoNetwork(() => {
      if (!dismissed.current) setVisible(true);
    });
    const offNet = NetInfo.addEventListener((s) => {
      if (s.isConnected && s.isInternetReachable !== false) {
        dismissed.current = false; // back online: allow the screen next time it drops
        setVisible(false);
      }
    });
    return () => { offDown(); offNet(); };
  }, []);

  const onRetry = useCallback(async () => {
    if (await isServerReachable()) {
      dismissed.current = false;
      setVisible(false);
    }
  }, []);

  const onOk = useCallback(() => {
    dismissed.current = true;
    setVisible(false);
  }, []);

  return <NoNetworkScreen visible={visible} onRetry={onRetry} onOk={onOk} />;
}