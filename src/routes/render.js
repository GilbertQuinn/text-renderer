'use strict';

const { renderText } = require('../core/renderText');
const { FontResolutionError } = require('../fonts/fontCache');

const bodySchema = {
  type: 'object',
  required: ['text', 'fontUrl', 'color', 'fontSize', 'dimensions', 'format'],
  properties: {
    text: { type: 'string', minLength: 1 },
    fontUrl: { type: 'string', format: 'uri' },
    color: { type: 'string', minLength: 1 },
    fontSize: { type: 'number', exclusiveMinimum: 0 },
    dimensions: {
      type: 'object',
      required: ['width', 'height'],
      properties: {
        width: { type: 'number', exclusiveMinimum: 0 },
        height: { type: 'number', exclusiveMinimum: 0 },
      },
    },
    format: { type: 'string', enum: ['png', 'jpeg'] },
  },
};

/**
 * Registers the POST /render route on a Fastify instance.
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
async function renderRoute(fastify) {
  fastify.post(
    '/render',
    {
      schema: {
        body: bodySchema,
        response: {
          200: {
            type: 'object',
            properties: {
              filePath: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { filePath } = await renderText(request.body);
        return { filePath };
      } catch (err) {
        if (err instanceof FontResolutionError) {
          return reply.status(422).send({ error: err.message });
        }
        return reply.status(500).send({ error: err.message });
      }
    }
  );
}

module.exports = renderRoute;
