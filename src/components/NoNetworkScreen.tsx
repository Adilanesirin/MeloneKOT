// src/components/NoNetworkScreen.tsx
// Full-screen green "no internet" screen with a panicking cartoon waiter
// running back and forth with a cloche. Pure Views + Animated (no extra packages).

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Modal,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';

import { colors, spacing, radius } from '../constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');
const WAITER_W = 130;
const TRAVEL = SCREEN_W - WAITER_W - 24; // walking distance across the screen

const MESSAGES = [
  'No WiFi?! 😱',
  'Where did the internet go?!',
  "My orders are stuck! 😰",
  'Somebody call IT! 📞',
  "I can't send the KOT! 🍽️",
];

// ---------------------------------------------------------------------------
// Helpers: a 0 -> 1 -> 0 loop, and a falling sweat drop
// ---------------------------------------------------------------------------
const usePingPong = (duration: number, easing: (v: number) => number = Easing.inOut(Easing.quad)) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration, easing, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration, easing, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return v;
};

const SweatDrop: React.FC<{ delay: number; left: number; top: number }> = ({ delay, left, top }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: true })
    );
    const t = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, []);
  return (
    <Animated.View
      style={[
        styles.sweat,
        {
          left,
          top,
          opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, 28] }) }],
        },
      ]}
    />
  );
};

// ---------------------------------------------------------------------------
// The waiter (faces right)
// ---------------------------------------------------------------------------
const Waiter: React.FC = () => {
  const walk = usePingPong(170); // fast, panicked leg swing
  const shake = usePingPong(60, Easing.linear); // nervous trembling
  const wob = usePingPong(220); // cloche wobble + screaming mouth

  const swing = (a: string, b: string) => ({
    transform: [{ rotate: walk.interpolate({ inputRange: [0, 1], outputRange: [a, b] }) }],
  });

  const bob = walk.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -7, 0] });
  const shakeX = shake.interpolate({ inputRange: [0, 1], outputRange: [-1.5, 1.5] });

  return (
    <View style={styles.waiter}>
      <View style={styles.shadow} />

      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateY: bob }, { translateX: shakeX }, { rotate: '4deg' }] },
        ]}
      >
        {/* legs */}
        <Animated.View style={[styles.legBox, { left: 60 }, swing('30deg', '-30deg')]}>
          <View style={styles.leg}>
            <View style={styles.shoe} />
          </View>
        </Animated.View>
        <Animated.View style={[styles.legBox, { left: 38 }, swing('-30deg', '30deg')]}>
          <View style={styles.leg}>
            <View style={styles.shoe} />
          </View>
        </Animated.View>

        {/* far arm (swinging) */}
        <Animated.View style={[styles.armBox, { left: 34 }, swing('28deg', '-28deg')]}>
          <View style={styles.arm}>
            <View style={styles.hand} />
          </View>
        </Animated.View>

        {/* body: vest, shirt strip, bow tie, buttons */}
        <View style={styles.body}>
          <View style={styles.shirt} />
          <View style={styles.bowTie} />
          <View style={styles.bowKnot} />
          <View style={[styles.button, { top: 24 }]} />
          <View style={[styles.button, { top: 34 }]} />
        </View>

        {/* near arm, raised, holding the cloche */}
        <View style={[styles.armBox, { left: 74, transform: [{ rotate: '-135deg' }] }]}>
          <View style={[styles.arm, { backgroundColor: '#FFFFFF' }]}>
            <View style={styles.hand} />
          </View>
        </View>
        <Animated.View
          style={{
            position: 'absolute',
            left: 85,
            top: -6,
            transform: [
              { rotate: wob.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '12deg'] }) },
            ],
          }}
        >
          <MaterialCommunityIcons name="room-service" size={46} color="#E8ECEA" />
        </Animated.View>

        {/* head */}
        <View style={styles.head}>
          <View style={styles.hair} />
          <View style={[styles.brow, { left: 7, transform: [{ rotate: '-16deg' }] }]} />
          <View style={[styles.brow, { left: 25, transform: [{ rotate: '16deg' }] }]} />
          <View style={[styles.eye, { left: 8 }]}>
            <View style={styles.pupil} />
          </View>
          <View style={[styles.eye, { left: 24 }]}>
            <View style={styles.pupil} />
          </View>
          <View style={styles.moustache} />
          <Animated.View
            style={[
              styles.mouth,
              {
                transform: [
                  { scaleY: wob.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.25] }) },
                ],
              },
            ]}
          />
        </View>

        {/* sweat */}
        <SweatDrop delay={0} left={30} top={26} />
        <SweatDrop delay={450} left={24} top={10} />
      </Animated.View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Stage: walks right, turns around, walks left... with a speech bubble
