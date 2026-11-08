
import { ethers } from "ethers";
import "dotenv/config";
import fs from "node:fs";
import assert from "node:assert/strict";

// =========================================
// 1. BLOCKCHAIN CONNECTION CONFIGURATION
// =========================================

const RPC_URL =
  process.env.SEPOLIA_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";

const ADDRESS = process.env.CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// Batch 2 was created during TC-02
// and should remain in the Created state.
const BATCH_ID = 2n;

if (!ADDRESS || !ethers.isAddress(ADDRESS) || !PRIVATE_KEY) {
  throw new Error(
    "Missing PRIVATE_KEY or a valid CONTRACT_ADDRESS in the .env file"
  );
}

const provider = new ethers.JsonRpcProvider(RPC_URL);

const ownerWallet = new ethers.Wallet(
  PRIVATE_KEY,
  provider
);

// Generate a random wallet for authorization testing.
// Only staticCall is used with this wallet,
// so it does not require Sepolia ETH.
const newLabWallet =
  ethers.Wallet.createRandom().connect(provider);

// Smart contract ABI
const abi = [
  "function owner() view returns (address)",
  "function qualityLab() view returns (address)",
  "function batchCount() view returns (uint256)",
  "function setQualityLab(address)",
  "function updateStatus(uint256,uint8,string)",
  "function getBatch(uint256) view returns (tuple(uint256 id,string name,string productionDate,string factory,string ipfsHash,uint8 status))"
];

const asOwner = new ethers.Contract(
  ADDRESS,
  abi,
  ownerWallet
);

const asNewLab = new ethers.Contract(
  ADDRESS,
  abi,
  newLabWallet
);

// =========================================
// 2. EXPERIMENTAL RESULT FILE
// =========================================

const runId = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");

const resultPath = `results/TC07-${runId}.json`;

const report = {
  testCase: "TC-07",
  status: "IN_PROGRESS",
  timestampUtc: new Date().toISOString(),
  network: "Ethereum Sepolia",
  contractAddress: ADDRESS,
  ownerWallet: ownerWallet.address,
  newLabAddress: newLabWallet.address,
  batchId: BATCH_ID.toString(),
  method:
    "2 on-chain setQualityLab transactions; 2 staticCall permission tests",
  transactions: [],
  permissionChecks: []
};

// Save the experimental results to a JSON file.
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
// 3. SUBMIT AND RECORD QUALITYLAB UPDATES
// =========================================

// Submit an on-chain setQualityLab transaction
// and record its receipt, gas usage, and latency.
async function sendRecorded(label, destination) {
  const startedUtc = new Date().toISOString();
  const started = performance.now();

  // Submit the role assignment transaction.
  const tx = await asOwner.setQualityLab(destination);
  const hashAt = performance.now();

  const record = {
    label,
    status: "SENT",
    destination,
    transactionHash: tx.hash,
    startedUtc
  };

  report.transactions.push(record);
  save();

  console.log(`${label} transaction hash: ${tx.hash}`);

  // Wait for one blockchain confirmation.
  const receipt = await tx.wait(1);
  const receivedAt = performance.now();

  assert.ok(
    receipt,
    `Transaction receipt was not received for ${label}`
  );

  // Record the transaction execution results.
  Object.assign(record, {
    status:
      receipt.status === 1
        ? "CONFIRMED"
        : "FAILED",

    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),

    gasPriceWei:
      receipt.gasPrice?.toString() ?? null,

    feeWei:
      receipt.gasPrice != null
        ? (
            receipt.gasUsed *
            receipt.gasPrice
          ).toString()
        : null,

    timeToHashSeconds:
      (hashAt - started) / 1000,

    totalSeconds:
      (receivedAt - started) / 1000
  });

  save();

  // Verify successful on-chain execution.
  assert.equal(
    receipt.status,
    1,
    `${label} transaction failed`
  );

  // Retrieve and save the original blockchain receipt.
  const rawReceipt = await provider.send(
    "eth_getTransactionReceipt",
    [tx.hash]
  );

  fs.writeFileSync(
    `results/TC07-receipt-${runId}-${label}.json`,
    JSON.stringify(rawReceipt, null, 2),
    "utf8"
  );

  console.log(
    `${label}: PASS | Gas used: ${record.gasUsed}`
  );

  return receipt;
}

