import { expect } from "chai";
import { ethers } from "hardhat";

describe("UrbanIssueRegistry", function () {
  async function deployRegistry() {
    const [admin, citizen, other, municipal] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("UrbanIssueRegistry");
    const registry = await factory.deploy();
    await registry.waitForDeployment();
    return { registry, admin, citizen, other, municipal };
  }

  function issue(issueId: string) {
    return {
      issueId,
      issueType: "StreetLight",
      location: "Avenue Mohammed V, Ville Fictive",
      description: "Éclairage public fictif hors service.",
      reportDate: "2026-11-19",
      priority: 2,
      reportedBy: "Citizen01"
    };
  }

  async function batchCreate(registry: any, count: number, prefix = "GAS") {
    const rows = Array.from({ length: count }, (_, index) => issue(`${prefix}-${index}`));
    return registry.batchCreateIssues(
      rows.map((row) => row.issueId),
      rows.map((row) => row.issueType),
      rows.map((row) => row.location),
      rows.map((row) => row.description),
      rows.map((row) => row.reportDate),
      rows.map((row) => row.priority),
      rows.map((row) => row.reportedBy),
      rows.map((_, index) => index % 2 === 0 ? `UrbanTeam${index + 1}` : "")
    );
  }

  it("allows a citizen to create an issue with initial history and event", async function () {
    const { registry, citizen } = await deployRegistry();
    const row = issue("CITY-2026-001");
    await expect(registry.connect(citizen).createIssue(
      row.issueId, row.issueType, row.location, row.description, row.reportDate, row.priority, row.reportedBy
    )).to.emit(registry, "IssueCreated").withArgs(1, row.issueId, citizen.address);
    const saved = await registry.getIssue(1);
    expect(saved.id).to.equal(1);
    expect(saved.issueId).to.equal(row.issueId);
    expect(saved.issueType).to.equal(row.issueType);
    expect(saved.location).to.equal(row.location);
    expect(saved.description).to.equal(row.description);
    expect(saved.reportDate).to.equal(row.reportDate);
    expect(saved.priority).to.equal(row.priority);
    expect(saved.reportedBy).to.equal(row.reportedBy);
    expect(saved.reporter).to.equal(citizen.address);
    expect(saved.status).to.equal(0);
    expect(saved.assignedTo).to.equal("");
    const history = await registry.getHistory(1);
    expect(history).to.have.length(1);
    expect(history[0].status).to.equal(0);
    expect(history[0].team).to.equal("");
    expect(history[0].comment).to.equal("Signalement créé");
    expect(history[0].actor).to.equal(citizen.address);
    expect(await registry.historyLength(1)).to.equal(1);
    expect(await registry.totalIssues()).to.equal(1);
  });

  it("rejects duplicate references in single and batch creation", async function () {
    const { registry, citizen } = await deployRegistry();
    const row = issue("DUPLICATE-REF");
    await registry.connect(citizen).createIssue(
      row.issueId, row.issueType, row.location, row.description, row.reportDate, row.priority, row.reportedBy
    );
    await expect(registry.createIssue(
      row.issueId, row.issueType, row.location, row.description, row.reportDate, row.priority, row.reportedBy
    )).to.be.revertedWithCustomError(registry, "DuplicateIssueId");
    const repeated = [issue("BATCH-DUP"), issue("BATCH-DUP")];
    await expect(registry.batchCreateIssues(
      repeated.map((entry) => entry.issueId),
      repeated.map((entry) => entry.issueType),
      repeated.map((entry) => entry.location),
      repeated.map((entry) => entry.description),
      repeated.map((entry) => entry.reportDate),
      repeated.map((entry) => entry.priority),
      repeated.map((entry) => entry.reportedBy),
      ["", ""]
    )).to.be.revertedWithCustomError(registry, "DuplicateIssueId");
    await expect(registry.batchCreateIssues(
      ["BATCH-NEW", row.issueId],
      [row.issueType, row.issueType],
      [row.location, row.location],
      [row.description, row.description],
      [row.reportDate, row.reportDate],
      [row.priority, row.priority],
      [row.reportedBy, row.reportedBy],
      ["", ""]
    )).to.be.revertedWithCustomError(registry, "DuplicateIssueId");
    expect(await registry.totalIssues()).to.equal(1);
  });

  it("rejects blank, oversized, and malformed inputs", async function () {
    const { registry, citizen } = await deployRegistry();
    const row = issue("INVALID");
    const values = [row.issueId, row.issueType, row.location, row.description, row.reportDate, row.priority, row.reportedBy] as const;
    for (const index of [0, 1, 2, 3, 4, 6]) {
      const mutable: [string, string, string, string, string, number, string] = [...values];
      mutable[index] = "   " as never;
      await expect(registry.connect(citizen).createIssue(...mutable))
        .to.be.revertedWithCustomError(registry, "EmptyRequiredField");
    }
    await expect(registry.createIssue(
      row.issueId, row.issueType, "x".repeat(201), row.description, row.reportDate, row.priority, row.reportedBy
    )).to.be.revertedWithCustomError(registry, "StringTooLong");
    await expect(registry.createIssue(
      row.issueId, row.issueType, row.location, row.description, "19-11-2026", row.priority, row.reportedBy
    )).to.be.revertedWithCustomError(registry, "InvalidReportDate");

    const invalidEnumInterface = new ethers.Interface([
      "function createIssue(string issueId,string issueType,string location,string description,string reportDate,uint8 priority,string reportedBy)"
    ]);
    const invalidPriorityCall = invalidEnumInterface.encodeFunctionData("createIssue", [
      "INVALID-PRIORITY", row.issueType, row.location, row.description, row.reportDate, 4, row.reportedBy
    ]);
    await expect(citizen.sendTransaction({ to: await registry.getAddress(), data: invalidPriorityCall })).to.be.reverted;
  });

  it("assigns an issue and records the assignment in history", async function () {
    const { registry, other, citizen } = await deployRegistry();
    const row = issue("ASSIGN-ME");
    await registry.connect(citizen).createIssue(
      row.issueId, row.issueType, row.location, row.description, row.reportDate, row.priority, row.reportedBy
    );
    await expect(registry.connect(other).assignIssue(1, "UrbanTeam01", "Équipe envoyée"))
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    await expect(registry.assignIssue(1, "UrbanTeam01", "Affectation validée"))
      .to.emit(registry, "IssueAssigned").withArgs(1, "UrbanTeam01", (await ethers.getSigners())[0].address)
      .and.to.emit(registry, "StatusUpdated").withArgs(1, 0, 1, (await ethers.getSigners())[0].address, "Affectation validée");
    const saved = await registry.getIssue(1);
    expect(saved.status).to.equal(1);
    expect(saved.assignedTo).to.equal("UrbanTeam01");
    const history = await registry.getHistory(1);
    expect(history).to.have.length(2);
    expect(history[1].team).to.equal("UrbanTeam01");
    expect(history[1].comment).to.equal("Affectation validée");
    expect(history[1].actor).to.equal((await ethers.getSigners())[0].address);
  });

  it("enforces the complete sequential lifecycle and records every actor and comment", async function () {
    const { registry, other, citizen } = await deployRegistry();
    const row = issue("LIFECYCLE");
    await registry.connect(citizen).createIssue(
      row.issueId, row.issueType, row.location, row.description, row.reportDate, row.priority, row.reportedBy
    );
    await registry.assignIssue(1, "UrbanTeam02", "Affectation");
    await expect(registry.connect(other).updateStatus(1, 2, "Début"))
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    await expect(registry.updateStatus(1, 3, "Saut interdit"))
      .to.be.revertedWithCustomError(registry, "InvalidStatusTransition");

    for (const [next, comment] of [[2, "Travaux commencés"], [3, "Réparation terminée"], [4, "Dossier clôturé"]] as const) {
      await expect(registry.updateStatus(1, next, comment))
        .to.emit(registry, "StatusUpdated").withArgs(1, next - 1, next, (await ethers.getSigners())[0].address, comment);
    }
    await expect(registry.updateStatus(1, 3, "Retour arrière"))
      .to.be.revertedWithCustomError(registry, "InvalidStatusTransition");
    await expect(registry.updateStatus(1, 4, "Réouverture"))
      .to.be.revertedWithCustomError(registry, "InvalidStatusTransition");
    await expect(registry.assignIssue(1, "UrbanTeam03", "Réaffectation"))
      .to.be.revertedWithCustomError(registry, "InvalidStatusTransition");

    const saved = await registry.getIssue(1);
    expect(saved.status).to.equal(4);
    const history = await registry.getHistory(1);
    expect(history.map((entry: { status: bigint }) => Number(entry.status))).to.deep.equal([0, 1, 2, 3, 4]);
    expect(history[2].team).to.equal("UrbanTeam02");
    expect(history[2].comment).to.equal("Travaux commencés");
    expect(history[2].actor).to.equal((await ethers.getSigners())[0].address);
    expect(await registry.historyLength(1)).to.equal(5);
  });

  it("imports mixed assigned and reported rows and rejects invalid batches", async function () {
    const { registry, other } = await deployRegistry();
    const rows = [issue("IMPORT-1"), issue("IMPORT-2")];
    await registry.batchCreateIssues(
      rows.map((row) => row.issueId),
      rows.map((row) => row.issueType),
      rows.map((row) => row.location),
      rows.map((row) => row.description),
      rows.map((row) => row.reportDate),
      rows.map((row) => row.priority),
      rows.map((row) => row.reportedBy),
      ["UrbanTeam01", ""]
    );
    expect((await registry.getIssue(1)).status).to.equal(1);
    expect((await registry.getIssue(1)).assignedTo).to.equal("UrbanTeam01");
    expect(await registry.historyLength(1)).to.equal(2);
    expect((await registry.getIssue(2)).status).to.equal(0);
    expect(await registry.historyLength(2)).to.equal(1);

    await expect(registry.batchCreateIssues(["X"], [], ["L"], ["D"], ["2026-11-19"], [1], ["Citizen"], [""]))
      .to.be.revertedWithCustomError(registry, "InvalidArrayLengths");
    await expect(registry.batchCreateIssues([], [], [], [], [], [], [], []))
      .to.be.revertedWithCustomError(registry, "EmptyBatch");
    const tooMany = Array.from({ length: 16 }, (_, index) => issue(`TOO-MANY-${index}`));
    await expect(registry.batchCreateIssues(
      tooMany.map((row) => row.issueId),
      tooMany.map((row) => row.issueType),
      tooMany.map((row) => row.location),
      tooMany.map((row) => row.description),
      tooMany.map((row) => row.reportDate),
      tooMany.map((row) => row.priority),
      tooMany.map((row) => row.reportedBy),
      tooMany.map(() => "")
    )).to.be.revertedWithCustomError(registry, "BatchTooLarge").withArgs(16, 15);
    await expect(registry.connect(other).batchCreateIssues([], [], [], [], [], [], [], []))
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    await expect(registry.assignIssue(1, " ", "Assign team"))
      .to.be.revertedWithCustomError(registry, "EmptyRequiredField");
    await expect(registry.assignIssue(2, "UrbanTeam01", ""))
      .to.be.revertedWithCustomError(registry, "InvalidComment");
    await expect(registry.updateStatus(2, 1, " ")).to.be.revertedWithCustomError(registry, "InvalidComment");
  });

  it("provides reference lookups and reverts on missing records", async function () {
    const { registry, citizen } = await deployRegistry();
    const row = issue("LOOKUP-1");
    await registry.connect(citizen).createIssue(
      row.issueId, row.issueType, row.location, row.description, row.reportDate, row.priority, row.reportedBy
    );
    expect(await registry.getIdByRef(row.issueId)).to.equal(1);
    expect((await registry.getIssueByRef(row.issueId)).issueId).to.equal(row.issueId);
    await expect(registry.getIssue(0)).to.be.revertedWithCustomError(registry, "IssueNotFound");
    await expect(registry.getIssue(2)).to.be.revertedWithCustomError(registry, "IssueNotFound");
    await expect(registry.getHistory(2)).to.be.revertedWithCustomError(registry, "IssueNotFound");
    await expect(registry.getIssueByRef("MISSING")).to.be.revertedWithCustomError(registry, "IssueRefNotFound");
  });

  it("restricts role administration and permits admin grants", async function () {
    const { registry, other, municipal } = await deployRegistry();
    const role = await registry.MUNICIPAL_ROLE();
    await expect(registry.connect(other).grantRole(role, municipal.address))
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    await expect(registry.grantRole(role, municipal.address)).to.emit(registry, "RoleGranted");
    expect(await registry.hasRole(role, municipal.address)).to.equal(true);
    await expect(registry.connect(municipal).batchCreateIssues([], [], [], [], [], [], [], []))
      .to.be.revertedWithCustomError(registry, "EmptyBatch");
    await expect(registry.connect(other).revokeRole(role, municipal.address))
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    await expect(registry.revokeRole(role, municipal.address)).to.emit(registry, "RoleRevoked");
    expect(await registry.hasRole(role, municipal.address)).to.equal(false);
  });

  it("reports gas for batches of 5, 10, and 15 issues", async function () {
    const { registry } = await deployRegistry();
    for (const count of [5, 10, 15]) {
      const receipt = await (await batchCreate(registry, count, `GAS-${count}`)).wait();
      console.log(`  batchCreateIssues(${count}) gas used: ${receipt!.gasUsed.toString()}`);
    }
  });
});