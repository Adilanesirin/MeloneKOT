import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/theme';

type ModuleName = 'KOT' | 'Sales';

const BAR_H = 64;
const BUBBLE = 56;
const LIFT = 28;        // how far the bubble sticks out above the bar
const NOTCH_W = 46;     // half-width of the cut-out
const NOTCH_D = 32;     // depth of the cut-out
const R = 28;           // outer corner radius
const SALES = colors.orange;
const SALES_DARK = colors.orangeDark;

const centerFor = (p: number, W: number, radius = R, notchWidth = NOTCH_W) => {
  const cx = W * (0.25 + 0.5 * p);
  return Math.min(Math.max(cx, radius + notchWidth), W - radius - notchWidth);
};

const buildPath = (p: number, W: number, barHeight = BAR_H, notchWidth = NOTCH_W, notchDepth = NOTCH_D, radius = R) => {
  if (!W) return '';
  const cx = centerFor(p, W, radius, notchWidth);
  const l = cx - notchWidth;
  const r = cx + notchWidth;
  return [
    `M${radius},0 H${l}`,
    `C${l + notchWidth * 0.48},0 ${cx - notchWidth * 0.56},${notchDepth} ${cx},${notchDepth}`,
    `C${cx + notchWidth * 0.56},${notchDepth} ${r - notchWidth * 0.48},0 ${r},0`,
    `H${W - radius} A${radius},${radius} 0 0 1 ${W},${radius}`,
    `V${barHeight - radius} A${radius},${radius} 0 0 1 ${W - radius},${barHeight}`,
    `H${radius} A${radius},${radius} 0 0 1 0,${barHeight - radius}`,
    `V${radius} A${radius},${radius} 0 0 1 ${radius},0 Z`,
  ].join(' ');
};

