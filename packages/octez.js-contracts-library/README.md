# octez.js Contracts Library package

**Maintained by [Nomadic Labs](https://www.nomadic-labs.com/).**

`@tezos-x/octez.js-contracts-library` allows developers to specify static data related to contracts (i.e., script and entrypoints) avoiding octez.js from fetching them from the network. The `contracts-library` module provides a `ContractsLibrary` class that can be injected as an extension to a TezosToolkit instance in order to increase dApps performance.

```ts
import { ContractsLibrary } from '@tezos-x/octez.js-contracts-library';

const contractsLibrary = new ContractsLibrary();
contractsLibrary.addContract({
    'contractAddress1': {
        script: script1, // obtained from Tezos.rpc.getNormalizedScript('contractAddress1')
        entrypoints: entrypoints1 // obtained from Tezos.rpc.getEntrypoints('contractAddress1')
    },
    'contractAddress2': {
        script: script2,
        entrypoints: entrypoints2
    }
})
Tezos.addExtension(contractsLibrary);
```

See the top-level [https://github.com/trilitech/octez.js](https://github.com/trilitech/octez.js) file for details on reporting issues, contributing and versioning.

## API Documentation

TypeDoc style documentation is available on-line [here](https://octez.js.io/typedoc/modules/_octez.js_contracts_library.html)

## Disclaimer

THIS SOFTWARE IS PROVIDED "AS IS" AND ANY EXPRESSED OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE REGENTS OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
