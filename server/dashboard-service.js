import { z } from 'zod';
import { PairingError } from './errors.js';
import { createExplorer } from './explorer-service.js';
/** @param {{cloud:import('./cloud-store.js').CloudStore,history:import('./history-store.js').HistoryStore,devices:(subject:string)=>ReturnType<import('./pairing-store.js').PairingStore['devices']>,cancelAgent:(subject:string,client:string)=>void}} dependencies */
export function createDashboardService({ cloud, history, devices, cancelAgent }) {
  const { explore, recordDetail } = createExplorer(cloud);
  /** @param {string} subject @param {string} account @param {string} path @param {string} method @param {URLSearchParams} query @param {unknown} body */
  async function dashboardApi(subject, account, path, method, query, body) {
    if (path === '/api/dashboard' && method === 'GET') {
      return {
        account,
        exports: cloud.list(subject),
        profiles: cloud.profiles(subject),
        agents: cloud.agents(subject),
        devices: devices(subject),
      };
    }
    if (path === '/api/dashboard/history' && method === 'GET') {
      const offset = z.coerce
        .number()
        .int()
        .min(0)
        .max(50000)
        .parse(query.get('offset') ?? 0);
      return history.list(subject, null, offset);
    }
    if (path === '/api/dashboard/history/entry' && method === 'GET') {
      const id = z.string().min(1).max(2000).parse(query.get('id'));
      const stored = history.get(subject, id);
      if (!stored) throw new PairingError(404, 'Activity not found.');
      return { event: stored.event, related: history.related(subject, stored.event) };
    }
    if (path === '/api/dashboard/explore' && method === 'POST') return explore(subject, body);
    if (path === '/api/dashboard/record' && method === 'GET') return recordDetail(subject, query);
    const records = path.match(/^\/api\/dashboard\/exports\/([^/]+)$/);
    if (records) {
      const id = z.string().uuid().parse(records[1]);
      if (method === 'DELETE') return cloud.delete(subject, id);
      if (method === 'GET') {
        const offset = z.coerce
          .number()
          .int()
          .min(0)
          .max(50000)
          .parse(query.get('offset') ?? 0);
        cloud.cleanup();
        return cloud.page(subject, id, offset, 50);
      }
    }
    if (path === '/api/dashboard/permissions' && method === 'PUT') {
      const input = z
        .object({
          deviceId: z.string().uuid(),
          profileId: z.string().min(1).max(100),
          shared: z.boolean(),
        })
        .parse(body);
      return cloud.setSharing(subject, input.deviceId, input.profileId, input.shared);
    }
    if (path === '/api/dashboard/agents' && method === 'PUT') {
      const input = z
        .object({ client: z.string().min(1).max(200), blocked: z.boolean() })
        .parse(body);
      const result = cloud.setAgent(subject, input.client, input.blocked);
      if (input.blocked) cancelAgent(subject, input.client);
      return result;
    }
    throw new PairingError(404, 'Dashboard action not found.');
  }

  return { dashboardApi };
}
