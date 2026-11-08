
import { ethers } from "ethers";
import "dotenv/config";
import fs from "node:fs";
import assert from "node:assert/strict";

// 1. BLOCKCHAIN CONNECTION CONFIGURATION

const RPC_URL =
  process.env.SEPOLIA_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!CONTRACT_ADDRESS || !PRIVATE_KEY) {
  throw new Error(
    "Missing CONTRACT_ADDRESS or PRIVATE_KEY in the .env file."
  );
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// 2. SMART CONTRACT ABI

const abi = [
  "function owner() view returns (address)",
  "function batchCount() view returns (uint256)",
  "function createBatch(string,string,string,string)",
  "function getBatch(uint256) view returns (tuple(uint256 id,string name,string productionDate,string factory,string ipfsHash,uint8 status))",
  "event BatchCreated(uint256 indexed id,string name,string factory)"
];

const contract = new ethers.Contract(
  CONTRACT_ADDRESS,
  abi,
  wallet
);

// 3. SIMULATED BATCH DATA
// Experimental data only; not an actual production batch.

const sample = {
  name: "Fresh Milk 1L",
  productionDate: "2026-11-08",
  factory: "Dairy Processing Plant, Binh Duong",
  ipfsHash:
    "bafkreid4k6d2exntnyvp64enbqnycibjdqbmrduh7kx52odvqshqv7bnki"
};

// 4. EXPERIMENTAL RESULT FILE

const runId = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");

const resultFile = `results/TC02-${runId}.json`;

const report = {
  testCase: "TC-02",
  status: "IN_PROGRESS",
  contractAddress: CONTRACT_ADDRESS,
  rpcEndpoint: RPC_URL,
  timestampUtc: new Date().toISOString(),
  input: sample,
  transactions: []
};

// Save experimental results to a JSON file.
function saveReport() {
  fs.mkdirSync("results", { recursive: true });

  fs.writeFileSync(
    resultFile,
    JSON.stringify(report, null, 2),
    "utf8"
  );
}

// 5. MAIN TEST PROCEDURE

async function main() {
  saveReport();

  try {
    console.log("===== STARTING TC-02 =====");

    // Verify the Ethereum Sepolia network.
    const network = await provider.getNetwork();

    assert.equal(
      network.chainId,
      11155111n,
      "Incorrect network. Ethereum Sepolia is required."
    );

    // Verify that the connected wallet is the contract owner.
    const owner = await contract.owner();

    assert.equal(
      owner.toLowerCase(),
      wallet.address.toLowerCase(),
      "The connected wallet is not the contract owner."
    );

    // Record the initial batch count.
    const initialCount = await contract.batchCount();

    report.initialBatchCount = initialCount.toString();

    console.log("Contract address:", CONTRACT_ADDRESS);
    console.log("Owner address:", wallet.address);
    console.log("Initial batch count:", initialCount.toString());

    // Create three batches with identical input data.
    for (let i = 1; i <= 3; i++) {
      console.log(`\n===== CREATING BATCH ${i} =====`);

      const countBefore = await contract.batchCount();

      // Record the transaction submission start time.
      const startUtc = new Date().toISOString();
      const t0 = performance.now();

      // Submit the createBatch transaction.
      const tx = await contract.createBatch(
        sample.name,
        sample.productionDate,
        sample.factory,
        sample.ipfsHash
      );

      // Record the time when the transaction hash is received.
      const hashReceivedUtc = new Date().toISOString();
      const t1 = performance.now();

      console.log("Transaction hash:", tx.hash);
      console.log("Waiting for transaction confirmation...");

      // Wait for one blockchain confirmation.
      const receipt = await tx.wait(1);

      const receiptReceivedUtc = new Date().toISOString();
      const t2 = performance.now();

      assert.ok(
        receipt,
        "Transaction receipt was not received."
      );

      assert.equal(
        receipt.status,
        1,
        "Batch creation transaction failed."
      );

      // Extract the batch ID from the BatchCreated event,
      // rather than relying on the batchCount getter.
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
        .find((item) => item?.name === "BatchCreated");

      assert.ok(
        event,
        "BatchCreated event was not found."
      );

      const batchId = event.args[0];

      const countAfter = await contract.batchCount();
      const batch = await contract.getBatch(batchId);

      // 6. VERIFY BATCH COUNTER CONSISTENCY

      assert.equal(
        countAfter,
        countBefore + 1n,
        "Batch count did not increase by exactly one."
      );

      assert.equal(
        batchId,
        countAfter,
        "Batch ID from the event does not match batchCount."
      );

      // 7. VERIFY THE DATA STORED ON THE BLOCKCHAIN

      assert.equal(batch.id, batchId);
      assert.equal(batch.name, sample.name);

      assert.equal(
        batch.productionDate,
        sample.productionDate
      );

      assert.equal(batch.factory, sample.factory);
      assert.equal(batch.ipfsHash, sample.ipfsHash);
      assert.equal(batch.status, 0n);

      // Verify the attributes emitted by BatchCreated.
      assert.equal(event.args[1], sample.name);
      assert.equal(event.args[2], sample.factory);

      // 8. COLLECT GAS CONSUMPTION AND LATENCY DATA

      const gasUsed = receipt.gasUsed;
      const gasPrice = receipt.gasPrice;

      const row = {
        repetition: i,
        status: "PASS",
        batchId: batchId.toString(),
        transactionHash: tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: gasUsed.toString(),
        gasPriceWei: gasPrice?.toString() ?? null,
        feeWei:
          gasPrice != null
            ? (gasUsed * gasPrice).toString()
            : null,
        inputBytes: (tx.data.length - 2) / 2,
        startUtc,
        hashReceivedUtc,
        receiptReceivedUtc,
        submissionSeconds: (t1 - t0) / 1000,
        waitingSeconds: (t2 - t1) / 1000,
        totalSeconds: (t2 - t0) / 1000,
        batchCountBefore: countBefore.toString(),
        batchCountAfter: countAfter.toString(),
        initialStatus: batch.status.toString(),
        batchCreatedEventFound: true
      };

      report.transactions.push(row);
      saveReport();

      // 9. SAVE THE ORIGINAL TRANSACTION RECEIPT

      const rawReceipt = await provider.send(
        "eth_getTransactionReceipt",
        [tx.hash]
      );

      fs.writeFileSync(
        `results/TC02-receipt-${runId}-${i}.json`,
        JSON.stringify(rawReceipt, null, 2),
        "utf8"
      );

      // 10. DISPLAY INDIVIDUAL BATCH RESULTS

      console.log("Test result: PASS");
      console.log("Batch ID:", batchId.toString());
      console.log("Gas used:", gasUsed.toString());

      console.log(
        "Total transaction latency:",
        row.totalSeconds.toFixed(3),
        "seconds"
      );
    }

    // 11. VERIFY THE FINAL BATCH COUNT

    const finalCount = await contract.batchCount();

    assert.equal(
      finalCount,
      initialCount + 3n,
      "Total batch count did not increase by three."
    );

    report.finalBatchCount = finalCount.toString();
    report.status = "PASS";
    saveReport();

    // 12. DISPLAY FINAL EXPERIMENTAL RESULTS

    console.log("\n===== TC-02 PASSED =====");
    console.log("Three batches were created successfully.");
    console.log("Experimental results saved to:", resultFile);

  } catch (error) {
    report.status = "FAIL_OR_INCOMPLETE";
    report.error = error.message;
    saveReport();

    console.error("TC-02 FAILED OR INCOMPLETE:", error.message);
    process.exitCode = 1;
  }
}

main();
