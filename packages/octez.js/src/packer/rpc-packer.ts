import { Packer } from './interface';
import { Context } from '../context';
import { PackDataParams, PackDataResponse } from '@tezos-x/octez.js-rpc';

export class RpcPacker implements Packer {
  constructor(private context: Context) {}
  
  async packData(data: PackDataParams): Promise<PackDataResponse> {
    return this.context.rpc.packData(data);
  }
}
