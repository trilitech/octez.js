import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';
import { tz5 } from '../../../test-fixtures/tz5';
import { verifySignature } from '../src/verify-signature';

vi.mock('@noble/post-quantum/ml-dsa.js', () => ({
  ml_dsa44: {
    verify: vi.fn(() => {
      throw new Error('verifier failure');
    }),
  },
}));

describe('ML-DSA-44 verification when the verifier throws', () => {
  it('reports an invalid signature instead of propagating the error', () => {
    expect(verifySignature(tz5.message, tz5.publicKey, tz5.signatures.plain)).toBe(false);
    // Guards against a vacuous pass: the false must come from the caught verifier error.
    expect(ml_dsa44.verify).toHaveBeenCalledOnce();
  });
});
