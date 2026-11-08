
import { ethers } from "ethers";
import "dotenv/config";
import fs from "node:fs";
import assert from "node:assert/strict";

// =========================================
// TC-09: KIEM TRA URL KHONG CO ID
// VA URL CO ID KHONG HOP LE
// =========================================

// 1. CAU HINH
const RPC_URL =
  process.env.SEPOLIA_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";

const ADDRESS = process.env.CONTRACT_ADDRESS;

if (!ADDRESS || !ethers.isAddress(ADDRESS)) {
  throw new Error(
    "CONTRACT_ADDRESS trong .env khong hop le"
  );
}

const provider = new ethers.JsonRpcProvider(RPC_URL);

const abi = [
  "function batchCount() view returns(uint256)",
  "function getBatch(uint256) view returns(tuple(uint256 id,string name,string productionDate,string factory,string ipfsHash,uint8 status))"
];

const contract = new ethers.Contract(
  ADDRESS,
  abi,
  provider
);

const statuses = [
  "Moi khoi tao",
  "Da kiem dinh",
  "Da phe duyet",
  "Da phan phoi"
];

// 2. FILE KET QUA
const runId = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");

const resultPath = `results/TC09-${runId}.json`;

const report = {
  testCase: "TC-09",
  contractAddress: ADDRESS,
  network: "Ethereum Sepolia",
  timestampUtc: new Date().toISOString(),
  method: "eth_call + kiem tra giao dien thu cong",
  status: "IN_PROGRESS",
  checks: []
};

function save() {
  fs.mkdirSync("results", {
    recursive: true
  });

  fs.writeFileSync(
    resultPath,
    JSON.stringify(report, null, 2),
    "utf8"
  );
}

// 3. KIEM TRA ID KHONG HOP LE
async function checkInvalidId(id) {
  let caught = null;

  try {
    await contract.getBatch(id);
  } catch (error) {
    caught = error;
  }

  assert.ok(
    caught,
    `ID ${id} khong bi tu choi`
  );

  assert.ok(
    ethers.isError(caught, "CALL_EXCEPTION"),
    `ID ${id}: Loi khong phai EVM revert`
  );

  assert.equal(
    caught.reason,
    "Invalid ID",
    `ID ${id}: Sai revert reason`
  );

  report.checks.push({
    type: "INVALID_ID",
    batchId: id.toString(),
    status: "PASS",
    revertReason: caught.reason,
    onchainGasUsed: null,
    transactionHash: null
  });

  save();

  console.log(
    `ID=${id}: PASS - ${caught.reason}`
  );
}

// 4. CHAY KIEM THU
async function main() {
  save();

  try {
    const network = await provider.getNetwork();

    assert.equal(
      network.chainId,
      11155111n,
      "RPC khong phai Sepolia"
    );

    const code = await provider.getCode(ADDRESS);

    assert.notEqual(
      code,
      "0x",
      "Khong co contract tai dia chi nay"
    );

    console.log("===== BAT DAU TC-09 =====");
    console.log("Contract:", ADDRESS);

    // ---------------------------------
    // TH1: KHONG CO ID
    // ---------------------------------

    const count = await contract.batchCount();

    assert.ok(
      count >= 4n,
      "Khong du 4 lo tu TC-01 den TC-08"
    );

    const newest = await contract.getBatch(count);

    assert.equal(
      newest.id,
      count,
      "ID lo moi nhat khong khop batchCount"
    );

    const expectedStatus =
      statuses[Number(newest.status)] ??
      "Khong xac dinh";

    report.batchCount = count.toString();

    report.checks.push({
      type: "NO_ID",
      status: "ONCHAIN_PASS_UI_PENDING",
      expectedBatchId: count.toString(),
      expectedName: newest.name,
      expectedProductionDate: newest.productionDate,
      expectedFactory: newest.factory,
      expectedStatusCode:
        newest.status.toString(),
      expectedStatusText: expectedStatus
    });

    save();

    console.log("\n===== TH1: URL KHONG CO ID =====");
    console.log(
      "BatchCount:",
      count.toString()
    );
    console.log(
      "Lo moi nhat:",
      newest.id.toString()
    );
    console.log("San pham:", newest.name);
    console.log("Trang thai:", expectedStatus);

    console.log(
      "Mo: http://localhost:8080/index.html"
    );

    // ---------------------------------
    // TH2: ID = 0
    // ---------------------------------

    console.log("\n===== TH2: ID = 0 =====");

    await checkInvalidId(0n);

    console.log(
      "Mo: http://localhost:8080/index.html?id=0"
    );

    // ---------------------------------
    // TH3: ID > BATCHCOUNT
    // ---------------------------------

    const invalidHighId = count + 1n;

    console.log(
      "\n===== TH3: ID VUOT BATCHCOUNT ====="
    );

    await checkInvalidId(invalidHighId);

    console.log(
      `Mo: http://localhost:8080/index.html?id=${invalidHighId}`
    );

    report.status = "ONCHAIN_PASS_UI_PENDING";
    report.expectedInvalidHighId =
      invalidHighId.toString();

    save();

    console.log(
      "\n===== KIEM TRA ONCHAIN TC-09: PASS ====="
    );

    console.log(
      "Can mo 3 URL va chup anh giao dien."
    );

    console.log(
      "TC-09 chua PASS hoan toan neu chua kiem tra UI."
    );

    console.log("Da luu:", resultPath);

  } catch (error) {
    report.status = "FAIL_OR_INCOMPLETE";
    report.error = error.message;

    save();

    console.error(
      "TC-09 chua dat:",
      error.message
    );

    process.exitCode = 1;
  }
}

main();
