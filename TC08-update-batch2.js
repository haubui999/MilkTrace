
import { ethers } from "ethers";
import "dotenv/config";
import fs from "node:fs";
import assert from "node:assert/strict";

// ===================================
// 1. CAU HINH
// ===================================

const RPC_URL =
  process.env.SEPOLIA_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";

const ADDRESS = process.env.CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const BATCH_ID = 2n;
const NOTE = "WEB_TC8";

if (
  !ADDRESS ||
  !ethers.isAddress(ADDRESS) ||
  !PRIVATE_KEY
) {
  throw new Error(
    "Thieu PRIVATE_KEY / CONTRACT_ADDRESS hop le trong .env"
  );
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

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
// 2. TAO FILE KET QUA
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
// 3. CHUONG TRINH CHINH
// ===================================

async function main() {
  save();

  try {
    const net = await provider.getNetwork();

    assert.equal(
      net.chainId,
      11155111n,
      "RPC khong phai Sepolia"
    );

    assert.notEqual(
      await provider.getCode(ADDRESS),
      "0x",
      "Khong co contract"
    );

    const lab = await contract.qualityLab();

    assert.equal(
      lab.toLowerCase(),
      wallet.address.toLowerCase(),
      "Vi hien tai khong phai qualityLab"
    );

    // Kiem tra Batch 2 truoc cap nhat
    const before = await contract.getBatch(BATCH_ID);

    report.before = fields(before);
    save();

    assert.equal(before.id, BATCH_ID);

    assert.equal(
      before.status,
      0n,
      "Batch 2 khong con Created (0). KHONG chay lai!"
    );

    console.log("===== BAT DAU TC-08 =====");
    console.log("Contract:", ADDRESS);
    console.log("Batch ID:", BATCH_ID.toString());
    console.log("Trang thai ban dau: Created (0)");
    console.log("San pham:", before.name);

    // ===================================
    // 4. GUI GIAO DICH 0 -> 1
    // ===================================

    const startUtc = new Date().toISOString();
    const t0 = performance.now();

    const tx = await contract.updateStatus(
      BATCH_ID,
      1,
      NOTE
    );

    const t1 = performance.now();

    report.transaction = {
      transactionHash: tx.hash,
      status: "SENT",
      startUtc,
      hashReceivedUtc: new Date().toISOString()
    };

    save();

    console.log("Tx hash:", tx.hash);
    console.log("Dang cho xac nhan...");

    const receipt = await tx.wait(1);
    const t2 = performance.now();

    assert.ok(
      receipt,
      "Khong nhan duoc receipt"
    );

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

    assert.equal(
      receipt.status,
      1,
      "Giao dich that bai"
    );

    // ===================================
    // 5. KIEM TRA EVENT
    // ===================================

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
      "Khong tim thay StatusUpdated"
    );

    assert.equal(event.args[0], BATCH_ID);
    assert.equal(event.args[1], 1n);
    assert.equal(event.args[2], NOTE);

    // ===================================
    // 6. DOC LAI DU LIEU
    // ===================================

    const readStart = performance.now();

    const after = await contract.getBatch(BATCH_ID);

    report.transaction.getBatchSeconds =
      (performance.now() - readStart) / 1000;

    report.after = fields(after);

    assert.equal(after.status, 1n);

    // Cac truong khac khong duoc thay doi
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
        `${key} da bi thay doi`
      );
    }

    // ===================================
    // 7. LUU RECEIPT
    // ===================================

    const rawReceipt = await provider.send(
      "eth_getTransactionReceipt",
      [tx.hash]
    );

    fs.writeFileSync(
      `results/TC08-receipt-${runId}.json`,
      JSON.stringify(rawReceipt, null, 2),
      "utf8"
    );

    // CHUA danh dau PASS toan bo TC08,
    // vi phai kiem tra giao dien thuc te.
    report.status = "ONCHAIN_PASS_UI_PENDING";
    save();

    console.log(
      "Giao dich / event / du lieu on-chain: PASS"
    );

    console.log(
      "Gas used:",
      report.transaction.gasUsed
    );

    console.log(
      "Thoi gian:",
      report.transaction.totalSeconds.toFixed(3),
      "giay"
    );

    console.log(
      "Trang thai moi: Checked (1)"
    );

    console.log(
      "Hay F5 trang ?id=2 va chup anh giao dien."
    );

    console.log(
      "TC-08 chi PASS hoan toan sau khi doi chieu UI."
    );

    console.log("Da luu:", resultPath);

  } catch (error) {
    report.status = "FAIL_OR_INCOMPLETE";
    report.error = error.message;
    save();

    console.error(
      "TC-08 gap loi:",
      error.message
    );

    console.error(
      "Neu da co tx hash, KHONG chay lai truoc khi kiem tra receipt."
    );

    process.exitCode = 1;
  }
}

main();
