import type { PalpiteSession } from './sessionStore';

class BolaoChzDraftStore {
  private drafts = new Map<string, Map<number, { mandante: number; visitante: number }>>();

  private key(userId: string, rodadaId: number): string {
    return `${userId}:${rodadaId}`;
  }

  salvar(
    userId: string,
    rodadaId: number,
    partidaId: number,
    mandante: number,
    visitante: number,
  ): void {
    const k = this.key(userId, rodadaId);
    if (!this.drafts.has(k)) this.drafts.set(k, new Map());
    this.drafts.get(k)!.set(partidaId, { mandante, visitante });
  }

  getPalpitados(userId: string, rodadaId: number): Set<number> {
    const map = this.drafts.get(this.key(userId, rodadaId));
    return new Set(map ? map.keys() : []);
  }

  limpar(userId: string, rodadaId: number): void {
    this.drafts.delete(this.key(userId, rodadaId));
  }

  count(userId: string, rodadaId: number): number {
    return this.getPalpitados(userId, rodadaId).size;
  }

  toPalpiteSessions(userId: string, rodadaId: number): PalpiteSession[] {
    const map = this.drafts.get(this.key(userId, rodadaId));
    if (!map) return [];
    return [...map.entries()].map(([partidaId, p]) => ({
      partidaId,
      mandante: p.mandante,
      visitante: p.visitante,
    }));
  }
}

export const bolaoChzDraftStore = new BolaoChzDraftStore();
