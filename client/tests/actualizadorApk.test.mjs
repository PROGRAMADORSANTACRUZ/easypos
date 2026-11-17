import assert from 'node:assert/strict';
import test from 'node:test';
import { hayVersionNueva } from '../src/versionApk.js';

test('solo avisa cuando la version publicada es mayor que la instalada', () => {
  assert.equal(hayVersionNueva({ versionCode: 2 }, { versionCode: 3 }), true);
  assert.equal(hayVersionNueva({ versionCode: 3 }, { versionCode: 3 }), false);
  assert.equal(hayVersionNueva({ versionCode: 4 }, { versionCode: 3 }), false);
  assert.equal(hayVersionNueva({ versionCode: 2 }, null), false);
});
