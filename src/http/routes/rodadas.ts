import type { FastifyInstance } from 'fastify';
import { getDb } from '../../db/database';
import { rodadaService } from '../../services/rodadaService';

export function registerRodadaRoutes(app: FastifyInstance): void {
  app.get('/api/rodadas/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const rodada = rodadaService.getRodadaById(Number(id));
    if (!rodada) return reply.code(404).send({ error: 'rodada_nao_encontrada' });
    if (rodada.modalidade !== 'copa') {
      return reply.code(400).send({ error: 'rodada_nao_e_onchain' });
    }

    const apostas = getDb()
      .prepare(
        `SELECT COUNT(*) as total, COALESCE(SUM(onchain_confirmed), 0) as confirmadas
         FROM palpites
         WHERE rodada_id = ?`,
      )
      .get(rodada.id) as { total: number; confirmadas: number };

    return {
      rodadaId: rodada.id,
      numeroRodada: rodada.numero_rodada,
      entradaCHZWei: rodada.entrada_chz_wei,
      totalPalpites: apostas.total,
      pagamentosConfirmados: apostas.confirmadas,
      status: rodada.status,
    };
  });
}
