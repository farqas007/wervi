import { z } from 'zod';

/** Upper bound hard-coded so a client cannot request an unbounded page. */
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginationMetaSchema = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(0),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  })
  .strict();

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export const paginatedSchema = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), meta: paginationMetaSchema }).strict();

export type Paginated<T> = {
  items: z.infer<T>[];
  meta: PaginationMeta;
};

export function toOffset(query: PaginationQuery): number {
  return (query.page - 1) * query.pageSize;
}

export function buildMeta(
  query: PaginationQuery,
  total: number,
): PaginationMeta {
  const totalPages =
    query.pageSize === 0 ? 0 : Math.ceil(total / query.pageSize);
  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages,
    hasNextPage: query.page < totalPages,
    hasPreviousPage: query.page > 1,
  };
}
