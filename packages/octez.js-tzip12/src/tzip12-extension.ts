import { Context, Extension } from "@tezos-x/octez.js";
import { DEFAULT_HANDLERS, MetadataProviderInterface, MetadataProvider } from '@tezos-x/octez.js-tzip16'

// The same default metadataProvider is used for tzip16 and tzip12
export class Tzip12Module implements Extension {
    private _metadataProvider: MetadataProviderInterface;

    constructor(metadataProvider?: MetadataProviderInterface) {
        this._metadataProvider = metadataProvider ? metadataProvider : new MetadataProvider(DEFAULT_HANDLERS);
    }

    configureContext(context: Context) {
        Object.assign(context, { metadataProvider: this._metadataProvider });
    }
}