import { DeepPartial } from 'react-hook-form';
import { ModelType } from '@prisma/client';
import React, { createContext, useCallback, useContext, useEffect } from 'react';
import { TypeOf, z } from 'zod';
import { useGenerationStatus } from '~/components/ImageGeneration/GenerationForm/generation.utils';
import { useCurrentUser } from '~/hooks/useCurrentUser';
import { UsePersistFormReturn, usePersistForm } from '~/libs/form/hooks/usePersistForm';
import { BaseModel, constants, generation, getGenerationConfig } from '~/server/common/constants';
import { imageSchema } from '~/server/schema/image.schema';
import {
  textToImageParamsSchema,
  textToImageStepRemixMetadataSchema,
} from '~/server/schema/orchestrator/textToImage.schema';
import { userTierSchema } from '~/server/schema/user.schema';
import { GenerationData } from '~/server/services/generation/generation.service';
import {
  GenerationResource,
  getBaseModelFromResources,
  getBaseModelSetType,
  getBaseModelSetTypes,
  getResourcesBaseModelSetType,
  getSizeFromAspectRatio,
  sanitizeTextToImageParams,
} from '~/shared/constants/generation.constants';
import { removeEmpty } from '~/utils/object-helpers';
import { trpc } from '~/utils/trpc';
import { generationStore, useGenerationStore } from '~/store/generation.store';
import { auditPrompt } from '~/utils/metadata/audit';
import { defaultsByTier } from '~/server/schema/generation.schema';
import { workflowResourceSchema } from '~/server/schema/orchestrator/workflows.schema';
import { WorkflowDefinitionType } from '~/server/services/orchestrator/types';
import { uniqBy } from 'lodash-es';
import { isDefined } from '~/utils/type-guards';
import { showNotification } from '@mantine/notifications';

// #region [schemas]
const extendedTextToImageResourceSchema = workflowResourceSchema.extend({
  name: z.string(),
  trainedWords: z.string().array().default([]),
  modelId: z.number(),
  modelName: z.string(),
  modelType: z.nativeEnum(ModelType),
  minStrength: z.number().default(-1),
  maxStrength: z.number().default(2),
  covered: z.boolean().default(true),
  baseModel: z.string(),
  image: imageSchema.pick({ url: true }).optional(),
  minor: z.boolean().default(false),
  available: z.boolean().default(true),
});

type PartialFormData = Partial<TypeOf<typeof formSchema>>;
type DeepPartialFormData = DeepPartial<TypeOf<typeof formSchema>>;
export type GenerationFormOutput = TypeOf<typeof formSchema>;
const formSchema = textToImageParamsSchema
  .omit({ aspectRatio: true, width: true, height: true })
  .extend({
    tier: userTierSchema.optional().default('free'),
    model: extendedTextToImageResourceSchema,
    // .refine(
    //   (x) => x.available !== false,
    //   'This resource is unavailable for generation'
    // ),
    resources: extendedTextToImageResourceSchema.array().min(0).default([]),
    // .refine(
    //   (resources) => !resources.length || resources.some((x) => x.available !== false),
    //   'One or more resources are unavailable for generation'
    // ),
    vae: extendedTextToImageResourceSchema.optional(),
    // .refine((x) => x?.available !== false, 'This resource is unavailable for generation'),
    prompt: z
      .string()
      .nonempty('Prompt cannot be empty')
      .max(1500, 'Prompt cannot be longer than 1500 characters')
      .superRefine((val, ctx) => {
        const { blockedFor, success } = auditPrompt(val);
        if (!success) {
          let message = `Blocked for: ${blockedFor.join(', ')}`;
          const count = blockedRequest.increment();
          const status = blockedRequest.status();
          if (status === 'warned') {
            message += `. If you continue to attempt blocked prompts, your account will be sent for review.`;
          } else if (status === 'notified') {
            message += `. Your account has been sent for review. If you continue to attempt blocked prompts, your generation permissions will be revoked.`;
          }

          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message,
            params: { count },
          });
        }
      }),
    remix: textToImageStepRemixMetadataSchema.optional(),
    aspectRatio: z.string(),
    creatorTip: z.number().min(0).max(1).default(0.25).optional(),
    civitaiTip: z.number().min(0).max(1).optional(),
  })
  .transform((data) => {
    const { height, width } = getSizeFromAspectRatio(data.aspectRatio, data.baseModel);
    return {
      ...data,
      height,
      width,
    };
  })
  .refine(
    (data) => {
      // Check if resources are at limit based on tier
      const { resources, tier } = data;
      const limit = defaultsByTier[tier].resources;

      return resources.length <= limit;
    },
    { message: `You have exceed the number of allowed resources`, path: ['resources'] }
  );
