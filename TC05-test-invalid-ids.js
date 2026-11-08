
import { ethers } from "ethers";
import "dotenv/config";
import fs from "node:fs";
import assert from "node:assert/strict";

// ========================================
// 1. BLOCKCHAIN CONNECTION CONFIGURATION
// ========================================

const RPC_URL =
  process.env.SEPOLIA_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";

const ADDRESS = process.env.CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY || !ADDRESS || !ethers.isAddress(ADDRESS)) {
  throw new Error(
    "Missing or invalid PRIVATE_KEY or CONTRACT_ADDRESS in the .env file"
  );
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// Smart contract ABI
const abi = [
  "function qualityLab() view returns (address)",
  "function batchCount() view returns (uint256)",
  "function updateStatus(uint256,uint8,string)",
  "function getBatch(uint256) view returns (tuple(uint256 id,string name,string productionDate,string factory,string ipfsHash,uint8 status))"
];

const contract = new ethers.Contract(
  ADDRESS,
  abi,
  wallet
);

// ========================================
// 2. EXPERIMENTAL RESULT FILE
// ========================================

const runId = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");

const output = `results/TC05-${runId}.json`;

const report = {
  testCase: "TC-05",
  status: "IN_PROGRESS",
  timestampUtc: new Date().toISOString(),
  network: "Ethereum Sepolia",
  contractAddress: ADDRESS,
  walletAddress: wallet.address,
  method: "eth_call (no transaction broadcast)",
  cases: []
};

// Save experimental results to a JSON file.
function save() {
  fs.mkdirSync("results", {
    recursive: true
  });

  fs.writeFileSync(
    output,
    JSON.stringify(report, null, 2),
    "utf8"
  );
}

// ========================================
// 3. CAPTURE THE CONTRACT STATE
// ========================================

// Read the contract state before and after
// the invalid batch ID tests.
async function snapshot() {
  const [count, lab, batch1, batch2] =
    await Promise.all([
      contract.batchCount(),
      contract.qualityLab(),
      contract.getBatch(1n),
      contract.getBatch(2n)
    ]);

  return {
    batchCount: count.toString(),
    qualityLab: lab,
    batch1Status: batch1.status.toString(),
    batch2Status: batch2.status.toString()
  };
}

// ========================================
// 4. VERIFY EVM REVERT BEHAVIOR
// ========================================

// Verify that calls using invalid batch IDs
// are rejected with the expected revert reason.
async function expectRevert(
  name,
  expectedReason,
  operation
) {
  const started = performance.now();

  let caught = null;

  try {
    await operation();
  } catch (error) {
    caught = error;
  }

  // If the operation succeeds despite an invalid ID,
  // the test must fail.
  assert.ok(
    caught,
    `${name}: The operation succeeded despite an invalid batch ID`
  );

  // Accept only an EVM revert (CALL_EXCEPTION).
  // RPC or network failures must not be classified as PASS.
  assert.ok(
    ethers.isError(caught, "CALL_EXCEPTION"),
    `${name}: Error is not an EVM revert (code: ${caught.code ?? "unknown"})`
  );

  const actualReason =
    caught.reason ??
    caught.revert?.args?.[0] ??
    null;

  // Verify that the actual revert reason
  // exactly matches the expected reason.
  assert.equal(
    actualReason,
    expectedReason,
    `${name}: Revert reason does not match the expected value`
  );

  // Record the successful negative test.
  const row = {
    name,
    status: "PASS",
    expectedReason,
    actualReason,
    observedCallSeconds:
      (performance.now() - started) / 1000,
    transactionHash: null,
    onchainGasUsed: null
  };

  report.cases.push(row);
  save();

  console.log(`${name}: PASS`);
  console.log(`  Revert reason: ${actualReason}`);
}

// ========================================
// 5. EXECUTE TC-05
// ========================================

async function main() {
  save();

  try {
    // 5.1. Verify the Ethereum Sepolia network.
    const net = await provider.getNetwork();

    assert.equal(
      net.chainId,
      11155111n,
      "The RPC endpoint is not connected to Ethereum Sepolia"
    );

    // 5.2. Capture the initial contract state.
    const before = await snapshot();

    // Verify that three batches were created during TC-02.
    assert.ok(
      BigInt(before.batchCount) >= 3n,
      "At least three batches from TC-02 must exist"
    );

    // Confirm that the connected wallet has qualityLab
    // authorization so that authorization errors
    // are not confused with invalid ID errors.
    assert.equal(
      before.qualityLab.toLowerCase(),
      wallet.address.toLowerCase(),
      "The connected wallet is not the authorized quality laboratory"
    );

    // Calculate an invalid batch ID based
    // on the current on-chain batch count.
    const invalidHighId =
      BigInt(before.batchCount) + 1n;

    report.before = before;

    report.invalidHighId =
      invalidHighId.toString();

    save();

    console.log("===== STARTING TC-05 =====");
    console.log("Contract address:", ADDRESS);
    console.log("Current batch count:", before.batchCount);
    console.log(
      "Out-of-range batch ID:",
      invalidHighId.toString()
    );

    console.log(
      "Only eth_call/staticCall is used. No transactions will be broadcast."
    );

    // ----------------------------------------
    // TEST CASE 1: updateStatus WITH ID = 0
    // ----------------------------------------

    await expectRevert(
      "updateStatus(ID=0)",
      "Invalid batch ID",
      () =>
        contract.updateStatus.staticCall(
          0n,
          1,
          "INVALID"
        )
    );

    // ----------------------------------------
    // TEST CASE 2: updateStatus WITH ID > batchCount
    // ----------------------------------------

    await expectRevert(
      `updateStatus(ID=${invalidHighId})`,
      "Invalid batch ID",
      () =>
        contract.updateStatus.staticCall(
          invalidHighId,
          1,
          "INVALID"
        )
    );

    // ----------------------------------------
    // TEST CASE 3: getBatch WITH ID = 0
    // ----------------------------------------

    await expectRevert(
      "getBatch(ID=0)",
      "Invalid ID",
      () => contract.getBatch(0n)
    );

    // ----------------------------------------
    // TEST CASE 4: getBatch WITH ID > batchCount
    // ----------------------------------------

    await expectRevert(
      `getBatch(ID=${invalidHighId})`,
      "Invalid ID",
      () => contract.getBatch(invalidHighId)
    );

    // ========================================
    // 6. VERIFY CONTRACT STATE IMMUTABILITY
    // ========================================

    // Capture the contract state after all tests.
    const after = await snapshot();

    // Verify that invalid ID calls did not modify
    // any monitored smart contract state.
    assert.deepEqual(
      after,
      before,
      "The contract state changed after invalid ID tests"
    );

    report.after = after;
    report.status = "PASS";

    save();

    console.log(
      "Contract state unchanged before and after testing: PASS"
    );

    console.log("===== TC-05 PASS =====");
    console.log("Experimental results saved to:", output);

  } catch (error) {
    report.status = "FAIL_OR_INCOMPLETE";
    report.error = error.message;

    save();

    console.error(
      "TC-05 FAILED OR INCOMPLETE:",
      error.message
    );

    process.exitCode = 1;
  }
}

main();
