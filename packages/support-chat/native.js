import { errorJSON } from './errors.js';
import { useRef } from 'react';
import { Switch, TextInput, View, StyleSheet } from 'react-native';
import { useSupport } from './useSupport.js';
import { supportNotice } from './protocol.js';
/** @typedef {import('react').ReactNode} ReactNode */
/** @typedef {import('react').ComponentType<{children:ReactNode,testID?:string}>} ScreenComponent */
/** @typedef {import('react').ComponentType<{children:ReactNode,muted?:boolean,variant?:'caption',selectable?:boolean,accessibilityRole?:import('react-native').TextProps['accessibilityRole'],style?:import('react-native').StyleProp<import('react-native').TextStyle>}>} CopyComponent */
/** @typedef {import('react').ComponentType<{label:string,onPress:()=>void,secondary?:boolean,disabled?:boolean,busy?:boolean,testID?:string}>} ButtonComponent */
/** @typedef {import('react').ComponentType<{title:string,subtitle:string,trailing:ReactNode}>} RowComponent */
/** Host supplies theme and UI primitives; authentication and navigation stay in the host.
 * @param {{request:import('./protocol.js').SupportRequest,active?:boolean,unavailableContent?:ReactNode,colors:{danger:string,accent:string,surface:string,onAccent:string,secondary:string,text:string,border:string},components:{Screen:ScreenComponent,Copy:CopyComponent,Button:ButtonComponent,Row:RowComponent}}} props */
export function NativeChat({
  request,
  active = true,
  colors,
  components,
  unavailableContent = 'Support chat is not configured yet.',
}) {
  const { Screen, Copy, Button, Row } = components;
  const chat = useSupport(request, active);
  const input = useRef(/** @type {TextInput|null} */ (null));
  const draft = useRef('');
  return (
    <Screen testID="support-screen">
      <Copy muted>{supportNotice}</Copy>
      {!chat.state && !chat.error && <Copy muted>Loading conversation…</Copy>}
      {chat.error && (
        <Copy accessibilityRole="alert" style={{ color: colors.danger }} selectable>
          {errorJSON(chat.error)}
        </Copy>
      )}
      {chat.error && <Button secondary label="Retry" onPress={() => void chat.refresh()} />}
      {chat.state?.warning && (
        <Copy accessibilityRole="alert" muted>
          {chat.state.warning}
        </Copy>
      )}
      {chat.state && !chat.state.available && <Copy muted>{unavailableContent}</Copy>}
      {chat.state?.hasMore && (
        <Button
          secondary
          label="Load earlier messages"
          disabled={chat.busy}
          onPress={() => void chat.loadOlder()}
        />
      )}
      {chat.state && !chat.state.messages.length && (
        <Copy muted>How can we help? Send a message to start a conversation with support.</Copy>
      )}
      {chat.state?.messages.map((message) => (
        <View
          key={message.id}
          style={[
            styles.message,
            message.role === 'user' ? styles.outgoing : styles.incoming,
            {
              backgroundColor: message.role === 'user' ? colors.accent : colors.surface,
            },
          ]}
        >
          <Copy
            variant="caption"
            style={{ color: message.role === 'user' ? colors.onAccent : colors.secondary }}
          >
            {message.role === 'user' ? 'You' : 'Support'}
          </Copy>
          <Copy
            selectable
            style={{ color: message.role === 'user' ? colors.onAccent : colors.text }}
          >
            {message.text}
          </Copy>
          <Copy
            variant="caption"
            style={{ color: message.role === 'user' ? colors.onAccent : colors.secondary }}
          >
            {new Date(message.createdAt).toLocaleString()} ·{' '}
            {message.role === 'user'
              ? message.delivery === 'cancelled'
                ? 'Cancelled after access was revoked'
                : message.delivery === 'queued'
                  ? 'Waiting to reach support'
                  : 'Sent to support'
              : 'Reply'}
          </Copy>
        </View>
      ))}
      <Copy>Your message</Copy>
      <TextInput
        ref={input}
        testID="support-message"
        accessibilityLabel="Your support message"
        multiline
        maxLength={1800}
        editable={!chat.busy && Boolean(chat.state?.available)}
        onChangeText={(value) => {
          draft.current = value;
        }}
        placeholder="Tell us what you need help with…"
        placeholderTextColor={colors.secondary}
        style={[
          styles.input,
          { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      />
      <Button
        testID="support-send"
        label={chat.busy ? 'Sending…' : 'Send message'}
        busy={chat.busy}
        disabled={chat.busy || !chat.state?.available}
        onPress={() => {
          const text = draft.current.trim();
          if (text)
            void chat.send(text).then((saved) => {
              if (saved && draft.current.trim() === text) {
                input.current?.clear();
                draft.current = '';
              }
              return undefined;
            });
        }}
      />
      {chat.state && (
        <Row
          title="Agent access to support"
          subtitle="Allow connected agents to read and send support messages"
          trailing={
            <Switch
              testID="support-agent-access"
              accessibilityLabel="Agent access to support"
              value={chat.state.agentAccess}
              disabled={chat.busy}
              onValueChange={(allowed) => void chat.setAgentAccess(allowed)}
            />
          }
        />
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  outgoing: { alignSelf: 'flex-end' },
  incoming: { alignSelf: 'flex-start' },
  message: { maxWidth: '90%', padding: 16, gap: 8, borderRadius: 16, borderCurve: 'continuous' },
  input: {
    minHeight: 100,
    padding: 16,
    borderWidth: 1,
    borderRadius: 16,
    borderCurve: 'continuous',
    fontSize: 17,
    textAlignVertical: 'top',
  },
});

export { NativeSupport } from './support-native.js';
