import { createDataClient } from '@orbital/data';
import { DATA_BASE } from '../config';

/** Singleton data-access client pointed at the app's static snapshots. */
export const dataClient = createDataClient({ baseUrl: DATA_BASE });
