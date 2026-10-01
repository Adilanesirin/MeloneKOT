// src/screens/LoginScreen.tsx
// Brand-accurate premium login — warm cream background, deep-green wordmark,
// editorial serif headline (Fraunces) + clean sans body (Inter), orange CTA.

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
  ActivityIndicator,
  Dimensions,
  StatusBar,
  Image,
  Modal,
  Pressable,
  Linking,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  useFonts,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
  Fraunces_600SemiBold_Italic,
} from '@expo-google-fonts/fraunces';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';

import { colors, gradients, spacing, radius, shadow } from '../constants/theme';
import { login } from '../services/api';
import {
  saveSession,
  saveAuthToken,
  saveRememberedCredentials,
  getRememberedCredentials,
  clearRememberedCredentials,
} from '../services/storage';
import { LoginScreenProps } from '../navigation/AppNavigator';

const { width: SCREEN_W } = Dimensions.get('window');

const LINKS = {
  website: 'https://imcbs.com/',
  email: 'mailto:info@imcbs.com',
  instagram: 'https://www.instagram.com/imcbusinesssolution/',
};

const openLink = (url: string) => {
  Linking.openURL(url).catch(() => {});
};

const APP_VERSION =
  Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? '';

// ---------------------------------------------------------------------------
// Animated input — icon + focus ring, matches the site's clean field style
// ---------------------------------------------------------------------------
interface AnimatedInputProps {
  icon: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
   showToggle?: boolean;
  keyboardType?: 'default' | 'email-address';
  onFocusChange?: (focused: boolean) => void;
}

