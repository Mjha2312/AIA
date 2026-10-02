import type { Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { logger } from "./logger.js";

/**
 * Normalized public events broadcast on /ws per SPEC:
 * { type: "VoteCast"|"PhaseChanged"|"VoterRegistered", ... }.
 *
 * Privacy: payloads carry chain-public data only (ids, counts, hashes,
 * commitments already visible on-chain). Nothing linkable to KYC — no
 * subjectIds, tokens, IPs, or timing metadata beyond block numbers.
 */
export type WsEvent =
  | {
      type: "VoteCast";
      electionId: string;
      nullifier: string;
      candidateIndex: number;
      voteHash: string;
      txHash: string;
      blockNumber: number;
    }
  | {
      type: "PhaseChanged";
      electionId: string;
      newPhase: number;
      txHash: string;
      blockNumber: number;
    }
  | {
      type: "VoterRegistered";
      electionId: string;
      identityCommitment: string;
      txHash: string;
      blockNumber: number;
    };

const OPEN = 1;

export class WsHub {
  private wss: WebSocketServer | null = null;

  attach(server: Server, path = "/ws"): void {
    if (this.wss) return;
    this.wss = new WebSocketServer({ server, path });
    this.wss.on("connection", (socket: WebSocket) => {
      logger.debug({ clients: this.clientCount }, "ws client connected");
      socket.on("error", (err) => {
        logger.debug({ err }, "ws client error");
      });
    });
  }

  broadcast(event: WsEvent): void {
    if (!this.wss) return;
    const message = JSON.stringify(event);
    for (const client of this.wss.clients) {
      if ((client as WebSocket).readyState === OPEN) {
        (client as WebSocket).send(message);
      }
    }
  }

  get clientCount(): number {
    if (!this.wss) return 0;
    let n = 0;
    for (const client of this.wss.clients) {
      if ((client as WebSocket).readyState === OPEN) n++;
    }
    return n;
  }

  async close(): Promise<void> {
    if (!this.wss) return;
    const wss = this.wss;
    this.wss = null;
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  }
}
