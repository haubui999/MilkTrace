
import { network } from "hardhat";
import fs from "node:fs";
import assert from "node:assert/strict";

// TC-01: Verify constructor initialization after deployment

async function main() {
  console.log("===== STARTING TC-01 =====");

  // Connect to the network specified in the Hardhat command
  const { ethers } = await network.connect();

  // Verify that the selected network is Ethereum Sepolia
  const networkInfo = await ethers.provider.getNetwork();

  assert.equal(
    networkInfo.chainId,
    11155111n,
    "Incorrect network! Ethereum Sepolia is required."
  );

  // Retrieve the deployer account
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  console.log("Deployer address:", deployerAddress);
  console.log("Chain ID:", networkInfo.chainId.toString());

  // Start measuring client-observed deployment latency
  const startTime = performance.now();

  // Deploy a new MilkTrace smart contract
  console.log("Deploying MilkTrace...");

  const contract = await ethers.deployContract(
    "MilkTrace"
  );

  const deploymentTx = contract.deploymentTransaction();

  if (!deploymentTx) {
    throw new Error("Unable to retrieve the deployment transaction.");
  }

  console.log("Transaction hash:", deploymentTx.hash);

  // Wait for one transaction confirmation
  const receipt = await deploymentTx.wait(1);

  const latencySeconds =
    (performance.now() - startTime) / 1000;

  assert.ok(receipt, "Transaction receipt not found.");

  assert.equal(
    receipt.status,
    1,
    "Smart contract deployment failed."
  );

  const contractAddress = await contract.getAddress();

  // Read the contract state immediately after deployment
  const owner = await contract.owner();
  const qualityLab = await contract.qualityLab();
  const batchCount = await contract.batchCount();

  // Verify constructor initialization conditions
  assert.equal(
    owner.toLowerCase(),
    deployerAddress.toLowerCase(),
    "Contract owner does not match the deployer address."
  );

  assert.equal(
    qualityLab.toLowerCase(),
    deployerAddress.toLowerCase(),
    "Quality laboratory address does not match the deployer address."
  );

  assert.equal(
    batchCount,
    0n,
    "A newly deployed contract must have batchCount = 0."
  );

  // Retrieve the original transaction receipt from the RPC endpoint
  const rawReceipt = await ethers.provider.send(
    "eth_getTransactionReceipt",
    [deploymentTx.hash]
  );

  // Create the directory for experimental evidence
  fs.mkdirSync("results", { recursive: true });

  // Prepare the structured experimental result
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

  // Save the structured test result
  fs.writeFileSync(
    "results/TC01-result.json",
    JSON.stringify(result, null, 2),
    "utf8"
  );

  // Save the original blockchain transaction receipt
  fs.writeFileSync(
    "results/TC01-receipt.json",
    JSON.stringify(rawReceipt, null, 2),
    "utf8"
  );

  // Display the test results
  console.log("\n===== TC-01 TEST RESULTS =====");
  console.log("Test status: PASS");
  console.log("Contract address:", contractAddress);
  console.log("Owner:", owner);
  console.log("Quality laboratory:", qualityLab);
  console.log("Batch count:", batchCount.toString());
  console.log("Block number:", receipt.blockNumber);
  console.log("Gas used:", receipt.gasUsed.toString());

  console.log(
    "Client-observed deployment latency:",
    latencySeconds.toFixed(3),
    "seconds"
  );

  console.log("\nExperimental evidence saved:");
  console.log("results/TC01-result.json");
  console.log("results/TC01-receipt.json");
}

main().catch((error) => {
  console.error("TC-01 FAILED:", error.message);
  process.exitCode = 1;
});
