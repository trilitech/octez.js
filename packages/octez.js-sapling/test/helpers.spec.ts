import { memoHexToUtf8 } from '../src/sapling-tx-viewer/helpers';

describe('Sapling helper functions', () => {
  it('Should transform memo to utf8 string', () => {
    const memoTaco = Buffer.from([116, 97, 99, 111]).toString('hex');
    expect(memoHexToUtf8(memoTaco)).toEqual('taco');

    const memoOctez = Buffer.from([111, 99, 116, 101, 122, 0, 0, 0]).toString('hex');
    expect(memoHexToUtf8(memoOctez)).toEqual('octez');

    const memoTest = Buffer.from([116, 101, 115, 116, 0, 0, 0, 0]).toString('hex');
    expect(memoHexToUtf8(memoTest)).toEqual('test');

    const memoEmpty = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]).toString('hex');
    expect(memoHexToUtf8(memoEmpty)).toEqual('');

    const memoHi = Buffer.from([104, 105, 0, 0, 0, 0, 0, 0]).toString('hex');
    expect(memoHexToUtf8(memoHi)).toEqual('hi');
  });
});
