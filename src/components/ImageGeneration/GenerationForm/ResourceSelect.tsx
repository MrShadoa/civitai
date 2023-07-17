import { Button, ButtonProps, Input, InputWrapperProps } from '@mantine/core';
import { ModelType } from '@prisma/client';
import { IconPlus } from '@tabler/icons-react';
import React, { useEffect } from 'react';
import { useBaseModelsContext } from '~/components/ImageGeneration/GenerationForm/BaseModelProvider';
import { ResourceSelectCard } from '~/components/ImageGeneration/GenerationForm/ResourceSelectCard';
import { openResourceSelectModal } from '~/components/ImageGeneration/GenerationForm/ResourceSelectModal';
import { withController } from '~/libs/form/hoc/withController';
import { Generation } from '~/server/services/generation/generation.types';

function ResourceSelect({
  value,
  onChange,
  type,
  buttonLabel,
  buttonProps,
  ...inputWrapperProps
}: {
  value?: Generation.Resource;
  onChange?: (value?: Generation.Resource) => void;
  type: ModelType;
  buttonLabel: React.ReactNode;
  buttonProps?: Omit<ButtonProps, 'onClick'>;
} & Omit<InputWrapperProps, 'children'>) {
  const canAdd = !value;

  const handleAdd = (resource: Generation.Resource) => {
    if (!canAdd) return;
    onChange?.(resource);
  };

  const handleRemove = () => {
    onChange?.(undefined);
  };

  const handleUpdate = (resource: Generation.Resource) => {
    onChange?.(resource);
  };

  const { baseModels } = useBaseModelsContext();

  return (
    <Input.Wrapper {...inputWrapperProps}>
      {!value ? (
        <div>
          <Button
            variant="default"
            leftIcon={<IconPlus size={18} />}
            fullWidth
            onClick={() =>
              openResourceSelectModal({
                title: buttonLabel,
                baseModel: baseModels?.[0],
                types: [type],
                onSelect: handleAdd,
              })
            }
            {...buttonProps}
          >
            {buttonLabel}
          </Button>
        </div>
      ) : (
        <ResourceSelectCard resource={value} onUpdate={handleUpdate} onRemove={handleRemove} />
      )}
    </Input.Wrapper>
  );
}

const InputResourceSelect = withController(ResourceSelect, ({ field }) => ({
  value: field.value,
}));
export default InputResourceSelect;
