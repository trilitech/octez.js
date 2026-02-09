import { OctezJsLocalForger } from '../../src/forger/octez.js-local-forger';
import { Context, Protocols } from '../../src/octez';

describe('octez.js local forger', () => {
  const mockRpcClient = {
    getProtocols: vi.fn(),
  };

  beforeEach(() => {
    mockRpcClient.getProtocols.mockResolvedValue({
      next_protocol: 'PtJakart2xVj7pYXJBXrqHgd82rdkLey5ZeeGwDgPp9rhQUbSqY',
    });
  });

  it('is instantiable', () => {
    expect(new OctezJsLocalForger(new Context('url'))).toBeInstanceOf(OctezJsLocalForger);
  });

  it('should take the protocol hash from context.proto if it is defined', async () => {
    const context = new Context(mockRpcClient as any);
    context.proto = Protocols.PtHangz2;
    const forger = new OctezJsLocalForger(context);

    // When calling the forge method, an instance of LocalForger is created
    // which required the protocol hash in its constructor
    await forger.forge({
      branch: 'BMbqNeX9fZKsuKmu5B2gX7ayA9ZUNjbHEeHCgYd7VdTMsTCALFF',
      contents: [],
    });
    expect(mockRpcClient.getProtocols).toHaveBeenCalledTimes(0);
  });

  it('should fetch protocol hash from the Rpc', async () => {
    const forger = new OctezJsLocalForger(new Context(mockRpcClient as any));

    // When calling the forge method, an instance of LocalForger is created
    // which required the protocol hash in its constructor
    // fetch the protocol hash from the RPC if context.proto is undefined
    await forger.forge({
      branch: 'BMbqNeX9fZKsuKmu5B2gX7ayA9ZUNjbHEeHCgYd7VdTMsTCALFF',
      contents: [],
    });
    expect(mockRpcClient.getProtocols).toHaveBeenCalledTimes(1);
  });
});
