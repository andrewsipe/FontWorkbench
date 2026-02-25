/**
 * Type definitions for Web Workers
 */

export interface WorkerMessage {
  type: string;
  payload: unknown;
}

export interface WorkerResponse {
  type: string;
  payload: unknown;
}
