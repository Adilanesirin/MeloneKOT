import { useCallback, useRef } from 'react';
import { FocusEvent, ScrollView } from 'react-native';

/** Scrolls a form field above the keyboard as soon as it receives focus. */
export function useScrollToFocusedInput() {
  const scrollViewRef = useRef<ScrollView>(null);

  const onInputFocus = useCallback((event: FocusEvent) => {
    scrollViewRef.current?.scrollResponderScrollNativeHandleToKeyboard(
      event.nativeEvent.target,
      24,
      true,
    );
  }, []);

  return { scrollViewRef, onInputFocus };
}