const AnimatedInput: React.FC<AnimatedInputProps> = ({
  icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  showToggle,
  keyboardType = 'default',
  onFocusChange,
}) => {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secureTextEntry);
  const focusAnim = useRef(new Animated.Value(0)).current;

  const animateTo = (toValue: number) => {
    Animated.timing(focusAnim, { toValue, duration: 180, useNativeDriver: false }).start();
  };

  const borderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, colors.ink],
  });

  return (
    <Animated.View
      style={[
        styles.inputWrap,
        { borderColor },
        focused && shadow.soft,
      ]}
    >
      <Ionicons
        name={icon}
        size={18}
        color={focused ? colors.ink : colors.muted}
        style={styles.inputIcon}
      />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        value={value}
        onChangeText={onChangeText}
                onFocus={() => {
          setFocused(true);
          animateTo(1);
          onFocusChange?.(true);
        }}
        onBlur={() => {
          setFocused(false);
          animateTo(0);
          onFocusChange?.(false);
        }}
        secureTextEntry={hidden}
        autoCapitalize="none"
        keyboardType={keyboardType}
      />
      {showToggle && (
        <TouchableOpacity onPress={() => setHidden((h) => !h)} hitSlop={10}>
          <Ionicons
            name={hidden ? 'eye-off-outline' : 'eye-outline'}
            size={18}
            color={colors.muted}
          />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

// ---------------------------------------------------------------------------
// Orange gradient CTA — the site's signature button treatment
// ---------------------------------------------------------------------------
interface CTAButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  ready?: boolean; // all fields filled -> gentle pulse
}

const CTAButton: React.FC<CTAButtonProps> = ({ label, onPress, loading, ready }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const [btnW, setBtnW] = useState(0);

  // light sweep across the button every few seconds
  useEffect(() => {
    if (loading) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2600),
        Animated.timing(sweep, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [loading]);

  // gentle "ready" pulse once every field is filled
  useEffect(() => {
    if (!ready || loading) {
      pulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.025, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [ready, loading]);

  const pressIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40 }).start();
  const pressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }).start();

  return (
      <Animated.View
      style={{ transform: [{ scale }, { scale: pulse }] }}
      onLayout={(e) => setBtnW(e.nativeEvent.layout.width)}
    >
      <TouchableOpacity
        activeOpacity={0.92}
        disabled={loading}
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
      >
        <LinearGradient
          colors={gradients.button}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
                   style={[styles.cta, shadow.button]}
        >
          {/* shimmer sweep (clipped in its own layer so the button shadow stays intact) */}
          <View
            pointerEvents="none"
            style={{ ...StyleSheet.absoluteFillObject, borderRadius: radius.md, overflow: 'hidden' }}
          >
            <Animated.View
              style={{
                position: 'absolute',
                top: -20,
                width: 50,
                height: 94,
                transform: [
                  { translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-70, btnW + 20] }) },
                  { rotate: '20deg' },
                ],
              }}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>

          {loading ? (
            <>
              <RunningWaiter />
              <Text style={[styles.ctaText, { marginLeft: 8 }]}>Signing you in…</Text>
            </>
          ) : (
            <>
              <Text style={styles.ctaText}>{label}</Text>
              <Ionicons name="arrow-forward" size={17} color={colors.orange} style={{ marginLeft: 8 }} />
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ---------------------------------------------------------------------------
// #6 Tiny waiter running in place (shown inside the Sign In button while loading)
// ---------------------------------------------------------------------------
const RunningWaiter: React.FC = () => {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 230, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 230, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const bob = v.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  const lean = v.interpolate({ inputRange: [0, 1], outputRange: ['-7deg', '7deg'] });

  return (
    <View style={{ width: 34, height: 30, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ transform: [{ translateY: bob }, { rotate: lean }] }}>
        <MaterialCommunityIcons name="run-fast" size={24} color={colors.orange} />
      </Animated.View>
      <Animated.View style={{ position: 'absolute', top: -3, right: -3, transform: [{ translateY: bob }] }}>
        <MaterialCommunityIcons name="room-service" size={14} color={colors.orange} />
      </Animated.View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// #5 Chef-hat waiter peeking over the top edge of the form card.
// Pops up, waves, ducks down, repeats. Covers his eyes while the password
// field is focused. Sits BEHIND the card (card is a later sibling).
// ---------------------------------------------------------------------------
const PEEK_H = 104; // waiter box height
const PEEK_HIDDEN = 12; // how much of the bottom sits behind the card
const PEEK_SCALE = 0.8; // 1 = current size, lower = smaller
const FINGERS = [
  { left: 4, top: 4, h: 11 },
  { left: 8.7, top: 1, h: 14 },
  { left: 13.4, top: 2, h: 13 },
  { left: 18.1, top: 5, h: 10 },
];

// sleeve + cuff + full hand (4 fingers, thumb, palm). It sits inside a wrapper that is
// twice the arm length, so rotating the wrapper pivots the whole arm at the elbow.
const WaiterArm: React.FC<{ thumbSide: 'left' | 'right' }> = ({ thumbSide }) => (
  <>
    <View style={styles.pwSleeve} />
    <View style={styles.pwCuff} />
    <View
      style={[
        styles.pwThumb,
        thumbSide === 'left'
          ? { left: -1, transform: [{ rotate: '-32deg' }] }
          : { right: -1, transform: [{ rotate: '32deg' }] },
      ]}
    />
    <View style={styles.pwPalm} />
    {FINGERS.map((f, i) => (
      <View key={i} style={[styles.pwFinger, { left: f.left, top: f.top, height: f.h }]} />
    ))}
  </>
);
const PeekingWaiter: React.FC<{ covering: boolean; looking?: boolean; progress?: number }> = ({
  covering,
  looking = false,
  progress = 0,
}) => {
    const rise = useRef(new Animated.Value(0)).current; // 0 hidden -> 1 up
  const hi = useRef(new Animated.Value(0)).current; // right hand raised
  const wv = useRef(new Animated.Value(0)).current; // wave back-and-forth
   const cover = useRef(new Animated.Value(0)).current; // hands over eyes
  const blink = useRef(new Animated.Value(1)).current; // 1 = eyes open, 0.1 = shut

  // blink every ~3 seconds
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(3000),
        Animated.timing(blink, { toValue: 0.1, duration: 90, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 110, useNativeDriver: true }),
      ])
    );
      loop.start();
    return () => loop.stop();
  }, []);

  // eyes glance at the field being typed in
  const lookX = useRef(new Animated.Value(0)).current;
  const lookY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const active = looking && !covering;
    Animated.parallel([
      Animated.spring(lookX, {
        toValue: active ? -3 + 6 * progress : 0, // left -> right as the text grows
        friction: 7,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.spring(lookY, {
        toValue: active ? 2 : 0, // looking down at the field
        friction: 7,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [looking, covering, progress]);

  useEffect(() => {
    if (covering) {
      Animated.parallel([
        Animated.spring(rise, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
        Animated.timing(hi, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(wv, { toValue: 0, duration: 100, useNativeDriver: true }),
        Animated.spring(cover, { toValue: 1, friction: 7, tension: 120, useNativeDriver: true }),
      ]).start();
      return undefined;
    }

    Animated.timing(cover, { toValue: 0, duration: 180, useNativeDriver: true }).start();

    const waves: Animated.CompositeAnimation[] = [];
    for (let i = 0; i < 4; i++) {
      waves.push(
        Animated.timing(wv, { toValue: 1, duration: 170, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(wv, { toValue: 0, duration: 170, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
      );
    }

    const cycle = Animated.loop(
      Animated.sequence([
        Animated.timing(rise, { toValue: 0, duration: 300, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.delay(1800),
        Animated.spring(rise, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
        Animated.timing(hi, { toValue: 1, duration: 200, useNativeDriver: true }),
        ...waves,
        Animated.timing(hi, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.delay(500),
      ])
    );
    cycle.start();
    return () => cycle.stop();
  }, [covering]);

  return (
    <View style={styles.peekBox} pointerEvents="none">
            <Animated.View
        style={[
          styles.peekWaiter,
          {
            transform: [
              { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [PEEK_H, 0] }) },
              { translateY: (PEEK_H * (1 - PEEK_SCALE)) / 2 }, // keeps his bottom tucked behind the card
              { scale: PEEK_SCALE },
            ],
          },
        ]}
      >
                 {/* ears */}
        <View style={[styles.pwEar, { left: 27 }]} />
        <View style={[styles.pwEar, { left: 66 }]} />

        {/* uniform: green jacket, white shirt, orange bow tie */}
        <View style={styles.pwBody} />
        <View style={[styles.pwShoulder, { left: 10 }]} />
        <View style={[styles.pwShoulder, { left: 66 }]} />
        <View style={styles.pwShirt} />
        <View style={[styles.pwBowWing, { left: 38, transform: [{ rotate: '-10deg' }] }]} />
        <View style={[styles.pwBowWing, { left: 50, transform: [{ rotate: '10deg' }] }]} />
        <View style={styles.pwBowKnot} />

        {/* head + face */}
        <View style={styles.pwHead} />
        <View style={[styles.pwBrow, { left: 37, transform: [{ rotate: '-8deg' }] }]} />
        <View style={[styles.pwBrow, { left: 55, transform: [{ rotate: '8deg' }] }]} />
        <Animated.View
          style={[styles.pwEye, { left: 38, transform: [{ translateX: lookX }, { translateY: lookY }, { scaleY: blink }] }]}
        >
          <View style={styles.pwEyeShine} />
        </Animated.View>
        <Animated.View
          style={[styles.pwEye, { left: 55, transform: [{ translateX: lookX }, { translateY: lookY }, { scaleY: blink }] }]}
        >
          <View style={styles.pwEyeShine} />
        </Animated.View>
        <View style={styles.pwNose} />
        <View style={[styles.pwCheek, { left: 31 }]} />
        <View style={[styles.pwCheek, { left: 60 }]} />
        <View style={styles.pwMouth}>
          <View style={styles.pwTongue} />
        </View>

        {/* chef hat: three puffs + band */}
        <View style={[styles.pwPuff, { left: 22, top: 8, width: 22, height: 22 }]} />
        <View style={[styles.pwPuff, { left: 56, top: 8, width: 22, height: 22 }]} />
        <View style={[styles.pwPuff, { left: 36, top: 0, width: 28, height: 28 }]} />
        <View style={styles.pwHatBand} />

               {/* left arm: holds the card border (only the fingers show); swings up to cover the eyes */}
        <Animated.View
          style={[
            styles.pwArm,
            {
              left: 1,
              top: 74,
              transform: [
                { translateY: cover.interpolate({ inputRange: [0, 1], outputRange: [0, -48] }) },
                { rotate: cover.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '40deg'] }) },
              ],
            },
          ]}
        >
          <WaiterArm thumbSide="right" />
        </Animated.View>

        {/* right arm: always raised, only this hand waves; tilts in to cover the eyes */}
        <Animated.View
          style={[
            styles.pwArm,
            {
              left: 73,
              top: 26,
              transform: [
                { rotate: cover.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-26deg'] }) },
                { rotate: wv.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', '14deg'] }) },
              ],
            },
          ]}
        >
          <WaiterArm thumbSide="left" />
        </Animated.View>
      </Animated.View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// #7 Cloche reveal on success: full green overlay, the cloche lid lifts,
// a check pops out, then onDone() navigates.
// ---------------------------------------------------------------------------
const SuccessReveal: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const fade = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(120),
      Animated.parallel([
        Animated.timing(lift, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(140),
          Animated.parallel([
            Animated.spring(pop, { toValue: 1, friction: 5, tension: 130, useNativeDriver: true }),
            Animated.timing(text, { toValue: 1, duration: 300, useNativeDriver: true }),
          ]),
        ]),
      ]),
      Animated.delay(400),
    ]).start(({ finished }) => {
      if (finished) onDone();
    });
  }, []);

  const scalePop = pop.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });

 return (
  <Modal transparent visible animationType="none" statusBarTranslucent>
    <Animated.View style={[styles.successOverlay, { opacity: fade }]}>
      <View style={styles.cloStage}>
        <View style={styles.cloPlate} />

        {/* the check, hidden under the lid until it lifts */}
        <Animated.View style={[styles.cloCheck, { opacity: pop, transform: [{ scale: scalePop }] }]}>
          <Ionicons name="checkmark" size={32} color={colors.ink} />
        </Animated.View>

        {/* sparkles */}
        <Animated.View style={{ position: 'absolute', left: 6, top: 26, opacity: pop, transform: [{ scale: scalePop }] }}>
          <MaterialCommunityIcons name="star-four-points" size={16} color={colors.orange} />
        </Animated.View>
        <Animated.View style={{ position: 'absolute', right: 2, top: 12, opacity: pop, transform: [{ scale: scalePop }] }}>
          <MaterialCommunityIcons name="star-four-points" size={12} color="#FFFFFF" />
        </Animated.View>

        {/* the lid */}
        <Animated.View
          style={[
            styles.cloDome,
            {
              transform: [
                { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -54] }) },
                { translateX: lift.interpolate({ inputRange: [0, 1], outputRange: [0, 26] }) },
                { rotate: lift.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-14deg'] }) },
              ],
            },
          ]}
        >
          <View style={styles.cloKnob} />
          <View style={styles.cloTop}>
            <View style={styles.cloShine} />
          </View>
          <View style={styles.cloRim} />
        </Animated.View>
      </View>

      <Animated.View
        style={{
          opacity: text,
          alignItems: 'center',
          transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        }}
      >
        <Text style={styles.successTitle}>Welcome back!</Text>
        <Text style={styles.successSub}>Taking you to your tables…</Text>
      </Animated.View>
    </Animated.View>
  </Modal>
);
};

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Fraunces_600SemiBold_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
    const [clientId, setClientId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
   const [loading, setLoading] = useState(false);
    const [pwFocused, setPwFocused] = useState(false);
  const [textFocused, setTextFocused] = useState(false); // Client ID / Username focused
  const [typingLen, setTypingLen] = useState(0); // length of the text in the focused field
  const [showSuccess, setShowSuccess] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

   const introAnim = useRef(new Animated.Value(0)).current;
  const formAnim = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;

  const triggerShake = () => {
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0.7, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -0.7, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0.35, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  };

 useEffect(() => {
    Animated.sequence([
      Animated.timing(introAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(formAnim, { toValue: 1, duration: 480, useNativeDriver: true }),
    ]).start();

    (async () => {
      const remembered = await getRememberedCredentials();
      if (remembered) {
        setClientId(remembered.clientId);
        setUsername(remembered.username);
        setRemember(true);
      }
    })();
  }, []);

  const handleLogin = async () => {
    if (!clientId.trim() || !username.trim() || !password) {
      setStatusMsg({ type: 'error', text: 'Please enter client ID, username and password.' });
      triggerShake();
      return;
    }

    setLoading(true);
    setStatusMsg(null);
    try {
      const data = await login({ clientId, username, password });

      if (data.success && data.user && data.token) {
        // Token first, then profile: Tables reads the session on mount and
        // getSession() treats a session without a valid token as logged out.
        await saveAuthToken({
          token: data.token,
          tokenType: data.token_type,
          expiresIn: data.expires_in,
        });
        await saveSession(data.user);

        // remember-me storage doesn't block navigation
        if (remember) {
          saveRememberedCredentials({ clientId, username });
        } else {
          clearRememberedCredentials();
        }

        if (data.needs_credential_reset) {
          Alert.alert(
            'Password reset required',
            'Your administrator has asked you to change your password. Please update it soon.'
          );
        }

        setShowSuccess(true); // the reveal plays, then its onDone navigates to Tables
      } else if (data.success) {
        // success flag but no token/user -> don't half-log-in
        setStatusMsg({ type: 'error', text: 'Login response was incomplete. Please try again.' });
        triggerShake();
      } else {
        setStatusMsg({ type: 'error', text: data.message || 'Login failed' });
        triggerShake();
      }
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Network error. Please try again.',
      });
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  if (!fontsLoaded) return null;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />

      {/* soft ambient color — not a heavy hero block, just brand color breathing in the corners */}
      <View style={[styles.blob, styles.blobMint]} />
      <View style={[styles.blob, styles.blobOrange]} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ---------- Logo lockup ---------- */}
          <Animated.View
            style={{
              opacity: introAnim,
              transform: [
                {
                  translateY: introAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }),
                },
              ],
            }}
          >
            <Image
              source={require('../../assets/meloneBanner-whitebg.png')}
              style={styles.logoBanner}
              resizeMode="contain"
            />

            <Text style={styles.headline}>
              Welcome back to your{' '}
              <Text style={styles.headlineAccent}>kitchen.</Text>
            </Text>
            <Text style={styles.subtitle}>
              Sign in to manage orders & tables 
            </Text>
          </Animated.View>

          <PeekingWaiter
            covering={pwFocused}
            looking={textFocused}
            progress={Math.min(typingLen / 20, 1)}
          />


          {/* ---------- Form ---------- */}
          <Animated.View
            style={[
              styles.card,
              shadow.card,
              {
                opacity: formAnim,
                transform: [
                  {
                    translateY: formAnim.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }),
                  },
                  {
                    translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-10, 10] }),
                  },
                ],
              },
            ]}
          >
            <LinearGradient
              colors={[colors.ink, colors.orange]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.cardAccent}
            />
            
                        <AnimatedInput
              icon="key-outline"
              placeholder="Client ID"
              value={clientId}
              onChangeText={(t) => {
                setClientId(t);
                setTypingLen(t.length);
              }}
              onFocusChange={(f) => {
                setTextFocused(f);
                if (f) setTypingLen(clientId.length);
              }}
              keyboardType="default"
            />
            <View style={{ height: spacing.md }} />
            <AnimatedInput
              icon="person-outline"
              placeholder="Username"
              value={username}
              onChangeText={(t) => {
                setUsername(t);
                setTypingLen(t.length);
              }}
              onFocusChange={(f) => {
                setTextFocused(f);
                if (f) setTypingLen(username.length);
              }}
              keyboardType="default"
            />

            <View style={{ height: spacing.md }} />
              <AnimatedInput
              icon="lock-closed-outline"
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              showToggle
              onFocusChange={setPwFocused}
            />

            <View style={styles.row}>
              <TouchableOpacity
                style={styles.rememberRow}
                onPress={() => setRemember((r) => !r)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, remember && styles.checkboxChecked]}>
                  {remember && <Ionicons name="checkmark" size={12} color={colors.white} />}
                </View>
                <Text style={styles.rememberText}>Remember me</Text>
              </TouchableOpacity>

             
            </View>

            <View style={{ height: spacing.lg }} />

            <CTAButton
              label="Sign In"
              onPress={handleLogin}
              loading={loading}
              ready={!!clientId.trim() && !!username.trim() && !!password}
            />
            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>
                Powered by <Text style={styles.dividerBrand}>IMCBS</Text>
              </Text>
              <View style={styles.divider} />
            </View>

            <View style={styles.socialRow}>
            <TouchableOpacity style={styles.socialBtn} onPress={() => openLink(LINKS.website)}>
              <Ionicons name="logo-google" size={19} color={colors.ink} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.socialBtn} onPress={() => openLink(LINKS.email)}>
              <MaterialCommunityIcons name="gmail" size={21} color={colors.ink} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.socialBtn} onPress={() => openLink(LINKS.instagram)}>
              <Ionicons name="logo-instagram" size={20} color={colors.ink} />
            </TouchableOpacity>
          </View>
          </Animated.View>

          <View style={styles.footerRow}>
          <Text style={styles.footerText}>Version {APP_VERSION}</Text>
        </View>
        </ScrollView>
            </KeyboardAvoidingView>

             {/* Login error card */}
      <Modal
        visible={statusMsg?.type === 'error'}
        transparent
        animationType="fade"
        onRequestClose={() => setStatusMsg(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setStatusMsg(null)}>
          <Pressable style={[styles.alertCard, shadow.card]} onPress={() => {}}>
            <View style={styles.alertIconWrap}>
              <Ionicons name="alert-circle-outline" size={28} color={colors.error} />
            </View>
            <Text style={styles.alertTitle}>Login failed</Text>
            <Text style={styles.alertMsg}>{statusMsg?.text}</Text>

            <TouchableOpacity
              style={styles.alertBtn}
              activeOpacity={0.85}
              onPress={() => setStatusMsg(null)}
            >
              <Text style={styles.alertBtnText}>Try again</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
        </Modal>

      {showSuccess && <SuccessReveal onDone={() => navigation.replace('Tables')} />}
    </View>
  );
};

