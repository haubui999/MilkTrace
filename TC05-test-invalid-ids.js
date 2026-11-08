
import { ethers } from "ethers";
import "dotenv/config";
import fs from "node:fs";
import assert from "node:assert/strict";

// ========================================
// 1. CAU HINH
// ========================================

const RPC_URL =
  process.env.SEPOLIA_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";

const ADDRESS = process.env.CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY || !ADDRESS || !ethers.isAddress(ADDRESS)) {
  throw new Error(
    "Kiem tra PRIVATE_KEY va CONTRACT_ADDRESS trong .env"
  );
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const abi = [
  "function qualityLab() view returns (address)",
  "function batchCount() view returns (uint256)",
  "function updateStatus(uint256,uint8,string)",
  "function getBatch(uint256) view returns (tuple(uint256 id,string name,string productionDate,string factory,string ipfsHash,uint8 status))"
];

const contract = new ethers.Contract(
  ADDRESS,
  abi,
  wallet
);

// ========================================
// 2. TAO FILE LUU KET QUA
// ========================================

const runId = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");

const output = `results/TC05-${runId}.json`;

const report = {
  testCase: "TC-05",
  status: "IN_PROGRESS",
  timestampUtc: new Date().toISOString(),
  network: "Ethereum Sepolia",
  contractAddress: ADDRESS,
  walletAddress: wallet.address,
  method: "eth_call (khong gui giao dich)",
  cases: []
};

function save() {
  fs.mkdirSync("results", {
    recursive: true
  });

  fs.writeFileSync(
    output,
    JSON.stringify(report, null, 2),
    "utf8"
  );
}

// ========================================
// 3. KIEM TRA DU LIEU TRUOC VA SAU
// ========================================

async function snapshot() {
  const [count, lab, batch1, batch2] =
    await Promise.all([
      contract.batchCount(),
      contract.qualityLab(),
      contract.getBatch(1n),
      contract.getBatch(2n)
    ]);

  return {
    batchCount: count.toString(),
    qualityLab: lab,
    batch1Status: batch1.status.toString(),
    batch2Status: batch2.status.toString()
  };
}

// ========================================
// 4. HAM KIEM TRA REVERT
// ========================================

async function expectRevert(
  name,
  expectedReason,
  operation
) {
  const started = performance.now();

  let caught = null;

  try {
    await operation();
  } catch (error) {
    caught = error;
  }

  // Neu ID sai nhung ham van thanh cong => FAIL
  assert.ok(
    caught,
    `${name}: Lenh da thanh cong du ID sai`
  );

  // Chi chap nhan EVM revert, khong chap
  // nhan loi mat ket noi RPC la PASS
  assert.ok(
    ethers.isError(caught, "CALL_EXCEPTION"),
    `${name}: Loi khong phai EVM revert (ma: ${caught.code ?? "unknown"})`
  );

  const actualReason =
    caught.reason ??
    caught.revert?.args?.[0] ??
    null;

  // Phai dung chinh xac ly do revert
  assert.equal(
    actualReason,
    expectedReason,
    `${name}: Sai ly do revert`
  );

  const row = {
    name,
    status: "PASS",
    expectedReason,
    actualReason,
    observedCallSeconds:
      (performance.now() - started) / 1000,
    transactionHash: null,
    onchainGasUsed: null
  };

  report.cases.push(row);
  save();

  console.log(`${name}: PASS`);
  console.log(`  Revert: ${actualReason}`);
}

// ========================================
// 5. CHAY TC-05
// ========================================

async function main() {
  save();

  try {
    // Kiem tra mang Sepolia
    const net = await provider.getNetwork();

    assert.equal(
      net.chainId,
      11155111n,
      "Khong phai Sepolia"
    );

    // Ghi nhan trang thai ban dau
    const before = await snapshot();

    assert.ok(
      BigInt(before.batchCount) >= 3n,
      "Chua du 3 lo tu TC-02"
    );

    // Dam bao khong nham loi ID voi loi phan quyen
    assert.equal(
      before.qualityLab.toLowerCase(),
      wallet.address.toLowerCase(),
      "Vi khong co quyen qualityLab"
    );

    // Lay ID sai dua tren batchCount thuc te
    const invalidHighId =
      BigInt(before.batchCount) + 1n;

    report.before = before;

    report.invalidHighId =
      invalidHighId.toString();

    save();

    console.log("===== BAT DAU TC-05 =====");
    console.log("Contract:", ADDRESS);
    console.log("BatchCount:", before.batchCount);
    console.log(
      "ID vuot pham vi:",
      invalidHighId.toString()
    );

    console.log(
      "Chi su dung eth_call, khong gui giao dich."
    );

    // ----------------------------------------
    // TH1: updateStatus voi ID = 0
    // ----------------------------------------

    await expectRevert(
      "updateStatus(ID=0)",
      "Invalid batch ID",
      () =>
        contract.updateStatus.staticCall(
          0n,
          1,
          "INVALID"
        )
    );

    // ----------------------------------------
    // TH2: updateStatus voi ID > batchCount
    // ----------------------------------------

    await expectRevert(
      `updateStatus(ID=${invalidHighId})`,
      "Invalid batch ID",
      () =>
        contract.updateStatus.staticCall(
          invalidHighId,
          1,
          "INVALID"
        )
    );

    // ----------------------------------------
    // TH3: getBatch voi ID = 0
    // ----------------------------------------

    await expectRevert(
      "getBatch(ID=0)",
      "Invalid ID",
      () => contract.getBatch(0n)
    );

    // ----------------------------------------
    // TH4: getBatch voi ID > batchCount
    // ----------------------------------------

    await expectRevert(
      `getBatch(ID=${invalidHighId})`,
      "Invalid ID",
      () => contract.getBatch(invalidHighId)
    );

    // ----------------------------------------
    // Kiem tra trang thai khong thay doi
    // ----------------------------------------

    const after = await snapshot();

    assert.deepEqual(
      after,
      before,
      "Du lieu thay doi sau TC-05"
    );

    report.after = after;
    report.status = "PASS";

    save();

    console.log(
      "Trang thai truoc/sau khong doi: PASS"
    );

    console.log("===== TC-05 PASS =====");
    console.log("Da luu:", output);

  } catch (error) {
    report.status = "FAIL_OR_INCOMPLETE";
    report.error = error.message;

    save();

    console.error(
      "TC-05 CHUA DAT:",
      error.message
    );

    process.exitCode = 1;
  }
}

main();