// ---------------------------------------------------------------------------
const WaiterScene: React.FC = () => {
  const x = useRef(new Animated.Value(0)).current;
  const turn = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const [msg, setMsg] = useState(0);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(x, { toValue: 1, duration: 3400, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(turn, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(x, { toValue: 0, duration: 3400, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(turn, { toValue: 0, duration: 260, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setMsg((m) => (m + 1) % MESSAGES.length), 2600);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
  }, [msg]);

  return (
    <View style={styles.stage}>
      <MaterialCommunityIcons name="wifi-off" size={120} color="rgba(255,255,255,0.07)" style={styles.bgWifi} />
      <View style={styles.floor} />

      <Animated.View
        style={[
          styles.walker,
          { transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] }) }] },
        ]}
      >
        {/* speech bubble (not flipped, so the text never mirrors) */}
        <Animated.View
          style={[
            styles.bubbleWrap,
            {
              opacity: pop,
              transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
            },
          ]}
        >
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>{MESSAGES[msg]}</Text>
          </View>
          <View style={styles.bubbleTail} />
        </Animated.View>

        {/* waiter flips when he turns around */}
        <Animated.View
          style={{ transform: [{ scaleX: turn.interpolate({ inputRange: [0, 1], outputRange: [1, -1] }) }] }}
        >
          <Waiter />
        </Animated.View>
      </Animated.View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
interface Props {
  visible: boolean;
}

const NoNetworkScreen: React.FC<Props> = ({ visible }) => {
  const [checking, setChecking] = useState(false);

  const retry = async () => {
    setChecking(true);
    await NetInfo.refresh(); // if the connection is back, `visible` turns false and this closes
    setTimeout(() => setChecking(false), 700);
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      presentationStyle="fullScreen"
      onRequestClose={() => {}}
    >
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />

        <WaiterScene />

        <View style={styles.content}>
          <Text style={styles.title}>No internet connection</Text>
          <Text style={styles.message}>
            Our waiter is running around in panic! Check your Wi-Fi or mobile data and try again.
          </Text>

          <TouchableOpacity activeOpacity={0.9} onPress={retry} disabled={checking} style={styles.btn}>
            {checking ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <>
                <MaterialCommunityIcons name="refresh" size={19} color={colors.ink} />
                <Text style={styles.btnText}>Try again</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            An <Text style={styles.footerBrand}>IMCBS</Text> PRODUCT
          </Text>
        </View>
      </View>
    </Modal>
  );
};

export default NoNetworkScreen;

const SKIN = '#F5C9A0';
const DARK = '#2B2B2B';
const HAIR = '#2A1B12';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.ink,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
  },
  title: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 28,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  message: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14.5,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 300,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    minWidth: 190,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.orange,
    marginTop: spacing.xl,
  },
  btnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: colors.ink },
  footer: { position: 'absolute', bottom: 48, alignSelf: 'center' },
  footerText: { fontSize: 11, letterSpacing: 1.4, color: 'rgba(255,255,255,0.55)' },
  footerBrand: { color: colors.orange, fontWeight: '700' },

  // stage
  stage: { width: SCREEN_W, height: 250 },
  bgWifi: { position: 'absolute', top: 70, left: (SCREEN_W - 120) / 2 },
  floor: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 232,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  walker: { position: 'absolute', left: 12, top: 68, width: WAITER_W, height: 175 },

  // speech bubble
  bubbleWrap: {
    position: 'absolute',
    top: -68,
    left: -20,
    width: 170,
    height: 62,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: 160,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  bubbleText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12.5,
    color: colors.ink,
    textAlign: 'center',
  },
  bubbleTail: {
    width: 10,
    height: 10,
    backgroundColor: '#FFFFFF',
    marginTop: -5,
    transform: [{ rotate: '45deg' }],
  },

  // waiter parts (coordinates inside a 130 x 175 box)
  waiter: { width: WAITER_W, height: 175 },
  shadow: {
    position: 'absolute',
    left: 26,
    top: 158,
    width: 84,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  legBox: { position: 'absolute', top: 70, width: 16, height: 96 },
  leg: {
    position: 'absolute',
    top: 48,
    left: 0,
    width: 16,
    height: 44,
    borderRadius: 6,
    backgroundColor: DARK,
  },
  shoe: {
    position: 'absolute',
    bottom: -2,
    left: 0,
    width: 24,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#4A2C1A',
  },
  armBox: { position: 'absolute', top: 26, width: 12, height: 84 },
  arm: {
    position: 'absolute',
    top: 42,
    left: 0,
    width: 12,
    height: 38,
    borderRadius: 6,
    backgroundColor: '#EDEDED',
  },
  hand: {
    position: 'absolute',
    bottom: -4,
    left: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: SKIN,
  },
  body: {
    position: 'absolute',
    left: 36,
    top: 58,
    width: 48,
    height: 62,
    borderRadius: 12,
    backgroundColor: DARK,
  },
  shirt: {
    position: 'absolute',
    left: 15,
    top: 0,
    width: 18,
    height: 48,
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  bowTie: {
    position: 'absolute',
    left: 15,
    top: 3,
    width: 18,
    height: 10,
    borderRadius: 3,
    backgroundColor: colors.orange,
  },
  bowKnot: {
    position: 'absolute',
    left: 21,
    top: 3,
    width: 6,
    height: 10,
    backgroundColor: '#B8780A',
  },
  button: {
    position: 'absolute',
    left: 22.5,
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#9AA3A0',
  },

  // head + face (44 x 44)
  head: {
    position: 'absolute',
    left: 38,
    top: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: SKIN,
    overflow: 'hidden',
  },
  hair: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 44,
    height: 13,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: HAIR,
  },
  brow: { position: 'absolute', top: 14, width: 11, height: 3, borderRadius: 2, backgroundColor: HAIR },
  eye: {
    position: 'absolute',
    top: 19,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 1.5,
  },
  pupil: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#111' },
  moustache: {
    position: 'absolute',
    left: 10,
    top: 30,
    width: 24,
    height: 6,
    borderRadius: 3,
    backgroundColor: HAIR,
  },
  mouth: {
    position: 'absolute',
    left: 16,
    top: 34,
    width: 12,
    height: 9,
    borderRadius: 6,
    backgroundColor: '#7A1F1F',
  },
  sweat: {
    position: 'absolute',
    width: 8,
    height: 11,
    borderRadius: 5,
    backgroundColor: '#8ED1FF',
  },
});