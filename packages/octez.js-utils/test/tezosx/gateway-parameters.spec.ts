import { buildCallEvmParameter, buildHttpCallParameter } from '../../src/tezosx/gateway-parameters';

describe('buildHttpCallParameter', () => {
  it('builds a POST request with no headers, an empty body and no callback', () => {
    expect(buildHttpCallParameter('http://ethereum/0xabc')).toEqual({
      prim: 'Pair',
      args: [
        { string: 'http://ethereum/0xabc' },
        {
          prim: 'Pair',
          args: [
            [],
            {
              prim: 'Pair',
              args: [{ bytes: '' }, { prim: 'Pair', args: [{ int: '1' }, { prim: 'None' }] }],
            },
          ],
        },
      ],
    });
  });
});

describe('buildCallEvmParameter', () => {
  it('builds a call_evm parameter', () => {
    const callback = { prim: 'Some', args: [{ string: 'KT1…' }] };
    expect(buildCallEvmParameter('0xabc', 'transfer(address,uint256)', '0011', callback)).toEqual({
      prim: 'Pair',
      args: [
        { string: '0xabc' },
        {
          prim: 'Pair',
          args: [
            { string: 'transfer(address,uint256)' },
            { prim: 'Pair', args: [{ bytes: '0011' }, callback] },
          ],
        },
      ],
    });
  });
});
