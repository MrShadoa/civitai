import { Modal, SegmentedControl } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useBuzzTransaction } from '~/components/Buzz/buzz.utils';
import { useDialogContext } from '~/components/Dialog/DialogProvider';
import { useSubmitCreateImage } from '~/components/ImageGeneration/utils/generationRequestHooks';
import { GenerateButton } from '~/components/Orchestrator/components/GenerateButton';
import { generationConfig } from '~/server/common/constants';
import { TextToImageParams } from '~/server/schema/orchestrator/textToImage.schema';
import {
  GenerationResource,
  getBaseModelSetType,
  whatIfQueryOverrides,
} from '~/shared/constants/generation.constants';
import { createImageElement } from '~/utils/image-utils';
import { numberWithCommas } from '~/utils/number-helpers';
import { trpc } from '~/utils/trpc';

export function UpscaleImageModal({
  resources,
  params,
}: {
  resources: GenerationResource[];
  params: TextToImageParams;
}) {
  const dialog = useDialogContext();
  const [upscale, setUpscale] = useState(String(params.upscale ?? 2));
  const [size, setSize] = useState({ height: params.height, width: params.width });

  useEffect(() => {
    if (!params.image) return;
    createImageElement(params.image).then((elem) => {
      setSize({ height: elem.height, width: elem.width });
    });
  }, [params.image]);

  const defaultModel =
    generationConfig[getBaseModelSetType(params.baseModel) as keyof typeof generationConfig]
      ?.checkpoint ?? resources[0];

  const { data, isLoading, isInitialLoading, isError } = trpc.orchestrator.getImageWhatIf.useQuery({
    resources: [defaultModel.id],
    params: {
      ...params,
      ...whatIfQueryOverrides,
      upscale: Number(upscale),
      quantity: 1,
      ...size,
    },
  });

  const generateImage = useSubmitCreateImage();
  const { conditionalPerformTransaction } = useBuzzTransaction({
    message: (requiredBalance) =>
      `You don't have enough funds to perform this action. Required Buzz: ${numberWithCommas(
        requiredBalance
      )}. Buy or earn more buzz to perform this action.`,
    performTransactionOnPurchase: true,
  });

  function handleSubmit() {
    async function performTransaction() {
      await generateImage.mutateAsync({
        resources,
        params: {
          ...params,
          upscale: Number(upscale),
          quantity: 1,
          ...size,
        },
      });
      dialog.onClose();
    }
    conditionalPerformTransaction(data?.cost?.total ?? 0, performTransaction);
  }

  return (
    <Modal {...dialog}>
      <div className="flex flex-col gap-3">
        {params.image && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={params.image} alt="image to upscale" className="mx-auto max-w-full" />
          </>
        )}
        <SegmentedControl
          value={upscale}
          onChange={setUpscale}
          data={['1.5', '2', '2.5', '3']}
          className="flex-1"
        />
        <GenerateButton
          onClick={handleSubmit}
          loading={isLoading || generateImage.isLoading}
          cost={data?.cost?.total ?? 0}
          error={
            !isInitialLoading && isError
              ? 'Error calculating cost. Please try updating your values'
              : undefined
          }
        >
          Upscale
        </GenerateButton>
      </div>
    </Modal>
  );
}
