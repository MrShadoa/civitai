import { z } from 'zod';
import { imageSchema } from '~/server/schema/image.schema';
import { modelFileSchema } from '~/server/schema/model-file.schema';
import { sanitizedStringSchema } from '~/server/schema/utils.schema';

export const modelVersionUpsertSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, 'Name cannot be empty.'),
  description: sanitizedStringSchema,
  steps: z.number().nullish(),
  epochs: z.number().nullish(),
  modelFile: modelFileSchema,
  trainingDataFile: modelFileSchema.nullish(),
  images: z
    .array(imageSchema)
    .min(1, 'At least one example image must be uploaded')
    .max(20, 'You can only upload up to 20 images'),
  trainedWords: z.array(z.string()),
  files: z.array(modelFileSchema).nullish(),
});
