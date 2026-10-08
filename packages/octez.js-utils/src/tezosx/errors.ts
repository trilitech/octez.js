import { ParameterValidationError } from '@tezos-x/octez.js-core';

/**
 *  @category Error
 *  Error that indicates a wei amount that cannot be converted to mutez without loss
 */
export class SubMutezPrecisionError extends ParameterValidationError {
  constructor(
    public readonly weiValue: bigint,
    public readonly remainderWei: bigint
  ) {
    super(
      `Amount ${weiValue} wei is not divisible by 10^12 (1 mutez); ` +
        `remainder ${remainderWei} wei would be lost on the Michelson runtime.`
    );
    this.name = 'SubMutezPrecisionError';
  }
}

/**
 *  @category Error
 *  Error that indicates a string that is not a valid ABI function signature
 */
export class InvalidMethodSignatureError extends ParameterValidationError {
  constructor(public readonly methodSignature: string) {
    super(`Invalid ABI function signature "${methodSignature}"`);
    this.name = 'InvalidMethodSignatureError';
  }
}
