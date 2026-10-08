import {
  categoryListResponseSchema,
  categorySchema,
  errorResponseSchema,
  skillListResponseSchema,
} from '@wervi/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { NotFoundError } from '../lib/errors.js';
import { DrizzleProfilesRepository } from '../repositories/index.js';

const categoryItemResponseSchema = z.object({ item: categorySchema }).strict();

/**
 * Read-only vocabulary endpoints: the categories and skills that freelancer
 * profiles (and later job postings) reference. No authentication because the
 * taxonomy is public reference data the sign-up form needs before a session
 * exists. Everything here is filtered to active rows only, so an admin-side
 * deactivation retires a term from the public vocabulary without breaking the
 * profiles that already reference it.
 */
export const taxonomyRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const repository = new DrizzleProfilesRepository(fastify.db);

  fastify.get(
    '/categories',
    {
      schema: {
        tags: ['taxonomy'],
        summary: 'List categories',
        description: 'Returns the active category tree, in display order.',
        response: { 200: categoryListResponseSchema },
      },
    },
    async () => {
      const items = await repository.listActiveCategories();
      return { items };
    },
  );

  fastify.get(
    '/categories/:id',
    {
      schema: {
        tags: ['taxonomy'],
        summary: 'Get a category',
        description:
          'Returns one active category. Unknown, deactivated or malformed ' +
          'ids are all a 404 so the public vocabulary does not answer ' +
          'existence questions.',
        params: z.object({ id: z.string().uuid() }),
        response: { 200: categoryItemResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => {
      const item = await repository.getActiveCategoryById(request.params.id);
      if (item === null) {
        throw new NotFoundError('Category');
      }
      return { item };
    },
  );

  fastify.get(
    '/skills',
    {
      schema: {
        tags: ['taxonomy'],
        summary: 'List skills',
        description:
          'Returns the active skills, in display order. Pass `categoryId` ' +
          'to restrict to one category.',
        querystring: z.object({
          categoryId: z.string().uuid().optional(),
        }),
        response: { 200: skillListResponseSchema },
      },
    },
    async (request) => {
      const items = await repository.listActiveSkills(request.query.categoryId);
      return { items };
    },
  );
};
