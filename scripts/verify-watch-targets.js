import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { watchNativeFixtures, watchRecordFixtures, watchProfileFixture } from './watch-fixtures.js';

const require = createRequire(import.meta.url);
const { IOSConfig } = require('expo/config-plugins');
const withWatch = require('../plugins/with-watch.cjs');
const config = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const native = IOSConfig.XcodeUtils.getPbxproj(process.cwd());
const temp = mkdtempSync(join(tmpdir(), 'watch-targets-'));
const project = join(temp, 'ios', 'fixture.xcodeproj');
mkdirSync(project, { recursive: true });
writeFileSync(join(project, 'project.pbxproj'), native.writeSync());
const fixture = IOSConfig.XcodeUtils.getPbxproj(temp);
try {
  withWatch.configureProject(fixture, config, process.cwd());
  withWatch.writeFiles(process.cwd(), join(temp, 'ios'), config.ios.bundleIdentifier);
  /** @returns {Array<[string,{name:string,buildConfigurationList:string,buildPhases:Array<{value:string}>,dependencies:Array<{value:string}>}]>} */
  function targets() {
    return Object.entries(fixture.pbxNativeTargetSection()).filter(
      ([key, value]) => !key.endsWith('_comment') && typeof value === 'object',
    );
  }
  const generated = fixture.hash.project.objects;
  for (const [id, file] of Object.entries(generated.PBXFileReference)) {
    if (id.endsWith('_comment') || typeof file !== 'object' || !file.path?.includes('WatchNative/'))
      continue;
    const parents = Object.values(generated.PBXGroup).filter(
      (group) =>
        typeof group === 'object' &&
        group.children?.some((/** @type {{value:string}} */ child) => child.value === id),
    );
    assert.equal(
      parents.length,
      1,
      `Generated file ${file.path} needs one group parent for CocoaPods.`,
    );
  }
  const phaseOwners = new Map();
  for (const section of [
    'PBXSourcesBuildPhase',
    'PBXResourcesBuildPhase',
    'PBXCopyFilesBuildPhase',
  ]) {
    for (const phase of Object.values(generated[section] ?? {})) {
      if (typeof phase !== 'object') continue;
      for (const file of phase.files ?? []) {
        assert.ok(
          !phaseOwners.has(file.value),
          `Build file ${file.value} must belong to only one phase for CocoaPods.`,
        );
        phaseOwners.set(file.value, true);
      }
    }
  }
  const sourcesGroupKey = fixture.findPBXGroupKey({ name: 'WatchNativeSources' });
  assert.ok(sourcesGroupKey);
  assert.equal(
    fixture.getPBXGroupByKey(sourcesGroupKey).path,
    '.',
    'Watch files must resolve from the iOS project root.',
  );
  const before = targets().length;
  withWatch.configureProject(fixture, config, process.cwd());
  assert.equal(targets().length, before, 'Prebuild must not duplicate watch targets.');
  const watch = targets().find(([, target]) => target.name.replaceAll('"', '') === 'MyselfWatch');
  const widget = targets().find(
    ([, target]) => target.name.replaceAll('"', '') === 'MyselfWatchWidgets',
  );
  assert.ok(watch && widget);
  const objects = fixture.hash.project.objects;
  assert.ok(
    watch[1].dependencies.some(
      (entry) => objects.PBXTargetDependency[entry.value].target === widget[0],
    ),
  );
  for (const target of [watch, widget]) {
    const refs = objects.XCConfigurationList[target[1].buildConfigurationList].buildConfigurations;
    for (const reference of refs) {
      const settings = objects.XCBuildConfiguration[reference.value].buildSettings;
      assert.equal(settings.SDKROOT, 'watchos');
      assert.equal(settings.WATCHOS_DEPLOYMENT_TARGET, '11.0');
      assert.equal(settings.TARGETED_DEVICE_FAMILY, '4');
    }
    const sourcePhases = target[1].buildPhases.filter(
      (entry) => objects.PBXSourcesBuildPhase[entry.value],
    );
    assert.equal(sourcePhases.length, 1);
    const sources = objects.PBXSourcesBuildPhase[sourcePhases[0]?.value ?? ''].files.map(
      (/** @type {{value:string}} */ entry) =>
        objects.PBXFileReference[objects.PBXBuildFile[entry.value].fileRef].path,
    );
    assert.ok(
      sources.some((/** @type {string} */ source) => source.includes('WatchExportIntent.swift')),
    );
    assert.equal(
      sources.some((/** @type {string} */ source) => source.includes('WatchHealth.swift')),
      target === watch,
      'Widget must not collect health data or own upload credentials.',
    );
  }
  const copyPhases = Object.values(objects.PBXCopyFilesBuildPhase).filter(
    (entry) => typeof entry === 'object',
  );
  assert.equal(copyPhases.filter((entry) => entry.name === '"Embed Watch Content"').length, 1);
  assert.equal(copyPhases.filter((entry) => entry.name === '"Embed Watch Widgets"').length, 1);
  const watchInfo = readFileSync(join(temp, 'ios', 'WatchNative', 'Watch-Info.plist'), 'utf8');
  assert.ok(watchInfo.includes('<key>WKApplication</key><true/>'));
  assert.ok(watchInfo.includes(config.ios.bundleIdentifier));
  assert.ok(watchInfo.includes('<key>NSHealthShareUsageDescription</key>'));
  assert.ok(watchInfo.includes('<key>NSHealthUpdateUsageDescription</key>'));
  assert.ok(watchInfo.includes('It does not add or change Apple Health records.'));
  assert.ok(
    readFileSync(
      join(project, 'xcshareddata', 'xcschemes', 'MyselfWatch.xcscheme'),
      'utf8',
    ).includes(watch[0]),
  );
  assert.ok(
    readFileSync(join(temp, 'ios', 'WatchNative', 'Watch.entitlements'), 'utf8').includes(
      'com.apple.developer.healthkit',
    ),
  );
  const widgetEntitlements = readFileSync(
    join(temp, 'ios', 'WatchNative', 'Widget.entitlements'),
    'utf8',
  );
  assert.ok(widgetEntitlements.includes('com.apple.security.application-groups'));
  assert.ok(!widgetEntitlements.includes('healthkit'));
  const examples = {
    'native-steps': watchNativeFixtures,
    'expected-records': watchRecordFixtures,
    profile: watchProfileFixture,
  };
  for (const [name, value] of Object.entries(examples))
    assert.deepEqual(
      JSON.parse(readFileSync(`watch/Tests/Fixtures/${name}.json`, 'utf8')),
      value,
      'Swift golden fixtures must match the existing JavaScript serializer.',
    );
  const encoded = fixture.writeSync();
  assert.ok(encoded.includes('com.myself.md.watch.widgets'));
  writeFileSync(join(project, 'project.pbxproj'), encoded);
  assert.equal(
    Object.keys(IOSConfig.XcodeUtils.getPbxproj(temp).pbxNativeTargetSection()).length,
    Object.keys(fixture.pbxNativeTargetSection()).length,
    'Generated Xcode project must round-trip through its parser.',
  );
  console.log(
    'PASS watch target generation, idempotence, embedding, entitlements, shared scheme and JavaScript/Swift golden fixtures',
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
