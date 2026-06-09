import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { Signer } from "ethers";
import { BolaoCopa } from "../typechain-types";

const CHZ = (n: string | number) => ethers.parseEther(n.toString());

async function deployBolao(): Promise<{
  bolao: BolaoCopa;
  owner: Signer;
  alice: Signer;
  bob: Signer;
  carol: Signer;
  dave: Signer;
}> {
  const [owner, alice, bob, carol, dave] = await ethers.getSigners();
  const Factory = await ethers.getContractFactory("BolaoCopa");
  const bolao = (await Factory.deploy(await owner.getAddress())) as unknown as BolaoCopa;
  await bolao.waitForDeployment();
  return { bolao, owner, alice, bob, carol, dave };
}

async function criarRodadaPadrao(
  bolao: BolaoCopa,
  entrada = CHZ(10),
  partidaIds = [101n, 102n, 103n],
  duracao = 3600,
) {
  const fechaEm = (await time.latest()) + duracao;
  const tx = await bolao.criarRodada(1, entrada, fechaEm, partidaIds);
  await tx.wait();
  return { rodadaId: 0n, fechaEm, partidaIds, entrada };
}

describe("BolaoCopa", () => {
  describe("criarRodada", () => {
    it("apenas owner pode criar rodada", async () => {
      const { bolao, alice } = await deployBolao();
      await expect(
        bolao.connect(alice).criarRodada(1, CHZ(10), (await time.latest()) + 3600, [1n]),
      ).to.be.revertedWithCustomError(bolao, "OwnableUnauthorizedAccount");
    });

    it("rejeita entrada zero", async () => {
      const { bolao } = await deployBolao();
      await expect(
        bolao.criarRodada(1, 0n, (await time.latest()) + 3600, [1n]),
      ).to.be.revertedWithCustomError(bolao, "EntradaZero");
    });

    it("rejeita fechaEm no passado", async () => {
      const { bolao } = await deployBolao();
      await expect(
        bolao.criarRodada(1, CHZ(10), (await time.latest()) - 10, [1n]),
      ).to.be.revertedWithCustomError(bolao, "FechaEmInvalido");
    });

    it("rejeita rodada sem partidas", async () => {
      const { bolao } = await deployBolao();
      await expect(
        bolao.criarRodada(1, CHZ(10), (await time.latest()) + 3600, []),
      ).to.be.revertedWithCustomError(bolao, "SemPartidas");
    });

    it("emite evento RodadaCriada e incrementa proximaRodadaId", async () => {
      const { bolao } = await deployBolao();
      const fechaEm = (await time.latest()) + 3600;
      await expect(bolao.criarRodada(7, CHZ(50), fechaEm, [10n, 20n]))
        .to.emit(bolao, "RodadaCriada")
        .withArgs(0n, 7n, CHZ(50), fechaEm, 2n);
      expect(await bolao.proximaRodadaId()).to.equal(1n);
    });
  });

  describe("apostar", () => {
    it("rejeita valor diferente da entrada", async () => {
      const { bolao, alice } = await deployBolao();
      await criarRodadaPadrao(bolao);
      await expect(
        bolao.connect(alice).apostar(0, [1, 0, 2], [0, 0, 1], { value: CHZ(5) }),
      ).to.be.revertedWithCustomError(bolao, "ValorIncorreto");
    });

    it("rejeita arrays de palpites com tamanho errado", async () => {
      const { bolao, alice } = await deployBolao();
      await criarRodadaPadrao(bolao);
      await expect(
        bolao.connect(alice).apostar(0, [1, 0], [0, 0, 1], { value: CHZ(10) }),
      ).to.be.revertedWithCustomError(bolao, "PalpitesInvalidos");
    });

    it("rejeita aposta apos fechaEm", async () => {
      const { bolao, alice } = await deployBolao();
      const { fechaEm } = await criarRodadaPadrao(bolao);
      await time.increaseTo(fechaEm + 1);
      await expect(
        bolao.connect(alice).apostar(0, [1, 0, 2], [0, 0, 1], { value: CHZ(10) }),
      ).to.be.revertedWithCustomError(bolao, "ApostaForaDoPrazo");
    });

    it("rejeita aposta dupla do mesmo endereco", async () => {
      const { bolao, alice } = await deployBolao();
      await criarRodadaPadrao(bolao);
      await bolao.connect(alice).apostar(0, [1, 0, 2], [0, 0, 1], { value: CHZ(10) });
      await expect(
        bolao.connect(alice).apostar(0, [2, 1, 3], [0, 0, 1], { value: CHZ(10) }),
      ).to.be.revertedWithCustomError(bolao, "JaApostou");
    });

    it("rejeita rodada inexistente", async () => {
      const { bolao, alice } = await deployBolao();
      await expect(
        bolao.connect(alice).apostar(99, [1], [0], { value: CHZ(10) }),
      ).to.be.revertedWithCustomError(bolao, "RodadaInexistente");
    });

    it("acumula no pool e registra apostador", async () => {
      const { bolao, alice, bob } = await deployBolao();
      await criarRodadaPadrao(bolao);
      await bolao.connect(alice).apostar(0, [1, 0, 2], [0, 0, 1], { value: CHZ(10) });
      await bolao.connect(bob).apostar(0, [2, 1, 1], [1, 1, 1], { value: CHZ(10) });

      const r = await bolao.getRodada(0);
      expect(r.totalApostadores).to.equal(2n);
      expect(r.poolTotal).to.equal(CHZ(20));
    });
  });

  describe("resolverRodada", () => {
    it("apenas owner pode resolver", async () => {
      const { bolao, alice } = await deployBolao();
      const { fechaEm } = await criarRodadaPadrao(bolao);
      await time.increaseTo(fechaEm + 1);
      await expect(
        bolao.connect(alice).resolverRodada(0, [1, 0, 2], [0, 0, 1]),
      ).to.be.revertedWithCustomError(bolao, "OwnableUnauthorizedAccount");
    });

    it("rejeita resolver antes do fechaEm", async () => {
      const { bolao } = await deployBolao();
      await criarRodadaPadrao(bolao);
      await expect(
        bolao.resolverRodada(0, [1, 0, 2], [0, 0, 1]),
      ).to.be.revertedWithCustomError(bolao, "RodadaAindaAberta");
    });

    it("rejeita placares com tamanho errado", async () => {
      const { bolao } = await deployBolao();
      const { fechaEm } = await criarRodadaPadrao(bolao);
      await time.increaseTo(fechaEm + 1);
      await expect(
        bolao.resolverRodada(0, [1, 0], [0, 0, 1]),
      ).to.be.revertedWithCustomError(bolao, "PlacaresInvalidos");
    });

    it("um vencedor solitario leva 98% do pool e owner recebe 2%", async () => {
      const { bolao, owner, alice, bob } = await deployBolao();
      await criarRodadaPadrao(bolao);

      // Placares finais: 2x1, 0x0, 3x1
      // Alice: 2x1, 0x0, 3x1 -> 3 exatos = 9 pontos
      // Bob: 1x0 (vencedor mandante), 1x1 (errou), 0x2 (errou) -> 1 ponto
      await bolao.connect(alice).apostar(0, [2, 0, 3], [1, 0, 1], { value: CHZ(10) });
      await bolao.connect(bob).apostar(0, [1, 1, 0], [0, 1, 2], { value: CHZ(10) });

      const { fechaEm } = { fechaEm: (await time.latest()) + 1 };
      await time.increase(3700);

      const ownerBalBefore = await ethers.provider.getBalance(await owner.getAddress());
      const tx = await bolao.resolverRodada(0, [2, 0, 3], [1, 0, 1]);
      const rcpt = await tx.wait();
      const gasOwner = rcpt!.gasUsed * rcpt!.gasPrice;
      const ownerBalAfter = await ethers.provider.getBalance(await owner.getAddress());

      // Owner recebeu 2% = 0.4 CHZ (descontando gas pago)
      expect(ownerBalAfter + gasOwner - ownerBalBefore).to.equal(CHZ("0.4"));

      const r = await bolao.getRodada(0);
      expect(r.maiorPontuacao).to.equal(9n);
      expect(r.numVencedores).to.equal(1n);
      expect(r.premioPorVencedor).to.equal(CHZ("19.6"));
      expect(r.resolvida).to.equal(true);

      // Alice saca 19.6 CHZ
      const aliceBalBefore = await ethers.provider.getBalance(await alice.getAddress());
      const sacarTx = await bolao.connect(alice).sacar(0);
      const sacarRcpt = await sacarTx.wait();
      const gasAlice = sacarRcpt!.gasUsed * sacarRcpt!.gasPrice;
      const aliceBalAfter = await ethers.provider.getBalance(await alice.getAddress());
      expect(aliceBalAfter + gasAlice - aliceBalBefore).to.equal(CHZ("19.6"));

      // Bob nao e vencedor
      await expect(bolao.connect(bob).sacar(0)).to.be.revertedWithCustomError(
        bolao,
        "NaoEhVencedor",
      );

      // Alice ja sacou
      await expect(bolao.connect(alice).sacar(0)).to.be.revertedWithCustomError(
        bolao,
        "JaSacou",
      );
    });

    it("empate multiplo divide o pool igualmente", async () => {
      const { bolao, alice, bob, carol } = await deployBolao();
      await criarRodadaPadrao(bolao);

      // Placar final: 1x0, 1x1, 2x0
      // Alice palpita 1x0, 1x1, 2x0 -> 9 pontos (todos exatos)
      // Bob palpita 1x0, 1x1, 3x0 -> 7 pontos (2 exatos + 1 vencedor)
      // Carol palpita 1x0, 1x1, 2x0 -> 9 pontos (todos exatos)
      await bolao.connect(alice).apostar(0, [1, 1, 2], [0, 1, 0], { value: CHZ(10) });
      await bolao.connect(bob).apostar(0, [1, 1, 3], [0, 1, 0], { value: CHZ(10) });
      await bolao.connect(carol).apostar(0, [1, 1, 2], [0, 1, 0], { value: CHZ(10) });

      await time.increase(3700);
      await bolao.resolverRodada(0, [1, 1, 2], [0, 1, 0]);

      const r = await bolao.getRodada(0);
      expect(r.maiorPontuacao).to.equal(9n);
      expect(r.numVencedores).to.equal(2n);
      // Pool 30 CHZ - 2% taxa = 29.4 / 2 = 14.7
      expect(r.premioPorVencedor).to.equal(CHZ("14.7"));

      await expect(bolao.connect(alice).sacar(0))
        .to.emit(bolao, "PremioSacado")
        .withArgs(0n, await alice.getAddress(), CHZ("14.7"));
      await expect(bolao.connect(carol).sacar(0))
        .to.emit(bolao, "PremioSacado")
        .withArgs(0n, await carol.getAddress(), CHZ("14.7"));
      await expect(bolao.connect(bob).sacar(0)).to.be.revertedWithCustomError(
        bolao,
        "NaoEhVencedor",
      );
    });

    it("ninguem pontuou: devolve 100% a todos sem taxa", async () => {
      const { bolao, owner, alice, bob } = await deployBolao();
      await criarRodadaPadrao(bolao);

      // Placar final: 1x0 (mandante venceu), 0x0 (empate), 2x0 (mandante venceu)
      // Alice palpita 0x1 (visitante), 0x1 (visitante), 0x2 (visitante) -> erra tudo
      // Bob palpita 0x2 (visitante), 0x1 (visitante), 1x2 (visitante) -> erra tudo
      await bolao.connect(alice).apostar(0, [0, 0, 0], [1, 1, 2], { value: CHZ(10) });
      await bolao.connect(bob).apostar(0, [0, 0, 1], [2, 1, 2], { value: CHZ(10) });

      await time.increase(3700);

      const ownerBalBefore = await ethers.provider.getBalance(await owner.getAddress());
      const tx = await bolao.resolverRodada(0, [1, 0, 2], [0, 0, 0]);
      const rcpt = await tx.wait();
      const gasOwner = rcpt!.gasUsed * rcpt!.gasPrice;
      const ownerBalAfter = await ethers.provider.getBalance(await owner.getAddress());

      // Owner NAO recebeu taxa (maiorPontuacao = 0)
      expect(ownerBalAfter + gasOwner - ownerBalBefore).to.equal(0n);

      const r = await bolao.getRodada(0);
      expect(r.maiorPontuacao).to.equal(0n);
      expect(r.numVencedores).to.equal(0n);

      // Alice e Bob recebem seus 10 CHZ de volta
      await expect(bolao.connect(alice).sacar(0))
        .to.emit(bolao, "ReembolsoSacado")
        .withArgs(0n, await alice.getAddress(), CHZ(10));
      await expect(bolao.connect(bob).sacar(0))
        .to.emit(bolao, "ReembolsoSacado")
        .withArgs(0n, await bob.getAddress(), CHZ(10));
    });

    it("rejeita resolver duas vezes", async () => {
      const { bolao } = await deployBolao();
      await criarRodadaPadrao(bolao);
      await time.increase(3700);
      await bolao.resolverRodada(0, [1, 0, 2], [0, 0, 1]);
      await expect(
        bolao.resolverRodada(0, [1, 0, 2], [0, 0, 1]),
      ).to.be.revertedWithCustomError(bolao, "RodadaJaResolvida");
    });

    it("pontuacao mista: exato vale 3 e vencedor vale 1", async () => {
      const { bolao, alice } = await deployBolao();
      await criarRodadaPadrao(bolao);

      // Placar final: 2x1, 1x1, 0x3
      // Alice: 2x1 (exato=3), 0x0 (vencedor empate=1), 0x1 (vencedor visitante=1) = 5 pontos
      await bolao.connect(alice).apostar(0, [2, 0, 0], [1, 0, 1], { value: CHZ(10) });
      await time.increase(3700);
      await bolao.resolverRodada(0, [2, 1, 0], [1, 1, 3]);

      const ap = await bolao.getAposta(0, await alice.getAddress());
      expect(ap.pontos).to.equal(5n);
    });
  });

  describe("cancelarRodada", () => {
    it("apenas owner pode cancelar", async () => {
      const { bolao, alice } = await deployBolao();
      await criarRodadaPadrao(bolao);
      await expect(
        bolao.connect(alice).cancelarRodada(0),
      ).to.be.revertedWithCustomError(bolao, "OwnableUnauthorizedAccount");
    });

    it("devolve 100% sem taxa", async () => {
      const { bolao, alice, bob } = await deployBolao();
      await criarRodadaPadrao(bolao);
      await bolao.connect(alice).apostar(0, [1, 0, 2], [0, 0, 1], { value: CHZ(10) });
      await bolao.connect(bob).apostar(0, [0, 0, 0], [1, 1, 1], { value: CHZ(10) });

      await expect(bolao.cancelarRodada(0))
        .to.emit(bolao, "RodadaCancelada")
        .withArgs(0n);

      await expect(bolao.connect(alice).sacar(0))
        .to.emit(bolao, "ReembolsoSacado")
        .withArgs(0n, await alice.getAddress(), CHZ(10));
      await expect(bolao.connect(bob).sacar(0))
        .to.emit(bolao, "ReembolsoSacado")
        .withArgs(0n, await bob.getAddress(), CHZ(10));
    });

    it("rejeita cancelar resolvida", async () => {
      const { bolao } = await deployBolao();
      await criarRodadaPadrao(bolao);
      await time.increase(3700);
      await bolao.resolverRodada(0, [1, 0, 2], [0, 0, 1]);
      await expect(bolao.cancelarRodada(0)).to.be.revertedWithCustomError(
        bolao,
        "RodadaJaResolvida",
      );
    });
  });

  describe("premioDisponivel (view)", () => {
    it("retorna 0 antes da resolucao e o valor correto depois", async () => {
      const { bolao, alice } = await deployBolao();
      await criarRodadaPadrao(bolao);
      await bolao.connect(alice).apostar(0, [1, 0, 2], [0, 0, 1], { value: CHZ(10) });
      expect(await bolao.premioDisponivel(0, await alice.getAddress())).to.equal(0n);

      await time.increase(3700);
      await bolao.resolverRodada(0, [1, 0, 2], [0, 0, 1]);
      expect(await bolao.premioDisponivel(0, await alice.getAddress())).to.equal(
        CHZ("9.8"),
      );

      await bolao.connect(alice).sacar(0);
      expect(await bolao.premioDisponivel(0, await alice.getAddress())).to.equal(0n);
    });
  });

  describe("pausable", () => {
    it("apenas owner pausa/despausa", async () => {
      const { bolao, alice } = await deployBolao();
      await expect(bolao.connect(alice).pause()).to.be.revertedWithCustomError(
        bolao,
        "OwnableUnauthorizedAccount",
      );
      await bolao.pause();
      await expect(
        bolao.criarRodada(1, CHZ(10), (await time.latest()) + 3600, [1n]),
      ).to.be.revertedWithCustomError(bolao, "EnforcedPause");
      await bolao.unpause();
      await bolao.criarRodada(1, CHZ(10), (await time.latest()) + 3600, [1n]);
    });
  });

  describe("receive", () => {
    it("rejeita transferencia direta de CHZ", async () => {
      const { bolao, alice } = await deployBolao();
      await expect(
        alice.sendTransaction({ to: await bolao.getAddress(), value: CHZ(1) }),
      ).to.be.reverted;
    });
  });
});
