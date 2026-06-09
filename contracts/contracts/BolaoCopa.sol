// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title BolaoCopa - bolao parimutuel em CHZ para a Copa do Mundo 2026
/// @notice Cada rodada e um pool. Apostadores pagam entrada fixa em CHZ e
///         palpitam o placar de varios jogos. Quando o owner resolve a rodada,
///         quem tiver mais pontos (placar exato vale 3, vencedor/empate vale 1)
///         divide o pool igualmente. O owner cobra 2% de taxa.
/// @dev Non-custodial: o contrato segura o CHZ ate o saque. O owner so
///      pode resolver e cancelar; nao tem permissao de retirar fundos arbitrarios.
contract BolaoCopa is Ownable, ReentrancyGuard, Pausable {
    uint16 public constant TAXA_BPS = 200;
    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint8 public constant PONTOS_EXATO = 3;
    uint8 public constant PONTOS_VENCEDOR = 1;

    struct Rodada {
        uint256 numeroRodada;
        uint256 entradaCHZ;
        uint256 fechaEm;
        uint256[] partidaIds;
        address[] apostadores;
        uint256 poolTotal;
        uint256 maiorPontuacao;
        uint256 numVencedores;
        uint256 premioPorVencedor;
        bool resolvida;
        bool cancelada;
    }

    struct Aposta {
        uint8[] palpiteMandante;
        uint8[] palpiteVisitante;
        uint256 pontos;
        bool existe;
        bool sacou;
    }

    mapping(uint256 => Rodada) private _rodadas;
    mapping(uint256 => mapping(address => Aposta)) private _apostas;

    uint256 public proximaRodadaId;

    event RodadaCriada(
        uint256 indexed rodadaId,
        uint256 indexed numeroRodada,
        uint256 entradaCHZ,
        uint256 fechaEm,
        uint256 totalPartidas
    );
    event ApostaRegistrada(
        uint256 indexed rodadaId,
        address indexed apostador,
        uint256 valor
    );
    event RodadaResolvida(
        uint256 indexed rodadaId,
        uint256 maiorPontuacao,
        uint256 numVencedores,
        uint256 poolLiquido,
        uint256 taxaOperador
    );
    event PremioSacado(
        uint256 indexed rodadaId,
        address indexed vencedor,
        uint256 valor
    );
    event RodadaCancelada(uint256 indexed rodadaId);
    event ReembolsoSacado(
        uint256 indexed rodadaId,
        address indexed apostador,
        uint256 valor
    );

    error RodadaInexistente();
    error RodadaJaResolvida();
    error RodadaCanceladaErr();
    error RodadaAindaAberta();
    error ApostaForaDoPrazo();
    error ValorIncorreto(uint256 esperado, uint256 enviado);
    error PalpitesInvalidos();
    error JaApostou();
    error PlacaresInvalidos();
    error NaoEhVencedor();
    error JaSacou();
    error SemAposta();
    error FechaEmInvalido();
    error EntradaZero();
    error SemPartidas();
    error TransferenciaFalhou();

    constructor(address ownerInicial) Ownable(ownerInicial) {}

    /// @notice Cria uma nova rodada. So o owner pode chamar.
    /// @param numeroRodada Numero da rodada (informativo, espelha API Futebol).
    /// @param entradaCHZ Valor em wei (CHZ) que cada apostador paga para entrar.
    /// @param fechaEm Timestamp UNIX a partir do qual nao se aceita mais apostas.
    /// @param partidaIds IDs externos das partidas (API Futebol) na ordem em
    ///                   que os palpites serao informados.
    function criarRodada(
        uint256 numeroRodada,
        uint256 entradaCHZ,
        uint256 fechaEm,
        uint256[] calldata partidaIds
    ) external onlyOwner whenNotPaused returns (uint256 rodadaId) {
        if (entradaCHZ == 0) revert EntradaZero();
        if (fechaEm <= block.timestamp) revert FechaEmInvalido();
        if (partidaIds.length == 0) revert SemPartidas();

        rodadaId = proximaRodadaId++;
        Rodada storage r = _rodadas[rodadaId];
        r.numeroRodada = numeroRodada;
        r.entradaCHZ = entradaCHZ;
        r.fechaEm = fechaEm;
        r.partidaIds = partidaIds;

        emit RodadaCriada(rodadaId, numeroRodada, entradaCHZ, fechaEm, partidaIds.length);
    }

    /// @notice Registra o palpite do apostador para todos os jogos da rodada.
    /// @dev O valor enviado deve ser exatamente igual a entradaCHZ. Cada
    ///      endereco so pode apostar uma vez por rodada.
    function apostar(
        uint256 rodadaId,
        uint8[] calldata palpiteMandante,
        uint8[] calldata palpiteVisitante
    ) external payable whenNotPaused {
        Rodada storage r = _rodadas[rodadaId];
        if (r.entradaCHZ == 0) revert RodadaInexistente();
        if (r.resolvida) revert RodadaJaResolvida();
        if (r.cancelada) revert RodadaCanceladaErr();
        if (block.timestamp >= r.fechaEm) revert ApostaForaDoPrazo();
        if (msg.value != r.entradaCHZ) revert ValorIncorreto(r.entradaCHZ, msg.value);

        uint256 nPartidas = r.partidaIds.length;
        if (
            palpiteMandante.length != nPartidas ||
            palpiteVisitante.length != nPartidas
        ) revert PalpitesInvalidos();

        Aposta storage a = _apostas[rodadaId][msg.sender];
        if (a.existe) revert JaApostou();

        a.existe = true;
        a.palpiteMandante = palpiteMandante;
        a.palpiteVisitante = palpiteVisitante;

        r.apostadores.push(msg.sender);
        r.poolTotal += msg.value;

        emit ApostaRegistrada(rodadaId, msg.sender, msg.value);
    }

    /// @notice Resolve a rodada calculando pontos, identificando vencedores
    ///         e habilitando saque. Cobra 2% de taxa em favor do owner.
    /// @dev So o owner pode chamar. Atencao: o gas cresce O(apostadores * partidas).
    ///      Para rodadas com mais de ~200 apostadores, considerar batching em v2.
    function resolverRodada(
        uint256 rodadaId,
        uint8[] calldata placarMandante,
        uint8[] calldata placarVisitante
    ) external onlyOwner nonReentrant {
        Rodada storage r = _rodadas[rodadaId];
        if (r.entradaCHZ == 0) revert RodadaInexistente();
        if (r.resolvida) revert RodadaJaResolvida();
        if (r.cancelada) revert RodadaCanceladaErr();
        if (block.timestamp < r.fechaEm) revert RodadaAindaAberta();

        uint256 nPartidas = r.partidaIds.length;
        if (
            placarMandante.length != nPartidas ||
            placarVisitante.length != nPartidas
        ) revert PlacaresInvalidos();

        uint256 maior;
        uint256 nVenc;
        uint256 nApost = r.apostadores.length;

        for (uint256 i; i < nApost; ++i) {
            address user = r.apostadores[i];
            Aposta storage ap = _apostas[rodadaId][user];
            uint256 pontos = _calcularPontos(ap, placarMandante, placarVisitante);
            ap.pontos = pontos;
            if (pontos > maior) {
                maior = pontos;
                nVenc = 1;
            } else if (pontos == maior && pontos > 0) {
                ++nVenc;
            }
        }

        r.maiorPontuacao = maior;
        r.resolvida = true;

        if (maior == 0) {
            // Ninguem acertou nada: devolve 100% das apostas, sem taxa.
            r.numVencedores = 0;
            r.premioPorVencedor = 0;
            emit RodadaResolvida(rodadaId, 0, 0, 0, 0);
            return;
        }

        r.numVencedores = nVenc;

        uint256 taxa = (r.poolTotal * TAXA_BPS) / BPS_DENOMINATOR;
        uint256 poolLiquido = r.poolTotal - taxa;
        r.premioPorVencedor = poolLiquido / nVenc;

        if (taxa > 0) {
            (bool ok, ) = owner().call{value: taxa}("");
            if (!ok) revert TransferenciaFalhou();
        }

        emit RodadaResolvida(rodadaId, maior, nVenc, poolLiquido, taxa);
    }

    /// @notice Vencedores chamam para sacar sua parte (pull payment).
    function sacar(uint256 rodadaId) external nonReentrant {
        Rodada storage r = _rodadas[rodadaId];
        if (r.entradaCHZ == 0) revert RodadaInexistente();
        Aposta storage a = _apostas[rodadaId][msg.sender];
        if (!a.existe) revert SemAposta();
        if (a.sacou) revert JaSacou();

        uint256 valor;
        if (r.cancelada) {
            valor = r.entradaCHZ;
        } else if (r.resolvida) {
            if (r.maiorPontuacao == 0) {
                valor = r.entradaCHZ;
            } else {
                if (a.pontos != r.maiorPontuacao) revert NaoEhVencedor();
                valor = r.premioPorVencedor;
            }
        } else {
            revert RodadaAindaAberta();
        }

        a.sacou = true;
        (bool ok, ) = msg.sender.call{value: valor}("");
        if (!ok) revert TransferenciaFalhou();

        if (r.cancelada || r.maiorPontuacao == 0) {
            emit ReembolsoSacado(rodadaId, msg.sender, valor);
        } else {
            emit PremioSacado(rodadaId, msg.sender, valor);
        }
    }

    /// @notice Cancela rodada antes da resolucao. Apostadores podem chamar
    ///         sacar() para receber 100% de volta (sem taxa).
    function cancelarRodada(uint256 rodadaId) external onlyOwner {
        Rodada storage r = _rodadas[rodadaId];
        if (r.entradaCHZ == 0) revert RodadaInexistente();
        if (r.resolvida) revert RodadaJaResolvida();
        if (r.cancelada) revert RodadaCanceladaErr();
        r.cancelada = true;
        emit RodadaCancelada(rodadaId);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // -------- Views --------

    function getRodada(uint256 rodadaId)
        external
        view
        returns (
            uint256 numeroRodada,
            uint256 entradaCHZ,
            uint256 fechaEm,
            uint256 totalApostadores,
            uint256 poolTotal,
            uint256 maiorPontuacao,
            uint256 numVencedores,
            uint256 premioPorVencedor,
            bool resolvida,
            bool cancelada
        )
    {
        Rodada storage r = _rodadas[rodadaId];
        return (
            r.numeroRodada,
            r.entradaCHZ,
            r.fechaEm,
            r.apostadores.length,
            r.poolTotal,
            r.maiorPontuacao,
            r.numVencedores,
            r.premioPorVencedor,
            r.resolvida,
            r.cancelada
        );
    }

    function getPartidasDaRodada(uint256 rodadaId)
        external
        view
        returns (uint256[] memory)
    {
        return _rodadas[rodadaId].partidaIds;
    }

    function getApostadoresDaRodada(uint256 rodadaId)
        external
        view
        returns (address[] memory)
    {
        return _rodadas[rodadaId].apostadores;
    }

    function getAposta(uint256 rodadaId, address user)
        external
        view
        returns (
            uint8[] memory palpiteMandante,
            uint8[] memory palpiteVisitante,
            uint256 pontos,
            bool existe,
            bool sacou
        )
    {
        Aposta storage a = _apostas[rodadaId][user];
        return (a.palpiteMandante, a.palpiteVisitante, a.pontos, a.existe, a.sacou);
    }

    /// @notice Premio que o endereco pode sacar agora. Retorna 0 se nao se
    ///         aplica (perdedor, ja sacou, rodada nao resolvida, etc.).
    function premioDisponivel(uint256 rodadaId, address user)
        external
        view
        returns (uint256)
    {
        Rodada storage r = _rodadas[rodadaId];
        Aposta storage a = _apostas[rodadaId][user];
        if (!a.existe || a.sacou) return 0;
        if (r.cancelada) return r.entradaCHZ;
        if (!r.resolvida) return 0;
        if (r.maiorPontuacao == 0) return r.entradaCHZ;
        if (a.pontos != r.maiorPontuacao) return 0;
        return r.premioPorVencedor;
    }

    // -------- Internos --------

    function _calcularPontos(
        Aposta storage a,
        uint8[] calldata placarM,
        uint8[] calldata placarV
    ) private view returns (uint256 pontos) {
        uint256 n = placarM.length;
        for (uint256 i; i < n; ++i) {
            uint8 pm = a.palpiteMandante[i];
            uint8 pv = a.palpiteVisitante[i];
            uint8 rm = placarM[i];
            uint8 rv = placarV[i];

            if (pm == rm && pv == rv) {
                pontos += PONTOS_EXATO;
            } else if (
                (pm > pv && rm > rv) ||
                (pm < pv && rm < rv) ||
                (pm == pv && rm == rv)
            ) {
                pontos += PONTOS_VENCEDOR;
            }
        }
    }

    /// @dev Receber CHZ direto sem chamar apostar() nao e suportado.
    receive() external payable {
        revert();
    }
}
