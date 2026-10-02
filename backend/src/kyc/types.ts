export interface KycSession {
  sessionId: string;
  redirectUrl: string;
}

export interface KycSubject {
  subjectId: string;
}

export interface KycProvider {
  start(electionId: string): Promise<KycSession>;
  complete(sessionId: string, input: { mockEpic?: string }): Promise<KycSubject>;
}
