import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Copy, Icon } from './ui.js';
import { useTheme } from '../lib/theme.js';

/** Up to two initials from a display name, else the first letter of an email.
 * @param {string|null|undefined} name @param {string|null|undefined} email */
export function accountInitials(name, email) {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '';
  const letters = words.length > 1 ? `${first}${words.at(-1)?.[0] ?? ''}` : first;
  return (letters || (email ?? '').trim()[0] || '').toUpperCase();
}

/** Account identity: the login photo or initials inside a ring that shows access.
 * Signed out with an action, it becomes a labelled Sign in pill.
 * @param {{signedIn?:boolean,picture?:string|null|undefined,name?:string|null|undefined,email?:string|null|undefined,unlocked?:boolean,size?:number,onPress?:()=>void,testID?:string}} props */
export default function AccountAvatar({
  signedIn = false,
  picture,
  name,
  email,
  unlocked = false,
  size = 44,
  onPress,
  testID,
}) {
  const { colors } = useTheme();
  const [failedPicture, setFailedPicture] = useState('');
  if (!signedIn && onPress)
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel="Sign in"
        onPress={onPress}
        style={({ pressed }) => [
          styles.pill,
          {
            backgroundColor: colors.surface,
            borderColor: colors.outline,
            opacity: pressed ? 0.6 : 1,
          },
        ]}
      >
        <Icon name="person-outline" size={18} />
        <Copy style={styles.pillLabel}>Sign in</Copy>
      </Pressable>
    );
  const ring = Math.max(2, Math.round(size / 18));
  const gap = ring;
  const inner = size - (ring + gap) * 2;
  const initials = accountInitials(name, email);
  const face = (
    <>
      <AccessRing size={size} width={ring} unlocked={signedIn && unlocked} />
      <View
        style={[
          styles.face,
          {
            width: inner,
            height: inner,
            borderRadius: inner / 2,
            backgroundColor: colors.subtle,
          },
        ]}
      >
        {!signedIn ? (
          <Icon name="person-outline" size={inner * 0.5} />
        ) : initials ? (
          <Copy style={[styles.initials, { fontSize: inner * 0.36, lineHeight: inner * 0.46 }]}>
            {initials}
          </Copy>
        ) : (
          <Icon name="person" size={inner * 0.5} />
        )}
        {signedIn && picture && picture !== failedPicture && (
          <Image
            key={picture}
            source={{ uri: picture }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setFailedPicture(picture)}
            accessible={false}
          />
        )}
      </View>
    </>
  );
  const box = [styles.avatar, { width: size, height: size }];
  const who = name || email;
  return onPress ? (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={who ? `Manage account, ${who}` : 'Manage account'}
      onPress={onPress}
      hitSlop={Math.max(0, (44 - size) / 2)}
      style={({ pressed }) => [...box, { opacity: pressed ? 0.6 : 1 }]}
    >
      {face}
    </Pressable>
  ) : (
    <View
      testID={testID}
      style={box}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {face}
    </View>
  );
}

/** Three braid-colored arcs for verified unlimited access; one quiet ring otherwise.
 * @param {{size:number,width:number,unlocked:boolean}} props */
function AccessRing({ size, width, unlocked }) {
  const { colors } = useTheme();
  const r = (size - width) / 2;
  const length = 2 * Math.PI * r;
  const arcs = unlocked ? [colors.place, colors.attention, colors.body] : [colors.outline];
  const pause = unlocked ? width * 1.5 : 0;
  const arc = length / arcs.length - pause;
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      {arcs.map((color, index) => (
        <Circle
          key={color}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeLinecap={unlocked ? 'round' : 'butt'}
          strokeDasharray={`${arc} ${length - arc}`}
          strokeDashoffset={-(index * (length / arcs.length)) + length / 4}
        />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
  face: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  initials: { fontWeight: '600', letterSpacing: 0.4, textAlign: 'center' },
  pill: {
    minHeight: 44,
    paddingLeft: 12,
    paddingRight: 16,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pillLabel: { fontSize: 15, fontWeight: '500' },
});
