import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const docs = defineCollection({
  // Entry ids are "<version>/<page>" (e.g. "25.0.0/quick_start"): the path relative to
  // `base` without the extension. Dots in version folders are preserved, and the
  // frontmatter `id` field (duplicated across versions) is deliberately not used.
  loader: glob({
    pattern: '**/*.{md,mdx}',
    base: './src/content/docs',
    generateId: ({ entry }) => entry.replace(/\.mdx?$/, ''),
  }),
  schema: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    author: z.union([z.string(), z.array(z.string())]).optional(),
    id: z.string().optional(),
  }).passthrough(),
});

export const collections = {
  docs,
};
