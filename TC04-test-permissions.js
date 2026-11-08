
import { ethers } from "ethers";
import "dotenv/config";
import fs from "node:fs";
import assert from "node:assert/strict";

// =====================================
// 1. CAU HINH
// =====================================

const RPC_URL =
  process.env.SEPOLIA_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";

const ADDRESS = process.env.CONTRACT_ADDRESS;

if (!ADDRESS || !ethers.isAddress(ADDRESS)) {
  throw new Error(
    "CONTRACT_ADDRESS khong hop le trong .env"
  );
}

const provider = new ethers.JsonRpcProvider(RPC_URL);

// Vi ngau nhien: khong co quyen va khong can ETH
const stranger =
  ethers.Wallet.createRandom().connect(provider);

const abi = [
  "function owner() view returns(address)",
  "function qualityLab() view returns(address)",
  "function batchCount() view returns(uint256)",
  "function getBatch(uint256) view returns(tuple(uint256 id,string name,string productionDate,string factory,string ipfsHash,uint8 status))",
  "function createBatch(string,string,string,string)",
  "function updateStatus(uint256,uint8,string)",
  "function setQualityLab(address)"
];

const contract = new ethers.Contract(
  ADDRESS,
  abi,
  stranger
);

// =====================================
// 2. FILE KET QUA
// =====================================

const runId = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");

const outfile = `results/TC04-${runId}.json`;

const report = {
  testCase: "TC-04",
  network: "Sepolia",
  contractAddress: ADDRESS,
  unauthorizedWallet: stranger.address,
  method: "eth_call/staticCall",
  status: "IN_PROGRESS",
  timestampUtc: new Date().toISOString(),
  cases: []
};

function save() {
  fs.mkdirSync("results", {
    recursive: true
  });

  fs.writeFileSync(
    outfile,
    JSON.stringify(report, null, 2),
    "utf8"
  );
}

// =====================================
// 3. CHUP TRANG THAI HOP DONG
// =====================================

async function snapshot() {
  const [owner, lab, count, batch2] =
    await Promise.all([
      contract.owner(),
      contract.qualityLab(),
      contract.batchCount(),
      contract.getBatch(2n)
    ]);

  return {
    owner,
    qualityLab: lab,
    batchCount: count.toString(),
    batch2Status: batch2.status.toString(),
    batch2Name: batch2.name
  };
}

// =====================================
// 4. KIEM TRA REVERT
// =====================================

async function testRevert(
  name,
  expected,
  call
) {
  const start = performance.now();

  let caught;

  try {
    await call();
  } catch (error) {
    caught = error;
  }

  // Neu ham khong bi tu choi => FAIL
  if (!caught) {
    throw new Error(
      `${name}: KHONG bi tu choi - test FAIL`
    );
  }

  // Chi chap nhan loi EVM revert,
  // khong chap nhan loi mat mang/RPC
  if (!ethers.isError(caught, "CALL_EXCEPTION")) {
    throw new Error(
      `${name}: Loi khong phai EVM revert, code=${caught.code || "unknown"}`
    );
  }

  const actual =
    caught.reason ??
    caught.revert?.args?.[0] ??
    null;

  // Phai dung chinh xac revert reason
  assert.equal(
    actual,
    expected,
    `${name}: Revert reason khong dung`
  );

  report.cases.push({
    function: name,
    expectedReason: expected,
    actualReason: actual,
    status: "PASS",
    durationSeconds:
      (performance.now() - start) / 1000,
    transactionHash: null,
    onchainGasUsed: null
  });

  save();

  console.log(`${name}: PASS`);
  console.log(`  Revert: ${actual}`);
}

// =====================================
// 5. CHAY TC-04
// =====================================

async function main() {
  save();

  try {
    const network = await provider.getNetwork();

    assert.equal(
      network.chainId,
      11155111n,
      "RPC khong phai Sepolia"
    );

    const before = await snapshot();

    // Vi la khong duoc trung owner/lab
    assert.notEqual(
      stranger.address.toLowerCase(),
      before.owner.toLowerCase()
    );

    assert.notEqual(
      stranger.address.toLowerCase(),
      before.qualityLab.toLowerCase()
    );

    assert.ok(
      BigInt(before.batchCount) >= 2n,
      "Can co batch 2 tu TC-02"
    );

    report.before = before;

    console.log("===== BAT DAU TC-04 =====");
    console.log("Contract:", ADDRESS);
    console.log(
      "Vi khong duoc cap quyen:",
      stranger.address
    );

    console.log(
      "Khong gui transaction, chi dung staticCall."
    );

    // ---------------------------------
    // TH1: Vi la tao lo
    // ---------------------------------

    await testRevert(
      "createBatch",
      "Not authorized: only owner",
      () =>
        contract.createBatch.staticCall(
          "SUA_GIA",
          "2026-10-31",
          "DEMO",
          "CID_DEMO"
        )
    );

    // ---------------------------------
    // TH2: Vi la cap nhat lo 2
    // ---------------------------------

    await testRevert(
      "updateStatus",
      "Not authorized: only quality lab",
      () =>
        contract.updateStatus.staticCall(
          2n,
          1,
          "UNAUTHORIZED"
        )
    );

    // ---------------------------------
    // TH3: Vi la gan qualityLab
    // ---------------------------------

    await testRevert(
      "setQualityLab",
      "Not authorized: only owner",
      () =>
        contract.setQualityLab.staticCall(
          stranger.address
        )
    );

    // ---------------------------------
    // Kiem tra du lieu khong thay doi
    // ---------------------------------

    const after = await snapshot();

    assert.deepEqual(
      after,
      before,
      "Trang thai hop dong da thay doi"
    );

    report.after = after;
    report.status = "PASS";

    save();

    console.log(
      "Trang thai truoc/sau khong doi: PASS"
    );

    console.log("===== TC-04 PASS =====");
    console.log("Ket qua:", outfile);

  } catch (error) {
    report.status = "FAIL_OR_INCOMPLETE";
    report.error = error.message;

    save();

    console.error(
      "TC-04 chua dat:",
      error.message
    );

    process.exitCode = 1;
  }
}

main();