export const blockedRequest = (() => {
  let instances: number[] = [];
  const updateStorage = () => {
    localStorage.setItem('brc', JSON.stringify(instances));
  };
  const increment = () => {
    instances.push(Date.now());
    updateStorage();
    return instances.length;
  };
  const status = () => {
    const count = instances.length;
    if (count > constants.imageGeneration.requestBlocking.muted) return 'muted';
    if (count > constants.imageGeneration.requestBlocking.notified) return 'notified';
    if (count > constants.imageGeneration.requestBlocking.warned) return 'warned';
    return 'ok';
  };
  if (typeof window !== 'undefined') {
    const storedInstances = JSON.parse(localStorage.getItem('brc') ?? '[]');
    const cutOff = Date.now() - 1000 * 60 * 60 * 24;
    instances = storedInstances.filter((x: number) => x > cutOff);
    updateStorage();
  }

  return {
    status,
    increment,
  };
})();

// #endregion

// #region [data formatter]
const defaultValues = generation.defaultValues;
function formatGenerationData(
  data: GenerationData,
  baseResource?: GenerationResource
): PartialFormData {
  const { quantity, ...params } = data.params;
  // check for new model in resources, otherwise use stored model
  let checkpoint = data.resources.find((x) => x.modelType === 'Checkpoint');
  let vae = data.resources.find((x) => x.modelType === 'VAE');
  const baseModel = getBaseModelFromResources(data.resources);

  // if (baseResource && checkpoint) {
  //   if (checkpoint.id === baseResource.id) baseModel = getBaseModelSetType(baseResource.baseModel);
  //   else {
  //     const possibleBaseModelSetTypes = getBaseModelSetTypes({
  //       modelType: baseResource.modelType,
  //       baseModel: baseResource.baseModel,
  //     });
  //     if (!(possibleBaseModelSetTypes as string[]).includes(baseModel)) {
  //       baseModel = possibleBaseModelSetTypes[0];
  //     }
  //   }
  // }

  const config = getGenerationConfig(baseModel);

  // if current checkpoint doesn't match baseModel, set checkpoint based on baseModel config
  if (
    !checkpoint ||
    getBaseModelSetType(checkpoint.baseModel) !== baseModel ||
    !checkpoint.available
  ) {
    checkpoint = config.checkpoint;
  }
  // if current vae doesn't match baseModel, set vae to undefined
  if (!vae || getBaseModelSetType(vae.modelType) !== baseModel || !vae.available) vae = undefined;
  // filter out any additional resources that don't belong
  // TODO - update filter to use `baseModelResourceTypes` from `generation.constants.ts`
  const resources = data.resources
    .filter((resource) => {
      if (
        resource.modelType === 'Checkpoint' ||
        resource.modelType === 'VAE' ||
        !resource.available
      )
        return false;
      const baseModelSetKey = getBaseModelSetType(resource.baseModel);
      return config.additionalResourceTypes.some((x) => {
        const modelTypeMatches = x.type === resource.modelType;
        const baseModelSetMatches = x.baseModelSet === baseModelSetKey;
        const baseModelIncluded = x.baseModels?.includes(resource.baseModel as BaseModel);
        return modelTypeMatches && (baseModelSetMatches || baseModelIncluded);
      });
    })
    .slice(0, 9);

  return {
    ...params,
    baseModel,
    model: checkpoint,
    resources,
    vae,
  };
}

// #endregion

// #region [Provider]
type GenerationFormProps = Omit<UsePersistFormReturn<TypeOf<typeof formSchema>>, 'reset'> & {
  setValues: (data: PartialFormData) => void;
  reset: () => void;
};

