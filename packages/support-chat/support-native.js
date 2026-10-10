import { NativeMarkdown } from './markdown-native.js';
import { errorJSON } from './errors.js';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
  StyleSheet,
} from 'react-native';
import { useSupportInbox } from './support-client.js';
import { useSupportData } from './support-data.js';
/** @param {{request:import('./support-client.js').SupportClient,active?:boolean,initialConversationId?:string,onEnableNotifications?:()=>void,data?:import('./support-client.js').SupportDataAdapter,newId:()=>string,bottomInset?:number,topInset?:number,projectLabel?:string,keyboardOffset?:number,onExit?:()=>void,renderIcon?:(name:'add'|'arrow-up'|'ellipsis-horizontal'|'chevron-back'|'create-outline'|'search'|'menu'|'close-outline'|'folder-outline'|'notifications-outline')=>import('react').ReactNode,colors:{text:string,surface:string,border:string,secondary:string,background?:string,subtle?:string},components:{Group:import('react').ComponentType<{children:import('react').ReactNode,compact?:boolean}>,Screen:import('./native.js').ScreenComponent,Copy:import('./native.js').CopyComponent,Button:import('./native.js').ButtonComponent,Row:import('./native.js').RowComponent}}} props */
export function NativeSupport({
  request,
  active = true,
  initialConversationId = '',
  onEnableNotifications,
  data,
  newId,
  colors,
  bottomInset = 0,
  topInset = 0,
  projectLabel = 'Support',
  onExit,
  keyboardOffset = 0,
  renderIcon,
  components,
}) {
  const { Copy, Button, Row, Group } = components;
  const chat = useSupportInbox(request, active, initialConversationId),
    c = chat.conversation;
  const [title, setTitle] = useState(''),
    [draft, setDraft] = useState(''),
    [detailsFor, setDetailsFor] = useState(/** @type {string|null} */ (null));
  const [today] = useState(() => Date.now());
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const input = useRef(/** @type {TextInput|null} */ (null));
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  const details = detailsFor === (c?.id ?? '');
  const logs = useSupportData(c, data, newId, chat.mutate),
    disabled = chat.busy || logs.busy;
  const canCompose = !c || c.status === 'open';
  const scroll = useRef(/** @type {ScrollView|null} */ (null));
  const atBottom = useRef(true);
  const [nearBottom, setNearBottom] = useState(true);
  const read = useRef('');
  const latest = c?.messages.at(-1)?.sequence ?? 0;
  useEffect(() => {
    if (c?.id) atBottom.current = true;
  }, [c?.id]);
  useEffect(() => {
    const cursor = `${c?.id}:${latest}`;
    if (
      active &&
      c &&
      latest > c.readThrough &&
      nearBottom &&
      !chat.busy &&
      read.current !== cursor
    ) {
      read.current = cursor;
      void chat.mutate('readCursor', { readThrough: latest }).then((saved) => {
        if (!saved) read.current = '';
        return saved;
      });
    }
  }, [active, c, latest, chat, nearBottom]);
  const inputStyle = {
    color: colors.text,
    fontSize: 17,
    paddingVertical: 10,
    paddingHorizontal: 8,
    minHeight: 44,
    maxHeight: 144,
    flex: 1,
    textAlignVertical: /** @type {const} */ ('top'),
  };
  const previewStyle = {
    ...inputStyle,
    flex: 0,
    minHeight: 220,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 16,
  };
  const submit = () => {
    if (disabled || !canCompose) return;
    if (c) {
      const value = draft.trim();
      if (value)
        void chat.send(value, newId()).then((saved) => {
          if (saved) setDraft('');
          return saved;
        });
    } else if (title.trim()) {
      void chat.create(newId(), title.trim()).then((saved) => {
        if (saved) {
          setTitle('');
          setDraft('');
        }
        return undefined;
      });
    }
  };
  const backToFeed = () => {
    Keyboard.dismiss();
    logs.cancel();
    setDraft('');
    setDetailsFor(null);
    void chat.open('');
  };
  const visible = chat.conversations.filter((item) =>
    item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <KeyboardAvoidingView
      testID="support-inbox"
      style={[styles.fill, { backgroundColor: colors.surface, paddingTop: topInset }]}
      keyboardVerticalOffset={keyboardOffset}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.toolbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={c ? 'Back to conversations' : `Back to ${projectLabel}`}
          onPress={
            c
              ? backToFeed
              : () => {
                  Keyboard.dismiss();
                  onExit?.();
                }
          }
          style={[styles.toolbarButton, styles.circle, { borderColor: colors.border }]}
        >
          {renderIcon ? renderIcon('chevron-back') : <Copy>‹</Copy>}
        </Pressable>
        <View style={styles.headerTitle}>
          <Text
            numberOfLines={1}
            style={[styles.headerText, c && styles.leftTitle, { color: colors.text }]}
          >
            {c ? c.title : 'Isobot'}
          </Text>
          {c && (
            <Text numberOfLines={1} style={[styles.headerSubtitle, { color: colors.secondary }]}>
              {projectLabel} · Isobot
            </Text>
          )}
        </View>
        {c ? (
          <View style={[styles.headerActions, { borderColor: colors.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New conversation"
              onPress={backToFeed}
              style={styles.toolbarButton}
            >
              {renderIcon ? renderIcon('create-outline') : <Copy>New</Copy>}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Conversation details"
              onPress={() => {
                Keyboard.dismiss();
                setDetailsFor(details ? null : c.id);
              }}
              style={styles.toolbarButton}
            >
              {renderIcon ? renderIcon('ellipsis-horizontal') : <Copy>More</Copy>}
            </Pressable>
          </View>
        ) : (
          <View style={styles.feedActions}>
            {onEnableNotifications && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Enable reply notifications"
                onPress={() => {
                  Keyboard.dismiss();
                  onEnableNotifications();
                }}
                style={styles.toolbarButton}
              >
                {renderIcon ? renderIcon('notifications-outline') : <Copy>Notifications</Copy>}
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={searching ? 'Close search' : 'Search conversations'}
              onPress={() => {
                Keyboard.dismiss();
                setSearching(!searching);
                setQuery('');
              }}
              style={[styles.toolbarButton, styles.circle, { borderColor: colors.border }]}
            >
              {renderIcon ? (
                renderIcon(searching ? 'close-outline' : 'search')
              ) : (
                <Copy>Search</Copy>
              )}
            </Pressable>
          </View>
        )}
      </View>
      {!c && searching && (
        <TextInput
          testID="support-search"
          accessibilityLabel="Search conversations"
          placeholder="Search conversations"
          placeholderTextColor={colors.secondary}
          value={query}
          onChangeText={setQuery}
          autoFocus
          style={[
            styles.searchInput,
            { color: colors.text, backgroundColor: colors.subtle ?? colors.surface },
          ]}
        />
      )}
      <ScrollView
        ref={scroll}
        style={styles.fill}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        scrollEventThrottle={100}
        onScroll={({ nativeEvent }) => {
          if (!c) return;
          atBottom.current =
            nativeEvent.contentSize.height -
              nativeEvent.contentOffset.y -
              nativeEvent.layoutMeasurement.height <
            80;
          setNearBottom(atBottom.current);
        }}
        onLayout={() => {
          if (c && atBottom.current) scroll.current?.scrollToEnd({ animated: false });
        }}
        onContentSizeChange={() => {
          if (c && atBottom.current) scroll.current?.scrollToEnd({ animated: false });
        }}
      >
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
            {!chat.loaded && !chat.error && (
              <View accessibilityLabel="Loading conversations" style={styles.feed}>
                {[0, 1, 2].map((key) => (
                  <View key={key} style={styles.skeletonRow}>
                    <View
                      style={[
                        styles.skeletonTitle,
                        { backgroundColor: colors.subtle ?? colors.border },
                      ]}
                    />
                    <View
                      style={[
                        styles.skeletonSubtitle,
                        { backgroundColor: colors.subtle ?? colors.border },
                      ]}
                    />
                  </View>
                ))}
              </View>
            )}
            {chat.loaded && !chat.conversations.length && (
              <View style={styles.welcome}>
                <Copy style={styles.heading}>How can we help?</Copy>
                <Copy muted>Ask Isobot a question or report a problem.</Copy>
              </View>
            )}
            {query && (
              <Text style={[styles.feedHeading, { color: colors.text }]}>Search results</Text>
            )}
            <View style={styles.feed}>
              {query && !visible.length && <Copy muted>No conversations found.</Copy>}
              {visible.map((item, index) => (
                <View key={item.id}>
                  {!query &&
                    (index === 0 ||
                      section(item.updatedAt, today) !==
                        section(visible[index - 1]?.updatedAt ?? '', today)) && (
                      <Text style={[styles.feedHeading, { color: colors.text }]}>
                        {section(item.updatedAt, today)}
                      </Text>
                    )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${item.title}${item.unreadCount ? ', New message' : ''}`}
                    disabled={disabled}
                    onPress={() => {
                      Keyboard.dismiss();
                      setDraft('');
                      setDetailsFor(null);
                      atBottom.current = true;
                      setNearBottom(true);
                      void chat.open(item.id);
                    }}
                    style={({ pressed }) => [styles.feedRow, pressed && styles.pressed]}
                  >
                    <View style={styles.feedTitle}>
                      <Text numberOfLines={1} style={[styles.feedText, { color: colors.text }]}>
                        {item.title}
                      </Text>
                      <View style={styles.feedMeta}>
                        {renderIcon && renderIcon('folder-outline')}
                        <Text style={[styles.feedSubtitle, { color: colors.secondary }]}>
                          {projectLabel}
                        </Text>
                      </View>
                    </View>
                    {!!item.unreadCount && (
                      <View
                        accessibilityLabel="New message"
                        style={[styles.dot, { backgroundColor: colors.text }]}
                      />
                    )}
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        ) : (
          <>
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
              <View
                key={message.id}
                style={[
                  styles.message,
                  message.author === 'user' && styles.outgoing,
                  message.author === 'user' && { backgroundColor: colors.subtle ?? colors.surface },
                ]}
              >
                {message.author === 'staff' && (
                  <Copy variant="caption" muted>
                    Support
                  </Copy>
                )}
                {message.author === 'user' ? (
                  <Copy selectable style={styles.messageText}>
                    {message.text}
                  </Copy>
                ) : (
                  <NativeMarkdown text={message.text} colors={colors} />
                )}
              </View>
            ))}
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
                  editable={!disabled && canCompose}
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
      </ScrollView>
      <View
        style={[
          styles.composerArea,
          {
            paddingBottom: Math.max(keyboardOpen ? 0 : bottomInset, 10),
            backgroundColor: colors.surface,
          },
        ]}
      >
        <View
          style={[styles.composer, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          {(!c || data) && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={c ? 'Attach recent logs' : 'Start a conversation'}
              disabled={disabled || !canCompose}
              onPress={() => (c ? void logs.prepare(null) : input.current?.focus())}
              style={styles.composerButton}
            >
              {renderIcon ? renderIcon('add') : <Copy style={styles.plus}>+</Copy>}
            </Pressable>
          )}
          <TextInput
            ref={input}
            testID="support-composer"
            accessibilityLabel={c ? 'Your support message' : 'Conversation title'}
            multiline
            value={c ? draft : title}
            onChangeText={c ? setDraft : setTitle}
            maxLength={c ? 1800 : 120}
            editable={!disabled && canCompose}
            placeholder={
              !canCompose ? 'Conversation archived' : c ? 'Message Isobot…' : 'Ask Isobot…'
            }
            placeholderTextColor={colors.secondary}
            style={inputStyle}
          />
          <Pressable
            hitSlop={4}
            testID="support-send"
            accessibilityRole="button"
            accessibilityLabel={c ? 'Send message' : 'New conversation'}
            accessibilityState={{
              disabled: disabled || !canCompose || !(c ? draft : title).trim(),
            }}
            disabled={disabled || !canCompose || !(c ? draft : title).trim()}
            onPress={submit}
            style={[
              styles.send,
              (disabled || !canCompose || !(c ? draft : title).trim()) && styles.sendDisabled,
              {
                backgroundColor: colors.text,
              },
            ]}
          >
            {renderIcon ? (
              renderIcon('arrow-up')
            ) : (
              <Copy style={[styles.sendIcon, { color: colors.surface }]}>↑</Copy>
            )}
          </Pressable>
        </View>
      </View>
      <Modal
        visible={details}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailsFor(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss support options"
            style={StyleSheet.absoluteFill}
            onPress={() => setDetailsFor(null)}
          />
          <View
            style={[
              styles.optionsSheet,
              { backgroundColor: colors.surface, paddingBottom: Math.max(bottomInset, 16) },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.headerText, { color: colors.text }]}>
                {c ? 'Conversation details' : 'Support options'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close support options"
                onPress={() => setDetailsFor(null)}
                style={styles.toolbarButton}
              >
                {renderIcon ? renderIcon('close-outline') : <Copy>Close</Copy>}
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetContent}>
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
                          void chat.mutate('readCursor', {
                            readThrough: c.messages.at(-1)?.sequence ?? 0,
                          })
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
                              onPress={() => {
                                setDetailsFor(null);
                                void logs.prepare(null);
                              }}
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
                                onValueChange={(value) =>
                                  void chat.mutate('update', { autoReply: value })
                                }
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
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/** @param {string} date @param {number} now */
function section(date, now) {
  const time = new Date(date);
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(today.getDate() - 1);
  return time.toDateString() === today.toDateString()
    ? 'Today'
    : time.toDateString() === yesterday.toDateString()
      ? 'Yesterday'
      : 'Earlier';
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.25)' },
  optionsSheet: {
    maxHeight: '80%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderCurve: 'continuous',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 12,
    paddingTop: 8,
  },
  sheetContent: { padding: 20, gap: 12 },
  sendDisabled: { opacity: 0.3 },
  sendIcon: { fontSize: 22 },
  fill: { flex: 1 },
  leftTitle: { textAlign: 'left' },
  headerTitle: { flex: 1, paddingHorizontal: 12 },
  headerText: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  headerSubtitle: { fontSize: 12, lineHeight: 16 },
  feedActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerActions: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
    borderCurve: 'continuous',
  },
  circle: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, borderCurve: 'continuous' },
  searchInput: {
    marginHorizontal: 20,
    marginVertical: 8,
    padding: 12,
    borderRadius: 16,
    fontSize: 17,
  },
  feedHeading: { fontSize: 15, fontWeight: '600', paddingTop: 8, paddingBottom: 12 },
  feedMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  feedSubtitle: { fontSize: 13, lineHeight: 20 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
  },
  toolbarButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 16, flexGrow: 1 },
  welcome: { gap: 8, paddingVertical: 24 },
  heading: { fontSize: 22, fontWeight: '600' },
  feed: { gap: 8 },
  skeletonRow: { height: 68, gap: 8, justifyContent: 'center' },
  skeletonTitle: { height: 16, width: '75%', borderRadius: 4 },
  skeletonSubtitle: { height: 12, width: '25%', borderRadius: 4 },
  pressed: { opacity: 0.6 },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 68,
    paddingVertical: 10,
  },
  feedTitle: { flex: 1 },
  feedText: { fontSize: 17, lineHeight: 23, fontWeight: '400' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  message: { paddingVertical: 12, gap: 8, alignSelf: 'stretch' },
  outgoing: {
    alignSelf: 'flex-end',
    maxWidth: '80%',
    borderRadius: 22,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
  },
  messageText: { fontSize: 17, lineHeight: 26 },
  composerArea: { paddingHorizontal: 36, paddingTop: 10 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 28,
    borderCurve: 'continuous',
    padding: 2,
    minHeight: 50,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  composerButton: { width: 40, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  plus: { fontSize: 28 },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 4,
  },
});