export default LoginScreen;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
  },
  blobMint: {
    width: SCREEN_W * 0.9,
    height: SCREEN_W * 0.9,
    top: -SCREEN_W * 0.45,
    left: -SCREEN_W * 0.35,
    backgroundColor: 'rgba(22,58,46,0.05)',
  },
  blobOrange: {
    width: SCREEN_W * 0.7,
    height: SCREEN_W * 0.7,
    bottom: -SCREEN_W * 0.4,
    right: -SCREEN_W * 0.3,
    backgroundColor: 'rgba(242,167,27,0.07)',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    paddingBottom: spacing.xl,
  },
logoBanner: {
  width: 340,
  height: 170,
  alignSelf: 'center',
  marginTop: spacing.lg,
  marginBottom: -spacing.sm - 58,
  shadowColor: '#161818',
  shadowOpacity: 0.12,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
},
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.badgeBg,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    marginTop: -spacing.md,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.orange,
    marginRight: 7,
  },
  badgeText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: colors.ink,
  },
  headline: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 28,
    lineHeight: 35,
    color: colors.ink,
    marginTop: spacing.md,
    maxWidth: 320,
  },
  headlineAccent: {
    fontFamily: 'Fraunces_600SemiBold_Italic',
    color: colors.orangeDeep,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.ink,
    marginTop: spacing.sm,
    maxWidth: 300,
  },
 card: {
  backgroundColor: colors.surface,
  borderRadius: radius.lg,
  padding: spacing.xl,
  marginTop: spacing.lg,          // was spacing.xxl, so the card moves up
  overflow: 'hidden',
},
  cardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: radius.md,
    backgroundColor: colors.inputBg,
    paddingHorizontal: spacing.md,
    height: 54,
  },
  inputIcon: {
    marginRight: spacing.sm,
  },
 
  input: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 14.5,
    color: colors.ink,
    height: '100%',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(22,58,46,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  alertCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
    alertIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FDECEC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
 
  alertTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 20,
    color: colors.ink,
  },
  alertMsg: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13.5,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: spacing.lg,
  },
  alertBtn: {
    width: '100%',
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.orange,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 17,
    height: 17,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginRight: spacing.xs + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  rememberText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12.5,
    color: colors.ink,
  },
 
  cta: {
    flexDirection: 'row',
    height: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
    ctaText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15.5,
    color: colors.orange,
    letterSpacing: 0.2,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.muted,
    marginHorizontal: spacing.sm,
  },
  dividerBrand: {
    fontFamily: 'Inter_700Bold' as any,
    fontWeight: '700',
    color: colors.orange,
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  socialBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: 0.4,
    color: colors.muted,
  },
     // ----- #5 peeking waiter -----
  peekBox: { height: 0 },
  peekWaiter: {
    position: 'absolute',
    right: 18,
    bottom: -(spacing.lg + PEEK_HIDDEN), // card top = peekBox + spacing.lg (card marginTop)
    width: 100,
    height: PEEK_H,
  },

  // uniform
  pwBody: {
    position: 'absolute',
    left: 22,
    top: 72,
    width: 56,
    height: 34,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.ink,
  },
  pwShoulder: {
    position: 'absolute',
    top: 78,
    width: 24,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.ink,
  },
  pwShirt: {
    position: 'absolute',
    left: 43,
    top: 72,
    width: 14,
    height: 30,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  pwBowWing: {
    position: 'absolute',
    top: 73,
    width: 12,
    height: 9,
    borderRadius: 3,
    backgroundColor: colors.orange,
  },
  pwBowKnot: {
    position: 'absolute',
    left: 47,
    top: 73,
    width: 6,
    height: 9,
    borderRadius: 3,
    backgroundColor: colors.orangeDeep,
  },

  // head + face
  pwEar: {
    position: 'absolute',
    top: 47,
    width: 7,
    height: 9,
    borderRadius: 4,
    backgroundColor: '#EDB98E',
  },
  pwHead: {
    position: 'absolute',
    left: 30,
    top: 32,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F6CFA8',
  },
  pwBrow: {
    position: 'absolute',
    top: 43,
    width: 8,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: '#5A3A28',
  },
  pwEye: {
    position: 'absolute',
    top: 47,
    width: 7,
    height: 9,
    borderRadius: 4,
    backgroundColor: '#2A1B12',
  },
  pwEyeShine: {
    position: 'absolute',
    top: 1.5,
    right: 1,
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  pwNose: {
    position: 'absolute',
    left: 47.5,
    top: 55,
    width: 5,
    height: 4,
    borderRadius: 2.5,
    backgroundColor: '#E7A97F',
  },
  pwCheek: {
    position: 'absolute',
    top: 58,
    width: 9,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(240,110,110,0.35)',
  },
  pwMouth: {
    position: 'absolute',
    left: 42,
    top: 61,
    width: 16,
    height: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    backgroundColor: '#7A1F2B',
    overflow: 'hidden',
  },
  pwTongue: {
    position: 'absolute',
    left: 4,
    bottom: -2,
    width: 8,
    height: 6,
    borderRadius: 4,
    backgroundColor: '#E8737F',
  },

  // chef hat
  pwPuff: {
    position: 'absolute',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D5DBD7',
  },
  pwHatBand: {
    position: 'absolute',
    left: 27,
    top: 24,
    width: 46,
    height: 13,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D5DBD7',
  },

  // arm (wrapper is 2x arm length so rotation pivots at the elbow)
  pwArm: {
    position: 'absolute',
    top: 66,
    width: 26,
    height: 116,
  },
  pwSleeve: {
    position: 'absolute',
    left: 5,
    top: 33,
    width: 16,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.ink,
  },
  pwCuff: {
    position: 'absolute',
    left: 3,
    top: 28,
    width: 20,
    height: 7,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D5DBD7',
  },
  pwPalm: {
    position: 'absolute',
    left: 4,
    top: 12,
    width: 18,
    height: 18,
    borderRadius: 8,
    backgroundColor: '#F6CFA8',
  },
  pwFinger: {
    position: 'absolute',
    width: 4,
    borderRadius: 2.5,
    backgroundColor: '#F6CFA8',
  },
  pwThumb: {
    position: 'absolute',
    top: 16,
    width: 5,
    height: 11,
    borderRadius: 3,
    backgroundColor: '#F6CFA8',
  },
  // ----- #7 cloche reveal -----
successOverlay: {
  flex: 1,
  backgroundColor: colors.ink,
  alignItems: 'center',
  justifyContent: 'center',
},
  cloStage: { width: 150, height: 110, marginBottom: spacing.xl },
  cloPlate: {
    position: 'absolute',
    left: 0,
    top: 100,
    width: 150,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F3F5F4',
  },
  cloCheck: {
    position: 'absolute',
    left: 49,
    top: 48,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cloDome: { position: 'absolute', left: 9, top: 24, width: 132, height: 76, alignItems: 'center' },
  cloKnob: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#CFD6D3' },
  cloTop: {
    width: 116,
    height: 54,
    borderTopLeftRadius: 58,
    borderTopRightRadius: 58,
    backgroundColor: '#E8ECEA',
    marginTop: -1,
  },
  cloShine: {
    position: 'absolute',
    left: 22,
    top: 10,
    width: 26,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  cloRim: { width: 132, height: 8, borderRadius: 4, backgroundColor: '#CFD6D3' },
  successTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 28,
    color: '#FFFFFF',
  },
  successSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 6,
  },
});