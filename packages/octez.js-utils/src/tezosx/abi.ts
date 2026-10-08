import { encodeFunctionData, type Hex } from 'viem';

/**
 * ABI of the NAC precompile entrypoints used for EVM → Michelson calls.
 */
export const NAC_PRECOMPILE_ABI = [
  {
    type: 'function',
    name: 'call',
    inputs: [
      { name: 'url', type: 'string' },
      {
        name: 'headers',
        type: 'tuple[]',
        components: [
          { name: 'key', type: 'string' },
          { name: 'value', type: 'string' },
        ],
      },
      { name: 'body', type: 'bytes' },
      { name: 'method', type: 'uint8' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'callMichelson',
    inputs: [
      { name: 'destination', type: 'string' },
      { name: 'entrypoint', type: 'string' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
] as const;

export interface NacHttpHeader {
  key: string;
  value: string;
}

function toHex(bytes: string): Hex {
  return (bytes.startsWith('0x') ? bytes : `0x${bytes}`) as Hex;
}

/**
 * Encode a call to the generic NAC `call` entrypoint: an HTTP-style request forwarded
 * to the Michelson runtime. A bare native transfer is a POST to `http://tezos/<address>`
 * with no headers and an empty body.
 */
export function encodeNacCall(
  url: string,
  headers: NacHttpHeader[],
  body: string,
  method: number
): Hex {
  return encodeFunctionData({
    abi: NAC_PRECOMPILE_ABI,
    functionName: 'call',
    args: [url, headers, toHex(body), method],
  });
}

/**
 * Encode a call to the NAC `callMichelson` entrypoint.
 *
 * @param binaryMicheline entrypoint parameter as binary Micheline (hex, without the
 * `05` pack prefix)
 */
export function encodeNacCallMichelson(
  destination: string,
  entrypoint: string,
  binaryMicheline: string
): Hex {
  return encodeFunctionData({
    abi: NAC_PRECOMPILE_ABI,
    functionName: 'callMichelson',
    args: [destination, entrypoint, toHex(binaryMicheline)],
  });
}
