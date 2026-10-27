import test from 'node:test';
import assert from 'node:assert/strict';
import { authUserKey, googleOAuthQuery, hasGoogleIdentity } from '../src/auth-policy.mjs';

test('requires a non-anonymous Google identity for every private app page', () => {
  assert.equal(hasGoogleIdentity(null), false);
  assert.equal(hasGoogleIdentity({email:'owner@example.test', identities:[{provider:'email'}]}), false);
  assert.equal(hasGoogleIdentity({email:'owner@example.test', is_anonymous:true, identities:[{provider:'google'}]}), false);
  assert.equal(hasGoogleIdentity({email:'owner@example.test', identities:[{provider:'google'}]}), true);
});

test('routine token refresh keeps the same app identity while logout changes it', () => {
  const user = {id:'user-1', email:'owner@example.test', identities:[{provider:'google'}]};
  assert.equal(authUserKey(user), authUserKey({...user, updated_at:'later'}));
  assert.notEqual(authUserKey(user), authUserKey(null));
  assert.notEqual(authUserKey(user), authUserKey({...user, identities:[{provider:'email'}]}));
});

test('a supplied Google email opens that account without forcing a stuck chooser again', () => {
  assert.deepEqual(googleOAuthQuery(), {prompt:'select_account'});
  assert.deepEqual(googleOAuthQuery(' owner@example.test '), {login_hint:'owner@example.test'});
  assert.throws(() => googleOAuthQuery('bad email'));
});
