
import { ethers } from "ethers";
import "dotenv/config";
import fs from "node:fs";
import assert from "node:assert/strict";

// ==========================================
// TC-06: KIEM THU NHAY TRANG THAI 0 -> 3
// ==========================================

// 1. CAU HINH KET NOI
const RPC_URL =
  process.env.SEPOLIA_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";

const ADDRESS = process.env.CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!ADDRESS || !ethers.isAddress(ADDRESS) || !PRIVATE_KEY) {
  throw new Error(
    "Thieu PRIVATE_KEY hoac CONTRACT_ADDRESS hop le trong .env"
  );
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// 2. ABI CUA HOP DONG
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

// 3. DU LIEU MINH HOA CHO LO MOI
const input = {
  name: "Sua kiem thu nhay trang thai TC-06",
  productionDate: "2026-10-31",
  factory: "Nha may mo phong TC-06",
  ipfsHash: "CID_TC06_DEMO_NOT_VERIFIED"
};

// Ghi chu 7 byte, cung do dai voi TC-03
const note = "JUMP_03";

// 4. TAO FILE LUU KET QUA
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
  purpose: "Kiem tra nhay trang thai 0 -> 3",
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

// 5. TIM EVENT TRONG RECEIPT
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

// 6. LUU RECEIPT GOC
async function saveReceipt(txHash, step) {
  const raw = await provider.send(
    "eth_getTransactionReceipt",
    [txHash]
  );

  assert.ok(
    raw,
    `Khong lay duoc receipt goc buoc ${step}`
  );

  fs.writeFileSync(
    `results/TC06-receipt-${runId}-${step}.json`,
    JSON.stringify(raw, null, 2),
    "utf8"
  );
}

// 7. CHUONG TRINH CHINH
async function main() {
  save();

  try {
    // Kiem tra mang
    const network = await provider.getNetwork();

    assert.equal(
      network.chainId,
      11155111n,
      "RPC khong phai Sepolia"
    );

    assert.notEqual(
      await provider.getCode(ADDRESS),
      "0x",
      "Dia chi khong co contract"
    );

    // Kiem tra owner va qualityLab
    const [owner, qualityLab, countBefore] =
      await Promise.all([
        contract.owner(),
        contract.qualityLab(),
        contract.batchCount()
      ]);

    assert.equal(
      owner.toLowerCase(),
      wallet.address.toLowerCase(),
      "Vi khong phai owner"
    );

    assert.equal(
      qualityLab.toLowerCase(),
      wallet.address.toLowerCase(),
      "Vi khong phai qualityLab"
    );

    report.batchCountBefore = countBefore.toString();
    save();

    console.log("===== BAT DAU TC-06 =====");
    console.log("Contract:", ADDRESS);
    console.log("Vi kiem thu:", wallet.address);
    console.log(
      "BatchCount ban dau:",
      countBefore.toString()
    );

    // ======================================
    // BUOC 1: TAO LO MOI
    // ======================================

    console.log("\n===== BUOC 1: TAO LO MOI =====");

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

    console.log("Tx hash tao lo:", txCreate.hash);
    console.log("Dang cho xac nhan...");

    const createReceipt = await txCreate.wait(1);
    const t2 = performance.now();

    assert.ok(
      createReceipt,
      "Khong nhan duoc receipt tao lo"
    );

    await saveReceipt(txCreate.hash, "create");

    assert.equal(
      createReceipt.status,
      1,
      "Giao dich tao lo that bai"
    );

    // Lay ID tu event BatchCreated
    const createdEvent = findEvent(
      createReceipt,
      "BatchCreated"
    );

    assert.ok(
      createdEvent,
      "Khong tim thay BatchCreated"
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

    // Doc lai lo vua tao
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
      "Lo moi khong o trang thai Created (0)"
    );

    // Ghi ket qua tao lo
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

    console.log("Tao lo: PASS");
    console.log("Batch ID:", batchId.toString());
    console.log("Trang thai ban dau: Created (0)");
    console.log("Gas used:", createRecord.gasUsed);

    console.log(
      "Thoi gian:",
      createRecord.totalSeconds.toFixed(3),
      "giay"
    );

    // ======================================
    // BUOC 2: NHAY TRANG THAI 0 -> 3
    // ======================================

    console.log(
      "\n===== BUOC 2: NHAY TRANG THAI 0 -> 3 ====="
    );

    assert.equal(
      ethers.toUtf8Bytes(note).length,
      7
    );

    const startUpdateUtc = new Date().toISOString();
    const u0 = performance.now();

    // Bo qua Checked va Approved
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

    console.log("Tx hash cap nhat:", txUpdate.hash);
    console.log("Dang cho xac nhan...");

    const updateReceipt = await txUpdate.wait(1);
    const u2 = performance.now();

    assert.ok(
      updateReceipt,
      "Khong nhan duoc receipt cap nhat"
    );

    await saveReceipt(txUpdate.hash, "jump");

    assert.equal(
      updateReceipt.status,
      1,
      "Giao dich cap nhat that bai"
    );

    // Kiem tra event StatusUpdated
    const updatedEvent = findEvent(
      updateReceipt,
      "StatusUpdated"
    );

    assert.ok(
      updatedEvent,
      "Khong tim thay StatusUpdated"
    );

    assert.equal(updatedEvent.args[0], batchId);
    assert.equal(updatedEvent.args[1], 3n);
    assert.equal(updatedEvent.args[2], note);

    // ======================================
    // BUOC 3: DOC LAI TRANG THAI
    // ======================================

    const readStart = performance.now();

    const afterJump = await contract.getBatch(batchId);

    const getBatchSeconds =
      (performance.now() - readStart) / 1000;

    // Phai nhay truc tiep thanh Distributed (3)
    assert.equal(
      afterJump.status,
      3n,
      "Khong nhay duoc sang Distributed"
    );

    // Thong tin lo khong thay doi
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
    // BUOC 4: LUU SO LIEU
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
      "Hop dong cho phep nhay truc tiep tu Created(0) sang Distributed(3)";

    save();

    console.log("Nhay trang thai: PASS");
    console.log("Batch ID:", batchId.toString());
    console.log("Gas used:", updateRecord.gasUsed);

    console.log(
      "Thoi gian:",
      updateRecord.totalSeconds.toFixed(3),
      "giay"
    );

    console.log(
      "Thoi gian getBatch:",
      getBatchSeconds.toFixed(3),
      "giay"
    );

    console.log("Trang thai cuoi: Distributed (3)");

    console.log("\n===== TC-06 PASS =====");
    console.log("Da luu:", resultPath);

  } catch (error) {
    report.status = "FAIL_OR_INCOMPLETE";
    report.error = error.message;

    save();

    console.error(
      "TC-06 CHUA HOAN TAT:",
      error.message
    );

    console.error(
      "Neu da co tx hash, KHONG chay lai truoc khi kiem tra receipt!"
    );

    process.exitCode = 1;
  }
}

main();
