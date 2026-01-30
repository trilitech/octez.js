# octez.js dApp Wallet package

_Documentation can be found [here](https://octez.js.io/docs/wallet_API)_
_TypeDoc style documentation is available [here](https://octez.js.io/typedoc/modules/_octez.js_dapp_wallet.html)_

**Maintained by [Nomadic Labs](https://www.nomadic-labs.com/).**

## General Information

`@tezos-x/octez.js-dapp-wallet` is an npm package implementing the TZIP-10 standard that describes the communication between decentralized applications and wallets. Powered by [octez.connect](https://www.npmjs.com/package/@tezos-x/octez.connect), this package provides developers a way to connect a dapp built with octez.js to a wallet giving the freedom to the users of the dapp to choose the wallet they want.

## Install

Install the package as follows

```
npm install @tezos-x/octez.js-dapp-wallet
```

## Usage

Create a wallet instance with defined option parameters and set the wallet provider using `setWalletProvider` to the `TezosToolkit` instance

```ts
import { TezosToolkit } from '@tezos-x/octez.js';
import { BeaconWallet, BeaconEvent } from '@tezos-x/octez.js-dapp-wallet';

const options = {
  name: 'MyAwesomeDapp',
  iconUrl: 'https://octez.js.io/img/favicon.svg',
  network: { type: 'ghostnet' },
  enableMetrics: true,
};
const wallet = new BeaconWallet(options);

await wallet.client.subscribeToEvent(
  BeaconEvent.ACTIVE_ACCOUNT_SET,
  async (account) => {
    // An active account has been set, update the dApp UI
    console.log(`${BeaconEvent.ACTIVE_ACCOUNT_SET} triggered: `, account);
  },
);
await wallet.requestPermissions();

const Tezos = new TezosToolkit('https://YOUR_PREFERRED_RPC_URL');
Tezos.setWalletProvider(wallet);
```

## Additional Info

See the top-level [https://github.com/trilitech/octez.js](https://github.com/trilitech/octez.js) file for details on reporting issues, contributing and versioning.

## Disclaimer

THIS SOFTWARE IS PROVIDED "AS IS" AND ANY EXPRESSED OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE REGENTS OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
