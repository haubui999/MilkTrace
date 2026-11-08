
import { ethers } from "ethers";
import "dotenv/config";
import fs from "node:fs";
import assert from "node:assert/strict";

// ========================================
// 1. CAU HINH KET NOI
// ========================================

const RPC_URL =
  process.env.SEPOLIA_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// Lo so 1 duoc tao trong TC-02
const BATCH_ID = 1n;

if (!PRIVATE_KEY || !CONTRACT_ADDRESS) {
  throw new Error(
    "Thieu PRIVATE_KEY hoac CONTRACT_ADDRESS trong .env"
  );
}

if (!ethers.isAddress(CONTRACT_ADDRESS)) {
  throw new Error("CONTRACT_ADDRESS khong hop le");
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// ABI phu hop voi VinamilkTrace.sol
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
// 2. CAC BUOC KIEM THU
// ========================================

// Ghi chu co cung do dai 7 byte
// de kiem soat kich thuoc du lieu dau vao

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
// 3. TAO FILE LUU KET QUA
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
// 4. CHAY TC-03
// ========================================

async function main() {
  save();

  try {
    // 4.1. Kiem tra mang Sepolia
    const net = await provider.getNetwork();

    assert.equal(
      net.chainId,
      11155111n,
      "RPC khong phai Sepolia"
    );

    // 4.2. Kiem tra quyen qualityLab
    const lab = await contract.qualityLab();

    assert.equal(
      lab.toLowerCase(),
      wallet.address.toLowerCase(),
      "Vi hien tai khong phai qualityLab"
    );

    // 4.3. Kiem tra lo da ton tai
    const count = await contract.batchCount();

    assert.ok(
      count >= BATCH_ID,
      "Lo can kiem thu chua ton tai"
    );

    // 4.4. Doc trang thai ban dau
    const original = await contract.getBatch(BATCH_ID);

    assert.equal(original.id, BATCH_ID);

    assert.equal(
      original.status,
      0n,
      "Lo 1 khong con o trang thai Created (0). KHONG chay lai!"
    );

    console.log("===== BAT DAU TC-03 =====");

    console.log("Contract:", CONTRACT_ADDRESS);
    console.log("QualityLab:", lab);
    console.log("Batch ID:", BATCH_ID.toString());
    console.log(
      "Trang thai ban dau:",
      original.status.toString()
    );

    // ========================================
    // 5. THUC HIEN 3 LAN CAP NHAT
    // ========================================

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // Kiem tra do dai ghi chu
      assert.equal(
        ethers.toUtf8Bytes(step.note).length,
        7
      );

      // Kiem tra trang thai truoc giao dich
      const before = await contract.getBatch(BATCH_ID);

      assert.equal(
        before.status,
        BigInt(step.from),
        `Trang thai truoc buoc ${i + 1} khong dung`
      );

      console.log(
        `\n===== BUOC ${i + 1}: ${step.from} -> ${step.to} (${step.label}) =====`
      );

      // 5.1. Ghi nhan thoi diem bat dau
      const startUtc = new Date().toISOString();
      const t0 = performance.now();

      // 5.2. Gui giao dich
      const tx = await contract.updateStatus(
        BATCH_ID,
        step.to,
        step.note
      );

      // 5.3. Ghi nhan thoi diem nhan tx hash
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

      // Luu tx hash ngay sau khi gui
      save();

      console.log("Tx hash:", tx.hash);
      console.log("Dang cho xac nhan...");

      // 5.4. Cho mot xac nhan blockchain
      const receipt = await tx.wait(1);

      const receiptReceivedUtc =
        new Date().toISOString();

      const t2 = performance.now();

      assert.ok(
        receipt,
        "Khong nhan duoc receipt"
      );

      // 5.5. Luu receipt goc
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
        "Giao dich that bai"
      );

      // ========================================
      // 6. KIEM TRA EVENT StatusUpdated
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
        "Khong tim thay event StatusUpdated"
      );

      assert.equal(
        event.args[0],
        BATCH_ID,
        "Batch ID trong event khong dung"
      );

      assert.equal(
        event.args[1],
        BigInt(step.to),
        "Trang thai trong event khong dung"
      );

      assert.equal(
        event.args[2],
        step.note,
        "Ghi chu trong event khong dung"
      );

      // ========================================
      // 7. DOC LAI DU LIEU TREN BLOCKCHAIN
      // ========================================

      const readStart = performance.now();

      const after = await contract.getBatch(BATCH_ID);

      const getBatchSeconds =
        (performance.now() - readStart) / 1000;

      // Kiem tra trang thai moi
      assert.equal(
        after.status,
        BigInt(step.to),
        "Trang thai sau giao dich khong dung"
      );

      // Cac thong tin khac phai giu nguyen
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
      // 8. GHI NHAN GAS VA DO TRE
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

      console.log("Ket qua: PASS");
      console.log("Batch ID:", BATCH_ID.toString());
      console.log("Gas used:", record.gasUsed);

      console.log(
        "Thoi gian tong:",
        record.totalSeconds.toFixed(3),
        "giay"
      );

      console.log(
        "Thoi gian getBatch:",
        record.getBatchSeconds.toFixed(3),
        "giay"
      );
    }

    // ========================================
    // 9. KIEM TRA KET QUA CUOI
    // ========================================

    const finalBatch =
      await contract.getBatch(BATCH_ID);

    assert.equal(
      finalBatch.status,
      3n,
      "Trang thai cuoi khong phai Distributed"
    );

    report.finalStatus =
      finalBatch.status.toString();

    report.status = "PASS";

    save();

    console.log("\n===== TC-03 PASS =====");

    console.log(
      "Trang thai cuoi cua lo 1: Distributed (3)"
    );

    console.log("Da luu:", resultPath);

  } catch (error) {
    report.status = "FAIL_OR_INCOMPLETE";
    report.error = error.message;

    save();

    console.error(
      "TC-03 chua hoan tat:",
      error.message
    );

    console.error(
      "Neu da co tx hash, KHONG chay lai truoc khi kiem tra blockchain."
    );

    process.exitCode = 1;
  }
}

main();
