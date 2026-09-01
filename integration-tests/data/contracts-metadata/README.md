Some octez.js integration tests depend on contracts metadata hosted externally in a GCP Cloud Storage bucket https://storage.googleapis.com/tezos-linux-repo/octez-js/tz16/{contract_metadata_name}.json

This folder contains the required metadata files in case access to the bucket is lost and these files need to be re-uploaded.
