import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { Session } from 'next-auth';
import { isProd } from '~/env/other';
import { createModelFileDownloadUrl } from '~/server/common/model-helpers';
import { dbRead } from '~/server/db/client';
import { MixedAuthEndpoint } from '~/server/utils/endpoint-helpers';
import { getPrimaryFile } from '~/server/utils/model-helpers';
import { stringifyAIR } from '~/utils/string-helpers';
import { BaseModel } from '~/server/common/constants';
import { Availability, ModelType, Prisma } from '@prisma/client';
import { getBaseUrl } from '~/server/utils/url-helpers';

const schema = z.object({ id: z.coerce.number() });
type VersionRow = {
  id: number;
  versionName: string;
  availability: Availability;
  modelId: number;
  modelName: string;
  baseModel: BaseModel;
  status: string;
  type: ModelType;
};
type FileRow = {
  id: number;
  type: string;
  visibility: string;
  url: string;
  metadata: FileMetadata;
  sizeKB: number;
  hash: string;
};

export default MixedAuthEndpoint(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  user: Session['user'] | undefined
) {
  const results = schema.safeParse(req.query);
  if (!results.success)
    return res.status(400).json({ error: `Invalid id: ${results.error.flatten().fieldErrors.id}` });

  const { id } = results.data;
  if (!id) return res.status(400).json({ error: 'Missing modelVersionId' });
  const where = [Prisma.sql`mv.id = ${id}`];
  if (!user?.isModerator) where.push(Prisma.sql`mv.status = 'Published'`);

  const [modelVersion] = await dbRead.$queryRaw<VersionRow[]>`
    SELECT
      mv.id,
      mv.name as "versionName",
      "modelId",
      m.name as "modelName",
      mv."baseModel",
      mv.status,
      mv.availability,
      m.type
    FROM "ModelVersion" mv
    JOIN "Model" m ON m.id = mv."modelId"
    WHERE ${Prisma.join(where, ' AND ')}
  `;
  if (!modelVersion) return res.status(404).json({ error: 'Model not found' });
  const files = await dbRead.$queryRaw<FileRow[]>`
    SELECT mf.id, mf.type, mf.visibility, mf.url, mf.metadata, mf."sizeKB", mfh.hash
    FROM "ModelFile" mf
    LEFT JOIN "ModelFileHash" mfh ON mfh."fileId" = mf.id AND mfh.type = 'AutoV2'
    WHERE mf."modelVersionId" = ${id}
  `;

  const primaryFile = getPrimaryFile(files);
  if (!primaryFile) return res.status(404).json({ error: 'Missing model file' });

  const baseUrl = getBaseUrl();
  const air = stringifyAIR(modelVersion)?.replace('pony', 'sdxl');
  let downloadUrl = `${baseUrl}${createModelFileDownloadUrl({
    versionId: modelVersion.id,
    primary: true,
  })}`;
  // if req url domain contains `api.`, strip /api/ from the download url
  if (req.headers.host?.includes('api.')) {
    downloadUrl = downloadUrl.replace('/api/', '/').replace('civitai.com', 'api.civitai.com');
  }

  const data = {
    air,
    versionName: modelVersion.versionName,
    modelName: modelVersion.modelName,
    baseModel: modelVersion.baseModel,
    availability: modelVersion.availability,
    size: primaryFile.sizeKB,
    hashes: {
      AutoV2: primaryFile.hash,
    },
    downloadUrls: [downloadUrl],
  };
  res.status(200).json(data);
});
