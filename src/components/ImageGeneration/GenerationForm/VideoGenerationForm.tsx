import { Button, Input, Text, Select } from '@mantine/core';
import React, { createContext, useEffect, useState, useContext } from 'react';
import { UseFormReturn, useFormContext } from 'react-hook-form';
import { z } from 'zod';
import { DailyBoostRewardClaim } from '~/components/Buzz/Rewards/DailyBoostRewardClaim';
import { HaiperAspectRatio } from '~/components/ImageGeneration/GenerationForm/HaiperAspectRatio';
import InputSeed from '~/components/ImageGeneration/GenerationForm/InputSeed';
import { Form, InputSegmentedControl, InputText, InputTextArea } from '~/libs/form';
import { usePersistForm } from '~/libs/form/hooks/usePersistForm';
import {
  VideoGenerationInput,
  VideoGenerationSchema,
  videoGenerationSchema,
} from '~/server/schema/orchestrator/orchestrator.schema';
import { trpc } from '~/utils/trpc';
import { GenerateButton } from '~/components/Orchestrator/components/GenerateButton';
import { useGenerate } from '~/components/ImageGeneration/utils/generationRequestHooks';
import { useBuzzTransaction } from '~/components/Buzz/buzz.utils';
import { numberWithCommas } from '~/utils/number-helpers';
import { create } from 'zustand';
import {
  generationStore,
  useGenerationFormStore,
  generationFormStore,
  useGenerationFormWorkflowConfig,
  useGenerationStore,
} from '~/store/generation.store';
import { QueueSnackbar } from '~/components/ImageGeneration/QueueSnackbar';
import { WORKFLOW_TAGS } from '~/shared/constants/generation.constants';
import { showErrorNotification } from '~/utils/notifications';
import { InputImageUrl } from '~/components/Generate/Input/InputImageUrl';
import { useLocalStorage } from '@mantine/hooks';
import { GenerationWorkflowConfig } from '~/shared/types/generation.types';
import { TwCard } from '~/components/TwCard/TwCard';

const schema = videoGenerationSchema;

const WorkflowContext = createContext<{ workflow: GenerationWorkflowConfig } | null>(null);
function useWorkflowContext() {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error('missing video gen ctx');
  return ctx;
}

export function VideoGenerationForm() {
  const engine = useGenerationFormStore((state) => state.engine ?? 'haiper');

  const { workflow, availableWorkflows } = useGenerationFormWorkflowConfig({
    type: 'video',
    category: 'service',
    engine,
  });

  return (
    <div className="flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-2 px-3">
        <Select
          label="Tool"
          value={engine}
          onChange={(value) => generationFormStore.setEngine(value!)}
          data={[
            { label: 'Haiper', value: 'haiper' },
            { label: 'Mochi', value: 'mochi' },
          ]}
        />
        {availableWorkflows.length > 1 ? (
          <Select
            label="Workflow"
            data={availableWorkflows.map((x) => ({ label: x.name, value: x.key }))}
            value={workflow.key ?? availableWorkflows[0].key}
            onChange={(workflow) => generationFormStore.setWorkflow(workflow!)}
          />
        ) : (
          <div>
            <Input.Label>Workflow</Input.Label>
            <TwCard className="border px-3 py-2">
              <Text size="sm" className="leading-5">
                {workflow.name}
              </Text>
            </TwCard>
          </div>
        )}
      </div>
      <WorkflowContext.Provider value={{ workflow }}>
        <EngineForm />
      </WorkflowContext.Provider>
    </div>
  );
}

function EngineForm() {
  const { workflow } = useWorkflowContext();
  switch (workflow.key) {
    case 'haiper-txt2vid':
      return <HaiperTxt2VidGenerationForm />;
    case 'haiper-img2vid':
      return <HaiperImg2VidGenerationForm />;
    case 'mochi-txt2vid':
      return <MochiGenerationForm />;
    default:
      return null;
  }
}

function HaiperTxt2VidGenerationForm() {
  return (
    <FormWrapper engine="haiper">
      <InputTextArea name="prompt" label="Prompt" placeholder="Your prompt goes here..." autosize />
      <InputTextArea name="negativePrompt" label="Negative Prompt" autosize />
      <HaiperAspectRatio name="aspectRatio" label="Aspect Ratio" />
      <div className="flex flex-col gap-0.5">
        <Input.Label>Duration</Input.Label>
        <InputSegmentedControl
          name="duration"
          data={[2, 4, 8].map((value) => ({ label: `${value}s`, value }))}
        />
      </div>
      {/* <InputSeed name="seed" label="Seed" /> */}
    </FormWrapper>
  );
}

function HaiperImg2VidGenerationForm() {
  return (
    <FormWrapper engine="haiper">
      <InputImageUrl name="sourceImageUrl" label="Image" />
      <div className="flex flex-col gap-0.5">
        <Input.Label>Duration</Input.Label>
        <InputSegmentedControl
          name="duration"
          data={[2, 4, 8].map((value) => ({ label: `${value}s`, value }))}
        />
      </div>
      {/* <InputSeed name="seed" label="Seed" /> */}
    </FormWrapper>
  );
}

function MochiGenerationForm() {
  return (
    <FormWrapper engine="mochi">
      <InputTextArea name="prompt" label="Prompt" placeholder="Your prompt goes here..." autosize />
      {/* <InputSeed name="seed" label="Seed" /> */}
    </FormWrapper>
  );
}

