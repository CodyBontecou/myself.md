import { errorJSON } from './errors.js';
import { useState } from 'react';
import { Alert, Switch, TextInput, View, StyleSheet } from 'react-native';
import { useSupportInbox } from './support-client.js';
import { useSupportData } from './support-data.js';
/** @param {{request:import('./support-client.js').SupportClient,active?:boolean,initialConversationId?:string,onEnableNotifications?:()=>void,data?:import('./support-client.js').SupportDataAdapter,newId:()=>string,colors:{text:string,surface:string,border:string,secondary:string},components:{Group:import('react').ComponentType<{children:import('react').ReactNode,compact?:boolean}>,Screen:import('./native.js').ScreenComponent,Copy:import('./native.js').CopyComponent,Button:import('./native.js').ButtonComponent,Row:import('./native.js').RowComponent}}} props */
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
  const { Screen, Copy, Button, Row, Group } = components;
  const chat = useSupportInbox(request, active, initialConversationId),
    c = chat.conversation;
  const [title, setTitle] = useState(''),
    [draft, setDraft] = useState(''),
    [detailsFor, setDetailsFor] = useState(/** @type {string|null} */ (null));
  const details = detailsFor === (c?.id ?? '');
  const logs = useSupportData(c, data, newId, chat.mutate),
    disabled = chat.busy || logs.busy;
  const inputStyle = {
    color: colors.text,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    minHeight: 96,
    textAlignVertical: /** @type {const} */ ('top'),
  };
  const previewStyle = { ...inputStyle, minHeight: 220 };
  return (
    <Screen testID="support-inbox" compact>
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
      {!c ? (
        <>
          <View style={styles.welcome}>
            <Copy style={styles.heading}>How can we help?</Copy>
            <Copy muted>
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
          <Copy variant="caption" muted>
            Conversations
          </Copy>
          <Group compact>
            {chat.conversations.map((item) => (
              <Row
                compact
                subtitle={`${item.status}${item.unreadCount ? ` · ${item.unreadCount} unread` : ''}`}
                trailing={null}
                key={item.id}
                title={item.title}
                disabled={disabled}
                onPress={() => {
                  setDraft('');
                  setDetailsFor(null);
                  void chat.open(item.id);
                }}
              />
            ))}
          </Group>
        </>
      ) : (
        <>
          <Row
            compact
            subtitle=""
            trailing={null}
            title="Back to conversations"
            disabled={disabled}
            onPress={() => {
              logs.cancel();
              setDraft('');
              setDetailsFor(null);
              void chat.open('');
            }}
          />
          <Copy>
            {c.title} · {c.status}
          </Copy>
          {c.hasMore && (
            <Row
              compact
              subtitle=""
              trailing={null}
              title="Load earlier messages"
              disabled={disabled}
              onPress={() => void chat.loadOlder()}
            />
          )}
          {c.messages.map((message) => (
            <View key={message.id} style={[styles.message, { borderBottomColor: colors.border }]}>
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
          {c.requests.map((r) => (
            <Group compact key={r.id}>
              <Row
                compact
                title={r.reason}
                subtitle={`${r.selector.category} · ${new Date(r.selector.from).toLocaleString()} to ${new Date(r.selector.to).toLocaleString()} · ${r.status}`}
                trailing={null}
              />
              {r.status === 'pending' && (
                <>
                  <Row
                    compact
                    title="Review data"
                    subtitle=""
                    trailing={null}
                    disabled={disabled || !data}
                    onPress={() => void logs.prepare(r)}
                  />
                  <Row
                    compact
                    title="Decline"
                    subtitle=""
                    trailing={null}
                    disabled={disabled}
                    onPress={() => void chat.mutate('decline', { requestId: r.id })}
                  />
                </>
              )}
            </Group>
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
              <Row
                compact
                subtitle=""
                trailing={null}
                title="Cancel"
                disabled={disabled}
                onPress={logs.cancel}
              />
            </>
          )}
          {c.jobs?.map((job) => (
            <Copy key={job.id} muted>
              Implementation task · {job.status}
              {job.result ? ` · ${job.result}` : ''}
            </Copy>
          ))}
        </>
      )}
      <Row
        compact
        title={
          details ? 'Hide conversation details' : c ? 'Conversation details' : 'Support options'
        }
        subtitle=""
        trailing={null}
        onPress={() => setDetailsFor(details ? null : (c?.id ?? ''))}
      />
      {details && (
        <Group compact>
          <Row
            compact
            title="Refresh"
            subtitle=""
            trailing={null}
            disabled={disabled}
            onPress={() => void chat.refresh()}
          />
          {onEnableNotifications && (
            <Row
              compact
              subtitle=""
              trailing={null}
              title="Enable reply notifications"
              disabled={disabled}
              onPress={onEnableNotifications}
            />
          )}
          {c && (
            <>
              <Row
                compact
                subtitle=""
                trailing={null}
                title="Mark as read"
                disabled={disabled}
                onPress={() =>
                  void chat.mutate('readCursor', { readThrough: c.messages.at(-1)?.sequence ?? 0 })
                }
              />
              {c.status === 'open' ? (
                <>
                  {data && (
                    <Row
                      compact
                      subtitle=""
                      trailing={null}
                      title="Attach recent logs"
                      disabled={disabled}
                      onPress={() => void logs.prepare(null)}
                    />
                  )}
                  <Row
                    compact
                    title="Connected agent access"
                    subtitle="Allow your connected agents to read and send messages here"
                    trailing={
                      <Switch
                        value={c.agentAccess}
                        disabled={disabled}
                        onValueChange={(value) =>
                          void chat.mutate('update', { agentAccess: value })
                        }
                      />
                    }
                  />
                  <Row
                    compact
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
                  <Row
                    compact
                    subtitle=""
                    trailing={null}
                    title="Resolve conversation"
                    disabled={disabled}
                    onPress={() => void chat.mutate('update', { status: 'resolved' })}
                  />
                </>
              ) : (
                <Row
                  compact
                  subtitle=""
                  trailing={null}
                  title="Reopen conversation"
                  disabled={disabled}
                  onPress={() => void chat.mutate('update', { status: 'open' })}
                />
              )}
              {c.status !== 'archived' && (
                <Row
                  compact
                  subtitle=""
                  trailing={null}
                  title="Archive conversation"
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
              <Row
                compact
                subtitle=""
                trailing={null}
                title="Delete conversation"
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
            </>
          )}
        </Group>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  welcome: { gap: 8 },
  heading: { fontSize: 22, fontWeight: '600' },
  message: { paddingVertical: 12, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  messageText: { lineHeight: 26 },
});
