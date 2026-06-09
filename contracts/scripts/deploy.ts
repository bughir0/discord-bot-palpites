import { ethers, network } from "hardhat";

function validarChavePrivadaParaDeploy(): void {
  if (network.name === "hardhat") return;

  const ownerKey = process.env.CHILIZ_OWNER_PRIVATE_KEY?.trim();
  if (!ownerKey) {
    throw new Error(
      "CHILIZ_OWNER_PRIVATE_KEY nao definida no .env da raiz. " +
        "Preencha com a chave privada (0x + 64 hex) e rode o deploy novamente.",
    );
  }

  if (ethers.isAddress(ownerKey)) {
    throw new Error(
      "CHILIZ_OWNER_PRIVATE_KEY esta com formato de ENDERECO (0x...). " +
        "Use a chave privada da carteira (0x + 64 hex), nao o endereco publico.",
    );
  }

  const privateKeyRegex = /^0x[0-9a-fA-F]{64}$/;
  if (!privateKeyRegex.test(ownerKey)) {
    throw new Error(
      "CHILIZ_OWNER_PRIVATE_KEY invalida. Formato esperado: 0x + 64 caracteres hexadecimais.",
    );
  }
}

async function main() {
  validarChavePrivadaParaDeploy();

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "Nenhum signer disponivel para deploy. Confira CHILIZ_OWNER_PRIVATE_KEY no .env da raiz.",
    );
  }

  const deployerAddress = await deployer.getAddress();

  const ownerInicial = process.env.BOLAO_OWNER_ADDRESS ?? deployerAddress;
  const balance = await ethers.provider.getBalance(deployerAddress);

  console.log("=".repeat(60));
  console.log(`Rede:       ${network.name} (chainId ${network.config.chainId})`);
  console.log(`Deployer:   ${deployerAddress}`);
  console.log(`Saldo:      ${ethers.formatEther(balance)} CHZ`);
  console.log(`Owner:      ${ownerInicial}`);
  console.log("=".repeat(60));

  if (balance === 0n) {
    throw new Error(
      "Deployer sem saldo. Pegue CHZ no faucet Spicy: https://spicy-faucet.chiliz.com/",
    );
  }

  const Factory = await ethers.getContractFactory("BolaoCopa");
  const bolao = await Factory.deploy(ownerInicial);
  console.log("Aguardando confirmacao do deploy...");
  await bolao.waitForDeployment();

  const address = await bolao.getAddress();
  const tx = bolao.deploymentTransaction();

  console.log("\nDeploy concluido!");
  console.log(`Endereco: ${address}`);
  console.log(`Tx hash:  ${tx?.hash}`);
  console.log(`\nProximo passo: edite o .env na RAIZ do projeto (nao contracts/.env):`);
  console.log(`BOLAO_CONTRACT_ADDRESS=${address}`);
  console.log(`CHILIZ_CHAIN_ID=${network.config.chainId}`);

  if (network.name === "spicy") {
    console.log(`\nVerificar no explorer:`);
    console.log(`https://testnet.chiliscan.com/address/${address}`);
  } else if (network.name === "chiliz") {
    console.log(`\nVerificar no explorer:`);
    console.log(`https://chiliscan.com/address/${address}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
