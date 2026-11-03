// src/screens/AnimatedSplash.tsx
// Brand splash — logo settles in with a calm scale/fade, a signature
// underline draws in close beneath it, the tagline reveals word-safe
// letter by letter (no mid-word line breaks), and an IMCBS footer credit
// fades in last.

import React, { useEffect, useRef } from 'react';
import { View, Image, Text, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';
import {
  useFonts,
  Fraunces_600SemiBold,
  Fraunces_600SemiBold_Italic,
} from '@expo-google-fonts/fraunces';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';

import { colors, withAlpha } from '../constants/theme';

// Swap this require if you rename the file — Metro needs a static path.
const LOGO_WHITE = require('../../assets/Melone-white.png');

// Tagline split into WORDS (not raw characters) so each word's letters are
// grouped in their own row — a word can now only wrap as a whole unit,
// never mid-word (this is what was cutting "restaurant" onto line two).
const TAGLINE_WORDS: { text: string; accent: boolean }[] = [
  { text: 'the', accent: false },
  { text: 'smarter', accent: false },
  { text: 'way', accent: false },
  { text: 'to', accent: false },
  { text: 'manage', accent: false },
  { text: 'your', accent: false },
  { text: 'restaurant', accent: true },
];

const TOTAL_LETTERS = TAGLINE_WORDS.reduce((sum, w) => sum + w.text.length, 0);

interface AnimatedSplashProps {
  onFinish: () => void;
}

const AnimatedSplash: React.FC<AnimatedSplashProps> = ({ onFinish }) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const logoWidth = Math.min(windowWidth * 0.92, 460);
  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_600SemiBold_Italic,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.92)).current;
  const underlineAnim = useRef(new Animated.Value(0)).current;
  const letterAnims = useRef(
    Array.from({ length: TOTAL_LETTERS }, () => new Animated.Value(0))
  ).current;
  const footerAnim = useRef(new Animated.Value(0)).current;
  const screenFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!fontsLoaded) return;

    const letterReveal = letterAnims.map((val) =>
      Animated.timing(val, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    );

    Animated.sequence([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 480,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 480,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(underlineAnim, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.stagger(18, letterReveal),
      Animated.timing(footerAnim, {
        toValue: 1,
        duration: 380,
        useNativeDriver: true,
      }),
      Animated.delay(550),
      Animated.timing(screenFade, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onFinish();
    });
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return <View style={styles.root} />;
  }

  let letterCursor = 0;

  return (
    <Animated.View style={[styles.root, { opacity: screenFade }]}>
      <Animated.Image
        source={LOGO_WHITE}
        resizeMode="contain"
        style={[
          styles.logo,
          {
            width: logoWidth,
            height: Math.min(220, Math.max(130, windowHeight * 0.3)),
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          },
        ]}
      />

      <Animated.View
        style={[styles.underline, { transform: [{ scaleX: underlineAnim }] }]}
      />

      <View style={styles.taglineRow}>
        {TAGLINE_WORDS.map((word, wIdx) => (
          <View key={wIdx} style={styles.wordGroup}>
            {word.text.split('').map((char, cIdx) => {
              const anim = letterAnims[letterCursor];
              letterCursor += 1;
              return (
                <Animated.Text
                  key={cIdx}
                  style={[
                    word.accent ? styles.taglineAccent : styles.tagline,
                    {
                      opacity: anim,
                      transform: [
                        {
                          translateY: anim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [6, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  {char}
                </Animated.Text>
              );
            })}
          </View>
        ))}
      </View>

      <Animated.View style={[styles.footer, { opacity: footerAnim }]}>
        <Text style={styles.footerText}>
          An <Text style={styles.footerBrand}>IMCBS</Text> PRODUCT
        </Text>
      </Animated.View>
    </Animated.View>
  );
};

export default AnimatedSplash;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    // bigger stage — "contain" still preserves your PNG's real aspect ratio
  },
  underline: {
    height: 3,
    width: 130,
    borderRadius: 2,
    backgroundColor: colors.orange,
    marginTop: 4, // pulled tighter to the logo
  },
  taglineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 26,
    paddingHorizontal: 20,
  },
  wordGroup: {
    flexDirection: 'row',
    marginRight: 6,
    marginBottom: 2,
  },
  tagline: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 15,
    color: withAlpha(colors.white, 0.9),
  },
  taglineAccent: {
    fontFamily: 'Fraunces_600SemiBold_Italic',
    fontSize: 15,
    color: colors.orange,
  },
  footer: {
    position: 'absolute',
    bottom: 48,
  },
  footerText: {
    fontSize: 11,
    letterSpacing: 1.4,
    color: withAlpha(colors.white, 0.55),
  },
  footerBrand: {
    color: colors.orange,
    fontWeight: '700',
  },
});
