import { toFunctionSelector } from 'viem';
import { encodeNacCall, encodeNacCallMichelson } from '../../src/tezosx/abi';
import { DEFAULT_KNOWN_SIGNATURES } from '../../src/tezosx/michelson-to-evm';

const word = (hex: string) => hex.padStart(64, '0');
const utf8Hex = (s: string) => Buffer.from(s, 'utf8').toString('hex');

describe('NAC precompile ABI encoding', () => {
  it('encodes `callMichelson(string,string,bytes)` (known-answer test)', () => {
    const expected =
      '0xa1544fc3' +
      // head: offsets of the three dynamic arguments
      word('60') +
      word('a0') +
      word('e0') +
      // destination
      word('3') +
      utf8Hex('KT1').padEnd(64, '0') +
      // entrypoint
      word('7') +
      utf8Hex('default').padEnd(64, '0') +
      // data
      word('2') +
      'abcd'.padEnd(64, '0');
    expect(encodeNacCallMichelson('KT1', 'default', 'abcd')).toBe(expected);
    expect(encodeNacCallMichelson('KT1', 'default', '0xabcd')).toBe(expected);
  });

  it('encodes `call(string,(string,string)[],bytes,uint8)` with the expected selector', () => {
    const data = encodeNacCall('http://tezos/tz1', [{ key: 'k', value: 'v' }], '0x', 1);
    expect(data.slice(0, 10)).toBe(
      toFunctionSelector('call(string,(string,string)[],bytes,uint8)')
    );
    expect(data).toContain(utf8Hex('http://tezos/tz1'));
  });

  it('indexes the default known signatures by their selector', () => {
    for (const [selector, signature] of Object.entries(DEFAULT_KNOWN_SIGNATURES)) {
      expect(toFunctionSelector(signature)).toBe(`0x${selector}`);
    }
  });
});
