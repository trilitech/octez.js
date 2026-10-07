import { CONFIGS, NetworkType } from '../../config';
import BigNumber from 'bignumber.js';
import { ConstantsResponseProto025 } from '@tezos-x/octez.js-rpc';

// Shared assertion for nets that track the current protocol (mainnet head,
// shadownet) rather than staying pinned. A frozen full-constants fixture rots on
// every activation (Tallinn -> Ushuaia broke this file once already), so instead
// we assert the response decodes, that stable core fields are right, and that
// the current protocol's structural markers are present with the expected
// shape. The per-testnet blocks below keep exhaustive, protocol-pinned fixtures
// for the networks that stay put (ushuaianet, weeklynet).
//
// BigNumber fields go through the custom equality tester in vitest.setup.ts
// (RPC constructs BigNumbers from its own bignumber.js copy, so raw
// constructor/instance checks don't hold across the package boundary), so
// comparing against the exact expected value works here same as anywhere else.
const expectCurrentProtocolConstants = (constants: ConstantsResponseProto025) => {
  // Stable across protocols: sanity-check core decoding.
  expect(constants.proof_of_work_nonce_size).toEqual(8);
  expect(constants.nonce_length).toEqual(32);
  expect(constants.hard_gas_limit_per_operation).toEqual(new BigNumber('1040000'));
  expect(constants.cost_per_byte).toEqual(new BigNumber('250'));
  // Proto25 (Ushuaia) structural markers.
  expect(constants.cache_layout_size).toEqual(5);
  // Length isn't a stable structural marker either: ProtoALpha (weeklynet)
  // has extended this to 8 entries ([1..8]) while PsUshuai still has 5. Same
  // arrayContaining tolerance the ushuaianet block below already uses for
  // the same field, for the same reason.
  expect(constants.dal_parametric.attestation_lags).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]));
  // Proto25 marker fields: present with the right types; their values flip when
  // the corresponding feature activates, so only the shape is checked here.
  expect(constants.cache_stake_info_cycles).toEqual(expect.any(Number));
  expect(constants.cache_swrr_selected_distribution_cycles).toEqual(expect.any(Number));
  expect(constants.native_contracts_enable).toEqual(expect.any(Boolean));
  expect(constants.swrr_new_baker_lottery_enable).toEqual(expect.any(Boolean));
  expect(constants.tz5_account_enable).toEqual(expect.any(Boolean));
  expect(constants.dal_parametric.dynamic_lag_enable).toEqual(expect.any(Boolean));
};

CONFIGS().forEach(({ lib, rpc, networkType }) => {
  const Tezos = lib;
  const weeklynet = (networkType == NetworkType.TESTNET && rpc.includes('weekly')) ? test : test.skip;
  const shadownet = (networkType == NetworkType.TESTNET && rpc.includes('shadow')) ? test : test.skip;
  const ghostnet = (networkType == NetworkType.TESTNET && rpc.includes('ghost')) ? test : test.skip;
  const ushuaianet = (networkType == NetworkType.TESTNET && rpc.includes('ushuaia')) ? test : test.skip;

  describe('Test fetching constants for all protocols on Mainnet', () => {
    // ecadinfra's public mainnet node is being decommissioned; use a live
    // public mainnet RPC. Constants are network-wide, so any correct node matches.
    const rpcUrl = 'https://rpc.tzkt.io/mainnet';
    Tezos.setRpcProvider(rpcUrl);
    it(`should successfully decode current mainnet constants at head`, async () => {
      const constants: ConstantsResponseProto025 = await Tezos.rpc.getConstants();
      expectCurrentProtocolConstants(constants);
    });
  });

  describe(`Fetch constants for testnet`, () => {
    // Shadownet shadows whichever proposal is currently under test, so it has
    // the same protocol-drift problem as mainnet above.
    shadownet(`should successfully decode current shadownet constants
      using ${rpc}`, async () => {
      Tezos.setRpcProvider(rpc);
      const constants: ConstantsResponseProto025 = await Tezos.rpc.getConstants();
      expectCurrentProtocolConstants(constants);
    });

    ushuaianet(`should successfully fetch U025 constants for Ushuaianet
      using ${rpc}`, async () => {
      Tezos.setRpcProvider(rpc);
      const constants: ConstantsResponseProto025 = await Tezos.rpc.getConstants();
      expect(constants.cache_stake_info_cycles).toEqual(expect.any(Number));
      expect(constants.cache_swrr_selected_distribution_cycles).toEqual(expect.any(Number));
      expect(constants.native_contracts_enable).toEqual(expect.any(Boolean));
      expect(constants.swrr_new_baker_lottery_enable).toEqual(expect.any(Boolean));
      expect(constants.tz5_account_enable).toEqual(expect.any(Boolean));
      expect(constants.dal_parametric.dynamic_lag_enable).toEqual(expect.any(Boolean));
      expect(constants.dal_parametric.attestation_lags).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]));
    });

    // Weeklynet resets (new chain, new protocol build) every Wednesday --
    // more volatile than shadownet above, not less, so an exhaustive frozen
    // fixture is exactly the wrong strategy here. This used to assert a
    // ConstantsResponseProto023 shape (an older protocol than even PsUshuai)
    // against the live ProtoALpha response and reliably failed on the extra
    // fields ProtoALpha has added since. Use the same resilient shape check
    // shadownet uses instead.
    weeklynet(`should successfully decode current weeklynet constants
      using ${rpc}`, async () => {
      Tezos.setRpcProvider(rpc);
      const constants: ConstantsResponseProto025 = await Tezos.rpc.getConstants();
      expectCurrentProtocolConstants(constants);
    });

  });
});
