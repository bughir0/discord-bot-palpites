/** Logger simples com prefixos consistentes para os logs do bot. */

function ts(): string {
  return new Date().toLocaleString('pt-BR');
}

export const log = {
  /** Eventos informativos do app (ex.: boot, configuração) */
  info(msg: string): void {
    console.log(`ℹ️  ${msg}`);
  },
  /** Operações bem-sucedidas */
  success(msg: string): void {
    console.log(`✅ ${msg}`);
  },
  /** Avisos não-críticos (ex.: cota perto do limite) */
  warn(msg: string): void {
    console.warn(`⚠️  ${msg}`);
  },
  /** Erros */
  error(msg: string, err?: unknown): void {
    console.error(`❌ ${msg}`);
    if (err) console.error(err);
  },
  /** Detalhe indentado abaixo de um log principal */
  detail(msg: string): void {
    console.log(`   ↳ ${msg}`);
  },
  /** Job rodando (cron) — prefixo de relógio + timestamp */
  job(emoji: string, nome: string, extra?: string): void {
    console.log(`${emoji} ${nome} (${ts()})${extra ? ` · ${extra}` : ''}`);
  },
};
