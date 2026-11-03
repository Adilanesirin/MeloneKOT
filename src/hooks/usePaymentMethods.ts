import { useEffect, useState } from 'react';
import { getPaymentMethodsWithCard, PaymentMethod } from '../services/api';

const FALLBACK: PaymentMethod[] = [
  { id: -1, code: '001', name: 'CASH' },
  { id: -2, code: '002', name: 'UPI' },
  { id: -3, code: '003', name: 'CARD' },
];

export const methodLabel = (m: PaymentMethod) => m.name.trim().toUpperCase();

export const methodIcon = (name: string) =>
  /cash/i.test(name) ? 'cash-outline'
  : /upi/i.test(name) ? 'phone-portrait-outline'
  : /card/i.test(name) ? 'card-outline'
  : 'wallet-outline';

export function usePaymentMethods(enabled = true) {
  const [methods, setMethods] = useState<PaymentMethod[]>(FALLBACK);
  const [selected, setSelected] = useState<string>('CASH');

  useEffect(() => {
    if (!enabled) return;
    getPaymentMethodsWithCard()
      .then((list) => {
        if (!list.length) return;
        setMethods(list);
        setSelected((cur) => list.some((m) => methodLabel(m) === cur) ? cur : methodLabel(list[0]));
      })
      .catch(() => {}); // keep fallback (CASH / UPI / CARD)
  }, [enabled]);

  return { methods, selected, setSelected };
}