type Engine = VideoGenerationInput['engine'];
function FormWrapper({
  engine,
  children,
}: {
  engine: Engine;
  children: React.ReactNode | ((form: UseFormReturn) => React.ReactNode);
}) {
  const storeData = useGenerationStore((state) => state.data);
  const { workflow } = useWorkflowContext();
  const { defaultValues } = workflow ?? {};

  const form = usePersistForm(workflow.key, {
    schema: schema as any,
    version: 1,
    reValidateMode: 'onSubmit',
    mode: 'onSubmit',
    defaultValues: { ...defaultValues, engine, workflow: workflow.key },
    storage: localStorage,
  });

  console.log(form.getValues());

  const { mutate, isLoading, error } = useGenerate();
  const { conditionalPerformTransaction } = useBuzzTransaction({
    type: 'Generation',
    message: (requiredBalance) =>
      `You don't have enough funds to perform this action. Required Buzz: ${numberWithCommas(
        requiredBalance
      )}. Buy or earn more buzz to perform this action.`,
    performTransactionOnPurchase: true,
  });

  function handleReset() {
    form.reset(defaultValues);
  }

  function handleSubmit(data: z.infer<typeof schema>) {
    if (isLoading) return;

    const { cost } = useCostStore.getState();
    const totalCost = cost;
    // TODO - tips?
    conditionalPerformTransaction(totalCost, () => {
      mutate({
        type: 'video',
        data: { ...data, engine, workflow: workflow.key },
        tags: [WORKFLOW_TAGS.IMAGE, WORKFLOW_TAGS.VIDEO, workflow.subType, workflow.key],
      });
    });
  }

  useEffect(() => {
    if (storeData) {
      const registered = Object.keys(form.getValues());
      const { params } = storeData;
      for (const [key, value] of Object.entries(params)) {
        if (registered.includes(key) && key !== 'engine') form.setValue(key as any, value);
      }
      generationStore.clearData();
    }
  }, [storeData]);

  useEffect(() => {
    if (!error) return;
    if (error.message.startsWith('Your prompt was flagged')) {
      form.setError('prompt', { type: 'custom', message: error.message }, { shouldFocus: true });
      const elem = document.getElementById(`input_prompt`);
      if (elem) elem.scrollIntoView();
    } else
      showErrorNotification({
        title: 'Failed to generate',
        error: new Error(error.message),
        reason: error.message ?? 'An unexpected error occurred. Please try again later.',
      });
  }, [error]);

  return (
    <Form
      form={form as any}
      onSubmit={handleSubmit}
      className="relative flex h-full flex-1 flex-col justify-between gap-2"
    >
      <div className="flex flex-col gap-2 px-3">
        <InputText type="hidden" name="engine" value={engine} />
        {typeof children === 'function' ? children(form) : children}
      </div>
      <div className="shadow-topper sticky bottom-0 z-10 flex flex-col gap-2 rounded-xl bg-gray-0 p-2 dark:bg-dark-7">
        <DailyBoostRewardClaim />
        <QueueSnackbar />
        <div className="flex gap-2">
          <SubmitButton2 loading={isLoading} engine={engine} />
          <Button onClick={handleReset} variant="default" className="h-auto px-3">
            Reset
          </Button>
        </div>
      </div>
    </Form>
  );
}

function SubmitButton2({ loading, engine }: { loading: boolean; engine: Engine }) {
  const [query, setQuery] = useState<VideoGenerationSchema | null>(null);
  const { getValues, watch } = useFormContext();
  const { data, isFetching } = trpc.orchestrator.whatIf.useQuery(
    { type: 'video', data: query as VideoGenerationSchema },
    { keepPreviousData: false, enabled: !!query }
  );
  const { workflow } = useWorkflowContext();
  console.log({ query, workflow, engine });

  const cost = data?.cost?.total ?? 0;
  const totalCost = cost; //variable placeholder to allow adding tips // TODO - include tips in whatif query

  useEffect(() => {
    const { whatIf = [] } = engines[engine] ?? {};
    const { defaultValues } = workflow;
    const subscription = watch(() => {
      const formData = getValues();
      const whatIfData = whatIf.reduce<Record<string, unknown>>(
        (acc, prop) => ({ ...acc, [prop]: formData[prop] }),
        {}
      );

      const result = schema.safeParse({
        engine,
        workflow: workflow.key,
        ...defaultValues,
        ...whatIfData,
      });
      if (!result.success) setQuery(null);
      else setQuery(result.data);
    });
    return subscription.unsubscribe;
  }, [workflow, engine]);

  useEffect(() => {
    if (data?.cost?.base) {
      useCostStore.setState({ cost: data.cost.base });
    }
  }, [data]);

  return (
    <GenerateButton
      type="submit"
      className="flex-1"
      disabled={!data || !query}
      loading={isFetching || loading}
      cost={totalCost}
    >
      Generate
    </GenerateButton>
  );
}

const useCostStore = create<{ cost: number }>(() => ({ cost: 0 }));

type EnginesDictionary = Record<
  string,
  {
    label: string;
    description: string | (() => React.ReactNode);
    whatIf?: string[];
  }
>;
const engines: EnginesDictionary = {
  haiper: {
    label: 'Haiper',
    description: `Generate hyper-realistic and stunning videos with Haiper's next-gen 2.0 model!`,
    whatIf: ['duration'],
  },
  mochi: {
    label: 'Mochi',
    description() {
      return (
        <>
          Mochi 1 preview, by creators{' '}
          <Text
            variant="link"
            component="a"
            rel="nofollow"
            href="https://www.genmo.ai/"
            target="_blank"
          >
            https://www.genmo.ai/
          </Text>
          , is an open state-of-the-art video generation model with high-fidelity motion and strong
          prompt adherence in preliminary evaluation.
        </>
      );
    },
  },
};