
import { ethers } from "ethers";
import "dotenv/config";
import fs from "node:fs";
import assert from "node:assert/strict";

// =========================================
// TC-09: TEST URL BEHAVIOR WITH MISSING
// AND INVALID BATCH IDS
// =========================================

// =========================================
// 1. BLOCKCHAIN CONNECTION CONFIGURATION
// =========================================

const RPC_URL =
  process.env.SEPOLIA_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";

const ADDRESS = process.env.CONTRACT_ADDRESS;

if (!ADDRESS || !ethers.isAddress(ADDRESS)) {
  throw new Error(
    "Invalid CONTRACT_ADDRESS in the .env file"
  );
}

const provider = new ethers.JsonRpcProvider(RPC_URL);

// Smart contract ABI
const abi = [
  "function batchCount() view returns(uint256)",
  "function getBatch(uint256) view returns(tuple(uint256 id,string name,string productionDate,string factory,string ipfsHash,uint8 status))"
];

const contract = new ethers.Contract(
  ADDRESS,
  abi,
  provider
);

// English labels corresponding to the
// four MilkTrace batch status codes.
const statuses = [
  "Created",
  "Checked",
  "Approved",
  "Distributed"
];

// =========================================
// 2. EXPERIMENTAL RESULT FILE
// =========================================

const runId = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");

const resultPath = `results/TC09-${runId}.json`;

const report = {
  testCase: "TC-09",
  contractAddress: ADDRESS,
  network: "Ethereum Sepolia",
  timestampUtc: new Date().toISOString(),
  method: "eth_call + manual UI verification",
  status: "IN_PROGRESS",
  checks: []
};

// Save experimental evidence to a JSON file.
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

// =========================================
// 3. VERIFY INVALID BATCH ID HANDLING
// =========================================

// Verify that getBatch rejects invalid IDs
// with the expected EVM revert reason.
async function checkInvalidId(id) {
  let caught = null;

  try {
    await contract.getBatch(id);
  } catch (error) {
    caught = error;
  }

  // The contract must reject the invalid ID.
  assert.ok(
    caught,
    `Batch ID ${id} was not rejected`
  );

  // Accept only an EVM revert.
  // Network or RPC errors must not count as PASS.
  assert.ok(
    ethers.isError(caught, "CALL_EXCEPTION"),
    `Batch ID ${id}: Error is not an EVM revert`
  );

  // Verify the exact revert reason.
  assert.equal(
    caught.reason,
    "Invalid ID",
    `Batch ID ${id}: Unexpected revert reason`
  );

  // Record the successful negative test.
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
    `Batch ID=${id}: PASS - ${caught.reason}`
  );
}

// =========================================
// 4. MAIN TEST PROCEDURE
// =========================================

async function main() {
  save();

  try {
    // 4.1. Verify the Ethereum Sepolia network.
    const network = await provider.getNetwork();

    assert.equal(
      network.chainId,
      11155111n,
      "The RPC endpoint is not connected to Ethereum Sepolia"
    );

    // Verify that a smart contract exists
    // at the configured address.
    const code = await provider.getCode(ADDRESS);

    assert.notEqual(
      code,
      "0x",
      "No smart contract exists at the specified address"
    );

    console.log("===== STARTING TC-09 =====");
    console.log("Contract address:", ADDRESS);

    // =========================================
    // TEST CASE 1: URL WITHOUT A BATCH ID
    // =========================================

    // When no batch ID is specified in the URL,
    // the MilkTrace website should display
    // the most recently created batch.
    const count = await contract.batchCount();

    // At least four batches must exist:
    // three from TC-02 and one from TC-06.
    assert.ok(
      count >= 4n,
      "At least four batches must exist before executing TC-09"
    );

    // Retrieve the most recently created batch.
    const newest = await contract.getBatch(count);

    assert.equal(
      newest.id,
      count,
      "The latest batch ID does not match batchCount"
    );

    // Convert the on-chain status code
    // into its corresponding English label.
    const expectedStatus =
      statuses[Number(newest.status)] ??
      "Unknown";

    report.batchCount = count.toString();

    // Record the expected website display.
    // Manual UI verification is still required.
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

    console.log("\n===== TEST CASE 1: URL WITHOUT ID =====");

    console.log(
      "Current batch count:",
      count.toString()
    );

    console.log(
      "Latest batch ID:",
      newest.id.toString()
    );

    console.log("Product name:", newest.name);
    console.log("Expected status:", expectedStatus);

    console.log(
      "Open: http://localhost:8080/index.html"
    );

    // =========================================
    // TEST CASE 2: URL WITH BATCH ID = 0
    // =========================================

    // Batch ID 0 is invalid because
    // valid MilkTrace batch IDs start from 1.
    console.log("\n===== TEST CASE 2: BATCH ID = 0 =====");

    await checkInvalidId(0n);

    console.log(
      "Open: http://localhost:8080/index.html?id=0"
    );

    // =========================================
    // TEST CASE 3: URL WITH OUT-OF-RANGE ID
    // =========================================

    // Generate an invalid ID greater than
    // the current number of batches.
    const invalidHighId = count + 1n;

    console.log(
      "\n===== TEST CASE 3: BATCH ID EXCEEDS BATCH COUNT ====="
    );

    await checkInvalidId(invalidHighId);

    console.log(
      `Open: http://localhost:8080/index.html?id=${invalidHighId}`
    );

    // =========================================
    // 5. RECORD ON-CHAIN TEST RESULTS
    // =========================================

    // The blockchain checks have passed,
    // but manual website verification
    // and screenshot evidence are still required.
    report.status = "ONCHAIN_PASS_UI_PENDING";

    report.expectedInvalidHighId =
      invalidHighId.toString();

    save();

    console.log(
      "\n===== TC-09 ON-CHAIN VERIFICATION: PASS ====="
    );

    console.log(
      "Open the three test URLs and capture screenshots of their displayed results."
    );

    console.log(
      "TC-09 is not fully passed until manual UI verification is completed."
    );

    console.log(
      "Experimental results saved to:",
      resultPath
    );

  } catch (error) {
    report.status = "FAIL_OR_INCOMPLETE";
    report.error = error.message;

    save();

    console.error(
      "TC-09 FAILED OR INCOMPLETE:",
      error.message
    );

    process.exitCode = 1;
  }
}

main();