// =========================================
// 4. VERIFY THAT THE PREVIOUS LAB IS REJECTED
// =========================================

// After transferring the qualityLab role,
// verify that the previous laboratory wallet
// can no longer update a batch.
async function checkOldLabRejected() {
  let caught = null;

  try {
    await asOwner.updateStatus.staticCall(
      BATCH_ID,
      1,
      "OLD_LAB"
    );
  } catch (error) {
    caught = error;
  }

  // The previous laboratory must be rejected.
  assert.ok(
    caught,
    "The previous qualityLab wallet can still update the batch - TEST FAILED"
  );

  // Only an EVM revert is accepted.
  // Network or RPC failures must not count as PASS.
  assert.ok(
    ethers.isError(caught, "CALL_EXCEPTION"),
    `The error is not an EVM revert: ${caught.code ?? "unknown"}`
  );

  // Verify the exact revert reason.
  assert.equal(
    caught.reason,
    "Not authorized: only quality lab"
  );

  // Record the authorization test result.
  report.permissionChecks.push({
    who: "oldLab",
    mode: "staticCall",
    result: "REJECTED_AS_EXPECTED",
    revertReason: caught.reason,
    transactionHash: null,
    onchainGasUsed: null
  });

  save();

  console.log(
    "Previous qualityLab wallet rejected as expected: PASS"
  );
}

// =========================================
// 5. MAIN TEST PROCEDURE
// =========================================

