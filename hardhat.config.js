import "dotenv/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import { defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatEthers],

  solidity: "0.8.20",

  networks: {
    sepolia: {
      type: "http",
      chainType: "l1",
      url:
        process.env.SEPOLIA_RPC_URL ||
        "https://ethereum-sepolia-rpc.publicnode.com",

      accounts: process.env.PRIVATE_KEY
        ? [process.env.PRIVATE_KEY]
        : [],
    },
  },
});
