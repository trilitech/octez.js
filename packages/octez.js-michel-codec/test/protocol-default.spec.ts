import { DefaultProtocol, Protocol, ProtoInferiorTo } from '../src/michelson-types';

describe('Protocol defaults', () => {
  it('uses U025 as the default protocol', () => {
    expect(DefaultProtocol).toBe(Protocol.PsUshuai);
  });

  it('orders U025 after Tallinn and before ProtoALpha', () => {
    expect(ProtoInferiorTo(Protocol.PtTALLiNt, Protocol.PsUshuai)).toBe(true);
    expect(ProtoInferiorTo(Protocol.PsUshuai, Protocol.ProtoALpha)).toBe(true);
  });
});
