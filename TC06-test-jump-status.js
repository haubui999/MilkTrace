
import { ethers } from "ethers";
import "dotenv/config";
import fs from "node:fs";
import assert from "node:assert/strict";

// ==========================================
// TC-06: TEST DIRECT STATUS TRANSITION FROM 0 TO 3
// ==========================================

// 1. BLOCKCHAIN CONNECTION CONFIGURATION
const RPC_URL =
  process.env.SEPOLIA_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";

const ADDRESS = process.env.CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!ADDRESS || !ethers.isAddress(ADDRESS) || !PRIVATE_KEY) {
  throw new Error(
    "Missing PRIVATE_KEY or a valid CONTRACT_ADDRESS in the .env file"
  );
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// 2. SMART CONTRACT ABI
const abi = [
  "function owner() view returns(address)",
  "function qualityLab() view returns(address)",
  "function batchCount() view returns(uint256)",
  "function createBatch(string,string,string,string)",
  "function updateStatus(uint256,uint8,string)",
  "function getBatch(uint256) view returns(tuple(uint256 id,string name,string productionDate,string factory,string ipfsHash,uint8 status))",
  "event BatchCreated(uint256 indexed id,string name,string factory)",
  "event StatusUpdated(uint256 indexed id,uint8 newStatus,string note)"
];

const contract = new ethers.Contract(
  ADDRESS,
  abi,
  wallet
);

// 3. SIMULATED INPUT DATA FOR A NEW BATCH
const input = {
  name: "Fresh Milk 1L",
  productionDate: "2026-11-08",
  factory: "Dairy Processing Plant, Binh Duong",
  ipfsHash: "CID_TC06_DEMO_NOT_VERIFIED"
};

// Seven-byte note, consistent with the input length in TC-03
const note = "JUMP_03";

// 4. EXPERIMENTAL RESULT FILE
const runId = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");

const resultPath = `results/TC06-${runId}.json`;

const report = {
  testCase: "TC-06",
  status: "IN_PROGRESS",
  network: "Ethereum Sepolia",
  chainId: 11155111,
  contractAddress: ADDRESS,
  walletAddress: wallet.address,
  timestampUtc: new Date().toISOString(),
  purpose: "Test direct status transition from Created (0) to Distributed (3)",
  input,
  updateNote: note,
  steps: []
};

function save() {
  fs.mkdirSync("results", { recursive: true });

  fs.writeFileSync(
    resultPath,
    JSON.stringify(report, null, 2),
    "utf8"
  );
}

// 5. FIND AN EVENT IN THE TRANSACTION RECEIPT
function findEvent(receipt, name) {
  return receipt.logs
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
    .find(event => event?.name === name);
}

// 6. SAVE THE ORIGINAL TRANSACTION RECEIPT
async function saveReceipt(txHash, step) {
  const raw = await provider.send(
    "eth_getTransactionReceipt",
    [txHash]
  );

  assert.ok(
    raw,
    `Unable to retrieve the original receipt for step ${step}`
  );

  fs.writeFileSync(
    `results/TC06-receipt-${runId}-${step}.json`,
    JSON.stringify(raw, null, 2),
    "utf8"
  );
}

// 7. MAIN TEST PROCEDURE
async function main() {
  save();

  try {
    // Verify the selected Ethereum network
    const network = await provider.getNetwork();

    assert.equal(
      network.chainId,
      11155111n,
      "The RPC endpoint is not connected to Ethereum Sepolia"
    );

    assert.notEqual(
      await provider.getCode(ADDRESS),
      "0x",
      "No smart contract exists at the specified address"
    );

    // Verify owner and qualityLab authorization
    const [owner, qualityLab, countBefore] =
      await Promise.all([
        contract.owner(),
        contract.qualityLab(),
        contract.batchCount()
      ]);

    assert.equal(
      owner.toLowerCase(),
      wallet.address.toLowerCase(),
      "The connected wallet is not the contract owner"
    );

    assert.equal(
      qualityLab.toLowerCase(),
      wallet.address.toLowerCase(),
      "The connected wallet is not the authorized quality laboratory"
    );

    report.batchCountBefore = countBefore.toString();
    save();

    console.log("===== STARTING TC-06 =====");
    console.log("Contract:", ADDRESS);
    console.log("Test wallet:", wallet.address);
    console.log(
      "Initial batch count:",
      countBefore.toString()
    );

    // ======================================
    // STEP 1: CREATE A NEW BATCH
    // ======================================

    console.log("\n===== STEP 1: CREATE A NEW BATCH =====");

    const startCreateUtc = new Date().toISOString();
    const t0 = performance.now();

    const txCreate = await contract.createBatch(
      input.name,
      input.productionDate,
      input.factory,
      input.ipfsHash
    );

    const t1 = performance.now();

    const createRecord = {
      action: "createBatch",
      status: "SENT",
      transactionHash: txCreate.hash,
      startUtc: startCreateUtc,
      hashReceivedUtc: new Date().toISOString()
    };

    report.steps.push(createRecord);
    save();

    console.log("Batch creation transaction hash:", txCreate.hash);
    console.log("Waiting for transaction confirmation...");

    const createReceipt = await txCreate.wait(1);
    const t2 = performance.now();

    assert.ok(
      createReceipt,
      "Batch creation transaction receipt was not received"
    );

    await saveReceipt(txCreate.hash, "create");

    assert.equal(
      createReceipt.status,
      1,
      "Batch creation transaction failed"
    );

    // Extract the batch ID from the BatchCreated event
    const createdEvent = findEvent(
      createReceipt,
      "BatchCreated"
    );

    assert.ok(
      createdEvent,
      "BatchCreated event was not found"
    );

    const batchId = createdEvent.args[0];

    assert.equal(createdEvent.args[1], input.name);
    assert.equal(createdEvent.args[2], input.factory);

    assert.equal(
      batchId,
      countBefore + 1n
    );

    const countAfter = await contract.batchCount();

    assert.equal(
      countAfter,
      countBefore + 1n
    );

    // Read the newly created batch from the blockchain
    const beforeJump = await contract.getBatch(batchId);

    assert.equal(beforeJump.id, batchId);
    assert.equal(beforeJump.name, input.name);

    assert.equal(
      beforeJump.productionDate,
      input.productionDate
    );

    assert.equal(beforeJump.factory, input.factory);
    assert.equal(beforeJump.ipfsHash, input.ipfsHash);

    assert.equal(
      beforeJump.status,
      0n,
      "The newly created batch is not in Created (0)"
    );

    // Record batch creation results
    Object.assign(createRecord, {
      status: "PASS",
      batchId: batchId.toString(),
      blockNumber: createReceipt.blockNumber,
      gasUsed: createReceipt.gasUsed.toString(),

      gasPriceWei:
        createReceipt.gasPrice?.toString() ?? null,

      transactionFeeWei:
        createReceipt.gasPrice != null
          ? (
              createReceipt.gasUsed *
              createReceipt.gasPrice
            ).toString()
          : null,

      totalSeconds: (t2 - t0) / 1000,
      timeToHashSeconds: (t1 - t0) / 1000,
      waitForReceiptSeconds: (t2 - t1) / 1000,

      statusAfter: "0",
      eventVerified: true
    });

    report.batchId = batchId.toString();
    save();

    console.log("Batch creation: PASS");
    console.log("Batch ID:", batchId.toString());
    console.log("Initial status: Created (0)");
    console.log("Gas used:", createRecord.gasUsed);

    console.log(
      "Total transaction latency:",
      createRecord.totalSeconds.toFixed(3),
      "seconds"
    );

    // ======================================
    // STEP 2: BYPASS INTERMEDIATE STATES (0 -> 3)
    // ======================================

    console.log(
      "\n===== STEP 2: BYPASS INTERMEDIATE STATES (0 -> 3) ====="
    );

    assert.equal(
      ethers.toUtf8Bytes(note).length,
      7
    );

    const startUpdateUtc = new Date().toISOString();
    const u0 = performance.now();

    // Skip the Checked and Approved states
    const txUpdate = await contract.updateStatus(
      batchId,
      3,
      note
    );

    const u1 = performance.now();

    const updateRecord = {
      action: "updateStatus",
      fromStatus: 0,
      toStatus: 3,
      note,
      noteBytes: 7,
      status: "SENT",
      transactionHash: txUpdate.hash,
      startUtc: startUpdateUtc,
      hashReceivedUtc: new Date().toISOString()
    };

    report.steps.push(updateRecord);
    save();

    console.log("Status update transaction hash:", txUpdate.hash);
    console.log("Waiting for transaction confirmation...");

    const updateReceipt = await txUpdate.wait(1);
    const u2 = performance.now();

    assert.ok(
      updateReceipt,
      "Status update transaction receipt was not received"
    );

    await saveReceipt(txUpdate.hash, "jump");

    assert.equal(
      updateReceipt.status,
      1,
      "Status update transaction failed"
    );

    // Verify the StatusUpdated event
    const updatedEvent = findEvent(
      updateReceipt,
      "StatusUpdated"
    );

    assert.ok(
      updatedEvent,
      "StatusUpdated event was not found"
    );

    assert.equal(updatedEvent.args[0], batchId);
    assert.equal(updatedEvent.args[1], 3n);
    assert.equal(updatedEvent.args[2], note);

    // ======================================
    // STEP 3: VERIFY THE UPDATED ON-CHAIN STATUS
    // ======================================

    const readStart = performance.now();

    const afterJump = await contract.getBatch(batchId);

    const getBatchSeconds =
      (performance.now() - readStart) / 1000;

    // Confirm the direct transition to Distributed (3)
    assert.equal(
      afterJump.status,
      3n,
      "The direct transition to Distributed (3) did not succeed"
    );

    // Verify that the remaining batch attributes are unchanged
    assert.equal(afterJump.id, beforeJump.id);
    assert.equal(afterJump.name, beforeJump.name);

    assert.equal(
      afterJump.productionDate,
      beforeJump.productionDate
    );

    assert.equal(
      afterJump.factory,
      beforeJump.factory
    );

    assert.equal(
      afterJump.ipfsHash,
      beforeJump.ipfsHash
    );

    assert.equal(
      await contract.batchCount(),
      countAfter
    );

    // ======================================
    // STEP 4: RECORD GAS CONSUMPTION AND LATENCY
    // ======================================

    Object.assign(updateRecord, {
      status: "PASS",
      batchId: batchId.toString(),
      blockNumber: updateReceipt.blockNumber,
      gasUsed: updateReceipt.gasUsed.toString(),

      gasPriceWei:
        updateReceipt.gasPrice?.toString() ?? null,

      transactionFeeWei:
        updateReceipt.gasPrice != null
          ? (
              updateReceipt.gasUsed *
              updateReceipt.gasPrice
            ).toString()
          : null,

      totalSeconds: (u2 - u0) / 1000,
      timeToHashSeconds: (u1 - u0) / 1000,
      waitForReceiptSeconds: (u2 - u1) / 1000,

      getBatchSeconds,
      statusAfter: "3",
      eventVerified: true
    });

    report.status = "PASS";

    report.finding =
      "The contract permits a direct transition from Created (0) to Distributed (3), bypassing the intermediate quality states";

    save();

    console.log("Direct status transition observed: PASS");
    console.log("Batch ID:", batchId.toString());
    console.log("Gas used:", updateRecord.gasUsed);

    console.log(
      "Total transaction latency:",
      updateRecord.totalSeconds.toFixed(3),
      "seconds"
    );

    console.log(
      "getBatch read latency:",
      getBatchSeconds.toFixed(3),
      "seconds"
    );

    console.log("Final status: Distributed (3)");

    console.log("\n===== TC-06 PASS =====");
    console.log("Experimental results saved to:", resultPath);

  } catch (error) {
    report.status = "FAIL_OR_INCOMPLETE";
    report.error = error.message;

    save();

    console.error(
      "TC-06 FAILED OR INCOMPLETE:",
      error.message
    );

    console.error(
      "If a transaction hash exists, inspect its on-chain receipt before rerunning!"
    );

    process.exitCode = 1;
  }
}

main();
