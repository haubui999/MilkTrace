
import { ethers } from "ethers";
import "dotenv/config";
import fs from "node:fs";
import assert from "node:assert/strict";

// =========================================
// 1. CAU HINH
// =========================================

const RPC_URL =
  process.env.SEPOLIA_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";

const ADDRESS = process.env.CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// Batch 2 tu TC-02, van o trang thai Created
const BATCH_ID = 2n;

if (!ADDRESS || !ethers.isAddress(ADDRESS) || !PRIVATE_KEY) {
  throw new Error(
    "Kiem tra PRIVATE_KEY va CONTRACT_ADDRESS trong .env"
  );
}

const provider = new ethers.JsonRpcProvider(RPC_URL);

const ownerWallet = new ethers.Wallet(
  PRIVATE_KEY,
  provider
);

// Vi thu nghiem ngau nhien.
// Chi staticCall, khong can nap ETH.
const newLabWallet =
  ethers.Wallet.createRandom().connect(provider);

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
// 2. TAO FILE KET QUA
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
// 3. GUI GIAO DICH DOI QUALITYLAB
// =========================================

async function sendRecorded(label, destination) {
  const startedUtc = new Date().toISOString();
  const started = performance.now();

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

  console.log(`${label} Tx: ${tx.hash}`);

  const receipt = await tx.wait(1);
  const receivedAt = performance.now();

  assert.ok(
    receipt,
    `Khong co receipt cho ${label}`
  );

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

  assert.equal(
    receipt.status,
    1,
    `${label} that bai`
  );

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
    `${label}: PASS | Gas: ${record.gasUsed}`
  );

  return receipt;
}

// =========================================
// 4. KIEM TRA VI CU MAT QUYEN
// =========================================

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

  assert.ok(
    caught,
    "Vi cu van update duoc - FAIL"
  );

  assert.ok(
    ethers.isError(caught, "CALL_EXCEPTION"),
    `Loi khong phai EVM revert: ${caught.code ?? "unknown"}`
  );

  assert.equal(
    caught.reason,
    "Not authorized: only quality lab"
  );

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
    "Vi qualityLab cu bi tu choi: PASS"
  );
}

// =========================================
// 5. CHUONG TRINH CHINH
// =========================================

async function main() {
  save();

  let originalLab = null;
  let checksPassed = false;
  let restored = false;

  try {
    console.log("===== BAT DAU TC-07 =====");

    const network = await provider.getNetwork();

    assert.equal(
      network.chainId,
      11155111n,
      "Khong phai Sepolia"
    );

    assert.notEqual(
      await provider.getCode(ADDRESS),
      "0x",
      "Khong co contract tai dia chi"
    );

    // Kiem tra trang thai ban dau
    const [owner, qualityLab, count, batch] =
      await Promise.all([
        asOwner.owner(),
        asOwner.qualityLab(),
        asOwner.batchCount(),
        asOwner.getBatch(BATCH_ID)
      ]);

    assert.equal(
      owner.toLowerCase(),
      ownerWallet.address.toLowerCase(),
      "Vi trong .env khong phai owner"
    );

    assert.equal(
      qualityLab.toLowerCase(),
      ownerWallet.address.toLowerCase(),
      "qualityLab da duoc chuyen; khong chay script"
    );

    assert.ok(
      count >= BATCH_ID,
      "Chua co Batch ID 2"
    );

    assert.equal(
      batch.status,
      0n,
      "Batch 2 khong con o trang thai Created"
    );

    originalLab = qualityLab;

    report.originalLab = originalLab;

    report.before = {
      batchCount: count.toString(),
      batch2Status: batch.status.toString()
    };

    save();

    console.log(
      "Owner va qualityLab cu:",
      originalLab
    );

    console.log(
      "QualityLab moi:",
      newLabWallet.address
    );

    console.log(
      "Batch kiem tra quyen: 2 (khong sua du lieu)"
    );

    // =====================================
    // BUOC 1: CHUYEN QUYEN
    // =====================================

    console.log(
      "\n===== BUOC 1: CHUYEN QUYEN SANG VI MOI ====="
    );

    await sendRecorded(
      "set-new-lab",
      newLabWallet.address
    );

    const actualLab =
      await asOwner.qualityLab();

    assert.equal(
      actualLab.toLowerCase(),
      newLabWallet.address.toLowerCase(),
      "Khong chuyen duoc qualityLab"
    );

    console.log("Doc lai qualityLab: PASS");

    // =====================================
    // BUOC 2: VI MOI DUOC CAP QUYEN
    // =====================================

    console.log(
      "\n===== BUOC 2: KIEM TRA VI MOI DUOC CAP QUYEN ====="
    );

    // staticCall: mo phong thanh cong,
    // khong cap nhat Batch 2 that.
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
      "Vi moi staticCall updateStatus thanh cong: PASS"
    );

    // =====================================
    // BUOC 3: VI CU BI TU CHOI
    // =====================================

    console.log(
      "\n===== BUOC 3: KIEM TRA VI CU MAT QUYEN ====="
    );

    await checkOldLabRejected();

    // Xac nhan staticCall khong sua Batch 2
    const afterCheck =
      await asOwner.getBatch(BATCH_ID);

    assert.equal(
      afterCheck.status,
      batch.status,
      "Batch 2 da thay doi"
    );

    checksPassed = true;

  } catch (error) {
    report.error = error.message;

    console.error(
      "TC-07 gap loi:",
      error.message
    );

  } finally {

    // =====================================
    // BUOC 4: LUON CO GANG KHOI PHUC
    // =====================================

    if (originalLab) {
      console.log(
        "\n===== BUOC 4: KHOI PHUC QUALITYLAB BAN DAU ====="
      );

      try {
        const current =
          await asOwner.qualityLab();

        if (
          current.toLowerCase() ===
          originalLab.toLowerCase()
        ) {
          restored = true;

          console.log(
            "QualityLab da o dia chi ban dau; khong can khoi phuc."
          );

        } else if (
          current.toLowerCase() ===
          newLabWallet.address.toLowerCase()
        ) {

          await sendRecorded(
            "restore-old-lab",
            originalLab
          );

          const checked =
            await asOwner.qualityLab();

          assert.equal(
            checked.toLowerCase(),
            originalLab.toLowerCase(),
            "Khoi phuc that bai"
          );

          restored = true;

          console.log(
            "Khoi phuc quyen: PASS"
          );

        } else {
          throw new Error(
            `qualityLab dang o dia chi khong mong doi: ${current}`
          );
        }

      } catch (restoreError) {
        report.restoreError =
          restoreError.message;

        console.error(
          "CANH BAO: CHUA XAC NHAN DUOC KHOI PHUC QUALITYLAB:",
          restoreError.message
        );

        console.error(
          "Can kiem tra va khoi phuc bang owner truoc TC tiep theo."
        );
      }
    }

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
      "Da luu:",
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