const GenerationFormContext = createContext<GenerationFormProps | null>(null);
export function useGenerationForm() {
  const context = useContext(GenerationFormContext);
  if (!context) throw new Error('missing GenerationFormProvider in tree');
  return context;
}

export function GenerationFormProvider({ children }: { children: React.ReactNode }) {
  const input = useGenerationStore((state) => state.input);
  const storeData = useGenerationStore((state) => state.data);

  const currentUser = useCurrentUser();
  const status = useGenerationStatus();
  const { data: responseData, isFetching } = trpc.generation.getGenerationData.useQuery(input!, {
    enabled: input !== undefined,
    keepPreviousData: true,
  });

  const getValues = useCallback(
    (storageValues: DeepPartialFormData) => getDefaultValues(storageValues),
    [currentUser, status] // eslint-disable-line
  );

  const form = usePersistForm('generation-form-2', {
    schema: formSchema,
    version: 1,
    reValidateMode: 'onSubmit',
    mode: 'onSubmit',
    values: getValues,
    exclude: ['tier'],
    storage: localStorage,
  });

  // TODO.Briant - determine a better way to pipe the data into the form
  // #region [effects]
  useEffect(() => {
    if (storeData) {
      const data = formatGenerationData(storeData);
      setValues(data);
    } else if (responseData && !isFetching) {
      if (!input) return;
      const runType = input.type === 'modelVersion' ? 'run' : 'remix';
      const formData = form.getValues();

      const workflowType = formData.workflow?.split('-')?.[0] as WorkflowDefinitionType;
      const workflow = workflowType !== 'txt2img' ? 'txt2img' : formData.workflow;

      let resources: GenerationResource[];
      let baseResource: GenerationResource | undefined;
      if (runType === 'remix') {
        resources = responseData.resources;
      } else {
        baseResource = responseData.resources[0];
        resources = uniqBy(
          [
            ...responseData.resources,
            formData.model,
            ...(formData.resources ?? []),
            formData.vae,
          ].filter(isDefined),
          'id'
        );
      }

      const formatted = formatGenerationData({ ...responseData, resources }, baseResource);

      const data = { ...formatted, workflow };
      if (resources.length && resources.some((x) => !x.available)) {
        showNotification({
          color: 'yellow',
          title: 'Remix',
          message: 'Some resources used to generate this image are unavailable',
        });
      }

      setValues(runType === 'run' ? removeEmpty(data) : data);
    }

    return () => {
      generationStore.clearData();
    };
  }, [responseData, status, currentUser, storeData, isFetching, input]); // eslint-disable-line

  useEffect(() => {
    const subscription = form.watch((watchedValues, { name }) => {
      // handle model change to update baseModel value
      if (
        name !== 'baseModel' &&
        watchedValues.model &&
        getBaseModelSetType(watchedValues.model.baseModel) !== watchedValues.baseModel
      ) {
        form.setValue('baseModel', getBaseModelSetType(watchedValues.model.baseModel));
      }

      // handle selected `workflow` based on presence of `image` value
      if (
        name === 'image' &&
        !watchedValues.image &&
        watchedValues.workflow?.startsWith('img2img')
      ) {
        form.setValue('workflow', 'txt2img');
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);
  // #endregion

  // #region [handlers]
  function setValues(data: PartialFormData) {
    // don't overwrite quantity
    const { quantity, ...params } = data;
    const limited = sanitizeTextToImageParams(params, status.limits);
    for (const [key, value] of Object.entries(limited)) {
      form.setValue(key as keyof PartialFormData, value);
    }
  }

  function getDefaultValues(overrides: DeepPartialFormData): PartialFormData {
    // TODO.briant this is reseting things when people navigate back to the generation form after remix
    return sanitizeTextToImageParams(
      {
        ...defaultValues,
        nsfw: overrides.nsfw ?? false,
        quantity: overrides.quantity ?? defaultValues.quantity,
        tier: currentUser?.tier ?? 'free',
        creatorTip: overrides.creatorTip ?? 0.25,
      },
      status.limits
    );
  }

  function reset() {
    form.reset(getDefaultValues(form.getValues()));
  }
  // #endregion

  return (
    <GenerationFormContext.Provider value={{ ...form, setValues, reset }}>
      {children}
    </GenerationFormContext.Provider>
  );
}
// #endregion
