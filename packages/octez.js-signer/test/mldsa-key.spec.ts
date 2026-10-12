import { InvalidKeyError, ParameterValidationError } from '@tezos-x/octez.js-core';
import {
  b58DecodeAndCheckPrefix,
  buf2hex,
  InvalidPublicKeyError,
  PrefixV2,
  verifySignature,
} from '@tezos-x/octez.js-utils';
import { tz5 } from '../../../test-fixtures/tz5';
import { MLDSAKey, MLDSAPublicKey } from '../src/mldsa-key';
import { publicKeyFromString } from '../src/in-memory-signer';

const [secretBytes] = b58DecodeAndCheckPrefix(tz5.secretKey, [PrefixV2.MLDSA44SecretKey]);

describe('MLDSAKey', () => {
  it('loads an unencrypted secret key and exposes its keys and signatures', () => {
    const key = new MLDSAKey(tz5.secretKey);
    expect(key.secretKey()).toBe(tz5.secretKey);
    expect(key.publicKey().toString()).toBe(tz5.publicKey);
    const { sig, prefixSig, rawSignature } = key.sign(new Uint8Array([1, 2, 3]));
    expect(sig).toBe(prefixSig);
    expect(rawSignature).toHaveLength(2420);
    expect(verifySignature('010203', tz5.publicKey, sig)).toBe(true);
  });

  it('decrypts the payload of an encrypted secret key with the provided function', () => {
    const [encryptedPayload] = b58DecodeAndCheckPrefix(tz5.encryptedSecretKey, [
      PrefixV2.MLDSA44EncryptedSecretKey,
    ]);
    const decrypt = vi.fn(() => secretBytes);
    const key = new MLDSAKey(tz5.encryptedSecretKey, decrypt);
    expect(decrypt).toHaveBeenCalledExactlyOnceWith(encryptedPayload);
    expect(key.secretKey()).toBe(tz5.secretKey);
  });

  it('requires a decryption function for an encrypted secret key', () => {
    expect(() => new MLDSAKey(tz5.encryptedSecretKey)).toThrow(
      'decryption function is not provided'
    );
  });

  it('rejects a secret key of the wrong length', () => {
    const decrypt = () => secretBytes.slice(0, secretBytes.length - 1);
    expect(() => new MLDSAKey(tz5.encryptedSecretKey, decrypt)).toThrow(InvalidKeyError);
  });

  it('rejects a key that is not an ML-DSA-44 secret key', () => {
    expect(() => new MLDSAKey(tz5.publicKey)).toThrow(ParameterValidationError);
  });
});

describe('MLDSAPublicKey', () => {
  const [publicBytes] = b58DecodeAndCheckPrefix(tz5.publicKey, [PrefixV2.MLDSA44PublicKey]);

  it('can be built from a string or from raw bytes', () => {
    const fromString = new MLDSAPublicKey(tz5.publicKey);
    const fromBytes = new MLDSAPublicKey(publicBytes);
    expect(fromString.toString()).toBe(tz5.publicKey);
    expect(fromBytes.toString()).toBe(tz5.publicKey);
    expect(fromBytes.hash()).toBe(tz5.publicKeyHash);
    expect(fromString.compare(fromBytes)).toBe(0);
  });

  it('returns copies of its bytes and prefixes the protocol encoding with the tag', () => {
    const key = new MLDSAPublicKey(publicBytes);
    const bytes = key.bytes();
    expect(buf2hex(bytes)).toBe(buf2hex(publicBytes));
    bytes[0] ^= 0xff;
    expect(buf2hex(key.bytes())).toBe(buf2hex(publicBytes));
    expect(buf2hex(key.toProtocol())).toBe('04' + buf2hex(publicBytes));
  });

  it('orders different ML-DSA-44 keys', () => {
    const a = new MLDSAPublicKey(tz5.publicKey);
    const b = new MLDSAPublicKey(tz5.otherPublicKey);
    expect(a.compare(b)).not.toBe(0);
    expect(Math.sign(a.compare(b))).toBe(-Math.sign(b.compare(a)));
  });

  it('refuses to compare with a key of another scheme', () => {
    const edKey = publicKeyFromString('edpkvWbk81uh1DEvdWKR4g1bjyTGhdu1mDvznPUFE2zDwNsLXrEb9K');
    expect(() => new MLDSAPublicKey(tz5.publicKey).compare(edKey)).toThrow(InvalidPublicKeyError);
  });

  it('rejects a public key of the wrong length', () => {
    expect(() => new MLDSAPublicKey(publicBytes.slice(1))).toThrow(InvalidPublicKeyError);
    expect(() => new MLDSAPublicKey(new Uint8Array(0))).toThrow(InvalidPublicKeyError);
  });

  it('rejects a string that is not an ML-DSA-44 public key', () => {
    expect(() => new MLDSAPublicKey(tz5.secretKey)).toThrow(ParameterValidationError);
  });
});
