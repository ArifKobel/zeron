import type { RpcClient } from '@/rpc';

export let engine: RpcClient;

export function setEngine(client: RpcClient) {
  engine = client;
}
