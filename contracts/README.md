# Bolao Copa - Smart Contracts

Contrato `BolaoCopa.sol` que roda na **Chiliz Chain** (Spicy Testnet `88882` / Mainnet `88888`).

Faz pool parimutuel em CHZ: cada apostador paga entrada fixa por rodada e palpita o placar dos jogos. Maior pontuacao leva o pool (placar exato = 3 pts, vencedor/empate = 1 pt). Owner cobra 2% de taxa.

## Stack

- Solidity 0.8.24 (EVM `shanghai`)
- Hardhat + TypeScript
- OpenZeppelin (`Ownable`, `ReentrancyGuard`, `Pausable`)

## Setup

```powershell
cd contracts
npm install
```

As variaveis de rede ficam no **`.env` da raiz do projeto** (nao crie `contracts/.env`).
Copie `.env.example` para `.env` na raiz e preencha `CHILIZ_OWNER_PRIVATE_KEY`.

## Comandos

```powershell
npm run compile         # compila o contrato
npm test                # roda os testes localmente em hardhat network
npm run coverage        # cobertura de testes
npm run deploy:spicy    # deploy na Spicy Testnet
npm run deploy:chiliz   # deploy na Mainnet
```

## Funcoes do contrato

| Funcao | Quem chama | O que faz |
|---|---|---|
| `criarRodada(numero, entradaCHZ, fechaEm, partidaIds[])` | owner | Abre rodada |
| `apostar(rodadaId, palpiteM[], palpiteV[])` payable | qualquer usuario | Registra palpite, paga entrada |
| `resolverRodada(rodadaId, placarM[], placarV[])` | owner | Calcula pontos, cobra 2%, habilita saque |
| `sacar(rodadaId)` | vencedor / apostador (se cancelada) | Pull payment |
| `cancelarRodada(rodadaId)` | owner | Devolve 100% sem taxa |
| `pause()` / `unpause()` | owner | Trava criacao/aposta em emergencia |

## Pontuacao

- Placar exato: 3 pontos (`PONTOS_EXATO`)
- So o vencedor/empate: 1 ponto (`PONTOS_VENCEDOR`)

## Taxa

- 2% (`TAXA_BPS = 200`) transferida automaticamente para `owner()` no `resolverRodada`.
- Se ninguem pontuou na rodada, a taxa NAO e cobrada e todos recebem 100% de volta.

## Deploy

1. Crie wallet dedicada e pegue CHZ no [faucet Spicy](https://spicy-faucet.chiliz.com/).
2. Na **raiz do repo**, edite `.env` e preencha `CHILIZ_OWNER_PRIVATE_KEY=0x...`.
3. Dentro de `contracts/`: `npm run deploy:spicy` (testnet) ou `npm run deploy:chiliz` (mainnet).
4. Copie o endereco do console para o mesmo `.env` da raiz: `BOLAO_CONTRACT_ADDRESS=0x...`.

## Verificacao no chiliscan

Chiliz nao suporta verify automatico via Hardhat ainda. Faca manualmente:

```powershell
npx hardhat flatten contracts/BolaoCopa.sol > BolaoCopa.flat.sol
```

Cole o conteudo em [https://testnet.chiliscan.com/](https://testnet.chiliscan.com/) ou [https://chiliscan.com/](https://chiliscan.com/) escolhendo:

- Compiler: `v0.8.24`
- EVM version: `shanghai`
- Optimizer: enabled, 200 runs

## Avisos de seguranca

- O owner pode resolver e cancelar rodadas. Esse e o ponto de confianca do sistema (oraculo centralizado).
- Para producao recomenda-se Gnosis Safe como owner (v2).
- `resolverRodada` itera sobre todos os apostadores; com >200 apostadores o gas pode estourar. Para volumes maiores migrar para Merkle claim em v2.
- Nunca usar `selfdestruct`, `delegatecall` para contratos nao auditados, nem alterar o contrato sem refazer testes.
