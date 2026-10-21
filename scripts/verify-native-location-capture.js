import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import * as data from '../core/data.js';
import * as timeSeries from '../core/time-series.js';

/** @typedef {{owner:string,deviceId:string}} Identity */
/** @typedef {{requestId:string,deviceId:string,valid:()=>boolean|Promise<boolean>}} Operation */
/** @typedef {{request:string,state:string,captured:string|null}} Receipt */
/** @typedef {{capturedAt:string,recordCount:1}} CaptureResult */
/** @typedef {{captureLocation:(owner:string,operation?:Operation)=>Promise<CaptureResult>,startTracking:(owner:string)=>Promise<boolean|null>,stopTracking:()=>Promise<void>,migrateLocationTask:()=>Promise<void>,pendingLocationCaptureReceipts:(session:Identity)=>Receipt[],acknowledgeLocationCapture:(session:Identity,id:string)=>void,declineLocationCapture:(session:Identity,id:string)=>void}} NativeCapture */
/** @typedef {{requestId:string,expiresAt:string}} CaptureRequest */
/** @typedef {{reviewLocationCapture:(session:Identity,request:CaptureRequest|null,refreshed:()=>Promise<void>,active:()=>boolean)=>Promise<void>}} CaptureReview */
/** @typedef {{requestId:string,action:string,capturedAt?:string,error?:string}} Report */
/** @typedef {{text:string,onPress:()=>void}} AlertButton */

/** @param {string} path @param {Record<string,object>} imports */
async function load(path, imports) {
  const module = new SourceTextModule(await readFile(new URL(path, import.meta.url), 'utf8'));
  await module.link((name) => {
    const values = imports[name];
    assert.ok(values, `Unexpected native capture import: ${name}`);
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    });
  });
  await module.evaluate();
  return module.namespace;
}
const session = { owner: 'synthetic-owner', deviceId: 'synthetic-phone' };
const point = {
  timestamp: Date.parse('2026-10-17T20:44:51.482Z'),
  coords: { latitude: 0, longitude: 0, accuracy: 5 },
};
const capturedAt = new Date(point.timestamp).toISOString();
const flush = () => new Promise((resolve) => setImmediate(resolve));
/** @param {string} requestId */
const request = (requestId) => ({
  requestId,
  expiresAt: new Date(Date.now() + 60000).toISOString(),
});

