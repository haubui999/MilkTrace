// trace.js - PHIÊN BẢN KẾT NỐI TRỰC TIẾP (KHÔNG CẦN VÍ)

// 1. CẤU HÌNH
const CONTRACT_ADDRESS = "0x6477737c1e22B207C9eCB0F495ea0336D0D55Cc4";

// 2. ABI RÚT GỌN
const BATCH_ABI = [
    "function getBatch(uint256 _id) view returns (tuple(uint256 id, string name, string productionDate, string factory, string ipfsHash, uint8 status))",
    "function batchCount() view returns (uint256)"
];

// 3. HÀM CHUYỂN TRẠNG THÁI
function getStatusText(statusCode) {
    const status = ["📦 Mới khởi tạo", "🧪 Đã kiểm định", "✅ Đã phê duyệt", "🚚 Đã phân phối"];
    return status[statusCode] || "Không xác định";
}

// 4. CHỨC NĂNG CHÍNH
async function loadBatchInfo() {
    const infoDiv = document.getElementById('batch-info');
    infoDiv.innerHTML = "<p>⏳ Đang tải dữ liệu từ Blockchain...</p>";

    try {
        // --- SỬA LỖI TẠI ĐÂY: KHÔNG DÙNG IF/ELSE NỮA ---
        // Ép buộc sử dụng RPC Công cộng (Luôn luôn hoạt động)
        const provider = new ethers.JsonRpcProvider(
  "https://ethereum-sepolia-rpc.publicnode.com"
);
        
        console.log("Đã kết nối Provider:", provider); // Kiểm tra xem có bị undefined không

        const contract = new ethers.Contract(CONTRACT_ADDRESS, BATCH_ABI, provider);

        // --- BƯỚC 1: LẤY ID TỪ URL ---
        const urlParams = new URLSearchParams(window.location.search);
        let batchId = urlParams.get('id'); 

        // Nếu không có ID, lấy lô mới nhất
        if (!batchId) {
            console.log("Không có ID, đang tìm lô mới nhất...");
            const count = await contract.batchCount();
            batchId = count.toString();
        }

        console.log(`Đang tải lô hàng #${batchId}...`);

        // --- BƯỚC 2: GỌI SMART CONTRACT ---
        const batch = await contract.getBatch(batchId);

        // --- BƯỚC 3: HIỂN THỊ ---
        const displayHtml = `
            <div style="font-family: Arial, sans-serif; text-align: left; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); display: inline-block; max-width: 400px;">
                <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
                    🥛 Lô hàng #${batch.id}
                </h2>
                <p><strong>🔹 Sản phẩm:</strong> <span style="color:#2980b9; font-weight:bold">${batch.name}</span></p>
                <p><strong>📅 Ngày SX:</strong> ${batch.productionDate}</p>
                <p><strong>🏭 Nhà máy:</strong> ${batch.factory}</p>
                <p><strong>📊 Trạng thái:</strong> <span style="color:green; font-weight:bold">${getStatusText(batch.status)}</span></p>
                
                <hr style="margin: 20px 0; border: 0; border-top: 1px solid #eee;">
                
                <div style="text-align: center;">
                    <p style="margin-bottom: 10px; font-weight: bold;">Quét mã QR:</p>
                    <div id="qrcode-container" style="display:flex; justify-content:center;"></div>
                </div>
            </div>
        `;
        
        infoDiv.innerHTML = displayHtml;

        // --- BƯỚC 4: TẠO MÃ QR ---
        const currentUrl = window.location.href.split('?')[0] + '?id=' + batch.id;
        if (typeof QRCode !== 'undefined') {
            new QRCode(document.getElementById("qrcode-container"), {
                text: currentUrl,
                width: 150,
                height: 150
            });
        }

    } catch (error) {
        console.error("Lỗi chi tiết:", error);
        infoDiv.innerHTML = `
            <div style="color: red; background: #ffe6e6; padding: 20px; border-radius: 8px;">
                <h3>❌ Lỗi tải dữ liệu!</h3>
                <p>${error.message}</p>
                <p><small>Hãy thử F5 lại trang web.</small></p>
            </div>
        `;
    }
}

window.onload = loadBatchInfo;