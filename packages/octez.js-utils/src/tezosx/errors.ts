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

/**
 *  @category Error
 *  Error that indicates a function selector with no known ABI signature
 */
export class UnknownSelectorError extends ParameterValidationError {
  constructor(public readonly selector: string) {
    super(
      `Unknown function selector 0x${selector}. Pass its ABI signature as ` +
        '`methodSignature` or in `knownSignatures`.'
    );
    this.name = 'UnknownSelectorError';
  }
}

/**
 *  @category Error
 *  Error that indicates an ABI signature that does not match the calldata selector
 */
export class SelectorMismatchError extends ParameterValidationError {
  constructor(
    public readonly methodSignature: string,
    public readonly selector: string
  ) {
    super(`ABI signature "${methodSignature}" does not match the calldata selector 0x${selector}.`);
    this.name = 'SelectorMismatchError';
  }
}

/**
 *  @category Error
 *  Error that indicates an invalid EVM address
 */
export class InvalidEvmAddressError extends ParameterValidationError {
  constructor(public readonly address: string) {
    super(`Invalid EVM address "${address}"`);
    this.name = 'InvalidEvmAddressError';
  }
}
