import { beforeEach, describe, expect, it } from 'vitest';
import {
  normalizeKey,
  listCredentials,
  saveCredential,
  deleteCredential,
  extractSecretKeys,
  resolveSecretsInText,
  maskSecretsInText,
  getCredentialsMap,
} from '../src/services/credentials';

describe('Credentials Vault Service', () => {
  beforeEach(async () => {
    // Clear credentials in storage
    const all = await listCredentials();
    for (const item of all) {
      await deleteCredential(item.key);
    }
  });

  it('normalizes key names correctly', () => {
    expect(normalizeKey('github_token')).toBe('GITHUB_TOKEN');
    expect(normalizeKey('  my-api-key!  ')).toBe('MY-API-KEY_');
    expect(normalizeKey('OPENROUTER_KEY')).toBe('OPENROUTER_KEY');
  });

  it('saves, retrieves, and updates credentials in the vault', async () => {
    await saveCredential({
      key: 'GH_TOKEN',
      value: 'ghp_secret1234567890',
      description: 'GitHub Personal Access Token',
    });

    const list = await listCredentials();
    expect(list.length).toBe(1);
    expect(list[0].key).toBe('GH_TOKEN');
    expect(list[0].value).toBe('ghp_secret1234567890');
    expect(list[0].description).toBe('GitHub Personal Access Token');

    // Update existing key
    await saveCredential({
      key: 'gh_token',
      value: 'ghp_updated9876543210',
    });

    const updatedMap = await getCredentialsMap();
    expect(updatedMap['GH_TOKEN']).toBe('ghp_updated9876543210');
  });

  it('deletes credentials from vault', async () => {
    await saveCredential({ key: 'KEY1', value: 'val1' });
    await saveCredential({ key: 'KEY2', value: 'val2' });

    let list = await listCredentials();
    expect(list.length).toBe(2);

    await deleteCredential('KEY1');
    list = await listCredentials();
    expect(list.length).toBe(1);
    expect(list[0].key).toBe('KEY2');
  });

  it('extracts secret placeholder keys from text', () => {
    const text = 'Here is $SECRET{GH_TOKEN} and $SECRET{AWS_SECRET_KEY} with another $SECRET{GH_TOKEN}';
    const keys = extractSecretKeys(text);
    expect(keys).toEqual(['GH_TOKEN', 'AWS_SECRET_KEY']);
  });

  it('resolves secrets in text without mutating unmatched placeholders', () => {
    const vault = {
      GH_TOKEN: 'ghp_secret999',
      OPENAI_KEY: 'sk-proj-abc1234567',
    };

    const text = 'curl -H "Authorization: Bearer $SECRET{GH_TOKEN}" https://api.github.com and $SECRET{UNKNOWN_KEY}';
    const resolved = resolveSecretsInText(text, vault);

    expect(resolved).toBe('curl -H "Authorization: Bearer ghp_secret999" https://api.github.com and $SECRET{UNKNOWN_KEY}');
  });

  it('masks leaked secret values back to placeholder tags', () => {
    const vault = {
      GH_TOKEN: 'ghp_secret999',
    };

    const leakedResponse = 'Your token is ghp_secret999, proceed with care.';
    const masked = maskSecretsInText(leakedResponse, vault);

    expect(masked).toBe('Your token is [REDACTED_SECRET:GH_TOKEN], proceed with care.');
  });
});
