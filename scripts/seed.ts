import { ethers } from "hardhat";

type DemoIssue = {
  issueId: string;
  issueType: string;
  location: string;
  description: string;
  reportDate: string;
  priority: number;
  reportedBy: string;
  team: string;
  status: number;
};

async function main() {
  const [municipal] = await ethers.getSigners();
  const registry = await ethers.getContractAt("UrbanIssueRegistry", await deployedAddress());
  const fixtures: DemoIssue[] = [
    { issueId: "CITY-2026-901", issueType: "StreetLight", location: "Avenue Mohammed V, Ville Fictive", description: "Éclairage public fictif hors service.", reportDate: "2026-11-19", priority: 2, reportedBy: "Citizen01", team: "", status: 0 },
    { issueId: "CITY-2026-902", issueType: "Pothole", location: "Rue des Orangers, Ville Fictive", description: "Nid-de-poule de démonstration.", reportDate: "2026-11-19", priority: 1, reportedBy: "Citizen02", team: "UrbanTeam01", status: 1 },
    { issueId: "CITY-2026-903", issueType: "WaterLeak", location: "Place Al Amal, Ville Fictive", description: "Fuite simulée à inspecter.", reportDate: "2026-11-19", priority: 3, reportedBy: "Citizen03", team: "UrbanTeam02", status: 2 },
    { issueId: "CITY-2026-904", issueType: "WasteCollection", location: "Boulevard Atlas, Ville Fictive", description: "Collecte fictive à planifier.", reportDate: "2026-11-19", priority: 1, reportedBy: "Citizen04", team: "UrbanTeam03", status: 3 },
    { issueId: "CITY-2026-905", issueType: "TrafficLight", location: "Rue des Jardins, Ville Fictive", description: "Feu de circulation de démonstration.", reportDate: "2026-11-19", priority: 2, reportedBy: "Citizen05", team: "UrbanTeam01", status: 4 },
    { issueId: "CITY-2026-906", issueType: "BrokenSidewalk", location: "Avenue des Palmiers, Ville Fictive", description: "Trottoir fictif à réparer.", reportDate: "2026-11-19", priority: 0, reportedBy: "Citizen06", team: "", status: 0 }
  ];

  for (const fixture of fixtures) {
    let id = await registry.getIdByRef(fixture.issueId);
    if (id === 0n) {
      const createTx = await registry.createIssue(
        fixture.issueId,
        fixture.issueType,
        fixture.location,
        fixture.description,
        fixture.reportDate,
        fixture.priority,
        fixture.reportedBy
      );
      await createTx.wait();
      id = await registry.getIdByRef(fixture.issueId);
    }

    if (fixture.status >= 1 && Number((await registry.getIssue(id)).status) === 0) {
      await (await registry.assignIssue(id, fixture.team, "Affectation de démonstration")).wait();
    }
    let currentStatus = Number((await registry.getIssue(id)).status);
    while (currentStatus < fixture.status) {
      const comment = [
        "",
        "",
        "Intervention démarrée en démonstration.",
        "Réparation terminée en démonstration.",
        "Dossier clôturé en démonstration."
      ][currentStatus + 1];
      await (await registry.updateStatus(id, currentStatus + 1, comment)).wait();
      currentStatus = Number((await registry.getIssue(id)).status);
    }
    console.log(`${fixture.issueId}: id=${id}, status=${currentStatus}`);
  }
  console.log(`Seed completed by municipal account ${municipal.address}`);
}

async function deployedAddress() {
  const fs = await import("fs");
  const path = await import("path");
  const contractFile = JSON.parse(fs.readFileSync(
    path.join(__dirname, "..", "frontend", "src", "contracts", "UrbanIssueRegistry.json"),
    "utf8"
  )) as { address: string };
  if (!ethers.isAddress(contractFile.address)) {
    throw new Error("Deploy UrbanIssueRegistry before running seed");
  }
  return contractFile.address;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});