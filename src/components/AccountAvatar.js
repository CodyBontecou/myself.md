import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Icon } from './ui.js';
import { useTheme } from '../lib/theme.js';
/** @param {{signedIn?:boolean,picture?:string|null|undefined,size?:number,onPress?:()=>void,testID?:string}} props */
export default function AccountAvatar({ signedIn = false, picture, size = 44, onPress, testID }) {
  const { colors } = useTheme();
  const [failedPicture, setFailedPicture] = useState('');
  const content = signedIn ? (
    <>
      <View style={[styles.face, { width: size * 0.48, height: size * 0.4 }]}>
        <View style={styles.eyes}>
          {[0, 1].map((eye) => (
            <View key={eye} style={[styles.eye, { backgroundColor: colors.text }]} />
          ))}
        </View>
        <View style={[styles.smile, { borderColor: colors.text }]} />
      </View>
      {picture && picture !== failedPicture && (
        <Image
          key={picture}
          source={{ uri: picture }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailedPicture(picture)}
          accessible={false}
        />
      )}
    </>
  ) : (
    <Icon name="person-outline" size={22} />
  );
  const style = [
    styles.avatar,
    { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.subtle },
  ];
  return onPress ? (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={signedIn ? 'Manage account' : 'Sign in'}
      onPress={onPress}
      style={({ pressed }) => [...style, { opacity: pressed ? 0.6 : 1 }]}
    >
      {content}
    </Pressable>
  ) : (
    <View testID={testID} style={style}>
      {content}
    </View>
  );
}
const styles = StyleSheet.create({
  avatar: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  face: { alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 },
  eyes: { flexDirection: 'row', justifyContent: 'space-between', width: '65%' },
  eye: { width: 4, height: 5, borderRadius: 2 },
  smile: {
    width: '70%',
    height: '50%',
    borderWidth: 2,
    borderTopWidth: 0,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
});
