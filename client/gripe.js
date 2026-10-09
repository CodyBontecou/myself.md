import { requireOptionalNativeModule } from 'expo';
import { Alert, AppState, Platform } from 'react-native';

/** @typedef {{status:string,operationId:string,outcome:string,issueUrl:string}} FeedbackState */
/** @type {{status:()=>Promise<FeedbackState>,open:(id:string)=>Promise<FeedbackState>}|null} */
const bridge = requireOptionalNativeModule('MyselfGripe');
/** @type {{id:string,expiresAt:number,status:string,issueUrl?:string}|null} */
let pending = null;

export async function feedbackState() {
  const native = __DEV__ && Platform.OS === 'ios' ? await bridge?.status() : null;
  if (pending && Date.now() >= pending.expiresAt) pending = null;
  if (pending && native?.operationId === pending.id) {
    pending.status = native.outcome === 'dry_run' ? 'failed' : native.outcome;
    if (native.issueUrl) pending.issueUrl = native.issueUrl;
  }
  return { availability: native?.status ?? 'unavailable', operation: pending };
}

/** Opens the same user-reviewed native flow as the two-finger gesture. */
export async function openFeedback() {
  const state = await feedbackState();
  if (state.availability !== 'ready') {
    Alert.alert('Feedback unavailable', 'Configure GRIPE_API_KEY and rebuild the iOS Debug app.');
    return;
  }
  try {
    await bridge?.open(`local-${Date.now()}`);
  } catch {
    Alert.alert(
      'Feedback unavailable',
      'Finish any open report and keep myself.md in the foreground.',
    );
  }
}

/** @param {{id:string,expiresAt:number}|null} request @param {()=>Promise<unknown>} authorize */
export async function requestFeedback(request, authorize) {
  if (!request) {
    if (pending && ['awaiting_user', 'running'].includes(pending.status))
      pending.status = 'cancelled';
    return;
  }
  if (pending?.id === request.id || Date.now() >= request.expiresAt) return;
  const state = await feedbackState();
  if (state.availability !== 'ready' || AppState.currentState !== 'active') return;
  pending = { ...request, status: 'awaiting_user' };
  Alert.alert(
    'Agent requested a bug report',
    'Open screenshot feedback? Review and crop the image before submitting it to GitHub. Your agent receives only the outcome and issue link.',
    [
      {
        text: 'Cancel',
        style: 'cancel',
        onPress: () => {
          if (pending?.id === request.id) pending.status = 'cancelled';
        },
      },
      {
        text: 'Open feedback',
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
              return bridge?.open(request.id);
            })
            .then((result) => {
              if (pending?.id === request.id)
                pending.status = result?.operationId === request.id ? result.outcome : 'failed';
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
