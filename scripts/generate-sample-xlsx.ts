import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

const columns = ["issueId", "issueType", "location", "description", "reportDate", "priority", "reportedBy", "assignedTo", "status"];
const types = ["StreetLight", "Pothole", "WasteCollection", "WaterLeak", "TrafficLight", "BrokenSidewalk"];
const streets = ["Avenue Mohammed V", "Rue des Orangers", "Place Al Amal", "Boulevard Atlas", "Rue des Jardins", "Avenue des Palmiers"];
const validRows = Array.from({ length: 15 }, (_, index) => {
  const assignedTo = index % 3 === 0 ? "" : `UrbanTeam${String((index % 4) + 1).padStart(2, "0")}`;
  return {
    issueId: `CITY-2026-${String(index + 1).padStart(3, "0")}`,
    issueType: types[index % types.length],
    location: `${streets[index % streets.length]}, Ville Fictive`,
    description: [
      "Signalement fictif : équipement urbain à inspecter.",
      "Dégradation simulée nécessitant une intervention municipale.",
      "Demande citoyenne de démonstration, sans donnée personnelle."
    ][index % 3],
    reportDate: `2026-11-${String((index % 19) + 1).padStart(2, "0")}`,
    priority: ["Low", "Medium", "High", "Critical"][index % 4],
    reportedBy: `Citizen${String(index + 1).padStart(2, "0")}`,
    assignedTo,
    status: assignedTo ? "Assigned" : "Reported"
  };
});

function writeWorkbook(filename: string, rows: object[]) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows, { header: columns });
  XLSX.utils.book_append_sheet(workbook, sheet, "Signalements");
  const filePath = path.join(__dirname, "..", "sample-data", filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  XLSX.writeFile(workbook, filePath);
  console.log(`Generated ${filePath}`);
}

writeWorkbook("urban_issues.xlsx", validRows);
const csvPath = path.join(__dirname, "..", "sample-data", "urban_issues.csv");
fs.writeFileSync(csvPath, `${XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(validRows, { header: columns }))}\n`, "utf8");
console.log(`Generated ${csvPath}`);

const invalidRows = [
  validRows[0],
  { ...validRows[1], description: "" },
  { ...validRows[2], reportDate: "31/11/2026" },
  { ...validRows[3], priority: "Urgent" },
  { ...validRows[4], status: "InProgress" },
  { ...validRows[5], issueId: validRows[0].issueId },
  { ...validRows[6], assignedTo: "", status: "Assigned" },
  { ...validRows[7], description: "x".repeat(501) }
];
writeWorkbook("urban_issues_invalide.xlsx", invalidRows);
