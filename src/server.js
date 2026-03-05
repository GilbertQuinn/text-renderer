'use strict';

const fastify = require('fastify');
const renderRoute = require('./routes/render');

/**
 * Creates and configures the Fastify instance.
 * Does NOT call server.listen() — that is done in index.js so that
 * integration tests can import this module without binding to a port.
 *
 * @returns {import('fastify').FastifyInstance}
 */
function buildServer() {
  const server = fastify({
    logger: true,
    ajv: {
      customOptions: {
        // Enable "format" keyword validation (required for "uri" format check).
        formats: { uri: true },
      },
    },
  });

  // Override the default validation error handler to return the expected
  // { error: "<message>" } shape with HTTP 400.
  server.setErrorHandler((err, request, reply) => {
    if (err.validation) {
      return reply.status(400).send({ error: err.message });
    }
    // Pass through other errors; the route handler owns 422 and 500.
    reply.send(err);
  });

  server.register(renderRoute);

  return server;
}

module.exports = buildServer;
