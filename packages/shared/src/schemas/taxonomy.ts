import { z } from 'zod';

/**
 * Read-only taxonomy contract: categories and skills are the shared vocabulary
 * for freelancer profiles and job listings. The API only ever serves active
 * rows here; administrative changes are a later phase.
 */

/** One option in the skills vocabulary, as served to profile and job UIs. */
export const skillSchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string().min(1),
    name: z.string().min(1),
    categoryId: z.string().uuid().nullable(),
    position: z.number().int(),
    isActive: z.boolean(),
  })
  .strict();

export type Skill = z.infer<typeof skillSchema>;

/** One node of the two-level category tree. `parentId` nests it. */
export const categorySchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string().min(1),
    name: z.string().min(1),
    description: z.string().nullable(),
    parentId: z.string().uuid().nullable(),
    position: z.number().int(),
    isActive: z.boolean(),
  })
  .strict();

export type Category = z.infer<typeof categorySchema>;

export const skillListResponseSchema = z
  .object({ items: z.array(skillSchema) })
  .strict();

export type SkillListResponse = z.infer<typeof skillListResponseSchema>;

export const categoryListResponseSchema = z
  .object({ items: z.array(categorySchema) })
  .strict();

export type CategoryListResponse = z.infer<typeof categoryListResponseSchema>;
