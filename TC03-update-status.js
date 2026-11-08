
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

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// Batch 1 is created during TC-02
const BATCH_ID = 1n;

if (!PRIVATE_KEY || !CONTRACT_ADDRESS) {
  throw new Error(
    "Missing PRIVATE_KEY or CONTRACT_ADDRESS in .env"
  );
}

if (!ethers.isAddress(CONTRACT_ADDRESS)) {
  throw new Error("Invalid CONTRACT_ADDRESS");
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// ABI of the MilkTrace smart contract
const abi = [
  "function qualityLab() view returns (address)",
  "function batchCount() view returns (uint256)",
  "function getBatch(uint256) view returns (tuple(uint256 id,string name,string productionDate,string factory,string ipfsHash,uint8 status))",
  "function updateStatus(uint256,uint8,string)",
  "event StatusUpdated(uint256 indexed id,uint8 newStatus,string note)"
];

const contract = new ethers.Contract(
  CONTRACT_ADDRESS,
  abi,
  wallet
);

// ========================================
// 2. TEST TRANSITIONS
// ========================================

// Every update note has the same length of seven bytes
// to keep the input size consistent across transactions.

const steps = [
  {
    from: 0,
    to: 1,
    label: "Checked",
    note: "CHECKED"
  },
  {
    from: 1,
    to: 2,
    label: "Approved",
    note: "APPROVE"
  },
  {
    from: 2,
    to: 3,
    label: "Distributed",
    note: "SHIP_OK"
  }
];

// ========================================
// 3. EXPERIMENTAL RESULT FILE
// ========================================

const runId = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");

const resultPath = `results/TC03-${runId}.json`;

const report = {
  testCase: "TC-03",
  status: "IN_PROGRESS",
  network: "Ethereum Sepolia",
  contractAddress: CONTRACT_ADDRESS,
  batchId: BATCH_ID.toString(),
  walletAddress: wallet.address,
  timestampUtc: new Date().toISOString(),
  noteLengthBytes: 7,
  transactions: []
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

// ========================================
// 4. EXECUTE TC-03
// ========================================

async function main() {
  save();

  try {
    // 4.1. Verify the Sepolia network
    const net = await provider.getNetwork();

    assert.equal(
      net.chainId,
      11155111n,
      "The RPC endpoint is not connected to Ethereum Sepolia"
    );

    // 4.2. Verify the qualityLab authorization
    const lab = await contract.qualityLab();

    assert.equal(
      lab.toLowerCase(),
      wallet.address.toLowerCase(),
      "The connected wallet is not the authorized quality laboratory"
    );

    // 4.3. Verify that the target batch exists
    const count = await contract.batchCount();

    assert.ok(
      count >= BATCH_ID,
      "The target batch does not exist"
    );

    // 4.4. Read the initial batch state
    const original = await contract.getBatch(BATCH_ID);

    assert.equal(original.id, BATCH_ID);

    assert.equal(
      original.status,
      0n,
      "Batch 1 is no longer in Created (0). Do not rerun this test!"
    );

    console.log("===== STARTING TC-03 =====");

    console.log("Contract:", CONTRACT_ADDRESS);
    console.log("QualityLab:", lab);
    console.log("Batch ID:", BATCH_ID.toString());
    console.log(
      "Initial status:",
      original.status.toString()
    );

    // ========================================
    // 5. PERFORM THREE STATUS UPDATES
    // ========================================

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // Verify the note length
      assert.equal(
        ethers.toUtf8Bytes(step.note).length,
        7
      );

      // Verify the state before each transaction
      const before = await contract.getBatch(BATCH_ID);

      assert.equal(
        before.status,
        BigInt(step.from),
        `Unexpected state before step ${i + 1}`
      );

      console.log(
        `\n===== STEP ${i + 1}: ${step.from} -> ${step.to} (${step.label}) =====`
      );

      // 5.1. Record the transaction start time
      const startUtc = new Date().toISOString();
      const t0 = performance.now();

      // 5.2. Submit the status update transaction
      const tx = await contract.updateStatus(
        BATCH_ID,
        step.to,
        step.note
      );

      // 5.3. Record when the transaction hash is received
      const hashReceivedUtc = new Date().toISOString();
      const t1 = performance.now();

      const record = {
        step: i + 1,
        fromStatus: step.from,
        toStatus: step.to,
        label: step.label,
        note: step.note,
        noteBytes: ethers.toUtf8Bytes(step.note).length,
        status: "SENT",
        transactionHash: tx.hash,
        startUtc,
        hashReceivedUtc
      };

      report.transactions.push(record);

      // Save the transaction hash immediately after submission
      save();

      console.log("Transaction hash:", tx.hash);
      console.log("Waiting for transaction confirmation...");

      // 5.4. Wait for one blockchain confirmation
      const receipt = await tx.wait(1);

      const receiptReceivedUtc =
        new Date().toISOString();

      const t2 = performance.now();

      assert.ok(
        receipt,
        "Transaction receipt was not received"
      );

      // 5.5. Save the original transaction receipt
      const rawReceipt = await provider.send(
        "eth_getTransactionReceipt",
        [tx.hash]
      );

      fs.writeFileSync(
        `results/TC03-receipt-${runId}-${i + 1}.json`,
        JSON.stringify(rawReceipt, null, 2),
        "utf8"
      );

      assert.equal(
        receipt.status,
        1,
        "The transaction failed"
      );

      // ========================================
      // 6. VERIFY THE StatusUpdated EVENT
      // ========================================

      const event = receipt.logs
        .filter(
          (log) =>
            log.address.toLowerCase() ===
            CONTRACT_ADDRESS.toLowerCase()
        )
        .map((log) => {
          try {
            return contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find(
          (event) =>
            event?.name === "StatusUpdated"
        );

      assert.ok(
        event,
        "StatusUpdated event was not found"
      );

      assert.equal(
        event.args[0],
        BATCH_ID,
        "Unexpected batch ID in the event"
      );

      assert.equal(
        event.args[1],
        BigInt(step.to),
        "Unexpected status in the event"
      );

      assert.equal(
        event.args[2],
        step.note,
        "Unexpected note in the event"
      );

      // ========================================
      // 7. READ BACK ON-CHAIN BATCH DATA
      // ========================================

      const readStart = performance.now();

      const after = await contract.getBatch(BATCH_ID);

      const getBatchSeconds =
        (performance.now() - readStart) / 1000;

      // Verify the updated batch status
      assert.equal(
        after.status,
        BigInt(step.to),
        "Unexpected status after the transaction"
      );

      // Verify that the other batch attributes remain unchanged
      assert.equal(after.id, original.id);
      assert.equal(after.name, original.name);

      assert.equal(
        after.productionDate,
        original.productionDate
      );

      assert.equal(
        after.factory,
        original.factory
      );

      assert.equal(
        after.ipfsHash,
        original.ipfsHash
      );

      // ========================================
      // 8. RECORD GAS CONSUMPTION AND LATENCY
      // ========================================

      const gasPrice = receipt.gasPrice;

      Object.assign(record, {
        status: "PASS",
        blockNumber: receipt.blockNumber,

        gasUsed: receipt.gasUsed.toString(),

        gasPriceWei:
          gasPrice?.toString() ?? null,

        feeWei:
          gasPrice != null
            ? (
                receipt.gasUsed * gasPrice
              ).toString()
            : null,

        receiptReceivedUtc,

        timeToHashSeconds:
          (t1 - t0) / 1000,

        waitForReceiptSeconds:
          (t2 - t1) / 1000,

        totalSeconds:
          (t2 - t0) / 1000,

        getBatchSeconds,

        statusAfter:
          after.status.toString(),

        statusUpdatedEventFound: true
      });

      save();

      console.log("Test result: PASS");
      console.log("Batch ID:", BATCH_ID.toString());
      console.log("Gas used:", record.gasUsed);

      console.log(
        "Total transaction latency:",
        record.totalSeconds.toFixed(3),
        "seconds"
      );

      console.log(
        "getBatch read latency:",
        record.getBatchSeconds.toFixed(3),
        "seconds"
      );
    }

    // ========================================
    // 9. VERIFY THE FINAL BATCH STATE
    // ========================================

    const finalBatch =
      await contract.getBatch(BATCH_ID);

    assert.equal(
      finalBatch.status,
      3n,
      "The final batch status is not Distributed"
    );

    report.finalStatus =
      finalBatch.status.toString();

    report.status = "PASS";

    save();

    console.log("\n===== TC-03 PASS =====");

    console.log(
      "Final status of batch 1: Distributed (3)"
    );

    console.log("Experimental results saved to:", resultPath);

  } catch (error) {
    report.status = "FAIL_OR_INCOMPLETE";
    report.error = error.message;

    save();

    console.error(
      "TC-03 FAILED OR INCOMPLETE:",
      error.message
    );

    console.error(
      "If a transaction hash exists, inspect its on-chain receipt before rerunning."
    );

    process.exitCode = 1;
  }
}

main();
