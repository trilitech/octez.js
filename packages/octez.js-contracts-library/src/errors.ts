import { ParameterValidationError } from '@tezos-x/octez.js-core';
import { ScriptedContracts } from '@tezos-x/octez.js-rpc';
/**
 *  @category Error
 *  @description Error that indicates invalid script format being useed or passed
 */
export class InvalidScriptFormatError extends ParameterValidationError {
  constructor(
    public readonly message: string,
    public readonly script: ScriptedContracts,
    public readonly address: string
  ) {
    super();
    this.name = 'InvalidScriptFormatError';
  }
}