async function main() {
  save();

  let originalLab = null;
  let checksPassed = false;
  let restored = false;

  try {
    console.log("===== STARTING TC-07 =====");

    // 5.1. Verify the Ethereum Sepolia network.
    const network = await provider.getNetwork();

    assert.equal(
      network.chainId,
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

    // 5.2. Verify the initial contract state.
    const [owner, qualityLab, count, batch] =
      await Promise.all([
        asOwner.owner(),
        asOwner.qualityLab(),
        asOwner.batchCount(),
        asOwner.getBatch(BATCH_ID)
      ]);

    // Verify that the connected wallet is the owner.
    assert.equal(
      owner.toLowerCase(),
      ownerWallet.address.toLowerCase(),
      "The wallet configured in .env is not the contract owner"
    );

    // Verify that the original qualityLab
    // is still assigned to the owner wallet.
    assert.equal(
      qualityLab.toLowerCase(),
      ownerWallet.address.toLowerCase(),
      "The qualityLab role has already been transferred; do not execute this test"
    );

    // Verify that Batch 2 exists.
    assert.ok(
      count >= BATCH_ID,
      "Batch ID 2 does not exist"
    );

    // Batch 2 must still be in the Created state.
    assert.equal(
      batch.status,
      0n,
      "Batch 2 is no longer in the Created state"
    );

    originalLab = qualityLab;

    report.originalLab = originalLab;

    report.before = {
      batchCount: count.toString(),
      batch2Status: batch.status.toString()
    };

    save();

    console.log(
      "Contract owner and original qualityLab:",
      originalLab
    );

    console.log(
      "New qualityLab address:",
      newLabWallet.address
    );

    console.log(
      "Batch used for permission testing: 2 (no batch data modification)"
    );

    // =====================================
    // STEP 1: TRANSFER THE QUALITYLAB ROLE
    // =====================================

    console.log(
      "\n===== STEP 1: TRANSFER QUALITYLAB ROLE TO NEW WALLET ====="
    );

    // Assign the qualityLab role to the new wallet.
    await sendRecorded(
      "set-new-lab",
      newLabWallet.address
    );

    // Read the updated qualityLab address.
    const actualLab =
      await asOwner.qualityLab();

    assert.equal(
      actualLab.toLowerCase(),
      newLabWallet.address.toLowerCase(),
      "The qualityLab role was not transferred successfully"
    );

    console.log("Updated qualityLab address verified: PASS");

    // =====================================
    // STEP 2: VERIFY NEW LAB AUTHORIZATION
    // =====================================

    console.log(
      "\n===== STEP 2: VERIFY NEW QUALITYLAB AUTHORIZATION ====="
    );

    // Use staticCall to simulate an authorized update.
    // No actual transaction is broadcast,
    // and Batch 2 remains unchanged.
    await asNewLab.updateStatus.staticCall(
      BATCH_ID,
      1,
      "NEW_LAB"
    );

    report.permissionChecks.push({
      who: "newLab",
      mode: "staticCall",
      result: "AUTHORIZED",
      transactionHash: null,
      onchainGasUsed: null
    });

    save();

    console.log(
      "New qualityLab wallet successfully passed the updateStatus staticCall: PASS"
    );

    // =====================================
    // STEP 3: VERIFY OLD LAB REVOCATION
    // =====================================

    console.log(
      "\n===== STEP 3: VERIFY PREVIOUS QUALITYLAB ACCESS REVOCATION ====="
    );

    // Verify that the previous qualityLab wallet
    // no longer has authorization.
    await checkOldLabRejected();

    // Confirm that staticCall did not modify Batch 2.
    const afterCheck =
      await asOwner.getBatch(BATCH_ID);

    assert.equal(
      afterCheck.status,
      batch.status,
      "Batch 2 was modified during permission testing"
    );

    checksPassed = true;

  } catch (error) {
    report.error = error.message;

    console.error(
      "TC-07 ENCOUNTERED AN ERROR:",
      error.message
    );

  } finally {

    // =====================================
    // STEP 4: ATTEMPT TO RESTORE ORIGINAL ROLE
    // =====================================

    // Always attempt to restore the original
    // qualityLab assignment if it was recorded.
    if (originalLab) {
      console.log(
        "\n===== STEP 4: RESTORE ORIGINAL QUALITYLAB ROLE ====="
      );

      try {
        // Read the current qualityLab address.
        const current =
          await asOwner.qualityLab();

        if (
          current.toLowerCase() ===
          originalLab.toLowerCase()
        ) {
          // The original address is already assigned.
          restored = true;

          console.log(
            "qualityLab is already assigned to the original address; restoration is unnecessary."
          );

        } else if (
          current.toLowerCase() ===
          newLabWallet.address.toLowerCase()
        ) {

          // Restore the previous qualityLab address.
          await sendRecorded(
            "restore-old-lab",
            originalLab
          );

          // Verify that the original address was restored.
          const checked =
            await asOwner.qualityLab();

          assert.equal(
            checked.toLowerCase(),
            originalLab.toLowerCase(),
            "Failed to restore the original qualityLab address"
          );

          restored = true;

          console.log(
            "Original qualityLab role restored: PASS"
          );

        } else {
          // An unexpected qualityLab address was detected.
          throw new Error(
            `qualityLab is assigned to an unexpected address: ${current}`
          );
        }

      } catch (restoreError) {
        report.restoreError =
          restoreError.message;

        console.error(
          "WARNING: ORIGINAL QUALITYLAB RESTORATION HAS NOT BEEN CONFIRMED:",
          restoreError.message
        );

        console.error(
          "Verify and restore the qualityLab role using the owner wallet before continuing with subsequent tests."
        );
      }
    }

    // =====================================
    // 6. RECORD FINAL EXPERIMENTAL RESULTS
    // =====================================

    report.restoredOriginalLab = restored;

    report.status =
      checksPassed && restored
        ? "PASS"
        : "FAIL_OR_INCOMPLETE";

    save();

    console.log(
      `\n===== TC-07 ${report.status} =====`
    );

    console.log(
      "Experimental results saved to:",
      resultPath
    );

    if (report.status !== "PASS") {
      process.exitCode = 1;
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
