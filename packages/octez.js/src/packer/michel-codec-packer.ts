import { Packer } from './interface';
import { packDataBytes, MichelsonData, MichelsonType } from '@tezos-x/octez.js-michel-codec'
import { PackDataResponse, PackDataParams } from '@tezos-x/octez.js-rpc';

export class MichelCodecPacker implements Packer {

  async packData(data: PackDataParams): Promise<PackDataResponse> {
    const { bytes } = packDataBytes(data.data as MichelsonData, data.type as MichelsonType);
    return { packed: bytes }
  }
}
