import { z } from 'zod';
import { generation } from '~/server/common/constants';
import { getRandomInt } from '~/utils/number-helpers';

const baseVideoSchema = z.object({
  workflow: z.string(),
  engine: z.string(),
  prompt: z.string().max(1500, 'Prompt cannot be longer than 1500 characters').default(''),
  seed: z
    .number()
    .min(0)
    .max(generation.maxValues.seed)
    .default(getRandomInt(0, generation.maxValues.seed)),
});

export const haiperVideoGenerationSchema = baseVideoSchema.extend({
  engine: z.literal('haiper'),
  model: z.string().default('v2'),
  negativePrompt: z.string().max(1000, 'Prompt cannot be longer than 1000 characters').optional(),
  image: z.string().optional(),
  // cameraMovement: z.string().optional(),
  duration: z.number().optional(),
  aspectRatio: z.string().optional(),
  sourceImageUrl: z.string().optional(),
});

export const klingVideoGenerationSchema = baseVideoSchema.extend({
  engine: z.literal('kling'),
  // negativePrompt: z.string().max(1000, 'Prompt cannot be longer than 1000 characters').optional(),
  // image: z.string().optional(),
  // cameraMovement: z.string().optional(),
  // duration: z.number().optional(),
  // aspectRatio: z.string().optional(),
  // seed: z.number().optional(),
  // quantity: z.number(),
});

export const mochiVideoGenerationSchema = baseVideoSchema.extend({
  engine: z.literal('mochi'),
});

export type VideoGenerationInput = z.input<typeof videoGenerationSchema>;
export type VideoGenerationSchema = z.infer<typeof videoGenerationSchema>;
export const videoGenerationSchema = z.discriminatedUnion('engine', [
  haiperVideoGenerationSchema,
  klingVideoGenerationSchema,
  mochiVideoGenerationSchema,
]);

const baseGenerationSchema = z.object({
  civitaiTip: z.number().default(0),
  creatorTip: z.number().default(0),
  tags: z.string().array().optional(),
});

export type GenerationSchema = z.infer<typeof generationSchema>;
export const generationSchema = z.discriminatedUnion('type', [
  baseGenerationSchema.extend({ type: z.literal('video'), data: videoGenerationSchema }),
  baseGenerationSchema.extend({ type: z.literal('image'), data: z.object({}) }),
]);