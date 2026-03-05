'use strict';

const config = require('./config');
const buildServer = require('./server');

const server = buildServer();

server.listen({ port: config.port, host: '0.0.0.0' }, (err) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
});
