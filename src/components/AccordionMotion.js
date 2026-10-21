import Animated, {
  cubicBezier,
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  useReducedMotion,
} from 'react-native-reanimated';
import { Icon } from './ui.js';

const easeOut = Easing.bezier(0.23, 1, 0.32, 1);
const layout = LinearTransition.duration(240).easing(easeOut).reduceMotion(ReduceMotion.System);
const enter = FadeIn.duration(180).easing(easeOut).reduceMotion(ReduceMotion.System);
const exit = FadeOut.duration(120).easing(easeOut).reduceMotion(ReduceMotion.System);

/** @param {{children:import('react').ReactNode,style?:import('react-native').StyleProp<import('react-native').ViewStyle>,testID?:string,enabled?:boolean}} props */
export function AccordionLayout({ children, style, testID, enabled = true }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View
      testID={testID}
      collapsable={false}
      {...(enabled && !reduced ? { layout } : {})}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

/** @param {{open:boolean,children:import('react').ReactNode,style?:import('react-native').StyleProp<import('react-native').ViewStyle>,enabled?:boolean}} props */
export function AccordionBody({ open, children, style, enabled = true }) {
  const reduced = useReducedMotion();
  if (!open) return null;
  return (
    <Animated.View
      {...(enabled && !reduced ? { entering: enter, exiting: exit } : {})}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

/** @param {{open:boolean,color:string}} props */
export function AccordionChevron({ open, color }) {
  const reduced = useReducedMotion();
  const transition = {
    transitionProperty: /** @type {const} */ ('transform'),
    transitionDuration: reduced ? 0 : 200,
    transitionTimingFunction: cubicBezier(0.23, 1, 0.32, 1),
  };
  return (
    <Animated.View
      style={{
        transform: [{ rotate: open ? '90deg' : '0deg' }],
        ...transition,
      }}
    >
      <Icon name="chevron-forward" size={20} color={color} />
    </Animated.View>
  );
}
