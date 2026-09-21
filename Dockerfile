# This file has been modified from its original Taquito source
# (https://github.com/ecadlabs/taquito) as part of the octez.js fork.
# See NOTICE for details.

# Docker to run octez.js integration tests
FROM node:20

COPY tsconfig.base.json /octez.js/
COPY ./integration-tests /octez.js/integration-tests/

WORKDIR /octez.js/integration-tests

RUN npm install

CMD ["npm", "run", "originate-known-contracts-and-run-test"]