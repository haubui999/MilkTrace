
import { ethers } from "ethers";
import "dotenv/config";
import fs from "node:fs";
import assert from "node:assert/strict";

// ===================================
// 1. BLOCKCHAIN CONNECTION CONFIGURATION
// ===================================

const RPC_URL =
  process.env.SEPOLIA_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";

const ADDRESS = process.env.CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// Batch 2 was created during TC-02.
// Its initial status must be Created (0).
const BATCH_ID = 2n;
const NOTE = "WEB_TC8";

if (
  !ADDRESS ||
  !ethers.isAddress(ADDRESS) ||
  !PRIVATE_KEY
) {
  throw new Error(
    "Missing PRIVATE_KEY or a valid CONTRACT_ADDRESS in the .env file"
  );
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// Smart contract ABI
const abi = [
  "function qualityLab() view returns(address)",
  "function getBatch(uint256) view returns(tuple(uint256 id,string name,string productionDate,string factory,string ipfsHash,uint8 status))",
  "function updateStatus(uint256,uint8,string)",
  "event StatusUpdated(uint256 indexed id,uint8 newStatus,string note)"
];

const contract = new ethers.Contract(
  ADDRESS,
  abi,
  wallet
);

// ===================================
// 2. EXPERIMENTAL RESULT FILE
// ===================================

const runId = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");

const resultPath = `results/TC08-${runId}.json`;

const report = {
  testCase: "TC-08",
  status: "NOT_STARTED",
  contractAddress: ADDRESS,
  chainIdExpected: 11155111,
  batchId: BATCH_ID.toString(),
  note: NOTE,
  timestampUtc: new Date().toISOString(),
  transaction: null,
  uiVerification: "PENDING_MANUAL_SCREENSHOTS"
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

// Convert on-chain batch data into
// a JSON-serializable object.
function fields(batch) {
  return {
    id: batch.id.toString(),
    name: batch.name,
    productionDate: batch.productionDate,
    factory: batch.factory,
    ipfsHash: batch.ipfsHash,
    status: batch.status.toString()
  };
}

// ===================================
// 3. MAIN TEST PROCEDURE
// ===================================

async function main() {
  save();

  try {
    // 3.1. Verify the Ethereum Sepolia network.
    const net = await provider.getNetwork();

    assert.equal(
      net.chainId,
      11155111n,
      "The RPC endpoint is not connected to Ethereum Sepolia"
    );

    // Verify that a smart contract exists
    // at the configured address.
    assert.notEqual(
      await provider.getCode(ADDRESS),
      "0x",
      "No smart contract exists at the specified address"
    );

    // 3.2. Verify qualityLab authorization.
    const lab = await contract.qualityLab();

    assert.equal(
      lab.toLowerCase(),
      wallet.address.toLowerCase(),
      "The connected wallet is not the authorized quality laboratory"
    );

    // 3.3. Read Batch 2 before updating its status.
    const before = await contract.getBatch(BATCH_ID);

    report.before = fields(before);
    save();

    assert.equal(before.id, BATCH_ID);

    // Batch 2 must still be in Created (0).
    // Do not rerun if its status has already changed.
    assert.equal(
      before.status,
      0n,
      "Batch 2 is no longer in Created (0). Do not rerun this test!"
    );

    console.log("===== STARTING TC-08 =====");
    console.log("Contract address:", ADDRESS);
    console.log("Batch ID:", BATCH_ID.toString());
    console.log("Initial status: Created (0)");
    console.log("Product name:", before.name);

    // ===================================
    // 4. SUBMIT STATUS UPDATE (0 -> 1)
    // ===================================

    // Record the transaction start time.
    const startUtc = new Date().toISOString();
    const t0 = performance.now();

    // Update Batch 2 from Created to Checked.
    const tx = await contract.updateStatus(
      BATCH_ID,
      1,
      NOTE
    );

    // Record when the transaction hash is received.
    const t1 = performance.now();

    report.transaction = {
      transactionHash: tx.hash,
      status: "SENT",
      startUtc,
      hashReceivedUtc: new Date().toISOString()
    };

    save();

    console.log("Transaction hash:", tx.hash);
    console.log("Waiting for transaction confirmation...");

    // Wait for one blockchain confirmation.
    const receipt = await tx.wait(1);
    const t2 = performance.now();

    assert.ok(
      receipt,
      "Transaction receipt was not received"
    );

    // Record transaction status, gas consumption,
    // transaction fee, and client-observed latency.
    Object.assign(report.transaction, {
      status:
        receipt.status === 1
          ? "CONFIRMED"
          : "FAILED",

      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),

      totalSeconds:
        (t2 - t0) / 1000,

      timeToHashSeconds:
        (t1 - t0) / 1000,

      waitForReceiptSeconds:
        (t2 - t1) / 1000,

      gasPriceWei:
        receipt.gasPrice?.toString() ?? null,

      feeWei:
        receipt.gasPrice != null
          ? (
              receipt.gasUsed *
              receipt.gasPrice
            ).toString()
          : null
    });

    save();

    // Verify successful transaction execution.
    assert.equal(
      receipt.status,
      1,
      "The status update transaction failed"
    );

    // ===================================
    // 5. VERIFY THE StatusUpdated EVENT
    // ===================================

    // Find the StatusUpdated event
    // emitted by the MilkTrace contract.
    const event = receipt.logs
      .filter(
        log =>
          log.address.toLowerCase() ===
          ADDRESS.toLowerCase()
      )
      .map(log => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find(
        ev => ev?.name === "StatusUpdated"
      );

    assert.ok(
      event,
      "StatusUpdated event was not found"
    );

    // Verify the event parameters.
    assert.equal(event.args[0], BATCH_ID);
    assert.equal(event.args[1], 1n);
    assert.equal(event.args[2], NOTE);

    // ===================================
    // 6. VERIFY UPDATED ON-CHAIN BATCH DATA
    // ===================================

    // Measure the time required to retrieve
    // updated batch data from the blockchain.
    const readStart = performance.now();

    const after = await contract.getBatch(BATCH_ID);

    report.transaction.getBatchSeconds =
      (performance.now() - readStart) / 1000;

    report.after = fields(after);

    // Verify the new status: Checked (1).
    assert.equal(after.status, 1n);

    // Verify that all other batch attributes
    // remain unchanged after the status update.
    for (const key of [
      "id",
      "name",
      "productionDate",
      "factory",
      "ipfsHash"
    ]) {
      assert.equal(
        report.after[key],
        report.before[key],
        `${key} was unexpectedly modified`
      );
    }

    // ===================================
    // 7. SAVE ORIGINAL TRANSACTION RECEIPT
    // ===================================

    // Retrieve the raw blockchain transaction receipt.
    const rawReceipt = await provider.send(
      "eth_getTransactionReceipt",
      [tx.hash]
    );

    // Save the original receipt for reproducibility.
    fs.writeFileSync(
      `results/TC08-receipt-${runId}.json`,
      JSON.stringify(rawReceipt, null, 2),
      "utf8"
    );

    // ===================================
    // 8. RECORD ON-CHAIN TEST RESULTS
    // ===================================

    // Do not mark TC-08 as fully passed yet.
    // Manual verification of the website interface
    // and screenshot evidence are still required.
    report.status = "ONCHAIN_PASS_UI_PENDING";
    save();

    console.log(
      "On-chain transaction, event, and data verification: PASS"
    );

    console.log(
      "Gas used:",
      report.transaction.gasUsed
    );

    console.log(
      "Total transaction latency:",
      report.transaction.totalSeconds.toFixed(3),
      "seconds"
    );

    console.log(
      "Updated batch status: Checked (1)"
    );

    console.log(
      "Refresh the MilkTrace webpage using ?id=2 and capture screenshots."
    );

    console.log(
      "TC-08 is considered fully passed only after manual UI verification."
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
      "TC-08 FAILED OR INCOMPLETE:",
      error.message
    );

    console.error(
      "If a transaction hash exists, inspect its on-chain receipt before rerunning this test."
    );

    process.exitCode = 1;
  }
}

main();
