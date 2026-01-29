import { PackDataParams, PackDataResponse } from '@tezos-x/octez.js-rpc';

export interface Packer {
    packData(data: PackDataParams): Promise<PackDataResponse>
}