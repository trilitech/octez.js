import { HttpBackend, HttpResponseError } from '@tezos-x/octez.js-http-utils';

describe('HttpBackend request', () => {
  it('should fail with HttpResponseError when a 4xx gets returned', async () => {
    const http: HttpBackend = new HttpBackend();
    try {
      await http.createRequest<string>({
        method: 'GET',
        url: 'https://rpc.tzkt.io/mainnet/chains/main/blocks/head/helpers/baking_rights',
        query: {
          level: 0
        }
      });
      expect.fail('should have thrown');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(HttpResponseError);
      const httpErr = err as HttpResponseError;
      expect(httpErr.status).toBeGreaterThanOrEqual(400);
      expect(httpErr.url).toEqual('https://rpc.tzkt.io/mainnet/chains/main/blocks/head/helpers/baking_rights?level=0');
      expect(httpErr.message).toMatch(/^Http error response: \([0-9]+\)/);
    }
  });
});
