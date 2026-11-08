
import { ethers } from "ethers";
import "dotenv/config";
import fs from "node:fs";
import assert from "node:assert/strict";

const RPC_URL =
  process.env.SEPOLIA_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!CONTRACT_ADDRESS || !PRIVATE_KEY) {
  throw new Error(
    "Thiếu CONTRACT_ADDRESS hoặc PRIVATE_KEY trong .env"
  );
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

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

// Dữ liệu minh họa, không phải lô sản xuất thực tế
const sample = {
  name: "Sữa Tươi Vinamilk 1L",
  productionDate: "2025-12-03",
  factory: "Nhà máy Bình Dương",
  ipfsHash:
    "bafkreid4k6d2exntnyvp64enbqnycibjdqbmrduh7kx52odvqshqv7bnki"
};

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

function saveReport() {
  fs.mkdirSync("results", { recursive: true });
  fs.writeFileSync(
    resultFile,
    JSON.stringify(report, null, 2),
    "utf8"
  );
}

async function main() {
  saveReport();

  try {
    console.log("===== BAT DAU TC-02 =====");

    const network = await provider.getNetwork();

    assert.equal(
      network.chainId,
      11155111n,
      "Không phải mạng Sepolia"
    );

    const owner = await contract.owner();

    assert.equal(
      owner.toLowerCase(),
      wallet.address.toLowerCase(),
      "Ví đang dùng không phải owner"
    );

    const initialCount = await contract.batchCount();

    report.initialBatchCount = initialCount.toString();

    console.log("Contract:", CONTRACT_ADDRESS);
    console.log("Owner:", wallet.address);
    console.log("BatchCount ban đầu:", initialCount.toString());

    for (let i = 1; i <= 3; i++) {
      console.log(`\n===== TAO LO THU ${i} =====`);

      const countBefore = await contract.batchCount();

      const startUtc = new Date().toISOString();
      const t0 = performance.now();

      const tx = await contract.createBatch(
        sample.name,
        sample.productionDate,
        sample.factory,
        sample.ipfsHash
      );

      const hashReceivedUtc = new Date().toISOString();
      const t1 = performance.now();

      console.log("Tx hash:", tx.hash);
      console.log("Đang chờ xác nhận...");

      const receipt = await tx.wait(1);

      const receiptReceivedUtc = new Date().toISOString();
      const t2 = performance.now();

      assert.ok(receipt, "Không nhận được receipt");
      assert.equal(receipt.status, 1, "Giao dịch thất bại");

      // Lấy ID từ sự kiện, không lấy từ batchCount
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

      assert.ok(event, "Không tìm thấy sự kiện BatchCreated");

      const batchId = event.args[0];

      const countAfter = await contract.batchCount();
      const batch = await contract.getBatch(batchId);

      // Kiểm tra bộ đếm
      assert.equal(
        countAfter,
        countBefore + 1n,
        "batchCount không tăng đúng 1"
      );

      assert.equal(
        batchId,
        countAfter,
        "ID từ sự kiện không khớp batchCount"
      );

      // Kiểm tra dữ liệu lưu trên blockchain
      assert.equal(batch.id, batchId);
      assert.equal(batch.name, sample.name);
      assert.equal(
        batch.productionDate,
        sample.productionDate
      );
      assert.equal(batch.factory, sample.factory);
      assert.equal(batch.ipfsHash, sample.ipfsHash);
      assert.equal(batch.status, 0n);

      // Kiểm tra dữ liệu trong sự kiện
      assert.equal(event.args[1], sample.name);
      assert.equal(event.args[2], sample.factory);

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

      // Lưu receipt gốc cho từng giao dịch
      const rawReceipt = await provider.send(
        "eth_getTransactionReceipt",
        [tx.hash]
      );

      fs.writeFileSync(
        `results/TC02-receipt-${runId}-${i}.json`,
        JSON.stringify(rawReceipt, null, 2),
        "utf8"
      );

      console.log("Kết quả: PASS");
      console.log("Batch ID:", batchId.toString());
      console.log("Gas used:", gasUsed.toString());
      console.log(
        "Thời gian tổng:",
        row.totalSeconds.toFixed(3),
        "giây"
      );
    }

    const finalCount = await contract.batchCount();

    assert.equal(
      finalCount,
      initialCount + 3n,
      "Tổng số lô không tăng đúng 3"
    );

    report.finalBatchCount = finalCount.toString();
    report.status = "PASS";
    saveReport();

    console.log("\n===== TC-02 PASS =====");
    console.log("Đã tạo 3 lô thành công.");
    console.log("Đã lưu:", resultFile);

  } catch (error) {
    report.status = "FAIL_OR_INCOMPLETE";
    report.error = error.message;
    saveReport();

    console.error("TC-02 chưa đạt:", error.message);
    process.exitCode = 1;
  }
}

main();