export default function ModuleSwitcher({ active, onChange }: { active: ModuleName; onChange: (module: ModuleName) => void }) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const compact = Math.min(windowWidth, windowHeight) >= 600 && windowWidth > windowHeight;
  const barHeight = compact ? 38 : BAR_H;
  const bubbleSize = compact ? 34 : BUBBLE;
  const lift = compact ? 14 : LIFT;
  const notchWidth = compact ? 28 : NOTCH_W;
  const notchDepth = compact ? 16 : NOTCH_D;
  const radius = compact ? 17 : R;
  const [width, setWidth] = useState(0);
  const progress = useRef(new Animated.Value(active === 'KOT' ? 0 : 1)).current; // JS-driven
  const pop = useRef(new Animated.Value(1)).current;                              // native-driven
  const pathRef = useRef<any>(null);
  const first = useRef(true);

  // Redraw the notch on every animation frame.
  useEffect(() => {
    const id = progress.addListener(({ value }) => {
      pathRef.current?.setNativeProps({ d: buildPath(value, width, barHeight, notchWidth, notchDepth, radius) });
    });
    return () => progress.removeListener(id);
  }, [progress, width, barHeight, notchWidth, notchDepth, radius]);

  useEffect(() => {
    Animated.spring(progress, {
      toValue: active === 'KOT' ? 0 : 1,
      damping: 14, stiffness: 140, mass: 0.9,
      useNativeDriver: false,
    }).start();
    if (first.current) { first.current = false; return; }
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, damping: 8, stiffness: 180, useNativeDriver: true }).start();
  }, [active, progress, pop]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const bubbleX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [width * 0.25 - bubbleSize / 2, width * 0.75 - bubbleSize / 2],
  });
  const bubbleBg = progress.interpolate({ inputRange: [0, 1], outputRange: [colors.ink, SALES] });
  const kotIconOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const salesIconOpacity = progress;
  const popScale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
  const popRotate = pop.interpolate({ inputRange: [0, 1], outputRange: ['-30deg', '0deg'] });

  const kotLabel = progress.interpolate({ inputRange: [0, 1], outputRange: [colors.ink, colors.muted] });
  const salesLabel = progress.interpolate({ inputRange: [0, 1], outputRange: [colors.muted, SALES_DARK] });
  // each tab's own icon fades out while the bubble sits above it
  const kotTabIcon = progress;                                   // 0 when active
  const salesTabIcon = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  if (compact) {
    return (
      <View pointerEvents="box-none" style={[styles.compactOverlay, { bottom: Math.max(insets.bottom, 4) }]}>
        <View style={styles.compactPanel}>
          {(['KOT', 'Sales'] as const).map((module) => {
            const selected = active === module;
            return (
              <TouchableOpacity
                key={module}
                accessibilityRole="tab"
                accessibilityLabel={module}
                accessibilityState={{ selected }}
                activeOpacity={0.85}
                onPress={() => onChange(module)}
                style={[styles.compactTab, selected && (module === 'KOT' ? styles.compactKotActive : styles.compactSalesActive)]}
              >
                <Ionicons name={module === 'KOT' ? 'restaurant-outline' : 'receipt-outline'} size={16} color={selected ? (module === 'KOT' ? colors.white : colors.orangeText) : colors.muted} />
                <Animated.Text style={[styles.compactLabel, selected && (module === 'KOT' ? styles.compactKotLabelActive : styles.compactSalesLabelActive)]}>{module}</Animated.Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.safe, { paddingTop: lift + 2, paddingBottom: Math.max(insets.bottom, compact ? 2 : 10), paddingHorizontal: compact ? 12 : 16 }]}>
      <View style={[styles.wrap, { height: barHeight }]} onLayout={onLayout}>
        {width > 0 && (
          <Svg width={width} height={barHeight} style={StyleSheet.absoluteFill}>
            <Path ref={pathRef} d={buildPath(active === 'KOT' ? 0 : 1, width, barHeight, notchWidth, notchDepth, radius)} fill={colors.white} stroke={colors.border} strokeWidth={1} />
          </Svg>
        )}

        {/* floating bubble */}
        <Animated.View pointerEvents="none" style={[styles.bubble, { top: -lift, width: bubbleSize, height: bubbleSize, borderRadius: bubbleSize / 2, backgroundColor: bubbleBg, transform: [{ translateX: bubbleX }] }]}>
          <Animated.View style={[styles.bubbleInner, compact && { width: 22, height: 22 }, { transform: [{ scale: popScale }, { rotate: popRotate }] }]}>
            <Animated.View style={[StyleSheet.absoluteFill, styles.center, { opacity: kotIconOpacity }]}>
              <Ionicons name="restaurant" size={compact ? 19 : 24} color={colors.white} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, styles.center, { opacity: salesIconOpacity }]}>
              <Ionicons name="receipt" size={compact ? 19 : 24} color={colors.orangeText} />
            </Animated.View>
          </Animated.View>
        </Animated.View>

        {/* tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity accessibilityRole="tab" accessibilityLabel="KOT" accessibilityState={{ selected: active === 'KOT' }} activeOpacity={0.8} onPress={() => onChange('KOT')} style={styles.tab}>
            <Animated.View style={{ opacity: kotTabIcon }}>
              <Ionicons name="restaurant-outline" size={compact ? 18 : 22} color={colors.muted} />
            </Animated.View>
            <Animated.Text style={[styles.label, compact && styles.labelCompact, { color: kotLabel }]}>KOT</Animated.Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="tab" accessibilityLabel="Sales" accessibilityState={{ selected: active === 'Sales' }} activeOpacity={0.8} onPress={() => onChange('Sales')} style={styles.tab}>
            <Animated.View style={{ opacity: salesTabIcon }}>
              <Ionicons name="receipt-outline" size={compact ? 18 : 22} color={colors.muted} />
            </Animated.View>
            <Animated.Text style={[styles.label, compact && styles.labelCompact, { color: salesLabel }]}>Sales</Animated.Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  compactOverlay: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20, elevation: 20 },
  compactPanel: { flexDirection: 'row', width: 260, height: 40, padding: 3, borderRadius: 22, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, shadowColor: colors.black, shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  compactTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 18 },
  compactKotActive: { backgroundColor: colors.ink },
  compactSalesActive: { backgroundColor: SALES },
  compactLabel: { fontSize: 11, fontWeight: '700', color: colors.muted },
  compactKotLabelActive: { color: colors.white },
  compactSalesLabelActive: { color: colors.orangeText },
  safe: { width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: colors.background, paddingTop: LIFT + 4 },
  wrap: { height: BAR_H },
  tabs: { ...StyleSheet.absoluteFill, flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  labelCompact: { fontSize: 9, letterSpacing: 0.1 },
  bubble: {
    position: 'absolute', top: -LIFT, left: 0, width: BUBBLE, height: BUBBLE, borderRadius: BUBBLE / 2,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.black, shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  bubbleInner: { width: 28, height: 28 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
