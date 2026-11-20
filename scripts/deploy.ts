import { artifacts, ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const factory = await ethers.getContractFactory("UrbanIssueRegistry");
  const registry = await factory.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  const artifact = await artifacts.readArtifact("UrbanIssueRegistry");
  const outputPath = path.join(__dirname, "..", "frontend", "src", "contracts", "UrbanIssueRegistry.json");

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({ address, abi: artifact.abi }, null, 2)}\n`);
  console.log(`UrbanIssueRegistry deployed to: ${address}`);
  console.log(`Frontend contract details written to: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
