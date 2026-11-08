
import { network } from "hardhat";
import fs from "node:fs";
import assert from "node:assert/strict";

// TC-01: Kiểm tra constructor ngay sau khi triển khai

async function main() {
  console.log("===== BAT DAU TC-01 =====");

  // Kết nối mạng được chọn trong lệnh Hardhat
  const { ethers } = await network.connect();

  // Kiểm tra đúng mạng Sepolia
  const networkInfo = await ethers.provider.getNetwork();

  assert.equal(
    networkInfo.chainId,
    11155111n,
    "Sai mạng! Phải chạy trên Ethereum Sepolia."
  );

  // Lấy ví triển khai
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  console.log("Ví triển khai:", deployerAddress);
  console.log("Chain ID:", networkInfo.chainId.toString());

  // Bắt đầu đo thời gian ở phía máy khách
  const startTime = performance.now();

  // Triển khai hợp đồng mới
  console.log("Đang triển khai VinamilkTrace...");

  const contract = await ethers.deployContract(
    "VinamilkTrace"
  );

  const deploymentTx = contract.deploymentTransaction();

  if (!deploymentTx) {
    throw new Error("Không lấy được giao dịch triển khai.");
  }

  console.log("Transaction hash:", deploymentTx.hash);

  // Chờ giao dịch có 1 xác nhận
  const receipt = await deploymentTx.wait(1);

  const latencySeconds =
    (performance.now() - startTime) / 1000;

  assert.ok(receipt, "Không lấy được receipt.");

  assert.equal(
    receipt.status,
    1,
    "Giao dịch triển khai không thành công."
  );

  const contractAddress = await contract.getAddress();

  // Đọc trạng thái ngay sau triển khai
  const owner = await contract.owner();
  const qualityLab = await contract.qualityLab();
  const batchCount = await contract.batchCount();

  // Các điều kiện kiểm thử
  assert.equal(
    owner.toLowerCase(),
    deployerAddress.toLowerCase(),
    "Owner không bằng ví triển khai."
  );

  assert.equal(
    qualityLab.toLowerCase(),
    deployerAddress.toLowerCase(),
    "QualityLab không bằng ví triển khai."
  );

  assert.equal(
    batchCount,
    0n,
    "Hợp đồng mới phải có batchCount = 0."
  );

  // Lấy biên nhận thô từ RPC
  const rawReceipt = await ethers.provider.send(
    "eth_getTransactionReceipt",
    [deploymentTx.hash]
  );

  // Lưu bằng chứng
  fs.mkdirSync("results", { recursive: true });

  const result = {
    testCase: "TC-01",
    status: "PASS",
    timestampUtc: new Date().toISOString(),
    network: "Ethereum Sepolia",
    chainId: Number(networkInfo.chainId),
    deployerAddress,
    contractAddress,
    transactionHash: deploymentTx.hash,
    blockNumber: receipt.blockNumber,
    transactionStatus: receipt.status,
    gasUsed: receipt.gasUsed.toString(),
    gasPriceWei: receipt.gasPrice?.toString() ?? null,
    transactionFeeWei:
      receipt.gasPrice != null
        ? (
            receipt.gasUsed * receipt.gasPrice
          ).toString()
        : null,
    latencySeconds,
    owner,
    qualityLab,
    batchCount: batchCount.toString(),
    checks: {
      ownerEqualsDeployer: true,
      qualityLabEqualsDeployer: true,
      initialBatchCountIsZero: true,
    },
  };

  fs.writeFileSync(
    "results/TC01-result.json",
    JSON.stringify(result, null, 2),
    "utf8"
  );

  fs.writeFileSync(
    "results/TC01-receipt.json",
    JSON.stringify(rawReceipt, null, 2),
    "utf8"
  );

  console.log("\n===== KET QUA TC-01 =====");
  console.log("Kết quả: PASS");
  console.log("Contract:", contractAddress);
  console.log("Owner:", owner);
  console.log("QualityLab:", qualityLab);
  console.log("BatchCount:", batchCount.toString());
  console.log("Block:", receipt.blockNumber);
  console.log("Gas used:", receipt.gasUsed.toString());
  console.log(
    "Thời gian quan sát:",
    latencySeconds.toFixed(3),
    "giây"
  );

  console.log("\nĐã lưu:");
  console.log("results/TC01-result.json");
  console.log("results/TC01-receipt.json");
}

main().catch((error) => {
  console.error("TC-01 FAILED:", error.message);
  process.exitCode = 1;
});
