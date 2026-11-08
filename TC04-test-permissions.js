
import { ethers } from "ethers";
import "dotenv/config";
import fs from "node:fs";
import assert from "node:assert/strict";

// =====================================
// 1. BLOCKCHAIN CONNECTION CONFIGURATION
// =====================================

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

// Generate a random unauthorized wallet.
// No ETH is required because the tests use staticCall.
const stranger =
  ethers.Wallet.createRandom().connect(provider);

// Smart contract ABI
const abi = [
  "function owner() view returns(address)",
  "function qualityLab() view returns(address)",
  "function batchCount() view returns(uint256)",
  "function getBatch(uint256) view returns(tuple(uint256 id,string name,string productionDate,string factory,string ipfsHash,uint8 status))",
  "function createBatch(string,string,string,string)",
  "function updateStatus(uint256,uint8,string)",
  "function setQualityLab(address)"
];

const contract = new ethers.Contract(
  ADDRESS,
  abi,
  stranger
);

// =====================================
// 2. EXPERIMENTAL RESULT FILE
// =====================================

const runId = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");

const outfile = `results/TC04-${runId}.json`;

const report = {
  testCase: "TC-04",
  network: "Sepolia",
  contractAddress: ADDRESS,
  unauthorizedWallet: stranger.address,
  method: "eth_call/staticCall",
  status: "IN_PROGRESS",
  timestampUtc: new Date().toISOString(),
  cases: []
};

// Save experimental results to a JSON file.
function save() {
  fs.mkdirSync("results", {
    recursive: true
  });

  fs.writeFileSync(
    outfile,
    JSON.stringify(report, null, 2),
    "utf8"
  );
}

// =====================================
// 3. CAPTURE THE SMART CONTRACT STATE
// =====================================

// Read the contract state before and after
// the unauthorized access tests.
async function snapshot() {
  const [owner, lab, count, batch2] =
    await Promise.all([
      contract.owner(),
      contract.qualityLab(),
      contract.batchCount(),
      contract.getBatch(2n)
    ]);

  return {
    owner,
    qualityLab: lab,
    batchCount: count.toString(),
    batch2Status: batch2.status.toString(),
    batch2Name: batch2.name
  };
}

// =====================================
// 4. VERIFY EVM REVERT BEHAVIOR
// =====================================

// Confirm that unauthorized function calls
// are rejected with the expected revert reason.
async function testRevert(
  name,
  expected,
  call
) {
  const start = performance.now();

  let caught;

  try {
    await call();
  } catch (error) {
    caught = error;
  }

  // If the function succeeds instead of reverting,
  // the test must fail.
  if (!caught) {
    throw new Error(
      `${name}: Call was not rejected - TEST FAILED`
    );
  }

  // Accept only an EVM revert (CALL_EXCEPTION).
  // Network or RPC errors must not be treated
  // as successful authorization tests.
  if (!ethers.isError(caught, "CALL_EXCEPTION")) {
    throw new Error(
      `${name}: Error is not an EVM revert, code=${caught.code || "unknown"}`
    );
  }

  const actual =
    caught.reason ??
    caught.revert?.args?.[0] ??
    null;

  // Verify that the actual revert reason
  // exactly matches the expected reason.
  assert.equal(
    actual,
    expected,
    `${name}: Revert reason does not match the expected value`
  );

  // Record the successful negative test result.
  report.cases.push({
    function: name,
    expectedReason: expected,
    actualReason: actual,
    status: "PASS",
    durationSeconds:
      (performance.now() - start) / 1000,
    transactionHash: null,
    onchainGasUsed: null
  });

  save();

  console.log(`${name}: PASS`);
  console.log(`  Revert reason: ${actual}`);
}

// =====================================
// 5. EXECUTE TC-04
// =====================================

async function main() {
  save();

  try {
    // 5.1. Verify the Ethereum Sepolia network
    const network = await provider.getNetwork();

    assert.equal(
      network.chainId,
      11155111n,
      "The RPC endpoint is not connected to Ethereum Sepolia"
    );

    // 5.2. Capture the initial contract state
    const before = await snapshot();

    // Verify that the randomly generated wallet
    // is neither the contract owner nor the quality lab.
    assert.notEqual(
      stranger.address.toLowerCase(),
      before.owner.toLowerCase()
    );

    assert.notEqual(
      stranger.address.toLowerCase(),
      before.qualityLab.toLowerCase()
    );

    // Verify that Batch 2 was created during TC-02.
    assert.ok(
      BigInt(before.batchCount) >= 2n,
      "Batch 2 from TC-02 must exist before executing TC-04"
    );

    report.before = before;

    console.log("===== STARTING TC-04 =====");
    console.log("Contract address:", ADDRESS);
    console.log(
      "Unauthorized wallet address:",
      stranger.address
    );

    console.log(
      "No transactions will be broadcast. All permission tests use staticCall."
    );

    // ---------------------------------
    // TEST CASE 1: UNAUTHORIZED BATCH CREATION
    // ---------------------------------

    // An unauthorized wallet attempts to create
    // a new milk batch.
    await testRevert(
      "createBatch",
      "Not authorized: only owner",
      () =>
        contract.createBatch.staticCall(
          "FRESH_MILK_1L",
          "2026-10-31",
          "DEMO",
          "CID_DEMO"
        )
    );

    // ---------------------------------
    // TEST CASE 2: UNAUTHORIZED STATUS UPDATE
    // ---------------------------------

    // An unauthorized wallet attempts to update
    // the status of Batch 2.
    await testRevert(
      "updateStatus",
      "Not authorized: only quality lab",
      () =>
        contract.updateStatus.staticCall(
          2n,
          1,
          "UNAUTHORIZED"
        )
    );

    // ---------------------------------
    // TEST CASE 3: UNAUTHORIZED ROLE ASSIGNMENT
    // ---------------------------------

    // An unauthorized wallet attempts to change
    // the authorized quality laboratory address.
    await testRevert(
      "setQualityLab",
      "Not authorized: only owner",
      () =>
        contract.setQualityLab.staticCall(
          stranger.address
        )
    );

    // ---------------------------------
    // 6. VERIFY CONTRACT STATE IMMUTABILITY
    // ---------------------------------

    // Capture the contract state after all tests.
    const after = await snapshot();

    // Verify that unauthorized calls did not
    // modify the smart contract state.
    assert.deepEqual(
      after,
      before,
      "The smart contract state changed after unauthorized calls"
    );

    report.after = after;
    report.status = "PASS";

    save();

    console.log(
      "Contract state unchanged before and after testing: PASS"
    );

    console.log("===== TC-04 PASS =====");
    console.log("Experimental results saved to:", outfile);

  } catch (error) {
    report.status = "FAIL_OR_INCOMPLETE";
    report.error = error.message;

    save();

    console.error(
      "TC-04 FAILED OR INCOMPLETE:",
      error.message
    );

    process.exitCode = 1;
  }
}

main();
