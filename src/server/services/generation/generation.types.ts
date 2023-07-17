import { ModelType } from '@prisma/client';

export namespace Generation {
  export type AdditionalNetwork = Partial<{
    strength: number;
  }>;

  export type Image = {
    id: number;
    hash: string;
    url: string;
    available: boolean;
    requestId: number;
    seed?: number; // TODO.generation - check if this prop will be set
  };

  export type Data = {
    params?: Partial<Params>;
    resources: Resource[];
  };

  export type Params = {
    prompt: string;
    negativePrompt?: string;
    width: number;
    height: number;
    sampler: string;
    steps: number;
    cfgScale: number;
    seed: number;
    clipSkip: number;
  };

  export type Asset = {
    type: ModelType;
    hash: string;
    url: string;
    modelVersionId: number;
  };

  export type Job = {
    quantity: number;
    priority: number;
    model: string;
    params: Params;
    additionalNetworks: Record<string, AdditionalNetwork> | null;
  };

  export type Resource = AdditionalNetwork & {
    id: number;
    name: string;
    trainedWords: string[];
    modelId: number;
    modelName: string;
    modelType: ModelType;
    baseModel: string;

    // navigation props
    covered?: boolean;
  };

  export type Request = {
    id: number;
    createdAt: Date;
    estimatedCompletionDate: Date;
    status: GenerationRequestStatus;
    quantity: number;
    priority: number;
    params: Params;
    resources: Resource[];
    images?: Image[];
  };

  export type Coverage = {
    assets: AssetCoverageDictionary;
    assetTypes: AssetTypeCoverageDictionary;
    schedulers: SchedulerCoverageDictionary;
  };

  export type AssetCoverageDictionary = Record<string, ItemCoverage>;
  export type AssetTypeCoverageDictionary = Record<string, ItemCoverage>;
  export type SchedulerCoverageDictionary = Record<string, ItemCoverage>;

  export type ItemCoverage = {
    workers: number;
    serviceProviders: Record<string, ServiceProviderCoverage>;
  };

  export type ServiceProviderCoverage = {
    workers: number;
  };

  export namespace Api {
    export type RequestProps = {
      id: number;
      createdAt: Date;
      estimatedCompletedAt: Date;
      userId: number;
      status: string;
      job: Job;
      images?: Image[];
    };
    export type Request = {
      cursor: number;
      requests: RequestProps[];
    };
  }
}

export enum GenerationRequestStatus {
  Pending = 'Pending',
  Processing = 'Processing',
  Cancelled = 'Cancelled',
  Error = 'Error',
  Succeeded = 'Succeeded',
}
