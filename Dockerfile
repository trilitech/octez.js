# Docker to run octez.js integration tests
FROM node:20

COPY tsconfig.base.json /octez.js/
COPY ./integration-tests /octez.js/integration-tests/

WORKDIR /octez.js/integration-tests

RUN npm install

CMD ["npm", "run", "originate-known-contracts-and-run-test"]