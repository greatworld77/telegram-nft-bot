import hre from "hardhat";

async function main() {
  const NFT = await hre.ethers.getContractFactory("TestNFT");
  const nft = await NFT.deploy();

  await nft.waitForDeployment();

  console.log("NFT Contract Address:", await nft.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
