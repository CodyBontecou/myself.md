import { cloud } from './cloud.js';
import { createExplorer } from './explorer-service.js';
export const { explore, recordDetail } = createExplorer(cloud);
