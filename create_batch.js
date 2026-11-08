import { ethers } from "ethers";
import * as dotenv from "dotenv";

// Nạp Private Key từ file .env
dotenv.config();

async function main() {
    const contractAddress = "0x6477737c1e22B207C9eCB0F495ea0336D0D55Cc4";
    
    // 1. Kết nối trực tiếp tới mạng Sepolia và Ví của bạn
    const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    // 2. Khai báo danh sách các hàm (ABI) cần gọi từ Smart Contract
    const abi = [
        "function createBatch(string _name, string _productionDate, string _factory, string _ipfsHash) public",
        "function updateStatus(uint256 _id, uint8 _newStatus, string _note) public",
        "function batchCount() public view returns (uint256)",
        "function getBatch(uint256 _id) public view returns (tuple(uint256 id, string name, string productionDate, string factory, string ipfsHash, uint8 status))"
    ];

    // 3. Kết nối vào Hợp đồng thông minh
    const contract = new ethers.Contract(contractAddress, abi, wallet);

    // --- BẮT ĐẦU CHẠY LOGIC NHƯ BÁO CÁO ---
    console.log("------------------------------------------------");
    console.log("🏭 Đang tạo lô hàng mới...");
    const txCreate = await contract.createBatch(
        "Sữa Tươi Vinamilk 1L", 
        "2025-12-03", 
        "Nhà máy Bình Dương", 
        "bafkreid4k6d2exntnyvp64enbqnycibjdqbmrduh7kx52odvqshqv7bnki"
    );
    await txCreate.wait();
    console.log("✅ Tạo lô hàng thành công!");

    // Lấy ID lô vừa tạo
    const currentId = await contract.batchCount();

    // Cập nhật trạng thái
    console.log(`🧪 Đang tự kiểm định lô hàng #${currentId}...`);
    const txUpdate = await contract.updateStatus(
        currentId, 
        1, 
        "Đạt chuẩn chất lượng (Duyệt tự động)"
    );
    await txUpdate.wait();
    console.log("✅ Đã cập nhật trạng thái: Đã kiểm định");

    // Kiểm tra lại kết quả
    const batchData = await contract.getBatch(currentId);
    console.log("------------------------------------------------");
    console.log(`📋 KẾT QUẢ CUỐI CÙNG TRÊN BLOCKCHAIN:`);
    console.log(`- Tên: ${batchData.name}`);
    console.log(`- Trạng thái (0:Mới, 1:Đã kiểm, 2:Duyệt): ${batchData.status}`);
    console.log("------------------------------------------------");
}

main().catch((error) => {
    console.error("❌ Có lỗi xảy ra:", error);
    process.exitCode = 1;
});