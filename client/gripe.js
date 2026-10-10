import { showToast } from '../src/components/Toast.js';
import {
  configureReportReporter,
  reportUpdatesSnapshot,
  setReportNotifications,
} from './feedback-updates.js';
import { errorMessage } from '../packages/support-chat/errors.js';
import { requireOptionalNativeModule } from 'expo';
import { Alert, AppState, Platform } from 'react-native';

/** @typedef {{companionEnabled:boolean,cropEnabled:boolean,drawingEnabled:boolean,titleEnabled:boolean,descriptionEnabled:boolean,tagsEnabled:boolean}} FeedbackSettings */
/** @typedef {{id:string,expiresAt:number,settings?:Partial<FeedbackSettings>,notificationsEnabled?:boolean}} FeedbackRequest */
/** @typedef {{status:string,operationId:string,outcome:string,issueUrl:string,settings?:FeedbackSettings}} FeedbackState */
/** @type {{status:()=>Promise<FeedbackState>,open:(id:string)=>Promise<FeedbackState>,configure:(settings:Partial<FeedbackSettings>)=>Promise<FeedbackState>,settings:()=>Promise<void>}|null} */
const bridge = requireOptionalNativeModule('MyselfGripe');
/** @type {{id:string,expiresAt:number,status:string,issueUrl?:string,settings?:Partial<FeedbackSettings>,notificationsEnabled?:boolean}|null} */
let pending = null;

export async function feedbackState() {
  const native = __DEV__ && Platform.OS === 'ios' ? await bridge?.status() : null;
  await configureReportReporter();
  if (pending && Date.now() >= pending.expiresAt) pending = null;
  if (
    pending &&
    !pending.settings &&
    typeof pending.notificationsEnabled !== 'boolean' &&
    native?.operationId === pending.id
  ) {
    pending.status = native.outcome === 'dry_run' ? 'failed' : native.outcome;
    if (native.issueUrl) pending.issueUrl = native.issueUrl;
  }
  return {
    notificationsAvailable: Platform.OS === 'ios',
    availability: native?.status ?? 'unavailable',
    operation: pending,
    updates: reportUpdatesSnapshot(),
    settings: native?.settings,
  };
}

/** Opens Gripe's local preference menu. */
export async function openFeedbackSettings() {
  try {
    if (__DEV__ && Platform.OS === 'ios' && (await bridge?.status())?.status === 'ready')
      await bridge?.settings();
  } catch (error) {
    showToast({ message: errorMessage(error), kind: 'error' });
  }
}

/** Opens the same user-reviewed native flow as the two-finger gesture. */
export async function openFeedback() {
  const state = await feedbackState();
  if (state.availability !== 'ready') {
    const message =
      Platform.OS !== 'ios'
        ? 'Screenshot feedback currently requires an iOS Debug build.'
        : !__DEV__ || state.availability === 'release_disabled'
          ? 'Screenshot feedback is disabled in this build. It currently requires an iOS Debug build.'
          : state.availability === 'missing_key'
            ? 'Configure GRIPE_API_KEY and rebuild the iOS Debug app.'
            : 'This build does not include screenshot feedback. Install an iOS Debug build with the Gripe module.';
    showToast({ message: errorMessage(message), kind: 'error' });
    return;
  }
  try {
    await bridge?.open(`local-${Date.now()}`);
  } catch (error) {
    showToast({ message: errorMessage(error), kind: 'error' });
  }
}

/** @param {FeedbackRequest|null} request @param {()=>Promise<unknown>} authorize */
export async function requestFeedback(request, authorize) {
  if (!request) {
    if (pending && ['awaiting_user', 'running'].includes(pending.status))
      pending.status = 'cancelled';
    return;
  }
  if (pending?.id === request.id || Date.now() >= request.expiresAt) return;
  const state = await feedbackState();
  if (
    (typeof request.notificationsEnabled === 'boolean'
      ? !state.notificationsAvailable
      : state.availability !== 'ready') ||
    AppState.currentState !== 'active'
  )
    return;
  pending = { ...request, status: 'awaiting_user' };
  Alert.alert(
    typeof request.notificationsEnabled === 'boolean'
      ? 'Agent requested report notifications'
      : request.settings
        ? 'Agent requested Gripe settings'
        : 'Agent requested a bug report',
    typeof request.notificationsEnabled === 'boolean'
      ? `Set bug report notifications to ${request.notificationsEnabled ? 'on' : 'off'}? Enabling may require your approval in an OS prompt.`
      : request.settings
        ? `Apply these Gripe settings on this phone?\n${JSON.stringify(request.settings, null, 2)}`
        : 'Open screenshot feedback? Review the image before submitting it to the configured feedback destination. Your agent receives only the submission outcome and receipt link.',
    [
      {
        text: 'Cancel',
        style: 'cancel',
        onPress: () => {
          if (pending?.id === request.id) pending.status = 'cancelled';
        },
      },
      {
        text:
          typeof request.notificationsEnabled === 'boolean'
            ? 'Apply notifications'
            : request.settings
              ? 'Apply settings'
              : 'Open feedback',
        onPress: () => {
          if (
            pending?.id !== request.id ||
            Date.now() >= request.expiresAt ||
            AppState.currentState !== 'active'
          )
            return;
          void authorize()
            .then(() => {
              if (
                pending?.id !== request.id ||
                Date.now() >= request.expiresAt ||
                AppState.currentState !== 'active'
              )
                throw new Error('Feedback request is no longer active.');
              return typeof request.notificationsEnabled === 'boolean'
                ? setReportNotifications(request.notificationsEnabled).then(() => null)
                : request.settings
                  ? bridge?.configure(request.settings)
                  : bridge?.open(request.id);
            })
            .then((result) => {
              if (pending?.id === request.id)
                pending.status =
                  typeof request.notificationsEnabled === 'boolean'
                    ? reportUpdatesSnapshot().enabled === request.notificationsEnabled
                      ? 'completed'
                      : 'failed'
                    : request.settings
                      ? result?.settings &&
                        Object.entries(request.settings).every(
                          ([key, value]) =>
                            result.settings?.[/** @type {keyof FeedbackSettings} */ (key)] ===
                            value,
                        )
                        ? 'completed'
                        : 'failed'
                      : result?.operationId === request.id
                        ? result.outcome
                        : 'failed';
              return undefined;
            })
            .catch(() => {
              if (pending?.id === request.id) pending.status = 'failed';
            });
        },
      },
    ],
  );
}
