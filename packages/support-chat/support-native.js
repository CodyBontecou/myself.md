import { errorJSON } from './errors.js';
import { useState } from 'react';
import { Alert, Switch, TextInput, View, StyleSheet } from 'react-native';
import { useSupportInbox } from './support-client.js';
import { useSupportData } from './support-data.js';
/** @param {{request:import('./support-client.js').SupportClient,active?:boolean,initialConversationId?:string,onEnableNotifications?:()=>void,data?:import('./support-client.js').SupportDataAdapter,newId:()=>string,colors:{text:string,surface:string,border:string,secondary:string},components:{Screen:import('./native.js').ScreenComponent,Copy:import('./native.js').CopyComponent,Button:import('./native.js').ButtonComponent,Row:import('./native.js').RowComponent}}} props */
export function NativeSupport({
  request,
  active = true,
  initialConversationId = '',
  onEnableNotifications,
  data,
  newId,
  colors,
  components,
}) {
  const { Screen, Copy, Button, Row } = components;
  const chat = useSupportInbox(request, active, initialConversationId),
    c = chat.conversation;
  const [title, setTitle] = useState(''),
    [draft, setDraft] = useState('');
  const logs = useSupportData(c, data, newId, chat.mutate),
    disabled = chat.busy || logs.busy;
  const inputStyle = {
    color: colors.text,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    fontSize: 17,
    minHeight: 112,
    textAlignVertical: /** @type {const} */ ('top'),
  };
  const previewStyle = { ...inputStyle, minHeight: 220 };
  return (
    <Screen testID="support-inbox">
      {chat.error && (
        <Copy accessibilityRole="alert" selectable>
          {errorJSON(chat.error)}
        </Copy>
      )}
      {logs.error && (
        <Copy accessibilityRole="alert" selectable>
          {errorJSON(logs.error)}
        </Copy>
      )}
      <Button secondary label="Refresh" disabled={disabled} onPress={() => void chat.refresh()} />
      {!c ? (
        <>
          <View style={styles.welcome}>
            <Copy style={styles.heading}>How can we help?</Copy>
            <Copy muted style={styles.centered}>
              Ask Isobot a question or report a problem. Staff can join the conversation.
            </Copy>
          </View>
          <TextInput
            accessibilityLabel="Conversation title"
            multiline
            value={title}
            onChangeText={setTitle}
            maxLength={120}
            editable={!disabled}
            placeholder="What do you need help with?"
            placeholderTextColor={colors.secondary}
            style={inputStyle}
          />
          <Button
            label="New conversation"
            disabled={disabled || !title.trim()}
            onPress={() =>
              void chat.create(newId(), title).then((saved) => {
                if (saved) {
                  setTitle('');
                  setDraft('');
                }
                return undefined;
              })
            }
          />
          {chat.conversations.map((item) => (
            <Button
              key={item.id}
              secondary
              label={`${item.title} · ${item.status}${item.unreadCount ? ` · ${item.unreadCount} unread` : ''}`}
              disabled={disabled}
              onPress={() => {
                setDraft('');
                void chat.open(item.id);
              }}
            />
          ))}
        </>
      ) : (
        <>
          <Button
            secondary
            label="Back to conversations"
            disabled={disabled}
            onPress={() => {
              logs.cancel();
              setDraft('');
              void chat.open('');
            }}
          />
          <Copy>
            {c.title} · {c.status}
          </Copy>
          {c.hasMore && (
            <Button
              secondary
              label="Load earlier messages"
              disabled={disabled}
              onPress={() => void chat.loadOlder()}
            />
          )}
          {c.messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.message,
                message.author === 'user' ? styles.outgoing : styles.incoming,
                message.author === 'user' && { backgroundColor: colors.surface },
              ]}
            >
              <Copy variant="caption" muted>
                {message.author === 'pi'
                  ? 'Isobot'
                  : message.author === 'staff'
                    ? 'Support'
                    : 'You'}
              </Copy>
              <Copy selectable style={styles.messageText}>
                {message.text}
              </Copy>
              <Copy variant="caption" muted>
                {new Date(message.createdAt).toLocaleString()}
              </Copy>
            </View>
          ))}
          {c.status === 'open' && (
            <>
              <TextInput
                accessibilityLabel="Your support message"
                multiline
                value={draft}
                onChangeText={setDraft}
                maxLength={1800}
                editable={!disabled}
                placeholder="Message Isobot…"
                placeholderTextColor={colors.secondary}
                style={inputStyle}
              />
              <Button
                label="Send message"
                disabled={disabled || !draft.trim()}
                onPress={() => {
                  const value = draft.trim();
                  void chat.send(value, newId()).then((saved) => {
                    if (saved) setDraft('');
                    return undefined;
                  });
                }}
              />
            </>
          )}
          <Button
            secondary
            label="Mark as read"
            disabled={disabled}
            onPress={() =>
              void chat.mutate('readCursor', { readThrough: c.messages.at(-1)?.sequence ?? 0 })
            }
          />
          {c.requests.map((r) => (
            <Row
              key={r.id}
              title={r.reason}
              subtitle={`${r.selector.category} · ${new Date(r.selector.from).toLocaleString()} to ${new Date(r.selector.to).toLocaleString()} · ${r.status}`}
              trailing={
                r.status === 'pending' ? (
                  <>
                    <Button
                      secondary
                      label="Review data"
                      disabled={disabled || !data}
                      onPress={() => void logs.prepare(r)}
                    />
                    <Button
                      secondary
                      label="Decline"
                      disabled={disabled}
                      onPress={() => void chat.mutate('decline', { requestId: r.id })}
                    />
                  </>
                ) : null
              }
            />
          ))}
          {c.attachments.map((a) => (
            <Copy key={a.id} muted>
              {a.category} attachment · {a.removed ? 'Removed when archived' : 'Shared'}
            </Copy>
          ))}
          {logs.preview && (
            <>
              <Copy>
                Review this snapshot. You can remove entries before sharing. Accepted data will be
                processed by Isobot and its model provider.
              </Copy>
              <TextInput
                accessibilityLabel="Data snapshot preview"
                multiline
                value={logs.preview.content}
                editable={!disabled}
                onChangeText={logs.edit}
                maxLength={128000}
                style={previewStyle}
              />
              <Button
                label="Accept and share this snapshot"
                disabled={disabled}
                onPress={() => void logs.share()}
              />
              <Button secondary label="Cancel" disabled={disabled} onPress={logs.cancel} />
            </>
          )}
          {c.status === 'open' ? (
            <>
              {data && (
                <Button
                  secondary
                  label="Attach recent logs"
                  disabled={disabled}
                  onPress={() => void logs.prepare(null)}
                />
              )}
              <Row
                title="Connected agent access"
                subtitle="Allow your connected agents to read and send messages here"
                trailing={
                  <Switch
                    value={c.agentAccess}
                    disabled={disabled}
                    onValueChange={(value) => void chat.mutate('update', { agentAccess: value })}
                  />
                }
              />
              <Row
                title="Isobot replies"
                subtitle="Pause automatic replies when working with staff"
                trailing={
                  <Switch
                    value={c.autoReply}
                    disabled={disabled}
                    onValueChange={(value) => void chat.mutate('update', { autoReply: value })}
                  />
                }
              />
              <Button
                secondary
                label="Resolve conversation"
                disabled={disabled}
                onPress={() => void chat.mutate('update', { status: 'resolved' })}
              />
            </>
          ) : (
            <Button
              label="Reopen conversation"
              disabled={disabled}
              onPress={() => void chat.mutate('update', { status: 'open' })}
            />
          )}
          {c.status !== 'archived' && (
            <Button
              secondary
              label="Archive conversation"
              disabled={disabled}
              onPress={() =>
                Alert.alert(
                  'Archive conversation?',
                  'Text stays; shared attachments are deleted.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Archive', onPress: () => void chat.mutate('archive') },
                  ],
                )
              }
            />
          )}
          <Button
            secondary
            label="Delete conversation"
            disabled={disabled}
            onPress={() =>
              Alert.alert(
                'Delete conversation?',
                'This permanently removes its text and attachments.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => void chat.mutate('delete'),
                  },
                ],
              )
            }
          />
          {c.jobs?.map((job) => (
            <Copy key={job.id} muted>
              Implementation task · {job.status}
              {job.result ? ` · ${job.result}` : ''}
            </Copy>
          ))}
        </>
      )}
      {onEnableNotifications && (
        <Button
          secondary
          label="Enable reply notifications"
          disabled={disabled}
          onPress={onEnableNotifications}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  welcome: { paddingTop: 48, paddingBottom: 16, gap: 12 },
  heading: { fontSize: 28, fontWeight: '600', textAlign: 'center' },
  centered: { textAlign: 'center' },
  message: { borderRadius: 24, padding: 16, gap: 8 },
  outgoing: { alignSelf: 'flex-end', maxWidth: '85%' },
  incoming: { alignSelf: 'flex-start', maxWidth: '100%' },
  messageText: { lineHeight: 26 },
});