async function harness() {
  const db = new DatabaseSync(':memory:');
  const control = {
    permission: true,
    active: true,
    scope: /** @type {Identity|null} */ ({ ...session }),
    permissionCalls: 0,
    positionCalls: 0,
    recording: false,
    legacyRecording: false,
    startCalls: 0,
    failSql: /** @type {RegExp|null} */ (null),
    afterPermission: async () => {},
    afterPosition: async () => {},
    afterStart: async () => {},
    refreshed: async () => {},
    respond: async (/** @type {Report} */ report) => ({
      status:
        report.action === 'complete'
          ? 'completed'
          : report.action === 'cancel'
            ? 'cancelled'
            : report.action === 'fail'
              ? 'failed'
              : 'running',
    }),
  };
  const storage = {
    execSync: (/** @type {string} */ sql) => db.exec(sql),
    /** @param {string} sql @param {...import('node:sqlite').SQLInputValue} args */
    getFirstSync: (sql, ...args) => db.prepare(sql).get(...args) ?? null,
    /** @param {string} sql @param {...import('node:sqlite').SQLInputValue} args */
    getAllSync: (sql, ...args) => db.prepare(sql).all(...args),
    /** @param {string} sql @param {...import('node:sqlite').SQLInputValue} args */
    runSync: (sql, ...args) => {
      if (control.failSql?.test(sql)) throw new Error('Synthetic journal fault.');
      return db.prepare(sql).run(...args);
    },
    withTransactionSync(/** @type {()=>void} */ action) {
      db.exec('BEGIN');
      try {
        action();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
  const library = await load('../client/library.js', {
    './phone-database.js': { phoneDatabase: () => storage },
    '../core/time-series.js': timeSeries,
  });
  /** @type {AlertButton[][]} */
  const alerts = [];
  const nativeUi = {
    Alert: {
      alert: (
        /** @type {string} */ _title,
        /** @type {string} */ _body,
        /** @type {AlertButton[]} */ buttons,
      ) => {
        alerts.push(buttons);
      },
    },
    Platform: { OS: 'ios' },
    AppState: { currentState: 'active' },
  };
  /** @type {Report[]} */
  const reports = [];
  /** @type {null|((event:{data:{locations:typeof point[]},error:null})=>Promise<void>)} */
  let backgroundTask = null;
  /** @returns {Promise<NativeCapture>} */
  const loadNative = async () =>
    /** @type {NativeCapture} */ (
      await load('../client/location-task.js', {
        'expo-task-manager': {
          defineTask: (
            /** @type {string} */ _name,
            /** @type {NonNullable<typeof backgroundTask>} */ action,
          ) => {
            backgroundTask = action;
          },
        },
        'expo-location': {
          Accuracy: { Balanced: 3 },
          requestForegroundPermissionsAsync: async () => {
            control.permissionCalls++;
            await control.afterPermission();
            return { granted: control.permission };
          },
          getCurrentPositionAsync: async () => {
            control.positionCalls++;
            await control.afterPosition();
            return point;
          },
          getBackgroundPermissionsAsync: async () => ({ granted: true }),
          hasStartedLocationUpdatesAsync: async (/** @type {string} */ task) =>
            task === 'myselfmd-location' ? control.recording : control.legacyRecording,
          stopLocationUpdatesAsync: async (/** @type {string} */ task) => {
            if (task === 'myselfmd-location') control.recording = false;
            else control.legacyRecording = false;
          },
          startLocationUpdatesAsync: async () => {
            control.startCalls++;
            await control.afterStart();
            control.recording = true;
          },
        },
        'expo-notifications': {},
        'react-native': nativeUi,
        './phone-database.js': { phoneDatabase: () => storage },
        '../core/data.js': data,
        './library.js': library,
      })
    );
  let native = await loadNative();
  /** @returns {Promise<CaptureReview>} */
  const loadReview = async () =>
    /** @type {CaptureReview} */ (
      await load('../client/location-capture.js', {
        'react-native': nativeUi,
        './session.js': {
          api: async (
            /** @type {Identity} */ owner,
            /** @type {string} */ path,
            /** @type {{body:string}} */ options,
          ) => {
            assert.equal(owner.owner, session.owner);
            assert.equal(path, `/api/phones/${session.deviceId}/location-capture`);
            const report = /** @type {Report} */ (JSON.parse(options.body));
            reports.push(report);
            assert.ok(
              !/latitude|longitude|coords/.test(options.body),
              'Reports contain effect metadata only.',
            );
            return control.respond(report);
          },
        },
        './export-context.js': { loadExportContext: () => control.scope },
        './location-task.js': native,
      })
    );
  let review = await loadReview();
  return {
    db,
    control,
    alerts,
    reports,
    get native() {
      return native;
    },
    background: async () => {
      assert.ok(backgroundTask);
      await backgroundTask({ data: { locations: [point] }, error: null });
    },
    count: () => Number(db.prepare('SELECT COUNT(*) AS count FROM records').get()?.count),
    receipt: (/** @type {string} */ id) =>
      db
        .prepare(
          'SELECT state,captured,acknowledged FROM location_capture_receipts WHERE owner=? AND device=? AND request=?',
        )
        .get(session.owner, session.deviceId, id),
    operation: (/** @type {string} */ id, valid = () => true) => ({
      requestId: id,
      deviceId: session.deviceId,
      valid,
    }),
    poll: (/** @type {CaptureRequest|null} */ value = null) =>
      review.reviewLocationCapture(session, value, control.refreshed, () => control.active),
    press: (/** @type {string} */ text) => {
      const button = alerts.at(-1)?.find((item) => item.text === text);
      assert.ok(button, `Missing owner review button: ${text}`);
      button.onPress();
    },
    async restart() {
      native = await loadNative();
      review = await loadReview();
    },
  };
}
/** @param {(fixture:Awaited<ReturnType<typeof harness>>)=>Promise<void>} action */
async function verify(action) {
  const fixture = await harness();
  try {
    await action(fixture);
  } finally {
    fixture.db.close();
  }
}

await verify(async (h) => {
  const ui = await h.native.captureLocation(session.owner);
  assert.equal(ui.recordCount, 1);
  assert.equal(ui.capturedAt, capturedAt);
  assert.equal(h.count(), 1, 'The direct UI capture path saves exactly one native record.');
  assert.equal(h.native.pendingLocationCaptureReceipts(session).length, 0);
  const operation = h.operation('cached');
  const result = await h.native.captureLocation(session.owner, operation);
  assert.equal(h.count(), 2);
  assert.equal(h.receipt('cached')?.state, 'completed');
  assert.equal(h.receipt('cached')?.captured, capturedAt);
  const cached = await h.native.captureLocation(session.owner, {
    ...operation,
    valid: () => assert.fail('A cached effect does not run another native operation.'),
  });
  assert.equal(cached.capturedAt, result.capturedAt);
  assert.equal(h.control.positionCalls, 2);
  assert.equal(h.count(), 2);
  const row = h.db.prepare('SELECT owner,domain,type,source,start FROM records LIMIT 1').get();
  assert.deepEqual(
    { ...row },
    {
      owner: session.owner,
      domain: 'location',
      type: 'points',
      source: 'expo-location',
      start: capturedAt,
    },
  );
});

await verify(async (h) => {
  h.control.failSql = /UPDATE location_capture_receipts SET state=\?,captured=/;
  await assert.rejects(
    () => h.native.captureLocation(session.owner, h.operation('atomic')),
    /Synthetic journal fault/,
  );
  assert.equal(h.count(), 0, 'Journal failure rolls back the native record insertion.');
  assert.equal(h.receipt('atomic')?.state, 'failed');
  assert.equal(h.receipt('atomic')?.captured, null);
});

await verify(async (h) => {
  h.db
    .prepare('INSERT INTO location_capture_receipts(owner,device,request,state) VALUES(?,?,?,?)')
    .run(session.owner, session.deviceId, 'interrupted', 'running');
  await assert.rejects(
    () => h.native.captureLocation(session.owner, h.operation('interrupted')),
    /interrupted/,
  );
  assert.equal(h.control.positionCalls, 0);
  await h.poll();
  assert.equal(h.reports[0]?.action, 'fail');
  assert.equal(h.reports[0]?.error, 'interrupted');
  assert.equal(h.receipt('interrupted')?.acknowledged, 1);
});

await verify(async (h) => {
  await h.native.captureLocation(session.owner, h.operation('isolated'));
  for (const foreign of [
    { owner: 'other-owner', deviceId: session.deviceId },
    { owner: session.owner, deviceId: 'other-phone' },
  ]) {
    assert.equal(h.native.pendingLocationCaptureReceipts(foreign).length, 0);
    h.native.acknowledgeLocationCapture(foreign, 'isolated');
    assert.equal(h.receipt('isolated')?.acknowledged, 0);
  }
  await assert.rejects(
    () =>
      h.native.captureLocation('other-owner', {
        requestId: 'isolated',
        deviceId: session.deviceId,
        valid: () => false,
      }),
    /changed/,
  );
  await assert.rejects(
    () =>
      h.native.captureLocation(session.owner, {
        requestId: 'isolated',
        deviceId: 'other-phone',
        valid: () => false,
      }),
    /changed/,
  );
  assert.equal(
    h.control.positionCalls,
    1,
    'A foreign owner cannot reuse another owner’s cached receipt.',
  );
  assert.equal(h.count(), 1);
});

await verify(async (h) => {
  h.control.permission = false;
  await assert.rejects(
    () => h.native.captureLocation(session.owner, h.operation('denied')),
    /permission was not granted/,
  );
  assert.equal(h.control.positionCalls, 0);
  assert.equal(h.count(), 0);
  assert.equal(h.receipt('denied')?.state, 'failed');
});

for (const stage of ['before-permission', 'after-permission', 'after-position']) {
  // oxlint-disable-next-line eslint/no-await-in-loop -- Each isolated database verifies a distinct authorization boundary.
  await verify(async (h) => {
    let valid = stage !== 'before-permission';
    if (stage === 'after-permission')
      h.control.afterPermission = async () => {
        valid = false;
      };
    if (stage === 'after-position')
      h.control.afterPosition = async () => {
        valid = false;
      };
    await assert.rejects(
      () =>
        h.native.captureLocation(
          session.owner,
          h.operation(stage, () => valid),
        ),
      /changed/,
    );
    assert.equal(h.count(), 0, `${stage}: a changed account/request never commits a point.`);
    assert.equal(h.control.permissionCalls, stage === 'before-permission' ? 0 : 1);
    assert.equal(h.control.positionCalls, stage === 'after-position' ? 1 : 0);
  });
}

await verify(async (h) => {
  await h.poll(request('cancel'));
  assert.equal(h.alerts.length, 1);
  h.press('Cancel');
  await flush();
  assert.equal(h.control.positionCalls, 0);
  assert.equal(h.count(), 0);
  assert.equal(h.receipt('cancel')?.state, 'cancelled');
  assert.equal(h.receipt('cancel')?.acknowledged, 1);
  await h.poll(request('cancel'));
  assert.equal(h.alerts.length, 1, 'A reviewed request is not presented twice.');
});

await verify(async (h) => {
  const pending = request('approve');
  await h.poll(pending);
  await h.poll(pending);
  assert.equal(h.alerts.length, 1);
  h.press('Save one point');
  await flush();
  assert.equal(h.control.positionCalls, 1);
  assert.equal(h.count(), 1);
  assert.equal(h.reports.filter((report) => report.action === 'start').length, 1);
  assert.equal(h.reports.filter((report) => report.action === 'check').length, 3);
  assert.equal(h.reports.filter((report) => report.action === 'complete').length, 1);
  assert.equal(h.receipt('approve')?.acknowledged, 1);
  await h.poll(pending);
  assert.equal(h.control.positionCalls, 1);
});

await verify(async (h) => {
  const pending = request('expired-during-permission');
  await h.poll(pending);
  h.control.afterPermission = async () => {
    pending.expiresAt = new Date(Date.now() - 1).toISOString();
  };
  h.press('Save one point');
  await flush();
  assert.equal(
    h.control.positionCalls,
    0,
    'An expired request cannot proceed after OS consent returns.',
  );
  assert.equal(h.count(), 0);
  assert.equal(h.receipt(pending.requestId)?.state, 'failed');
});

for (const change of ['owner', 'device', 'inactive', 'request']) {
  // oxlint-disable-next-line eslint/no-await-in-loop -- Exercise each independently revoked owner/request boundary.
  await verify(async (h) => {
    await h.poll(request(change));
    h.control.afterPosition = async () => {
      if (change === 'owner') h.control.scope = { ...session, owner: 'other-owner' };
      if (change === 'device') h.control.scope = { ...session, deviceId: 'other-phone' };
      if (change === 'inactive') h.control.active = false;
      if (change === 'request') h.control.respond = async () => ({ status: 'cancelled' });
    };
    h.press('Save one point');
    await flush();
    assert.equal(h.control.positionCalls, 1);
    assert.equal(
      h.count(),
      0,
      `${change}: context or request change while native capture awaited prevents save.`,
    );
    assert.equal(h.receipt(change)?.state, 'failed');
  });
}

for (const lost of ['refresh', 'complete-report']) {
  // oxlint-disable-next-line eslint/no-await-in-loop -- Independent failures after the committed native effect must recover without recapture.
  await verify(async (h) => {
    if (lost === 'refresh')
      h.control.refreshed = async () => {
        throw new Error('Synthetic refresh failure.');
      };
    if (lost === 'complete-report')
      h.control.respond = async (report) => {
        if (report.action === 'complete') throw new Error('Synthetic network loss.');
        return { status: 'running' };
      };
    await h.poll(request(lost));
    h.press('Save one point');
    await flush();
    assert.equal(h.count(), 1);
    assert.equal(h.receipt(lost)?.state, 'completed');
    assert.equal(h.receipt(lost)?.acknowledged, 0);
    assert.equal(
      h.reports.some((report) => report.action === 'fail'),
      false,
      'A post-save failure never reports that the native effect failed.',
    );
    await h.restart();
    h.control.respond = async () => ({ status: 'running' });
    await h.poll();
    assert.equal(h.reports.at(-1)?.action, 'complete');
    assert.equal(h.reports.at(-1)?.capturedAt, capturedAt);
    assert.equal(
      h.receipt(lost)?.acknowledged,
      0,
      'A nonterminal server reply cannot acknowledge a committed receipt.',
    );
    h.control.respond = async () => ({ status: 'completed' });
    await h.poll();
    assert.equal(h.receipt(lost)?.acknowledged, 1);
    assert.equal(h.native.pendingLocationCaptureReceipts(session).length, 0);
    assert.equal(
      h.control.positionCalls,
      1,
      'Restart/poll replays metadata without reading another native position.',
    );
    assert.equal(h.count(), 1);
  });
}

await verify(async (h) => {
  await h.native.captureLocation('other-owner');
  h.control.afterPosition = async () => {
    await h.native.stopTracking();
    h.db.prepare('DELETE FROM records WHERE owner=?').run(session.owner);
  };
  await assert.rejects(() => h.native.captureLocation(session.owner), /stopped/);
  assert.equal(
    h.count(),
    1,
    'A late direct GPS result cannot recreate the erased owner partition.',
  );
  assert.equal(h.db.prepare('SELECT owner FROM records').get()?.owner, 'other-owner');
});

await verify(async (h) => {
  h.control.afterPermission = () => h.native.stopTracking();
  await assert.rejects(() => h.native.captureLocation(session.owner), /stopped/);
  assert.equal(h.control.positionCalls, 0, 'Stop during permission review prevents a GPS read.');
  await assert.rejects(() => h.native.startTracking(session.owner), /stopped/);
  assert.equal(h.control.startCalls, 0, 'A pending permission flow cannot restart recording.');
});

await verify(async (h) => {
  /** @type {Promise<void>|null} */ let stopping = null;
  h.control.afterStart = async () => {
    stopping = h.native.stopTracking();
  };
  await assert.rejects(() => h.native.startTracking(session.owner), /stopped/);
  await stopping;
  assert.equal(h.control.recording, false, 'Stop waits for a late native start and stops it.');
  assert.equal(h.db.prepare('SELECT owner FROM tracking WHERE id=1').get()?.owner, null);
});

await verify(async (h) => {
  /** @type {Promise<boolean|null>|null} */ let newer = null;
  /** @type {Promise<void>|null} */ let stopping = null;
  h.control.afterStart = async () => {
    if (h.control.startCalls !== 1) return;
    stopping = h.native.stopTracking();
    newer = h.native.startTracking('other-owner');
  };
  await assert.rejects(() => h.native.startTracking(session.owner), /stopped/);
  await stopping;
  assert.equal(await newer, true);
  assert.equal(h.control.recording, true, 'An older cancelled start cannot stop a newer owner.');
  assert.equal(h.db.prepare('SELECT owner FROM tracking WHERE id=1').get()?.owner, 'other-owner');
});

await verify(async (h) => {
  h.db.exec('CREATE TABLE account_cleanup(id INTEGER PRIMARY KEY,owner TEXT)');
  h.db.prepare('INSERT INTO account_cleanup VALUES(1,?)').run(session.owner);
  h.db.prepare('INSERT OR REPLACE INTO tracking VALUES(1,?)').run(session.owner);
  await h.restart();
  await assert.rejects(() => h.native.captureLocation(session.owner), /deletion is pending/);
  await assert.rejects(() => h.native.startTracking(session.owner), /deletion is pending/);
  await h.background();
  assert.equal(
    h.count(),
    0,
    'Durable deletion intent blocks direct and background saves after restart.',
  );
  assert.equal(h.control.permissionCalls, 0);
  await h.native.captureLocation('other-owner');
  assert.equal(
    h.count(),
    1,
    'A deletion marker does not erase or assume another account’s ownership.',
  );
});

await verify(async (h) => {
  h.db.exec('CREATE TABLE account_cleanup(id INTEGER PRIMARY KEY,owner TEXT)');
  h.control.afterStart = async () => {
    h.db.prepare('INSERT INTO account_cleanup VALUES(1,?)').run(session.owner);
  };
  await assert.rejects(() => h.native.startTracking(session.owner), /deletion is pending/);
  assert.equal(
    h.control.recording,
    false,
    'Deletion intent noticed after native start stops recording.',
  );
});

await verify(async (h) => {
  h.control.legacyRecording = true;
  h.db.prepare('INSERT OR REPLACE INTO tracking VALUES(1,?)').run(session.owner);
  /** @type {Promise<void>|null} */ let stopping = null;
  h.control.afterStart = async () => {
    stopping = h.native.stopTracking();
  };
  await h.native.migrateLocationTask();
  await stopping;
  assert.equal(
    h.control.recording,
    false,
    'A pending upgrade migration cannot restart after Stop.',
  );
  assert.equal(h.control.legacyRecording, false);
});

console.log(
  'Native Location capture: real SQLite records/journal, owner review, authorization races, atomic rollback, cached/interrupted attempts, lost-acknowledgment recovery, durable deletion gating and native capture/start/stop/migration cancellation pass.',
);
